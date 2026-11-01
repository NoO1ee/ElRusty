import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { LiveSnapshot } from '../../shared/live';
import { liveAction } from '../live-store';
export function TeamChat({ data, offline }: { data: LiveSnapshot; offline: boolean }) {
  const [text, setText] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const request = useRef<{ text: string; id: string } | null>(null),
    list = useRef<HTMLDivElement>(null);
  const owner = data.profiles.find((p) => p.id === data.activeProfileId)?.playerId,
    member = data.team.find((m) => m.steamId === owner);
  const connected =
    !offline && data.connection === 'connected' && !!member && data.teamUpdatedAt !== null;
  useEffect(() => {
    setText('');
    setError('');
    request.current = null;
  }, [data.activeProfileId]);
  useEffect(() => {
    const el = list.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 160)
      el.scrollTop = el.scrollHeight;
  }, [data.teamChat]);
  async function send(e: FormEvent) {
    e.preventDefault();
    if (!connected || busy || !text.trim()) return;
    setBusy(true);
    setError('');
    if (request.current?.text !== text) request.current = { text, id: crypto.randomUUID() };
    try {
      await liveAction('teamchat/send', { clientId: request.current.id, text });
      setText('');
      request.current = null;
    } catch {
      setError('Sändningen kunde inte bekräftas. Kontrollera chatten innan du försöker igen.');
    } finally {
      setBusy(false);
    }
  }
  const status = {
    received: '',
    pending: 'Skickar…',
    sent: 'Skickat',
    unconfirmed: 'Obekräftat',
    failed: 'Skickades inte',
  };
  return (
    <section className="live-panel live-chat" aria-label="Lagchatt">
      <h2>Lagchatt</h2>
      <div className="live-chat-lines" ref={list} role="log" aria-label="Lagmeddelanden">
        {(data.teamChat || []).map((m) => (
          <article key={m.id}>
            <div>
              <strong>{m.name}</strong>
              <time>
                {new Date(m.at).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}
              </time>
            </div>
            <p>{m.text}</p>
            {status[m.status] && (
              <small
                className={
                  m.status === 'failed' || m.status === 'unconfirmed' ? 'live-error' : 'muted'
                }
              >
                {status[m.status]}
              </small>
            )}
          </article>
        ))}
        {!data.teamChat?.length && <p className="muted">Inga lagmeddelanden ännu.</p>}
      </div>
      <form onSubmit={send}>
        <label className="live-field">
          <span>Meddelande till laget</span>
          <input
            maxLength={113}
            disabled={!connected || busy}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Skriv till ditt Rust-team…"
          />
        </label>
        <button className="primary" disabled={!connected || busy || !text.trim()}>
          Skicka till laget
        </button>
      </form>
      <small className="muted">
        Skickas som {member?.name || 'ditt parade Rust-konto'} med [Webb]. De senaste 100
        meddelandena hålls i minnet och sparas inte på disk.
      </small>
      {!connected && (
        <p className="live-muted-banner">Anslut till Rust+ för att skriva till laget.</p>
      )}
      {error && (
        <p className="live-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
