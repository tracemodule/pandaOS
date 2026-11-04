# PandaOS

Een Tesla-achtige interface voor de Android-autoradio van een Volkswagen Golf 6, gemaakt door David Cotino.

- `client/` — de webapp (React + TypeScript + Vite)
- `android/` — de launcher-app voor de radio (Kotlin, WebView met de webapp, brug naar Android)
- `server/` — Node-server voor laptop/Raspberry Pi (Bluetooth, telefoon, media)
- `tools/` — `release.ps1` (nieuwe versie uitbrengen) en `radio-diagnose.ps1` (radio verkennen via ADB)

Hoe alles werkt en wat er nog open staat: [PANDAOS-OVERDRACHT.md](PANDAOS-OVERDRACHT.md).

## Updates

Nieuwe versies staan als APK bij [Releases](../../releases). PandaOS controleert dat zelf in
Instellingen → Software → Software-update en installeert de nieuwe versie.

## Licentie en vermelding

- Gebaseerd op PandaOS van Cyberpandino, GPL-3.0. Deze versie valt daarom ook onder de GPL-3.0 (zie `LICENSE`).
- 3D-model "Volkswagen Golf 6 (A6)" door GT Cars: Hyperspeed, CC-BY 4.0 (Sketchfab).
