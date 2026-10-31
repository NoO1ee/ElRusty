import { imagePosition } from './world';
const names: Record<string, string> = {
  launchsite: 'Launch Site',
  airfield: 'Airfield',
  harbor: 'Harbor',
  'harbor 2': 'Harbor',
  'water treatment plant': 'Water Treatment Plant',
  'power plant': 'Power Plant',
  'train yard': 'Train Yard',
  'military tunnels': 'Military Tunnels',
  sewer: 'Sewer Branch',
  'bandit camp': 'Bandit Camp',
  outpost: 'Outpost',
  dome: 'The Dome',
  'satellite dish': 'Satellite Dish',
  junkyard: 'Junkyard',
  excavator: 'Giant Excavator',
  abandonedmilitarybase: 'Abandoned Military Base',
  'arctic base a': 'Arctic Research Base',
  apartmentcomplex: 'Abandoned Apartments',
  'missile silo monument': 'Missile Silo',
  ferryterminal: 'Ferry Terminal',
  'large fishing village': 'Large Fishing Village',
  'fishing village': 'Fishing Village',
  'oil rig small': 'Small Oil Rig',
  'large oil rig': 'Large Oil Rig',
  'underwater lab': 'Underwater Labs',
  'jungle ziggurat': 'Jungle Ziggurat',
  'mining quarry sulfur': 'Sulfur Quarry',
  'mining quarry stone': 'Stone Quarry',
  'mining quarry hqm': 'HQM Quarry',
  'gas station': 'Gas Station',
  'mining outpost': 'Mining Outpost',
  supermarket: 'Supermarket',
  lighthouse: 'Lighthouse',
  'stables a': 'Stables',
  'stables b': 'Stables',
  radtown: 'Radtown',
};
export function monumentName(token: string) {
  const key = token
    .replace(/_display_name|_monument_name/g, '')
    .replaceAll('_', ' ')
    .trim()
    .toLowerCase();
  return names[key] || key.replace(/\b\w/g, (s) => s.toUpperCase());
}
export function majorMonument(token: string) {
  return /launch|airfield|harbor|water.treatment|power.plant|train.yard|military|outpost|bandit|dome|excavator|arctic|missile|oil.rig|ziggurat/.test(
    token.toLowerCase().replaceAll('_', ' '),
  );
}
/** Suppress internal/underground labels at overview scale, then avoid overlapping names. */
export function monumentLabels<T extends { token: string; x: number; y: number }>(
  items: T[],
  map: { width: number; height: number; oceanMargin: number; mapSize: number },
  view: { x: number; y: number; z: number },
  unit: number,
) {
  const boxes: { x: number; y: number; w: number; h: number }[] = [];
  const u = unit / view.z;
  return items
    .map((m, index) => ({ ...m, index, name: monumentName(m.token) }))
    .filter(
      (m) =>
        m.name &&
        !/^(monument|dungeonbase)$/i.test(m.name) &&
        (!/train.tunnel|swamp/i.test(m.name) || view.z >= 4),
    )
    .sort(
      (a, b) =>
        Number(majorMonument(b.token)) - Number(majorMonument(a.token)) || a.index - b.index,
    )
    .filter((m) => {
      const p = imagePosition(m.x, m.y, map),
        w = Math.max(44, m.name.length * 5.9) * u,
        h = 22 * u;
      if (
        p.x < view.x - 10 * u ||
        p.x > view.x + map.width / view.z + 10 * u ||
        p.y < view.y - 10 * u ||
        p.y > view.y + map.height / view.z + 10 * u
      )
        return false;
      const box = { x: p.x - w / 2, y: p.y - h / 2, w, h };
      if (
        boxes.some(
          (b) =>
            box.x < b.x + b.w && box.x + box.w > b.x && box.y < b.y + b.h && box.y + box.h > b.y,
        )
      )
        return false;
      boxes.push(box);
      return true;
    });
}
