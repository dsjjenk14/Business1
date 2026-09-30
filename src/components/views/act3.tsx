"use client";
import { useState } from "react";
import { useApp } from "../AppProvider";
import { AdSlot, Band, Bridge, Chk, ChkItem, FootNav, HeroDoodle, Mark, Note, Rec, Tpl } from "../ui";
import { Squiggle } from "../Doodle";
import { ADS } from "@/config/site";
import { ASTAGES, NSTAGES } from "@/lib/journey";
import { PLAN_WEEKS } from "@/lib/content";
import { txt } from "@/lib/state";

/* ───── STEP 11 · 90-DAY SEARCH PLAN ───── */
const fmtDate = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });

export function Plan() {
  const { S, setTxt, update, toast } = useApp();
  const planStart = txt(S, "planStart");
  const start = planStart ? new Date(planStart + "T00:00:00") : null;
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const togPlan = (k: string) => update((s) => {
    const chk = { ...s.chk, [k]: !s.chk[k] };
    let done = 0;
    PLAN_WEEKS.forEach((w, i) => w.tasks.forEach((_, j) => { if (chk["plan_w" + i + "_" + j]) done++; }));
    let badges = s.badges;
    if (done >= 4 && !s.badges.planner) {
      badges = { ...s.badges, planner: true };
      setTimeout(() => toast("Badge unlocked. Your plan is in motion."), 0);
    }
    return { ...s, chk, badges };
  });

  return (
    <>
      <div className="hero">
        <HeroDoodle name="clock" />
        <div className="eyebrow">Step 11 · The plan</div>
        <h1>A real plan, with real dates.</h1>
        <p>Everything up to now was preparation. The hunt starts here, and a hunt without a calendar is just hoping. So let us put dates on it.</p>
      </div>

      <Bridge why={<>Your resume, your letter, your LinkedIn, they are all built. Now comes the part that actually takes the months: the search itself. <strong>This is where most people drift.</strong> They apply in random bursts, lose track, and quit around week three telling themselves it is not working. A dated plan is the single thing that prevents that.</>}
        get="a week-by-week search calendar tied to your own start date, and a way to check off progress as you go." />

      <div className="card">
        <h3 className="sec">When do you start?</h3>
        <p className="sub">Pick the day you begin your search. I will build the next twelve weeks around it.</p>
        <div className="field" style={{ maxWidth: 260 }}><label htmlFor="planStart">My search starts</label>
          <input className="inp" type="date" id="planStart" value={planStart} onChange={(e) => setTxt("planStart", e.target.value)} /></div>
        <Rec><p>Twelve weeks is the honest timeline for a career change in this market. Some people land in four. Some take six months. If you are not hired by week twelve, the plan is not a failure, you just keep running the last weeks on repeat. The point is to keep moving on a schedule instead of by mood.</p></Rec>
      </div>

      <div>
        {PLAN_WEEKS.map((w, i) => {
          let range = "", isNow = false;
          if (start) {
            const s = new Date(start); s.setDate(s.getDate() + i * 7);
            const e = new Date(s); e.setDate(e.getDate() + 6);
            range = fmtDate(s) + " to " + fmtDate(e);
            isNow = today >= s && today <= e;
          }
          return (
            <div className={"pweek" + (isNow ? " now" : "")} key={w.t}>
              <div className="pwtop">
                <span className="pwk">Week {i + 1} · {w.t}{isNow ? <> <span className="pill" style={{ marginLeft: 6 }}>You are here</span></> : null}</span>
                <span className="pwd">{range || "set a date above"}</span>
              </div>
              <ul className="chk">
                {w.tasks.map((t, k) => {
                  const key = "plan_w" + i + "_" + k;
                  return <ChkItem key={key} on={!!S.chk[key]} onToggle={() => togPlan(key)}>{t}</ChkItem>;
                })}
              </ul>
            </div>
          );
        })}
      </div>

      <div className="card">
        <h3 className="sec">The one rule</h3>
        <Band icon="heart" color="#8EDBC2"><b>Do the week you are in, not the whole plan at once.</b> Four tasks a week is doable while you have a job and a life. Twelve weeks of it is a serious job search. Miss a week? You did not fail, you just start the next one. Momentum beats perfection.</Band>
      </div>
      <FootNav id="plan" />
    </>
  );
}

