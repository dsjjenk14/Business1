// LIVERA browser gateway: a WebSocket-to-TCP pipe between browsers and the game server.
//
// Browsers can't open raw TCP sockets, and the game server speaks newline-delimited JSON over
// TCP. Each WebSocket connection on /ws gets its own TCP connection to the server: one WS text
// message is one request line, one server line is one WS message. There is no game logic here
// and nothing is parsed: the server stays the only authority (livera/CLAUDE.md rule 1), and it
// still sees one connection per player, so its rate limits and login rules apply unchanged.
//
// Env: LIVERA_HOST (127.0.0.1), LIVERA_PORT (7777), GATEWAY_HOST (127.0.0.1), GATEWAY_PORT (8080),
// ALLOWED_ORIGINS (comma list; empty = any, for dev), STATIC_DIR (optional: also serve the web
// client over plain HTTP for local dev and tests; production serves it with Caddy).

import http from "node:http";
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import { WebSocketServer } from "ws";

const env = (k, d) => (process.env[k] === undefined || process.env[k] === "" ? d : process.env[k]);
const LIVERA_HOST = env("LIVERA_HOST", "127.0.0.1");
const LIVERA_PORT = Number(env("LIVERA_PORT", "7777"));
const GATEWAY_HOST = env("GATEWAY_HOST", "127.0.0.1");
const GATEWAY_PORT = Number(env("GATEWAY_PORT", "8080"));
const ALLOWED_ORIGINS = env("ALLOWED_ORIGINS", "").split(",").map(s => s.trim()).filter(Boolean);
const STATIC_DIR = process.env.STATIC_DIR ? path.resolve(process.env.STATIC_DIR) : "";

// The server disconnects anyone who sends a line over 16 KB; refusing it here gives the same
// answer without bothering the server.
const MAX_MESSAGE_BYTES = 16 * 1024;
const MAX_CONNECTIONS_PER_IP = 8;
const PING_INTERVAL_MS = 25_000;
// A server line can be bigger than a request (a map, a phone app). This only guards memory
// against a runaway peer; the server itself caps each client's outbox at 1 MB.
const MAX_SERVER_LINE_BYTES = 4 * 1024 * 1024;
const WS_HIGH_WATER = 1024 * 1024;
const WS_LOW_WATER = 256 * 1024;
const MAX_QUEUED_BEFORE_CONNECT = 64;

const log = (...a) => console.log(new Date().toISOString(), "[gateway]", ...a);

// ------------------------------------------------------------------ client IPs
const isLoopback = a => a === "127.0.0.1" || a === "::1" || a === "::ffff:127.0.0.1";
// X-Forwarded-For is only believed when the socket peer is loopback, i.e. Caddy on the same
// machine. Caddy appends the address it saw, so the last entry is the one it vouches for.
function clientIp(req) {
  const peer = req.socket.remoteAddress || "";
  if (isLoopback(peer)) {
    const xff = req.headers["x-forwarded-for"];
    if (typeof xff === "string" && xff.trim()) {
      const parts = xff.split(",").map(s => s.trim()).filter(Boolean);
      if (parts.length) return parts[parts.length - 1];
    }
  }
  return peer;
}
const perIp = new Map();
const addIp = ip => perIp.set(ip, (perIp.get(ip) || 0) + 1);
const dropIp = ip => { const n = (perIp.get(ip) || 1) - 1; if (n <= 0) perIp.delete(ip); else perIp.set(ip, n); };

// ------------------------------------------------------------------ static files (dev and tests only)
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon",
  ".webp": "image/webp", ".txt": "text/plain; charset=utf-8",
};
function serveStatic(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405, { Allow: "GET, HEAD" }).end(); return; }
  let rel;
  try { rel = decodeURIComponent(new URL(req.url, "http://x").pathname); } catch { res.writeHead(400).end(); return; }
  if (rel.endsWith("/")) rel += "index.html";
  // No dotfiles, no climbing out of the client folder.
  if (rel.split("/").some(seg => seg.startsWith(".")) || rel.includes("\0")) { res.writeHead(404).end(); return; }
  const file = path.join(STATIC_DIR, path.normalize(rel));
  if (file !== STATIC_DIR && !file.startsWith(STATIC_DIR + path.sep)) { res.writeHead(404).end(); return; }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("not found"); return; }
    res.writeHead(200, {
      "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream",
      "Content-Length": st.size,
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    });
    if (req.method === "HEAD") { res.end(); return; }
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const p = (req.url || "/").split("?")[0];
  if (p === "/healthz") { res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" }).end("ok\n"); return; }
  if (STATIC_DIR) { serveStatic(req, res); return; }
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("LIVERA gateway: WebSocket endpoint is /ws\n");
});

// ------------------------------------------------------------------ the pipe
const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES, perMessageDeflate: false });

