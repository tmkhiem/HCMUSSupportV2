<#
.SYNOPSIS
  Build HCMUS Support V2 for linux-x64 and deploy it to a server prepared with server-bootstrap.sh.

.DESCRIPTION
  1. dotnet tool restore (pins dotnet-ef)
  2. build the frontend (npm, via the Frontend project's MSBuild target) and dotnet publish the backend
     (framework-dependent, linux-x64); the Vite build lands in wwwroot of the publish output
  3. build an EF Core migrations bundle (self-contained, linux-x64)
  4. package, scp to ~/hcmus-staging/<stamp> on the server
  5. run scripts/activate.sh there with sudo: unpack to /opt/hcmus-support/releases/<stamp>, pre-deploy
     backup, run the migrations bundle with the connection string from /etc/hcmus-support/env,
     switch the /opt/hcmus-support/app symlink, restart, local health check
  6. poll https://<TargetHost>/healthz; if it never answers 200, switch the symlink back and restart

  There is NO default host. Use -WhatIf to print the whole plan without building, copying or running anything.
  Migrations are not reverted by a rollback: keep every migration compatible with the previous release.

.PARAMETER TargetHost
  DNS name of the server (mandatory). Used for ssh and for the public health check.

.PARAMETER SshUser
  Account with key-based ssh and passwordless sudo on the server (root also works).

.EXAMPLE
  .\deploy\deploy.ps1 -TargetHost staging.example.org -SshUser deploy -WhatIf
#>
[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$')]
    [string]$TargetHost,

    [ValidatePattern('^[a-z_][a-z0-9_-]*$')]
    [string]$SshUser = 'deploy',

    [ValidateRange(1, 65535)]
    [int]$SshPort = 22,

    # Optional private key for ssh/scp.
    [string]$IdentityFile,

    # Public URL polled after the restart. Default: https://<TargetHost>/healthz
    [string]$HealthUrl,

    [int]$HealthTimeoutSec = 120,

    # Skip the pre-deploy database backup on the server.
    [switch]$SkipBackup,

    # How many releases to keep on the server.
    [int]$KeepReleases = 5,

    # Configuration used for the EF bundle. Release works: the backend csproj keeps the EF Design assets in
    # the build output in every configuration and only strips them from the publish output.
    [string]$BundleConfiguration = 'Release',

    # Do not ask for confirmation (not needed with -WhatIf).
    [switch]$Yes
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$RepoRoot   = Split-Path -Parent $PSScriptRoot
$BackendDir = Join-Path $RepoRoot 'HCMUSSupportV2.Backend'
$FrontDir   = Join-Path $RepoRoot 'HCMUSSupportV2.Frontend'
$BackendProj = Join-Path $BackendDir 'HCMUSSupportV2.Backend.csproj'
$FrontProj   = Join-Path $FrontDir 'HCMUSSupportV2.Frontend.csproj'
$ActivateSh  = Join-Path $PSScriptRoot 'scripts\activate.sh'

$Stamp   = (Get-Date).ToUniversalTime().ToString('yyyyMMddHHmmss')
$Stage   = Join-Path ([IO.Path]::GetTempPath()) "hcmus-deploy-$Stamp"
$AppOut  = Join-Path $Stage 'app'
$Bundle  = Join-Path $Stage 'efbundle'
$Tgz     = Join-Path $Stage 'app.tgz'
$Remote  = "$SshUser@$TargetHost"
$RemoteStaging = "hcmus-staging/$Stamp"      # relative to the ssh user's home
if (-not $HealthUrl) { $HealthUrl = "https://$TargetHost/healthz" }

$SshOpts = @('-p', $SshPort, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new')
$ScpOpts = @('-P', $SshPort, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new')
if ($IdentityFile) { $SshOpts += @('-i', $IdentityFile); $ScpOpts += @('-i', $IdentityFile) }

function Invoke-Native {
    param([string]$File, [string[]]$Arguments)
    Write-Host ("  > {0} {1}" -f $File, ($Arguments -join ' ')) -ForegroundColor DarkGray
    & $File @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$File exited with code $LASTEXITCODE" }
}

function Invoke-Remote {
    param([string]$Command)
    $out = & ssh @SshOpts $Remote $Command
    if ($LASTEXITCODE -ne 0) { throw "remote command failed ($LASTEXITCODE): $Command" }
    return $out
}

Write-Host "HCMUS Support V2 deploy"
Write-Host "  target      : $Remote (port $SshPort)"
Write-Host "  release     : $Stamp"
Write-Host "  health url  : $HealthUrl"
Write-Host "  working dir : $Stage"

if (-not $WhatIfPreference) {
    foreach ($tool in 'dotnet', 'ssh', 'scp', 'tar') {
        if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "'$tool' was not found on PATH" }
    }
    foreach ($p in $BackendProj, $FrontProj, $ActivateSh) {
        if (-not (Test-Path $p)) { throw "missing $p" }
    }
    if (-not $Yes) {
        if (-not $PSCmdlet.ShouldContinue("Build and deploy release $Stamp to $TargetHost ?", 'Deploy')) { return }
    }
}

$previousRelease = ''
$activated = $false

try {
    # --- 1. tools -----------------------------------------------------------------------------
    if ($PSCmdlet.ShouldProcess($RepoRoot, 'dotnet tool restore (dotnet-ef pinned in .config/dotnet-tools.json)')) {
        Push-Location $RepoRoot
        try { Invoke-Native 'dotnet' @('tool', 'restore') } finally { Pop-Location }
        New-Item -ItemType Directory -Path $AppOut -Force | Out-Null
    }

    # --- 2. frontend + publish ------------------------------------------------------------------
    if ($PSCmdlet.ShouldProcess($FrontProj, 'build the frontend (npm install + npm run build into Backend/wwwroot)')) {
        Invoke-Native 'dotnet' @('build', $FrontProj, '-c', 'Release', '--nologo')
    }
    if ($PSCmdlet.ShouldProcess($BackendProj, "dotnet publish -c Release -r linux-x64 --self-contained false -o $AppOut")) {
        Invoke-Native 'dotnet' @('publish', $BackendProj, '-c', 'Release', '-r', 'linux-x64', '--self-contained', 'false', '-o', $AppOut, '--nologo')
        if (-not (Test-Path (Join-Path $AppOut 'HCMUSSupportV2.Backend.dll'))) { throw 'publish output has no HCMUSSupportV2.Backend.dll' }
        if (-not (Test-Path (Join-Path $AppOut 'wwwroot\index.html'))) {
            throw 'publish output has no wwwroot\index.html: the frontend build did not land in wwwroot. Run "npm run build" in HCMUSSupportV2.Frontend and retry.'
        }
    }

    # --- 3. EF migrations bundle ---------------------------------------------------------------
    if ($PSCmdlet.ShouldProcess($BackendProj, 'dotnet ef migrations bundle --self-contained -r linux-x64')) {
        Push-Location $RepoRoot
        # The design-time DbContext factory requires a connection string to build the model; no connection is made.
        $prevCs = $env:ConnectionStrings__Default
        if (-not $prevCs) { $env:ConnectionStrings__Default = 'Host=localhost;Database=bundle;Username=bundle;Password=bundle' }
        try {
            Invoke-Native 'dotnet' @('ef', 'migrations', 'bundle', '--project', $BackendProj, '--configuration', $BundleConfiguration,
                '--self-contained', '-r', 'linux-x64', '--force', '--output', $Bundle)
        } finally { $env:ConnectionStrings__Default = $prevCs; Pop-Location }
        if (-not (Test-Path $Bundle)) { throw 'migrations bundle was not produced' }
    }

    # --- 4. package + upload -----------------------------------------------------------------------
    if ($PSCmdlet.ShouldProcess($Tgz, 'package the publish output')) {
        Invoke-Native 'tar' @('-czf', $Tgz, '-C', $AppOut, '.')
    }
    if ($PSCmdlet.ShouldProcess($Remote, "upload app.tgz, efbundle, activate.sh to ~/$RemoteStaging")) {
        Invoke-Remote "mkdir -p $RemoteStaging" | Out-Null
        Invoke-Native 'scp' ($ScpOpts + @($Tgz, $Bundle, $ActivateSh, "${Remote}:$RemoteStaging/"))
    }

    # --- 5. activate (unpack, backup, migrate, switch, restart, local health) -------------------
    $activateArgs = "--stamp $Stamp --staging `"`$HOME/$RemoteStaging`" --keep $KeepReleases"
    if ($SkipBackup) { $activateArgs += ' --no-backup' }
    if ($PSCmdlet.ShouldProcess($Remote, "sudo bash activate.sh $activateArgs (backup, migrate, switch symlink, restart)")) {
        $out = Invoke-Remote "sudo bash `"`$HOME/$RemoteStaging/activate.sh`" $activateArgs"
        $out | ForEach-Object { Write-Host "  remote: $_" }
        foreach ($line in $out) { if ($line -match '^PREVIOUS_RELEASE=(.*)$') { $previousRelease = $Matches[1] } }
        $activated = $true
    }

    # --- 6. public health check, rollback on failure ------------------------------------------------
    if ($PSCmdlet.ShouldProcess($HealthUrl, "poll for HTTP 200 for up to $HealthTimeoutSec s")) {
        [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
        $deadline = (Get-Date).AddSeconds($HealthTimeoutSec)
        $healthy = $false
        while ((Get-Date) -lt $deadline) {
            try {
                $r = Invoke-WebRequest -Uri $HealthUrl -UseBasicParsing -TimeoutSec 10
                if ($r.StatusCode -eq 200) { $healthy = $true; break }
            } catch { }
            Start-Sleep -Seconds 3
        }
        if (-not $healthy) {
            Write-Warning "$HealthUrl did not return 200 within $HealthTimeoutSec s."
            if ($previousRelease) {
                Write-Warning "Rolling back to $previousRelease"
                $rb = Invoke-Remote "sudo bash `"`$HOME/$RemoteStaging/activate.sh`" --rollback `"$previousRelease`""
                $rb | ForEach-Object { Write-Host "  remote: $_" }
                throw "Deploy $Stamp failed the health check and was rolled back to $previousRelease (database migrations were NOT reverted)."
            }
            throw "Deploy $Stamp failed the health check and there is no previous release to roll back to. See: journalctl -u hcmus-support -n 100"
        }
        Write-Host "Healthy: $HealthUrl -> 200" -ForegroundColor Green
    }

    # --- 7. tidy up the staging dir on the server ---------------------------------------------------
    if ($activated -and $PSCmdlet.ShouldProcess($Remote, "remove ~/$RemoteStaging")) {
        Invoke-Remote "rm -rf $RemoteStaging" | Out-Null
    }
    if ($WhatIfPreference) { Write-Host "WhatIf: nothing was built, copied or run." -ForegroundColor Yellow }
    else { Write-Host "Release $Stamp deployed to $TargetHost." -ForegroundColor Green }
}
finally {
    if (-not $WhatIfPreference -and (Test-Path $Stage)) { Remove-Item -Recurse -Force $Stage -ErrorAction SilentlyContinue }
}
