# ElRusty Live 0.6

Live är en separat tjänst för riktiga Rust+-enheter. Kretsbyggaren och dess simulering styr inga enheter i spelet. Tjänsten använder det inofficiella MIT-licensierade [rustplus.js](https://github.com/liamcottle/rustplus.js) och [discord.js](https://discord.js.org/); inga källkodsfiler har kopierats från EgorLis/Rustplusbot eller Smartrust.

## Starta på Windows

Node.js 24 och pnpm 11.25.0 krävs. Kör `pnpm install`, `pnpm build` och `pnpm start`. Startfilen `Start-ElRusty.cmd` bygger och kör också tjänsten. Öppna **http://127.0.0.1:5173**, samma adress som tidigare för att behålla tillgången till kretsar och filter i IndexedDB. Stäng andra ElRusty/Vite-processer på den porten först.

Utveckling: `pnpm dev` startar Vite på 5173 och Live-API på 5175. `pnpm dev:live` startar bara API:t. Båda lyssnar endast på 127.0.0.1. Vite förmedlar `/api/live` till tjänsten. Produktion använder ingen Vite-server.

Webbläsaren kan stängas efter konfiguration. Node-processen och datorn måste fortsätta köra och datorn får inte gå i vila. Återstart ansluter senast aktiva Rust-profil och startar en Discord-bot som tidigare aktiverats. Klicka Koppla från respektive Stoppa bot för att stänga av återstartsbeteendet.

## Parning

1. Kör på datorn, från projektmappen:
   ```sh
   pnpm exec rustplus fcm-register --config-file .private/rustplus.config.json
   pnpm exec rustplus fcm-listen --config-file .private/rustplus.config.json
   ```
   Det första kommandot öppnar Steam/Facepunch-inloggningen genom bibliotekets parningsverktyg. Det andra lyssnar på parningsnotiser. Detta är ett externt verktyg, inte en funktion som körs automatiskt av ElRusty.
2. Öppna spelet på din server: Esc → Rust+ → Pair with Server. Servern måste ha Rust+ aktiverat och dess app.port måste vara nåbar. Rust Console stöds inte.
3. Kopiera JSON-kroppen med `ip`, `port`, `playerId` och `playerToken` till Live → Inställningar → Importera parningsuppgifter. En yttre `body` med samma JSON stöds också. FCM-konfigurationsfilen är inte samma sak som serverparningen och kan inte importeras som serverprofil.
4. Spara profilen och anslut. Serverinformation hämtas för att kontrollera autentiseringen innan styrning blir tillgänglig. `playerId` måste vara en sträng med 17 siffror. Token är ett signerat int32-tal. app.port är inte spelport eller RCON-port.
5. Para Smart Switch / Smart Alarm / Storage Monitor i spelet. Lägg till deras entity-ID under Enheter. Vid behov kan entity-ID hittas via spelets combatlog efter att enheten skadats. ElRusty verifierar typ och behörighet med `getEntityInfo`; den skannar inte servern efter enheter.

Steam-inloggning sker utanför ElRusty; appen efterfrågar aldrig Steam-lösenord. FCM/Facepunch kan ändra parningsflödet: om CLI-verktyget misslyckas krävs felsökning mot dess aktuella dokumentation. Manuell registrering av redan erhållna serveruppgifter fungerar oberoende av CLI:t. Facepunch-proxy kan väljas per profil om direktanslutning inte fungerar. Token kan behöva förnyas efter wipe eller serverändring.

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

Använd 64-bitars Raspberry Pi OS Lite och Node.js 24 för Linux arm64, med en uppdaterad distribution som stöds av Node. Bygg på datorn. Överför `dist`, `server`, `shared`, `package.json`, `pnpm-lock.yaml` och `pnpm-workspace.yaml` till `/opt/elrusty`; kör `pnpm install --prod --frozen-lockfile` på Pi:n. Kopiera inte Windows node_modules. Ingen webbläsare, Vite, Docker eller bildrendering behövs på Pi:n.

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
