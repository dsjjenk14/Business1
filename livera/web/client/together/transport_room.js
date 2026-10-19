// The client-side transport for "Play together": the interface transport.js gives the rest of the client
// (request(op, args) always resolving to {ok, data} or {ok: false, error: {code, message}}; `welcome`, `event` and
// `status` listeners; status "open" while usable), over a pipe to whichever tab hosts the town. A friend's pipe is
// an encrypted channel through the artifact's room (link.js FriendEnd); the host's own player's pipe goes straight
// into the town in the same tab (host.js TownHost.localPipe). The game client can't tell the two apart, and
// neither can the host: every request is answered by the same code.
//
// The page shell (together.js) attaches a pipe when there is a host and detaches it when the host goes, the role
// changes or this page is kicked; each attach ends in a fresh `welcome`, which the shell treats like a reconnect.

const REQUEST_TIMEOUT_MS = 20000;

export class RoomTransport {
  constructor() {
    this.listeners = new Map();
    this.status = "idle";
    this.welcome = null;
    this.ws = null;            // the live client peeks at this; there is no socket here
    this.pipe = null;
    this.unsubs = [];
    this.pending = new Map();  // id -> {resolve, timer, op}
    this.nextId = 1;
    this.halted = false;
    this.lastClose = null;     // {reason} of the last time the pipe went away
    this.onHalt = null; this.onResume = null;   // set by the page shell
  }

  on(name, fn) { if (!this.listeners.has(name)) this.listeners.set(name, new Set()); this.listeners.get(name).add(fn); return () => this.listeners.get(name).delete(fn); }
  emit(name, data) { for (const fn of this.listeners.get(name) || []) { try { fn(data); } catch (e) { console.warn("listener failed", name, e); } } }
  setStatus(s, detail) { this.status = s; this.emit("status", { status: s, detail }); }

  // No accounts and no tokens: who you are is the platform's id for you, checked by the host on every message.
  get token() { return null; }
  saveToken() {}
  clearToken() {}
  async resume() { return { ok: false, error: { code: "no_token", message: "" } }; }

  connect() { if (!this.pipe && this.status === "idle") this.setStatus("waiting", { reason: "no_host" }); }
  // Kicked (the same person started playing in another tab): stop until "Play here instead".
  halt() { this.halted = true; this.detach("halted"); if (this.onHalt) this.onHalt(); }
  resumeReconnecting() { this.halted = false; if (this.onResume) this.onResume(); }

  attach(pipe) {
    this.detach("replaced", true);
    this.pipe = pipe;
    this.welcome = null;
    this.unsubs.push(pipe.onItem(item => this.onItem(pipe, item)));
    this.unsubs.push(pipe.onState(s => {
      if (this.pipe !== pipe) return;
      if (s.state === "closed") this.detach(s.reason || "closed");
      else if (s.state === "connecting") this.setStatus("connecting");
      else if (s.state === "trouble") this.emit("trouble", s.kind);
    }));
    this.setStatus("connecting");
    if (typeof pipe.open === "function") pipe.open();
  }

  // The pipe is gone: open requests fail as they would on a dropped WebSocket.
  detach(reason, quiet = false) {
    const pipe = this.pipe;
    for (const u of this.unsubs) u();
    this.unsubs = [];
    this.pipe = null;
    this.welcome = null;
    if (pipe) { try { pipe.close(); } catch { /* already closed */ } }
    this.failAll("disconnected", reason === "halted" ? "stopped" : "the connection to the host ended");
    if (pipe || !quiet) { this.lastClose = { reason }; if (!quiet) this.setStatus("closed", { reason }); }
  }

  onItem(pipe, item) {
    if (this.pipe !== pipe || !item || typeof item !== "object") return;
    switch (item.k) {
      case "welcome": {
        this.welcome = { protocol: item.protocol || "livera/1", build: "together", rules: item.rules, town: item.town || {} };
        this.setStatus("open");
        this.emit("welcome", this.welcome);
        this.emit("event", { event: "welcome", data: this.welcome });
        return;
      }
      case "rep": {
        const p = this.pending.get(item.id);
        if (!p) return;   // a reply to a request that already timed out
        this.settle(item.id, item.ok ? { ok: true, data: item.data ?? {} } : { ok: false, error: normError(item.error) });
        return;
      }
      case "ev":
        if (typeof item.event === "string") this.emit("event", { event: item.event, data: item.data && typeof item.data === "object" ? item.data : {} });
        return;
      case "status":
        // The town's public state (paused, how many people); together.js shows it.
        this.emit("event", { event: "together_status", data: item.status || {} });
        return;
      default: return;
    }
  }

  settle(id, reply) {
    const p = this.pending.get(id);
    if (!p) return;
    clearTimeout(p.timer);
    this.pending.delete(id);
    p.resolve(reply);
  }
  failAll(code, message) { for (const id of [...this.pending.keys()]) this.settle(id, { ok: false, error: { code, message } }); }

  // Always resolves: {ok: true, data} or {ok: false, error: {code, message}}.
  request(op, args = {}) {
    return new Promise(resolve => {
      if (!this.pipe || this.status !== "open") { resolve({ ok: false, error: { code: "disconnected", message: "not connected to the host" } }); return; }
      const id = this.nextId++;
      const body = { ...args };
      delete body.id; delete body.op;   // `id` is reserved for matching (protocol rule)
      const timer = setTimeout(() => this.settle(id, { ok: false, error: { code: "timeout", message: "the host didn't answer" } }), REQUEST_TIMEOUT_MS);
      this.pending.set(id, { resolve, timer, op });
      try { this.pipe.send({ k: "req", id, op, args: body }); }
      catch { this.settle(id, { ok: false, error: { code: "disconnected", message: "not connected to the host" } }); }
    });
  }

  stats() { return this.pipe && typeof this.pipe.stats === "function" ? this.pipe.stats() : null; }
}

function normError(e) {
  if (!e || typeof e !== "object") return { code: "error", message: "the host refused" };
  return { code: String(e.code || "error"), message: String(e.message || e.code || "the host refused") };
}
