# Exempelbibliotek 0.5

Fliken **Exempelbyggen** innehåller 14 förlagor. Sök på namn eller filtrera efter kategori och ursprung. **Öppna egen kopia** sparar först det pågående bygget och skapar sedan en krets med nya ID:n. Redigering ändrar varken biblioteket eller tidigare sparningar. Guiden, källan, rollnamnen och kabeldata följer med i lokal sparning och JSON-backup.

## Kopplingsreferenser

- **Nih Core:** topologi och Branch-värden från handbokens aktuella variant. Tillskriven Nih; handboken sammanställd av SwiftCoyote och communityn. [Källa](https://www.rustrician.io/handbook/#Nih%20Core).
- **BCN Core:** återgiven efter handbokens schema och anslutningsbeskrivning. Tillskriven SwiftCoyote. [Källa](https://www.rustrician.io/handbook/#BCN%20Core).
- **NEXUS Core:** 24 komponenter och 32 riktade anslutningar från [den publikt delade krets som användaren länkade](https://www.rustrician.io/?circuit=36f93e0d67cc7a2c6cb29ea948a7cfae), hämtad 2026-10-31. Exporten anger ingen upphovsperson. Två kanter hade omvänd lagringsriktning i XML; de normaliserades efter portarnas in/out-typ. Portnamn översätts till ElRustys motsvarande portnamn. Topologi och Branch-värden bevaras, medan layout och kabelvägar ritas om. De ursprungliga vindvärdena 75 rW anges i rollnamnen; laddningsögonblick och andra simulerade värden importeras inte.
- **Inline Backup:** enkel seriematning genom ett batteri, ritad som en egen layout. [Källa](https://www.rustrician.io/handbook/#Inline%20Backup).

Handbokens eget NEXUS-avsnitt innehöll bara Coming Soon vid genomgången. Bibliotekets NEXUS kommer därför från den separata delade kretsen, inte från det tomma avsnittet.

Simuleringen är avstängd för dessa fyra referenser både i gränssnittet och i motorn. Appens ständigt laddade batterier och förenklade Memory Cell-/effektregler räcker inte för att återge kärnornas drift, förbrukning eller batterifel korrekt. Referensläge sparas även efter omladdning och backup. Kort visas neutralt i stället för att få felaktiga strömvarningar.

Inga bilder eller programfiler från Rustrician distribueras i appen. Förhandsvisningarna ritas från ElRustys komponentdata med appens befintliga Rust-itembilder. Originalkällorna är länkade vid respektive förlaga.

## Egna exempel

| Förlaga                                | Syfte                                                                            | Modelltest                                             |
| -------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Reservkraft med prioriterad last       | OR-val mellan huvud- och reservmatning, 40 rW reserverat för tre kritiska laster | Huvudmatningsfel, reservmatning och totalt avbrott     |
| Låsande larm med manuell återställning | Memory Cell med sensor på Set och manuell brytare på Reset                       | Händelse, bevarat tillstånd och reset-signal           |
| Tidsstyrd servicebelysning             | Fem sekunders Timer med stigande startsignal                                     | Start och utgången tid med kvarvarande hög startsignal |
| Automatisk smältlinje                  | Separat el till två conveyors och en ugn, med råvaru- och färdiglager            | Transport, omvandling och bibehållen materialmängd     |
| Två fristående elsektorer              | Lokal brytare och batteri per sektor                                             | En frånkopplad sektor påverkar inte den andra          |

**Modelltestad gäller bibliotekets förlaga**, inte varje redigerad kopia eller ett körande Rust-spel. Alltid laddade batterier innebär att en släckt solpanel inte tömmer batteriet. Sensorer styrs manuellt. Ändrade komponentinställningar återställer hela körningen; prov av bibehållet logiktillstånd mellan händelser görs i motortesterna, medan gränssnittet visar signalerna från den nya startkonfigurationen. Guiderna redovisar detta.

Branch tillåter nu 1 rW i editor, validering och motor. [Facepunch commit #95561](https://commits.facepunch.com/TomButters/rust_reboot?p=1285) dokumenterar sänkningen från 2 till 1. Befintliga inställningar ändras inte.

## Kontroll

Tester validerar alla förlagors komponenter, portar, unika anslutningar och kortplacering utan överlapp. De kontrollerar också oberoende kopior, referensskydd, guide-/källvalidering och backup. Webbläsartester täcker sökning, kategori/ursprung, NEXUS, avstängd referenssimulering samt sparning av ett nyligen ändrat bygge innan en ny förlaga öppnas.

## Pedagogiska logikbyggen

Version 0.5 lägger till fem förlagor för OR, Memory Cell, Blocker, XOR och AND, vardera med tre avskilda nivåer i samma krets. Guiden har live-signaler, komponentförklaring, användningsfall och visualisering. Se [Logiklektioner](LESSONS.md).
