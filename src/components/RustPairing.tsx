import type { PairingStatus } from '../../shared/live';
import { Radio, Check, X, ArrowRight } from 'lucide-react';
export function RustPairing({
  status,
  disabled,
  act,
}: {
  status?: PairingStatus;
  disabled: boolean;
  act: (path: string, body?: unknown) => Promise<void>;
}) {
  const pair = status || {
    status: 'idle',
    hasRegistration: false,
    running: false,
    message: 'Registrera Rust+ för att ta emot serverparningar.',
    candidates: [],
  };
  return (
    <section className="live-panel pairing-guide" aria-label="Guidad Rust+-parning">
      <div className="pairing-title">
        <span className="pairing-symbol">
          <Radio size={23} />
        </span>
        <div>
          <div className="eyebrow">REKOMMENDERAT</div>
          <h2>Anslut med Rust+</h2>
        </div>
      </div>
      <p>
        Koppla ditt Rust+-konto och ta emot servern direkt här. Ingen terminal eller kopiering av
        token behövs.
      </p>
      <ol className="pairing-steps">
        <li className={pair.hasRegistration ? 'done' : ''}>
          <span>{pair.hasRegistration ? <Check size={16} /> : 1}</span>
          <div>
            <h3>Registrera Rust+</h3>
            <p>
              Ett separat fönster i Brave, Chrome eller Edge öppnas för Steam-inloggning. När du är
              klar återgår du hit.
            </p>
            <button
              className={pair.hasRegistration ? '' : 'primary'}
              disabled={disabled || pair.running}
              onClick={() => void act('pairing/register')}
            >
              {pair.hasRegistration ? 'Registrera på nytt' : 'Registrera Rust+'}
            </button>
          </div>
        </li>
        <li className={pair.status === 'listening' ? 'current' : ''}>
          <span>2</span>
          <div>
            <h3>Para din server i spelet</h3>
            <p>
              Starta mottagningen här. Öppna sedan{' '}
              <strong>Rust → Esc → Rust+ → Pair with Server</strong> på servern du spelar på.
            </p>
            <button
              className={pair.hasRegistration ? 'primary' : ''}
              disabled={disabled || pair.running || !pair.hasRegistration}
              onClick={() => void act('pairing/listen')}
            >
              Vänta på server
            </button>
          </div>
        </li>
        <li>
          <span>3</span>
          <div>
            <h3>Kontrollera och anslut</h3>
            <p>
              Servern visas nedan när parningen kommer fram. Välj den för att spara och kontrollera
              anslutningen.
            </p>
          </div>
        </li>
      </ol>
      <div
        className={'pairing-status ' + (pair.status === 'error' ? 'live-error' : '')}
        role="status"
      >
        <span className={pair.running ? 'pairing-pulse' : ''} />
        {pair.message}
      </div>
      {status?.warning && (
        <p className="live-muted-banner" role="status">
          {status.warning}
        </p>
      )}
      {pair.running && (
        <button disabled={disabled} onClick={() => void act('pairing/cancel')}>
          <X size={14} /> Avbryt parning
        </button>
      )}
      {!!pair.candidates.length && (
        <div className="pairing-candidates">
          {pair.candidates.map((c) => (
            <article key={c.id}>
              <div>
                <strong>{c.name}</strong>
                <small>
                  {c.host}:{c.port}
                </small>
              </div>
              <button
                className="primary"
                disabled={disabled}
                onClick={() => void act('pairing/accept', { id: c.id })}
              >
                Lägg till och anslut <ArrowRight size={14} />
              </button>
            </article>
          ))}
        </div>
      )}
      <small>
        Registreringen görs normalt en gång. Därefter använder du Vänta på server för varje ny
        server. Rust+-appen behöver inte vara öppen; parningen görs från spelet.
      </small>
    </section>
  );
}
