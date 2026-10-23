// The wire under "Play together": how the host's tab and each friend's tab talk through the artifact's room.
//
// The room is a poor wire, and this file makes it a good enough one:
//   - everyone in the room hears every message, so everything one person may know is encrypted for that person
//     alone (rule 5): each friend and the host agree a key (ECDH P-256, then HKDF-SHA-256 to one AES-GCM key per
//     direction), the host's public key pinned in the database (`town/host`, which only admins can write) and each
//     friend's announced in a `hello` the platform stamps with the sender's identity;
//   - messages drop, so frames are numbered, acknowledged and sent again, and delivered in order;
//   - a message carries at most 4 KiB, so a frame is gzipped (where the browser can) and split into chunks;
//   - a page may send about 40 messages a second (presence included), so every send waits its turn in one pacer
//     (25 a second), and while it is backed up a channel lets items pile into the next frame instead of the queue.
//
// Topics: friends send on `up`, which the artifact opens to Contributors ("interact"); the host sends on `down`,
// which stays admin-only, so no friend can pose as the host (the platform refuses the send), and a friend also
// checks that `down` messages come from the host's own `peer` as named in `town/host`.
//
// Frames carry "items": requests and leaving (friend to host), replies, events and the welcome (host to friend).
// What they mean is the business of host.js and transport_room.js; this file only moves them.

const enc = new TextEncoder();
const dec = new TextDecoder();
const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

export const PROTOCOL = "livera-together/1";
export const TOPIC_UP = "up";
export const TOPIC_DOWN = "down";

export const LIMITS = {
  messageBytes: 4096,     // the room's cap on one message's JSON text
  chunkChars: 3000,       // base64 characters of ciphertext per chunk: with its envelope a chunk stays under 4 KiB
  pacerRate: 25,          // messages a second this page sends (the room allows about 40, presence included)
  pacerBurst: 40,
  pacerBacklog: 30,       // a channel stops starting frames while this many messages wait in the pacer
  window: 12,             // frames in flight per channel before new items wait (and coalesce)
  frameBytes: 48 * 1024,  // items packed into one frame, before compression (one bigger item still goes alone)
  flushMs: 25,            // how long items wait for company before a frame goes
  ackMs: 40,              // how long an acknowledgement waits for company
  rtoMs: 700,             // first resend after this long without an acknowledgement, then 1.7x, at most rtoMaxMs
  rtoMaxMs: 4000,
  giveUpMs: 30000,        // a frame nobody acknowledged for this long is dropped (the receiver is told to skip it)
  gapMs: 40000,           // a backstop: a receiver holding later frames stops waiting for a missing one after this long
  rxAhead: 64,            // frames a receiver accepts beyond the next one it needs
};

// ------------------------------------------------------------------ bytes

