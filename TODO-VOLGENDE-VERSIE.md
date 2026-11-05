# Takenlijst volgende versie (na 1.3.8)

Vaste lijst met alles wat David heeft gevraagd. Bijwerken zodra iets klaar is. Pas committen als de lijst af is
(of als David dat zegt). Videotijden verwijzen naar https://www.youtube.com/watch?v=0hZyOJGAggo

## Open
1. **Zoekbalk van Instellingen**: de container moet anders. Wacht op uitleg van David: wat precies?
2. **Volume**:
   - Volumepagina met de 4 volumes van de radio (Meester 0-40, Bluetooth 0-40, Media bij achteruit 0-100 %,
     Navigatie 0-100), uitgelezen uit de log (BEVINDINGEN 5-11), laatste waarde onthouden.
   - Knop "Aanpassen" naar `com.jancar.audiosettings/.ui.activity.VolumeActivity`.
   - De volumebalk van PandaOS toont het meestervolume van de radio (0-40) in plaats van het Android-volume.
   - Volumeknop zoals in de video (08:24-08:49), met een instellingen-icoon links naar alle volumes.
3. **Geluid en audio-app**:
   - Een geluidspagina met equalizer, balans/fader en bas/sub.
   - Een audio-app met de bronnen (FM/DAB, Bluetooth, USB, AV-in, Spotify).
   - Om dit zelf te kunnen instellen zijn eerst de APK's van `com.jancar.services` en `com.jancar.audiosettings`
     van de radio nodig.
4. **Rechten-pagina in Instellingen**:
   - Alle rechten van PandaOS met hun status en hoe je ze geeft: camera, microfoon, logboek, meldingen,
     WRITE_SECURE_SETTINGS, CHANGE_CONFIGURATION, locatie.
   - Het startscherm kiezen (dat van de radio of PandaOS).
   - De Apps-tab bevat daarna alleen nog apps.
5. **Apps verwijderen in Apps**: eigen apps verwijderen (Android vraagt om bevestiging). Systeemapps van de radio,
   zoals een PDF-lezer, kunnen alleen worden uitgeschakeld via App-info.
6. **Telefoon** zoals in de video (17:37-18:44).
7. **Calendar en Messages** (18:46-20:23).
8. **Snelkoppelingen** (10:56-12:12), plus in Instellingen een keuze voor het app-menu: direct tonen of omhoog schuiven.
9. **P R N D of P R D** bij een handbak: wacht op het antwoord van David.
10. **Spotify, ANWB Onderweg, Waze en Flitsmeister op de emulator**: wacht tot David zelf inlogt in de Play Store.
11. **OBD2-dongel via wifi**: koppelen. Let op: zolang hij verbonden is, heeft de radio geen internet.
12. **Pakketnamen controleren** van Videoland (`nl.rtl.videoland.v2`), NPO Start (`nl.uitzendinggemist`) en HBO Max (`com.wbd.stream`).
13. **LAPTOP-ADB.md bijwerken** met:
    - `pm grant … WRITE_SECURE_SETTINGS` (Radio-instellingen, tijd);
    - `pm grant … CHANGE_CONFIGURATION` (taal);
    - het ophalen van de Jancar-APK's.
14. **Testen op de radio**:
    - camera 8 en "Camera kiezen";
    - de veegstrook;
    - Theater, Arcade en Toybox;
    - de volumebalk-schakelaar (overscan, Android 9);
    - tijd, tijdzone en taal (zonder apparaateigenaar);
    - de dock-pictogrammen.
15. **Volgende versie uitbrengen**: alleen na akkoord van David.

## Uitgebracht in 1.3.8 (getest op de emulator, nog niet op de radio)
- Achteruitrijcamera:
  - camera 8 eerst, camera's die niet openen worden overgeslagen;
  - venster "Camera kiezen" met Zoeken;
  - klikken in het camerascherm sluit de camera niet meer.
- Dashcam heet nu Achteruitrijcamera, met het oude pictogram.
- Veegstrook voor het paneel: 48 px over de hele breedte; tikken in de bovenbalk gaan gewoon door.
- Geavanceerd → Radio-instellingen, met schakelaars voor:
  - de systeembalk van de radio;
  - de volumebalk van de radio;
  - het paneel op slot;
  - de camera-app van de radio, plus een knop om alles terug te zetten.
- Theater (21:20): paneel met video-apps; staat de app er niet op, dan opent de Play Store. Schuift omhoog in beeld en volgt licht/donker.
- Arcade (22:21): eigen app met de geïnstalleerde games en een eigen pictogram.
- Toybox (23:02): Regenboogvloer, Scheetkussen, Tekenblok, Haardvuur, Spuiterij.
- Koppelen in de CAN-monitor: signalen die alleen via het CAN-kastje komen, zijn ingeklapt.
- Snelmenu: het tandwiel overlapt Wipers niet meer.
- Voertuig in de tegels van de Figma-kit:
  - lak met Groen en de Kleurenkiezer;
  - velgen met Wit en een eigen Kleurenkiezer;
  - uitlaat met de optie Geen; de uitlaat is nu chroom;
  - Ja/Nee bij Grafische kwaliteit.
- Eigen kleuren (lak en velgen): lang indrukken om ze een naam te geven of te verwijderen. Standaardkleuren kunnen dat niet.
- Geavanceerd: tegels voor Hulpmiddelen en CAN-kastje; Voertuigprotocol weer zonder iconen en op volle breedte; Mijn auto weg.
- Software:
  - opgeschoond, met Over als compacte tabel;
  - Mijn auto-gegevens staan bij Meer voertuiginformatie;
  - Automatisch controleren is een knop met venster.
- Diagnose is een eigen app.
- Schermreinigingsmodus bedekt het hele scherm.
- Datum en tijd:
  - schakelaars voor Tijd automatisch en Tijdzone automatisch;
  - tijd handmatig instellen;
  - tijdzone via een knop met een keuzevenster;
  - werkt ook voor Android zelf, voor zover Android dat toelaat.
- Taal: knop met keuzevenster, ook voor Android (na `pm grant CHANGE_CONFIGURATION`).
- Dock-pictogrammen: meegroeien met de dock of een vaste grootte, plus een eigen grootte (70-150 %).
