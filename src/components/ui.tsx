"use client";
/** The prototype's shared widgets (note, bridge, band, chk, ta, inp, tpl, acc, footNav, renderAd) as components. */
import { useId, useState } from "react";
import { usePathname } from "next/navigation";
import { useApp } from "./AppProvider";
import { Doodle, type DoodleName } from "./Doodle";
import { STEPS, stepIndex } from "@/lib/journey";
import { txt } from "@/lib/state";

export type NoteKind = "rec" | "story" | "myth" | "decode" | "mistake" | "win" | "action" | "reflect";

export function Note({ kind, label, children }: { kind: NoteKind; label: string; children: React.ReactNode }) {
  return (
    <div className={"note n-" + kind}>
      <div className="nl">{label}</div>
      {children}
    </div>
  );
}

/** Recruiter's notes, the most common callout. */
export function Rec({ children }: { children: React.ReactNode }) {
  return <Note kind="rec" label="Recruiter's notes">{children}</Note>;
}

export function Bridge({ why, get }: { why: React.ReactNode; get: string }) {
  const path = usePathname();
  const cur = path.split("/").pop() ?? "";
  const i = stepIndex(cur);
  const prev = i > 0 ? STEPS[i - 1].title : null;
  const lead = prev ? "Coming from " + prev : "Where you are now";
  return (
    <div className="bridge">
      <div className="bl"><Doodle name="arrow" size={20} /><span>{lead}</span></div>
      <p className="bq">{why}</p>
      <div className="bg"><b>By the end of this step you will have:</b> {get}</div>
    </div>
  );
}

export function Band({ icon, color, children }: { icon: DoodleName; color?: string; children: React.ReactNode }) {
  return (
    <div className="dd-band">
      <Doodle name={icon} size={46} color={color ?? "#38B2AC"} />
      <p>{children}</p>
    </div>
  );
}

export function Mark({ icon, label }: { icon: DoodleName; label: string }) {
  return <div className="dd-mark"><Doodle name={icon} size={26} /><span>{label}</span></div>;
}

export function HeroDoodle({ name }: { name: DoodleName }) {
  return <div className="dd-hero"><Doodle name={name} size={150} color="#8EDBC2" /></div>;
}

/** Checklist. Keys are `${key}_${index}` exactly like the prototype so saved data carries over. */
export function Chk({ k, items }: { k: string; items: React.ReactNode[] }) {
  const { S, toggleChk } = useApp();
  return (
    <ul className="chk">
      {items.map((t, i) => {
        const key = k + "_" + i;
        const on = !!S.chk[key];
        return (
          <ChkItem key={key} on={on} onToggle={() => toggleChk(key)}>{t}</ChkItem>
        );
      })}
    </ul>
  );
}

export function ChkItem({ on, onToggle, children }: { on: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <li
      className={on ? "on" : ""}
      role="checkbox"
      aria-checked={on}
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") { e.preventDefault(); onToggle(); }
      }}
    >
      <span className="cbox" aria-hidden="true">✓</span><span>{children}</span>
    </li>
  );
}

export function TA({ k, ph, rows = 4, label }: { k: string; ph: string; rows?: number; label?: string }) {
  const { S, setTxt } = useApp();
  return (
    <textarea className="inp" rows={rows} placeholder={ph} aria-label={label ?? ph}
      value={txt(S, k)} onChange={(e) => setTxt(k, e.target.value)} />
  );
}

export function Inp({ k, ph, label, onInput }: { k: string; ph: string; label?: string; onInput?: () => void }) {
  const { S, setTxt } = useApp();
  return (
    <input className="inp" placeholder={ph} aria-label={label ?? ph}
      value={txt(S, k)} onChange={(e) => { setTxt(k, e.target.value); onInput?.(); }} />
  );
}

export function copyText(t: string): Promise<void> {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(t).catch(() => fallbackCopy(t));
  }
  return fallbackCopy(t);
}
function fallbackCopy(t: string): Promise<void> {
  const a = document.createElement("textarea");
  a.value = t; a.style.position = "fixed"; a.style.opacity = "0";
  document.body.appendChild(a); a.select();
  try { document.execCommand("copy"); return Promise.resolve(); }
  catch (e) { return Promise.reject(e); }
  finally { document.body.removeChild(a); }
}

export function Tpl({ label, text }: { label: string; text: string }) {
  const { toast } = useApp();
  const [ok, setOk] = useState(false);
  return (
    <div className="tpl">
      <div className="tl">{label}</div>
      <button className={"copy" + (ok ? " ok" : "")} onClick={() => {
        copyText(text).then(() => { setOk(true); setTimeout(() => setOk(false), 1800); },
          () => toast("Select the text and copy manually."));
      }}>{ok ? "Copied" : "Copy"}</button>
      <pre>{text}</pre>
    </div>
  );
}

export function Acc({ q, children }: { q: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className={"acc" + (open ? " open" : "")}>
      <button className="acc-hd" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        <span className="ar" aria-hidden="true">▶</span><span className="q">{q}</span>
      </button>
      <div className="acc-bd" id={id}>{children}</div>
    </div>
  );
}

export function FootNav({ id }: { id: string }) {
  const { S, markDone, prevStep } = useApp();
  const i = stepIndex(id);
  const isLast = i === STEPS.length - 1;
  return (
    <div className="foot-nav">
      <button className="btn btn-g" onClick={() => prevStep(id)}>← Back</button>
      <button className="btn btn-t" onClick={() => markDone(id)}>
        {S.done[id] ? "Continue →" : isLast ? "Finish ✓" : "Mark complete →"}
      </button>
    </div>
  );
}

export interface AdConfig { headline: string; text: string; cta: string; url: string }

export function AdSlot({ cfg, slot }: { cfg: AdConfig | null; slot: 1 | 2 }) {
  if (cfg && (cfg.headline || "").trim()) {
    return (
      <div className="adslot filled">
        <span className="adlabel">Sponsored</span>
        <div className="adhead">{cfg.headline}</div>
        {cfg.text ? <div className="adtext">{cfg.text}</div> : null}
        {cfg.url ? <a className="btn btn-g btn-sm" href={cfg.url} target="_blank" rel="noopener sponsored">{cfg.cta || "Learn more"}</a> : null}
      </div>
    );
  }
  return (
    <div className="adslot">
      <span className="adlabel">Ad space {slot}</span>
      <div className="adempty">
        <Doodle name="star" size={30} color="#8EDBC2" />
        <div><b>Your ad here</b><span>A sponsor slot you control. Fill AD_{slot} at the top of the file, or sell this space.</span></div>
      </div>
    </div>
  );
}

/** Save an HTML string as a Word-openable .doc, exactly like the prototype's export. */
export function downloadDoc(html: string, filename: string): boolean {
  try {
    const blob = new Blob(["﻿", html], { type: "application/msword" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    return true;
  } catch { return false; }
}

export function esc(s: unknown): string {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