export function b64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export function unb64(text) {
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
export function randomId(bytes = 9) {
  return b64(crypto.getRandomValues(new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const concat = (parts, total) => {
  const out = new Uint8Array(total ?? parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
};

// gzip where the browser has CompressionStream (all current ones do); a page can turn it off to test chunking.
const canGzip = () => typeof CompressionStream === "function" && typeof DecompressionStream === "function" && !globalThis.LIVERA_TOGETHER_NO_GZIP;

async function readAll(stream, maxBytes) {
  const reader = stream.getReader();
  const parts = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    // A tiny frame can unpack to gigabytes; stop reading long before that.
    if (total > maxBytes) { await reader.cancel().catch(() => {}); throw new Error("the frame unpacks to more than allowed"); }
    parts.push(value);
  }
  return concat(parts, total);
}
export async function gzipBytes(bytes) {
  return readAll(new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip")), Infinity);
}
export async function gunzipBytes(bytes, maxBytes) {
  return readAll(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip")), maxBytes);
}

// A JSON value as bytes: one leading byte says how (0 plain, 1 gzip).
export async function pack(value) {
  const raw = enc.encode(JSON.stringify(value));
  if (raw.length > 512 && canGzip()) {
    const z = await gzipBytes(raw);
    if (z.length + 1 < raw.length) return concat([Uint8Array.of(1), z]);
  }
  return concat([Uint8Array.of(0), raw]);
}
export async function unpack(bytes, maxBytes) {
  const body = bytes.subarray(1);
  let raw;
  if (bytes[0] === 0) raw = body;
  else if (bytes[0] === 1) raw = await gunzipBytes(body, maxBytes);
  else throw new Error("unknown frame encoding");
  if (raw.length > maxBytes) throw new Error("the frame is bigger than allowed");
  return JSON.parse(dec.decode(raw));
}

// ------------------------------------------------------------------ keys

// One key pair per page load; the private half never leaves WebCrypto (not extractable).
export function newKeyPair() {
  return crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
}
export async function publicKeyText(pair) {
  return b64(new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)));
}
// The two keys of one friend's channel, as `role` ("host" or "friend") uses them: `tx` to send, `rx` to read.
// The host's epoch salts the derivation and the friend's peer label is in it, so a key belongs to one hosting
// session and one open page; the two directions never share a key.
export async function channelKeys(pair, theirPublicText, { epoch, friendPeer, role }) {
  if (typeof theirPublicText !== "string" || theirPublicText.length > 200) throw new Error("bad public key");
  // importKey checks the point is on the curve.
  const theirs = await crypto.subtle.importKey("raw", unb64(theirPublicText), { name: "ECDH", namedCurve: "P-256" }, false, []);
  const bits = await crypto.subtle.deriveBits({ name: "ECDH", public: theirs }, pair.privateKey, 256);
  const hkdf = await crypto.subtle.importKey("raw", bits, "HKDF", false, ["deriveKey"]);
  const key = dir => crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: enc.encode(String(epoch)), info: enc.encode(`${PROTOCOL}|${dir}|${friendPeer}`) },
    hkdf, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  const [up, down] = await Promise.all([key("up"), key("down")]);
  const aad = dir => `${PROTOCOL}|${dir}|${epoch}|${friendPeer}`;
  return role === "host" ? { tx: down, rx: up, txAad: aad("down"), rxAad: aad("up") }
    : { tx: up, rx: down, txAad: aad("up"), rxAad: aad("down") };
}

// ------------------------------------------------------------------ the pacer

// Every message this page sends goes through here, at most `rate` a second. Acknowledgements and control messages
// (priority 0) go before frames (priority 1).
export class Pacer {
  constructor(emit, { rate = LIMITS.pacerRate, burst = LIMITS.pacerBurst } = {}) {
    this.emitFn = emit;
    this.rate = rate; this.burst = burst;
    this.tokens = burst; this.last = now();
    this.queues = [[], []];
    this.timer = null;
    this.sent = 0;
    this.onReject = null;   // (error, topic, data): a send the room refused
  }
  pending() { return this.queues[0].length + this.queues[1].length; }
  send(topic, data, priority = 1) { this.queues[priority ? 1 : 0].push([topic, data]); this.pump(); }
  // Forgets queued messages a closed channel no longer needs.
  drop(pred) { for (const q of this.queues) for (let i = q.length - 1; i >= 0; i--) if (pred(q[i][0], q[i][1])) q.splice(i, 1); }
  pump() {
    const t = now();
    this.tokens = Math.min(this.burst, this.tokens + (t - this.last) / 1000 * this.rate);
    this.last = t;
    while (this.tokens >= 1 && this.pending()) {
      const [topic, data] = (this.queues[0].length ? this.queues[0] : this.queues[1]).shift();
      this.tokens -= 1; this.sent++;
      let p;
      try { p = Promise.resolve(this.emitFn(topic, data)); } catch (e) { p = Promise.reject(e); }
      p.catch(e => { if (this.onReject) this.onReject(e, topic, data); });
    }
    if (this.pending() && !this.timer) {
      const wait = Math.max(5, Math.ceil((1 - this.tokens) / this.rate * 1000));
      this.timer = setTimeout(() => { this.timer = null; this.pump(); }, wait);
    }
  }
}

// ------------------------------------------------------------------ one channel: a reliable, encrypted pair

// This page's counts over every channel it has had (a channel's own `stats` end with it).
export const LINK_TOTALS = { framesOut: 0, framesIn: 0, chunksOut: 0, chunksIn: 0, retransmits: 0, lost: 0, gaps: 0, bad: 0, dups: 0 };

const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

// Items in, items out, between this page and one other. `header` goes on every message (the epoch, and on `down`
// the friend's peer); `keys` from channelKeys. `onItems(items)` gets each frame's items in order;
// `onTrouble(kind)` hears "lost" (we gave up on a frame), "gap" (we skipped one) and "bad" (one didn't decrypt).
export class Channel {
  constructor({ pacer, topic, header, keys, onItems, onTrouble, maxChunksIn = 32, maxBytesIn = 1 << 20 }) {
    this.pacer = pacer; this.topic = topic; this.header = header; this.keys = keys;
    this.onItems = onItems; this.onTrouble = onTrouble || (() => {});
    this.maxChunksIn = maxChunksIn; this.maxBytesIn = maxBytesIn;
    this.outbox = [];
    this.txSeq = 1;
    this.unacked = new Map();   // seq -> {seq, n, iv, chunks, first, last, tries, missing}
    this.peerCum = 0;           // the receiver has everything up to here (from its acknowledgements)
    this.gaveUp = 0;            // the highest frame we stopped sending
    this.floorSentAt = -1e9;
    this.rxCum = 0;             // every frame up to here has been delivered (or skipped)
    this.rxParts = new Map();   // seq -> {n, iv, parts, got, at}
    this.rxPending = new Set(); // complete, being decrypted
    this.rxReady = new Map();   // seq -> items (null: it didn't decrypt), waiting for the frames before it
    this.rxSkipped = new Set(); // frames we stopped waiting for
    this.rxSince = null;        // when we first held a frame past a missing one
    this.flushTimer = null; this.ackTimer = null; this.flushing = false; this.closed = false;
    this.stats = { framesOut: 0, framesIn: 0, chunksOut: 0, chunksIn: 0, retransmits: 0, lost: 0, gaps: 0, bad: 0, dups: 0 };
    this.timer = setInterval(() => this.check(), 200);
  }

  bump(key) { this.stats[key]++; LINK_TOTALS[key]++; }

  push(item) {
    if (this.closed) return;
    this.outbox.push(item);
    this.scheduleFlush(LIMITS.flushMs);
  }
  scheduleFlush(ms) {
    if (this.flushTimer || this.flushing || this.closed) return;
    this.flushTimer = setTimeout(() => { this.flushTimer = null; this.flush(); }, ms);
  }

  async flush() {
    if (this.closed || this.flushing || !this.outbox.length) return;
    if (this.unacked.size >= LIMITS.window) return;        // an acknowledgement starts the next one
    if (this.pacer.pending() > LIMITS.pacerBacklog) { this.scheduleFlush(60); return; }   // let items pile up instead
    this.flushing = true;
    // One frame takes items up to frameBytes (and always at least one).
    let size = 0, take = 0;
    for (const item of this.outbox) {
      const n = JSON.stringify(item).length;
      if (take && size + n > LIMITS.frameBytes) break;
      size += n; take++;
    }
    const items = this.outbox.splice(0, take);
    try {
      const seq = this.txSeq;
      const plain = await pack(items);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      // The chunk count is in the authenticated data, so it is fixed before encrypting: GCM adds 16 bytes.
      const n = Math.max(1, Math.ceil(4 * Math.ceil((plain.length + 16) / 3) / LIMITS.chunkChars));
      const ct = new Uint8Array(await crypto.subtle.encrypt(
        { name: "AES-GCM", iv, additionalData: enc.encode(`${this.keys.txAad}|${seq}|${n}`) }, this.keys.tx, plain));
      if (this.closed) return;
      const text = b64(ct);
      const chunks = [];
      for (let i = 0; i < n; i++) chunks.push(text.slice(i * LIMITS.chunkChars, (i + 1) * LIMITS.chunkChars));
      this.txSeq = seq + 1;
      const frame = { seq, n, iv: b64(iv), chunks, first: now(), last: 0, tries: 0, missing: null };
      this.unacked.set(seq, frame);
      this.bump("framesOut");
      this.sendChunks(frame, null);
    } catch (e) {
      console.warn("together: couldn't send a frame", e);
      this.onTrouble("bad");
    } finally {
      this.flushing = false;
      if (this.outbox.length) this.scheduleFlush(LIMITS.flushMs);
    }
  }

  // The lowest frame we will still send again: anything below it, the receiver can stop waiting for.
  floor() { let f = this.txSeq; for (const s of this.unacked.keys()) if (s < f) f = s; return f; }

  sendChunks(frame, only) {
    const idx = only ? [...only] : frame.chunks.map((_, i) => i);
    const f = this.floor();
    for (const i of idx) {
      this.pacer.send(this.topic, { v: 1, k: "c", ...this.header, s: frame.seq, i, n: frame.n, f, iv: frame.iv, d: frame.chunks[i] }, 1);
      this.bump("chunksOut");
    }
    frame.last = now(); frame.tries++;
  }

  // ------------------------------------------------------------------ receiving
  receive(d) {
    if (this.closed || !d || typeof d !== "object") return;
    if (d.k === "a") { this.onAck(d); return; }
    if (d.k === "f") {
      // The sender gave up on frames below `f` (they'd waited too long): stop waiting for them.
      if (isInt(d.f, 1, 2 ** 31) && d.f - 1 > this.rxCum && d.f - 1 <= this.rxCum + LIMITS.rxAhead) this.skipTo(d.f - 1);
      this.scheduleAck();
      return;
    }
    if (d.k !== "c") return;
    const { s, i, n, f, iv } = d;
    if (!isInt(s, 1, 2 ** 31) || !isInt(n, 1, this.maxChunksIn) || !isInt(i, 0, n - 1) || typeof d.d !== "string" ||
        d.d.length > LIMITS.chunkChars || typeof iv !== "string" || iv.length !== 16) return;
    this.bump("chunksIn");
    // The sender gave up on everything below `f`: stop waiting for it.
    if (isInt(f, 1, 2 ** 31) && f - 1 > this.rxCum && f <= s) this.skipTo(f - 1);
    if (s <= this.rxCum || this.rxReady.has(s) || this.rxPending.has(s) || this.rxSkipped.has(s)) { this.bump("dups"); this.scheduleAck(); return; }
    if (s - this.rxCum > LIMITS.rxAhead) return;
    let p = this.rxParts.get(s);
    if (!p) { p = { n, iv, parts: new Array(n), got: 0, at: now() }; this.rxParts.set(s, p); }
    if (p.n !== n || p.iv !== iv) return;   // not the frame we started collecting
    if (p.parts[i] === undefined) { p.parts[i] = d.d; p.got++; }
    if (s > this.rxCum + 1 && this.rxSince === null) this.rxSince = now();
    this.scheduleAck();
    if (p.got === p.n) {
      this.rxParts.delete(s);
      this.rxPending.add(s);
      this.open(s, p).then(items => {
        if (this.closed || !this.rxPending.delete(s)) return;
        this.rxReady.set(s, items);
        this.deliver();
      });
    }
  }

  async open(s, p) {
    try {
      const ct = unb64(p.parts.join(""));
      const plain = new Uint8Array(await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: unb64(p.iv), additionalData: enc.encode(`${this.keys.rxAad}|${s}|${p.n}`) }, this.keys.rx, ct));
      const items = await unpack(plain, this.maxBytesIn);
      if (!Array.isArray(items)) throw new Error("a frame holds an array of items");
      this.bump("framesIn");
      return items;
    } catch (e) {
      // Only the stamped sender can put chunks in this channel, so this is their bug or their mischief: count it,
      // acknowledge it (so it isn't sent forever) and deliver nothing.
      this.bump("bad");
      this.onTrouble("bad");
      return null;
    }
  }

  // Hands over frames in order. A frame still being decrypted holds the line; a skipped one is passed over.
  deliver() {
    for (;;) {
      const next = this.rxCum + 1;
      if (this.rxReady.has(next)) {
        this.rxCum = next;
        const items = this.rxReady.get(next);
        this.rxReady.delete(next);
        if (items) { try { this.onItems(items); } catch (e) { console.warn("together: an item handler failed", e); } }
      } else if (this.rxSkipped.has(next)) {
        this.rxCum = next;
        this.rxSkipped.delete(next);
      } else break;
    }
    const held = this.rxParts.size || this.rxPending.size || this.rxReady.size;
    this.rxSince = held ? (this.rxSince ?? now()) : null;
    this.scheduleAck();
  }

  // Stop waiting for frames up to `to` that haven't arrived whole: the sender gave up on them, or we did. Frames
  // we hold (whole, or being decrypted) still go out in order.
  skipTo(to) {
    for (let s = this.rxCum + 1; s <= to; s++) {
      if (this.rxReady.has(s) || this.rxPending.has(s) || this.rxSkipped.has(s)) continue;
      this.rxParts.delete(s);
      this.rxSkipped.add(s);
      this.bump("gaps");
      this.onTrouble("gap");
    }
    this.rxSince = null;
    this.deliver();
  }

  scheduleAck() {
    if (this.ackTimer || this.closed) return;
    this.ackTimer = setTimeout(() => { this.ackTimer = null; this.sendAck(); }, LIMITS.ackMs);
  }
  sendAck() {
    if (this.closed) return;
    const g = [...this.rxReady.keys(), ...this.rxPending].sort((a, b) => a - b).slice(0, 48);
    const m = {};
    let k = 0;
    for (const [s, p] of this.rxParts) {
      if (k++ >= 8) break;
      const missing = [];
      for (let i = 0; i < p.n && missing.length < 64; i++) if (p.parts[i] === undefined) missing.push(i);
      m[s] = missing;
    }
    this.pacer.send(this.topic, { v: 1, k: "a", ...this.header, c: this.rxCum, g, m }, 0);
  }

  onAck(a) {
    if (!isInt(a.c, 0, this.txSeq)) return;
    this.peerCum = Math.max(this.peerCum, a.c);
    for (const s of [...this.unacked.keys()]) if (s <= a.c) this.unacked.delete(s);
    if (Array.isArray(a.g)) for (const s of a.g.slice(0, 64)) this.unacked.delete(s);
    if (a.m && typeof a.m === "object") {
      for (const [key, list] of Object.entries(a.m).slice(0, 16)) {
        const frame = this.unacked.get(Number(key));
        if (frame && Array.isArray(list)) frame.missing = new Set(list.filter(i => isInt(i, 0, frame.n - 1)));
      }
    }
    if (this.outbox.length) this.scheduleFlush(0);
  }

  // Every 200 ms: send again what nobody acknowledged; give up on what's hopeless; stop waiting for a gap.
  check() {
    if (this.closed) return;
    const t = now();
    const busy = this.pacer.pending() > LIMITS.pacerBacklog;
    for (const frame of [...this.unacked.values()]) {
      if (t - frame.first > LIMITS.giveUpMs) {
        this.unacked.delete(frame.seq); this.gaveUp = Math.max(this.gaveUp, frame.seq);
        this.bump("lost"); this.onTrouble("lost");
        continue;
      }
      if (busy) continue;   // more messages on a backed-up pacer would only make it worse
      const rto = Math.min(LIMITS.rtoMaxMs, LIMITS.rtoMs * Math.pow(1.7, Math.max(0, frame.tries - 1)));
      if (t - frame.last > rto) {
        this.sendChunks(frame, frame.missing && frame.missing.size ? frame.missing : null);
        this.bump("retransmits");
      }
    }
    if (this.outbox.length && this.unacked.size < LIMITS.window) this.scheduleFlush(0);
    // Until the receiver's acknowledgements show it has stopped waiting for what we gave up on, say so once a
    // second (the notice can drop like anything else).
    if (this.gaveUp > this.peerCum && t - this.floorSentAt > 1000) {
      this.floorSentAt = t;
      this.pacer.send(this.topic, { v: 1, k: "f", ...this.header, f: this.floor() }, 0);
    }
    if (this.rxSince !== null && t - this.rxSince > LIMITS.gapMs) {
      const held = [...this.rxParts.keys(), ...this.rxPending, ...this.rxReady.keys()];
      const first = Math.min(...held);
      if (isFinite(first) && first > this.rxCum + 1) this.skipTo(first - 1);
      else this.rxSince = held.length ? t : null;
    }
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.timer); clearTimeout(this.flushTimer); clearTimeout(this.ackTimer);
    const header = this.header;
    this.pacer.drop((topic, data) => topic === this.topic && data && data.e === header.e && data.to === header.to && (data.k === "c" || data.k === "a" || data.k === "f"));
    this.outbox = []; this.unacked.clear(); this.rxParts.clear(); this.rxReady.clear(); this.rxPending.clear(); this.rxSkipped.clear();
  }
}

