# Kontroll i Rust — ugn och crafter

Använd en vanilla-server utan ändrade hastigheter. Anteckna Rust-version, serverinställningar och eventuell workbench-upgrade. Detta är en checklista för jämförelse med modellen, inte redan genomförda speltester.

## Electric Furnace

1. Ge ugnen 3 rW. Kontrollera att den enbart har Power In bland de elektriska portarna.
2. Lägg minst 100 Metal Ore i **en** input-plats. Töm output före start. Efter 60 s förväntar modellen 30 Metal Fragments.
3. Upprepa med Sulfur Ore (60 Sulfur på 60 s) och High Quality Metal Ore (15 High Quality Metal på 60 s).
4. Lägg minst 100 Metal Ore i ena input-platsen och 100 Sulfur Ore i den andra. Modellens förväntan på 60 s är 15 Metal Fragments och 30 Sulfur. Jämför särskilt denna fördelning.
5. Lägg Metal Ore i båda input-platserna. Modellen förväntar fortfarande 30 Metal Fragments totalt på 60 s.
6. Fyll alla tre output-platser. Kontrollera att produktionen pausar och återupptas när en stack tas bort, utan att producera för tomgångstiden.
7. Bryt strömmen mitt i ett smältförlopp och slå på igen. Anteckna om delvis påbörjat arbete bevaras eller återställs.

Räkna färdiga items, inte minskningen i källboxen. Start- och stopptid nära spelets interna tick kan ge ett items skillnad. Testa utan conveyors först för att isolera ugnen.

## Industrial Crafter

1. Anslut ström och lägg in Gun Powder-blueprint, 20 Sulfur och 30 Charcoal. Kontrollera en sats om 10 Gun Powder och att blueprintet finns kvar.
2. Mät minst tio satser på varje tillåten workbench-nivå. Jämför med tabellen i [simuleringsmodellen](SIMULATION.md). Anteckna faktisk tid; bortse inte från en systematisk skillnad.
3. Sätt Gun Powder i första blueprint-platsen och 5.56 Rifle Ammo i nästa. Ge ingredienser till båda. Kontrollera att första möjliga receptet prioriteras, och att nästa används när det första saknar ingredienser.
4. Fyll de fyra output-platserna. Kontrollera att inga input-ingredienser försvinner medan output är fullt.
5. Koppla en conveyor till Blueprints In och en från Blueprint Out. Använd ett filter för ett blueprint och kontrollera att vanliga items av samma shortname inte följer med.
6. Kontrollera att Industrial Out endast tar färdiga items, inte input-ingredienser eller blueprints.

Rapportera scenario, faktisk tid, mängd och vad som skiljde sig. Resultaten används för att korrigera modellen innan den kallas spelverifierad.
