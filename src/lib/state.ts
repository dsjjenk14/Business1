/**
 * The per user progress blob. Same shape as the prototype's `S` object so the
 * logic carries over one to one. In Phase 3 this is what syncs to Postgres.
 */
import type { Tier } from "@/config/site";
import { STEPS } from "./journey";

export interface User {
  name: string;
  email: string;
  industry: string;
  dream: string;
  goal: string;
  paid?: boolean;
  tier?: Tier;
}
export interface Contact { n: string; c: string; s: number }
export interface Application { c: string; r: string; s: number; d: string }
export interface Offer { c: string; b: string; p: string }

export interface AppState {
  user: User | null;
  done: Record<string, boolean | number>;
  chk: Record<string, boolean>;
  txt: Record<string, string | number>;
  contacts: Contact[];
  apps: Application[];
  offers: Offer[];
  quiz: string | null;
  badges: Record<string, boolean>;
  streak: { n: number; last: string };
}

export function blank(): AppState {
  return { user: null, done: {}, chk: {}, txt: {}, contacts: [], apps: [], offers: [], quiz: null, badges: {}, streak: { n: 1, last: "" } };
}

/** Fill in anything an older saved blob is missing. */
export function normalize(s: Partial<AppState> | null | undefined): AppState {
  const b = blank();
  if (!s) return b;
  return {
    user: s.user ?? null,
    done: s.done ?? {},
    chk: s.chk ?? {},
    txt: s.txt ?? {},
    contacts: s.contacts ?? [],
    apps: s.apps ?? [],
    offers: s.offers ?? [],
    quiz: s.quiz ?? null,
    badges: s.badges ?? {},
    streak: s.streak ?? b.streak,
  };
}

export function txt(S: AppState, k: string): string {
  const v = S.txt[k];
  return v == null ? "" : String(v);
}

export function touchStreak(S: AppState): AppState {
  const today = new Date().toDateString();
  const streak = S.streak ?? { n: 1, last: "" };
  if (streak.last === today) return S;
  const y = new Date();
  y.setDate(y.getDate() - 1);
  const n = streak.last === y.toDateString() ? streak.n + 1 : 1;
  return { ...S, streak: { n, last: today } };
}

export function pct(S: AppState): number {
  return Math.round((Object.keys(S.done).filter((k) => S.done[k]).length / STEPS.length) * 100);
}

export function firstName(S: AppState): string {
  return String(S.user?.name ?? "").split(" ")[0];
}

export function initials(n: string): string {
  const p = String(n || "").trim().split(/\s+/).filter(Boolean);
  return ((p[0] || "?")[0] + (p[1] ? p[1][0] : "")).toUpperCase();
}

/** Returns the state with any newly earned badges, plus whether one was added. */
export function checkBadges(S: AppState): { state: AppState; unlocked: boolean } {
  const b = { ...S.badges };
  const before = Object.keys(b).length;
  if (S.quiz) b.known = true;
  if (txt(S, "rb1").length > 25) b.built = true;
  if (txt(S, "liHead").length > 15) b.visible = true;
  if (S.contacts.length >= 5) b.social = true;
  if (S.apps.length >= 5) b.hunter = true;
  let ans = 0;
  Object.keys(S.txt).forEach((k) => {
    if (k.indexOf("iv_") === 0 && txt(S, k).length > 25) ans++;
  });
  if (ans >= 5) b.ready = true;
  // Not in the prototype (the badge could never be earned): all 7 first year milestones checked.
  if ([0, 1, 2, 3, 4, 5, 6].every((i) => S.chk["fymiles_" + i])) b.rooted = true;
  if (S.done.grad) b.grad = true;
  const unlocked = Object.keys(b).length > before;
  return { state: { ...S, badges: b }, unlocked };
}

export function jobCount(S: AppState): number {
  return Math.max(1, Math.min(6, (Number(S.txt.jobN) | 0) || 1));
}

export function migrateJobs(S: AppState): AppState {
  if (S.txt.jobN) return S;
  const t: AppState["txt"] = { ...S.txt, jobN: 1 };
  if (t.rTitle && !t.j1_title) t.j1_title = t.rTitle;
  if (t.rCompany && !t.j1_co) t.j1_co = t.rCompany;
  if (t.rDates && !t.j1_d) t.j1_d = t.rDates;
  ["1", "2", "3"].forEach((k) => {
    if (t["rb" + k] && !t["j1_b" + k]) t["j1_b" + k] = t["rb" + k];
  });
  return { ...S, txt: t };
}

/** Fisher-Yates. Used so the right answer is not always the first button. */
export function shuffle<T>(a: T[]): T[] {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}