// ------------------------------------------------------------------ the friend's end

const pipeEvents = () => {
  const items = new Set(), states = new Set();
  return {
    items, states,
    onItem(fn) { items.add(fn); return () => items.delete(fn); },
    onState(fn) { states.add(fn); return () => states.delete(fn); },
    item(i) { for (const fn of items) { try { fn(i); } catch (e) { console.warn("together: item listener failed", e); } } },
    state(s) { for (const fn of states) { try { fn(s); } catch (e) { console.warn("together: state listener failed", e); } } },
  };
};

// A friend's connection to the host named in `town/host` ({peer, epoch, pub}). A pipe for transport_room.js:
// send(item), onItem(fn), onState(fn) ("connecting", "open", "closed" with a reason), close().
export class FriendEnd {
  constructor({ room, pacer, keyPair, publicKey, myPeer, host }) {
    this.room = room; this.pacer = pacer; this.keyPair = keyPair; this.publicKey = publicKey;
    this.myPeer = myPeer; this.host = { peer: host.peer, epoch: host.epoch, pub: host.pub };
    this.ev = pipeEvents();
    this.onItem = this.ev.onItem; this.onState = this.ev.onState;
    this.channel = null; this.welcomed = false; this.closed = false;
    this.nonce = randomId(6);
    this.unsub = null; this.helloTimer = null;
  }

