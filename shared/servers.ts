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
export const groupLimits = {
  all: 'Alla gruppstorlekar',
  '1': 'Solo (max 1)',
  '2': 'Duo (max 2)',
  '3': 'Trio (max 3)',
  '4': 'Quad (max 4)',
  '5': 'Max 5',
  '6': 'Max 6',
  '7': 'Max 7',
  '8': 'Max 8',
  '9plus': 'Gräns över 8',
  unknown: 'Ingen rapporterad gräns',
} as const;
export type GroupLimit = keyof typeof groupLimits;
export function groupLimitLabel(limit: number | null) {
  if (limit === null) return 'Gruppgräns okänd';
  return groupLimits[String(limit) as GroupLimit] || 'Max ' + limit + ' i grupp';
}
export type ServerRegion = keyof typeof serverRegions;
export type WipeDay = keyof typeof wipeDays;
export type DirectorySort = 'players-desc' | 'players-asc' | 'wipe' | 'name';
export interface DirectoryQuery {
  q: string;
  region: ServerRegion;
  day: WipeDay;
  group: GroupLimit;
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
  groupLimit: number | null;
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
  group: 'all',
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
