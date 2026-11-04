# PandaOS - nieuwe versie uitbrengen (GitHub Release met de APK)
# De radio ziet de nieuwe versie daarna in Instellingen > Software > Software-update (of krijgt een melding bij het opstarten).
#
# Gebruik:
#   powershell -ExecutionPolicy Bypass -File tools\release.ps1 -Version 1.1.1 -Notes "Wat er nieuw is"
#
# Wat het doet:
#   1. version.json op de nieuwe versie zetten (versiecode = major*10000 + minor*100 + patch)
#   2. webapp bouwen (client/dist) en de launcher-APK bouwen (release, vaste ondertekening)
#   3. git commit + tag v<versie> + push
#   4. GitHub Release aanmaken met de APK (gh CLI, ingelogd met: gh auth login)
param(
    [Parameter(Mandatory = $true)][string]$Version,
    [string]$Notes = ""
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent

if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw "Versie moet de vorm 1.2.3 hebben" }
$parts = $Version.Split('.') | ForEach-Object { [int]$_ }
$code = $parts[0] * 10000 + $parts[1] * 100 + $parts[2]

Write-Host "PandaOS $Version (versiecode $code) uitbrengen..."
# Zonder BOM schrijven (Windows PowerShell 5.1 zet anders een onzichtbaar teken vooraan dat JSON.parse breekt)
[IO.File]::WriteAllText((Join-Path $root 'version.json'), "{ `"version`": `"$Version`", `"code`": $code }`n", (New-Object Text.UTF8Encoding $false))

# Webapp
Push-Location (Join-Path $root 'client')
npx vite build
if ($LASTEXITCODE -ne 0) { throw "Webapp bouwen mislukt" }
Pop-Location

# Launcher-APK (release)
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
Push-Location (Join-Path $root 'android')
.\gradlew.bat assembleRelease
if ($LASTEXITCODE -ne 0) { throw "APK bouwen mislukt" }
Pop-Location

$releaseDir = Join-Path $PSScriptRoot 'release'
New-Item -ItemType Directory -Force $releaseDir | Out-Null
$apk = Join-Path $releaseDir "PandaOS-$Version.apk"
Copy-Item (Join-Path $root 'android\app\build\outputs\apk\release\app-release.apk') $apk -Force

# Git: alles vastleggen en de versie taggen
Push-Location $root
git add -A
git commit -m "PandaOS $Version"
git tag "v$Version"
git push
git push --tags

# GitHub Release met de APK
if (-not $Notes) { $Notes = "PandaOS $Version" }
gh release create "v$Version" $apk --title "PandaOS $Version" --notes $Notes
Pop-Location

Write-Host "Klaar: PandaOS $Version staat op GitHub. De radio vindt hem via Instellingen > Software."
