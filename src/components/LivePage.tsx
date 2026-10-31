import { LiveMap } from './LiveMap';
import { useLive, refreshLive, liveAction } from '../live-store';
import { RustPairing } from './RustPairing';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  Radio,
  Power,
  Shield,
  Users,
  Bell,
  Settings,
  Layers,
  ArrowRight,
  RefreshCw,
  Plus,
  Trash2,
  Pencil,
} from 'lucide-react';
import type { LiveSnapshot, CommandResult, Profile, Device, Mode } from '../../shared/live';
import { parsePairing } from '../../shared/pairing';
import './live.css';
const connectionNames = {
  connected: 'Ansluten',
  connecting: 'Ansluter',
  reconnecting: 'Återansluter',
  disconnected: 'Frånkopplad',
};
const clock = (n: number | null) =>
  n ? new Date(n).toLocaleTimeString('sv-SE') : 'Inte uppdaterad';
const emptyProfile = {
  name: '',
  host: '',
  port: 28082,
  playerId: '',
  playerToken: '',
  useProxy: false,
};
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="live-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function LivePage() {
  const [tab, setTab] = useState('Översikt'),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [results, setResults] = useState<CommandResult[]>([]);
  const data = useLive((s) => s.data),
    offline = useLive((s) => s.offline);
  const refresh = refreshLive;
  async function act(path: string, body: unknown = {}, after?: () => void) {
    setBusy(true);
    setError('');
    setResults([]);
    try {
      const value = await liveAction(path, body);
      if (Array.isArray(value)) setResults(value);
      after?.();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const [manualOpen, setManualOpen] = useState(false);
  const [profile, setProfile] = useState(emptyProfile),
    [editingProfile, setEditingProfile] = useState<string | undefined>(),
    [pairing, setPairing] = useState('');
  const [deviceName, setDeviceName] = useState(''),
    [entityId, setEntityId] = useState(''),
    [group, setGroup] = useState(''),
    [editingDevice, setEditingDevice] = useState<string | undefined>();
  const [modeName, setModeName] = useState(''),
    [modeValues, setModeValues] = useState<Record<string, boolean>>({}),
    [editingMode, setEditingMode] = useState<string | undefined>();
  const [discord, setDiscord] = useState({
      guildId: '',
      channelId: '',
      userIds: '',
      roleIds: '',
      token: '',
    }),
    [discordLoaded, setDiscordLoaded] = useState(false);
  useEffect(() => {
    if (data && !discordLoaded) {
      setDiscord({
        guildId: data.discord.guildId,
        channelId: data.discord.channelId,
        userIds: data.discord.userIds.join(', '),
        roleIds: data.discord.roleIds.join(', '),
        token: '',
      });
      setDiscordLoaded(true);
    }
  }, [data, discordLoaded]);
  const selected = data?.profiles.find((p) => p.id === data.activeProfileId),
    connected = !offline && data?.connection === 'connected';
  const disabled = busy || offline;
  const switches = data?.devices.filter((d) => d.type === 'switch') || [],
    groups = [...new Set(switches.map((d) => d.group).filter(Boolean))];
  function editProfile(p: Profile) {
    setProfile({ ...p, playerToken: '' });
    setEditingProfile(p.id);
    setManualOpen(true);
    setTab('Inställningar');
  }
  function editDevice(d: Device) {
    setDeviceName(d.name);
    setEntityId(String(d.entityId));
    setGroup(d.group);
    setEditingDevice(d.id);
  }
  function editMode(m: Mode) {
    setModeName(m.name);
    setModeValues(Object.fromEntries(m.values.map((v) => [v.deviceId, v.value])));
    setEditingMode(m.id);
  }
  function resetDevice() {
    setDeviceName('');
    setEntityId('');
    setGroup('');
    setEditingDevice(undefined);
  }
  function resetMode() {
    setModeName('');
    setModeValues({});
    setEditingMode(undefined);
  }
  const submit = (fn: () => void) => (e: FormEvent) => {
    e.preventDefault();
    fn();
  };
  return (
    <main className="scroll-page live-page">
      <div className="page">
        <header className="page-heading">
          <div>
            <div className="eyebrow">DIN BAS · I REALTID</div>
            <h1>
              <Radio size={28} /> ElRusty Live
            </h1>
            <p>Håll koll på teamet och styr dina smarta enheter — här eller via Discord.</p>
          </div>
          <div className={'live-connection ' + (connected ? 'online' : '')}>
            <span />
            {offline ? 'Tjänsten saknas' : data ? connectionNames[data.connection] : 'Läser…'}
          </div>
        </header>
        <nav className="live-tabs" aria-label="Live-menyer">
          {[
            ['Översikt', Radio],
            ['Karta', Radio],
            ['Enheter', Power],
            ['Team', Users],
            ['Lägen', Layers],
            ['Inställningar', Settings],
          ].map(([name, Icon]) => (
            <button
              key={String(name)}
              className={tab === name ? 'selected' : ''}
              onClick={() => setTab(String(name))}
            >
              {typeof Icon !== 'string' && <Icon size={16} />} {String(name)}
            </button>
          ))}
        </nav>
        {offline && (
          <section className="live-banner" role="status">
            <Shield size={20} />
            <div>
              <strong>Starta ElRustys Live-tjänst</strong>
              <p>
                Kör <code>pnpm dev</code> för utveckling eller <code>pnpm build</code> och{' '}
                <code>pnpm start</code>. Kretsbyggaren och dina lokala byggen fungerar fortfarande.
              </p>
              <button onClick={() => void refresh()}>
                <RefreshCw size={14} /> Försök igen
              </button>
            </div>
          </section>
        )}
        {error && (
          <div className="live-error" role="alert">
            {error}
          </div>
        )}
        {data?.connectionError && <p className="live-error">{data.connectionError}</p>}
        {!!results.length && (
          <section className="live-results" aria-label="Kommandoresultat">
            {results.map((r) => (
              <p key={r.deviceId} className={r.ok ? 'success' : 'live-error'}>
                {r.ok ? '✓' : '✗'} {r.name}
                {r.error ? ' · ' + r.error : ' · Bekräftat'}
              </p>
            ))}
          </section>
        )}
        {data && (
          <>
            <section className="live-serverbar">
              <div>
                <span className="eyebrow">AKTIV SERVER</span>
                <strong>{selected?.name || 'Ingen server ansluten'}</strong>
              </div>
              <select
                aria-label="Välj Rust-server"
                value={data.activeProfileId || ''}
                disabled={disabled}
                onChange={(e) =>
                  e.target.value
                    ? void act('connect', { id: e.target.value })
                    : void act('disconnect')
                }
              >
                <option value="">Frånkopplad</option>
                {data.profiles.map((p) => (
                  <option value={p.id} key={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              {selected && (
                <button disabled={disabled} onClick={() => void act('disconnect')}>
                  Koppla från
                </button>
              )}
              <button onClick={() => setTab('Inställningar')}>
                <Plus size={14} /> Hantera servrar
              </button>
            </section>
            {tab === 'Karta' && <LiveMap data={data} offline={offline} />}
            {tab === 'Översikt' && (
              <>
                <div className="live-stats">
                  <article>
                    <Power />
                    <strong>{switches.length}</strong>
                    <span>Smarta switches</span>
                  </article>
                  <article>
                    <Users />
                    <strong>
                      {data.team.filter((m) => m.isOnline).length} / {data.team.length}
                    </strong>
                    <span>Teammedlemmar online</span>
                  </article>
                  <article>
                    <Bell />
                    <strong>{data.activity.filter((a) => a.kind === 'alarm').length}</strong>
                    <span>Larm i senaste historiken</span>
                  </article>
                  <article>
                    <Shield />
                    <strong className="live-small-status">
                      {offline ? 'Inaktuell' : data.discord.status}
                    </strong>
                    <span>Discord</span>
                  </article>
                </div>
                <div className="live-columns">
                  <section className="live-panel">
                    <h2>Allt börjar med en anslutning</h2>
                    <p>
                      Para din server med Rust+ och lägg till dina switches och larm. Du kan styra
                      en enhet i taget eller skapa lägen för hela basen.
                    </p>
                    <button
                      className="primary"
                      onClick={() => setTab(data.profiles.length ? 'Enheter' : 'Inställningar')}
                    >
                      {data.profiles.length ? 'Hantera enheter' : 'Anslut din första server'}
                      <ArrowRight size={15} />
                    </button>
                    <div className="live-chat-example">
                      <span>RUST TEAMCHAT</span>
                      <code>!time</code>
                      <p>[ElRusty] Speltid: 18:42</p>
                      <small>
                        Exempelsvar. Alla i teamet kan fråga efter serverns aktuella speltid.
                      </small>
                    </div>
                  </section>
                  <section className="live-panel">
                    <h2>Senaste händelser</h2>
                    {!data.activity.length ? (
                      <p className="muted">Anslutningar och Smart Alarm-händelser visas här.</p>
                    ) : (
                      <ol className="live-activity">
                        {data.activity.slice(0, 30).map((a) => (
                          <li key={a.id}>
                            <span className={'live-event ' + a.kind}>
                              {a.kind === 'alarm' ? <Bell size={15} /> : <Radio size={15} />}
                            </span>
                            <div>
                              {a.text}
                              <small>{new Date(a.at).toLocaleString('sv-SE')}</small>
                            </div>
                          </li>
                        ))}
                      </ol>
                    )}
                  </section>
                </div>
              </>
            )}
            {tab === 'Enheter' && (
              <>
                {!connected && (
                  <p className="live-muted-banner">
                    Status är inaktuell. Anslut till Rust+ för att verifiera eller styra enheter.
                  </p>
                )}
                <form
                  className="live-panel live-inline-form"
                  onSubmit={submit(
                    () =>
                      void act(
                        editingDevice ? 'device/edit' : 'device',
                        { id: editingDevice, name: deviceName, entityId: Number(entityId), group },
                        resetDevice,
                      ),
                  )}
                >
                  <Field label="Enhetsnamn">
                    <input
                      required
                      maxLength={100}
                      value={deviceName}
                      onChange={(e) => setDeviceName(e.target.value)}
                    />
                  </Field>
                  <Field label="Entity-ID">
                    <input
                      required
                      inputMode="numeric"
                      disabled={!!editingDevice}
                      value={entityId}
                      onChange={(e) => setEntityId(e.target.value)}
                    />
                  </Field>
                  <Field label="Grupp (valfritt)">
                    <input
                      maxLength={60}
                      value={group}
                      onChange={(e) => setGroup(e.target.value)}
                    />
                  </Field>
                  <button className="primary" disabled={disabled || (!editingDevice && !connected)}>
                    {editingDevice ? 'Spara enhet' : 'Verifiera och lägg till'}
                  </button>
                  {editingDevice && (
                    <button type="button" onClick={resetDevice}>
                      Avbryt
                    </button>
                  )}
                </form>
                <div className="live-group-actions">
                  {groups.map((g) => (
                    <div key={g}>
                      <strong>{g}</strong>
                      <button
                        disabled={disabled || !connected || data.pending.length > 0}
                        onClick={() => void act('group', { group: g, value: true })}
                      >
                        Alla på
                      </button>
                      <button
                        disabled={disabled || !connected || data.pending.length > 0}
                        onClick={() => void act('group', { group: g, value: false })}
                      >
                        Alla av
                      </button>
                    </div>
                  ))}
                </div>
                <div className="live-device-grid">
                  {data.devices.map((d) => {
                    const state = data.states[d.id],
                      pending = data.pending.includes(d.id),
                      fresh = connected && !!state && data.verified.includes(d.id);
                    return (
                      <article
                        className={'live-device ' + (fresh && state.value ? 'is-on' : '')}
                        key={d.id}
                      >
                        <div className="live-device-heading">
                          <img
                            src={
                              '/items/' +
                              {
                                switch: 'smart.switch',
                                alarm: 'smart.alarm',
                                storage: 'storage.monitor',
                              }[d.type] +
                              '.webp'
                            }
                            alt=""
                          />
                          <div>
                            <span>
                              {d.type === 'switch'
                                ? 'SMART SWITCH'
                                : d.type === 'alarm'
                                  ? 'SMART ALARM'
                                  : 'STORAGE MONITOR'}
                            </span>
                            <h2>{d.name}</h2>
                            <small>{d.group || 'Ingen grupp'}</small>
                          </div>
                          <button
                            className="subtle icon-button"
                            aria-label={'Redigera ' + d.name}
                            onClick={() => editDevice(d)}
                          >
                            <Pencil size={14} />
                          </button>
                        </div>
                        <div className="live-device-status">
                          <span className={fresh ? 'success' : ''}>
                            {pending
                              ? 'Väntar på bekräftelse…'
                              : !fresh
                                ? 'Inaktuell / ej verifierad'
                                : state.value
                                  ? '● På / aktiv'
                                  : '○ Av / inaktiv'}
                          </span>
                          <small>{clock(state?.updatedAt || null)}</small>
                        </div>
                        {d.type === 'switch' && (
                          <div className="live-switch-actions">
                            <button
                              disabled={disabled || !fresh || pending}
                              onClick={() => void act('switch', { id: d.id, value: true })}
                            >
                              På
                            </button>
                            <button
                              disabled={disabled || !fresh || pending}
                              onClick={() => void act('switch', { id: d.id, value: false })}
                            >
                              Av
                            </button>
                          </div>
                        )}
                        {state?.items && (
                          <p>
                            {state.items.reduce((n, i) => n + i.quantity, 0)} items ·{' '}
                            {state.items.length} staplar
                          </p>
                        )}
                        <details>
                          <summary>Enhetsuppgifter</summary>
                          <p>Entity-ID: {d.entityId}</p>
                          <p className="live-id">ElRusty-ID: {d.id}</p>
                          <button
                            disabled={disabled || pending}
                            onClick={() => void act('device/delete', { id: d.id })}
                          >
                            <Trash2 size={13} /> Ta bort från ElRusty
                          </button>
                        </details>
                      </article>
                    );
                  })}
                </div>
                {!data.devices.length && (
                  <div className="empty">
                    <Power size={32} />
                    <h2>Dina smarta enheter samlas här</h2>
                    <p>Lägg till ett entity-ID ovan. Enhetens typ läses från Rust-servern.</p>
                  </div>
                )}
              </>
            )}
            {tab === 'Team' && (
              <section className="live-panel">
                <div className="live-section-heading">
                  <h2>Ditt Rust-team</h2>
                  <span className="muted">
                    {connected && data.teamUpdatedAt
                      ? 'Uppdaterad ' + clock(data.teamUpdatedAt)
                      : 'Inaktuell information'}
                  </span>
                </div>
                {data.team.map((m) => (
                  <div className="live-member" key={m.steamId}>
                    <span className={'live-avatar ' + (m.isOnline ? 'success' : '')}>
                      {m.name.slice(0, 1).toUpperCase()}
                    </span>
                    <div>
                      <strong>{m.name}</strong>
                      <small>{m.steamId}</small>
                    </div>
                    <span>{m.isOnline ? 'Online' : 'Offline'}</span>
                    <span className={m.isAlive ? 'success' : 'live-dead'}>
                      {m.isAlive ? 'Alive' : 'Dead'}
                    </span>
                  </div>
                ))}
                {!data.team.length && (
                  <p>
                    Ingen teaminformation ännu. Anslut en server där det parade kontot ingår i ett
                    team.
                  </p>
                )}
              </section>
            )}
            {tab === 'Lägen' && (
              <div className="live-columns">
                <form
                  className="live-panel"
                  onSubmit={submit(
                    () =>
                      void act(
                        'mode',
                        {
                          id: editingMode,
                          name: modeName,
                          values: Object.entries(modeValues).map(([deviceId, value]) => ({
                            deviceId,
                            value,
                          })),
                        },
                        resetMode,
                      ),
                  )}
                >
                  <h2>{editingMode ? 'Redigera läge' : 'Skapa ett läge'}</h2>
                  <p>
                    Välj vilka switches som ska ingå och deras önskade läge. Övriga enheter påverkas
                    inte.
                  </p>
                  <Field label="Lägets namn">
                    <input
                      required
                      maxLength={100}
                      value={modeName}
                      onChange={(e) => setModeName(e.target.value)}
                      placeholder="Exempelvis Natt"
                    />
                  </Field>
                  {switches.map((d) => (
                    <div className="live-mode-row" key={d.id}>
                      <label>
                        <input
                          type="checkbox"
                          checked={d.id in modeValues}
                          onChange={(e) =>
                            setModeValues((v) => {
                              const next = { ...v };
                              if (e.target.checked) next[d.id] = true;
                              else delete next[d.id];
                              return next;
                            })
                          }
                        />
                        {d.name}
                      </label>
                      <select
                        aria-label={'Önskat läge för ' + d.name}
                        disabled={!(d.id in modeValues)}
                        value={String(modeValues[d.id] ?? true)}
                        onChange={(e) =>
                          setModeValues((v) => ({ ...v, [d.id]: e.target.value === 'true' }))
                        }
                      >
                        <option value="true">På</option>
                        <option value="false">Av</option>
                      </select>
                    </div>
                  ))}
                  <div className="live-actions">
                    <button
                      className="primary"
                      disabled={disabled || !selected || !Object.keys(modeValues).length}
                    >
                      Spara läge
                    </button>
                    {editingMode && (
                      <button type="button" onClick={resetMode}>
                        Avbryt
                      </button>
                    )}
                  </div>
                </form>
                <section className="live-panel">
                  <h2>Sparade lägen</h2>
                  {data.modes.map((m) => (
                    <article className="live-mode-card" key={m.id}>
                      <h3>{m.name}</h3>
                      <p>
                        {m.values
                          .map(
                            (v) =>
                              (switches.find((d) => d.id === v.deviceId)?.name || 'Borttagen') +
                              ': ' +
                              (v.value ? 'på' : 'av'),
                          )
                          .join(' · ')}
                      </p>
                      <div className="live-actions">
                        <button
                          className="primary"
                          disabled={disabled || !connected || data.pending.length > 0}
                          onClick={() => void act('mode/run', { id: m.id })}
                        >
                          Aktivera
                        </button>
                        <button onClick={() => editMode(m)}>Redigera</button>
                        <button
                          disabled={disabled}
                          aria-label={'Radera läge ' + m.name}
                          onClick={() => void act('mode/delete', { id: m.id })}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </article>
                  ))}
                  {!data.modes.length && (
                    <p className="muted">
                      Spara kombinationer för exempelvis nattbelysning eller basens olika sektorer.
                    </p>
                  )}
                </section>
              </div>
            )}
            {tab === 'Inställningar' && (
              <div className="live-columns">
                <div>
                  <RustPairing status={data.pairing} disabled={disabled} act={act} />
                  <section className="live-panel">
                    <h2>Dina serverprofiler</h2>
                    {data.profiles.map((p) => (
                      <div className="live-profile" key={p.id}>
                        <div>
                          <strong>{p.name}</strong>
                          <small>
                            {p.host}:{p.port}
                          </small>
                        </div>
                        <button
                          disabled={disabled}
                          onClick={() => void act('connect', { id: p.id })}
                        >
                          Anslut
                        </button>
                        <button
                          aria-label={'Redigera server ' + p.name}
                          onClick={() => editProfile(p)}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          disabled={disabled}
                          aria-label={'Radera server ' + p.name}
                          onClick={() => {
                            if (
                              window.confirm(
                                'Ta bort serverprofilen samt dess enheter och lägen från ElRusty?',
                              )
                            )
                              void act('profile/delete', { id: p.id });
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                    {!data.profiles.length && <p>Inga sparade servrar.</p>}
                  </section>
                </div>
                <div>
                  <form
                    className="live-panel"
                    onSubmit={submit(
                      () =>
                        void act(
                          'discord',
                          {
                            ...discord,
                            userIds: discord.userIds.split(/[\s,]+/).filter(Boolean),
                            roleIds: discord.roleIds.split(/[\s,]+/).filter(Boolean),
                          },
                          () => setDiscord((v) => ({ ...v, token: '' })),
                        ),
                    )}
                  >
                    <h2>Discord-bot</h2>
                    <p>
                      Skapa en bot i Discord Developer Portal. Bjud in med <code>bot</code> och{' '}
                      <code>applications.commands</code> samt View Channel och Send Messages i
                      larmkanalen.
                    </p>
                    <Field label="Discord-server-ID">
                      <input
                        required
                        value={discord.guildId}
                        onChange={(e) => setDiscord({ ...discord, guildId: e.target.value })}
                      />
                    </Field>
                    <Field label="Larmkanal-ID (valfritt)">
                      <input
                        value={discord.channelId}
                        onChange={(e) => setDiscord({ ...discord, channelId: e.target.value })}
                      />
                    </Field>
                    <Field label="Tillåtna användar-ID:n">
                      <input
                        value={discord.userIds}
                        onChange={(e) => setDiscord({ ...discord, userIds: e.target.value })}
                        placeholder="Separera med komma"
                      />
                    </Field>
                    <Field label="Tillåtna roll-ID:n">
                      <input
                        value={discord.roleIds}
                        onChange={(e) => setDiscord({ ...discord, roleIds: e.target.value })}
                        placeholder="Separera med komma"
                      />
                    </Field>
                    <Field
                      label={
                        data.discord.hasToken ? 'Bottoken (tomt behåller sparat värde)' : 'Bottoken'
                      }
                    >
                      <input
                        type="password"
                        autoComplete="off"
                        required={!data.discord.hasToken}
                        value={discord.token}
                        onChange={(e) => setDiscord({ ...discord, token: e.target.value })}
                      />
                    </Field>
                    <small>
                      Endast angivna användare eller roller får använda boten. Ditt eget ID behöver
                      också läggas till.
                    </small>
                    <div className="live-actions">
                      <button disabled={disabled} className="primary">
                        Spara Discord
                      </button>
                      <button
                        type="button"
                        disabled={disabled || !data.discord.hasToken}
                        onClick={() => void act('discord/start')}
                      >
                        Starta bot
                      </button>
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => void act('discord/stop')}
                      >
                        Stoppa bot
                      </button>
                    </div>
                    <p className="muted">
                      {data.discord.status} · /status · /team · /switch · /group · /mode
                    </p>
                  </form>
                </div>
                <details
                  className="pairing-manual"
                  open={manualOpen}
                  onToggle={(e) => setManualOpen(e.currentTarget.open)}
                >
                  <summary>Lägg in manuellt</summary>
                  <p className="muted">
                    Använd befintliga Rust+-uppgifter om den guidade parningen inte passar din
                    miljö.
                  </p>
                  <div className="live-columns">
                    {' '}
                    <form
                      className="live-panel"
                      onSubmit={submit(
                        () =>
                          void act(
                            'profile',
                            {
                              ...profile,
                              playerToken:
                                profile.playerToken === '' ? '' : Number(profile.playerToken),
                              id: editingProfile,
                            },
                            () => {
                              setProfile(emptyProfile);
                              setEditingProfile(undefined);
                              setPairing('');
                            },
                          ),
                      )}
                    >
                      <h2>{editingProfile ? 'Redigera server' : 'Lägg till Rust-server'}</h2>
                      <p>
                        Uppgifterna kommer från Rust+-parningen. app.port är inte serverns vanliga
                        spelport.
                      </p>
                      <Field label="Servernamn">
                        <input
                          required
                          value={profile.name}
                          onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                        />
                      </Field>
                      <div className="live-form-pair">
                        <Field label="IP eller värdnamn">
                          <input
                            required
                            value={profile.host}
                            onChange={(e) => setProfile({ ...profile, host: e.target.value })}
                          />
                        </Field>
                        <Field label="app.port">
                          <input
                            required
                            type="number"
                            min={1}
                            max={65535}
                            value={profile.port}
                            onChange={(e) =>
                              setProfile({ ...profile, port: Number(e.target.value) })
                            }
                          />
                        </Field>
                      </div>
                      <Field label="SteamID64">
                        <input
                          required
                          inputMode="numeric"
                          value={profile.playerId}
                          onChange={(e) => setProfile({ ...profile, playerId: e.target.value })}
                        />
                      </Field>
                      <Field
                        label={
                          editingProfile
                            ? 'PlayerToken (tomt behåller sparat värde)'
                            : 'PlayerToken'
                        }
                      >
                        <input
                          required={!editingProfile}
                          type="password"
                          autoComplete="off"
                          value={profile.playerToken}
                          onChange={(e) => setProfile({ ...profile, playerToken: e.target.value })}
                        />
                      </Field>
                      <label className="live-checkbox">
                        <input
                          type="checkbox"
                          checked={profile.useProxy}
                          onChange={(e) => setProfile({ ...profile, useProxy: e.target.checked })}
                        />{' '}
                        Använd Facepunch-proxy
                      </label>
                      <div className="live-actions">
                        <button disabled={disabled} className="primary">
                          Spara server
                        </button>
                        {editingProfile && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingProfile(undefined);
                              setProfile(emptyProfile);
                            }}
                          >
                            Avbryt
                          </button>
                        )}
                      </div>
                    </form>
                    <section className="live-panel">
                      <h2>Importera parningsuppgifter</h2>
                      <p>
                        Klistra in JSON med <code>ip</code>, <code>port</code>,{' '}
                        <code>playerId</code> och <code>playerToken</code>. Uppgifterna fyller i
                        serverformuläret.
                      </p>
                      <textarea
                        aria-label="Parnings-JSON"
                        rows={4}
                        value={pairing}
                        onChange={(e) => setPairing(e.target.value)}
                      />
                      <button
                        onClick={() => {
                          try {
                            setProfile(parsePairing(pairing));
                            setEditingProfile(undefined);
                            setPairing('');
                            setError('');
                          } catch (e) {
                            setError((e as Error).message);
                          }
                        }}
                      >
                        Läs parning
                      </button>
                    </section>
                  </div>
                </details>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
