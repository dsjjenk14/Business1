"use client";
/**
 * Holds the progress blob (the prototype's `S`) and the app wide actions.
 * Phase 2: persists to localStorage exactly like the prototype.
 * Phase 3 swaps the storage adapter for Supabase without touching the views.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { STEPS, stepIndex, type ViewId } from "@/lib/journey";
import { blank, checkBadges, migrateJobs, normalize, touchStreak, type AppState, type User } from "@/lib/state";
import { demoState } from "@/lib/demo";
import type { Tier } from "@/config/site";

const KEY_REAL = "hrbp_v1";
const KEY_DEMO = "hrbp_demo_v1";
const KEY_ACCESS = "hrbp_access_v1";
const KEY_MODE = "hrbp_mode";

const Store = {
  get<T>(k: string, d: T): T {
    try { const v = localStorage.getItem(k); return v == null ? d : (JSON.parse(v) as T); } catch { return d; }
  },
  set(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
  del(k: string) { try { localStorage.removeItem(k); } catch { /* private mode */ } },
};

interface Access { ok: boolean; tier: Tier }

interface Ctx {
  ready: boolean;
  S: AppState;
  demo: boolean;
  update: (fn: (s: AppState) => AppState) => void;
  setTxt: (k: string, v: string | number) => void;
  toggleChk: (k: string) => void;
  badges: () => void;
  toast: (msg: string) => void;
  celebrate: () => void;
  go: (id: ViewId) => void;
  markDone: (id: string) => void;
  prevStep: (id: string) => void;
  isPremium: boolean;
  hasAccess: () => boolean;
  grantAccess: (tier: Tier) => void;
  signUp: (u: User) => void;
  signIn: (email: string) => boolean;
  signOut: () => void;
  startDemo: () => void;
  exitDemo: () => void;
}

const AppCtx = createContext<Ctx | null>(null);

