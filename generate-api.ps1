#requires -version 5.1
<#
  Regenerates the frontend's TypeScript API client from the backend's controllers.
  Run this after adding/changing backend endpoints or DTOs.
#>
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$manifestPath = Join-Path $PSScriptRoot '.config\dotnet-tools.json'
if (-not (Test-Path $manifestPath)) {
    throw "No .config/dotnet-tools.json found. Run this from the project root created by generate.cmd."
}
$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
$nswagVersion = $manifest.tools.'nswag.consolecore'.version
if (-not $nswagVersion) {
    throw "NSwag.ConsoleCore is not listed in .config/dotnet-tools.json. Run 'dotnet tool install NSwag.ConsoleCore' first."
}

$nugetPackages = if ($env:NUGET_PACKAGES) { $env:NUGET_PACKAGES } else { Join-Path $env:USERPROFILE '.nuget\packages' }

# dotnet tool run always shims to the TFM matching the current SDK, which is frequently
# newer than net8.0 and breaks aspNetCoreToOpenApi's in-process hosting of the backend
# assembly (it must match the backend's own TFM exactly). Invoke the net8.0-targeted
# binary from the NSwag.ConsoleCore package directly instead.
$nswagDll = Join-Path $nugetPackages "nswag.consolecore\$nswagVersion\tools\net8.0\any\dotnet-nswag.dll"
if (-not (Test-Path $nswagDll)) {
    Write-Host "Restoring local dotnet tools..." -ForegroundColor DarkGray
    dotnet tool restore
    if (-not (Test-Path $nswagDll)) {
        throw "Could not find $nswagDll. Confirm NSwag.ConsoleCore $nswagVersion still ships a net8.0 tool build, or adjust this script's TFM."
    }
}

$backendProject = (Get-Content (Join-Path $PSScriptRoot 'nswag.json') -Raw | ConvertFrom-Json).documentGenerator.aspNetCoreToOpenApi.project
$backendDir = Split-Path $backendProject -Parent

Write-Host "== dotnet build $backendDir ==" -ForegroundColor Cyan
dotnet build $backendDir -c Debug
if ($LASTEXITCODE -ne 0) { throw "Backend build failed." }

Write-Host "== nswag run nswag.json ==" -ForegroundColor Cyan
dotnet exec $nswagDll run nswag.json
if ($LASTEXITCODE -ne 0) { throw "NSwag client generation failed." }