  async open() {
    this.ev.state({ state: "connecting" });
    let keys;
    try { keys = await channelKeys(this.keyPair, this.host.pub, { epoch: this.host.epoch, friendPeer: this.myPeer, role: "friend" }); }
    catch (e) { this.closeWith("bad_host_key"); return; }
    if (this.closed) return;
    this.channel = new Channel({
      pacer: this.pacer, topic: TOPIC_UP, header: { e: this.host.epoch }, keys,
      // The host's frames can be big (a burst of events after a fast-forward); a friend's are small.
      maxChunksIn: 128, maxBytesIn: 4 << 20,
      onItems: items => { for (const item of items) this.onHostItem(item); },
      onTrouble: kind => this.ev.state({ state: "trouble", kind }),
    });
    this.unsub = this.room.on(TOPIC_DOWN, msg => this.onDown(msg));
    this.hello();
    this.helloTimer = setInterval(() => { if (!this.welcomed) this.hello(); }, 1500);
  }
  hello() { this.pacer.send(TOPIC_UP, { v: 1, k: "h", e: this.host.epoch, pub: this.publicKey, n: this.nonce }, 0); }

  onHostItem(item) {
    if (!item || typeof item !== "object") return;
    if (item.k === "welcome" && !this.welcomed) {
      this.welcomed = true; clearInterval(this.helloTimer);
      this.ev.state({ state: "open" });
    }
    this.ev.item(item);
  }

