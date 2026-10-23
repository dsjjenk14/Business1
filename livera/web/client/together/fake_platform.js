// A stand-in for the artifact platform's `room`, `db` and `user` capabilities, for tests and local runs of
// "Play together" (together/index.html). Every tab of this origin in one browser profile is one "person": the room
// is a BroadcastChannel, the database is IndexedDB (transactions make the lease atomic across tabs), and who you
// are comes from the page's address:
//
//   together/?as=<id>&level=<owner|admin|interact|view>&name=<display name>&space=<isolates a test run>&drop=<0..1>
//
// It enforces what the type definitions promise and the page relies on: topics not declared "interact" are
// admin-only (`not_permitted`), messages over 4 KiB are refused, about 40 sends a second (more are dropped and
// reported once), the sender's `peer`/`by` stamped on delivery, presence under 4 KiB, documents under 256 KiB, the
// db rules by level (an unreadable document reads as missing, an unwritable one rejects `invalid_argument`), and
// leases. `drop` loses that share of room deliveries, to exercise the link's resends. The published artifact
// never loads this file: the platform provides `window.claude` there.

// What the artifact declares when it is published (web/README.md, "Play together"); this stand-in enforces it.
export const CAPABILITIES = Object.freeze({
  room: { topics: { up: "interact" } },
  db: { rules: [
    { path: "town", read: "admin", write: "admin" },
    { path: "town/host", read: "view", write: "admin" },
  ] },
  user: { scopes: ["profile"] },
});

const LEVELS = { view: 0, interact: 1, admin: 2, owner: 3 };
const enc = new TextEncoder();
const bytesOf = v => enc.encode(JSON.stringify(v)).length;
const rid = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), b => "abcdefghijklmnopqrstuvwxyz234567"[b & 31]).join("");
const err = (code, message) => Object.assign(new Error(message), { code, message });
const deepFreeze = v => { if (v && typeof v === "object" && !Object.isFrozen(v)) { Object.freeze(v); for (const k of Object.keys(v)) deepFreeze(v[k]); } return v; };
const clone = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

function identity() {
  const q = new URLSearchParams(location.search);
  let uid = q.get("as");
  if (!uid) {
    try { uid = sessionStorage.getItem("livera-fake-as"); } catch { /* no storage */ }
    if (!uid) { uid = `u_${rid()}`; try { sessionStorage.setItem("livera-fake-as", uid); } catch { /* no storage */ } }
  }
  const level = LEVELS[q.get("level")] !== undefined ? q.get("level") : "admin";
  return { uid, level, name: q.get("name") || uid, space: q.get("space") || "default", drop: Math.min(1, Math.max(0, Number(q.get("drop")) || 0)) };
}

