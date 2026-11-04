import { useState } from 'react';
import { liveAction } from '../live-store';
import type { LiveSnapshot } from '../../shared/live';
export function EventBridgeGuide({ data }: { data: LiveSnapshot }) {
  const [filename, setFilename] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <section className="live-panel">
      <h2>Oxide-event från egen server</h2>
      <p>
        Cargo, Patrol Helicopter och Oil Rig kan rapporteras automatiskt av ElRustyEvents på din
        Oxide-server. Publika servrar använder lagrapporter.
      </p>
      <p>
        Status:{' '}
        {data.gameEvents?.server.fresh
          ? 'Tar emot serverdata'
          : data.gameEvents?.server.configured
            ? 'Konfigurerad · väntar på färsk serverdata'
            : 'Inte konfigurerad'}
        {data.gameEvents?.server.lastContact
          ? ' · Senaste kontakt ' +
            new Date(data.gameEvents.server.lastContact).toLocaleString('sv-SE')
          : ''}
      </p>
      <ol>
        <li>Välj din egen server i sidhuvudet och skapa privat plugininställning nedan.</li>
        <li>
          Kör deploy/install-event-plugin.ps1 med ditt ProfileId för att kopiera pluginen och den
          privata JSON-filen till oxide/config/ElRustyEvents.json.
        </li>
        <li>
          På Windows, kör deploy/install-event-tunnel.ps1 för en separat bakgrundstunnel till Pi:n.
          Den startar vid Windows-inloggning.
        </li>
        <li>
          Ladda om pluginen med oxide.reload ElRustyEvents. Första bilden blir baslinje; gamla event
          ger inga notiser.
        </li>
      </ol>
      <button
        disabled={busy || !data.activeProfileId}
        onClick={async () => {
          setBusy(true);
          setError('');
          try {
            const result = await liveAction('events/configure');
            setFilename(result.filename);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        Skapa privat plugininställning
      </button>
      {filename && (
        <p role="status">
          Privat fil skapad: event-plugins/{filename} i tjänstens privata datamapp. På Pi:
          /var/lib/elrusty. Nyckeln visas inte här. Kopiera filen säkert via SSH; lägg den inte i
          Git.
        </p>
      )}
      {error && (
        <p role="alert" className="live-error">
          {error}
        </p>
      )}
    </section>
  );
}
