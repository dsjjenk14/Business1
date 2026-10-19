// Unit tests for the "Play together" wire (web/client/together/link.js), in Node (WebCrypto, CompressionStream):
// frames chunked under 4 KiB, delivered once and in order through a room that drops messages, encryption that
// only the right page can read, the sender's identity taken from the platform's stamp, and a host and friends
// talking through HostEnd / FriendEnd. Run: node web/tests/together_link.mjs
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const L = await import(pathToFileURL(path.join(here, "..", "client", "together", "link.js")).href);

let failures = 0;
function check(cond, what, detail) {
  if (cond) { console.log(`  ok   ${what}`); return; }
  failures += 1;
  console.log(`  FAIL ${what}${detail === undefined ? "" : `: ${JSON.stringify(detail).slice(0, 300)}`}`);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 20000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(20); } return fn(); }

// A room in memory: stamps each message with its sender (as the platform does), enforces 4 KiB and admin-only
// topics, and drops a share of deliveries at random.
function makeRoom({ drop = 0, adminTopics = ["down"] } = {}) {
  const pages = new Set();
  let sent = 0, dropped = 0, oversize = 0;
  function page({ peer, by, admin = false }) {
    const listeners = new Map(), peerFns = new Set();
    const self = {
      peer, by, admin,
      emit(topic, data) {
        const bytes = new TextEncoder().encode(JSON.stringify(data)).length;
        if (bytes > 4096) { oversize++; return Promise.reject({ code: "invalid_argument", message: `${bytes} bytes` }); }
        if (adminTopics.includes(topic) && !admin) return Promise.reject({ code: "not_permitted", message: "admin-only topic" });
        sent++;
        for (const p of pages) {
          if (p !== self && Math.random() < drop) { dropped++; continue; }
          const msg = { topic, data: JSON.parse(JSON.stringify(data)), peer, by, isMe: p.by === by, sameTab: p === self, kind: "viewer", guest: false };
          setTimeout(() => { for (const fn of p.listeners.get(topic) || []) fn(msg); }, 1 + Math.random() * 6);
        }
        return Promise.resolve();
      },
      on(topic, fn) { if (!listeners.has(topic)) listeners.set(topic, new Set()); listeners.get(topic).add(fn); return () => listeners.get(topic).delete(fn); },
      onPeers(fn) { peerFns.add(fn); return () => peerFns.delete(fn); },
      leave() { pages.delete(self); for (const p of pages) for (const fn of p.peerFns) fn({ peers: [], joined: [], updated: [], left: [{ peer }] }); },
      listeners, peerFns,
    };
    pages.add(self);
    return self;
  }
  return { page, stats: () => ({ sent, dropped, oversize }) };
}

// Two channels wired back to back over a room, with keys from a real key agreement.
async function pair(room, { epoch = "ep1" } = {}) {
  const hostPage = room.page({ peer: "hostpeer", by: "u_host", admin: true });
  const friendPage = room.page({ peer: "friendpeer", by: "u_friend" });
  const hk = await L.newKeyPair(), fk = await L.newKeyPair();
  const hostKeys = await L.channelKeys(hk, await L.publicKeyText(fk), { epoch, friendPeer: "friendpeer", role: "host" });
  const friendKeys = await L.channelKeys(fk, await L.publicKeyText(hk), { epoch, friendPeer: "friendpeer", role: "friend" });
  const got = { host: [], friend: [] };
  const hostPacer = new L.Pacer((t, d) => hostPage.emit(t, d)), friendPacer = new L.Pacer((t, d) => friendPage.emit(t, d));
  const host = new L.Channel({ pacer: hostPacer, topic: "down", header: { e: epoch, to: "friendpeer" }, keys: hostKeys, onItems: i => got.host.push(...i), maxChunksIn: 64 });
  const friend = new L.Channel({ pacer: friendPacer, topic: "up", header: { e: epoch }, keys: friendKeys, onItems: i => got.friend.push(...i), maxChunksIn: 128, maxBytesIn: 8 << 20 });
  hostPage.on("up", m => { if (m.peer === "friendpeer" && m.data.e === epoch) host.receive(m.data); });
  friendPage.on("down", m => { if (m.peer === "hostpeer" && m.data.to === "friendpeer") friend.receive(m.data); });
  return { host, friend, got, close: () => { host.close(); friend.close(); } };
}