  onDown(msg) {
    const d = msg && msg.data;
    if (this.closed || !d || typeof d !== "object" || d.v !== 1) return;
    // Only the host's own page, as named in town/host, speaks for the town (and only admins can send on `down`).
    if (msg.peer !== this.host.peer || msg.kind !== "viewer" || d.e !== this.host.epoch) return;
    if (d.k === "s") { this.ev.item({ k: "status", status: publicStatus(d) }); return; }
    if (d.to !== this.myPeer) return;
    if (d.k === "r") { this.closeWith("reset"); return; }   // the host doesn't know this page (any more)
    if (d.k === "x") { this.closeWith(typeof d.code === "string" ? d.code.slice(0, 40) : "refused"); return; }
    if ((d.k === "c" || d.k === "a" || d.k === "f") && this.channel) this.channel.receive(d);
  }

  send(item) { if (this.channel && !this.closed) this.channel.push(item); }
  stats() { return this.channel ? { ...this.channel.stats } : null; }

  closeWith(reason) {
    if (this.closed) return;
    this.close(false);
    this.ev.state({ state: "closed", reason });
  }
  // `bye` tells the host this page is leaving the town (best effort: the room may drop it; the host also notices
  // the page leaving the room).
  close(bye = true) {
    if (this.closed) return;
    if (bye && this.welcomed) this.pacer.send(TOPIC_UP, { v: 1, k: "b", e: this.host.epoch }, 0);
    this.closed = true;
    clearInterval(this.helloTimer);
    if (this.unsub) this.unsub();
    if (this.channel) this.channel.close();
  }
}

