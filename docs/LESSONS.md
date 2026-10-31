# Logiklektioner 0.5

Under **Exempelbyggen → Logik** finns fem förlagor med märkningen **Alla nivåer**: OR Switch, Memory Cell, Blocker, XOR Switch och AND Switch. Varje förlaga är ett enda kretsbygge med tre separata områden: Grund, Mellan och Avancerad. Biblioteket har totalt 14 förlagor.

Nivåknapparna fokuserar motsvarande område utan att flytta komponenterna. Guiden kan döljas medan nivåknapparna finns kvar. Komponenter och kablar kan fortfarande placeras och redigeras fritt. Områdesramarna är vägledning, inte hinder eller ett rutnät.

## Innehåll

| Komponent   | Grund                                  | Mellan                        | Avancerad                                                               |
| ----------- | -------------------------------------- | ----------------------------- | ----------------------------------------------------------------------- |
| OR Switch   | A eller B tänder en lampa              | Tre alternativa utlösare      | Alternativa matningar med gemensam servicespärr                         |
| Memory Cell | Set, Reset och två utgångsindikeringar | Toggle på stigande kant       | Två larmutlösare, återställning och tyst service utan att radera minnet |
| Blocker     | Matning och separat spärrsignal        | Två oberoende spärrar i serie | Tillstånd krävs samtidigt som nödstopp och felstatus är av              |
| XOR Switch  | Exakt en aktiv ingång                  | Tvåvägsstyrning med tillstånd | Jämför två zoner som vardera kräver två villkor                         |
| AND Switch  | Två samtidiga krav                     | Tre krav via två AND Switch   | Sensor A eller B samt gemensamt tillstånd                               |

Varje guide visar vad komponenten gör, varför den används, en övning och en signalbild med verkliga portvärden från appens simuleringsmotor. OR/AND/XOR har sanningstabeller, Blocker skiljer matning från spärrsignal och Memory Cell visar minnesregler samt lagrat tillstånd. En separat resultatindikering följer nivåns lampa; i avancerade kombinationer kan den därför skilja sig från den studerade komponentens direkta utgång.

Grundexemplen jämför 20 och 40 rW. OR och AND ger högst 40 rW, inte 60. XOR ger noll när båda ingångarna har ström. Block-signalen matar inte Blockerns utgång. Minnescellens Power In är separat från dess styrsignaler.

## Testsignaler och sparning

Testknapparna i guiden styr lektionens utpekade signalkällor. Händelser skickas i ordning till Web Workern som tidssteg på 0 sekunder. Det innebär att portvärden och minne uppdateras även när klockan är pausad, utan att produktionstid skapas eller körningen återställs. Set kan släppas utan att radera minnet; Toggle växlar bara på en av→på-kant. Köade händelser försvinner vid en full återställning.

Testsignaler ändrar inte kretsens startinställningar och sparas inte. Simulerat minne återställs när bygget återöppnas. Kopplingar, rollnamn, områden, vald nivå och arbetsytans position följer däremot med i lokal sparning och backup. Vid redigering av vanliga komponentinställningar eller topologi gäller den tidigare regeln: hela simuleringskörningen återställs.

## Källor och begränsningar

Komponenternas grundfunktioner är kontrollerade mot Facepunchs dokumentation:

- [AND Switch](https://wiki.facepunch.com/rust/item/electric.andswitch)
- [OR Switch](https://wiki.facepunch.com/rust/item/electric.orswitch)
- [XOR Switch](https://wiki.facepunch.com/rust/item/electric.xorswitch)
- [Blocker](https://wiki.facepunch.com/rust/item/electric.blocker)
- [Memory Cell](https://wiki.facepunch.com/rust/item/electrical.memorycell)

Layouter, övningar och kombinationer är ElRustys egna pedagogiska exempel. De är modelltestade, inte spelverifierade. Lektionerna lär ut signalvillkor och minnesfunktion; de visar inte fysisk sensordetektering, batteridrift eller full Rust-effektförbrukning. Prova Memory Cell-signaler separat: samtidiga Set/Reset/Toggle-signaler och spelets prioritetsregler ingår inte i undervisningen.

## Kod och kontroll

Varje komponent har en egen fil i `src/data/lessons`, med tre nivåer i samma förlaga. En gemensam byggfunktion hanterar layout, portar och sparade områdesdata. Inga separata kretsfiler behövs per nivå.

Domäntester provar samtliga signalkombinationer för OR/AND/XOR/Blocker på alla nivåer. Memory Cell testas med händelsesekvenser för Set, Reset, Toggle och service-spärr. Övriga kontroller täcker giltiga portar, skilda områden, nya ID:n, backup och att testsignaler inte skriver över inställningar. Webbläsartester kontrollerar signalbild, resultatlampa, minnesretention och sparat nivåval.
