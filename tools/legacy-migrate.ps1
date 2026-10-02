<#
.SYNOPSIS
  D15: runs the whole v1 -> v2 legacy migration in order (docs/LEGACY-MIGRATION.md).

.DESCRIPTION
  1. sync legacy-git        HRM categories (org units, employees, profiles, salary, ...)
  2. sync legacy-emails     config/users.json -> employee_emails (+ the v1 privileged-holders list for the owner)
  3. sync legacy-datasets   teaching-stats, research-stats, paper-details
  4. tools/legacy-news      news posts + the request-update-info banner (convert, then post)

  Every step is idempotent: a second run reports unchanged / zero new rows. The backend must be running at -ApiBaseUrl
  (with a migrated database), and the token must belong to an API client with scopes hrm.ingest AND legacy.import
  (in Development: the 'dev' client seeded from Hrm:DevApiClient:Token).

  Console output is counts only. Detailed reports (MSCBs, emails) go to %LOCALAPPDATA%\HCMUSSupportV2\legacy.

.EXAMPLE
  $env:LEGACY_API_TOKEN = '<token>'
  powershell -File tools\legacy-migrate.ps1 -DataPath C:\data\SupportHCMUSData -ApiBaseUrl http://localhost:5161 -DryRun
#>
param(
    [Parameter(Mandatory = $true)] [string] $DataPath,
    # No default on purpose: name the target explicitly (never the live v1 server).
    [Parameter(Mandatory = $true)] [string] $ApiBaseUrl,
    [string] $Token = $env:LEGACY_API_TOKEN,
    # Validate everything on the server (?dryRun=true) without writing. legacy-git has no server dry run, so step 1 only parses.
    [switch] $DryRun,
    # Skip step 1 (the HRM categories already came from legacy-git or a live sync hrm).
    [switch] $SkipHrm
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot

if (-not (Test-Path (Join-Path $DataPath 'config\users.json'))) { throw "Not a v1 data repo: $DataPath" }
if ([string]::IsNullOrWhiteSpace($Token)) { throw 'Set -Token or $env:LEGACY_API_TOKEN (an API client with scopes hrm.ingest and legacy.import).' }
try { Invoke-WebRequest -UseBasicParsing -Uri ($ApiBaseUrl.TrimEnd('/') + '/healthz') -TimeoutSec 10 | Out-Null }
catch { throw "Backend not reachable at $ApiBaseUrl ($($_.Exception.Message))." }

$env:Sync__ApiBaseUrl = $ApiBaseUrl
$env:Sync__ApiToken = $Token
$env:LEGACY_API_TOKEN = $Token

function Invoke-Step([string] $name, [scriptblock] $body) {
    Write-Host "== $name" -ForegroundColor Cyan
    & $body
    if ($LASTEXITCODE -ne 0) { throw "$name failed (exit $LASTEXITCODE)." }
}

dotnet build (Join-Path $repo 'HCMUSSupportV2.Sync') -v q -nologo | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Building HCMUSSupportV2.Sync failed.' }
$sync = @('run', '--no-build', '--project', (Join-Path $repo 'HCMUSSupportV2.Sync'), '--', 'sync')
$dry = if ($DryRun) { @('--dry-run', '--server-dry-run') } else { @() }

if (-not $SkipHrm) {
    Invoke-Step '1. HRM categories (legacy-git)' { dotnet @sync legacy-git --path $DataPath @(if ($DryRun) { '--dry-run' }) }
}
Invoke-Step '2. Email mapping (legacy-emails)' { dotnet @sync legacy-emails --path $DataPath @dry }
Invoke-Step '3. Datasets (legacy-datasets)' { dotnet @sync legacy-datasets --path $DataPath @dry }

Push-Location (Join-Path $PSScriptRoot 'legacy-news')
try {
    if (-not (Test-Path 'node_modules')) { Invoke-Step '4a. npm ci (legacy-news)' { npm ci --silent } }
    Invoke-Step '4b. Convert news' { npm run --silent convert -- --path $DataPath }
    Invoke-Step '4c. Post news' { npm run --silent post -- --api $ApiBaseUrl @(if ($DryRun) { '--dry-run' }) }
}
finally { Pop-Location }

Write-Host ''
Write-Host 'Done. Roles are not migrated: review legacy-privileged-holders-*.json in %LOCALAPPDATA%\HCMUSSupportV2\legacy' -ForegroundColor Green
Write-Host 'and grant editor/admin by hand (Quan tri > Phan quyen), or seed the first admin with Admin:BootstrapEmails.' -ForegroundColor Green
