// Transport: one WebSocket to the gateway (/ws on the page's own host), request/reply matched
// by `id`, server events pushed to listeners, and reconnects that log back in with the
// session token (`resume`) so a phone dropping off Wi-Fi doesn't send you to the password screen.
//
// The password is never stored. The token is kept in localStorage; a server restart forgets
// all tokens, and an older server has no `resume` at all: either way the player sees the login
// screen again.

import { store } from "./dom.js";

const TOKEN_KEY = "livera.token";
const REQUEST_TIMEOUT_MS = 20000;

export class Transport {
  constructor(url) {
    this.url = url || `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws`;
    this.ws = null;
    this.nextId = 1;
    this.pending = new Map();   // id -> {resolve, op, timer}
    this.order = [];            // ids in send order, for replies that come back without `re`
    this.listeners = new Map(); // name -> Set(fn)
    this.status = "idle";
    this.welcome = null;
    this.retry = 0;
    this.reconnectTimer = null;
    this.autoReconnect = true;
    this.everOpened = false;
  }

  on(name, fn) { if (!this.listeners.has(name)) this.listeners.set(name, new Set()); this.listeners.get(name).add(fn); return () => this.listeners.get(name).delete(fn); }
  emit(name, data) { for (const fn of this.listeners.get(name) || []) { try { fn(data); } catch (e) { console.warn("listener failed", name, e); } } }
  setStatus(s, detail) { this.status = s; this.emit("status", { status: s, detail }); }

  get token() { return store.get(TOKEN_KEY); }
  saveToken(t) { if (typeof t === "string" && /^[0-9a-f]{16,128}$/i.test(t)) store.set(TOKEN_KEY, t); }
  clearToken() { store.del(TOKEN_KEY); }

  connect() {
    clearTimeout(this.reconnectTimer);
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    this.setStatus("connecting");
    let ws;
    try { ws = new WebSocket(this.url); } catch (e) { this.scheduleReconnect(); return; }
    this.ws = ws;
    // The backoff restarts only at the server's `welcome`, not here: the gateway accepts the
    // WebSocket before it knows the game server is up, so an open socket alone proves nothing.
    ws.onopen = () => { this.everOpened = true; this.setStatus("open"); };
    ws.onmessage = ev => this.onLine(ev.data);
    ws.onclose = ev => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.welcome = null;
      this.failAll("disconnected", "connection lost");
      this.setStatus("closed", { code: ev.code, reason: ev.reason });
      if (this.autoReconnect) this.scheduleReconnect();
    };
    ws.onerror = () => { /* onclose follows and handles it */ };
  }

  scheduleReconnect() {
    clearTimeout(this.reconnectTimer);
    const delay = Math.min(15000, 1000 * 2 ** Math.min(this.retry++, 4)) + Math.random() * 400;
    this.setStatus("waiting", { inMs: delay });
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  // Stop reconnecting (kicked because the account logged in elsewhere, or a reconnect found it
  // playing elsewhere: reconnecting would kick the other device back, forever).
  halt() { this.autoReconnect = false; clearTimeout(this.reconnectTimer); if (this.ws) this.ws.close(1000, "client stopped"); }
  resumeReconnecting() { this.autoReconnect = true; this.retry = 0; this.connect(); }

  onLine(text) {
    let msg;
    try { msg = JSON.parse(text); } catch { console.warn("ignored a line that isn't JSON"); return; }
    if (!msg || typeof msg !== "object") return;
    if (typeof msg.event === "string") {
      if (msg.event === "welcome") { this.retry = 0; this.welcome = msg.data || {}; this.emit("welcome", this.welcome); }
      this.emit("event", msg);
      return;
    }
    // A reply. Replies come back in the order requests were sent, so one without `re` (older
    // servers answer `rate_limited` and `bad_request` without it) belongs to the oldest open request.
    let id = msg.re;
    if (id === undefined || id === null) id = this.order[0];
    if (!this.pending.has(id)) return;  // a reply to a request that already timed out
    this.settle(id, msg.ok ? { ok: true, data: msg.data ?? {} } : { ok: false, error: normError(msg.error) });
  }

  settle(id, reply) {
    const p = this.pending.get(id);
    if (!p) return;
    clearTimeout(p.timer);
    this.pending.delete(id);
    const i = this.order.indexOf(id);
    if (i >= 0) this.order.splice(i, 1);
    p.resolve(reply);
  }

  failAll(code, message) { for (const id of [...this.pending.keys()]) this.settle(id, { ok: false, error: { code, message } }); }

  // Always resolves: {ok: true, data} or {ok: false, error: {code, message}}.
  request(op, args = {}) {
    return new Promise(resolve => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) { resolve({ ok: false, error: { code: "disconnected", message: "not connected to the server" } }); return; }
      const id = this.nextId++;
      const body = { ...args };
      delete body.id; delete body.op;   // `id` is reserved for matching (protocol rule)
      const line = JSON.stringify({ id, op, ...body });
      const timer = setTimeout(() => this.settle(id, { ok: false, error: { code: "timeout", message: "the server didn't answer" } }), REQUEST_TIMEOUT_MS);
      this.pending.set(id, { resolve, op, timer });
      this.order.push(id);
      try { this.ws.send(line); } catch { this.settle(id, { ok: false, error: { code: "disconnected", message: "not connected to the server" } }); }
    });
  }

  // After the welcome: log back in with the stored token, if there is one. `takeOver` false asks
  // the server not to kick a session the account has open on another device (it answers
  // `in_use_elsewhere`); a server that doesn't know the flag ignores it and takes over as before.
  async resume(takeOver = true) {
    const token = this.token;
    if (!token) return { ok: false, error: { code: "no_token", message: "" } };
    const r = await this.request("resume", { token, take_over: !!takeOver });
    if (r.ok) { if (r.data.token) this.saveToken(r.data.token); return r; }
    if (r.error.code === "bad_token" || r.error.code === "unknown_op" || r.error.code === "bad_request") this.clearToken();
    return r;
  }
}

function normError(e) {
  if (!e || typeof e !== "object") return { code: "error", message: "the server refused" };
  return { code: String(e.code || "error"), message: String(e.message || e.code || "the server refused") };
}
