# Serverlistan — 0.20

Fliken **Servrar** fungerar oberoende av vald Rust+-profil. Europa visas från början. Sök på namn, välj region och kommande wipedag, ange minsta population och sortera efter flest/minst spelare, närmaste deklarerade wipe eller namn. Listan visar 50 servrar per sida. Filtren sparas i webbläsaren; ingen kontoanslutning krävs.

Wipedagsfiltret använder enbart källans explicit inrapporterade scheman. Ett schema som källan har upptäckt från tidigare wipes används inte som ett deklarerat datum. Servrar utan deklarerat schema visas fortfarande när **Alla wipedagar** är valt. Nästa kända datum för vald veckodag visas i kolumnen för kommande wipe; flera wipedagar per server stöds. Karta, BP och helwipe särskiljs. Alla datum och veckodagar visas i `Europe/Stockholm`, även när servern ligger i en annan region.

**Kopiera** kopierar `client.connect IP:spelport` till Rusts F1-konsol. Serverns spelport är inte dess Rust+-port. Att hitta en server skapar ingen Live-profil eller parning automatiskt; anslut i spelet och para via Rust+ som vanligt. Informationslänken öppnar källans sida för servern.

## Källa och licens

Data hämtas från [Wipe Board API](https://wipeboard.net/api), vars publika serverögonblicksbild är licensierad under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Wipe Board är en fristående källa. ElRusty normaliserar, filtrerar, sorterar och konverterar tiderna; egen programkod förblir MIT. Data ingår inte som en incheckad databas i repot. Källa, licens och bearbetning anges även i gränssnittet.

Provider: `https://wipeboard.net/api/servers`. Granskad 2026-11-04: snapshot innehöll cirka 11 800 servrar. Den kompakta raden använder bland annat `n`, `p`, `mp`, `rg`, `src` och `wipes`. `src=user` motsvarar det uttryckligt inrapporterade schemat. `query`/`detected` behandlas som uppskattningar. Schemaformatet verifierades mot källans läsbara v1-endpoint och [metodbeskrivning](https://wipeboard.net/how-it-works). Okända källvärden blir okända, aldrig deklarerade. Inga scheman härleds ur servernamn eller vår egen gissning om wipefrekvens.

Populationen är källans senaste observation, inte en direkt livefråga till varje spelserver. Källans uppdateringstid visas och siffrorna kan släpa efter. Wipe Board beskriver normalt 1–10 minuters uppdateringsintervall och täcker främst online-servrar. Ett deklarerat schema är inte en garanti för att serverägaren följer det.

## API och drift

`GET /api/servers` tar `q`, `region`, `day`, `minPlayers`, `sort` och `page`. Standardsökning: Europa, alla wipedagar, minst noll spelare, flest spelare och sida 1. Resultatet innehåller högst 50 normaliserade rader, totalt antal matchningar, sidor, tidsstämplar och flagga för inaktuell data. Filter och sortering sker över hela källdatamängden före sidindelningen.

Tjänsten delar en minnescache i fem minuter mellan alla sökningar och samlar samtidiga hämtningar i ett anrop. Webbvyn uppdaterar resultatet varje minut medan den visas. Inget hämtas när vyn inte används och cachen är tom. Vid källfel bromsas nya försök i en minut; eventuell tidigare lista behålls med varning. Mer än 15 minuter gammal källdata märks som potentiellt inaktuell.

Hämtningen går endast till den fasta HTTPS-adressen, tillåter inga omdirigeringar, begränsas till 15 sekunder och 24 MiB avkodat innehåll, och validerar radernas adresser, portar och fält. Host/Origin-skydd gäller även den lokala list-endpointen. Inga Rust+-token, Discord-token eller privata serverprofiler skickas till datakällan. Sökningar och filter skickas bara till ElRusty och tillämpas lokalt på den hämtade listan. Ingen ny SQLite-tabell eller migrering behövs.

Tester täcker deklarationsstatus, svensk veckodag vid midnatt, flera framtida datum, ogiltig data, sortering/sidindelning, cache, samtidighet, storleksgräns, säkra fel och API-skydd. Webbläsartester täcker EU-standard, filter, sparade val, kopierad anslutningsadress samt inaktuell data och återställning efter fel.