console.log("--- bytes and packing");
{
  const bytes = new Uint8Array(100000).map((_, i) => (i * 7919 + (i >> 3)) & 255);
  check(L.unb64(L.b64(bytes)).every((v, i) => v === bytes[i]), "base64 round-trips 100 KB");
  const value = { text: "Livéra ".repeat(2000), n: [1, 2, 3] };
  const packed = await L.pack(value);
  check(packed[0] === 1 && packed.length < 2000, "a repetitive value is gzipped", packed.length);
  check(JSON.stringify(await L.unpack(packed, 1 << 20)) === JSON.stringify(value), "and unpacks to the same value");
  let refused = false;
  try { await L.unpack(await L.pack({ s: "a".repeat(5 << 20) }), 1 << 20); } catch { refused = true; }
  check(refused, "a frame that unpacks past the limit is refused (no gzip bombs)");
}

console.log("--- a channel over a lossless room");
{
  const room = makeRoom();
  const { host, friend, got, close } = await pair(room);
  for (let i = 0; i < 50; i++) host.push({ k: "ev", n: i });
  friend.push({ k: "req", id: 1, op: "look" });
  await until(() => got.friend.length === 50 && got.host.length === 1);
  check(got.friend.length === 50 && got.friend.every((x, i) => x.n === i), "50 items arrive once, in order", got.friend.length);
  check(got.host.length === 1 && got.host[0].op === "look", "the friend's request arrives");
  check(host.stats.framesOut < 10, "items pushed together share frames", host.stats.framesOut);
  close();
}

console.log("--- big frames are chunked under 4 KiB");
{
  globalThis.LIVERA_TOGETHER_NO_GZIP = true;
  const room = makeRoom();
  const { host, got, close } = await pair(room);
  const big = { k: "rep", id: 9, data: { blob: Array.from({ length: 3000 }, (_, i) => `item ${i} ${Math.random()}`) } };
  host.push(big);
  await until(() => got.friend.length === 1);
  check(got.friend.length === 1 && got.friend[0].data.blob.length === 3000, "an 80 KB reply arrives whole");
  check(host.stats.chunksOut > 20 && room.stats().oversize === 0, "in more than 20 chunks, none over 4 KiB", { chunks: host.stats.chunksOut, ...room.stats() });
  close();
  globalThis.LIVERA_TOGETHER_NO_GZIP = false;
}

console.log("--- a room that drops 25% of messages");
{
  const room = makeRoom({ drop: 0.25 });
  const { host, friend, got, close } = await pair(room);
  globalThis.LIVERA_TOGETHER_NO_GZIP = true;   // more chunks, more to lose
  for (let i = 0; i < 120; i++) { host.push({ k: "ev", n: i, pad: "x".repeat(i * 40) }); if (i % 10 === 0) await sleep(30); }
  for (let i = 0; i < 20; i++) friend.push({ k: "req", id: i, op: "look" });
  const ok = await until(() => got.friend.length === 120 && got.host.length === 20, 30000);
  globalThis.LIVERA_TOGETHER_NO_GZIP = false;
  check(ok, "everything still arrives", { friend: got.friend.length, host: got.host.length });
  check(got.friend.every((x, i) => x.n === i), "in order, nothing twice");
  check(host.stats.retransmits > 0, "by sending again what was lost", host.stats);
  close();
}

console.log("--- a sender that gives up tells the receiver to stop waiting");
{
  const room = makeRoom();
  const { host, friend, got, close } = await pair(room);
  // Frame 1 never reaches the friend (we eat its chunks); frames after it do.
  const real = friend.receive.bind(friend);
  friend.receive = d => { if (d.k === "c" && d.s === 1) return; real(d); };
  const saved = L.LIMITS.giveUpMs;
  L.LIMITS.giveUpMs = 1200;
  host.push({ k: "ev", n: 0 });
  await sleep(100);
  host.push({ k: "ev", n: 1 });
  await until(() => got.friend.length === 1, 6000);
  L.LIMITS.giveUpMs = saved;
  check(got.friend.length === 1 && got.friend[0].n === 1, "the frame after the lost one is delivered", got.friend);
  check(friend.stats.gaps === 1 && host.stats.lost === 1, "one gap, one loss, counted", { gaps: friend.stats.gaps, lost: host.stats.lost });
  close();
}

console.log("--- keys");
{
  const a = await L.newKeyPair(), b = await L.newKeyPair(), c = await L.newKeyPair();
  const ka = await L.channelKeys(a, await L.publicKeyText(b), { epoch: "e", friendPeer: "p", role: "host" });
  const kb = await L.channelKeys(b, await L.publicKeyText(a), { epoch: "e", friendPeer: "p", role: "friend" });
  const kc = await L.channelKeys(c, await L.publicKeyText(a), { epoch: "e", friendPeer: "p", role: "friend" });
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode("x") }, ka.tx, new TextEncoder().encode("secret"));
  const open = async k => { try { return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode("x") }, k, ct)); } catch { return null; } };
  check(await open(kb.rx) === "secret", "the friend reads what the host sent it");
  check(await open(kc.rx) === null, "another page with its own key can't");
  check(await open(ka.rx) === null, "and the two directions don't share a key");
  let bad = false;
  try { await L.channelKeys(a, L.b64(new Uint8Array(65).fill(4)), { epoch: "e", friendPeer: "p", role: "host" }); } catch { bad = true; }
  check(bad, "a public key that isn't a point on the curve is refused");
}

