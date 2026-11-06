# PandaOS

Een Tesla-achtige interface voor de Android-autoradio van een Volkswagen Golf 6, gemaakt door David Cotino.

- `client/` — de webapp (React + TypeScript + Vite)
- `android/` — de launcher-app voor de radio (Kotlin, WebView met de webapp, brug naar Android)
- `server/` — Node-server voor laptop/Raspberry Pi (Bluetooth, telefoon, media)
- `tools/` — `release.ps1` (nieuwe versie uitbrengen), `pandaos.mjs` (PandaOS op de radio testen vanaf de laptop)
  en `radio-diagnose.ps1` (radio verkennen via ADB)

Hoe alles werkt: [PANDAOS-OVERDRACHT.md](PANDAOS-OVERDRACHT.md). Wat er nog open staat:
[TODO-VOLGENDE-VERSIE.md](TODO-VOLGENDE-VERSIE.md). Testen op de radio: [RADIOTEST.md](RADIOTEST.md) en
[BEVINDINGEN.md](BEVINDINGEN.md).

## Updates

Nieuwe versies staan als APK bij [Releases](../../releases). PandaOS controleert dat zelf in
Instellingen → Software → Software-update en installeert de nieuwe versie.

## Licentie en vermelding

- Gebaseerd op PandaOS van Cyberpandino, GPL-3.0. Deze versie valt daarom ook onder de GPL-3.0 (zie `LICENSE`).
- 3D-model "Volkswagen Golf 6 (A6)" door GT Cars: Hyperspeed, CC-BY 4.0 (Sketchfab).
- Kaart buiten Nederland: © OpenStreetMap-bijdragers (tile.openstreetmap.org); in Nederland PDOK/Kadaster.
- Lichtomgevingen (HDR) "Potsdamer Platz" en "Dikhololo Night" van Poly Haven, CC0.
