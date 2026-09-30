"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "../AppProvider";
import { AdSlot, Note, TA } from "../ui";
import { HeroDoodle } from "../ui";
import { BadgeGrid } from "./act5";
import { ADS, BOOK_LINK, CONTACT, priceLabel } from "@/config/site";
import { BADGES, STEPS } from "@/lib/journey";
import { CHALLENGES } from "@/lib/content";
import { firstName, pct, txt } from "@/lib/state";
import { buy } from "@/lib/checkout";

const heroStat = { background: "rgba(255,255,255,.09)", border: "1px solid rgba(255,255,255,.15)" };
const heroB = { color: "var(--mint)", fontFamily: "var(--dsp)", fontSize: 25 };
const heroS = { color: "rgba(255,255,255,.65)", fontSize: 11.5 };

function Bar({ label, p }: { label: string; p: number }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
        <span style={{ fontWeight: 600 }}>{label}</span><span style={{ color: "var(--slate)" }}>{p}%</span></div>
      <div style={{ height: 7, background: "var(--fog-2)", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ height: "100%", width: p + "%", background: "linear-gradient(90deg,var(--mint),var(--teal))", borderRadius: 4, transition: "width .6s" }} />
      </div>
    </div>
  );
}

const NOTE_LABELS: Record<string, string> = {
  rb1: "Resume bullet 1", rb2: "Resume bullet 2", rb3: "Resume bullet 3", liHead: "LinkedIn headline",
  liAbout: "LinkedIn About", reflect1: "Why I am doing this", reflect2: "My honest gut check", skillNote: "My skill translation",
  ninetyNote: "My 90 day note",
};

export function Dashboard() {
  const { S, go, isPremium } = useApp();
  const T = (k: string) => txt(S, k);
  const resumeP = Math.min(100, Math.round((["rb1", "rb2", "rb3"].filter((k) => T(k).length > 25).length / 3) * 100));
  const liP = Math.min(100, Math.round((["liHead", "liAbout"].filter((k) => T(k).length > 20).length / 2) * 100));
  const netP = Math.min(100, Math.round((S.contacts.length / 5) * 100));
  const ivN = Object.keys(S.txt).filter((k) => k.indexOf("iv_") === 0 && T(k).length > 25).length;
  const ivP = Math.min(100, Math.round((ivN / 6) * 100));
  const nextStepObj = STEPS.find((s) => !S.done[s.id]) ?? STEPS[STEPS.length - 1];
  const wk = CHALLENGES[new Date().getDay() % CHALLENGES.length];

  const rows = Object.keys(NOTE_LABELS).filter((k) => T(k).trim().length > 0).map((k) => ({ k, label: NOTE_LABELS[k] }));
  Object.keys(S.txt).forEach((k) => { if (k.indexOf("iv_") === 0 && T(k).trim()) rows.push({ k, label: "Interview answer" }); });

  return (
    <>
      <div className="hero">
        <div className="eyebrow">Welcome back</div>
        <h1>Hey {firstName(S)}. Let&apos;s keep moving.</h1>
        <p>{S.user!.goal}</p>
        <div className="stat-grid" style={{ marginTop: 26 }}>
          <div className="astat" style={heroStat}><b style={heroB}>{pct(S)}%</b><span style={heroS}>Journey complete</span></div>
          <div className="astat" style={heroStat}><b style={heroB}>{S.apps.length}</b><span style={heroS}>Applications logged</span></div>
          <div className="astat" style={heroStat}><b style={heroB}>{S.contacts.length}</b><span style={heroS}>People in your network</span></div>
          <div className="astat" style={heroStat}><b style={heroB}>{S.streak.n}</b><span style={heroS}>Day streak</span></div>
        </div>
      </div>

      <div className="card">
        <h3 className="sec">Pick up where you left off</h3>
        <p className="sub">Next up in your journey.</p>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", background: "var(--fog)", padding: 20, borderRadius: 16 }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div className="pill">{nextStepObj.eyebrow}</div>
            <b style={{ display: "block", fontFamily: "var(--dsp)", fontSize: 19, marginTop: 9 }}>{nextStepObj.title}</b>
          </div>
          <button className="btn btn-t" onClick={() => go(nextStepObj.id)}>Continue learning →</button>
        </div>
      </div>

      {isPremium ? (
        <div className="card"><span className="prem-badge">Premium · active</span>
          <h3 className="sec" style={{ marginTop: 12 }}>Your 90 days with me</h3>
          <p className="sub" style={{ marginBottom: 16 }}>You have a coach, not just a platform. Pick up where we left off.</p>
          <button className="btn btn-t" onClick={() => go("premium")}>Open your coaching hub →</button></div>
      ) : (
        <div className="card" style={{ border: "2px solid var(--mint)" }}><h3 className="sec">Want me in your corner?</h3>
          <p className="body" style={{ marginBottom: 16 }}>Upgrade to 90 days of direct coaching: a kickoff call, your materials reviewed by me, live mock interviews, and message access until you land it.</p>
          <button className="btn btn-t" onClick={() => go("premium")}>See the coaching option →</button></div>
      )}

      <AdSlot cfg={ADS[1]} slot={1} />

      <div className="grid2">
        <div className="card">
          <h3 className="sec">Your build progress</h3>
          <p className="sub">The four things that actually get you hired.</p>
          <Bar label="Resume bullets" p={resumeP} /><Bar label="LinkedIn profile" p={liP} />
          <Bar label="Networking" p={netP} /><Bar label="Interview answers" p={ivP} />
        </div>
        <div className="card">
          <h3 className="sec">This week&apos;s challenge</h3>
          <p className="sub">One thing. Do it before you do anything else.</p>
          <Note kind="action" label="Take action"><p>{wk}</p></Note>
          <button className="btn btn-g btn-sm" onClick={() => go("apply")}>Open application strategy</button>
        </div>
      </div>

      <div className="card">
        <h3 className="sec">Badges</h3>
        <p className="sub">{Object.keys(S.badges).length} of {BADGES.length} unlocked.</p>
        <BadgeGrid />
      </div>

      <div className="card">
        <h3 className="sec">Your saved notes</h3>
        <p className="sub">Everything you have written so far lives here.</p>
        {!rows.length ? (
          <div className="empty"><div className="ei">📝</div><b>Nothing saved yet</b><p>As you work through the journey, everything you write shows up here.</p></div>
        ) : rows.map(({ k, label }) => {
          let v = T(k); if (v.length > 210) v = v.slice(0, 210) + "…";
          return (
            <div className="trk" key={k}><div className="trk-main">
              <b style={{ fontSize: 13, color: "var(--teal-2)" }}>{label}</b>
              <span style={{ display: "block", marginTop: 5, color: "var(--navy)", fontSize: 14, lineHeight: 1.6 }}>{v}</span>
            </div></div>
          );
        })}
      </div>
    </>
  );
}

