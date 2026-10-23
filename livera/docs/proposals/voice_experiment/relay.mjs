// Tiny stand-in for the LIVERA server's voice role: it owns positions, decides who may hear whom,
// tells both sides of a pair to connect or hang up, and relays WebRTC signalling ONLY between pairs
// it has put in range. Everything else is refused. Not production code: an experiment.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT || 8099);
const here = path.dirname(new URL(import.meta.url).pathname);
const SAY = 20, SHOUT = 60, WHISPER = 2;

// character -> {ws, pos: [x, y], mode: 'off'|'whisper'|'say'|'shout', to}
const people = new Map();
// "a|b" (sorted) -> {initiator}
const pairs = new Map();
const log = [];
const key = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
const send = (who, msg) => { const p = people.get(who); if (p && p.ws.readyState === 1) p.ws.send(JSON.stringify(msg)); };

// Who should be connected: a pair is "linked" when either one could be heard by the other at the
// loudest volume (shout). What each side actually sends over the link depends on its mode; the
// server tells the receiver what it should be getting (volume, range) so the client can mute.
function recompute() {
  const ids = [...people.keys()];
  const want = new Set();
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const a = people.get(ids[i]), b = people.get(ids[j]);
    if (dist(a.pos, b.pos) <= SHOUT) want.add(key(ids[i], ids[j]));
  }
  for (const k of [...pairs.keys()]) if (!want.has(k)) {
    pairs.delete(k);
    const [a, b] = k.split('|');
    send(a, { event: 'voice_peers', data: { remove: [{ character: b, reason: 'out_of_range' }] } });
    send(b, { event: 'voice_peers', data: { remove: [{ character: a, reason: 'out_of_range' }] } });
    log.push(`hangup ${k}`);
  }
  for (const k of want) if (!pairs.has(k)) {
    const [a, b] = k.split('|');
    pairs.set(k, { initiator: a });
    send(a, { event: 'voice_peers', data: { add: [{ character: b, initiator: true }] } });
    send(b, { event: 'voice_peers', data: { add: [{ character: a, initiator: false }] } });
    log.push(`link ${k}`);
  }
  // Tell every speaker whom their voice should reach right now (the honest client obeys).
  for (const [id, p] of people) {
    const reach = [];
    for (const [other, o] of people) {
      if (other === id || !pairs.has(key(id, other))) continue;
      const d = dist(p.pos, o.pos);
      const ok = p.mode === 'whisper' ? (other === p.to && d <= WHISPER)
        : p.mode === 'say' ? d <= SAY : p.mode === 'shout' ? d <= SHOUT : false;
      if (ok) reach.push(other);
    }
    send(id, { event: 'voice_reach', data: { mode: p.mode, to: reach } });
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/' || url.pathname === '/page.html') {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(fs.readFileSync(path.join(here, 'page.html')));
  } else if (url.pathname === '/admin') { // test hook: set position / mode, as World would
    const who = url.searchParams.get('who');
    const p = people.get(who);
    if (!p) { res.writeHead(404); res.end('no such person'); return; }
    if (url.searchParams.has('x')) p.pos = [Number(url.searchParams.get('x')), Number(url.searchParams.get('y'))];
    if (url.searchParams.has('mode')) { p.mode = url.searchParams.get('mode'); p.to = url.searchParams.get('to') || ''; }
    recompute();
    res.end(JSON.stringify({ pairs: [...pairs.keys()] }));
  } else if (url.pathname === '/log') {
    res.end(JSON.stringify(log));
  } else { res.writeHead(404); res.end(); }
});

const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', (ws) => {
  let me = null;
  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.op === 'hello') {
      me = m.me; people.set(me, { ws, pos: m.pos || [0, 0], mode: 'off', to: '' });
      ws.send(JSON.stringify({ re: m.id, ok: true }));
      recompute();
    } else if (m.op === 'voice_signal') {
      // The only thing that matters for privacy: relay only inside a pair the server created.
      if (!me || !pairs.has(key(me, m.to))) {
        log.push(`refused ${me}->${m.to} ${m.kind}`);
        ws.send(JSON.stringify({ re: m.id, ok: false, error: { code: 'not_in_range' } }));
        return;
      }
      send(m.to, { event: 'voice_signal', data: { from: me, kind: m.kind, sdp: m.sdp, candidate: m.candidate } });
    }
  });
  ws.on('close', () => { if (me) { people.delete(me); recompute(); } });
});

server.listen(PORT, '127.0.0.1', () => console.log(`relay on ${PORT}`));
