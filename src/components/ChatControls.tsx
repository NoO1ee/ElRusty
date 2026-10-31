import { useEffect, useState } from 'react';
import type { LiveSnapshot } from '../../shared/live';
import { liveAction } from '../live-store';
export function ChatControls({ data }: { data: LiveSnapshot }) {
  const [id, setId] = useState(data.activeProfileId || data.profiles[0]?.id || ''),
    [ids, setIds] = useState(''),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const profile = data.profiles.find((p) => p.id === id);
  useEffect(
    () => setIds(profile?.controlSteamIds?.join(', ') || ''),
    [profile?.id, JSON.stringify(profile?.controlSteamIds)],
  );
  return (
    <section className="live-panel">
      <div className="eyebrow">RUST TEAMCHATT</div>
      <h2>Kommandon och behörigheter</h2>
      <p>
        Alla i teamet kan använda !time, !help, !pop, !where och !events. Styrning kräver det parade
        kontot eller ett tillåtet SteamID för vald server.
      </p>
      <label className="live-field">
        <span>Server för chattbehörigheter</span>
        <select value={id} onChange={(e) => setId(e.target.value)}>
          <option value="">Välj server</option>
          {data.profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          setMessage('');
          void liveAction('controls', { id, steamIds: ids.split(/[,\s]+/).filter(Boolean) })
            .then(() => setMessage('Chattbehörigheterna är sparade.'))
            .catch((e) => setMessage(e.message))
            .finally(() => setBusy(false));
        }}
      >
        <label className="live-field">
          <span>Tillåtna SteamID:n för styrkommandon</span>
          <textarea
            value={ids}
            onChange={(e) => setIds(e.target.value)}
            placeholder="SteamID64, separerade med komma"
          />
        </label>
        <button disabled={busy || !profile}>Spara chattbehörigheter</button>
      </form>
      <p>
        <code>!switch &lt;namn/ID&gt; on/off</code>
        <br />
        <code>!group &lt;namn&gt; on/off</code>
        <br />
        <code>!mode &lt;namn/ID&gt;</code>
        <br />
        <code>!makeleader</code>
      </p>
      <small>
        Namn med mellanslag fungerar. Använd ID vid namnkonflikt. !makeleader ger avsändaren
        ledarskapet när det parade kontot är nuvarande ledare; serverns svar kontrolleras innan
        bekräftelse.
      </small>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