/* ───── WORK WITH ME (PREMIUM) ───── */
export function Premium() {
  const { isPremium } = useApp();
  return isPremium ? <PremiumHub /> : <PremiumUpsell />;
}

function Phase({ days, title, children }: { days: string; title: string; children: React.ReactNode }) {
  return <div className="coach-phase"><span>{days}</span><b>{title}</b><p>{children}</p></div>;
}

function PremiumHub() {
  const { S, go } = useApp();
  return (
    <>
      <div className="hero">
        <HeroDoodle name="heart" />
        <div className="eyebrow">Premium · your 90 days</div>
        <h1>You are not doing this alone, {firstName(S)}.</h1>
        <p>You upgraded so you would have me in your corner, not just a platform. Here is exactly how the next 90 days work, and how to reach me.</p>
      </div>

      <div className="card">
        <span className="prem-badge">Premium member</span>
        <h3 className="sec" style={{ marginTop: 12 }}>Start here: book your kickoff call</h3>
        <p className="body">The first thing we do is get on a call and build your plan together. Bring your resume and the kind of role you want. I will bring everything I know about landing it.</p>
        {BOOK_LINK
          ? <a className="btn btn-t" href={BOOK_LINK} target="_blank" rel="noopener">Book my kickoff call →</a>
          : <button className="btn btn-t" onClick={() => go("contact")}>Message me to schedule →</button>}
      </div>

      <div className="card">
        <h3 className="sec">How our 90 days go</h3>
        <p className="sub">A real plan, with me at each stage.</p>
        <Phase days="DAYS 1 to 7" title="Kickoff and strategy">We meet, I learn your story, and we pick your target roles and your lane. You leave the call with a clear plan and your first week mapped.</Phase>
        <Phase days="DAYS 8 to 30" title="Your materials, reviewed by me">I go through your resume and LinkedIn line by line, the same way I read the ones that land on my desk. We get you findable and credible.</Phase>
        <Phase days="DAYS 31 to 60" title="Reps and introductions">Two live mock interviews with real feedback, we drill your stories until they are easy, and I make warm introductions wherever I can open a door.</Phase>
        <Phase days="DAYS 61 to 90" title="Close it out">We target, apply, and prep together, and when the offer comes we negotiate it as a team. I am in your messages the whole way.</Phase>
      </div>

      <div className="card">
        <h3 className="sec">Message me any time this cycle</h3>
        <p className="sub">Stuck on an email, a screen, a decision? That is what this is for.</p>
        <button className="btn btn-t" onClick={() => go("contact")}>Send me a message →</button>
        <div className="field" style={{ marginTop: 20 }}><label>What I most want out of these 90 days</label>
          <TA k="premGoal" ph="Write it down so we both stay pointed at the same target..." rows={3} label="What I most want out of these 90 days" /></div>
        <div className="field"><label>My private notes from our sessions</label>
          <TA k="premNotes" ph="Keep what we talk about here so nothing gets lost..." rows={5} label="My private notes from our sessions" /></div>
      </div>
      <div className="foot-nav"><button className="btn btn-g" onClick={() => go("dashboard")}>← Back to dashboard</button><button className="btn btn-t" onClick={() => go("contact")}>Contact →</button></div>
    </>
  );
}

