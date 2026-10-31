import { create } from 'zustand';
import type { LiveSnapshot } from '../shared/live';
export const useLive = create<{ data: LiveSnapshot | null; offline: boolean; csrf: string }>(
  () => ({ data: null, offline: true, csrf: '' }),
);
let generation = 0;
export async function refreshLive() {
  const gen = generation;
  try {
    const res = await fetch('/api/live/state');
    if (!res.ok) throw Error();
    const data = await res.json();
    if (typeof data.csrf !== 'string') throw Error();
    if (gen === generation) useLive.setState({ data, csrf: data.csrf, offline: false });
  } catch {
    if (gen === generation) useLive.setState({ offline: true });
  }
}
export function startLive() {
  const gen = ++generation;
  void refreshLive();
  const stream = new EventSource('/api/live/events');
  stream.onopen = () => void refreshLive();
  stream.onmessage = (e) => {
    if (gen !== generation) return;
    try {
      const data = JSON.parse(e.data);
      if (!['connected', 'connecting', 'reconnecting', 'disconnected'].includes(data.connection))
        throw Error();
      useLive.setState({ data, offline: false });
      if (!useLive.getState().csrf) void refreshLive();
    } catch {
      useLive.setState({ offline: true });
    }
  };
  stream.onerror = () => {
    if (gen === generation) useLive.setState({ offline: true });
  };
  return () => {
    if (gen === generation) generation++;
    stream.close();
  };
}
export async function liveAction(path: string, body: unknown = {}) {
  if (!useLive.getState().csrf) await refreshLive();
  const csrf = useLive.getState().csrf;
  if (!csrf) throw Error('Live-tjänsten är inte tillgänglig.');
  const res = await fetch('/api/live/' + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-ElRusty-CSRF': csrf },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw Error(data.error || 'Begäran misslyckades.');
  await refreshLive();
  return data;
}
export function liveStatus(data: LiveSnapshot | null, offline: boolean) {
  return offline
    ? 'Tjänsten saknas'
    : !data
      ? 'Frånkopplad'
      : {
          connected: 'Ansluten',
          connecting: 'Ansluter',
          reconnecting: 'Återansluter',
          disconnected: 'Frånkopplad',
        }[data.connection];
}
