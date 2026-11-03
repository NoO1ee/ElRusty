import { useEffect, useState } from 'react';
import type { Member } from '../../shared/live';
export const observedDuration = (ms: number) =>
  `${Math.floor(ms / 3600000)} h ${Math.floor((ms % 3600000) / 60000)} min`;
export function TeamPresence({
  member: m,
  connected,
  updatedAt,
}: {
  member: Member;
  connected: boolean;
  updatedAt: number | null;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);
  const fresh = connected && updatedAt !== null && now - updatedAt <= 15000;
  const minutes = m.lastSeenOnlineAt
    ? Math.max(0, Math.floor((now - m.lastSeenOnlineAt) / 60000))
    : 0;
  const ago =
    minutes < 1
      ? 'mindre än en minut'
      : minutes < 60
        ? `${minutes} min`
        : minutes < 1440
          ? `${Math.floor(minutes / 60)} timmar`
          : `${Math.floor(minutes / 1440)} dagar`;
  return (
    <>
      {!fresh && <small>Inaktuell information</small>}
      {fresh && m.isOnline ? (
        <small className="success">{m.isAfk ? 'AFK nu · uppskattat' : 'Online nu'}</small>
      ) : (
        <small>
          Senast sedd online:{' '}
          {m.lastSeenOnlineAt ? (
            <>
              <span>för {ago} sedan</span> ·{' '}
              <time
                dateTime={new Date(m.lastSeenOnlineAt).toISOString()}
                title={new Date(m.lastSeenOnlineAt).toLocaleString('sv-SE')}
              >
                {new Date(m.lastSeenOnlineAt).toLocaleString('sv-SE')}
              </time>
            </>
          ) : (
            'Okänt'
          )}
        </small>
      )}
    </>
  );
}
