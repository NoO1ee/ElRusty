# Simuleringsmodell 0.1

## Källor och verifieringsnivå

Itemnamn, shortnames, kategorier och stackstorlekar kommer från den installerade Rust-klientens itemdata; datum finns i `src/data/provenance.json`. Bilderna ligger lokalt i `public/items`.

Komponentdefinitioner länkar till sin dokumentationskälla. `documented` betyder att portarna har dokumentationsstöd; det betyder **inte** att alla tids- och signalbeteenden verifierats i spelet. `modelled` anger uttryckligen förenklade utökade komponentmodeller. Det finns ännu ingen `in-game verified`-nivå i denna version.

Grundkällor:

- https://wiki.rustclash.com/group=electrical
- https://rust.facepunch.com/news/industrial-update
- https://commits.facepunch.com/r/rust_reboot/main/industrial/inverse

## El

Motorn kör 250 ms tidssteg i en Web Worker. Inom steget beräknas kombinatoriska signaler tills de stabiliseras, med en begränsad iterationsbudget. Instabila slingor ger en varning, aldrig en obunden loop. Diagramgeometri och färger ingår inte i beräkningarna.

Solpanel: 20 rW, vind: 150 rW, generator: 40 rW. Batterier: 15, 50 eller 100 rW med ständig laddning. `Fully Charged` modelleras som en 1 rW-signal. Ingen vädermodell eller laddningskurva.

Branch reserverar sitt inställda värde och skickar resten till Power Out. Splitter fördelar mellan anslutna utgångar. AND kräver båda signalerna; OR väljer den högsta; XOR släpper endast en ensam signal. Förbrukare och conveyors drar sin angivna effekt före passthrough.

Timer och Memory Cell använder bevarat tillstånd och stigande signalflanker mellan tidssteg. Sensorer har manuell av/på-inmatning; den fysiska världen och antal spelare simuleras inte. Turret simulerar sin strömförbrukning, inte ammunition eller strid. Nätets aktuella topologi och inställningar återställer körningen när de ändras.

## Industrial

Boxkort inkluderar en Storage Adaptor. Virtuella lager är en mängd per shortname och använder motsvarande stackstorlek för platsberäkning. Skin, condition, separata blueprint-staplar och låsta slots är inte modellerade.

Conveyors går genom passiva splitters/combiners till behållare, med max sökdjup 32 och skydd mot nätverksslingor. En annan conveyor är en gräns, inte en passiv förbindelse.

Transportmodellen använder en femsekunderscykel och högst 128 items per itemslag och källbehållare per cykel. Detta är en deterministisk modell, **inte en verifierad reproduktion av spelets aktuella transporttempo eller portprioritet**. Buffers och fördelning till flera mål kan skilja sig från spelet. Anpassning efter in-game-mätning är återstående arbete.

Min lämnas kvar i källan, Max stoppar vid målets gräns, Buffer kräver en minsta sats. Require All kräver tillgängliga items för varje regel; Exclude stoppar matchande items. Filter Pass/Fail uppdateras utifrån den senaste transportcykeln. Blueprint-regler kan exporteras men är inte modellerade i virtuella lager.

Elektrisk ugn har en förenklad modell som omvandlar en malm varannan sekund med förbrukning på 3 rW. Endast metal.ore, sulfur.ore och hq.metal.ore stöds. Tempo, antal samtidiga slots och slotfördelning är inte spelverifierade.

Crafter stöder ett begränsat receptbibliotek: Gun Powder, 5.56 Rifle Ammo och Medical Syringe. Workbench-nivån valideras; recept och blueprint väljs manuellt. Blueprint-portar och flera samtidiga blueprints är ännu inte implementerade i simuleringen. Tids- och mängduppgifterna behöver in-game-jämförelse.

## Fortsatt verifiering

Nästa grupper är återstående sensorer och signalkomponenter, full slot- och blueprint-logistik, fler ugnar och crafters samt hela katalogens beteenden. Utökningar ska få källhänvisning, modelltester och spelscenarier innan de markeras som spelverifierade.

Rust-filterformatets fältnamn och roundtrip är automatiskt testade. Actual Copy(JSON)/Paste(JSON), category-ID och Blueprint måste också jämföras med en aktuell Rust-server för att exporten ska räknas som spelverifierad.
