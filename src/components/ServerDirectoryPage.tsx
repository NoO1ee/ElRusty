import { useEffect, useState } from 'react';
import { Search, RefreshCw, Users, CalendarDays, Copy, ExternalLink, Globe } from 'lucide-react';
import {
  serverRegions,
  wipeDays,
  groupLimits,
  groupLimitLabel,
  defaultDirectoryQuery,
  directoryParams,
  type DirectoryQuery,
  type DirectoryResult,
} from '../../shared/servers';
import './server-directory.css';
const storageKey = 'elrusty-server-filters-v1';
function initialQuery(): DirectoryQuery {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (!saved || typeof saved !== 'object') return defaultDirectoryQuery;
    return {
      ...defaultDirectoryQuery,
      q: typeof saved.q === 'string' ? saved.q.slice(0, 80) : '',
      region: Object.hasOwn(serverRegions, saved.region) ? saved.region : 'EU',
      day: Object.hasOwn(wipeDays, saved.day) ? saved.day : 'all',
      group: Object.hasOwn(groupLimits, saved.group) ? saved.group : 'all',
      minPlayers:
        Number.isSafeInteger(saved.minPlayers) &&
        saved.minPlayers >= 0 &&
        saved.minPlayers <= 100000
          ? saved.minPlayers
          : 0,
      sort: ['players-desc', 'players-asc', 'wipe', 'name'].includes(saved.sort)
        ? saved.sort
        : 'players-desc',
    };
  } catch {
    return defaultDirectoryQuery;
  }
}
const dateFormat = new Intl.DateTimeFormat('sv-SE', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Stockholm',
});
const kindNames = { map: 'Karta', bp: 'BP', full: 'Karta + BP', unknown: 'Typ okänd' };
export function ServerDirectoryPage() {
  const [query, setQuery] = useState<DirectoryQuery>(initialQuery),
    [data, setData] = useState<DirectoryResult | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(''),
    [tick, setTick] = useState(0),
    [copied, setCopied] = useState('');
  const queryKey = directoryParams(query).toString();
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ ...query, page: 1 }));
    } catch {
      /* Browsing also works without local storage. */
    }
  }, [queryKey]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') setTick((t) => t + 1);
    }, 60000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch('/api/servers?' + queryKey, { signal: controller.signal });
        const body = await response.json();
        if (!response.ok)
          throw Error(
            typeof body.error === 'string' ? body.error : 'Serverlistan kunde inte hämtas.',
          );
        if (!controller.signal.aborted) setData(body);
      } catch (e) {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : 'Serverlistan kunde inte hämtas.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [queryKey, tick]);
  const change = (patch: Partial<DirectoryQuery>) => {
    setQuery((q) => ({ ...q, ...patch, page: 1 }));
    setCopied('');
  };
  return (
    <main className="scroll-page server-directory">
      <div className="page">
        <header className="page-heading">
          <div>
            <div className="eyebrow">HITTA NÄSTA WIPE</div>
            <h1>
              <Globe size={28} /> Servrar
            </h1>
            <p>
              Hitta en server efter gruppstorlek, population och kommande deklarerade wipedagar.
            </p>
          </div>
          <button disabled={loading} onClick={() => setTick((t) => t + 1)}>
            <RefreshCw size={15} /> Uppdatera serverlistan
          </button>
        </header>
        <section className="directory-filters" aria-label="Filtrera serverlistan">
          <label className="directory-search">
            Sök server
            <div>
              <Search size={16} />
              <input
                aria-label="Sök server"
                value={query.q}
                maxLength={80}
                placeholder="Rustoria, Facepunch, Rustafied…"
                onChange={(e) => change({ q: e.target.value })}
              />
            </div>
          </label>
          <label>
            Region
            <select
              aria-label="Serverregion"
              value={query.region}
              onChange={(e) => change({ region: e.target.value as DirectoryQuery['region'] })}
            >
              {Object.entries(serverRegions).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Wipedag
            <select
              aria-label="Deklarerad wipedag"
              value={query.day}
              onChange={(e) => change({ day: e.target.value as DirectoryQuery['day'] })}
            >
              {Object.entries(wipeDays).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Gruppgräns
            <select
              aria-label="Gruppgräns"
              value={query.group}
              onChange={(e) => change({ group: e.target.value as DirectoryQuery['group'] })}
            >
              {Object.entries(groupLimits)
                .sort(([a], [b]) => (a === 'all' ? -1 : b === 'all' ? 1 : 0))
                .map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Minst spelare
            <input
              aria-label="Minsta population"
              type="number"
              min="0"
              max="100000"
              value={query.minPlayers}
              onChange={(e) =>
                change({
                  minPlayers: Math.min(
                    100000,
                    Math.max(0, Math.trunc(Number(e.target.value)) || 0),
                  ),
                })
              }
            />
          </label>
          <label>
            Sortera
            <select
              aria-label="Sortera servrar"
              value={query.sort}
              onChange={(e) => change({ sort: e.target.value as DirectoryQuery['sort'] })}
            >
              <option value="players-desc">Flest spelare</option>
              <option value="players-asc">Minst spelare</option>
              <option value="wipe">Närmaste deklarerade wipe</option>
              <option value="name">Namn A–Ö</option>
            </select>
          </label>
        </section>
        <div className="directory-summary">
          <span role="status">
            {loading
              ? 'Hämtar serverlista…'
              : data
                ? `${data.total.toLocaleString('sv-SE')} servrar matchar`
                : 'Välj filter för serverlistan'}
          </span>
          <span>Wipefilter: enbart deklarerade scheman · Tider: Europe/Stockholm</span>
        </div>
        {error && (
          <p className="directory-error" role="alert">
            {error}
          </p>
        )}
        {data?.stale && (
          <p className="directory-warning" role="status">
            {data.warning}
          </p>
        )}
        <section className="directory-results" aria-label="Serverresultat" aria-busy={loading}>
          {data?.servers.map((server) => {
            const address =
              (server.host.includes(':') ? '[' + server.host + ']' : server.host) +
              ':' +
              server.port;
            return (
              <article className="directory-row" key={server.id}>
                <div className="directory-server-name">
                  <strong>{server.name}</strong>
                  <small>
                    {server.region ? serverRegions[server.region] : 'Region okänd'}
                    {server.country ? ' · ' + server.country : ''} · {address}
                    {' · ' + groupLimitLabel(server.groupLimit)}
                  </small>
                </div>
                <div className="directory-pop">
                  <span>
                    <Users size={16} />
                    <strong>{server.players.toLocaleString('sv-SE')}</strong>
                    <span> / {server.maxPlayers.toLocaleString('sv-SE')}</span>
                  </span>
                  <small>
                    {server.queue === null
                      ? 'Kö okänd'
                      : server.queue > 0
                        ? 'Kö: ' + server.queue
                        : 'Ingen rapporterad kö'}
                  </small>
                </div>
                <div className="directory-wipe">
                  <span>
                    <CalendarDays size={16} />
                    {server.displayWipe ? (
                      <time dateTime={new Date(server.displayWipe.at).toISOString()}>
                        {dateFormat.format(server.displayWipe.at)}
                      </time>
                    ) : (
                      'Inget deklarerat schema'
                    )}
                  </span>
                  <small>
                    {server.displayWipe
                      ? kindNames[server.displayWipe.kind] + ' · Deklarerat via Wipe Board'
                      : server.scheduleSource === 'estimated'
                        ? 'Upptäckt mönster används inte som schema'
                        : 'Wipedag okänd'}
                    {server.lastWipeAt
                      ? ' · Senast ' +
                        new Date(server.lastWipeAt).toLocaleDateString('sv-SE', {
                          timeZone: 'Europe/Stockholm',
                        })
                      : ''}
                  </small>
                </div>
                <div className="directory-actions">
                  <button
                    aria-label={'Kopiera anslutning till ' + server.name}
                    title="Kopiera client.connect för Rusts F1-konsol"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText('client.connect ' + address);
                        setCopied(server.id);
                        setError('');
                      } catch {
                        setError(
                          'Kunde inte kopiera. Skriv client.connect ' +
                            address +
                            ' i Rusts F1-konsol.',
                        );
                      }
                    }}
                  >
                    <Copy size={15} />
                    {copied === server.id ? 'Kopierat' : 'Kopiera'}
                  </button>
                  <a
                    href={server.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={'Information om ' + server.name}
                  >
                    <ExternalLink size={16} />
                  </a>
                </div>
              </article>
            );
          })}
          {!loading && data && !data.servers.length && (
            <div className="directory-empty">
              <CalendarDays size={30} />
              <h2>Inga servrar matchar</h2>
              <p>
                Prova en annan gruppgräns eller wipedag, eller sänk minsta population. Servrar utan
                deklarerat schema visas när Alla wipedagar är valt.
              </p>
              <button onClick={() => setQuery(defaultDirectoryQuery)}>Återställ filter</button>
            </div>
          )}
        </section>
        {data && (
          <nav className="directory-pagination" aria-label="Serverlistans sidor">
            <button
              disabled={loading || data.page <= 1}
              onClick={() => setQuery((q) => ({ ...q, page: Math.max(1, data.page - 1) }))}
            >
              Föregående
            </button>
            <span>
              Sida {data.page} av {data.pages}
            </span>
            <button
              disabled={loading || data.page >= data.pages}
              onClick={() => setQuery((q) => ({ ...q, page: data.page + 1 }))}
            >
              Nästa
            </button>
          </nav>
        )}
        <footer className="directory-attribution">
          <span>
            Data:{' '}
            <a href="https://wipeboard.net/api" target="_blank" rel="noopener noreferrer">
              Wipe Board
            </a>{' '}
            ·{' '}
            <a
              href="https://creativecommons.org/licenses/by/4.0/"
              target="_blank"
              rel="noopener noreferrer"
            >
              CC BY 4.0
            </a>
            . Urval och tider bearbetade av ElRusty.
          </span>
          <span>
            {data ? 'Källans lista: ' + dateFormat.format(data.updatedAt) + ' · ' : ''}Populationen
            kan släpa efter; källan uppdateras med 1–10 minuters intervall.
          </span>
          <span>
            Gruppgränsen är källans rapporterade maxstorlek, inte en kontroll av serverns regler.
            Ingen rapporterad gräns betyder inte säkert obegränsat. Att hitta en server lägger inte
            till någon Rust+-parning. Anslut i spelet och para sedan via Live.
          </span>
        </footer>
      </div>
    </main>
  );
}
