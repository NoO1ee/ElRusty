import type { RustTimeInfo, TimeCalibration } from '../shared/time.ts';
type Phase = 'day' | 'night';
interface Sample {
  info: RustTimeInfo;
  at: number;
  phase: Phase;
  progress: number;
}
interface PartialCurve {
  start: number;
  points: number[];
}
const wrap = (n: number) => ((n % 24) + 24) % 24;
const validHour = (n: number) => Number.isFinite(n) && n >= 0 && n <= 24;
export function validCycle(t: RustTimeInfo) {
  return (
    validHour(t.time) &&
    validHour(t.sunrise) &&
    validHour(t.sunset) &&
    wrap(t.sunset - t.sunrise) > 0 &&
    Number.isFinite(t.dayLengthMinutes) &&
    t.dayLengthMinutes > 0 &&
    Number.isFinite(t.timeScale) &&
    t.timeScale > 0
  );
}
function span(t: RustTimeInfo, p: Phase) {
  return p === 'day' ? wrap(t.sunset - t.sunrise) : wrap(t.sunrise - t.sunset);
}
export function phasePosition(t: RustTimeInfo): { phase: Phase; progress: number } {
  const day = wrap(t.time - t.sunrise),
    daySpan = span(t, 'day');
  return day < daySpan
    ? { phase: 'day', progress: day / daySpan }
    : { phase: 'night', progress: wrap(t.time - t.sunset) / span(t, 'night') };
}
const curveValid = (v: unknown): v is number[] =>
  Array.isArray(v) &&
  v.length === 21 &&
  v[0] === 0 &&
  v[20] > 0 &&
  v.every((n, i) => Number.isFinite(n) && n >= 0 && (!i || n >= v[i - 1]));
function restore(value: unknown): TimeCalibration | undefined {
  if (!value || typeof value !== 'object') return;
  const v = value as TimeCalibration;
  if (
    !v.reference ||
    !validCycle(v.reference) ||
    !Array.isArray(v.day) ||
    !Array.isArray(v.night) ||
    v.day.length > 3 ||
    v.night.length > 3 ||
    !v.day.every(curveValid) ||
    !v.night.every(curveValid)
  )
    return;
  return structuredClone(v);
}
function changed(a: RustTimeInfo, b: RustTimeInfo) {
  const hours = (x: number, y: number) => Math.min(wrap(x - y), wrap(y - x));
  return (
    Math.abs(b.dayLengthMinutes / a.dayLengthMinutes - 1) > 0.01 + 1e-10 ||
    Math.abs(b.timeScale / a.timeScale - 1) > 0.01 + 1e-10 ||
    hours(a.sunrise, b.sunrise) > 0.05 + 1e-10 ||
    hours(a.sunset, b.sunset) > 0.05 + 1e-10
  );
}
export class TimeLearner {
  private data: TimeCalibration | undefined;
  private previous: Sample | undefined;
  private partial: PartialCurve | undefined;
  private dirty = false;
  constructor(saved?: unknown) {
    this.data = restore(saved);
  }
  interrupt() {
    this.previous = undefined;
    this.partial = undefined;
  }
  reset() {
    if (this.data && (this.data.day.length || this.data.night.length)) this.dirty = true;
    this.data = undefined;
    this.interrupt();
  }
  takeDirty() {
    const d = this.dirty;
    this.dirty = false;
    return d;
  }
  snapshot(): TimeCalibration | undefined {
    return this.data && structuredClone(this.data);
  }
  private fill(from: number, fromAt: number, to: number, toAt: number) {
    const c = this.partial;
    if (!c || to <= from) return;
    while (c.points.length <= 20 && c.points.length / 20 <= to + 1e-10) {
      const p = c.points.length / 20;
      c.points.push(Math.max(0, fromAt + ((toAt - fromAt) * (p - from)) / (to - from) - c.start));
    }
  }
  observe(info: RustTimeInfo, at: number) {
    if (!validCycle(info) || !Number.isFinite(at)) {
      this.reset();
      return;
    }
    if (this.data && changed(this.data.reference, info)) this.reset();
    this.data ??= { reference: structuredClone(info), day: [], night: [] };
    const pos = phasePosition(info),
      next: Sample = { info, at, ...pos },
      prev = this.previous;
    if (prev) {
      const elapsed = at - prev.at,
        advance = wrap(info.time - prev.info.time);
      const expected =
        (elapsed / 1000 / ((prev.info.dayLengthMinutes * 60) / prev.info.timeScale)) * 24;
      if (elapsed <= 0 || elapsed > 15000) this.interrupt();
      else if (
        advance > Math.max(0.1, expected * 5) ||
        (pos.phase === prev.phase && pos.progress + 1e-10 < prev.progress)
      ) {
        this.reset();
        this.data = { reference: structuredClone(info), day: [], night: [] };
      } else if (pos.phase === prev.phase) {
        this.fill(prev.progress, prev.at, pos.progress, at);
      } else if (advance > 0) {
        const fraction = ((1 - prev.progress) * span(prev.info, prev.phase)) / advance;
        if (fraction < 0 || fraction > 1 + 1e-6) {
          this.reset();
          this.data = { reference: structuredClone(info), day: [], night: [] };
        } else {
          const boundary = prev.at + elapsed * Math.min(1, fraction);
          this.fill(prev.progress, prev.at, 1, boundary);
          if (this.partial && curveValid(this.partial.points)) {
            this.data[prev.phase].push(this.partial.points);
            this.data[prev.phase] = this.data[prev.phase].slice(-3);
            this.dirty = true;
          }
          this.partial = { start: boundary, points: [0] };
          this.fill(0, boundary, pos.progress, at);
        }
      }
    }
    if (!this.previous && pos.progress === 0) this.partial = { start: at, points: [0] };
    this.previous = next;
  }
  estimate(
    info: RustTimeInfo,
  ): { milliseconds: number; learned: boolean; next: 'Natt' | 'Dag' } | null {
    if (!validCycle(info)) return null;
    const { phase, progress } = phasePosition(info),
      rows = this.data?.[phase] || [];
    if (rows.length && this.data && !changed(this.data.reference, info)) {
      const median = Array.from({ length: 21 }, (_, i) => {
        const values = rows.map((r) => r[i]).sort((a, b) => a - b),
          m = Math.floor(values.length / 2);
        return values.length % 2 ? values[m] : (values[m - 1] + values[m]) / 2;
      });
      const x = progress * 20,
        low = Math.min(19, Math.floor(x));
      const used = median[low] + (median[low + 1] - median[low]) * (x - low);
      return {
        milliseconds: Math.max(0, median[20] - used),
        learned: true,
        next: phase === 'day' ? 'Natt' : 'Dag',
      };
    }
    return {
      milliseconds:
        (((((1 - progress) * span(info, phase)) / 24) * info.dayLengthMinutes) / info.timeScale) *
        60000,
      learned: false,
      next: phase === 'day' ? 'Natt' : 'Dag',
    };
  }
}