function reject(socket, status, text) {
  socket.end(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Type: text/plain\r\nContent-Length: ${text.length}\r\n\r\n${text}`);
}

server.on("upgrade", (req, socket, head) => {
  socket.on("error", () => socket.destroy());
  const p = (req.url || "/").split("?")[0];
  if (p !== "/ws") { reject(socket, 404, "Not Found"); return; }
  const origin = req.headers.origin || "";
  if (ALLOWED_ORIGINS.length && !ALLOWED_ORIGINS.includes(origin)) { reject(socket, 403, "Forbidden"); return; }
  const ip = clientIp(req);
  if ((perIp.get(ip) || 0) >= MAX_CONNECTIONS_PER_IP) { reject(socket, 429, "Too Many Requests"); return; }
  addIp(ip);
  let counted = true;
  const release = () => { if (counted) { counted = false; dropIp(ip); } };
  socket.once("close", release);
  wss.handleUpgrade(req, socket, head, ws => {
    ws.once("close", release);
    pipe(ws, ip);
  });
});

function pipe(ws, ip) {
  ws.isAlive = true;
  ws.on("pong", () => { ws.isAlive = true; });
  const tcp = net.connect({ host: LIVERA_HOST, port: LIVERA_PORT });
  tcp.setNoDelay(true);
  let connected = false, closed = false;
  const queue = [];
  log(`open ${ip} (${wss.clients.size} open)`);

  const closeBoth = (code, reason) => {
    if (closed) return;
    closed = true;
    if (ws.readyState === ws.OPEN || ws.readyState === ws.CONNECTING) ws.close(code, reason);
    tcp.end();
    setTimeout(() => tcp.destroy(), 2000).unref();
  };

  // Server -> browser: split on newlines; each non-empty line is one WS text message.
  let chunks = [], buffered = 0, drainTimer = null;
  tcp.on("data", data => {
    let start = 0;
    for (let i = data.indexOf(10); i !== -1; i = data.indexOf(10, start)) {
      chunks.push(data.subarray(start, i));
      let line = Buffer.concat(chunks).toString("utf8");
      chunks = []; buffered = 0;
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (line && ws.readyState === ws.OPEN) ws.send(line);
      start = i + 1;
    }
    if (start < data.length) {
      chunks.push(data.subarray(start));
      buffered += data.length - start;
      if (buffered > MAX_SERVER_LINE_BYTES) { log(`server line too long for ${ip}`); closeBoth(1009, "server message too big"); return; }
    }
    // A browser that stops reading must not make the gateway buffer forever.
    if (ws.bufferedAmount > WS_HIGH_WATER && !drainTimer) {
      tcp.pause();
      drainTimer = setInterval(() => {
        if (ws.readyState !== ws.OPEN || ws.bufferedAmount < WS_LOW_WATER) { clearInterval(drainTimer); drainTimer = null; tcp.resume(); }
      }, 50);
    }
  });
  tcp.on("connect", () => {
    connected = true;
    for (const line of queue.splice(0)) tcp.write(line);
  });
  tcp.on("drain", () => ws.resume());
  tcp.on("error", err => {
    log(`game server connection error for ${ip}: ${err.code || err.message}`);
    closeBoth(connected ? 1011 : 1013, connected ? "game server connection lost" : "game server unavailable");
  });
  tcp.on("close", () => {
    if (drainTimer) { clearInterval(drainTimer); drainTimer = null; }
    closeBoth(1000, "game server closed the connection");
  });

  // Browser -> server: one text message is one request line.
  ws.on("message", (data, isBinary) => {
    if (closed) return;
    if (isBinary) { closeBoth(1003, "text messages only"); return; }
    const buf = Buffer.isBuffer(data) ? data : Buffer.concat(Array.isArray(data) ? data : [Buffer.from(data)]);
    if (buf.length > MAX_MESSAGE_BYTES) { closeBoth(1009, "message too big"); return; }
    if (buf.includes(10) || buf.includes(13)) { closeBoth(1008, "one request per message, no newlines"); return; }
    const line = Buffer.concat([buf, Buffer.from("\n")]);
    if (!connected) {
      if (queue.length >= MAX_QUEUED_BEFORE_CONNECT) { closeBoth(1008, "too many messages before the server answered"); return; }
      queue.push(line);
      return;
    }
    if (!tcp.write(line)) ws.pause();
  });
  ws.on("close", () => {
    log(`close ${ip} (${wss.clients.size} open)`);
    closeBoth(1000, "");
  });
  ws.on("error", err => { log(`websocket error for ${ip}: ${err.message}`); closeBoth(1011, "websocket error"); });
}

// Ping every 25 s; a peer that missed the last pong is gone (phones drop off networks silently).
const pinger = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch { ws.terminate(); }
  }
}, PING_INTERVAL_MS);

server.listen(GATEWAY_PORT, GATEWAY_HOST, () => {
  log(`listening on ${GATEWAY_HOST}:${server.address().port} -> game server ${LIVERA_HOST}:${LIVERA_PORT}` +
      `${STATIC_DIR ? `, serving ${STATIC_DIR}` : ""}${ALLOWED_ORIGINS.length ? `, origins ${ALLOWED_ORIGINS.join(" ")}` : ", any origin (dev)"}`);
});

function shutdown() {
  log("shutting down");
  clearInterval(pinger);
  for (const ws of wss.clients) ws.close(1001, "gateway shutting down");
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
