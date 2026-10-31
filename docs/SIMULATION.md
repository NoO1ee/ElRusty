# Simuleringsmodell 0.2

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

Elektrisk ugn förbrukar 3 rW. Dokumenterade tider per malm: metal.ore → metal.fragments 2 s, sulfur.ore → sulfur 1 s, hq.metal.ore → metal.refined 4 s. Varje omvandling ger ett item. Ingen bränsleförbrukning eller charcoal. Källan är [Facepunchs Electric Furnace-tabell](https://wiki.facepunch.com/rust/item/electric.furnace), kontrollerad 2026-10-31.

**Modellgräns:** ugnen har en seriell produktionskö, väljer första tillgängliga malmen i lagret och delar lagrets platsbudget mellan in- och utmatning. Spelets samtidiga input-slots, blandade malmers fördelning och separata output-slots är ännu inte återskapade. Burkar och honeycomb ingår inte.

Crafter stöder tre recept, med mängder, ingredienser och tier-specifika tider kontrollerade mot Facepunchs item-wiki 2026-10-31:

| Recept                                                                  | Sats | Tier 1 | Tier 2 | Tier 3 |
| ----------------------------------------------------------------------- | ---- | ------ | ------ | ------ |
| [Gun Powder](https://wiki.facepunch.com/rust/item/gunpowder)            | 10   | 2 s    | 1 s    | 1 s    |
| [5.56 Rifle Ammo](https://wiki.facepunch.com/rust/item/ammo.rifle)      | 3    | —      | 3 s    | 1 s    |
| [Medical Syringe](https://wiki.facepunch.com/rust/item/syringe.medical) | 1    | —      | 10 s   | 5 s    |

Workbench-nivån valideras. Ett manuellt recept motsvarar ett insatt blueprint; blueprint-portar transporterar inte vanliga material. Fysiska blueprints, flera blueprint-slots och separata input/output-slots är fortfarande inte modellerade. Kopplingen mellan spelarens dokumenterade crafttider och craftern följer [Facepunchs Industrial Update](https://rust.facepunch.com/news/industrial-update); eventuell nutida serverspecifik avvikelse behöver mätas i spelet.

### Produktionstid och lager

Tomgång, saknade ingredienser, för låg workbench och fullt utmatningslager bygger inte upp tid. Ett strömavbrott pausar redan påbörjad produktion. Varje sats är en atomär transaktion: alla ingredienser och slutlig kapacitet kontrolleras före förbrukning. En ingrediensplats som frigörs får i den delade lagermodellen användas för resultatet. Startlager kan fortfarande innehålla valfria items, men inkommande conveyors accepterar enbart malm respektive ingredienser till valt recept.

Produktion behandlas före transporter i varje tidssteg; en leverans vid stegets slut får därför inte tillgodoräkna sig tid före ankomsten. Produktionskön hanterar flera färdiga satser och bevarar resttid. Isolerad produktion ger samma resultat vid ett långt tidssteg som flera korta; hela transportnätet ska köras med motorns fasta 250 ms-steg eftersom transportdelen inte kompenserar för flera överhoppade cykler.

Automatiska regressionstester täcker malmtider, tier-tider, stora/små produktionssteg, strömavbrott, tomgång, fulla lager, frigjorda lagerplatser, saknade ingredienser, blueprint-portgränser och ogiltiga backup-inställningar. Dessa verifierar modellen, inte ett körande Rust-spel.

### Reproducerbar kontroll i Rust

På en vanilla-server: kör enbart en malmtyp åt gången i Electric Furnace med 3 rW; mät 30 metal, 30 sulfur respektive 15 HQM under 60 s. Testa därefter blandade malmer, fulla output-slots och strömavbrott separat. För Crafter: sätt in respektive blueprint och material till minst tio satser, mät på tillåtna workbench-nivåer mot tabellen ovan. Anteckna serverversion, eventuella multipliers, antal producerade satser och faktisk tid. Slot- och pausregler kan först markeras spelverifierade när dessa observationer jämförts med modellen.

## Fortsatt verifiering

Nästa grupper är återstående sensorer och signalkomponenter, full slot- och blueprint-logistik, fler ugnar och crafters samt hela katalogens beteenden. Utökningar ska få källhänvisning, modelltester och spelscenarier innan de markeras som spelverifierade.

Rust-filterformatets fältnamn och roundtrip är automatiskt testade. Actual Copy(JSON)/Paste(JSON), category-ID och Blueprint måste också jämföras med en aktuell Rust-server för att exporten ska räknas som spelverifierad.
