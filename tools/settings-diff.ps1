# Instellingen van de radio vergelijken: vóór en na één handeling (VOL+, CAN-keuze, lichtschakelaar ...).
# Alleen lezen (adb shell settings list); verandert niets op de radio.
#
#   powershell -ExecutionPolicy Bypass -File tools\settings-diff.ps1 -Name volume-omhoog
#
# Het script slaat de instellingen op, vraagt je de handeling te doen, slaat ze opnieuw op en toont wat er veranderde.
# Uitkomst staat in tools\settings-diff-<naam>-<tijd>\verschil.txt (niet op GitHub zetten).
param([string]$Name = "handeling")

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$dir = Join-Path $PSScriptRoot "settings-diff-$Name-$stamp"
New-Item -ItemType Directory -Force $dir | Out-Null

function Save-Settings($label) {
    foreach ($table in "system", "global", "secure") {
        adb shell settings list $table | Sort-Object | Set-Content (Join-Path $dir "$label-$table.txt")
    }
    adb shell getprop | Sort-Object | Set-Content (Join-Path $dir "$label-props.txt")
}

Write-Host "Instellingen opslaan (voor)..."
Save-Settings "voor"
Read-Host "Doe nu de handeling '$Name' op de radio en druk daarna op Enter"
Save-Settings "na"

$out = @()
foreach ($part in "system", "global", "secure", "props") {
    $before = Get-Content (Join-Path $dir "voor-$part.txt")
    $after = Get-Content (Join-Path $dir "na-$part.txt")
    $diff = Compare-Object $before $after
    if ($diff) {
        $out += "== $part"
        $out += $diff | ForEach-Object { if ($_.SideIndicator -eq "=>") { "na:   $($_.InputObject)" } else { "voor: $($_.InputObject)" } }
    }
}
if (-not $out) { $out = @("Geen verschil gevonden. De radio bewaart dit ergens anders (bijv. in de MCU of een eigen bestand).") }
$out | Set-Content (Join-Path $dir "verschil.txt")
$out | ForEach-Object { Write-Host $_ }
Write-Host "`nOpgeslagen in $dir"
