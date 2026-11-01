# ElRusty

En lokal Rust-arbetsyta för elsystem, industrial-flöden och conveyor-filter. Mörkt gränssnitt med röd accent, riktiga itembilder och sparning i din webbläsare.

## Starta

Kräver **Node.js 24** och **pnpm 11.25.0**.

```sh
npm install --global pnpm@11.25.0
pnpm install
pnpm dev
```

Öppna adressen som Vite skriver ut, normalt **http://127.0.0.1:5173**. Använd samma adress och port nästa gång: webbläsarens lokala databas är knuten till adressen. Kretsar och filter behöver inget konto. Live använder den lokala Node-tjänsten. Använd inte `file://` för att öppna appen.

```sh
pnpm check       # TypeScript
pnpm test        # domän-, routing- och lagringstester
pnpm build      # produktionsbygge i dist/
pnpm preview    # förhandsvisa produktionsbygget
pnpm exec playwright install chromium
pnpm test:e2e   # webbläsartester
```

På Windows kan du efter installation dubbelklicka på **Start-ElRusty.cmd**. Den bygger appen, öppnar webbläsaren och kör den lokala tjänsten; stäng terminalfönstret för att stoppa den. Startfilen hittar även Node i Codex lokala runtime om Node inte ligger i PATH.

GitHub Actions kör typkontroll, tester, produktionsbygge och Chromium-scenarier.

## Live — Rust+ och Discord

**Guidad Rust+-parning:** öppna Live → Inställningar och välj Registrera Rust+, sedan Vänta på server. Godkänn den mottagna servern i vyn. Manuell inmatning finns hopfälld längst ner.

Version 0.11 lägger till namngivna engångstimrar: !timer add 15m Oil Rig, !timer cancel <ID> och !timers [sida]. Skapa och följ dem även i Live → Timers. Sluttider sparas lokalt; Rust och privata Discord-kanalen #events aviseras när de är tillgängliga. Missade aviseringar återspelas inte.

Version 0.10 lägger till !wipe, !death, !online, !offline, !alive, !steamid, !prox och !uptime samt detaljhjälp via !help <kommando/grupp>. Alla kommandon finns i Live-inställningarna.

Version 0.9 innehåller livekarta med valbara lager, global anslutningsprick, guidad privat Discord-kanalsetup och valbar tvåvägschatt. Teamkommandon: !help, !time, !pop, !where, !events, !switch, !group, !mode och serverbekräftat !makeleader. Styrning kräver tillåtet SteamID; chattkopplingen kräver Message Content Intent.

Version 0.6 lade till en lokal bakgrundstjänst och fliken **Live**: serverprofiler, teamstatus, verifierade smarta enheter, switchgrupper, manuella lägen, Smart Alarm-historik, Discord-kommandon och `!time` i Rusts teamchatt. Kretsbyggaren styr inga riktiga enheter.

För normal drift: `pnpm build` och sedan `pnpm start`. Öppna **http://127.0.0.1:5173**. För utveckling startar `pnpm dev` både Vite och Live-API:t. Tjänsten behöver vara igång och datorn vaken även med stängd webbläsare. Den är lokal, utan publika konton.

Se [Live-guiden](docs/LIVE.md) för parning, Discord-behörigheter, privat datalagring, Raspberry Pi Zero 2 W och återstående spelkontroller. Rust+-parning, Discord-leverans och Pi-hårdvara är **inte verifierade mot riktiga konton/server i utvecklingstesterna**. Befintliga kretsar och filter fungerar även utan Live-anslutning.

## Kretsbyggare

- Dra in komponenter eller klicka på ett kort i biblioteket. Placera dem fritt.
- Anslut en output till en input genom dragning eller två klick. Fel porttyp, upptagna portar och ogiltiga root-anslutningar avvisas.
- Kablar dras med 90°-hörn runt komponenter och söker separata spår från andra kablar. En mörk kontur skiljer korsningar åt; de är inte anslutningar. Markera en kabel för att se dess start- och slutport. Högerklicka en kabel för individuell färg, nya brytpunkter, automatisk väg eller borttagning.
- Markera kabeln för att flytta dess böjar. Dubbelklicka en egen brytpunkt för att ta bort den. Konflikter med kort visas på kabeln.
- Ctrl + scroll: zoom vid muspekaren. Ctrl + vänsterdrag, mellanslag + dra eller mittenknapp: panorera. Handverktyget fungerar även när dragningen börjar över ett kort eller en kabel; korten flyttas inte.
- Shift + klick: markera flera komponenter. Shift + dra: linjera med närmaste komponent. Delete/Backspace: ta bort markering. Ctrl+Z / Ctrl+Shift+Z: ångra / gör om. Textfält påverkas inte av diagrammets kortkommandon.
- Båda sidopanelerna kan döljas. Tillståndet sparas.

