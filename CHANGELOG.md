# Ändringslogg

## 0.6.1 — 2026-10-31

- Guidad Rust+-parning med knappar för registrering, servermottagning och godkännande direkt i Live-vyn.
- Isolerat inloggningsfönster utan avstängd webbsäkerhet; status, avbrott och tidsgränser för egna parningsjobb.
- Mottagna profiler maskeras och sparas först efter användarens val. Inga token eller råa processloggar visas i sidan.
- Manuell inmatning och JSON-import ligger nu hopfällda längst ner.
- Verklig Steam/FCM-parning återstår att verifiera med användarens konto.

## 0.6.0 — 2026-10-31

- Ny Live-flik med Rust+-anslutning, serverprofiler, teamstatus och separat SQLite-lagring.
- Verifierade smarta switches, larm och lagermonitorer; individuell styrning, grupper och redigerbara manuella lägen med delresultat.
- Discord-bot med serverbundna behörigheter, slash-kommandon och larmnotiser.
- !time i Rusts teamchatt, med deduplicering, cooldown, felhantering och skydd mot fördröjda svar efter frånkoppling.
- Återanslutning utan återspelning av kommandon, privata token, loopback-API med Host/Origin- och CSRF-kontroll.
- Produktionsstart, gemensam utvecklingsstart och systemd-exempel för framtida Pi-flytt.
- Spel-, Discord- och Pi-verifiering återstår; se docs/LIVE.md.

## 0.5.1 — 2026-10-31

- Automatisk kabeldragning tar hänsyn till andra kablar och väljer separata spår, bland annat till Memory Cells Power In, Set och Reset i Nih Core.
- En mörk kontur skiljer korsande kablar åt. Korsningar är inte elektriska anslutningar.
- Markerad kabel visar komponent- och portnamn för båda ändarna.
- Manuella brytpunkter prioriteras och behålls; färgval påverkar inte kabelvägen.
- Regressionstester för Nih, BCN och NEXUS samt exakta portändpunkter, kortförflyttning och egna brytpunkter.

## 0.5.0 — 2026-10-31

- Fem logiklektioner för OR Switch, Memory Cell, Blocker, XOR Switch och AND Switch.
- Grund, Mellan och Avancerad i tre separata områden per bygge, med nivåfokus och fritt redigerbara komponenter.
- Förklaringar av funktion och användning, övningar, sanningstabeller/minnesregler och signalbild från verkliga simuleringsvärden.
- Tillfälliga testsignaler kan provas utan att startinställningar eller minne återställs. Signaler köas i ordning, även när simuleringen är pausad.
- Områden, valt nivåval och arbetsyta sparas med bygget. Biblioteket har nu 14 förlagor.
- Testtäckning för sammansatta villkor, minnesretention, Toggle, tillfälliga signaler, backup och nivåfokus.

## 0.4.0 — 2026-10-31

- Ny flik Exempelbyggen med sökning, kategorier, ursprung och schematiska förhandsvisningar med Rust-bilder.
- Nih Core, BCN Core, Inline Backup och NEXUS Core som källhänvisade kopplingsreferenser. NEXUS återger 24 komponenter och 32 anslutningar från den delade kretsen.
- Fem egna, modelltestade förlagor för reservkraft, prioriterad fördelning, latch, timer, smältlinje och fristående sektorer.
- Ny kopia vid varje öppning; det föregående bygget sparas innan bytet. Guider och rollnamn följer med i sparning och backup.
- Referenssimulering spärras i både motor och gränssnitt. Tydlig skillnad mellan kopplingsreferens och modelltestad förlaga.
- Redigerbara rollnamn på komponentkort; portnamn behålls på engelska.
- Branch tillåter 1 rW enligt aktuella Rust-regler.

## 0.3.0 — 2026-10-31

- Electric Furnace har enbart Power In bland elportarna. Den felaktiga Passthrough-porten och dess simulerade utgång är borttagna.
- Dov röd bakgrund och effekttext vid saknad eller otillräcklig ström. Avstängd komponent med tillräcklig effekt visas separat.
- Ugnen har två input- och tre output-platser med eget framsteg per input. Blandade material delar smältkapaciteten i modellen.
- Tomma bön- och tonfiskburkar samt honeycomb stöds, med rätt utmatningsmängder.
- Craftern har fem input-, fyra output- och fyra blueprint-platser. Första möjliga blueprint i ordningen används.
- Blueprint-exemplar kan lagras, filtreras och transporteras genom egna portar utan sammanblandning med vanliga items.
- Panelen visar maskinens lagerplatser och sparar fyra blueprint-val, inklusive tomma platser.
- Äldre byggen migrerar felaktiga ugnsanslutningar med meddelande. Överfulla äldre startlager bevaras och stoppar produktion tills de rättats.
- Nya regressionstester för portar, strömstatus, slotgränser, blandad smältning, blueprint-prioritet, transport och backup.

Receptbiblioteket omfattar fortfarande tre crafter-recept. Smältfördelning, craftingtempo och filterexport behöver jämföras i Rust; [spelkontroller](docs/GAME_CHECKS.md) beskriver hur.

## 0.2.0 — 2026-10-31

- Elektrisk ugn: separata dokumenterade tider för metal, sulfur och HQM.
- Industrial Crafter: receptmängder och workbench-tider hämtade från Facepunchs wiki. Rifle Ammo rättat från 10 s till 3 s på tier 2; tier 3 tar 1 s.
- Produktion hanterar flera satser, resttid och strömavbrott. Tomgång, fulla lager och saknade ingredienser ger ingen sparad produktionstid.
- Atomär ingrediensförbrukning och platskontroll efter förbrukning; inga förlorade ingredienser vid fullt lager.
- Komponentpanelen visar produktionsstatus, ingredienser, satstider och källor.
- Vanliga material kan inte gå genom crafterns blueprint-portar.
- Backup avvisar okända crafter-recept och ogiltig workbench.

Fortsatta begränsningar: seriell smältkö, gemensam lagerbudget, tre crafter-recept, manuellt blueprint och ingen spelverifiering. Se [simuleringsmodellen](docs/SIMULATION.md).
