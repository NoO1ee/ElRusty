# ElRusty Live 0.6.5

Live är en separat tjänst för riktiga Rust+-enheter. Kretsbyggaren och dess simulering styr inga enheter i spelet. Tjänsten använder det inofficiella MIT-licensierade [rustplus.js](https://github.com/liamcottle/rustplus.js) och [discord.js](https://discord.js.org/); inga källkodsfiler har kopierats från EgorLis/Rustplusbot eller Smartrust.

## Starta på Windows

Node.js 24 och pnpm 11.25.0 krävs. Kör `pnpm install`, `pnpm build` och `pnpm start`. Startfilen `Start-ElRusty.cmd` bygger och kör också tjänsten. Öppna **http://127.0.0.1:5173**, samma adress som tidigare för att behålla tillgången till kretsar och filter i IndexedDB. Stäng andra ElRusty/Vite-processer på den porten först.

Utveckling: `pnpm dev` startar Vite på 5173 och Live-API på 5175. `pnpm dev:live` startar bara API:t. Båda lyssnar endast på 127.0.0.1. Vite förmedlar `/api/live` till tjänsten. Produktion använder ingen Vite-server.

Webbläsaren kan stängas efter konfiguration. Node-processen och datorn måste fortsätta köra och datorn får inte gå i vila. Återstart ansluter senast aktiva Rust-profil och startar en Discord-bot som tidigare aktiverats. Klicka Koppla från respektive Stoppa bot för att stänga av återstartsbeteendet.

## Guidad parning — rekommenderat

Öppna Live → Inställningar → Anslut med Rust+.

1. Klicka **Registrera Rust+**. Ett separat fönster i Brave, Chrome eller Edge öppnas för inloggning hos Steam/Facepunch. Återgå till ElRusty när steget är klart. Registreringen görs normalt en gång.
2. Klicka **Vänta på server**. Öppna spelet på rätt server och välj Esc → Rust+ → Pair with Server. Rust+-mobilappen behöver inte vara öppen.
3. En mottagen server visas som ett förslag med namn, adress och app.port. Klicka **Lägg till och anslut**. Ingen token kopieras till webbläsaren. En tidigare profil för samma adress, port och Steam-konto får sin parning uppdaterad.

Registrering och lyssning är två steg i samma flöde, inte två olika anslutningsmetoder. Flödet gör samma FCM/Expo/Rust+-registrering som bibliotekets CLI och sparar samma rustplus.config.json i den privata datakatalogen. Det kör inte godtyckliga terminalkommandon. Inloggningen använder en separat tillfällig webbläsarprofil med webbsäkerheten och sidisoleringen kvar. En liten WebView-brygga fångar enbart autentiseringssvaret från Facepunchs huvudkontext, inte Steam-lösenord. Ingen rå processutdata skickas till sidan eller loggas av tjänsten.

Status visas i vyn. Endast ett parningsjobb får köras åt gången. **Avbryt parning** stänger det egna jobbet och dess inloggningsfönster. Registrering avbryts efter fem minuter och lyssning efter tio; förslag giltiga i högst femton minuter sparas först efter ditt val. Fel eller avbrott bevarar tidigare registrering. Vid omstart behöver mottagningen startas igen.

På Windows väljs webbläsaren i ordningen explicit `CHROME_PATH`, Brave, Edge och sedan bibliotekets Chrome-upptäckt. Brave söks under LOCALAPPDATA, Program Files och Program Files (x86). Inloggningen använder alltid en tillfällig profil; din vanliga Brave-profil och dess inloggningar berörs inte.

Den guidade registreringen kräver Brave, Chrome eller Edge på den dator där tjänsten körs. På en Pi utan skrivbord: registrera på datorn, stoppa båda tjänsterna och flytta den privata rustplus.config.json-filen säkert till Pi:ns datakatalog. Därefter kan Vänta på server användas via SSH-tunneln. Kör inte två mottagare med samma registrering samtidigt.

FCM, Expo och Facepunch kan ändra sina tjänster; verklig inloggning och mottagning är fortfarande användarverifiering. Vid fel visar vyn vilket steg som misslyckades: FCM, Expo, inloggning, Rust+-registrering eller lokal sparning. Endast HTTP-status och tillåtna filfelkoder visas; råa svar och token exponeras inte. Låsta tillfälliga webbläsarfiler ger en separat varning och avbryter inte en mottagen inloggning. Förutsätter Rust PC med Rust+ aktiverat och nåbar app.port.

### Lägg in manuellt

Längst ner under Inställningar finns den hopfällda länken **Lägg in manuellt**. Där kan befintliga uppgifter fyllas i eller JSON med ip, port, playerId och playerToken importeras. SteamID64 måste vara en sträng med 17 siffror och playerToken ett signerat int32-tal. FCM-konfigurationen är inte samma sak som en serverprofil. app.port är inte spelport eller RCON-port. Facepunch-proxy kan väljas per profil. Token kan behöva förnyas efter wipe.

Para därefter Smart Switch / Smart Alarm / Storage Monitor i spelet och lägg till deras entity-ID under Enheter. Enhetens typ och behörighet verifieras mot Rust+.

## Enheter och lägen

Upp till 20 profiler sparas, med en aktiv anslutning och högst 100 registrerade enheter per profil. Byt namn och grupp på enheter i panelen. Grupper kör samma på/av-värde på samtliga switches; ett läge har individuella värden. Kommandon köas, läses tillbaka från Rust+ och får resultat per enhet. Lägen är inte atomiska: redan utförda ändringar återställs inte om en senare switch misslyckas. Vid frånkoppling avbryts köade kommandon och de återspelas inte.

Status via `entityChanged` uppdateras löpande efter verifiering. Teamstatus läses var 15:e sekund och vid teamändring; det är inte en exakt dödsnotifieringstjänst. Vid anslutningsfel visas tidigare information som inaktuell. Saknad verifiering spärrar styrning. Serverfel återansluts med ökande väntetid upp till 30 sekunder.

Smart Alarm-notiser utlöses vid false → true för en registrerad enhet. Initialt aktivt larm efter anslutning skickas inte som ett nytt larm. Notiser under avbrott kan missas; detta ersätter inte Rust+ mobilappens notiser. Senaste 500 händelser sparas; webbpanelen visar upp till 100 för aktiv server. Chatthistorik sparas inte.

## Teamchatt: !time

Alla medlemmar i Rust-teamet kan skriva `!time` (även det parade kontot). Prefix/suffix-blanksteg och stora/små bokstäver accepteras. Svar: `[ElRusty] Speltid: 18:42`, baserat på `getTime`, inte datorns klocka. Tiden visas i 24-timmarsformat, avrundad nedåt till hel minut.

Endast nya `teamMessage`-broadcasts behandlas; gammal chatthistorik hämtas inte. Händelser dedupliceras även vid automatisk återanslutning. Högst en fråga behandlas åt gången, med fem sekunders cooldown från svarstillfället. Egna botsvar är inte kommandon. Vid tidsfel ges ett kort fel om anslutningen fortfarande är aktiv. Inga chattsvar köas för återanslutning. Detta gäller teamchatt, inte global chatt.

## Discord

Skapa en separat bot i [Discord Developer Portal](https://discord.com/developers/applications). Använd installationsscopes `bot` och `applications.commands`. Ge View Channel och Send Messages i larmkanalen. Administrator och Message Content-intent behövs inte. Aktivera utvecklarläge i Discord för att kopiera server-, kanal-, roll- och användar-ID:n.

Spara token, Discord-server-ID, eventuell larmkanal och tillåtna användare/roller i Live → Inställningar. Starta boten uttryckligen. Kommandon registreras bara i den valda Discord-servern:

- `/status` och `/team` visar anslutning respektive teamstatus.
- `/switch enhet:<namn eller ElRusty-ID> pa:<true/false>` styr en switch.
- `/group namn:<grupp> pa:<true/false>` styr en grupp.
- `/mode namn:<namn eller ID>` aktiverar ett läge.

Alla kommandon kräver tillåten användare eller roll i rätt Discord-server, även läskommandon. Lägg till ditt eget ID; administratörer har ingen automatisk dispens. Namn måste vara unika för namnuppslagning, annars använd ElRusty-ID från enhetskortet. Svaren är privata (ephemeral). Larm skickas i vald kanal utan automatiska mentions. Ingen teamchatt reläas till Discord. Vid ändrad Discord-konfiguration stoppas boten och behöver startas igen.

## Lagring och lokal åtkomst

Live använder SQLite i `.private/live.sqlite` (eller `ELRUSTY_DATA_DIR`). Den innehåller parnings- och Discord-token i klartext för tjänstens användare: ingen kryptering i vila utlovas. Linux-katalogen får 0700 och databasfilen 0600. Windows använder mappens NTFS-behörigheter; använd en privat användarmapp och dela inte katalogen. `.private`, `.env` och parningskonfigurationen ignoreras av Git. Token skickas aldrig i status-API, SSE, vanliga krets-/filterbackuper eller råa felmeddelanden.

Webbtjänsten binds till loopback med Host/Origin-kontroll och CSRF-skydd för ändringar. Den är avsedd för datorns användare, inte som publik fleranvändartjänst. Behåll inte token i skärmbilder eller felrapporter. Ingen publik port, port forwarding eller CORS-öppning behövs för Discord.

För Live-backup: stoppa tjänsten och kopiera den privata datakatalogen säkert. Kopiera aldrig bara den öppna SQLite-filen utan dess WAL. Vanliga appbackuper innehåller bara kretsar/filter, inte Live-konfiguration. Tjänstens databas är versionsmärkt med SQLite user_version 1.

## Raspberry Pi Zero 2 W — förberett, inte hårdvaruverifierat

Använd 64-bitars Raspberry Pi OS Lite och Node.js 24 för Linux arm64, med en uppdaterad distribution som stöds av Node. Bygg på datorn. Överför `dist`, `server`, `shared`, `package.json`, `pnpm-lock.yaml` och `pnpm-workspace.yaml` och katalogen `patches` till `/opt/elrusty`; kör `pnpm install --prod --frozen-lockfile` på Pi:n. Kopiera inte Windows node_modules. Ingen webbläsare, Vite, Docker eller bildrendering behövs på Pi:n.

Skapa en tjänsteanvändare `elrusty` utan interaktiv inloggning, gör koden läsbar för användaren och installera `deploy/elrusty.service` i `/etc/systemd/system`. Kontrollera Node-sökvägen i ExecStart. Aktivera med `sudo systemctl enable --now elrusty`. Tjänsten får privat datalagring i `/var/lib/elrusty` och startar om vid processfel. Öppna panelen från datorn med `ssh -L 5173:127.0.0.1:5173 <pi-användare>@<pi-adress>` och besök localhost:5173. Stäng lokal ElRusty på samma port först.

Skapa en ny parning på datorn och registrera den på Pi:n via tunneln, eller flytta en stoppad privat databas med skyddade filrättigheter. Kör aldrig båda instanserna samtidigt med samma parning/bot. Kretsar och filter förblir i datorns webbläsare när samma origin används.

Före godkänd Pi-flytt: prova reboot/autostart, stängd webbläsare, nätavbrott, återanslutning och minst 24 timmars drift med avsedda enheter. Mät RSS med `systemctl status elrusty`/`ps` och kontrollera systemets lediga minne. Zero 2 W har 512 MB RAM; faktisk kapacitet, batteridrift och nätstabilitet har inte verifierats här.

## Leveransstatus och spelkontroll

Automatiska tester täcker adapteroberoende beteende, API-skydd och webbflöden. Ingen riktig Rust-server eller Discord-bot är parad i utvecklingstesterna. Följande måste därför verifieras av användaren innan funktionerna räknas som spelverifierade:

1. Anslut till din server, verifiera teamstatus och prova ogiltig token samt förnyad parning.
2. Registrera en Smart Switch och ett Smart Alarm. Styr från webben och jämför i spelet. Prova ett läge där en av switches inte är tillgänglig.
3. Starta Discord-boten i vald server och kanal. Kontrollera både tillåten och nekad användare/roll, samt ett riktigt larm.
4. Skriv `!time` från ditt parade konto och en lagkamrat. Jämför tiden med spelet och prova flera snabba kommandon.
5. Stäng webbläsaren och upprepa Discord, larm och `!time`. Bryt nätet och kontrollera att gamla kommandon inte återspelas.

Karta, BattleMetrics, scheman, automation, publika teamkonton och direkta kopplingar från simulerade kretsar till riktiga enheter ingår inte i 0.6.


### Protokollkompatibilitet i 0.6.4

En versionshanterad pnpm-patch för rustplus.js 2.5.0 gör AppInfo.queuedPlayers valfritt (samma uint32 och fältnummer 9). Detta motsvarar observerade servermeddelanden där köfältet utelämnas. Övriga obligatoriska fält behålls. Patchen fångar avkodnings- och protokolladdningsfel och rapporterar endast ELRUSTY_PROTOCOL, utan rådata. Adaptern stänger berörd anslutning och avbryter väntande anrop; Live visar ett protokollfel och försöker återansluta utan att återspela gamla kommandon.

Patchen i patches/ och dess hash i pnpm-lock.yaml måste följa med vid installation och Pi-flytt. Kör pnpm install --frozen-lockfile efter uppdatering. Inga profiler eller registreringar behöver raderas eller paras om.


### Teamnoteringar och återanslutning i 0.6.5

Patchen gör också AppTeamInfo.Note.type valfritt (int32, fältnummer 2). En läsande kontroll identifierade detta utelämnade fält på användarens server. Noteringarnas x/y förblir obligatoriska. Retry-räknaren återställs först efter 30 sekunders stabil anslutning; lyckad getInfo räcker inte för att återställa väntetiden.

Serverkontrollen visade också utelämnat AppTeamInfo.leaderSteamId (uint64, fältnummer 1). Det fältet är nu valfritt; tom teaminformation blir en tom teamlista, inte ett anslutningsfel. Inga ledar-ID:n eller spelvärden fabriceras.
