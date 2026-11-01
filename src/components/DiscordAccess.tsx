import { useEffect, useState } from 'react';
import type { LiveSnapshot } from '../../shared/live';
import { liveAction } from '../live-store';
export function DiscordAccess({ data, onSetup }: { data: LiveSnapshot; onSetup: () => void }) {
  const [users, setUsers] = useState(data.discord.userIds),
    [roles, setRoles] = useState(data.discord.roleIds),
    [names, setNames] = useState<Record<string, string>>({}),
    [options, setOptions] = useState<{ id: string; name: string }[]>([]),
    [query, setQuery] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  useEffect(() => {
    setUsers(data.discord.userIds);
    setRoles(data.discord.roleIds);
    setOptions([]);
    setNames({});
  }, [
    data.discord.guildId,
    JSON.stringify(data.discord.userIds),
    JSON.stringify(data.discord.roleIds),
  ]);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="live-panel">
      <div className="eyebrow">DISCORD · ANVÄNDARE OCH ROLLER</div>
      <h2>Vem får använda Discord-boten?</h2>
      <p>
        Här används Discord-konton och Discord-roller, inte SteamID. En tillåten person eller medlem
        i en tillåten roll får använda botens kommandon i vald Discord-server. Lägg även till ditt
        eget konto eller din roll.
      </p>
      <button
        disabled={busy || !data.discord.guildId}
        onClick={() => void run(async () => setOptions(await liveAction('discord/access/options')))}
      >
        Hämta Discord-roller
      </button>
      <div className="access-choices">
        {options.map((r) => (
          <label key={r.id}>
            <input
              type="checkbox"
              checked={roles.includes(r.id)}
              onChange={(e) =>
                setRoles(e.target.checked ? [...roles, r.id] : roles.filter((id) => id !== r.id))
              }
            />
            {r.name}
          </label>
        ))}
      </div>
      <label className="live-field">
        <span>Discord-person: omnämnande eller användar-ID</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="<@123456789012345678> eller användar-ID"
        />
      </label>
      <button
        disabled={busy || !query.trim()}
        onClick={() =>
          void run(async () => {
            const match = /^(?:<@!?)?(\d{17,20})>?$/.exec(query.trim());
            if (!match) throw Error('Klistra in ett Discord-omnämnande eller användar-ID.');
            const person = await liveAction('discord/access/user', { id: match[1] });
            setNames((v) => ({ ...v, [person.id]: person.name }));
            setUsers((v) => (v.includes(person.id) ? v : [...v, person.id]));
            setQuery('');
          })
        }
      >
        Hitta och lägg till person
      </button>
      <p className="muted">
        I Discord: Inställningar → Avancerat → Utvecklarläge. Högerklicka sedan personen och välj
        Kopiera användar-ID. ID:t är inte personens visningsnamn.
      </p>
      <div className="access-choices">
        {users.map((id) => (
          <div key={id}>
            <span>
              {names[id] || 'Discord-användare'} · {id}
            </span>
            <button
              aria-label={'Ta bort Discord-behörighet ' + id}
              onClick={() => setUsers((v) => v.filter((x) => x !== id))}
            >
              Ta bort
            </button>
          </div>
        ))}
      </div>
      <details>
        <summary>Avancerat: Discord-ID:n</summary>
        <label className="live-field">
          <span>Tillåtna Discord-användar-ID:n</span>
          <textarea
            value={users.join(', ')}
            onChange={(e) => setUsers(e.target.value.split(/[,\s]+/).filter(Boolean))}
          />
        </label>
        <label className="live-field">
          <span>Tillåtna Discord-roll-ID:n</span>
          <textarea
            value={roles.join(', ')}
            onChange={(e) => setRoles(e.target.value.split(/[,\s]+/).filter(Boolean))}
          />
        </label>
      </details>
      <button
        className="primary"
        disabled={busy || !data.discord.guildId}
        onClick={() =>
          void run(async () => {
            await liveAction('discord/access', { userIds: users, roleIds: roles });
            setMessage(
              'Discord-behörigheterna är sparade. Uppdatera kanalernas åtkomst i Discord-inställningarna.',
            );
          })
        }
      >
        Spara Discord-behörigheter
      </button>
      <button onClick={onSetup}>Öppna Discord-inställningar</button>
      {message && <p role="status">{message}</p>}
      {error && (
        <p role="alert" className="live-error">
          {error}
        </p>
      )}
    </section>
  );
}
