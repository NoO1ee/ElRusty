# Simuleringsmodell 0.5

## Källor och verifieringsnivå

Itemnamn, shortnames, kategorier, stackstorlekar och bilder kommer från den installerade Rust-klientens itemdata; datum finns i `src/data/provenance.json`.

`documented` betyder att komponentens portar har dokumentationsstöd. `modelled` anger en utökad modell som fortfarande behöver jämföras med spelet. Automatiska modelltester är inte spelverifiering. Ingen komponent markeras ännu som `in-game verified`.

Källor för denna release:

- [Facepunch: Electric Furnace](https://wiki.facepunch.com/rust/item/electric.furnace): 3 rW, Power In, dokumenterade omvandlingar.
- [RustClash: Electric Furnace](https://wiki.rustclash.com/item/electric-furnace#tab=smelting): användarens referens för portar och smältning.
- [Facepunch: Industrial Update](https://rust.facepunch.com/news/industrial-update): separata lagerdelar och blueprint-portar.
- [Facepunch: Eye In The Sky](https://rust.facepunch.com/news/eye-in-the-sky): fyra blueprint-platser, prioritet från vänster till höger.
- [Facepunch: Electric Furnace QoL, commit #98032](https://commits.facepunch.com/SamZaNemesis?p=1263): fullt output-lager pausar ugnen och borttagning av items återupptar smältningen.
- [Rustrician Electrical Handbook, Industrial](https://rustrician.io/handbook/): referens för lagerindelningen. Detta är en community-källa, inte egen spelverifiering.

## El och visuell status

Motorn kör 250 ms tidssteg i en Web Worker. Kombinatoriska signaler beräknas tills de stabiliseras inom en begränsad iterationsbudget. Instabila slingor ger en varning. Diagramgeometri och kabelfärger påverkar inte simuleringen.

Solpanel: 20 rW, vind: 150 rW, generator: 40 rW. Batterier: 15, 50 eller 100 rW med ständig laddning. `Fully Charged` modelleras som 1 rW. Ingen vädermodell eller laddningskurva.

Branch kan ställas från 1 rW och reserverar sitt värde och skickar resten till Power Out. Splitter fördelar mellan anslutna utgångar. AND kräver båda signalerna; OR väljer den högsta; XOR släpper endast en ensam signal. Förbrukare med Passthrough och conveyors drar sin effekt före utgången.

**Electric Furnace har bara en elektrisk port: Power In. Ingen Passthrough finns.** Industrial In/Out på ugnskortet tillhör den inkluderade Storage Adaptorn. Äldre sparningar och importer med den felaktiga elektriska utgången får den anslutningen borttagen vid inläsning, med ett synligt meddelande. Övriga komponenter och anslutningar bevaras; ursprungsobjektet ändras inte av inläsningen.

Kort med Power In får dov röd bakgrund om effekten saknas eller understiger kravet. Texten skiljer mellan `Saknar ström · 0 / 3 rW`, `För lite ström · 2 / 3 rW` och `Avstängd`. Batterier, energikällor och passiva lager ska inte varnas för avsaknad av Power In. Tillräcklig ström tar bort varningsfärgen även om användaren stängt av komponenten.

Timer och Memory Cell använder bevarat tillstånd och stigande signalflanker. Sensorer har manuell av/på-inmatning; fysisk omvärld simuleras inte. Turret simulerar strömförbrukning, inte ammunition eller strid. Ändrad topologi eller inställningar återställer körningen.

## Lager och transporter

Vanliga lager skiljer på item och blueprint av samma shortname. Blueprints använder en plats per exemplar. Maskinlager har numrerade platser och separata områden:

| Maskin             | Input | Output | Blueprints |
| ------------------ | ----- | ------ | ---------- |
| Electric Furnace   | 2     | 3      | 0          |
| Industrial Crafter | 5     | 4      | 4          |

Inmatning kan inte låna en tom output-plats. Färdiga items kan inte låna en frigjord input-plats. Conveyors tar bara ut färdiga items via Industrial Out. Blueprint In/Out läser och skriver enbart blueprint-området. Skin, condition och manuellt låsta platser ingår inte.

Äldre onumrerade startlager packas till maskinens områden vid simuleringsstart. Om de inte ryms bevaras överskottet och produktionen stoppas med ett felmeddelande. Appen kastar inte bort items för att få en äldre konfiguration att passa. Redigera eller töm startlagret för att lösa konflikten. Äldre crafters med ett manuellt recept får det receptets blueprint som startinställning; fyra explicita val ersätter denna bakåtkompatibilitet. Tomma blueprint-platser och ordning sparas.

Conveyors söker genom passiva splitters/combiners till behållare, med sökdjup 32 och skydd mot slingor. En annan conveyor är en gräns. Lagerområden bakom olika portar hålls isär även när de tillhör samma crafter.

Transportmodellen använder en femsekunderscykel och högst 128 items per identitet och källområde per cykel. Detta är **inte en verifierad reproduktion av aktuellt transporttempo, stackprioritet eller nätverksfördelning i Rust**. Min lämnas kvar i källan, Max begränsar målet, Buffer kräver en minsta sats. Require All kräver tillgång till varje regel; Exclude stoppar matchningar. Filter Pass/Fail följer senaste transportcykeln. Blueprint-regler matchar blueprint-exemplar och vanliga regler matchar vanliga items.

## Electric Furnace

| Input                  | Output per item      | Tid med en aktiv input-plats |
| ---------------------- | -------------------- | ---------------------------- |
| Metal Ore              | 1 Metal Fragments    | 2 s                          |
| Sulfur Ore             | 1 Sulfur             | 1 s                          |
| High Quality Metal Ore | 1 High Quality Metal | 4 s                          |
| Empty Can Of Beans     | 15 Metal Fragments   | 6 s                          |
| Empty Tuna Can         | 10 Metal Fragments   | 6 s                          |
| Honeycomb              | 1 Jar of Honey       | 0,4 s                        |

Ugnen förbrukar 3 rW, inget bränsle och ger ingen charcoal. De två aktiva input-platserna delar modellens smältkapacitet lika. Varje plats behåller eget framsteg; när en blir tom får den återstående hela kapaciteten. Två stackar av samma malm ökar därför inte totalhastigheten. **Fördelningen och beteendet vid blandade material behöver fortfarande spelmätas.** Modellens kö prioriterar inte längre ett material tills det är slut.

Fullt output-lager pausar hela ugnen och bevarar påbörjat arbete. Strömavbrott pausar arbetet. Tomgång ger aldrig extra produktionstid. De två matförbränningar som också syns i användarens RustClash-bild ingår ännu inte; deras exakta itempar behöver identifieras innan de läggs till.

## Industrial Crafter

Fyra blueprint-platser prioriteras från vänster till höger. Första receptet med rätt workbench och tillräckliga input-ingredienser väljs. Saknade ingredienser för ett tidigare blueprint hindrar inte ett senare giltigt recept. Ett blueprint förbrukas inte av crafting. Färdiga output-items kan inte användas som input utan att transporteras runt genom ett lager och en conveyor.

De fyra startvalen finns i komponentpanelen. Vanliga boxar kan få blueprint-exemplar via checkboxen i startlagerredigeraren. Dessa kan flyttas in och ut genom blueprint-portarna. Även blueprints utanför receptbiblioteket kan transporteras, men deras tillverkning stöds inte och ger statusmeddelande.

Tre recept stöds för tillverkning. Mängder och tider kommer från Facepunchs item-wiki, kontrollerad 2026-10-31:

| Recept                                                                  | Sats | Tier 1 | Tier 2 | Tier 3 |
| ----------------------------------------------------------------------- | ---- | ------ | ------ | ------ |
| [Gun Powder](https://wiki.facepunch.com/rust/item/gunpowder)            | 10   | 2 s    | 1 s    | 1 s    |
| [5.56 Rifle Ammo](https://wiki.facepunch.com/rust/item/ammo.rifle)      | 3    | —      | 3 s    | 1 s    |
| [Medical Syringe](https://wiki.facepunch.com/rust/item/syringe.medical) | 1    | —      | 10 s   | 5 s    |

Tabellen dokumenterar spelarens crafttider. Att tillämpa dem på craftern utgår från Industrial Update; aktuella workbench-upgrades, serverinställningar, startfördröjningar och tidsmultiplikatorer måste fortfarande jämföras i spelet. Full spelprecision på craftingtempo är inte fastställd.

Ingredienser och output-kapacitet kontrolleras före en atomär sats. Fullt lager eller strömavbrott pausar befintligt arbete utan att samla på sig tid. Om receptet inte längre är tillgängligt återställs dess framsteg. Produktion behandlas före transporter i varje steg, så en ny leverans inte får tid före ankomsten. Isolerad produktion kan hantera långa steg, men hela nätet ska köras med motorns fasta 250 ms eftersom transporter inte kompenserar för flera överhoppade cykler.

## Spelkontroll och återstående arbete

Följ [testscenarierna för Rust](GAME_CHECKS.md) för tider, blandade material, fulla lager och blueprint-prioritet. Modelltester kontrollerar reglerna ovan, inte vad en aktuell Rust-server faktiskt gör.

Återstående arbete omfattar fler recept, matförbränning, övriga ugnstyper, workbench-upgrades, återstående elkomponenter och mätning av transport- och signalbeteenden. Rust-filterexportens struktur och roundtrip är testade. Copy(JSON)/Paste(JSON), kategori-ID och blueprint-regler behöver även jämföras i ett körande Rust-spel.

## Exempel och referensläge

Kretsar från exempelbiblioteket kan bära en sparad guide och ett referensläge. Nih, BCN, NEXUS och Inline är kopplingsreferenser; motorn returnerar ingen simulerad effekt och gränssnittet spärrar start/stegning. Detta förhindrar att förenklad batteri- eller minneslogik presenteras som ett korrekt resultat. De egna förlagorna är testade mot appens nuvarande modell. Se [Exempelbibliotek](EXAMPLES.md).

## Lektionssignaler

Lektionsguider kan skicka tillfälliga testsignaler till särskilt utpekade energikällor. De ändrar inte den sparade kretsen och hanteras som köade steg med dt=0 i samma motor. Signaler kan därmed provas medan klockan är pausad utan att minnesceller återställs. Nivåbyte ändrar endast guide/fokus; det återställer inte motorn. Topologi och vanliga startinställningar återställer fortfarande simuleringen. Testsignaler och transient minne sparas inte. Se [lektionsdokumentationen](LESSONS.md).
