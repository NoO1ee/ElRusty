# ElRusty Live 0.8.0

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

Para därefter Smart Switch / Smart Alarm / Storage Monitor i spelet. Från 0.13 visas förslag med namn och Entity-ID under Live → Enheter; klicka Lägg till för serververifiering. Manuell inmatning av Entity-ID finns kvar.

## Enheter och lägen

Upp till 20 profiler sparas, med en aktiv anslutning och högst 100 registrerade enheter per profil. Byt namn och grupp på enheter i panelen. Grupper kör samma på/av-värde på samtliga switches; ett läge har individuella värden. Kommandon köas, läses tillbaka från Rust+ och får resultat per enhet. Lägen är inte atomiska: redan utförda ändringar återställs inte om en senare switch misslyckas. Vid frånkoppling avbryts köade kommandon och de återspelas inte.

Status via `entityChanged` uppdateras löpande efter verifiering. Teamstatus läses var femte sekund och vid teamändring; det är inte en exakt dödsnotifieringstjänst. Vid anslutningsfel visas tidigare information som inaktuell. Saknad verifiering spärrar styrning. Serverfel återansluts med ökande väntetid upp till 30 sekunder.

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

Automatiska tester täcker adapteroberoende beteende, API-skydd och webbflöden. En separat läsande kontroll har hämtat riktig serverkarta och markörer. Automatiska tester använder lokala fixtures; verklig Discord och skrivande spelkommandon återstår att kontrollera. Följande måste därför verifieras av användaren innan funktionerna räknas som spelverifierade:

1. Anslut till din server, verifiera teamstatus och prova ogiltig token samt förnyad parning.
2. Registrera en Smart Switch och ett Smart Alarm. Styr från webben och jämför i spelet. Prova ett läge där en av switches inte är tillgänglig.
3. Starta Discord-boten i vald server och kanal. Kontrollera både tillåten och nekad användare/roll, samt ett riktigt larm.
4. Skriv `!time` från ditt parade konto och en lagkamrat. Jämför tiden med spelet och prova flera snabba kommandon.
5. Stäng webbläsaren och upprepa Discord, larm och `!time`. Bryt nätet och kontrollera att gamla kommandon inte återspelas.

BattleMetrics, scheman, automation, publika teamkonton och direkta kopplingar från simulerade kretsar till riktiga enheter ingår inte.


### Protokollkompatibilitet i 0.6.4

En versionshanterad pnpm-patch för rustplus.js 2.5.0 gör AppInfo.queuedPlayers valfritt (samma uint32 och fältnummer 9). Detta motsvarar observerade servermeddelanden där köfältet utelämnas. I 0.11.1 utökas patchen även för spelarantal, se nedan. Övriga obligatoriska fält behålls. Patchen fångar avkodnings- och protokolladdningsfel och rapporterar endast ELRUSTY_PROTOCOL, utan rådata. Adaptern stänger berörd anslutning och avbryter väntande anrop; Live visar ett protokollfel och försöker återansluta utan att återspela gamla kommandon.

Patchen i patches/ och dess hash i pnpm-lock.yaml måste följa med vid installation och Pi-flytt. Kör pnpm install --frozen-lockfile efter uppdatering. Inga profiler eller registreringar behöver raderas eller paras om.


### Teamnoteringar och återanslutning i 0.6.5

Patchen gör också AppTeamInfo.Note.type valfritt (int32, fältnummer 2). En läsande kontroll identifierade detta utelämnade fält på användarens server. Noteringarnas x/y förblir obligatoriska. Retry-räknaren återställs först efter 30 sekunders stabil anslutning; lyckad getInfo räcker inte för att återställa väntetiden.

Serverkontrollen visade också utelämnat AppTeamInfo.leaderSteamId (uint64, fältnummer 1). Det fältet är nu valfritt; tom teaminformation blir en tom teamlista, inte ett anslutningsfel. Inga ledar-ID:n eller spelvärden fabriceras.


## Livekarta 0.7