/* ───── STEP 12 · NETWORKING HUB ───── */
export function Network() {
  const { S, update, badges, toast } = useApp();
  const [name, setName] = useState("");
  const [co, setCo] = useState("");
  const add = () => {
    const n = name.trim();
    if (!n) { toast("Add a name first."); document.getElementById("cName")?.focus(); return; }
    update((s) => ({ ...s, contacts: [...s.contacts, { n, c: co.trim(), s: 0 }] }));
    setName(""); setCo(""); badges();
    toast("Added. Now go send the message.");
  };
  const bump = (i: number) => update((s) => ({ ...s, contacts: s.contacts.map((c, k) => k === i ? { ...c, s: (c.s + 1) % NSTAGES.length } : c) }));
  const del = (i: number) => update((s) => ({ ...s, contacts: s.contacts.filter((_, k) => k !== i) }));
  return (
    <>
      <div className="hero">
        <HeroDoodle name="people" />
        <div className="eyebrow">Step 12 · Networking Hub</div>
        <h1>Referrals come from relationships.</h1>
        <p>If your whole strategy is hitting easy apply all day, you will not get where you want to go. Most people know that and just do not want to do the harder version.</p>
      </div>

      <Bridge why={<>Now the part that actually gets jobs, and the part most people avoid because the word makes them cringe. Remember that list of five people you wrote down early on. <strong>This is where we use it.</strong></>}
        get="a tracked list of real people, scripts for every message, and five questions for any coffee chat." />

      <div className="card">
        <h3 className="sec">What networking actually is</h3>
        <p className="body">Networking is not cold asking strangers for jobs. It is building relationships and learning the landscape, and that distinction is the whole thing. When you show up as someone who wants to learn rather than someone who needs something right now, most people are glad to talk.</p>
        <p className="body">I reached out to people in HR before I had a single HR role on my resume. That was not bold, it was necessary. I wanted to know what their careers actually looked like day to day and what they wished they had known earlier.</p>
        <p className="body"><strong>Here is what it really looks like:</strong> a twenty minute phone call. A message that actually gets a reply. A coffee chat where you ask real questions and listen to the answers. That is it. Far less intimidating than the word makes it sound.</p>
        <Rec><p>The person two years ahead of you often gives better advice than the VP, and they are ten times more likely to reply. Do not only reach out to the most senior name you can find.</p></Rec>
        <Note kind="story" label="My story · the part people skip">
          <p>My whole career exists because I networked <em>inside</em> the building I was already in. I was a coordinator. I talked to the HR team, met the recruiters, and found the job I actually wanted by being curious with people who were twenty feet away from me.</p>
          <p>You do not have to start with strangers on LinkedIn. Start with the people you already have access to. The receptionist knows things. So does the person who has been there eleven years.</p>
        </Note>
      </div>

      <div className="card">
        <h3 className="sec">Your networking tracker</h3>
        <p className="sub">Track every person. Move them along as you go. Five people is your first target.</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
          <input className="inp" id="cName" placeholder="Name" aria-label="Name" style={{ flex: 1, minWidth: 130 }} value={name} onChange={(e) => setName(e.target.value)} />
          <input className="inp" placeholder="Company or role" aria-label="Company or role" style={{ flex: 1, minWidth: 130 }} value={co} onChange={(e) => setCo(e.target.value)} />
          <button className="btn btn-t" onClick={add}>Add person</button>
        </div>
        <div>
          {!S.contacts.length ? (
            <div className="empty"><div className="ei">🤝</div><b>No one tracked yet</b><p>Add the first person you plan to reach out to. Even one name beats an empty list.</p></div>
          ) : S.contacts.map((c, i) => (
            <div className="trk" key={i}>
              <div className="trk-main"><b>{c.n}</b><span>{c.c || ""}</span></div>
              <button className={"pill " + (c.s >= 3 ? "mint" : "navy")} onClick={() => bump(i)}>{NSTAGES[c.s]} →</button>
              <button className="del" onClick={() => del(i)} aria-label="Remove">✕</button>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h3 className="sec">Where to actually meet people</h3>
        <p className="body">LinkedIn matters, but the harder version of this work looks like joining a professional organization in your field, joining a club, sitting on a board, or volunteering somewhere that puts you in a room with people who work at the companies you want.</p>
        <Chk k="netwhere" items={[
          "Join SHRM, or your local SHRM chapter. Student and associate rates exist",
          "Find one HR or recruiting meetup or virtual event this month",
          "Follow 10 recruiters at companies you want and comment on their posts with something real",
          "Ask every person you talk to: is there anyone else you would suggest I speak with",
          "Reconnect with three people you already know who work somewhere interesting",
        ]} />
      </div>

      <div className="card">
        <h3 className="sec">Your message templates</h3>
        <Tpl label="First outreach" text={"Hi [Name], I came across your profile while researching HR professionals in [city], and I would love to learn how you got into the field. I am working toward a move into HR and recruiting myself, and I would really appreciate even 15 minutes if you are open to it.\n\nNo pressure either way. Thank you for considering it.\n[Your Name]"} />
        <Tpl label="After a coffee chat" text={"Hi [Name],\n\nThank you for taking the time to talk with me. What you said about [specific thing they said] was genuinely helpful, and I am going to [specific action] because of it.\n\nI appreciate you sharing your experience. I will keep you posted on how things go.\n[Your Name]"} />
        <Tpl label="Asking for a referral" text={"Hi [Name], I saw that [Company] posted a [role] opening. Based on our conversation about [specific thing], I think I would be a strong fit, and I have applied through the site.\n\nWould you be comfortable referring me internally? Totally understand if not. Either way I appreciate your time.\n[Your Name]"} />
      </div>

      <div className="card">
        <h3 className="sec">Five questions for every coffee chat</h3>
        <Chk k="coffee" items={[
          "How did you get started in HR?",
          "What skills helped you most in your first year?",
          "What would you tell someone to learn before entering recruiting?",
          "Which certifications or experiences actually helped you?",
          "Is there anyone else you would suggest I talk to?",
        ]} />
        <Rec><p>Always ask that last one. One warm introduction opens your next five conversations, and people are far more willing to make an introduction than to hand you a job. Ask for the thing they can actually give you.</p></Rec>
      </div>
      <FootNav id="network" />
    </>
  );
}

/* ───── STEP 13 · APPLICATION STRATEGY ───── */
function Where({ pill, children }: { pill: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--fog)", padding: 20, borderRadius: 14 }}>
      <div className="pill">{pill}</div>
      <p className="body" style={{ marginTop: 11, fontSize: 14.5 }}>{children}</p>
    </div>
  );
}

export function Apply() {
  const { S, update, badges, toast } = useApp();
  const [co, setCo] = useState("");
  const [role, setRole] = useState("");
  const add = () => {
    const c = co.trim(), r = role.trim();
    if (!c || !r) { toast("Add both the company and the role."); return; }
    const d = new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" });
    update((s) => ({ ...s, apps: [{ c, r, s: 0, d }, ...s.apps] }));
    setCo(""); setRole(""); badges();
    toast("Logged. Now go find the recruiter on LinkedIn.");
  };
  const bump = (i: number) => update((s) => ({ ...s, apps: s.apps.map((a, k) => k === i ? { ...a, s: (a.s + 1) % ASTAGES.length } : a) }));
  const del = (i: number) => update((s) => ({ ...s, apps: s.apps.filter((_, k) => k !== i) }));
  return (
    <>
      <div className="hero">
        <div className="eyebrow">Step 13 · Application strategy</div>
        <h1>Run your search like a recruiter would.</h1>
        <p>You are trying to get into a field whose entire job is hiring. So run your own search the way a good recruiter runs a search.</p>
      </div>

      <Bridge why={<>You have people in your corner now. So where do the actual openings live? <strong>Job boards are the most visible option and the least effective one,</strong> which is exactly why everybody lives on them. Here is the full picture, including the doors that never get posted.</>}
        get="four real sources for openings, a working application method, and a tracker for what you have sent." />

      <div className="card">
        <h3 className="sec">Where to look</h3>
        <p className="sub">Start with boards. Do not stop there. The best roles are often filled before they are ever posted.</p>
        <div className="grid2">
          <Where pill="Boards">LinkedIn Jobs, Indeed, Glassdoor, SHRM HR Jobs, iHire HR, Built In for tech companies.</Where>
          <Where pill="Company career pages">Apply direct and the recruiter often sees you sooner with less noise. Shortlist 15 to 20 target companies and set alerts on each.</Where>
          <Where pill="Staffing agencies">Robert Half, Beacon Hill, Aerotek, Randstad, Insight Global, Kforce. They place you into HR roles and they hire recruiters themselves.</Where>
          <Where pill="The hidden market">Referrals, recruiters, and everyone from your coffee chats. Most roles get filled through people, not portals.</Where>
        </div>
      </div>

      <div className="card">
        <Mark icon="hand" label="My story · the second door" />
        <h3 className="sec">I got into corporate recruiting through a staffing agency</h3>
        <Squiggle />
        <p className="body">Once I had learned what I could at the agency, I wanted to move to the corporate side. So how did I get that job? <strong>Through a staffing agency.</strong> A recruiter had the relationship, put me in front of the hiring manager, and advocated for me in a way a form submission never could have.</p>
        <p className="body">That is the second time in this story that a person opened the door instead of a portal. It is not a coincidence, and it is not because I am special. It is because that is how a large share of hiring actually works, and most job seekers never use it.</p>
        <Band icon="hand"><b>A good agency recruiter has a direct line to the hiring manager.</b> That is the entire value of the relationship, and it costs you nothing. Get on their radar before you need them.</Band>
      </div>

      <div className="card">
        <h3 className="sec">How to apply</h3>
        <Chk k="applyhow" items={[
          "Tailor the resume to the posting and mirror its exact language",
          "Get my must haves into the top third of the page",
          "Apply within 48 hours of the posting going live. Recruiters review the first applicants first",
          "Write the cover letter. Three or four paragraphs, specific to this company",
          "Find the recruiter on LinkedIn and send a short note that I applied and why I fit",
          "Ask for a referral if I know anyone there. A referral beats a cold application every time",
          "Log it in the tracker below so I know what I have actually done",
        ]} />
        <Note kind="mistake" label="Common mistakes"><p>Applying to 40 roles in one night feels productive and it is the least effective thing you can do. A handful of tailored applications plus one warm referral will beat fifty rushed ones every time. Track your ratios, protect your energy, and put your best effort where a human is actually going to see it.</p></Note>
      </div>

      <div className="card">
        <h3 className="sec">Your application tracker</h3>
        <p className="sub">Tap a stage to move it forward. Five logged unlocks a badge.</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
          <input className="inp" placeholder="Company" aria-label="Company" style={{ flex: 1, minWidth: 130 }} value={co} onChange={(e) => setCo(e.target.value)} />
          <input className="inp" placeholder="Role" aria-label="Role" style={{ flex: 1, minWidth: 130 }} value={role} onChange={(e) => setRole(e.target.value)} />
          <button className="btn btn-t" onClick={add}>Log it</button>
        </div>
        <div>
          {!S.apps.length ? (
            <div className="empty"><div className="ei">🎯</div><b>Nothing logged yet</b><p>Log your applications here so you can see your real conversion rate instead of guessing.</p></div>
          ) : S.apps.map((a, i) => {
            const cls = a.s === 2 ? "mint" : a.s === 3 ? "coral" : "navy";
            return (
              <div className="trk" key={i}>
                <div className="trk-main"><b>{a.r}</b><span>{a.c} · {a.d}</span></div>
                <button className={"pill " + cls} onClick={() => bump(i)}>{ASTAGES[a.s]} →</button>
                <button className="del" onClick={() => del(i)} aria-label="Remove">✕</button>
              </div>
            );
          })}
        </div>
      </div>
      <AdSlot cfg={ADS[2]} slot={2} />
      <FootNav id="apply" />
    </>
  );
}
