import { useState } from 'react';
import { liveAction } from '../live-store';
import type { LiveSnapshot } from '../../shared/live';
export function DiscordSetup({ data }: { data: LiveSnapshot }) {
  const [guilds, setGuilds] = useState<{ id: string; name: string }[]>([]),
    [selected, setSelected] = useState(data.discord.guildId),
    [preview, setPreview] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState('');
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
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
      <div className="eyebrow">GUIDAD SETUP</div>
      <h2>Skapa plats för teamet i Discord</h2>
      <p>
        Spara din bottoken och tillåtna användare/roller i formuläret ovan. Bjud in boten till din
        Discord-server och välj den här. Botens ID hämtas automatiskt.
      </p>
      <button
        disabled={busy || !data.discord.hasToken}
        onClick={() => void run(async () => setGuilds(await liveAction('discord/guilds')))}
      >
        Hämta Discord-servrar
      </button>
      {!!guilds.length && (
        <label className="live-field">
          <span>Discord-server</span>
          <select
            value={selected}
            onChange={(e) => {
              setSelected(e.target.value);
              setPreview(null);
            }}
          >
            <option value="">Välj server</option>
            {guilds.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <button
        disabled={busy || !selected || !data.discord.hasToken}
        onClick={() =>
          void run(async () => {
            if (selected !== data.discord.guildId)
              await liveAction('discord/select', { guildId: selected });
            setPreview(await liveAction('discord/preview'));
            setMessage('');
          })
        }
      >
        Förhandsvisa kanalsetup
      </button>
      {preview && (
        <div className="discord-setup-preview">
          <h3>{preview.guildName} → ElRusty</h3>
          <p>
            Privat för {preview.userIds.length} valda användare och {preview.roleIds.length} roller.
            Discord-serverns administratörer har också åtkomst.
          </p>
          <ul>
            {preview.channels.map((c: string) => (
              <li key={c}># {c}</li>
            ))}
          </ul>
          <small>
            Boten behöver Manage Channels och Manage Roles för kanaler och åtkomst, samt View
            Channel, Send Messages, Read Message History och Embed Links. Befintliga kanaler utanför
            ElRustys sparade setup ändras inte.
          </small>
          <div className="live-actions">
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await liveAction('discord/setup');
                  setMessage(
                    'ElRusty-kanalerna är klara. Du kan köra setupen igen för att reparera saknade kanaler.',
                  );
                  setPreview(null);
                })
              }
            >
              Skapa ElRusty-kanaler
            </button>
          </div>
        </div>
      )}
      {message && (
        <p className="success" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="live-error" role="alert">
          {error}
        </p>
      )}
      <div className="discord-setup-preview">
        <h3>Tvåvägschatt · #teamchat</h3>
        <p>
          Rust-teamets nya meddelanden visas här. Tillåtna Discord-användares text skickas till Rust
          som [Discord] Namn: meddelande. Bilagor och historik vidarebefordras inte.
        </p>
        <p>
          Aktivera <strong>Message Content Intent</strong> under Bot i{' '}
          <a href="https://discord.com/developers/applications" target="_blank" rel="noreferrer">
            Discord Developer Portal
          </a>{' '}
          innan du slår på kopplingen.
        </p>
        <label className="live-field">
          <span>Aktivera tvåvägschatt</span>
          <input
            type="checkbox"
            checked={!!data.discord.relayEnabled}
            disabled={busy || !data.discord.channels?.teamchat}
            onChange={(e) => {
              const enabled = e.target.checked;
              void run(async () => {
                await liveAction('discord/relay', { enabled });
                setMessage(
                  enabled
                    ? 'Chattkopplingen har begärts. Kontrollera botstatus nedan.'
                    : 'Chattkopplingen är avstängd.',
                );
              });
            }}
          />
        </label>
        {data.discord.relayError && (
          <p className="live-error" role="alert">
            {data.discord.relayError}
          </p>
        )}
      </div>
      {data.discord.categoryId && (
        <p className="muted">
          Kategori sparad · {Object.keys(data.discord.channels || {}).length} kanaler registrerade
        </p>
      )}
    </section>
  );
}
