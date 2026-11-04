import { useState } from 'react';
import { liveAction } from '../live-store';
import type { LiveSnapshot } from '../../shared/live';
import { eventFresh, gameEventNames, eventStatusNames, type EventType } from '../../shared/events';
export function EventPanel({ data, offline }: { data: LiveSnapshot; offline: boolean }) {
  const [type, setType] = useState<EventType>('cargo'),
    [value, setValue] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <section className="live-panel" aria-label="Eventinformation">
      <h2>Event och lagrapporter</h2>
      <p className="muted">
        Serverbekräftade händelser och lagets rapporter visas separat. Publika vanilla-servrar ger
        normalt ingen automatisk eventinformation.
      </p>
      <form
        className="live-actions"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            await liveAction('events/report', { type, value });
            setValue('');
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Event
          <select
            aria-label="Rapportens eventtyp"
            value={type}
            onChange={(e) => setType(e.target.value as EventType)}
          >
            {Object.entries(gameEventNames).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Observation
          <input
            aria-label="Eventobservation"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={
              type === 'cargo' || type === 'heli'
                ? 'Kartruta, t.ex. A10, eller end'
                : 'start eller end'
            }
            maxLength={20}
          />
        </label>
        <button
          className="primary"
          disabled={busy || offline || data.connection !== 'connected' || !value}
        >
          Rapportera event
        </button>
      </form>
      {error && (
        <p role="alert" className="live-error">
          {error}
        </p>
      )}
      <p className="muted">
        Plugin:{' '}
        {data.gameEvents?.server.fresh
          ? 'tar emot serverdata'
          : data.gameEvents?.server.configured
            ? 'inaktuell information'
            : 'inte ansluten'}{' '}
        · Lagrapporter blir inaktuella efter 15 minuter.
      </p>
      {(data.gameEvents?.entries || []).slice(0, 8).map((e) => (
        <article className="event-summary" key={e.id}>
          <strong>
            {gameEventNames[e.type]} · {eventStatusNames[e.status]}
          </strong>
          <small>
            {e.source === 'team' ? 'Lagrapport · ' + e.reporter?.name : 'Serverbekräftat'} ·{' '}
            {e.grid || (e.x === undefined ? 'Position okänd' : 'Exakt position vid val på kartan')}{' '}
            · {new Date(e.observedAt).toLocaleString('sv-SE')}
            {!eventFresh(e, Date.now(), !!data.gameEvents?.server.fresh) || offline
              ? ' · Inaktuell'
              : ''}
            {e.direction ? ' · Från ' + e.direction : ''}
          </small>
        </article>
      ))}
      {!data.gameEvents?.entries.length && (
        <p>
          Ingen eventinformation ännu. Lagrapporter anger observationer, inte verifierad spawn-
          eller hackningstid.
        </p>
      )}
    </section>
  );
}
