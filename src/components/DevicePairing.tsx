import type { PairingStatus } from '../../shared/live';
export function DevicePairing({
  status,
  profileId,
  connected,
  disabled,
  act,
}: {
  status?: PairingStatus;
  profileId: string | null;
  connected: boolean;
  disabled: boolean;
  act: (path: string, body?: unknown) => Promise<void>;
}) {
  const devices = (status?.devices || []).filter((d) => d.profileId === profileId);
  return (
    <section className="live-panel" aria-label="Enhetsparning">
      <h2>Para enheter med Rust+</h2>
      <p>
        Para din Smart Switch, Smart Alarm eller Storage Monitor i spelet. Nya enheter visas här med
        namn och Entity-ID. Klicka Lägg till för att verifiera och spara.
      </p>
      <p className="muted">
        {status?.message || 'Registrera Rust+ under Inställningar för att ta emot parningar.'}
      </p>
      {!status?.running && status?.hasRegistration && (
        <button disabled={disabled} onClick={() => void act('pairing/listen')}>
          Starta mottagning
        </button>
      )}
      <div className="pairing-candidates">
        {devices.map((d) => (
          <article key={d.id}>
            <div>
              <strong>{d.name}</strong>
              <small>
                {d.entityType === 1
                  ? 'Smart Switch'
                  : d.entityType === 2
                    ? 'Smart Alarm'
                    : 'Storage Monitor'}{' '}
                · Entity-ID: {d.entityId}
              </small>
            </div>
            <button
              className="primary"
              disabled={disabled || !connected || d.expiresAt <= Date.now()}
              onClick={() => void act('pairing/device/accept', { id: d.id })}
            >
              Lägg till
            </button>
          </article>
        ))}
      </div>
      {!devices.length && (
        <small>
          Inga nya enhetsförslag för vald profil. Mottagningen startar automatiskt med tjänsten när
          Rust+ är registrerat.
        </small>
      )}
    </section>
  );
}
