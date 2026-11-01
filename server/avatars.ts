// Only Steam IDs from the active team are accepted by the HTTP layer.
const hosts = new Set([
  'companion-rust.facepunch.com',
  'avatars.steamstatic.com',
  'avatars.akamai.steamstatic.com',
  'steamcdn-a.akamaihd.net',
  'steamuserimages-a.akamaihd.net',
]);
export class Avatars {
  private cache = new Map<string, { bytes: Uint8Array; type: string; expires: number }>();
  private pending = new Map<string, Promise<{ bytes: Uint8Array; type: string }>>();
  async get(id: string) {
    const cached = this.cache.get(id);
    if (cached && cached.expires > Date.now()) return cached;
    if (this.pending.has(id)) return this.pending.get(id)!;
    const work = this.load(id)
      .then((value) => {
        if (this.cache.size >= 200) this.cache.delete(this.cache.keys().next().value!);
        this.cache.set(id, { ...value, expires: Date.now() + 86400000 });
        return value;
      })
      .finally(() => this.pending.delete(id));
    this.pending.set(id, work);
    return work;
  }
  private async load(id: string) {
    if (!/^\d{17}$/.test(id) || this.pending.size >= 4) throw Error('Avatar unavailable');
    const signal = AbortSignal.timeout(5000);
    let url = new URL('https://companion-rust.facepunch.com/api/avatar/' + id);
    for (let n = 0; n < 4; n++) {
      if (
        url.protocol !== 'https:' ||
        !hosts.has(url.hostname) ||
        url.port ||
        url.username ||
        url.password
      )
        throw Error('Avatar unavailable');
      const res = await fetch(url, { redirect: 'manual', signal });
      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const next = res.headers.get('location');
        await res.body?.cancel();
        if (!next) throw Error('Avatar unavailable');
        url = new URL(next, url);
        continue;
      }
      const type = (res.headers.get('content-type') || '').split(';')[0];
      if (!res.ok || !['image/jpeg', 'image/png', 'image/webp'].includes(type)) {
        await res.body?.cancel();
        throw Error('Avatar unavailable');
      }
      const reader = res.body?.getReader();
      if (!reader) throw Error('Avatar unavailable');
      const chunks: Uint8Array[] = [];
      let length = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > 1000000) {
          await reader.cancel();
          throw Error('Avatar unavailable');
        }
        chunks.push(value);
      }
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const c of chunks) {
        bytes.set(c, offset);
        offset += c.length;
      }
      return { bytes, type };
    }
    throw Error('Avatar unavailable');
  }
}