export function installFakePlatform(capabilities = CAPABILITIES) {
  const me = identity();
  const myPeer = rid() + rid();
  const bus = new BroadcastChannel(`livera-fake:${me.space}`);
  const local = new Set();   // in-tab subscribers to bus messages (a BroadcastChannel doesn't hear itself)
  const post = msg => { bus.postMessage(msg); for (const fn of local) setTimeout(() => fn(msg), 0); };
  bus.onmessage = e => { for (const fn of local) fn(e.data); };
  const level = LEVELS[me.level];
  const canTopic = topic => level >= LEVELS.admin || (capabilities.room && capabilities.room.topics && LEVELS[capabilities.room.topics[topic]] !== undefined && level >= LEVELS[capabilities.room.topics[topic]]);
  const by = capabilities.user ? me.uid : null;

  // ---------------------------------------------------------------- names (for user.profiles)
  const names = new Map([[me.uid, me.name]]);
  local.add(m => { if (m.t === "who") names.set(m.uid, m.name); });
  const announce = () => post({ t: "who", uid: me.uid, name: me.name });

  // ---------------------------------------------------------------- room
  const listeners = new Map();
  const peerMap = new Map();   // peer -> {peer, by, presence, updatedAt, seen}
  let presence = {};
  let snapshot = Object.freeze([]);
  const peerFns = new Set();
  let change = { joined: [], left: [], updated: [] }, changeTimer = null, firstDelivery = new Set();
  let tokens = 80, lastRefill = performance.now(), reportedDrop = false;
  const frozenPeer = p => Object.freeze({ peer: p.peer, by: p.by, isMe: p.by !== null && p.by === by, sameTab: p.peer === myPeer, kind: "viewer", guest: false,
    presence: deepFreeze(clone(p.presence) || {}), updatedAt: p.updatedAt });
  const rebuild = () => { snapshot = Object.freeze([...peerMap.values()].map(p => p.frozen)); };
  const queueChange = (kind, frozen) => {
    change[kind].push(frozen);
    if (!changeTimer) changeTimer = setTimeout(() => {
      changeTimer = null;
      const c = change; change = { joined: [], left: [], updated: [] };
      const out = Object.freeze({ peers: snapshot, joined: Object.freeze(c.joined), left: Object.freeze(c.left), updated: Object.freeze(c.updated) });
      for (const fn of peerFns) { if (firstDelivery.has(fn)) continue; try { fn(out); } catch (e) { console.warn(e); } }
    }, 16);
  };
  const upsert = (peer, pby, pres) => {
    const old = peerMap.get(peer);
    const p = { peer, by: pby, presence: pres || {}, updatedAt: old && JSON.stringify(old.presence) === JSON.stringify(pres || {}) ? old.updatedAt : Date.now(), seen: performance.now() };
    p.frozen = old && old.updatedAt === p.updatedAt ? old.frozen : frozenPeer(p);
    peerMap.set(peer, p);
    if (!old || old.frozen !== p.frozen) { rebuild(); queueChange(old ? "updated" : "joined", p.frozen); }
  };
  const remove = peer => { const p = peerMap.get(peer); if (!p) return; peerMap.delete(peer); rebuild(); queueChange("left", p.frozen); };
  upsert(myPeer, by, presence);
  local.add(m => {
    if (!m || m.peer === myPeer) return;
    if (m.t === "hi" || m.t === "beat" || m.t === "presence") upsert(m.peer, m.by, m.presence);
    if (m.t === "hi") post({ t: "beat", peer: myPeer, by, presence });
    if (m.t === "bye") remove(m.peer);
    if (m.t === "msg") {
      if (!peerMap.has(m.peer)) upsert(m.peer, m.by, {});
      if (me.drop && Math.random() < me.drop) return;   // a lossy room: the link must send again
      const msg = Object.freeze({ topic: m.topic, data: deepFreeze(m.data), peer: m.peer, by: m.by, isMe: m.by !== null && m.by === by, sameTab: false, kind: "viewer", guest: false });
      for (const fn of listeners.get(m.topic) || []) { try { fn(msg); } catch (e) { console.warn(e); } }
    }
  });
  setInterval(() => {
    post({ t: "beat", peer: myPeer, by, presence });
    const t = performance.now();
    for (const [peer, p] of [...peerMap]) if (peer !== myPeer && t - p.seen > 4000) remove(peer);
  }, 1000);
  addEventListener("pagehide", () => post({ t: "bye", peer: myPeer }));

  const room = Object.freeze({
    emit(topic, data) {
      if (typeof topic !== "string" || !/^[a-z][a-z0-9_.-]{0,47}$/.test(topic)) return Promise.reject(err("invalid_argument", "topic grammar"));
      let size;
      try { size = bytesOf(data ?? null); } catch { return Promise.reject(err("invalid_argument", "not JSON")); }
      if (size > 4096) return Promise.reject(err("invalid_argument", `data is ${size} bytes; at most 4096`));
      if (!canTopic(topic)) return Promise.reject(err("not_permitted", `this viewer may not send on "${topic}"`));
      const t = performance.now();
      tokens = Math.min(80, tokens + (t - lastRefill) / 1000 * 40); lastRefill = t;
      if (tokens < 1) {
        if (!reportedDrop) { reportedDrop = true; reportError(new Error("room: emits past ~40/s were dropped")); }
        return Promise.resolve();
      }
      tokens -= 1;
      const payload = clone(data ?? null);
      post({ t: "msg", topic, data: payload, peer: myPeer, by });
      // Your own message comes back to you, isMe && sameTab (and post() delivered it to this tab's bus listeners,
      // which skip it: echoes come here).
      setTimeout(() => {
        const msg = Object.freeze({ topic, data: deepFreeze(clone(payload)), peer: myPeer, by, isMe: true, sameTab: true, kind: "viewer", guest: false });
        for (const fn of listeners.get(topic) || []) { try { fn(msg); } catch (e) { console.warn(e); } }
      }, 0);
      return Promise.resolve();
    },
    on(topic, handler) {
      if (typeof handler !== "function") throw new TypeError("handler must be a function");
      if (!listeners.has(topic)) listeners.set(topic, new Set());
      const fn = m => handler(m);
      listeners.get(topic).add(fn);
      return () => listeners.get(topic).delete(fn);
    },
    presence(patch) {
      const next = { ...presence };
      for (const [k, v] of Object.entries(patch || {})) { if (v === null) delete next[k]; else next[k] = clone(v); }
      if (bytesOf(next) > 4096) return Promise.reject(err("invalid_argument", "presence over 4 KiB"));
      presence = next;
      upsert(myPeer, by, presence);
      post({ t: "presence", peer: myPeer, by, presence });
      return Promise.resolve();
    },
    peers() { return snapshot; },
    onPeers(handler) {
      const fn = c => handler(c);
      peerFns.add(fn); firstDelivery.add(fn);
      queueMicrotask(() => setTimeout(() => {
        firstDelivery.delete(fn);
        try { handler(Object.freeze({ peers: snapshot, joined: snapshot, left: Object.freeze([]), updated: Object.freeze([]) })); } catch (e) { console.warn(e); }
      }, 0));
      return () => { peerFns.delete(fn); firstDelivery.delete(fn); };
    },
    connected() { return true; },
    onConnection(handler) { queueMicrotask(() => handler(true)); return () => {}; },
  });

  // ---------------------------------------------------------------- db (IndexedDB, shared by every tab)
  const dbName = `livera-fake-db:${me.space}`;
  const opened = new Promise((resolve, reject) => {
    const r = indexedDB.open(dbName, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore("docs", { keyPath: "path" }); r.result.createObjectStore("leases", { keyPath: "path" }); };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  const tx = async (stores, mode, fn) => {
    const idb = await opened;
    return new Promise((resolve, reject) => {
      const t = idb.transaction(stores, mode);
      let out;
      t.oncomplete = () => resolve(out);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || err("unavailable", "transaction aborted"));
      const req = (store, op, arg) => new Promise((res, rej) => { const q = t.objectStore(store)[op](arg); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
      Promise.resolve(fn(req)).then(v => { out = v; }, e => { try { t.abort(); } catch { /* done */ } reject(e); });
    });
  };
  const rules = (capabilities.db && capabilities.db.rules) || [];
  const segs = p => (p ? p.split("/") : []);
  const allowed = (path, action) => {
    let need = action === "read" ? "view" : "interact", depth = -1;
    for (const r of rules) {
      const rs = segs(r.path), ps = segs(path);
      if (rs.length > ps.length || !rs.every((s, i) => s === ps[i])) continue;
      // The deepest rule that sets this action decides; a level a rule leaves unset is inherited from above.
      if (rs.length >= depth && r[action] !== undefined) { need = r[action]; depth = rs.length; }
    }
    return level >= LEVELS[need];
  };
  const checkPath = (path, wantDoc) => {
    const parts = path.split("/");
    if (!path || parts.some(s => !/^[A-Za-z0-9_\-.~:@+]{1,200}$/.test(s) || s === "." || s === "..") || parts.length > 16)
      throw new TypeError(`bad path "${path}"`);
    if ((parts.length % 2 === 0) !== wantDoc) throw new TypeError(`"${path}" has ${parts.length} segments: ${wantDoc ? "a document needs an even number" : "a collection needs an odd number"}`);
  };
  const docListeners = new Map();   // path -> Set(fn)
  local.add(m => { if (m.t === "db") for (const fn of docListeners.get(m.path) || []) fn(); });
  const changed = path => post({ t: "db", path });
  const snap = (id, rec) => Object.freeze({ id, exists: !!rec, data: () => (rec ? deepFreeze(clone(rec.data)) : undefined), metadata: Object.freeze({ fromCache: false, hasPendingWrites: false }) });
  const merge = (a, b) => { const out = { ...(a || {}) }; for (const [k, v] of Object.entries(b || {})) out[k] = v && typeof v === "object" && !Array.isArray(v) && out[k] && typeof out[k] === "object" && !Array.isArray(out[k]) ? merge(out[k], v) : clone(v); return out; };
  const checkBody = data => {
    if (!data || typeof data !== "object" || Array.isArray(data)) throw err("invalid_argument", "a document body is an object");
    const n = bytesOf(data);
    if (n > 256 * 1024) throw err("invalid_argument", `the document is ${n} bytes; at most 262144`);
  };
  function docRef(path) {
    checkPath(path, true);
    const id = path.split("/").pop();
    const read = () => tx(["docs"], "readonly", q => q("docs", "get", path));
    return Object.freeze({
      id, path,
      async get() { return snap(id, allowed(path, "read") ? await read() : undefined); },
      async set(data) {
        if (!allowed(path, "write")) throw err("invalid_argument", `this viewer may not write ${path}`);
        checkBody(data);
        await tx(["docs"], "readwrite", async q => { const old = await q("docs", "get", path); await q("docs", "put", { path, data: clone(data), version: (old ? old.version : 0) + 1 }); });
        changed(path);
      },
      async update(data) {
        if (!allowed(path, "write")) throw err("invalid_argument", `this viewer may not write ${path}`);
        await tx(["docs"], "readwrite", async q => {
          const old = await q("docs", "get", path);
          if (!old) throw err("invalid_argument", `${path} doesn't exist`);
          const next = merge(old.data, data);
          checkBody(next);
          await q("docs", "put", { path, data: next, version: old.version + 1 });
        });
        changed(path);
      },
      async delete() {
        if (!allowed(path, "write")) throw err("invalid_argument", `this viewer may not write ${path}`);
        await tx(["docs"], "readwrite", q => q("docs", "delete", path));
        changed(path);
      },
      async acquire({ holder, ttlMs, data } = {}) {
        if (!allowed(path, "write")) throw err("invalid_argument", `this viewer may not write ${path}`);
        if (typeof holder !== "string" || !holder) throw err("invalid_argument", "holder is a string");
        const ttl = Math.min(600000, Math.max(1000, Number(ttlMs) || 30000));
        const res = await tx(["docs", "leases"], "readwrite", async q => {
          const now = Date.now();
          const lease = await q("leases", "get", path);
          if (lease && lease.expiresAt > now && lease.holder !== holder) return { acquired: false, expiresAt: new Date(lease.expiresAt).toISOString() };
          await q("leases", "put", { path, holder, expiresAt: now + ttl });
          const old = await q("docs", "get", path);
          let version = old ? old.version : 0;
          if (data) { const next = merge(old ? old.data : {}, data); checkBody(next); version += 1; await q("docs", "put", { path, data: next, version }); }
          return { acquired: true, version, expiresAt: new Date(now + ttl).toISOString(), holder, wrote: !!data };
        });
        if (res.wrote) changed(path);
        delete res.wrote;
        return res;
      },
      onSnapshot(next, onError) {
        let last = null, live = true;
        const deliver = async () => {
          try {
            const rec = allowed(path, "read") ? await read() : undefined;
            const v = rec ? rec.version : 0;
            if (!live || v === last) return;
            last = v;
            next(snap(id, rec));
          } catch (e) { if (live && onError) { live = false; onError(err("unavailable", String(e && e.message))); } }
        };
        if (!docListeners.has(path)) docListeners.set(path, new Set());
        docListeners.get(path).add(deliver);
        setTimeout(deliver, 0);
        return () => { live = false; docListeners.get(path).delete(deliver); };
      },
      collection(sub) { return collectionRef(`${path}/${sub}`); },
    });
  }
  function collectionRef(path) {
    checkPath(path, false);
    return Object.freeze({ path, doc: id => docRef(`${path}/${id || rid()}`), async add(data) { const d = docRef(`${path}/${rid()}`); await d.set(data); return d; } });
  }
  const db = Object.freeze({ doc: docRef, collection: collectionRef });

  // ---------------------------------------------------------------- user
  const avatar = n => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" rx="16" fill="#2e4636"/><text x="16" y="21" font-size="13" text-anchor="middle" fill="#e6c994">${String(n || "?").slice(0, 1).replace(/[<&>]/g, "")}</text></svg>`)}`;
  const profile = id => Object.freeze({ id, name: capabilities.user && capabilities.user.scopes && capabilities.user.scopes.includes("profile") ? names.get(id) || "" : "",
    avatarUrl: avatar(names.get(id)), color: "#c9a96e", email: null, isMe: id === me.uid, guest: false });
  const user = Object.freeze({
    async isOwner() { return me.level === "owner"; },
    async canEdit() { return level >= LEVELS.admin; },
    async can(name) { return name === "data.write" ? level >= LEVELS.interact : false; },
    async id() { return capabilities.user ? me.uid : null; },
    async me() { const p = profile(me.uid); return Object.freeze({ id: capabilities.user ? me.uid : null, name: p.name, avatarUrl: p.avatarUrl, color: p.color, email: null, isOwner: me.level === "owner", canEdit: level >= LEVELS.admin }); },
    async profiles(ids) { const out = {}; for (const id of [].concat(ids)) out[id] = profile(id); return out; },
    async name() { return profile(me.uid).name; },
  });

  const namespaces = { room, db, user };
  globalThis.claude = Object.freeze({
    use(name) { return new Promise(resolve => setTimeout(() => resolve(capabilities[name] && namespaces[name] ? namespaces[name] : null), 0)); },
  });
  globalThis.LIVERA_FAKE_PLATFORM = Object.freeze({ uid: me.uid, level: me.level, name: me.name, space: me.space, drop: me.drop, peer: myPeer });
  announce();
  setInterval(announce, 3000);
  post({ t: "hi", peer: myPeer, by, presence });
}

// The page loads this module first; it only stands in when no platform is there.
if (!globalThis.claude) installFakePlatform();
