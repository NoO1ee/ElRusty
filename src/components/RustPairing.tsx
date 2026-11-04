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
  const pair: PairingStatus = status || {
    status: 'idle',
    hasRegistration: false,
    running: false,
    message: 'Registrera Rust+ för att ta emot serverparningar.',
    candidates: [],
  };
  if (pair.hasRegistration)
    return (
      <section className="live-panel pairing-guide" aria-label="Guidad Rust+-parning">
        <h2>Para en ny server</h2>
        <p>
          Öppna Rust → Esc → Rust+ → Pair with Server. Serverförslaget visas här; enhetsförslag
          finns under Enheter.
        </p>
        <p role="status">{pair.message}</p>
        {pair.warning && <p className="live-muted-banner">{pair.warning}</p>}
        <div className="live-actions">
          <button disabled={disabled || pair.running} onClick={() => void act('pairing/listen')}>
            Vänta på server
          </button>
          {pair.running && (
            <button disabled={disabled} onClick={() => void act('pairing/cancel')}>
              Avbryt parning
            </button>
          )}
        </div>
        {pair.candidates.map((c) => (
          <article className="live-profile" key={c.id}>
            <div>
              <strong>{c.name}</strong>
              <small>
                {c.host}:{c.port}
              </small>
            </div>
            <button disabled={disabled} onClick={() => void act('pairing/accept', { id: c.id })}>
              Lägg till och anslut
            </button>
          </article>
        ))}
        <details>
          <summary>Registrering och felsökning</summary>
          <p>
            Registreringen är sparad. Registrera på nytt endast om kontot eller
            anslutningsuppgifterna behöver förnyas.
          </p>
          {pair.canRegister === false && (
            <p>
              ElRusty körs utan skrivbord, till exempel på Pi. Förnya registreringen på din
              Windows-dator och flytta den privata registreringen säkert till Pi:n. Den befintliga
              mottagningen fungerar utan webbläsare.
            </p>
          )}
          <button
            disabled={disabled || pair.status === 'registering' || pair.canRegister === false}
            onClick={() => void act('pairing/register')}
          >
            Registrera på nytt
          </button>
        </details>
      </section>
    );
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
        {pair.canRegister === false
          ? 'ElRusty körs på Pi eller en dator utan skrivbord. Brave på din Windows-dator kan inte öppnas av Pi-tjänsten. Registrera på Windows-datorn och flytta den privata Rust+-registreringen säkert till Pi:n; därefter tar den emot parningar här.'
          : 'Koppla ditt Rust+-konto och ta emot servern direkt här. Ingen kopiering av token behövs.'}
      </p>
      <ol className="pairing-steps">
        <li className={pair.hasRegistration ? 'done' : ''}>
          <span>{pair.hasRegistration ? <Check size={16} /> : 1}</span>
          <div>
            <h3>Registrera Rust+</h3>
            <p>
              {pair.canRegister === false
                ? 'Inloggning kräver en lokal ElRusty-tjänst på datorn med Brave, Chrome eller Edge. SSH-tunneln öppnar inte någon webbläsare på datorn. Har du redan registrerat där kan den privata konfigurationen återanvändas.'
                : 'Ett separat fönster i Brave, Chrome eller Edge öppnas på datorn där tjänsten körs. När du är klar återgår du hit.'}
            </p>
            <button
              className={pair.hasRegistration ? '' : 'primary'}
              disabled={disabled || pair.status === 'registering' || pair.canRegister === false}
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
              Mottagningen startar automatiskt när tjänsten är igång. Öppna sedan{' '}
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
        Registreringen görs normalt en gång. Därefter lyssnar tjänsten automatiskt efter server- och
        enhetsparningar, även med stängd webbläsare. Avbryt parning pausar mottagningen till nästa
        tjänstestart eller tills du startar den igen. Nya enheter visas under Live → Enheter.
      </small>
    </section>
  );
}