const ckStyle = { color: "var(--mint-3)", fontWeight: 700 };

function PremiumUpsell() {
  const { go, toast } = useApp();
  return (
    <>
      <div className="hero">
        <HeroDoodle name="rocket" />
        <div className="eyebrow">Premium · optional</div>
        <h1>Want me in your corner for 90 days?</h1>
        <p>You have the whole platform, and plenty of people land jobs with just that. But if you want a real person walking it with you, that is what this is.</p>
      </div>

      <div className="card" style={{ border: "2px solid var(--mint)" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <h3 className="sec">Blueprint + 90 Days With Me</h3>
          <div style={{ fontFamily: "var(--dsp)", fontSize: 30, fontWeight: 700, color: "var(--navy)" }}>{priceLabel("premium")}</div>
        </div>
        <p className="body">Everything you already have, plus me personally until you land it.</p>
        <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 11, margin: "16px 0 22px" }}>
          <li style={{ display: "flex", gap: 10 }}><span style={ckStyle}>✓</span> A private kickoff call to build your plan</li>
          <li style={{ display: "flex", gap: 10 }}><span style={ckStyle}>✓</span> Your resume and LinkedIn reviewed by me, personally</li>
          <li style={{ display: "flex", gap: 10 }}><span style={ckStyle}>✓</span> Two live mock interviews with real feedback</li>
          <li style={{ display: "flex", gap: 10 }}><span style={ckStyle}>✓</span> Direct message access for the full 90 days</li>
          <li style={{ display: "flex", gap: 10 }}><span style={ckStyle}>✓</span> Warm introductions wherever I can make them</li>
        </ul>
        <button className="btn btn-t btn-full" onClick={() => buy("premium", toast)}>Upgrade and work with me →</button>
      </div>

      <div className="card">
        <Note kind="story" label="Why I keep it small"><p>I only take a handful of these at a time, because doing it right means real hours with each person. If the spots are open, they are open. When they are full, they are full. That is the honest version, and it is why this is not ten dollars.</p></Note>
      </div>
      <div className="foot-nav"><button className="btn btn-g" onClick={() => go("dashboard")}>← Back to dashboard</button><button className="btn btn-t" onClick={() => go("contact")}>Contact →</button></div>
    </>
  );
}

/* ───── CONTACT ───── */
const SUBJECTS = ["Resume feedback", "Interview advice", "Which path should I take", "Offer or negotiation question", "Something else"];

