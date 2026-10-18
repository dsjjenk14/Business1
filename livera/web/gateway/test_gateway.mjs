// Gateway connection caps, black-box: a stand-in game server that only holds connections, a real gateway with a
// small total cap, and WebSocket clients claiming addresses through X-Forwarded-For (believed from loopback, as
// behind Caddy). Run: node web/gateway/test_gateway.mjs (run_e2e.sh runs it too). Exits non-zero on a failure.

import net from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

const TOTAL = 20;  // the cap under test; the per-address cap is the gateway's own 8
let failures = 0;
const check = (ok, what) => { console.log(`${ok ? "ok  " : "FAIL"} ${what}`); if (!ok) failures++; };

const held = new Set();
const game = net.createServer(sock => { held.add(sock); sock.on("close", () => held.delete(sock)); sock.on("error", () => {}); });
await new Promise(r => game.listen(0, "127.0.0.1", r));

const gw = spawn(process.execPath, [fileURLToPath(new URL("./gateway.mjs", import.meta.url))], {
  env: { ...process.env, LIVERA_HOST: "127.0.0.1", LIVERA_PORT: String(game.address().port), GATEWAY_HOST: "127.0.0.1",
         GATEWAY_PORT: "0", GATEWAY_MAX_CONNECTIONS: String(TOTAL), ALLOWED_ORIGINS: "", STATIC_DIR: "" },
  stdio: ["ignore", "pipe", "inherit"],
});
let gwLog = "";
const port = await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error("gateway didn't start:\n" + gwLog)), 5000);
  gw.stdout.on("data", d => {
    gwLog += d;
    const m = /listening on [^ ]+:(\d+)/.exec(gwLog);
    if (m) { clearTimeout(t); resolve(Number(m[1])); }
  });
});

const open = [];
// Resolves to 101 with the socket kept open, or to the HTTP status the gateway refused with.
function connect(xff) {
  return new Promise(resolve => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers: { "X-Forwarded-For": xff } });
    ws.on("open", () => { open.push({ ws, xff }); resolve(101); });
    ws.on("unexpected-response", (_req, res) => { resolve(res.statusCode); res.resume(); });
    ws.on("error", err => resolve(`error: ${err.message}`));
  });
}
async function many(xffs) { const out = []; for (const x of xffs) out.push(await connect(x)); return out; }
const all101 = statuses => statuses.every(s => s === 101);

try {
  // Two spellings of addresses in one IPv6 /64 share one count of 8.
  const a = await many([..."1234".split("").map(n => `2001:db8:1:2::${n}`),
                        ..."1234".split("").map(n => `2001:db8:1:2:ffff:ffff:ffff:fff${n}`)]);
  check(all101(a), "8 connections from one IPv6 /64 are let in");
  check(await connect("2001:0db8:0001:0002:0:0:0:abcd") === 429, "a 9th from the same /64, spelled out, gets 429");
  check(await connect("2001:db8:1:3::1") === 101, "the neighbouring /64 has its own count");

  // An IPv4 address seen as IPv4-mapped IPv6 is the same address.
  const b = await many(["::ffff:203.0.113.5", "::ffff:203.0.113.5", "::ffff:203.0.113.5", "::ffff:203.0.113.5",
                        "203.0.113.5", "203.0.113.5", "203.0.113.5", "203.0.113.5"]);
  check(all101(b), "8 connections from one IPv4 address, half of them IPv4-mapped, are let in");
  check(await connect("203.0.113.5") === 429, "a 9th from that address gets 429");

  // The total cap: 17 open so far.
  const c = await many(["198.51.100.1", "198.51.100.2", "198.51.100.3"]);
  check(all101(c) && open.length === TOTAL, `connections from new addresses are let in up to the total cap (${TOTAL})`);
  check(await connect("198.51.100.4") === 503, "one more than the total cap gets 503");
  check(held.size === TOTAL, "the game server only ever sees connections the gateway let in");

  // Closing gives the place back, both in the total and in that /64's count.
  const first = open.shift();
  first.ws.close();
  await new Promise(r => setTimeout(r, 300));
  check(await connect("2001:db8:1:2::99") === 101, "after one closes, its /64 and the total each have room for one more");
  check(await connect("198.51.100.5") === 503, "and the gateway is full again");
} catch (err) {
  check(false, `unexpected error: ${err.stack || err}`);
} finally {
  for (const { ws } of open) ws.terminate();
  gw.kill("SIGTERM");
  game.close();
  for (const s of held) s.destroy();
}
console.log(failures ? `gateway caps: ${failures} failed` : "gateway caps: all passed");
process.exit(failures ? 1 : 0);