console.log("--- a host and two friends through HostEnd / FriendEnd");
{
  const room = makeRoom({ drop: 0.1 });
  const hostPage = room.page({ peer: "H", by: "u_host", admin: true });
  const hostPair = await L.newKeyPair(), hostPub = await L.publicKeyText(hostPair);
  const epoch = "epoch-1";
  const hostPacer = new L.Pacer((t, d) => hostPage.emit(t, d));
  const opened = [], closed = [], heard = [];
  const end = new L.HostEnd({
    room: hostPage, pacer: hostPacer, keyPair: hostPair, epoch,
    onOpen: s => { opened.push(s.uid); end.push(s.peer, { k: "welcome", you: s.uid }); },
    onItems: (s, items) => { for (const it of items) { heard.push([s.uid, it.op]); end.push(s.peer, { k: "rep", id: it.id, ok: true, data: { for: s.uid } }); } },
    onClose: (s, why) => closed.push([s.uid, why]),
  });
  end.start();
  async function friend(peer, by) {
    const page = room.page({ peer, by });
    const kp = await L.newKeyPair();
    const pacer = new L.Pacer((t, d) => page.emit(t, d));
    const fe = new L.FriendEnd({ room: page, pacer, keyPair: kp, publicKey: await L.publicKeyText(kp), myPeer: peer, host: { peer: "H", epoch, pub: hostPub } });
    const items = [], states = [];
    fe.onItem(i => items.push(i)); fe.onState(s => states.push(s.state));
    await fe.open();
    return { page, fe, items, states, pacer };
  }
  const ali = await friend("A", "u_ali"), bea = await friend("B", "u_bea");
  await until(() => ali.states.includes("open") && bea.states.includes("open"));
  check(ali.items[0]?.you === "u_ali" && bea.items[0]?.you === "u_bea", "each friend is welcomed as the person the platform says they are", [ali.items[0], bea.items[0]]);
  ali.fe.send({ k: "req", id: 1, op: "look" }); bea.fe.send({ k: "req", id: 1, op: "buy" });
  await until(() => ali.items.length >= 2 && bea.items.length >= 2);
  check(ali.items[1]?.data?.for === "u_ali" && bea.items[1]?.data?.for === "u_bea", "replies go to the right page only");
  check(heard.some(([u, op]) => u === "u_ali" && op === "look") && heard.some(([u, op]) => u === "u_bea" && op === "buy"), "the host knows who asked what");

  // Bea's page tries to pose as the host: the platform refuses `down` to non-admins.
  let refused = null;
  await bea.page.emit("down", { v: 1, k: "s", e: epoch, paused: true }).catch(e => { refused = e.code; });
  check(refused === "not_permitted", "a friend can't send on the host's topic", refused);
  // Bea's page sends chunks with made-up content on `up`: they land in Bea's own channel (stamped peer B) and
  // don't decrypt, so nothing happens to Ali.
  const before = heard.length;
  await bea.page.emit("up", { v: 1, k: "c", e: epoch, s: 50, i: 0, n: 1, f: 1, iv: "AAAAAAAAAAAAAAAA", d: "Zm9yZ2Vk" });
  await sleep(300);
  check(heard.length === before, "a forged frame does nothing", heard.slice(before));
  // A hello from a page the platform didn't vouch for gets no channel.
  const anon = room.page({ peer: "N", by: null });
  const anonPacer = new L.Pacer((t, d) => anon.emit(t, d));
  const kp = await L.newKeyPair();
  const nobody = new L.FriendEnd({ room: anon, pacer: anonPacer, keyPair: kp, publicKey: await L.publicKeyText(kp), myPeer: "N", host: { peer: "H", epoch, pub: hostPub } });
  const ns = []; nobody.onState(s => ns.push(s));
  await nobody.open();
  await until(() => ns.some(s => s.state === "closed"), 5000);
  check(ns.some(s => s.state === "closed" && s.reason === "no_identity") && !opened.includes(null), "a page with no identity is turned away", ns);
  // A page leaving the room leaves the town after the grace period.
  ali.page.leave();
  await until(() => closed.some(([u]) => u === "u_ali"), 15000);
  check(closed.some(([u, why]) => u === "u_ali" && why === "left"), "a friend who leaves the room is let go", closed);
  end.stop(); ali.fe.close(); bea.fe.close(); nobody.close();
}

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
