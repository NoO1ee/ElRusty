# Ändringslogg

## 0.12.0 — 2026-11-01

- !time visar ungefärlig verklig väntetid till nästa solnedgång eller soluppgång samt tydligt besked vid fryst tid.
- Automatisk inlärning av separata dag-/nattkurvor med 21 mätpunkter, median från de tre senaste kompletta faserna och beständig lagring per profil/wipe.
- Tidsläsning var femte sekund utan överlappande anrop, även med stängd webbläsare. Avbrott och ändrade tidsförhållanden avbryter eller återställer inlärningen utan gamla chattsvar.

## 0.11.2 — 2026-11-01

- AppTime.timeScale och time är valfria float-fält med oförändrade nummer. Fryst tid och midnatt kan utelämna nollvärden utan protokollfel.
- Separat valfri anslutningsadress för lokal/LAN-åtkomst. Parningsadressen behålls så ny parning uppdaterar samma profil utan att nollställa den lokala anslutningen.
- Inställningen visas i profilredigeringen och bevarar profil-ID, enheter, lägen, behörigheter och timers vid omparning.

## 0.11.1 — 2026-11-01

- Rust+-kompatibilitet för egna och tomma servrar: AppInfo.players och maxPlayers får utelämnas och normaliseras till noll, med oförändrade fältnummer och datatyper.
- Regressionstester för utelämnade, nollställda och positiva spelarantal samt fortsatta team-/tidsanrop. Befintligt skydd mot trasiga protokollmeddelanden behålls.
- Dokumenterad lokal Rust+-anslutning när ElRusty och Rust-servern körs på samma dator, utan ändring av serverns publika mobilåtkomst.

## 0.11.0 — 2026-11-01

- Namngivna engångstimrar genom !timer add, !timer cancel och !timers samt ny Live → Timers-vy.
- SQLite-migrering till version 2 med separat timertabell, atomiska tillståndsbyten och högst 100 avslutade timers per profil. Sparade parningar och övrig data bevaras.
- Oberoende Rust-/Discord-aviseringar med begränsade köer, beständiga sändningsförsök och kanalvis resultat. Ingen återspelning efter avbrott/omstart.
- Ägarbehörigheter, 10s–7d, max 20 aktiva per profil och skydd mot utskick till fel server. Framtida timers fortsätter över omstart och wipe.
- Automatiska tester för migration, dubbla schedulers, kvoter, avbrott, API-skydd och browserflöden. Verkliga spel-/Discord-aviseringar återstår att användarverifiera.


## 0.10.0 — 2026-11-01

- Nya teamkommandon: !wipe, !death, !online, !offline, !alive, !steamid, !prox och !uptime. !where utan namn visar avsändarens position.
- Gemensam kommandokatalog i webbpanelen och !help, med grupp-/detaljhjälp. Oförändrade styrbehörigheter och ingen ny !team.
- Saknad/felaktig tid eller position ger tydliga svar. !death använder endast sparad dödsplats för parade kontot.
- Förtydligat att vanilla-Rust+ inte längre skickar event-/butiksmarkörer efter Power Trip (2026-08-06). Automatiska Cargo-/Oil Rig-kommandon ingår inte; manuella teamrapporter skjuts upp enligt användarens val.


## 0.9.2 — 2026-11-01

- Accepterar utelämnade standardvärden i teammedlemmars tillstånd (inklusive isAlive=false vid död) och behåller okända positioner som okända.
- Visar egna och teamledarens waypoints med etiketter samt separat lager för din senaste dödsplats. Dödsplats sparas per serverprofil/wipe; observerad reservposition märks ungefärlig.
- Moderniserade kartnoteringars protobuf-fält: icon, colourIndex och label. Fortsatt strikt identitet och skydd mot trasiga meddelanden.
- Protokollfel kan ange ett verifierat schemafältnamn utan råa payloads, token eller partiella objekt.
- Testat dödsbroadcast, återspawn, waypoints och wipe-/serverisolering. Nästa verkliga dödsfall behöver slutverifieras i spelet.


## 0.9.1 — 2026-11-01

- Kartvyn efterliknar Rust+-appens presentation: större kartyta, flytande lager och navigeringsknappar, utökat läge och nordindikator.
- Tydliga monumentnamn med överlappningsskydd ersätter likadana prickar. Teamnamn, butiker och event har särskilda markörer med bibehållen serverdata.
- Öppningsvyn fokuserar ön; Visa hela kartan visar åter hela bilden.


## 0.9.0 — 2026-11-01

- Rust-teamkommandon för hjälp, population, positioner, synliga event, switches, grupper, lägen och serverbekräftat ledarskapsbyte. Serverbunden SteamID-behörighet; ingen ny !team.
- Valbar Discord↔Rust-textchatt med deduplicering, neutraliserade mentions, begränsade köer och avbrottsskydd. Saknat Message Content Intent pausar chatten men behåller övriga botfunktioner.
- Nya domän-, protokoll- och browserprov samt korrigerade kartetiketter.
- Riktig Discord, ledarskapsbyte och chatt i spelet återstår att användarverifiera.


## 0.8.0 — 2026-10-31

- Guidad Discord-setup med serverval, åtkomstförhandsvisning och sex privata kanaler.
- Sparar kategori- och kanal-ID:n för återupptagning och reparation utan namnövertagande.
- Uppdaterat statusmeddelande, larm, kartevent och aktivitet i separata kanaler.
- Ändrad åtkomst spärrar nya kanalutskick tills behörigheterna applicerats med setupen.

## 0.7.0 — 2026-10-31

- Livekarta med Rust+-kartbild, SVG-lager, teampositioner, monument, vending machines och eventmarkörer.
- Gemensam Live-store med statusprick även utanför Live-fliken.
- Separat kartbilds-API, sessionscache, serverbyte och inaktuell status vid avbrott.
- Markörbaslinjer hindrar historiska eventnotiser vid återanslutning.

## 0.6.5 — 2026-10-31

- Accepterar teamkartnoteringar utan AppTeamInfo.Note.type och teaminformation utan leaderSteamId, verifierat med en läsande kontroll mot användarens server.
- Retry-räknaren nollställs först efter 30 sekunders stabil anslutning, inte direkt efter serverinformationen. Upprepade protokollfel ger därför ökande väntetid.

## 0.6.4 — 2026-10-31

- Kompatibilitetspatch för serversvar utan queuedPlayers.
- Avkodningsfel och misslyckad protokolladdning rapporteras säkert i stället för att krascha Node-processen.
- Väntande anrop avbryts, ett tydligt protokollfel visas och befintlig återanslutning används. Sparad parning behålls.
- Regressionstester för saknat köfält, trasiga meddelanden, protokolladdning och återanslutning.

## 0.6.3 — 2026-10-31

- Väntar på att det egna inloggningsfönstret stängts och försöker igen vid låsta profilfiler på Windows.
- Ett städfel kan inte längre skriva över ett mottaget inloggningssvar. Kvarlämnade privata temporärfiler visas som separat varning.
- Registreringsfel visar nu berört steg och vid behov HTTP-status eller tillåten filfelkod, utan token eller råa serverfel.

## 0.6.2 — 2026-10-31

- Automatisk Brave-upptäckt på Windows, inklusive användar- och systeminstallationer.
- Prioriterar explicit CHROME_PATH, sedan Brave, Edge och befintlig Chrome-upptäckt.
- Behåller tillfällig inloggningsprofil, webbsäkerhet och sidisolering.
- Uppdaterade instruktioner och tester för webbläsarval och reservvägar.

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
