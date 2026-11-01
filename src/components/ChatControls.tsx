import { teamCommands } from '../../shared/commands';
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
      <h2>Rust — SteamID64 per serverprofil</h2>
      <p>
        Alla i teamet kan använda läskommandona. Skriv !help för listan eller !help team för
        teamkommandon. Styrning kräver det parade kontot eller ett tillåtet SteamID för vald server.
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
      <div className="access-choices">
        {id === data.activeProfileId &&
          data.team.map((m) => {
            const allowed = ids.split(/[,\s]+/).filter(Boolean);
            return (
              <label key={m.steamId}>
                <input
                  type="checkbox"
                  disabled={m.steamId === profile?.playerId}
                  checked={m.steamId === profile?.playerId || allowed.includes(m.steamId)}
                  onChange={(e) =>
                    setIds(
                      (e.target.checked
                        ? [...allowed, m.steamId]
                        : allowed.filter((x) => x !== m.steamId)
                      ).join(', '),
                    )
                  }
                />
                {m.name}
                {m.steamId === profile?.playerId ? ' · Parat konto' : ''}
              </label>
            );
          })}
      </div>
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
        <details>
          <summary>Avancerat: SteamID64</summary>
          <label className="live-field">
            <span>Tillåtna SteamID:n för styrkommandon</span>
            <textarea
              value={ids}
              onChange={(e) => setIds(e.target.value)}
              placeholder="SteamID64, separerade med komma"
            />
          </label>
        </details>
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
      <details className="live-command-help">
        <summary>Alla teamkommandon</summary>
        <div className="live-command-list">
          {teamCommands.map((c) => (
            <div key={c.name}>
              <code>{c.syntax}</code>
              <span>{c.description}</span>
            </div>
          ))}
        </div>
      </details>
      <small>
        Namn med mellanslag fungerar. Använd ID vid namnkonflikt. !makeleader ger avsändaren
        ledarskapet när det parade kontot är nuvarande ledare; serverns svar kontrolleras innan
        bekräftelse.
      </small>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