Tryck **Simulera** eller stega manuellt. Boxarnas startlager redigeras i inställningspanelen. Redigering av komponentinställningar eller kopplingar återställer simuleringskörningen; positioner och kabelfärger gör det inte. Sparade lager är startlager, inte tillfälliga simuleringsresultat.

## Exempelbyggen

Sök bland 14 förlagor: Nih Core, BCN Core, NEXUS Core, Inline Backup och fem egna byggen inom reservkraft, fördelning, logik och industrial. Varje öppning skapar en redigerbar kopia med guide, rollnamn och individuella kabelfärger. Nuvarande bygge sparas först.

Kopplingsreferenser har simuleringen avstängd när nödvändiga spelregler saknas. De fem egna förlagorna har beteendetester för appens modell. NEXUS bygger på den delade kretsens 24 komponenter och 32 anslutningar. Fem logiklektioner har Grund, Mellan och Avancerad i separata områden på samma arbetsyta. Prova signaler direkt i guiden och följ en signalbild, sanningstabell och resultatlampa. Memory Cell kan provas utan att minnet återställs mellan händelser. Se [lektionsguiden](docs/LESSONS.md).

Se [biblioteksdokumentationen](docs/EXAMPLES.md) för källor, attribution och begränsningar.

## Conveyor-filter

Sök bland 1 309 importerade spelitems eller välj en hel kategori. Regler kan ha Min, Max, Buffer och Blueprint. Lägena är Any Item, Require All och Exclude Listed Items.

Kopiera JSON och håll **Shift** vid **Paste (JSON)** i Rusts conveyor-gränssnitt. Filterläget ingår inte i JSON-listan och måste väljas separat i spelet. Filterexporten är strukturtestad men **har inte verifierats genom inklistring i ett körande Rust-spel**. Kontrollera i spelet innan du förlitar dig på en konfiguration.

Filtersidan är ett fristående hjälpmedel för spelet. En conveyor i kretsbyggaren har separata simuleringsregler i sin inställningspanel.

## Sparning

Kretsar och filter autosparas i IndexedDB och visas under **Sparat**. Öppna, duplicera, byt namn, exportera eller radera där. JSON-import skapar en ny kopia efter validering; den skriver inte över ett befintligt bygge. Exportera backup före rensning av webbplatsdata, webbläsarbyte eller flytt till en annan adress.

## Simuleringsmodell och aktuell täckning

Version 0.5 innehåller 28 komponenter: energikällor, batteristorlekar, fördelning, grundlogik, timer, memory cell, två manuella sensorer, grundförbrukare, conveyors, industrial-fördelare, boxar med adaptrar, elektrisk ugn och crafter.

Solpanel och vind ger konstant 20 respektive 150 rW. Batterier har alltid laddning, med respektive maxutgång. Det är avsiktliga förenklingar. Industriella lager använder spelkatalogens stackstorlekar och begränsade lagerplatser. Ugn och crafter har separata input/output-områden; blueprints skiljs från vanliga items.

Version 0.3 rättar Electric Furnace till enbart Power In, visar dov röd bakgrund vid saknad eller för låg effekt och inför separata maskinlager. Craftern har fyra blueprint-platser med prioritet och transport via egna portar. Ugnen stöder även tomma burkar och honeycomb. Produktionsmodellerna är automatiskt testade men behöver fortsatt speljämförelse. Se [ändringsloggen](CHANGELOG.md).

**Detta är inte fullständig täckning av alla komponenter eller alla spelregler.** Se [simuleringsdokumentationen](docs/SIMULATION.md) för verifieringsnivå, modellerade beteenden och begränsningar. Portar dokumenteras per komponent; automatiska tester av modellen är inte detsamma som jämförelse i spelet. Se [enkla testscenarier i Rust](docs/GAME_CHECKS.md).

## Struktur

- `src/data`: separat komponentkatalog, itemdata, spelbildreferenser och recept.
- `src/routing.ts`: hindermedveten ortogonal kabelrouting och manuella brytpunkter.
- `src/simulation`: fristående, tidsstegad motor i Web Worker.
- `src/storage.ts`: IndexedDB, versionsmärkt backup och validering.
- `src/filters.ts`: eget export/importlager för Rusts conveyor-JSON.
- `src/components`: editor, komponentkort, filterredigerare och inställningspanel.

## Licens

Egen källkod: MIT. Rust-spelmaterial omfattas inte av MIT. Se [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