Karta visar serverns JPEG med separata SVG-lager för koordinatrutor, monument, team, vending machines och event. Kartbilden hämtas vid öppning och cachelagras i minnet för aktuell server/wipe. Team och markörer läses var femte sekund. Vid avbrott markeras data som inaktuell; serverbyte rensar kartan. Markörer som försvinner beskrivs enbart som inte längre synliga, aldrig som bekräftat förstörda. Statuspricken på Live-fliken följer anslutningen även i kretsbyggaren. Grön = Rust+ anslutet, gul = ansluter/återansluter, röd = frånkopplat eller lokal tjänst saknas.


## Automatisk Discord-setup 0.8

Spara bottoken och tillåtna användare/roller. Hämta Discord-servrar, välj server och förhandsvisa kanalsetupen. Knappen Skapa ElRusty-kanaler skapar en privat kategori med status, larm, events, aktivitet, styrning och teamchat. Bot-ID hämtas automatiskt; botregistrering och inbjudan görs i Discord. Boten behöver Manage Channels, Manage Roles för åtkomstinställningar, View Channel, Send Messages, Read Message History och Embed Links. Administrator behövs inte. Serveradministratörer kan alltid se kategorin enligt Discords regler.

ElRusty sparar ID:n efter varje lyckat skapande. Upprepad setup återanvänder registrerade resurser; främmande kanaler med samma namn tas inte över eller raderas. Ändrar du listan över tillåten åtkomst måste setupen köras igen innan nya utskick till hanterade kanaler tillåts. Vid delvis API-fel kan setupen fortsätta utan att tidigare lyckade steg upprepas. Teamchat-kanalen används av den valbara chattkopplingen i 0.9.


## Teamkommandon och tvåvägschatt 0.9

I Rusts teamchatt: !time, !help, !pop, !where <namn/SteamID>, !events, !switch <namn/ID> on/off, !group <namn> on/off, !mode <namn/ID>, !makeleader. !team läggs inte till. Kommandon matchas utan hänsyn till skiftläge. Namn med mellanslag fungerar, tvetydiga namn kräver ID. !switch accepterar både ElRusty-ID och entity-ID. Högst ett pågående kommando och fem sekunder mellan svar; alla hjälp-/resultatdelar skickas som begränsade textstycken.

Läskommandon är tillgängliga för aktuell teamlista. Styrning kräver parade kontots SteamID eller ett uttryckligen tillåtet SteamID under Live → Inställningar → Kommandon och behörigheter, per serverprofil. Skrivkommandon kontrollerar färsk teaminformation och använder webbens kö och serverbekräftelser. !makeleader kontrollerar att parade kontot är ledare och läser tillbaka nytt ledarskap; ingen annan spelares parning används. Ett nekat eller obekräftat byte bekräftas aldrig som lyckat. Kö i !pop visas bara om fältet skickas av Rust+. !events beskriver synliga markörer, inte bekräftade nedskjutningar.

