import { isIP } from 'node:net';
import { insist } from './validation.ts';
import {
  serverRegions,
  wipeDays,
  selectedWipe,
  type DirectoryQuery,
  type DirectoryServer,
  type DirectoryResult,
  type DirectoryWipe,
} from '../shared/servers.ts';
const SOURCE = 'https://wipeboard.net/api/servers',
  MAX_BYTES = 24 * 1024 * 1024;
const integer = (n: unknown, max = 100000): n is number =>
  Number.isSafeInteger(n) && Number(n) >= 0 && Number(n) <= max;
const timestamp = (v: unknown) =>
  typeof v === 'string' && Number.isFinite(Date.parse(v)) ? Date.parse(v) : null;
export function parseDirectoryQuery(params: URLSearchParams): DirectoryQuery {
  const q = (params.get('q') || '').trim(),
    region = params.get('region') || 'EU',
    day = params.get('day') || 'all',
    sort = params.get('sort') || 'players-desc';
  const minText = params.get('minPlayers') || '0',
    pageText = params.get('page') || '1';
  insist(q.length <= 80 && !/[\u0000-\u001f]/.test(q), 'Söktexten är för lång eller ogiltig.');
  insist(
    Object.hasOwn(serverRegions, region) && Object.hasOwn(wipeDays, day),
    'Ogiltig region eller wipedag.',
  );
  insist(['players-desc', 'players-asc', 'wipe', 'name'].includes(sort), 'Ogiltig sortering.');
  insist(/^\d{1,6}$/.test(minText) && /^\d{1,5}$/.test(pageText), 'Ogiltig population eller sida.');
  const minPlayers = Number(minText),
    page = Number(pageText);
  insist(integer(minPlayers) && page >= 1 && page <= 10000, 'Ogiltig population eller sida.');
  return {
    q,
    region: region as DirectoryQuery['region'],
    day: day as DirectoryQuery['day'],
    minPlayers,
    sort: sort as DirectoryQuery['sort'],
    page,
  };
}
export function normalizeDirectory(payload: any, now: number) {
  insist(
    payload && Array.isArray(payload.data) && payload.data.length <= 50000,
    'Ogiltig serverlista.',
  );
  const updatedAt = timestamp(payload.fetchedAt);
  insist(
    updatedAt !== null && updatedAt <= now + 300000,
    'Serverlistans tidsstämpel saknas eller är ogiltig.',
  );
  const seen = new Set<string>(),
    servers: DirectoryServer[] = [];
  for (const row of payload.data) {
    if (
      !row ||
      typeof row.id !== 'string' ||
      !/^[-_a-zA-Z0-9]{1,64}$/.test(row.id) ||
      seen.has(row.id) ||
      typeof row.n !== 'string' ||
      !row.n.trim() ||
      typeof row.ip !== 'string' ||
      !isIP(row.ip) ||
      !integer(row.pt, 65535) ||
      !row.pt ||
      !integer(row.p) ||
      !integer(row.mp)
    )
      continue;
    const wipes: DirectoryWipe[] = [];
    // Only explicit owner-entered schedules count as declared. 'query'/'detected' are predictions.
    if (row.src === 'user')
      for (const wipe of Array.isArray(row.wipes) ? row.wipes.slice(0, 32) : []) {
        const at = timestamp(wipe?.t);
        if (at === null || at < now - 86400000 || at > now + 366 * 86400000) continue;
        const kind = ['map', 'bp', 'full'].includes(wipe.k) ? wipe.k : 'unknown';
        if (!wipes.some((w) => w.at === at && w.kind === kind)) wipes.push({ at, kind });
      }
    wipes.sort((a, b) => a.at - b.at);
    seen.add(row.id);
    servers.push({
      id: row.id,
      name: row.n
        .replace(/[\u0000-\u001f]/g, ' ')
        .trim()
        .slice(0, 180),
      host: row.ip,
      port: row.pt,
      region: Object.hasOwn(serverRegions, row.rg) && row.rg !== 'all' ? row.rg : null,
      country: typeof row.c === 'string' && /^[A-Z]{2}$/.test(row.c) ? row.c : '',
      players: row.p,
      maxPlayers: row.mp,
      queue: integer(row.q) ? row.q : null,
      wipes,
      scheduleSource:
        row.src === 'user'
          ? 'declared'
          : row.src === 'query' || row.src === 'detected'
            ? 'estimated'
            : 'unknown',
      lastWipeAt: timestamp(row.born),
      sourceUrl:
        typeof row.path === 'string' && /^\/server\/[-_a-zA-Z0-9]{1,240}$/.test(row.path)
          ? 'https://wipeboard.net' + row.path
          : 'https://wipeboard.net',
    });
  }
  insist(!payload.data.length || servers.length > 0, 'Serverlistans format känns inte igen.');
  return { servers, updatedAt };
}
export class ServerDirectory {
  private cache: { servers: DirectoryServer[]; updatedAt: number; retrievedAt: number } | null =
    null;
  private pending: Promise<void> | null = null;
  private failedAt: number | null = null;
  constructor(
    private fetcher: typeof fetch = fetch,
    private now = () => Date.now(),
  ) {}
  private async refresh() {
    if (this.pending) return this.pending;
    if (this.failedAt !== null && this.now() - this.failedAt < 60000) return;
    this.pending = (async () => {
      try {
        const response = await this.fetcher(SOURCE, {
          headers: {
            Accept: 'application/json',
            'User-Agent': 'ElRusty/0.20 (+https://github.com/NoO1ee/ElRusty)',
          },
          redirect: 'error',
          signal: AbortSignal.timeout(15000),
        });
        if (!response.ok || !response.body) throw Error('Source unavailable');
        const reader = response.body.getReader(),
          decoder = new TextDecoder();
        let size = 0,
          text = '';
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > MAX_BYTES) {
              await reader.cancel();
              throw Error('Source too large');
            }
            text += decoder.decode(value, { stream: true });
          }
          text += decoder.decode();
        } finally {
          reader.releaseLock();
        }
        const result = normalizeDirectory(JSON.parse(text), this.now());
        this.cache = { ...result, retrievedAt: this.now() };
        this.failedAt = null;
      } catch {
        this.failedAt = this.now();
      }
    })().finally(() => {
      this.pending = null;
    });
    return this.pending;
  }
  async list(params: URLSearchParams): Promise<DirectoryResult> {
    const query = parseDirectoryQuery(params);
    if (!this.cache || this.now() - this.cache.retrievedAt >= 300000) await this.refresh();
    if (!this.cache) throw Error('Serverlistan kunde inte hämtas. Försök igen om en stund.');
    const now = this.now(),
      search = query.q.toLocaleLowerCase('sv-SE');
    const rows = this.cache.servers
      .filter(
        (s) =>
          (query.region === 'all' || s.region === query.region) &&
          s.players >= query.minPlayers &&
          (!search || s.name.toLocaleLowerCase('sv-SE').includes(search)),
      )
      .map((s) => ({ ...s, displayWipe: selectedWipe(s, query.day, now) }))
      .filter((s) => query.day === 'all' || s.displayWipe);
    rows.sort((a, b) => {
      const tie = a.name.localeCompare(b.name, 'sv-SE') || a.id.localeCompare(b.id);
      if (query.sort === 'players-desc') return b.players - a.players || tie;
      if (query.sort === 'players-asc') return a.players - b.players || tie;
      if (query.sort === 'wipe')
        return (a.displayWipe?.at ?? Infinity) - (b.displayWipe?.at ?? Infinity) || tie;
      return tie;
    });
    const pages = Math.max(1, Math.ceil(rows.length / 50)),
      page = Math.min(query.page, pages),
      stale = this.failedAt !== null || now - this.cache.updatedAt > 900000;
    return {
      servers: rows.slice((page - 1) * 50, page * 50),
      total: rows.length,
      page,
      pages,
      updatedAt: this.cache.updatedAt,
      retrievedAt: this.cache.retrievedAt,
      stale,
      warning: stale ? 'Uppgifterna kan vara inaktuella. Senast tillgängliga lista visas.' : '',
      source: 'Wipe Board',
    };
  }
}
