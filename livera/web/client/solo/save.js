// The save slot: one record per browser, in IndexedDB, or in localStorage when IndexedDB is
// missing or refuses (some private windows, blocked storage). The record is what the game core
// wrote (`solo_save`, a JSON object with `format`) plus who was being played and when; the same
// record is what export writes to a file and import reads back, so a save can move between
// devices. Nothing here interprets the world state: the core validates it on load.

const DB_NAME = "livera-solo", STORE = "saves", KEY = "slot", LS_KEY = "livera.solo.save";
export const SAVE_FORMAT = "livera-solo-save/1";

export class SaveSlot {
  constructor() { this.backend = null; }   // "indexeddb" | "localstorage" | "none", once probed

  async load() {
    const v = await this.withBackend(
      async db => idbRequest(db.transaction(STORE, "readonly").objectStore(STORE).get(KEY)),
      () => { const t = localStorage.getItem(LS_KEY); return t ? JSON.parse(t) : null; });
    return v && checkRecord(v) === null ? v : null;
  }
  async save(record) {
    const problem = checkRecord(record);
    if (problem) throw new Error(problem);
    await this.withBackend(
      async db => { const tx = db.transaction(STORE, "readwrite"); tx.objectStore(STORE).put(record, KEY); await txDone(tx); },
      () => { localStorage.setItem(LS_KEY, JSON.stringify(record)); if (!localStorage.getItem(LS_KEY)) throw new Error("localStorage kept nothing"); });
  }
  async clear() {
    await this.withBackend(
      async db => { const tx = db.transaction(STORE, "readwrite"); tx.objectStore(STORE).delete(KEY); await txDone(tx); },
      () => localStorage.removeItem(LS_KEY));
  }

  // IndexedDB first, localStorage when it won't; `none` when neither works (the error says why).
  async withBackend(viaIdb, viaLocal) {
    if (this.backend !== "localstorage") {
      try {
        const db = await openDb();
        try { const v = await viaIdb(db); this.backend = "indexeddb"; return v; } finally { db.close(); }
      } catch (e) {
        if (this.backend === "indexeddb") throw new Error(`IndexedDB refused: ${message(e)}`);
        this.idbProblem = message(e);
      }
    }
    try { const v = viaLocal(); this.backend = "localstorage"; return v; } catch (e) {
      this.backend = "none";
      throw new Error(`this browser blocks storage (IndexedDB: ${this.idbProblem || "unavailable"}; localStorage: ${message(e)})`);
    }
  }
}

export function makeRecord(state, character, characterName) {
  return { format: SAVE_FORMAT, saved_at: new Date().toISOString(), character: character || null, character_name: characterName || "", state };
}
// A record the page can hand to the core; the core itself checks the world inside `state`.
export function checkRecord(v) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return "not a save record";
  if (v.format !== SAVE_FORMAT) return `unknown save format "${String(v.format)}" (this build reads ${SAVE_FORMAT})`;
  if (!v.state || typeof v.state !== "object" || Array.isArray(v.state)) return "the save has no world state";
  if (v.character !== null && v.character !== undefined && typeof v.character !== "string") return "the save names no character";
  return null;
}

// A download of the record as a file; returns the file name.
export function exportRecord(record) {
  const stamp = String(record.saved_at || new Date().toISOString()).replace(/[:T]/g, "-").slice(0, 16);
  const name = `livera-save-${record.character || "town"}-${stamp}.json`;
  const blob = new Blob([JSON.stringify(record)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.rel = "noopener";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return name;
}
// A file the player picked, as a checked record (throws with a plain message).
export async function readRecordFile(file) {
  if (!file) throw new Error("no file picked");
  if (file.size > 64 * 1024 * 1024) throw new Error("that file is too big to be a save");
  let v;
  try { v = JSON.parse(await file.text()); } catch { throw new Error("that file isn't JSON"); }
  const problem = checkRecord(v);
  if (problem) throw new Error(problem);
  return v;
}

function openDb() {
  return new Promise((resolve, reject) => {
    let req;
    try { req = indexedDB.open(DB_NAME, 1); } catch (e) { reject(e); return; }
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("open failed"));
    req.onblocked = () => reject(new Error("blocked by another tab"));
  });
}
const idbRequest = req => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error || new Error("request failed")); });
const txDone = tx => new Promise((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error || new Error("transaction failed")); tx.onabort = () => reject(tx.error || new Error("transaction aborted")); });
const message = e => String((e && (e.message || e.name)) || e || "unknown");