Efter kanalsetup kan **Aktivera tvåvägschatt** slås på i guiden. Aktivera först Message Content Intent under Bot i [Discord Developer Portal](https://discord.com/developers/applications). Saknad behörighet pausar chatten och startar om övriga botfunktioner utan detta intent. Felet visas i guiden; aktivera intent och starta boten igen. [Discords intent-dokumentation](https://docs.discord.com/developers/events/gateway#message-content-intent).

Rust-meddelanden från teamet skickas som Namn: text till #teamchat. Kända kommandon och botsvar vidarebefordras inte. Tillåtna Discord-användares text skickas som [Discord] Namn: text. Bot-/webhookmeddelanden, dubbletter, gamla Discord-händelser efter återanslutning, bilagor och egna ekon ignoreras. Mentions neutraliseras; råtext och chatt lagras inte i historiken. Vardera riktningen har en begränsad kö (20 meddelanden, en sekund mellan sändningar), som släpper väntande innehåll vid avbrott. Discord→Rust begränsas till 120 Unicode-tecken inklusive avsändare; Rust→Discord till 500 tecken plus namn. Full kö släpper överskott, ingen senare återspelning.

Spel-/kontokontroll återstår: jämför kartrutor med Rust, skapa kanaler i vald Discord-server, prova larm och chatt från tillåten/nekad användare samt !makeleader på ditt riktiga team. Implementationen använder Rust+-protokollet självständigt, utan kopierad Rust++-kod. [Rust+-bibliotekets protokoll](https://github.com/liamcottle/rustplus.js/blob/master/rustplus.proto).


### Rust+-liknande kartvy 0.9.1

Kartan har flytande lager- och zoomreglage, nordindikator och utökat läge (Esc stänger). Monument visas med engelska namn; överlappande namn glesas ut och fler får plats när du zoomar. Teamnamn visas ovanför gröna/grå markörer, butiker har butikssymbol och event har separata symboler. Symbolerna är ritade i ElRusty; ingen kod eller grafik från Rust+-appen har kopierats. Kartbilden och positionerna kommer fortfarande från den parade servern. Referens: [Facepunchs officiella Rust+-kartvy](https://rust.facepunch.com/companion).


### Dödsfall och spelmarkörer 0.9.2

Teammedlemmars tillståndsfält x/y, isOnline, spawnTime, isAlive och deathTime är valfria i kompatibilitetspatchen. Nyare proto3-meddelanden kan utelämna noll/falskvärden; det äldre bibliotekets required-fält kunde därför utlösa protokollfel vid död. Identitetsfälten steamId/name förblir obligatoriska. Saknade koordinater blir okända, aldrig en påhittad punkt vid 0,0. Trasiga protobuf-meddelanden stänger fortfarande berörd anslutning. Protokollfel får enbart kompletteras med ett verifierat schemafältnamn, utan meddelandets innehåll.

Kartan har lager för **Waypoints** och **Senaste dödsplats**. Personliga mapNotes och ledarens leaderMapNotes läses med teaminformationen; när ditt konto är ledare undviks dubbletter. Noteringarnas icon (5), colourIndex (6) och label (7) stöds i protokollet. En egen nål med dödskalleikon räknas inte automatiskt som dödsplats. Bara de noteringar Rust+ skickar kan visas; övriga lagkamraters privata nålar och tillfälliga pingar garanteras inte.

Egen dödsnotering (typ 2) används i första hand. Saknas den används position från ett observerat dödsfall eller den föregående teamuppdateringen, märkt **ungefärlig**. En redan återspawnad spelares nuvarande position används aldrig som historisk dödsplats. Ingen historisk plats gissas vid första anslutning. Senaste observerade platsen sparas i den privata lokala konfigurationen, isolerad per profil och wipe. Den försvinner inte när du återspawnar. Ny server/wipe visar inte den gamla platsen.

Källor för protokollfakta: [aktuell proto3-definition](https://github.com/olijeffers0n/rustplus/blob/master/rustplus.proto) och [SDK-fält för kartnoteringar](https://github.com/HandyS11/RustPlusApi/blob/develop/src/RustPlusApi/Protobuf/RustPlusContracts.proto). Funktionerna är självständigt implementerade. Läsande kontroll mot användarens server bekräftar en personlig waypoint; det exakta meddelandet vid nästa dödsfall återstår att verifiera på den riktiga servern. Regressionstester skickar utelämnade medlemsfält i både svar och dödsbroadcast och kontrollerar fortsatt anslutning.


## Läskommandon 0.10

Alla aktuella teammedlemmar får använda följande kommandon i Rusts teamchatt. Befintlig deduplicering, femsekundersspärr och avbrottsskydd gäller. Inga externa API-nycklar behövs. !team läggs inte till.

| Kommando | Svar |
| --- | --- |
| !wipe | Tid sedan senaste wipe enligt ett nytt Rust+-serveranrop. Saknad, felaktig eller framtida tidsstämpel räknas inte om. |
| !online / !offline | Namn och antal från senaste aktuella teamuppdatering. |
| !alive [namn/SteamID] | Överlevnadstid; utan namn visas den längst levande medlemmen med giltig spawn-tid. Offline men levande medlemmar kan ingå. |
| !steamid [namn] | Teammedlemmens SteamID64; utan namn avsändarens. |
| !prox | Avstånd i kartplanet till högst tre närmaste levande teammedlemmar online. Okända positioner hoppas över. |
| !death [namn/SteamID] | Senaste sparade dödsplats, med kartruta och eventuell tid/ungefärlig märkning. Dödsplatser lagras för parade kontot; annan medlem får tydligt besked om att plats saknas. Utan namn avses avsändaren. |
| !uptime | ElRusty-tjänstens livstid och den aktuella Rust+-anslutningens livstid. Anslutningstiden börjar om efter återanslutning. |
| !where [namn/SteamID] | Kartruta för avsändaren eller vald medlem. |

!help visar katalogen. !help server, !help team och !help styrning visar grupper. !help prox och motsvarande ger detaljer. Katalogen finns också i Live → Inställningar → Kommandon och behörigheter → Alla teamkommandon. Namn med mellanslag fungerar; ett tvetydigt namn kräver SteamID.

### Varför Cargo/Oil Rig inte ingår här

Facepunch tog bort event- och vending-maskiners kartmarkörer från Rust+ den 6 augusti 2026 i [Power Trip](https://rust.facepunch.com/news/power-trip). Rust++-listorna beskriver därför funktioner som inte kan återskapas automatiskt på en vanlig aktuell vanilla-server med enbart Rust+. !events visar fortfarande eventmarkörer om en server faktiskt skickar dem; ett tomt svar bevisar aldrig att inget event pågår. På vanilla kan dessa data saknas helt. ElRusty räknar inte fram påhittade Cargo-/Oil Rig-timers från frånvaro av markörer.

Användaren valde andra fungerande kommandon först. Manuella teamrapporter och deras eventkommandon är uppskjutna, liksom BattleMetrics, marknadsdata och övriga Rust++-funktioner. Referensens [kommandolista](https://rustplusplus-credentials.netlify.app/docs/commands) används för funktionernas syfte; implementation och hjälptexter är skrivna självständigt.


## Timers och påminnelser 0.11

Skapa namngivna engångstimrar med !timer add 15m Oil Rig. !timer utan argument och !timers [sida] visar aktiva timers, fem per sida. Avbryt med !timer cancel <ID>; det åttateckens-ID som visas i listan är skiftlägesokänsligt. !help timer visar syntax och !help timers gruppen. Namn med mellanslag och identiska namn fungerar; avbrytning använder alltid ID.

Tillåten tid är 10 sekunder–7 dagar. Skriv heltal med enheterna d, h, m, s i fallande ordning, högst en gång per enhet: 90s, 15m, 1h30m. Enhetslösa tal, decimaler, negativa tal och upprepade/felordnade enheter avvisas. Namn är 1–60 tecken och högst 20 aktiva timers tillåts per profil.

Alla aktuella Rust-teammedlemmar får läsa listan och skapa/avbryta egna timers. Parade kontot och konfigurerade styr-SteamID:n får avbryta allas. Webbpanelen är lokal ägaradministration: skaparen är parade kontot med namnet Webbpanelen, och den kan avbryta alla timers för vald profil. API:t tar inte emot en betrodd skapare eller profil från klienten. Befintlig CSRF-, Host- och Origin-kontroll gäller.

Live → Timers visar formulär, återstående tid, sluttid, skapare och historik med de senaste 100 avslutade timrarna per profil. Nedräkningen i webbläsaren är visuell. När noll nås väntar vyn på tjänstens resultat; webbläsaren skickar ingen avisering själv. Tjänsten fortsätter med stängd webbläsare när datorn är vaken.

En separat SQLite-tabell skapas genom en additiv migrering till databasversion 2. Config-, aktivitets-, parnings- och IndexedDB-data ändras inte. Timers lagrar profil, fullständigt ID och kort-ID, namn, skapare, absoluta UTC-tider, tillstånd och aviseringsresultat. Tillstånden är aktiv, utgången och avbruten. Profilradering tar bort profilens timers; wipe ändrar inte manuella påminnelsers sluttid.

Schedulern söker förfallna timers varje sekund. SQLite-transaktioner skyddar kvoten och avgör atomiskt avbrytning/utgång samt sändningsanspråk, även mellan två instanser. Framtida timers återställs efter omstart. Redan förfallna timers registreras som missade utan gamla chattutskick. En timer som förfaller för en inaktiv profil ger missat i båda kanalerna; serverbyte pausar inte sluttiden.

Rust-aviseringen är [ElRusty] Timer klar: namn (ID). Discord använder registrerade privata #events, med servernamn och skapare. Message Content Intent och tvåvägschatt behövs inte. Kanalerna fungerar oberoende: exempelvis kan Discord avisera under Rust-avbrott. Ändrad kanalåtkomst spärrar utskick tills setupen uppdaterats.

Varje kanal har en separat kö med högst 20 meddelanden inklusive pågående sändning och minst en sekund mellan sändningsstarter. Full kö, ogiltig profil/anslutning eller avbruten väntan markeras missad. Köade Rust-aviseringar släpps vid Rust-avbrott, Discord-aviseringar vid Discord-avbrott och båda vid serverbyte. Inga gamla meddelanden återspelas.

Sändningsförsök registreras beständigt före nätanrop. Bekräftat betyder att servern/API:t godkänt sändningen, inte att någon läst den. Missat betyder att sändning inte genomfördes. Obekräftat används vid timeout, transportfel eller avbrutet pågående försök; meddelandet kan ha hunnit skickas och försöks därför inte igen. Mentions neutraliseras, text längdbegränsas och råa fel/payloads sparas inte i historiken.

Automatiska tester täcker tidstolkning, migration, kvoter, behörigheter, köer, två schedulerinstanser, omstart, serverbyte, wipe, kanalåtkomst och webbflöden. Verklig slutkontroll: skapa en 10s-timer från ditt Rust-konto, en från webben och en från en lagkamrat; kontrollera Rust och #events, avbryt en timer och prova omstart/avbrott. Återkommande timers, Discord-kommandon för timeradministration, automatisk enhetsstyrning och manuella eventrapporter ingår inte.

## Egna servrar och spelarantal 0.11.1

AppInfo.players (uint32, fält 7) och maxPlayers (uint32, fält 8) är valfria i samma versionshanterade pnpm-patch. Proto3-servrar kan utelämna nollvärden, exempelvis maxPlayers på en byggserver med server.maxplayers 0 och players på en tom server. Utelämnade spelarantal normaliseras till noll; noll tolkas inte som ett påhittat positivt maxantal. queuedPlayers förblir valfritt och visas endast om servern skickar det. Protokollfelhantering och övriga obligatoriska fält behålls.

När ElRusty och RustDedicated körs på samma dator kan ElRusty-profilen använda 127.0.0.1, serverns app.port och avstängd Facepunch-proxy. Rust-serverns app.publicip fortsätter annonsera den publika adressen för Rust+-mobilappen. Detta undviker beroende av routerns NAT loopback för den lokala anslutningen. På en Raspberry Pi eller annan dator på samma nät används Rust-serverdatorns LAN-adress i ElRusty. Använd inte loopback på Pi för en server som körs på Windows.

För extern åtkomst ska app.info visa rätt publik adress och TCP-port, portvidarebefordran gå till serverdatorn och brandväggen tillåta porten. Testa med Rust+-appen över mobildata; ett misslyckat test mot den egna publika adressen från hemnätet bevisar inte att extern åtkomst är trasig. Ingen automatisk ändring av router eller brandvägg görs. Befintlig profil kan behålla sitt ID och sin parning när anslutningsadressen ändras.

Referenser: [Facepunchs Rust+-serverguide](https://wiki.facepunch.com/rust/rust-companion-server) och [proto3-definitionens AppInfo](https://github.com/olijeffers0n/rustplus/blob/master/rustplus.proto).

## Fryst tid och beständig lokal adress 0.11.2

AppTime.timeScale (float, fält 2) kan utelämnas vid fryst tid, vilket observerades på byggservern. AppTime.time (float, fält 5) kan utelämnas vid midnatt. Patchen gör dessa valfria enligt proto3-semantik: nollvärdet accepteras utan att tappa anslutningen. Övriga obligatoriska tidsfält och skydd mot trasiga meddelanden behålls.

Under Live → Inställningar, redigera serverprofilen och ange **Anslutningsadress (valfri)**, exempelvis 127.0.0.1 på samma dator eller serverns LAN-adress på en Pi. Fältet sparas separat som connectionHost; host förblir adressen från parningen. Ny parning med samma host, port och Steam-konto uppdaterar därmed samma profil och behåller connectionHost. Tom anslutningsadress återgår till parningsadressen. En separat anslutningsadress kräver att Facepunch-proxy är avstängd.

Ingen publik adress i Rust-serverns app.info ändras. **Vänta på server** är knappen som börjar ta emot parningsförslag i ElRusty; den är inte samma sak som **Anslut** på den sparade profilen.

## !time med natt-/dagsprognos 0.12

!time visar aktuell speltid och ungefärlig verklig väntetid till nästa skifte, exempelvis [ElRusty] Speltid: 16:30 · Natt om cirka 8 min (uppskattat). När det är natt visar svaret Dag om. Solnedgång och soluppgång hämtas från servern; inget fast vanilla-klockslag används. Minuter avrundas uppåt och mindre än en minut skrivs ut som mindre än 1 min. Fryst tid ger Tiden är fryst. Giltig speltid men ogiltiga beräkningsvärden ger Tid till dag/natt kunde inte beräknas, medan ett misslyckat tidsanrop ger det befintliga korta felet.

Första uppskattningen är återstående speltimmar / 24 × dayLengthMinutes / timeScale i verkliga minuter. Den är ungefärlig; Rusts tidsförlopp och modifierade servrar kan vara ojämna. timeScale 0 hanteras som fryst tid utan division. Rust-adapterns timeInfo returnerar hela den typade snapshoten; time finns kvar som kompatibilitetsmetod som returnerar aktuell speltimme.

Live-tjänsten läser tiden var femte sekund medan vald server är ansluten. Den behöver ingen öppen webbläsare. Bakgrundspoll och !time delar ett pågående tidsanrop och använder inga gamla cachevärden för ett nytt kommando. Ett tidsläsningsfel avbryter pågående inlärning men kopplar inte ensamt ned Rust+. Befintlig kommandospärr, teambehörighet, deduplicering och skydd mot fördröjda svar efter avbrott gäller.

Inlärningen mäter kompletta dag- och nattfaser separat med monoton klocka. Den första ofullständiga fasen räknas inte. Varje komplett kurva består av 21 punkter vid 0–100 procent fasprogression, interpolerade mellan observationer. De tre senaste kompletta kurvorna per fas behålls och medianen tas per punkt (medelvärdet av två mittenvärden vid två kurvor). Återstående tid interpoleras ur denna mediankurva. Svaret märks (inlärt) för en fas som har komplett mätning, annars (uppskattat). Även inlärda svar är ungefärliga prognoser; framtida ändringar i serverns klocka kan inte förutses.

Färdiga kurvor sparas i privat SQLite-konfiguration som timeCalibrations, separat per profil och wipe-identitet. Ingen ny tabell eller migration behövs. Lagring sker bara vid färdig fas eller återställning, inte var femte sekund. Profilradering tar bort dess kurvor. Efter omstart/återanslutning krävs färska tidsvärden innan sparade kurvor används. Serverbyte blandar inte kurvor.

Pågående fas kastas vid avbrott, omstart eller över 15 sekunder mellan observationer. Färdiga kurvor återställs vid wipe, fryst/ogiltig cykel, bakåthopp eller tydliga framåthopp (mer än det större av 0,1 speltimme och fem gånger förväntad framåtrörelse). Ändrad dygnslängd/tidsskala över 1 procent eller solgräns över 0,05 speltimme (tre spelminuter) återställer också kurvorna. Små gränsändringar tolereras genom normaliserad fasposition. Gränspassager interpoleras mellan avläsningarna.

Verifiera direktuppskattning och fryst tid mot dina servrar. För verklig inlärning behöver ElRusty observera en komplett dag respektive natt utan avbrott; jämför därefter den inlärda prognosen med nästa skifte. Automatiska tester täcker kompletta syntetiska dygn, ojämn hastighet, medianer, klockhopp, avbrott, profilbyte, lagring och omstart. Inga nattaviseringar eller automatiska enhetsåtgärder ingår. Protokollfält: [rustplus.js AppTime](https://github.com/liamcottle/rustplus.js/blob/master/rustplus.proto). Implementation och inlärningsalgoritm är skrivna självständigt.

## Automatisk parningsmottagning 0.13

När tjänsten startar läser den den befintliga privata Rust+-registreringen och startar mottagning av server- och enhetsparningar automatiskt. Ingen webbläsare eller mobilapp behöver vara öppen. Saknas registrering visas guiden; Steam-inloggning öppnas bara när du väljer Registrera Rust+. En omstart börjar lyssna igen. Starta mottagning under Enheter eller Vänta på server under Inställningar kan återuppta manuellt pausad mottagning.

Bakgrundsläget har ingen tiominutersgräns. Notisbiblioteket återansluter vid nätavbrott. Om lyssnarprocessen avslutas oväntat startar tjänsten en ny med 1–30 sekunders ökande väntetid; det finns bara en ägd worker åt gången. Avbryt parning pausar mottagningen och avbryter väntande återstart fram till nästa tjänstestart eller manuell start. Ny registrering pausar lyssnaren och lyckad registrering återstartar den med de nya uppgifterna. Tjänstens avslut stoppar dess worker och återstartstimer.

I spelet parar du själva Smart Switchen, Smart Alarm eller Storage Monitor med Rust+. Under Live → Enheter visas namn, typ och Entity-ID för förslag som tillhör vald sparad serverprofil. Klicka Lägg till; appen kontrollerar ansluten profil, behörighet och faktisk enhetstyp via Rust+ innan något sparas. Förslaget skickar inga på/av-kommandon. Mottagningen fortsätter efter både enhets- och servergodkännanden. Namn och grupp kan sedan ändras i det vanliga enhetsformuläret.

Förslag matchas med parningsadress (host), app.port och SteamID när det finns i notisen. Saknas SteamID krävs exakt en matchande sparad endpoint-profil. Den separata connectionHost används vid verifieringen; den publika parningsadressen ändras inte. Okänd eller tvetydig server ger en varning och ingen enhet läggs till. Para servern först vid behov. Token från enhetsnotiser används inte för att skriva över serverparningen och skickas inte till frontend eller loggar.

Högst 20 enhetsförslag och 20 serverförslag finns i minnet. De förfaller efter 15 minuter och behöver paras igen efter tjänsteomstart. Upprepade notiser dedupliceras per profil/Entity-ID; redan sparade enheter föreslås inte igen. Felaktiga notiser ignoreras. Enhetsgodkännandet är ett CSRF-skyddat POST till /api/live/pairing/device/accept med förslagets id; användaren behöver inte kopiera något Entity-ID.

På egen server med administratörsbehörighet kan entity.debug_lookat i F1 aktivera debugvisning för objektet du tittar på. Nätverks-ID/Entity-ID är inte samma sak som ett item-ID eller prefabnamn. Automatisk parning är det normala arbetsflödet på servrar där du saknar admin. Källor: [Facepunchs adminkommando](https://rust.facepunch.com/news/devblog-65) och [Rust+-notisernas fält](https://github.com/liamcottle/rustplus.js/blob/master/docs/API.md).

Automatiska tester täcker start, paus, processavbrott, förfall, dubbletter, fel profil, typkonflikt, avbrott under verifiering, maskerade notiser, CSRF och webbläsarflödet. Verklig kontroll: para en ny Smart Switch medan tjänsten körs, kontrollera namn/ID i Enheter, välj Lägg till och prova individuell styrning. Upprepa efter tjänsteomstart och med stängd webbläsare.