// What a host may say to everyone in the clear: nothing about anyone in particular.
export function publicStatus(d) {
  return {
    paused: !!d.paused,
    reason: typeof d.reason === "string" ? d.reason.slice(0, 40) : "",
    people: isInt(d.people, 0, 1000) ? d.people : null,
    stopping: !!d.stopping,
  };
}

// ------------------------------------------------------------------ the host's end

// The host's side of the room: one Channel per friend's page, opened by that page's `hello`. Who a page is comes
// from the platform's stamp on its messages (`by`, the person's id), never from anything inside them: a session is
// bound to the `peer` and `by` of its hello, and a message from that peer with another `by` ends it.
// `onOpen(session)` / `onItems(session, items)` / `onClose(session, reason)` are the town's (host.js).
export class HostEnd {
  constructor({ room, pacer, keyPair, epoch, onOpen, onItems, onClose }) {
    this.room = room; this.pacer = pacer; this.keyPair = keyPair; this.epoch = epoch;
    this.onOpen = onOpen; this.onItemsFn = onItems; this.onClose = onClose;
    this.sessions = new Map();   // peer -> {peer, uid, nonce, pub, channel, guest, goneAt}
    this.resetAt = new Map();
    this.unsubs = [];
    this.timer = null;
    this.stats = { hellos: 0, refused: 0, resets: 0 };
  }