export function Contact() {
  const { S, toast } = useApp();
  const [name, setName] = useState(S.user!.name);
  const [email, setEmail] = useState(S.user!.email);
  const [subj, setSubj] = useState(SUBJECTS[0]);
  const [msg, setMsg] = useState("");
  const msgRef = useRef<HTMLTextAreaElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  const send = () => {
    const m = msg.trim(), e = email.trim();
    if (!m) { toast("Add a message first."); msgRef.current?.focus(); return; }
    if (!e || e.indexOf("@") < 0) { toast("Add a valid email so I can reply."); emailRef.current?.focus(); return; }
    // Phase 5 sends this through Resend and saves it to the messages table.
    window.location.href = "mailto:" + CONTACT.email + "?subject=" + encodeURIComponent("HR Blueprint · " + subj) +
      "&body=" + encodeURIComponent("From: " + name.trim() + " (" + e + ")\n\n" + m);
    toast("Opening your email app.");
  };

  return (
    <>
      <div className="hero">
        <div className="eyebrow">Always open</div>
        <h1>Let&apos;s talk.</h1>
        <p>Need resume feedback? Stuck on an interview? Just want a second opinion before you accept something? Reach out.</p>
      </div>

      <div className="card">
        <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ width: 104, height: 104, borderRadius: 24, background: "linear-gradient(140deg,var(--mint),var(--teal))", display: "grid", placeItems: "center", fontFamily: "var(--dsp)", fontWeight: 700, fontSize: 33, color: "var(--navy)", flex: "none" }}>DJ</div>
          <div style={{ flex: 1, minWidth: 230 }}>
            <h3 className="sec">Dominique Jenkins</h3>
            <p className="sub" style={{ marginBottom: 14 }}>Talent acquisition · 8 years across four industries</p>
            <p className="body" style={{ fontSize: 14.5 }}>I run a full recruiting desk today. Before that I built an organization&apos;s recruiting function from nothing and grew the team that ran it, and I started out placing administrative and professional talent at a staffing agency. Before all of it, I worked in a call center. Every step of that is why I know this pivot is doable.</p>
            <div style={{ display: "flex", gap: 9, flexWrap: "wrap", marginTop: 18 }}>
              <a className="btn btn-p btn-sm" href={CONTACT.linkedin} target="_blank" rel="noopener">LinkedIn</a>
              <a className="btn btn-t btn-sm" href={"mailto:" + CONTACT.email}>Email me</a>
              <a className="btn btn-g btn-sm" href={CONTACT.site} target="_blank" rel="noopener">hiredominique.com</a>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 className="sec">Send me a message</h3>
        <p className="sub">Resume feedback, interview advice, or just a question. I read these.</p>
        <div className="row2">
          <div className="field"><label htmlFor="mfName">Your name</label><input className="inp" id="mfName" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="field"><label htmlFor="mfEmail">Your email</label><input className="inp" id="mfEmail" type="email" ref={emailRef} value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        </div>
        <div className="field"><label htmlFor="mfSubj">Subject</label>
          <select className="inp" id="mfSubj" value={subj} onChange={(e) => setSubj(e.target.value)}>
            {SUBJECTS.map((s) => <option key={s}>{s}</option>)}
          </select></div>
        <div className="field"><label htmlFor="mfMsg">Message</label>
          <textarea className="inp" id="mfMsg" rows={5} ref={msgRef} placeholder="Tell me where you are stuck." value={msg} onChange={(e) => setMsg(e.target.value)} /></div>
        <button className="btn btn-p" onClick={send}>Send message</button>
        <p style={{ fontSize: 12, color: "var(--slate-2)", marginTop: 12, lineHeight: 1.5 }}>
          Set your Formspree ID at the top of this file and messages arrive in your inbox. Until then, this opens the visitor&apos;s email app with everything filled in.</p>
      </div>
    </>
  );
}

/* ───── BETA PREVIEW LOCK (new copy, approved option A) ───── */
export function BetaLock() {
  const { go } = useApp();
  const router = useRouter();
  return (
    <>
      <div className="hero">
        <HeroDoodle name="door" />
        <div className="eyebrow">Beta preview</div>
        <h1>This part opens when you join.</h1>
        <p>You are looking at the free preview. Act 1 is open so you can see how I teach and decide if this is for you. Everything from here on, the labs, the trackers, the games, the interview academy, unlocks with The Blueprint.</p>
      </div>
      <div className="card">
        <h3 className="sec">What is waiting past this point</h3>
        <p className="body">Sixteen more steps. The resume and cover letter labs with Word downloads, the LinkedIn builder, your dated 90 day search plan, the phone screen and interview academies, the negotiation scripts, and every tracker and game. It is {priceLabel("basic")}, one time, and it is yours for good.</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
          <button className="btn btn-t" onClick={() => router.push("/")}>See the two options →</button>
          <button className="btn btn-g" onClick={() => go("welcome")}>Back to Act 1</button>
        </div>
      </div>
    </>
  );
}
