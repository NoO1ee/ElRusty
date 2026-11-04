# Rust+-registrering med Brave och Pi

Registreringen öppnar Brave, Chrome eller Edge på **datorn där ElRusty-tjänsten körs**. En dashboard som visas via SSH-tunnel till en Pi kan inte öppna Brave på Windows-datorn. Pi utan skrivbord visar därför en förklaring och spärrar registreringsknappen; mottagning av parningar fungerar ändå på Pi:n.

Har du redan registrerat Rust+ på Windows finns registreringen i `.private/rustplus.config.json`. Den kan återanvändas på din egen Pi utan ny Steam-inloggning. Filen innehåller privata token. Överför den endast till en betrodd dator, via SSH, aldrig via Git eller chatt. Stoppa mottagningen innan filen byts och kör inte två mottagare med samma registrering samtidigt.

På Pi ligger filen i `/var/lib/elrusty/rustplus.config.json`. Bevara eventuell tidigare fil som privat säkerhetskopia, använd ägare `elrusty:elrusty` och filrättighet `600`, och starta om tjänsten efter överföringen. Serverprofiler, enheter, lägen och timers lagras separat och ska behållas.

Efteråt öppnar du Live → Inställningar → Rust+-parning och kontrollerar att mottagningen körs. Para servern i Rust med Esc → Rust+ → Pair with Server. Smart Switches paras i spelet och visas som förslag under Enheter.

Om en helt ny registrering behövs görs den i en lokal ElRusty-tjänst på Windows-datorn med Brave, Chrome eller Edge. Windows väljer fortfarande `CHROME_PATH`, sedan Brave, Edge och Chrome. Inloggningen använder en separat tillfällig profil. Dina vanliga Brave-inloggningar berörs inte.
