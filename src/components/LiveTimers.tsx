import { useEffect, useState, type FormEvent } from 'react';
import { Timer, Plus, X } from 'lucide-react';
import type { LiveSnapshot } from '../../shared/live';
import type {
  LiveTimer,
  TimerDelivery,
  CreateTimerInput,
  CancelTimerInput,
} from '../../shared/timers';
import { timerRemaining } from '../../shared/timers';
import { liveAction } from '../live-store';
const delivery: Record<TimerDelivery, string> = {
  pending: 'Väntar',
  attempting: 'Skickar…',
  sent: 'Bekräftat',
  missed: 'Missat',
  unconfirmed: 'Obekräftat',
};
const date = (n: number) =>
  new Date(n).toLocaleString('sv-SE', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
export function LiveTimers({ data, offline }: { data: LiveSnapshot; offline: boolean }) {
  const [name, setName] = useState(''),
    [duration, setDuration] = useState('15m'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [now, setNow] = useState(Date.now());
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);
  useEffect(() => {
    setError('');
    setName('');
  }, [data.activeProfileId]);
  const rows = data.timers || [],
    active = rows.filter((t) => t.state === 'active'),
    history = rows.filter((t) => t.state !== 'active');
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
  function submit(e: FormEvent) {
    e.preventDefault();
    void run(async () => {
      await liveAction('timers', { name, duration } satisfies CreateTimerInput);
      setName('');
    });
  }
  function cancel(timer: LiveTimer) {
    void run(async () => {
      await liveAction('timers/cancel', { id: timer.id } satisfies CancelTimerInput);
    });
  }
  return (
    <div className="live-timers">
      <section className="live-panel timer-create">
        <div className="live-section-heading">
          <div>
            <div className="eyebrow">PÅMINNELSER FÖR TEAMET</div>
            <h2>
              <Timer size={19} /> Timers
            </h2>
          </div>
          <span className="muted">{active.length}/20 aktiva</span>
        </div>
        <p>
          Engångspåminnelser för vald server. Sluttiden sparas lokalt och fortsätter gälla när Rust+
          är frånkopplat.
        </p>
        {!data.activeProfileId && (
          <p className="live-muted-banner">Välj en serverprofil för att skapa och visa timers.</p>
        )}
        <form onSubmit={submit} className="timer-form">
          <label className="live-field">
            <span>Timernamn</span>
            <input
              required
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Till exempel Oil Rig"
            />
          </label>
          <label className="live-field">
            <span>Tid</span>
            <input
              required
              maxLength={32}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="15m eller 1h30m"
              aria-describedby="timer-duration-help"
            />
          </label>
          <button
            className="primary"
            disabled={busy || offline || !data.activeProfileId || active.length >= 20}
          >
            <Plus size={16} /> Skapa timer
          </button>
        </form>
        <small id="timer-duration-help">
          10 sekunder–7 dagar. Använd s, m, h och d i fallande ordning: 90s, 15m eller 1h30m.
        </small>
        <p className="muted timer-notice">
          När timern går ut aviseras Rust och den privata Discord-kanalen #events om de är
          tillgängliga. Missade aviseringar skickas inte i efterhand. Inaktiv serverprofil ger inga
          chattutskick.
        </p>
        {(error || data.timerError) && (
          <p className="live-error" role="alert">
            {error || data.timerError}
          </p>
        )}
      </section>
      <section className="live-panel" aria-label="Aktiva timers">
        <h2>Aktiva timers</h2>
        {!active.length ? (
          <p className="muted">Inga aktiva timers för servern.</p>
        ) : (
          <div className="timer-list">
            {active.map((t) => (
              <article key={t.id} className="timer-card" data-timer-id={t.shortId}>
                <div>
                  <span className="eyebrow">{t.shortId}</span>
                  <h3>{t.name}</h3>
                  <p>
                    Skapad av {t.creatorName} · slut {date(t.dueAt)}
                  </p>
                </div>
                <strong className="timer-countdown">
                  {now >= t.dueAt ? 'Väntar på tjänsten…' : timerRemaining(t.dueAt - now)}
                </strong>
                <button
                  disabled={busy || offline || now >= t.dueAt}
                  aria-label={'Avbryt timer ' + t.shortId}
                  onClick={() => cancel(t)}
                >
                  <X size={14} /> Avbryt
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
      <section className="live-panel" aria-label="Timerhistorik">
        <h2>Senast avslutade</h2>
        <p className="muted">
          De senaste 100 per server. Obekräftat betyder att leveransen inte kunde säkerställas; den
          försöks inte igen.
        </p>
        {!history.length ? (
          <p className="muted">Ingen timerhistorik ännu.</p>
        ) : (
          <div className="timer-list">
            {history.map((t) => (
              <article key={t.id} className={'timer-card ' + t.state}>
                <div>
                  <span className="eyebrow">
                    {t.shortId} · {t.state === 'cancelled' ? 'AVBRUTEN' : 'UTGÅNGEN'}
                  </span>
                  <h3>{t.name}</h3>
                  <p>
                    {date(t.finishedAt || t.dueAt)} · {t.creatorName}
                  </p>
                </div>
                {t.state === 'expired' && (
                  <div className="timer-delivery">
                    <span>
                      Rust: <b className={'delivery-' + t.rust}>{delivery[t.rust]}</b>
                    </span>
                    <span>
                      Discord: <b className={'delivery-' + t.discord}>{delivery[t.discord]}</b>
                    </span>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
