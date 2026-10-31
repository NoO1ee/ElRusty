# Ändringslogg

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
