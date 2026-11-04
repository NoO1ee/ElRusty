# ElRusty Events

0.18 lägger till !cargo, !heli (NPC Patrol Helicopter), !smalloil, !largeoil och !events med tydlig källa. !report cargo A10 eller heli A10 rapporterar ett område; !report smalloil start och largeoil start rapporterar hackningsstart; !report <typ> end avslutar lagrapporten. Alla aktuella teammedlemmar får rapportera. Webbens formulär använder parade kontot. Ingen rapport påstår verifierad spawn- eller hackningstid.

Lagrapporter uppdaterar position utan nya notiser. Nya rapporter och statusbyten visas i historik, #events och teamchatt. Efter 15 minuter är en lagrapport inaktuell och visas inte på kartan. Historiken behåller högst 100 event per profil och wipe; inga notiser återspelas efter avbrott. Serverbekräftade event kräver den separata Oxide-integrationen i 0.19.

## Oxide och Pi — 0.19

Installera ElRustyEvents endast på en server du administrerar med uMod/Oxide. Under Live → Inställningar → Servrar väljer du den egna serverprofilen och Skapa privat plugininställning. Filen sparas i tjänstens privata datamapp under event-plugins/<profil-ID>.json. På Pi används /var/lib/elrusty; nyckeln skickas inte i Live-status, frontendpaket eller vanliga exporter. Upprepad konfiguration behåller samma nyckel.

På Windows, i projektmappen:

```powershell
powershell -NoProfile -File deploy/install-event-plugin.ps1 -ProfileId <profil-ID>
powershell -NoProfile -File deploy/install-event-tunnel.ps1
```

Installationsskriptet kräver befintlig Oxide-installation i C:\rustserver (annan mapp: -RustServerPath), SSH-nyckeln .private/pi-access, känd SSH-hostnyckel och sudo-läsbehörighet till den privata Pi-filen. Ingen nyckel skrivs ut. JSON kopieras till oxide/config/ElRustyEvents.json och koden till oxide/plugins/ElRustyEvents.cs. Ladda om med oxide.reload ElRustyEvents vid behov. Oxide kompilerar pluginen. Ändra inte privata plugininställningar i Git.

Tunneln lyssnar endast på Windows 127.0.0.1:5184 och vidarebefordrar till Pi 127.0.0.1:5184. Den kör oberoende av dashboardens tunnel, återstartar efter nätavbrott och startas vid användarens Windows-inloggning. Pi-adress kan anges med -PiAddress; standarden följer befintlig Pi-guide. Stoppa/avregistrera via Aktivitetsschemaläggaren, uppgiften ElRusty Events Tunnel. Lokal ElRusty och tunneln kan inte samtidigt äga port 5184. Om ElRusty och Oxide körs på samma dator behövs ingen SSH-tunnel; kopiera den lokalt skapade privata JSON-filen direkt till Oxides config-mapp.

Mottagaren har separat nyckelskydd och tar bara emot POST /ingest på localhost. Protokollversion 1 innehåller profil-ID, pluginsession, stigande sekvensnummer, sändningstid, kartstorlek, seed, wipe-tid, baslinjeflagga och en fullständig lista med aktuella entiteter. Fel profil/karta/wipe, gamla paket, gamla sessioner, dubbletter och orimliga positioner avvisas. Browser-Origin avvisas. Max 64 KiB och 100 event per paket. Ny anslutning eller kontaktgap över 15 sekunder kräver baslinje, utan historiska notiser. Pluginen bygger nästa färska bild efter fel; inga gamla meddelanden köas.

Cargo/Patrol Helicopter behåller observerad spawnposition och åttavägs ankomstriktning separat från nuvarande position. Entiteter som fanns före pluginstart får ingen påhittad spawnplats eller starttid. Oil Rig-lådor identifieras genom monumentets lokala bounds och prefabnamn. OnCrateHack/OnCrateHackEnd rapporterar faktisk hackningsstart/färdigstatus utan fast upplåsningstimer. OnEntityDeath bekräftar förstörd entitet; OnEntityKill ensam rapporterar endast avslut. Frånvaro i en ny bild gör tidigare position inaktuell utan att påstå död eller nedskjutning.

### Verifierat 2026-11-04

- TypeScript/domän/API-tester täcker lagrapporter, kartområden, behörigheter, nyckelmaskering, HTTP-mottagare, sekvenser, baslinjer, återanslutning och profil-/wipekontroll.
- ElRustyEvents kompilerades mot de lokala Rust-assemblies och Oxide.Rust 2.0.7839. Ingen Rust++-kod återanvändes.
- En separat kopia av Rust-servern med testprofil, seed 12345 och egna portar laddade både ElRustyEvents och en tillfällig testplugin. Riktiga hooks gav cargo:active, heli:active, cargo:ended, heli:ended, smalloil:hacking/unlocked, largeoil:hacking/unlocked och heli:destroyed till en lokal autentiserad testmottagare. Testservern stoppades efteråt; ordinarie serverfiler ändrades inte.
- End-to-end-leverans via din Pi-tunnel till din valda Discord-/Rust-server återstår att kontrollera efter installation på den egna Oxide-servern. Inga testmeddelanden skickades till ditt riktiga lag eller Discord-server.