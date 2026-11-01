export type TimerChannel = 'rust' | 'discord';
export type TimerDelivery = 'pending' | 'attempting' | 'sent' | 'missed' | 'unconfirmed';
export interface LiveTimer {
  id: string;
  shortId: string;
  profileId: string;
  name: string;
  creatorId: string;
  creatorName: string;
  createdAt: number;
  dueAt: number;
  state: 'active' | 'expired' | 'cancelled';
  finishedAt: number | null;
  rust: TimerDelivery;
  discord: TimerDelivery;
}
export interface CreateTimerInput {
  duration: string;
  name: string;
}
export interface CancelTimerInput {
  id: string;
}
export function parseTimerDuration(value: unknown): number {
  if (typeof value !== 'string' || value.length > 32) throw Error('Ange tid som 15m eller 1h30m.');
  const match = /^(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i.exec(value.trim());
  if (!match || !match.slice(1).some((v) => v !== undefined))
    throw Error('Ange tid med s, m, h eller d i fallande ordning, till exempel 1h30m.');
  const ms = match
    .slice(1)
    .reduce((sum, v, i) => sum + Number(v || 0) * [86400000, 3600000, 60000, 1000][i], 0);
  if (!Number.isSafeInteger(ms) || ms < 10000 || ms > 604800000)
    throw Error('Timern måste vara mellan 10 sekunder och 7 dagar.');
  return ms;
}
export function timerRemaining(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  if (s >= 86400) return Math.floor(s / 86400) + ' d ' + Math.floor((s % 86400) / 3600) + ' h';
  if (s >= 3600) return Math.floor(s / 3600) + ' h ' + Math.floor((s % 3600) / 60) + ' min';
  if (s >= 60) return Math.floor(s / 60) + ' min ' + (s % 60) + ' s';
  return s + ' s';
}
