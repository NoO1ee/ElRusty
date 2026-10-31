import type { LiveService } from './service.ts';
import type { MapData, WorldSnapshot, ServerInfo } from '../shared/world.ts';
import { eventNames } from '../shared/world.ts';
import { insist } from './validation.ts';
export class LiveWorld {
  state: WorldSnapshot = {
    profileId: null,
    info: null,
    map: null,
    markers: [],
    updatedAt: null,
    error: '',
  };
  private image: Uint8Array | null = null;
  private timer: ReturnType<typeof setInterval> | undefined;
  private generation = 0;
  private busy = false;
  private previous: Set<number> | null = null;
  private loading: Promise<void> | null = null;
  constructor(private service: LiveService) {
    service.world = this;
  }
  snapshot() {
    return this.state;
  }
  select(id: string) {
    if (this.state.profileId !== id) {
      this.state = {
        profileId: id,
        info: null,
        map: null,
        markers: [],
        updatedAt: null,
        error: '',
      };
      this.image = null;
    }
    this.service.changed();
  }
  stop() {
    this.generation++;
    clearInterval(this.timer);
    this.previous = null;
    this.busy = false;
    this.loading = null;
  }
  connected(info: ServerInfo | void) {
    this.stop();
    this.select(this.service.config.activeProfileId!);
    if (info) {
      const old = this.state.info;
      if (
        old &&
        (old.wipeTime !== info.wipeTime || old.seed !== info.seed || old.mapSize !== info.mapSize)
      ) {
        this.state.map = null;
        this.image = null;
        this.state.markers = [];
      }
      this.state.info = info;
    }
    const gen = this.generation;
    void this.refresh(gen);
    this.timer = setInterval(() => void this.refresh(gen), 5000);
  }
  private async refresh(gen: number) {
    if (gen !== this.generation || this.busy || this.service.connection !== 'connected') return;
    this.busy = true;
    try {
      const { adapter } = this.service.liveSession();
      if (!adapter.markers) return;
      const markers = await adapter.markers();
      if (gen !== this.generation) return;
      const events = markers.filter((m) => eventNames[m.type]);
      const ids = new Set(events.map((m) => m.id));
      if (this.previous) {
        for (const marker of events)
          if (!this.previous.has(marker.id)) {
            const entry = this.service.log('info', `${eventNames[marker.type]} synlig på kartan.`);
            if (entry) this.service.emit('worldEvent', entry);
          }
        for (const marker of this.state.markers)
          if (eventNames[marker.type] && this.previous.has(marker.id) && !ids.has(marker.id)) {
            const entry = this.service.log(
              'info',
              `${eventNames[marker.type]} syns inte längre på kartan.`,
            );
            if (entry) this.service.emit('worldEvent', entry);
          }
      }
      this.previous = ids;
      this.state.markers = markers;
      this.state.updatedAt = Date.now();
      this.state.error = '';
      this.service.changed();
    } catch {
      if (gen === this.generation) {
        this.state.error = 'Kunde inte uppdatera kartmarkörer.';
        this.service.changed();
      }
    } finally {
      if (gen === this.generation) this.busy = false;
    }
  }
  async load() {
    if (this.state.map && this.image) return;
    if (this.loading) return this.loading;
    const { adapter } = this.service.liveSession(),
      gen = this.generation;
    insist(adapter.map, 'Serverkartan stöds inte av anslutningen.');
    const pending = (async () => {
      try {
        const map: MapData = await adapter.map!();
        if (gen !== this.generation) return;
        insist(
          map.jpgImage.length > 0 &&
            map.jpgImage.length <= 12_000_000 &&
            map.width > 0 &&
            map.height > 0 &&
            map.oceanMargin >= 0 &&
            map.oceanMargin * 2 < Math.min(map.width, map.height),
          'Ogiltig kartbild.',
        );
        const size = this.state.info?.mapSize;
        insist(size && size > 0, 'Kartstorlek saknas.');
        this.image = map.jpgImage;
        this.state.map = {
          revision: crypto.randomUUID(),
          width: map.width,
          height: map.height,
          oceanMargin: map.oceanMargin,
          mapSize: size,
          monuments: map.monuments,
        };
        this.state.error = '';
        this.service.changed();
      } catch {
        if (gen === this.generation) {
          this.state.error = 'Kartan kunde inte hämtas. Försök igen när servern är ansluten.';
          this.service.changed();
        }
        throw Error('Kartan kunde inte hämtas.');
      } finally {
        if (gen === this.generation) this.loading = null;
      }
    })();
    this.loading = pending;
    return pending;
  }
  bytes(revision: string) {
    return this.state.map?.revision === revision ? this.image : null;
  }
  async refreshInfo() {
    const { adapter, gen } = this.service.liveSession();
    const info = await adapter.info();
    this.service.assertSession(gen);
    if (info) {
      this.state.info = info;
      this.service.changed();
    }
    return this.state.info;
  }
}