export function useApp(): Ctx {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp outside AppProvider");
  return c;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [demo, setDemo] = useState(false);
  const [S, setS] = useState<AppState>(blank);
  const [toastMsg, setToastMsg] = useState("");
  const [toastUp, setToastUp] = useState(false);
  const toastT = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const keyRef = useRef(KEY_REAL);

  // Load once on the client.
  useEffect(() => {
    let isDemo = false;
    try { isDemo = sessionStorage.getItem(KEY_MODE) === "demo"; } catch { /* ignore */ }
    const q = location.search + location.hash;
    if (/[?&#]demo\b/.test(q) || location.hash === "#demo") isDemo = true;
    // Return from checkout (Phase 4 replaces this with the server entitlement).
    if (/[?&#]paid=1/.test(q)) {
      Store.set(KEY_ACCESS, { ok: true, tier: /tier=premium/.test(q) ? "premium" : "basic" });
    }
    keyRef.current = isDemo ? KEY_DEMO : KEY_REAL;
    let s = normalize(Store.get<AppState | null>(keyRef.current, null));
    if (isDemo && !s.user) s = demoState();
    if (s.user) s = touchStreak(migrateJobs(s));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one time hydration from localStorage
    setDemo(isDemo);
    setS(s);
    setReady(true);
  }, []);

  // Persist on every change (debounced).
  useEffect(() => {
    if (!ready || !S.user) return;
    const t = setTimeout(() => Store.set(keyRef.current, S), 250);
    return () => clearTimeout(t);
  }, [S, ready]);

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    setToastUp(true);
    clearTimeout(toastT.current);
    toastT.current = setTimeout(() => setToastUp(false), 3400);
  }, []);

  const celebrate = useCallback(() => {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const cols = ["#8EDBC2", "#38B2AC", "#0F2744", "#C7EFE1", "#5FC4A4"];
    for (let i = 0; i < 70; i++) {
      setTimeout(() => {
        const c = document.createElement("div");
        c.className = "confetti";
        c.style.left = Math.random() * 100 + "vw";
        c.style.background = cols[i % cols.length];
        c.style.transform = "rotate(" + Math.random() * 360 + "deg)";
        document.body.appendChild(c);
        const dur = 2200 + Math.random() * 1400;
        c.animate(
          [{ transform: "translateY(0) rotate(0deg)", opacity: 1 },
            { transform: "translateY(105vh) rotate(" + (Math.random() * 720 - 360) + "deg)", opacity: 0 }],
          { duration: dur, easing: "cubic-bezier(.25,.6,.4,1)" },
        );
        setTimeout(() => c.remove(), dur);
      }, i * 22);
    }
  }, []);

  const update = useCallback((fn: (s: AppState) => AppState) => setS((s) => fn(s)), []);

  const badges = useCallback(() => {
    setS((s) => {
      const r = checkBadges(s);
      if (r.unlocked) setTimeout(() => toast("Badge unlocked. Check your dashboard."), 0);
      return r.state;
    });
  }, [toast]);

  const setTxt = useCallback((k: string, v: string | number) => setS((s) => ({ ...s, txt: { ...s.txt, [k]: v } })), []);

  const toggleChk = useCallback((k: string) => {
    setS((s) => {
      const next = { ...s, chk: { ...s.chk, [k]: !s.chk[k] } };
      const r = checkBadges(next);
      if (r.unlocked) setTimeout(() => toast("Badge unlocked. Check your dashboard."), 0);
      return r.state;
    });
  }, [toast]);

  const go = useCallback((id: ViewId) => {
    router.push(id === "dashboard" ? "/app" : "/app/" + id);
    window.scrollTo({ top: 0, behavior: "auto" });
    setS((s) => (s.user ? touchStreak(s) : s));
  }, [router]);

  const nextStep = useCallback((id: string) => {
    const i = stepIndex(id);
    if (i >= 0 && i < STEPS.length - 1) go(STEPS[i + 1].id); else go("dashboard");
  }, [go]);

  const prevStep = useCallback((id: string) => {
    const i = stepIndex(id);
    if (i > 0) go(STEPS[i - 1].id); else go("dashboard");
  }, [go]);

  const markDone = useCallback((id: string) => {
    if (S.done[id]) { nextStep(id); return; }
    setS((s) => {
      const r = checkBadges({ ...s, done: { ...s.done, [id]: true } });
      if (r.unlocked) setTimeout(() => toast("Badge unlocked. Check your dashboard."), 0);
      return r.state;
    });
    toast("Step complete. Nice work.");
    setTimeout(() => nextStep(id), 420);
  }, [S.done, nextStep, toast]);

  const getAccess = () => Store.get<Access | null>(KEY_ACCESS, null);
  const hasAccess = useCallback(() => {
    if (demo) return true;
    const a = getAccess();
    if (a && a.ok) return true;
    return !!S.user?.paid;
  }, [demo, S.user]);
  const grantAccess = useCallback((tier: Tier) => Store.set(KEY_ACCESS, { ok: true, tier }), []);

  const tier: Tier = S.user?.tier ?? getAccessTier();
  function getAccessTier(): Tier {
    if (typeof window === "undefined") return "basic";
    return Store.get<Access | null>(KEY_ACCESS, null)?.tier ?? "basic";
  }

  const signUp = useCallback((u: User) => {
    const a = Store.get<Access | null>(KEY_ACCESS, null);
    const t: Tier = a?.tier ?? "basic";
    Store.set(KEY_ACCESS, { ok: true, tier: t });
    const s = touchStreak({ ...blank(), user: { ...u, paid: true, tier: t }, badges: { started: true } });
    keyRef.current = KEY_REAL;
    Store.set(KEY_REAL, s);
    setS(s);
    router.push("/app/welcome");
    setTimeout(() => toast("Welcome in, " + u.name.split(" ")[0] + ". Let us get to work."), 500);
  }, [router, toast]);

  const signIn = useCallback((email: string) => {
    void email;
    const saved = normalize(Store.get<AppState | null>(KEY_REAL, null));
    if (!saved.user) return false;
    keyRef.current = KEY_REAL;
    setS(touchStreak(migrateJobs(saved)));
    router.push("/app");
    toast("Welcome back, " + String(saved.user.name).split(" ")[0] + ".");
    return true;
  }, [router, toast]);

  const exitDemo = useCallback(() => {
    if (!confirm("Leave the beta? Anything you changed while exploring is discarded.")) return;
    Store.del(KEY_DEMO);
    try { sessionStorage.removeItem(KEY_MODE); } catch { /* ignore */ }
    setDemo(false);
    keyRef.current = KEY_REAL;
    setS(normalize(Store.get<AppState | null>(KEY_REAL, null)));
    router.push("/signin");
  }, [router]);

  const signOut = useCallback(() => {
    if (demo) { exitDemo(); return; }
    if (!confirm("Sign out? Your progress stays saved in this browser.")) return;
    router.push("/signin");
  }, [demo, exitDemo, router]);

  const startDemo = useCallback(() => {
    try { sessionStorage.setItem(KEY_MODE, "demo"); } catch { /* ignore */ }
    keyRef.current = KEY_DEMO;
    const saved = normalize(Store.get<AppState | null>(KEY_DEMO, null));
    setS(migrateJobs(saved.user ? saved : demoState()));
    setDemo(true);
    router.push("/app");
    setTimeout(() => toast("Beta mode. Click around, everything works."), 450);
  }, [router, toast]);

  const value = useMemo<Ctx>(() => ({
    ready, S, demo, update, setTxt, toggleChk, badges, toast, celebrate, go, markDone, prevStep,
    isPremium: tier === "premium", hasAccess, grantAccess, signUp, signIn, signOut, startDemo, exitDemo,
  }), [ready, S, demo, update, setTxt, toggleChk, badges, toast, celebrate, go, markDone, prevStep, tier,
    hasAccess, grantAccess, signUp, signIn, signOut, startDemo, exitDemo]);

  return (
    <AppCtx.Provider value={value}>
      {children}
      <div id="toast" className={toastUp ? "up" : ""} role="status" aria-live="polite">{toastMsg}</div>
    </AppCtx.Provider>
  );
}
