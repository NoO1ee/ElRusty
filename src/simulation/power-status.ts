import type { ComponentDefinition } from '../model';
export function powerStatus(def: ComponentDefinition, input: number) {
  const consumes =
    !['battery', 'source'].includes(def.behavior) &&
    def.ports.some((p) => p.name === 'Power In' && p.kind === 'power');
  return !consumes
    ? null
    : input === 0
      ? 'missing'
      : input < Math.max(1, def.watts)
        ? 'insufficient'
        : null;
}