  start() {
    this.unsubs.push(this.room.on(TOPIC_UP, msg => { this.onUp(msg); }));
    // A page that leaves the room leaves the town, after a grace: the platform refreshes connections now and then,
    // and a blip must not throw everyone out.
    this.unsubs.push(this.room.onPeers(change => {
      for (const p of change.left) { const s = this.sessions.get(p.peer); if (s && s.goneAt === null) s.goneAt = now(); }
      for (const p of [...change.joined, ...change.updated]) { const s = this.sessions.get(p.peer); if (s) s.goneAt = null; }
    }));
    this.timer = setInterval(() => {
      const t = now();
      for (const s of [...this.sessions.values()]) if (s.goneAt !== null && t - s.goneAt > 10000) this.drop(s.peer, "left");
    }, 1000);
  }

  async onUp(msg) {
    const d = msg && msg.data;
    if (!d || typeof d !== "object" || d.v !== 1 || msg.kind !== "viewer" || msg.sameTab) return;
    if (d.e !== this.epoch) return;
    if (d.k === "h") { await this.hello(msg, d); return; }
    const s = this.sessions.get(msg.peer);
    if (!s) { if (d.k === "c" || d.k === "a" || d.k === "f") this.reset(msg.peer); return; }
    s.goneAt = null;
    if (msg.by !== s.uid) { this.drop(msg.peer, "identity_changed"); return; }
    if (d.k === "b") { this.drop(msg.peer, "bye"); return; }
    if ((d.k === "c" || d.k === "a" || d.k === "f") && s.channel) s.channel.receive(d);
  }

