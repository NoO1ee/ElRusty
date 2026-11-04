// ElRusty contributors. MIT license; implementation written independently.
using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json;
using Oxide.Core.Libraries;
using UnityEngine;

namespace Oxide.Plugins
{
    [Info("ElRustyEvents", "ElRusty contributors", "0.19.0")]
    [Description("Reports Cargo, Patrol Helicopter and Oil Rig events to a private ElRusty receiver.")]
    public class ElRustyEvents : RustPlugin
    {
        private Settings settings;
        private bool ready, busy, baseline = true;
        private float lastGood;
        private long sequence;
        private readonly string session = Guid.NewGuid().ToString();
        private readonly Dictionary<string, Entry> entries = new Dictionary<string, Entry>();
        private class Settings { public string Endpoint = "http://127.0.0.1:5184/ingest"; public string ProfileId = ""; public string Key = ""; }
        private class Entry
        {
            public string id, type, status;
            public float x, y;
            public long? startedAt;
            public float? spawnX, spawnY;
            [JsonIgnore] public BaseEntity entity;
            [JsonIgnore] public int revision;
        }
        protected override void LoadDefaultConfig() { Config.WriteObject(new Settings(), true); }
        private void Init()
        {
            try { settings = Config.ReadObject<Settings>(); }
            catch { PrintError("Invalid private plugin configuration."); }
        }
        private void OnServerInitialized()
        {
            Uri endpoint;
            if (settings == null || !Uri.TryCreate(settings.Endpoint, UriKind.Absolute, out endpoint) ||
                endpoint.Scheme != "http" || endpoint.Host != "127.0.0.1" || endpoint.Port != 5184 ||
                endpoint.AbsolutePath != "/ingest" || !string.IsNullOrEmpty(endpoint.UserInfo) ||
                string.IsNullOrEmpty(settings.ProfileId) || settings.Key == null || settings.Key.Length != 64)
            { PrintError("Configure ElRustyEvents.json with the private configuration from ElRusty. Receiver must be localhost:5184/ingest."); return; }
            ready = true;
            foreach (var entity in BaseNetworkable.serverEntities.OfType<BaseEntity>())
            {
                Track(entity, false);
                var crate = entity as HackableLockedCrate;
                if (crate != null && (crate.IsBeingHacked() || crate.IsFullyHacked()))
                    TrackCrate(crate, crate.IsFullyHacked() ? "unlocked" : "hacking", false);
            }
            timer.Every(5f, Send);
            Send();
        }
        private static long Now() { return DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(); }
        private string Id(BaseEntity entity) { return entity.net.ID.Value.ToString(); }
        private void Position(Entry entry)
        {
            if (entry.entity == null || entry.entity.IsDestroyed) return;
            var p = entry.entity.transform.position;
            entry.x = p.x + ConVar.Server.worldsize / 2f;
            entry.y = p.z + ConVar.Server.worldsize / 2f;
        }
        private void Track(BaseEntity entity, bool spawned)
        {
            if (!ready || entity == null || entity.net == null || entries.Count >= 100) return;
            var type = entity is CargoShip ? "cargo" : entity.ShortPrefabName == "patrolhelicopter" ? "heli" : null;
            if (type == null || entries.ContainsKey(Id(entity))) return;
            var entry = new Entry { id = Id(entity), type = type, status = "active", entity = entity };
            Position(entry);
            if (spawned) { entry.startedAt = Now(); entry.spawnX = entry.x; entry.spawnY = entry.y; }
            entries[entry.id] = entry;
        }
        private string Rig(HackableLockedCrate crate)
        {
            // Never classify cargo or transported crates by proximity alone.
            if (crate.GetParentEntity() is CargoShip) return null;
            foreach (var monument in TerrainMeta.Path.Monuments)
            {
                string name = monument.name.ToLowerInvariant();
                string type = name.Contains("oilrig_1") || name.Contains("oil_rig_small") ? "smalloil" :
                    name.Contains("oilrig_2") || name.Contains("large_oil_rig") ? "largeoil" : null;
                if (type != null && monument.Bounds.Contains(monument.transform.InverseTransformPoint(crate.transform.position))) return type;
            }
            return null;
        }
        private void TrackCrate(HackableLockedCrate crate, string status, bool observed)
        {
            if (!ready || crate == null || crate.net == null) return;
            var type = Rig(crate); if (type == null) return;
            Entry entry;
            if (!entries.TryGetValue(Id(crate), out entry))
            {
                if (entries.Count >= 100) return;
                entry = new Entry { id = Id(crate), type = type, entity = crate };
                entries[entry.id] = entry;
            }
            if (observed && status == "hacking") entry.startedAt = Now();
            entry.status = status; entry.revision++; Position(entry);
        }
        private void OnEntitySpawned(BaseNetworkable entity) { if (ready) NextTick(() => Track(entity as BaseEntity, true)); }
        private void OnCrateHack(HackableLockedCrate crate) { TrackCrate(crate, "hacking", true); }
        private void OnCrateHackEnd(HackableLockedCrate crate) { TrackCrate(crate, "unlocked", true); }
        private void OnEntityDeath(BaseCombatEntity entity, HitInfo hit)
        {
            Entry entry;
            if (ready && entity != null && entity.net != null && entries.TryGetValue(Id(entity), out entry))
            { Position(entry); entry.status = "destroyed"; entry.revision++; }
        }
        private void OnEntityKill(BaseNetworkable entity)
        {
            var e = entity as BaseEntity; Entry entry;
            if (ready && e != null && e.net != null && entries.TryGetValue(Id(e), out entry) && entry.status != "destroyed")
            { Position(entry); entry.status = "ended"; entry.revision++; }
        }
        private void Send()
        {
            if (!ready || busy) return;
            foreach (var entry in entries.Values) Position(entry);
            if (UnityEngine.Time.realtimeSinceStartup - lastGood > 15f) baseline = true;
            var terminal = entries.Values.Where(e => e.status == "ended" || e.status == "destroyed").ToDictionary(e => e.id, e => e.revision);
            var payload = JsonConvert.SerializeObject(new {
                version = 1, profileId = settings.ProfileId, sessionId = session, sequence = ++sequence,
                sentAt = Now(), baseline = baseline,
                identity = new { mapSize = ConVar.Server.worldsize, seed = ConVar.Server.seed,
                    wipeTime = new DateTimeOffset(SaveRestore.SaveCreatedTime.ToUniversalTime()).ToUnixTimeSeconds() },
                events = entries.Values.ToArray()
            }, new JsonSerializerSettings { NullValueHandling = NullValueHandling.Ignore });
            busy = true;
            webrequest.Enqueue(settings.Endpoint, payload, (code, response) => {
                busy = false;
                if (!ready) return;
                if (code != 200) { baseline = true; return; }
                lastGood = UnityEngine.Time.realtimeSinceStartup; baseline = false;
                foreach (var old in terminal) {
                    Entry current;
                    if (entries.TryGetValue(old.Key, out current) && current.revision == old.Value) entries.Remove(old.Key);
                }
            }, this, RequestMethod.POST, new Dictionary<string,string> {
                { "Authorization", "Bearer " + settings.Key }, { "Content-Type", "application/json" }
            }, 3f);
        }
        private void Unload() { ready = false; entries.Clear(); }
    }
}
