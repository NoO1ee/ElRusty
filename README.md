# ElRusty

En lokal Rust-arbetsyta för elsystem, industrial-flöden och conveyor-filter. Mörkt gränssnitt med röd accent, riktiga itembilder och sparning i din webbläsare.

## Starta

Kräver **Node.js 24** och **pnpm 11.25.0**.

```sh
npm install --global pnpm@11.25.0
pnpm install
pnpm dev
```

Öppna adressen som Vite skriver ut, normalt **http://127.0.0.1:5173**. Använd samma adress och port nästa gång: webbläsarens lokala databas är knuten till adressen. Appen använder inget konto eller backend. Använd inte `file://` för att öppna appen.

```sh
pnpm check       # TypeScript
pnpm test        # domän-, routing- och lagringstester
pnpm build      # produktionsbygge i dist/
pnpm preview    # förhandsvisa produktionsbygget
pnpm exec playwright install chromium
pnpm test:e2e   # webbläsartester
```

På Windows kan du efter installation dubbelklicka på **Start-ElRusty.cmd**. Den öppnar webbläsaren och kör den lokala servern; stäng terminalfönstret för att stoppa den. Startfilen hittar även Node i Codex lokala runtime om Node inte ligger i PATH.

GitHub Actions kör typkontroll, tester, produktionsbygge och Chromium-scenarier.

## Kretsbyggare

- Dra in komponenter eller klicka på ett kort i biblioteket. Placera dem fritt.
- Anslut en output till en input genom dragning eller två klick. Fel porttyp, upptagna portar och ogiltiga root-anslutningar avvisas.
- Kablar dras med 90°-hörn runt komponenter. Högerklicka en kabel för individuell färg, nya brytpunkter, automatisk väg eller borttagning.
- Markera kabeln för att flytta dess böjar. Dubbelklicka en egen brytpunkt för att ta bort den. Konflikter med kort visas på kabeln.
- Ctrl + scroll: zoom vid muspekaren. Ctrl + vänsterdrag, mellanslag + dra eller mittenknapp: panorera. Handverktyget fungerar även när dragningen börjar över ett kort eller en kabel; korten flyttas inte.
- Shift + klick: markera flera komponenter. Shift + dra: linjera med närmaste komponent. Delete/Backspace: ta bort markering. Ctrl+Z / Ctrl+Shift+Z: ångra / gör om. Textfält påverkas inte av diagrammets kortkommandon.
- Båda sidopanelerna kan döljas. Tillståndet sparas.

Tryck **Simulera** eller stega manuellt. Boxarnas startlager redigeras i inställningspanelen. Redigering av komponentinställningar eller kopplingar återställer simuleringskörningen; positioner och kabelfärger gör det inte. Sparade lager är startlager, inte tillfälliga simuleringsresultat.

## Conveyor-filter

Sök bland 1 309 importerade spelitems eller välj en hel kategori. Regler kan ha Min, Max, Buffer och Blueprint. Lägena är Any Item, Require All och Exclude Listed Items.

Kopiera JSON och håll **Shift** vid **Paste (JSON)** i Rusts conveyor-gränssnitt. Filterläget ingår inte i JSON-listan och måste väljas separat i spelet. Filterexporten är strukturtestad men **har inte verifierats genom inklistring i ett körande Rust-spel**. Kontrollera i spelet innan du förlitar dig på en konfiguration.

Filtersidan är ett fristående hjälpmedel för spelet. En conveyor i kretsbyggaren har separata simuleringsregler i sin inställningspanel.

## Sparning

Kretsar och filter autosparas i IndexedDB och visas under **Sparat**. Öppna, duplicera, byt namn, exportera eller radera där. JSON-import skapar en ny kopia efter validering; den skriver inte över ett befintligt bygge. Exportera backup före rensning av webbplatsdata, webbläsarbyte eller flytt till en annan adress.

## Simuleringsmodell och aktuell täckning

Version 0.1 innehåller 28 komponenter: energikällor, batteristorlekar, fördelning, grundlogik, timer, memory cell, två manuella sensorer, grundförbrukare, conveyors, industrial-fördelare, boxar med adaptrar, elektrisk ugn och crafter.

Solpanel och vind ger konstant 20 respektive 150 rW. Batterier har alltid laddning, med respektive maxutgång. Det är avsiktliga förenklingar. Industriella lager använder spelkatalogens stackstorlekar och begränsade lagerplatser.

**Detta är inte fullständig täckning av alla komponenter eller alla spelregler.** Se [simuleringsdokumentationen](docs/SIMULATION.md) för verifieringsnivå, modellerade beteenden och begränsningar. Portar dokumenteras per komponent; automatiska tester av modellen är inte detsamma som jämförelse i spelet.

## Struktur

- `src/data`: separat komponentkatalog, itemdata, spelbildreferenser och recept.
- `src/routing.ts`: hindermedveten ortogonal kabelrouting och manuella brytpunkter.
- `src/simulation`: fristående, tidsstegad motor i Web Worker.
- `src/storage.ts`: IndexedDB, versionsmärkt backup och validering.
- `src/filters.ts`: eget export/importlager för Rusts conveyor-JSON.
- `src/components`: editor, komponentkort, filterredigerare och inställningspanel.

## Licens

Egen källkod: MIT. Rust-spelmaterial omfattas inte av MIT. Se [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
