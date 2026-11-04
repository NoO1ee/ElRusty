export const serverRegions = {
  all: 'Alla regioner',
  EU: 'Europa',
  NA: 'Nordamerika',
  SA: 'Sydamerika',
  AS: 'Asien',
  OC: 'Oceanien',
  ME: 'Mellanöstern',
  AF: 'Afrika',
} as const;
export const wipeDays = {
  all: 'Alla wipedagar',
  mon: 'Måndag',
  tue: 'Tisdag',
  wed: 'Onsdag',
  thu: 'Torsdag',
  fri: 'Fredag',
  sat: 'Lördag',
  sun: 'Söndag',
} as const;
export type ServerRegion = keyof typeof serverRegions;
export type WipeDay = keyof typeof wipeDays;
export type DirectorySort = 'players-desc' | 'players-asc' | 'wipe' | 'name';
export interface DirectoryQuery {
  q: string;
  region: ServerRegion;
  day: WipeDay;
  minPlayers: number;
  sort: DirectorySort;
  page: number;
}
export interface DirectoryWipe {
  at: number;
  kind: 'map' | 'bp' | 'full' | 'unknown';
}
export interface DirectoryServer {
  id: string;
  name: string;
  host: string;
  port: number;
  region: ServerRegion | null;
  country: string;
  players: number;
  maxPlayers: number;
  queue: number | null;
  wipes: DirectoryWipe[];
  scheduleSource: 'declared' | 'estimated' | 'unknown';
  lastWipeAt: number | null;
  sourceUrl: string;
}
export interface DirectoryResult {
  servers: (DirectoryServer & { displayWipe: DirectoryWipe | null })[];
  total: number;
  page: number;
  pages: number;
  updatedAt: number;
  retrievedAt: number;
  stale: boolean;
  warning: string;
  source: 'Wipe Board';
}
export const defaultDirectoryQuery: DirectoryQuery = {
  q: '',
  region: 'EU',
  day: 'all',
  minPlayers: 0,
  sort: 'players-desc',
  page: 1,
};
const weekday = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  timeZone: 'Europe/Stockholm',
});
export function selectedWipe(
  server: DirectoryServer,
  day: WipeDay,
  now: number,
): DirectoryWipe | null {
  if (server.scheduleSource !== 'declared') return null;
  return (
    server.wipes.find(
      (w) => w.at >= now && (day === 'all' || weekday.format(w.at).toLowerCase() === day),
    ) || null
  );
}
export function directoryParams(query: DirectoryQuery) {
  return new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)]));
}