  async hello(msg, d) {
    this.stats.hellos++;
    if (typeof d.pub !== "string" || d.pub.length > 200 || typeof d.n !== "string" || d.n.length > 32) return;
    if (!msg.by) {
      // Nobody the platform vouched for: there's no person to play as.
      this.stats.refused++;
      this.pacer.send(TOPIC_DOWN, { v: 1, k: "x", e: this.epoch, to: msg.peer, code: "no_identity" }, 0);
      return;
    }
    const old = this.sessions.get(msg.peer);
    if (old && old.nonce === d.n && old.pub === d.pub && old.uid === msg.by) { old.goneAt = null; return; }   // the welcome is on its way
    if (old) this.drop(msg.peer, "hello_again");
    const s = { peer: msg.peer, uid: msg.by, nonce: d.n, pub: d.pub, channel: null, guest: !!msg.guest, goneAt: null };
    this.sessions.set(msg.peer, s);
    let keys;
    try { keys = await channelKeys(this.keyPair, d.pub, { epoch: this.epoch, friendPeer: msg.peer, role: "host" }); }
    catch { if (this.sessions.get(msg.peer) === s) this.sessions.delete(msg.peer); return; }
    if (this.sessions.get(msg.peer) !== s) return;   // replaced while the keys were being made
    s.channel = new Channel({
      pacer: this.pacer, topic: TOPIC_DOWN, header: { e: this.epoch, to: msg.peer }, keys,
      // A friend sends requests: small. A character sheet is the biggest, a few KB.
      maxChunksIn: 24, maxBytesIn: 256 * 1024,
      onItems: items => this.onItemsFn(s, items),
      onTrouble: () => {},
    });
    this.onOpen(s);
  }

  push(peer, item) { const s = this.sessions.get(peer); if (s && s.channel) s.channel.push(item); }
  reset(peer) {
    const t = now();
    if (t - (this.resetAt.get(peer) || -1e9) < 1000) return;
    this.resetAt.set(peer, t);
    this.stats.resets++;
    this.pacer.send(TOPIC_DOWN, { v: 1, k: "r", e: this.epoch, to: peer }, 0);
  }
  status(st) { this.pacer.send(TOPIC_DOWN, { v: 1, k: "s", e: this.epoch, ...st }, 0); }
  drop(peer, reason) {
    const s = this.sessions.get(peer);
    if (!s) return;
    this.sessions.delete(peer);
    if (s.channel) s.channel.close();
    this.onClose(s, reason);
  }
  channelStats() {
    const out = {};
    for (const [peer, s] of this.sessions) if (s.channel) out[peer] = { ...s.channel.stats };
    return out;
  }
  stop() {
    for (const u of this.unsubs) u();
    this.unsubs = [];
    clearInterval(this.timer);
    for (const s of this.sessions.values()) if (s.channel) s.channel.close();
    this.sessions.clear();
  }
}

export { pipeEvents };
