# Ändringslogg

## 0.2.0 — 2026-10-31

- Elektrisk ugn: separata dokumenterade tider för metal, sulfur och HQM.
- Industrial Crafter: receptmängder och workbench-tider hämtade från Facepunchs wiki. Rifle Ammo rättat från 10 s till 3 s på tier 2; tier 3 tar 1 s.
- Produktion hanterar flera satser, resttid och strömavbrott. Tomgång, fulla lager och saknade ingredienser ger ingen sparad produktionstid.
- Atomär ingrediensförbrukning och platskontroll efter förbrukning; inga förlorade ingredienser vid fullt lager.
- Komponentpanelen visar produktionsstatus, ingredienser, satstider och källor.
- Vanliga material kan inte gå genom crafterns blueprint-portar.
- Backup avvisar okända crafter-recept och ogiltig workbench.

Fortsatta begränsningar: seriell smältkö, gemensam lagerbudget, tre crafter-recept, manuellt blueprint och ingen spelverifiering. Se [simuleringsmodellen](docs/SIMULATION.md).
