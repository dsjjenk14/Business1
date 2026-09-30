"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useApp } from "./AppProvider";
import { STEPS, viewMeta, type ViewId } from "@/lib/journey";
import { initials, pct } from "@/lib/state";

export function currentView(path: string): ViewId {
  const last = path.replace(/\/$/, "").split("/").pop();
  return (!last || last === "app" ? "dashboard" : last) as ViewId;
}

export function Shell({ children }: { children: React.ReactNode }) {
  const { ready, S, demo, go, signOut, exitDemo, hasAccess } = useApp();
  const router = useRouter();
  const path = usePathname();
  const cur = currentView(path);
  const [railOpen, setRailOpen] = useState(false);
  const spineRef = useRef<HTMLDivElement>(null);
  const [fill, setFill] = useState(0);

  // Not signed in: back to the gate (or account creation if they already paid).
  useEffect(() => {
    if (ready && !S.user) router.replace(hasAccess() ? "/signin?tab=up" : "/");
  }, [ready, S.user, hasAccess, router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setRailOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // The spine fills down to the last completed step.
  useLayoutEffect(() => {
    let last = -1;
    STEPS.forEach((s, i) => { if (S.done[s.id]) last = i; });
    const sp = spineRef.current;
    if (!sp || last < 0) { setFill(0); return; }
    const lb = sp.querySelector<HTMLElement>("#nav-" + STEPS[last].id);
    setFill(lb ? Math.max(0, lb.offsetTop + lb.offsetHeight / 2 - 14) : 0);
  }, [S.done, ready]);

  if (!ready || !S.user) return null;

  const p = pct(S);
  const meta = viewMeta(cur);
  const nav = (id: ViewId) => { setRailOpen(false); go(id); };

  return (
    <>
      <div className={"overlay" + (railOpen ? " on" : "")} onClick={() => setRailOpen(false)} />
      <div id="app">
        <aside id="rail" className={railOpen ? "open" : ""} aria-label="Journey">
          <div className="rail-top">
            <div className="brandmark"><div className="bm-dot">HR</div><div className="bm-txt">The HR Blueprint</div></div>
            <div className="rail-user">
              <div className="avatar">{initials(S.user.name)}</div>
              <div style={{ minWidth: 0 }}>
                <b>{S.user.name}</b>
                <span>{S.user.goal}</span>
              </div>
            </div>
          </div>
          <nav className="rail-scroll">
            <div className="rail-lbl">Your dashboard</div>
            <div className="spine" style={{ paddingBottom: 6 }}>
              <button className={"step" + (cur === "dashboard" ? " on" : "")} onClick={() => nav("dashboard")} aria-current={cur === "dashboard" ? "page" : undefined}>
                <span className="step-dot">◈</span><span className="step-txt">Home base</span></button>
            </div>
            <div className="rail-lbl">The journey</div>
            <div className="spine" ref={spineRef}>
              <div className="spine-fill" style={{ height: fill + "px" }} />
              {STEPS.map((s, i) => {
                const head = i === 0 || STEPS[i - 1].part !== s.part
                  ? <div className="rail-lbl" style={{ paddingLeft: 10 }}>{s.part}</div> : null;
                const done = !!S.done[s.id];
                return (
                  <div key={s.id} style={{ display: "contents" }}>
                    {head}
                    <button id={"nav-" + s.id} className={"step" + (done ? " done" : "") + (cur === s.id ? " on" : "")}
                      onClick={() => nav(s.id)} aria-current={cur === s.id ? "page" : undefined}>
                      <span className="step-dot">{done ? "✓" : i + 1}</span><span className="step-txt">{s.nav}</span>
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="rail-lbl">Always open</div>
            <div className="spine" style={{ paddingBottom: 14 }}>
              <button className={"step" + (cur === "premium" ? " on" : "")} onClick={() => nav("premium")}>
                <span className="step-dot">★</span><span className="step-txt">Work With Me</span></button>
              <button className={"step" + (cur === "contact" ? " on" : "")} onClick={() => nav("contact")}>
                <span className="step-dot">✉</span><span className="step-txt">Contact Dominique</span></button>
            </div>
          </nav>
          <div className="rail-bottom">
            <div className="streak">
              <b>{S.streak.n}</b>
              <span>{S.streak.n === 1 ? "day streak" : "days in a row"}<br />Keep it going.</span>
            </div>
            <button className="btn btn-g btn-sm btn-full" onClick={signOut}>Sign out</button>
          </div>
        </aside>

        <div id="main">
          {demo ? (
            <div id="demoBar">
              <b>Beta</b>
              <span className="dt">Beta preview with example data filled in. Everything works, nothing is saved to a real account.</span>
              <button onClick={exitDemo}>Exit beta</button>
            </div>
          ) : null}
          <header id="topbar">
            <button className="menu-btn" onClick={() => setRailOpen(true)} aria-label="Open menu">☰</button>
            <div className="tb-title">
              <div className="eyebrow">{meta.eyebrow}</div>
              <h2>{meta.title}</h2>
            </div>
            <div className="ring-wrap" aria-label={p + "% complete"}>
              <svg width="46" height="46" viewBox="0 0 46 46" style={{ transform: "rotate(-90deg)" }} aria-hidden="true">
                <circle cx="23" cy="23" r="19" fill="none" stroke="#E3E8EF" strokeWidth="5" />
                <circle cx="23" cy="23" r="19" fill="none" stroke="#38B2AC" strokeWidth="5" strokeLinecap="round"
                  strokeDasharray="119.4" strokeDashoffset={119.4 - (119.4 * p) / 100}
                  style={{ transition: "stroke-dashoffset .7s cubic-bezier(.4,0,.2,1)" }} />
              </svg>
              <div><b>{p}%</b><span>complete</span></div>
            </div>
          </header>
          <main id="view" key={cur} className="page-in">{children}</main>
        </div>
      </div>
    </>
  );
}
