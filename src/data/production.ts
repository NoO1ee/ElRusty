// Documented item conversions, checked 2026-10-31. Keep timing data outside the engine.
export const smelting: Record<string, { item: string; output: number; seconds: number }> = {
  'metal.ore': { item: 'metal.fragments', output: 1, seconds: 2 },
  'sulfur.ore': { item: 'sulfur', output: 1, seconds: 1 },
  'hq.metal.ore': { item: 'metal.refined', output: 1, seconds: 4 },
  'can.beans.empty': { item: 'metal.fragments', output: 15, seconds: 6 },
  'can.tuna.empty': { item: 'metal.fragments', output: 10, seconds: 6 },
  honeycomb: { item: 'honey', output: 1, seconds: 0.4 },
};
