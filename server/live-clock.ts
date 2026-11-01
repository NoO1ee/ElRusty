import type { RustTimeInfo } from '../shared/time.ts';
import type { LiveService } from './service.ts';
import { formatTime } from './service.ts';
import { TimeLearner } from './time-learning.ts';
export class LiveClock {
  private generation = 0;
  private timer: ReturnType<typeof setInterval> | undefined;
  private pending: Promise<RustTimeInfo> | undefined;
  private learner = new TimeLearner();
  private profileId: string | null = null;
  private wipeKey = '';
  constructor(
    private service: LiveService,
    private monotonic = () => performance.now(),
  ) {}
  start(profileId: string, wipeKey: string) {
    this.stop();
    this.profileId = profileId;
    this.wipeKey = wipeKey;
    const saved = this.service.config.timeCalibrations?.[profileId];
    this.learner = new TimeLearner(saved?.wipeKey === wipeKey ? saved.calibration : undefined);
    if (saved && saved.wipeKey !== wipeKey) this.persist();
    this.timer = setInterval(() => void this.read().catch(() => {}), 5000);
    this.timer.unref();
  }
  stop() {
    this.generation++;
    clearInterval(this.timer);
    this.timer = undefined;
    this.pending = undefined;
    this.profileId = null;
    this.learner.interrupt();
  }
  private persist() {
    if (!this.profileId) return;
    this.service.config.timeCalibrations ??= {};
    const data = this.learner.snapshot();
    if (data && (data.day.length || data.night.length))
      this.service.config.timeCalibrations[this.profileId] = {
        wipeKey: this.wipeKey,
        calibration: data,
      };
    else delete this.service.config.timeCalibrations[this.profileId];
    this.service.db.save(this.service.config);
  }
  read(): Promise<RustTimeInfo> {
    if (this.pending) return this.pending;
    if (!this.profileId || this.service.connection !== 'connected')
      return Promise.reject(Error('Frånkopplad.'));
    const { adapter } = this.service.liveSession(),
      gen = this.generation;
    const request = adapter
      .timeInfo()
      .then((info) => {
        if (gen !== this.generation) throw Error('Frånkopplad.');
        this.learner.observe(info, this.monotonic());
        if (this.learner.takeDirty()) this.persist();
        return info;
      })
      .catch(() => {
        if (gen === this.generation) this.learner.interrupt();
        throw Error('Kunde inte hämta speltiden.');
      })
      .finally(() => {
        if (gen === this.generation) this.pending = undefined;
      });
    this.pending = request;
    return request;
  }
  async reply() {
    try {
      const info = await this.read(),
        time = formatTime(info.time);
      if (info.timeScale === 0) return `Speltid: ${time} · Tiden är fryst.`;
      const estimate = this.learner.estimate(info);
      if (!estimate || !Number.isFinite(estimate.milliseconds))
        return `Speltid: ${time} · Tid till dag/natt kunde inte beräknas.`;
      const amount =
        estimate.milliseconds < 60000
          ? 'mindre än 1 min'
          : `${Math.ceil(estimate.milliseconds / 60000)} min`;
      return `Speltid: ${time} · ${estimate.next} om cirka ${amount} (${estimate.learned ? 'inlärt' : 'uppskattat'}).`;
    } catch {
      return 'Kunde inte hämta speltiden.';
    }
  }
}
