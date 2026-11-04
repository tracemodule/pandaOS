# PandaOS - radio verkennen via ADB (vanaf de laptop)
# Verzamelt in een map alles wat helpt om de CAN-bus en de radio te begrijpen:
#  - lijst met apps (CAN-app, CarPlay-app, Bluetooth-app van de fabrikant)
#  - systeemeigenschappen (Android-versie, chipset, fabrikant)
#  - broadcasts en diensten die er geregistreerd zijn
#  - een live logboek (logcat) zolang dit script draait: schakel ondertussen in R, open deuren, zet lichten aan ...
#
# Gebruik (radio met draadloos debuggen of USB):
#   adb connect <ip-van-de-radio>:<poort>      (bij draadloos debuggen)
#   powershell -ExecutionPolicy Bypass -File tools\radio-diagnose.ps1
# Stoppen met Ctrl+C; de map staat daarna in tools\radio-diagnose-<datum>.

$adb = Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'
if (-not (Test-Path $adb)) { $adb = 'adb' }
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$dir = Join-Path $PSScriptRoot "radio-diagnose-$stamp"
New-Item -ItemType Directory -Force $dir | Out-Null

Write-Host "Gegevens van de radio verzamelen in $dir ..."
& $adb devices | Out-File "$dir\apparaten.txt"
& $adb shell getprop | Out-File "$dir\eigenschappen.txt"
& $adb shell pm list packages -f | Out-File "$dir\apps.txt"
# Apps die met de auto, CarPlay of Bluetooth te maken lijken te hebben
& $adb shell pm list packages | Select-String -Pattern 'can|car|mcu|syu|microntek|tw\.|bt|bluetooth|link|zlink|autokit|carplay|dsp|eq|audio|radio|camera|avm' |
  Out-File "$dir\apps-auto.txt"
& $adb shell dumpsys activity broadcasts | Out-File "$dir\broadcasts.txt"
& $adb shell dumpsys activity services | Select-String -Pattern 'ServiceRecord' | Out-File "$dir\diensten.txt"
& $adb shell dumpsys media_session | Out-File "$dir\mediasessies.txt"
& $adb shell dumpsys media.camera | Out-File "$dir\camera.txt"
& $adb shell ls -l /dev | Select-String -Pattern 'tty|can|mcu' | Out-File "$dir\seriele-poorten.txt"

Write-Host ''
Write-Host 'Live logboek loopt nu (logcat.txt). Doe in de auto: R inschakelen, deuren open/dicht, lichten aan/uit,'
Write-Host 'stuurknoppen indrukken, Bluetooth-telefoon verbinden ... Stop met Ctrl+C.'
& $adb logcat -c
& $adb logcat -v time | Tee-Object -FilePath "$dir\logcat.txt" | Select-String -Pattern 'can|mcu|backcar|reverse|ill|door|radar|steer|swc|key|light|gear|speed|temp'
