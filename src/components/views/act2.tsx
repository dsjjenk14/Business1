"use client";
import { useState } from "react";
import { useApp } from "../AppProvider";
import { Acc, Band, Bridge, Chk, FootNav, HeroDoodle, Inp, Mark, Note, Rec, TA, Tpl, copyText, downloadDoc, esc } from "../ui";
import { Squiggle } from "../Doodle";
import { BulletGame } from "../games";
import { Rung } from "./act1";
import { initials, jobCount, txt, type AppState } from "@/lib/state";

const ladder = { listStyle: "none", display: "flex", flexDirection: "column", gap: 11 } as const;

/* ───── STEP 6 · HOW RECRUITERS THINK ───── */
const DECODE: [string, string][] = [
  ["We are moving forward with other candidates whose experience more closely aligns.", "Usually it means someone had direct experience and you did not, or you were screened out on a must have. It rarely means you did badly in the interview. Ask for feedback anyway. About one in five will give you something real."],
  ["We will keep your resume on file.", "In most cases nothing happens with this. If you want to stay in the running, connect with the recruiter on LinkedIn and check back in six to eight weeks about new openings. That works far better than waiting."],
  ["This role is fast paced.", "Expect a heavy workload and probably some understaffing. Ask directly: what does a typical week look like, and what happened to the last person in this seat?"],
  ["We are like a family here.", "Ask about turnover and about boundaries. Sometimes it is genuinely warm. Sometimes it means unpaid extra hours are expected and questioning that reads as disloyal."],
  ["What are your salary expectations?", "They are trying to find out if you are affordable before they invest more time. Give a researched range, not a single number, and make it the range you would actually accept."],
  ["We have a few more candidates to see.", "Standard and not a bad sign. Ask when they expect to make a decision and whether it is okay to follow up after that date. Then actually follow up."],
];

export function Psych() {
  return (
    <>
      <div className="hero">
        <div className="eyebrow">Step 6 · Recruiter psychology</div>
        <h1>What we are actually thinking.</h1>
        <p>I am going to tell you what happens on my side of the screen, because once you know it, most of the process stops feeling random.</p>
      </div>

      <Bridge why={<>You have decided this is the path. Before you build a single thing, you need to see it from my side of the desk. <strong>Everything you are about to write, your resume, your LinkedIn, your answers, gets read by someone like me first.</strong> So let me show you how we actually think, because once you get that, every choice in the next few steps makes sense.</>}
        get="a decoder for what recruiters say versus mean, and a realistic read on the market you are in." />

      <div className="card">
        <h3 className="sec">How your resume actually gets read</h3>
        <p className="body"><strong>Ten seconds on the first pass.</strong> That is genuinely all the time a lot of us spend. In those ten seconds I am checking three things: can I find your most recent title fast, do your bullets have numbers, and do your dates make sense.</p>
        <p className="body">If I have to work to figure out what you did, I move on. It is not personal. I have 200 applications and a role that was supposed to be filled last week.</p>
        <p className="body">The other thing worth knowing: <strong>most applications get filtered by software before I ever see them.</strong> That is why the keywords from the posting need to actually appear in your resume, and why tables and graphics are a genuine problem. When a parser hits a table, your information comes out scrambled.</p>
        <Note kind="decode" label="What hiring managers really mean"><p>When a hiring manager says they want someone who can &quot;hit the ground running,&quot; they are telling you they do not have time to train. Your job in the interview is to make them believe you will not need much hand holding. Say it directly: &quot;I would come in and help the team without needing a lot of hand holding.&quot;</p></Note>
      </div>

      <div className="card">
        <h3 className="sec">The decoder</h3>
        <p className="sub">Six things you will hear, and what they usually mean.</p>
        {DECODE.map((d) => (
          <Acc key={d[0]} q={<><span className="pill navy" style={{ marginRight: 9 }}>They say</span>{d[0]}</>}>
            <div className="qa strong"><div className="qlab">What it usually means</div><p>{d[1]}</p></div>
          </Acc>
        ))}
      </div>

      <div className="card">
        <h3 className="sec">The market you are actually applying into</h3>
        <p className="body">Some context, because a lot of people are running a job search like it is 2021 and it is not. Job growth has slowed, layoffs have been working through the system, and companies are trimming headcount while they pour money into other priorities. That means fewer open seats and more competition for each one.</p>
        <p className="body">I am not telling you this to discourage you. I am telling you because <strong>the strategy that worked in a hot market does not work now,</strong> and if nobody tells you that, you will assume the problem is you.</p>
        <Note kind="myth" label="Myth versus reality">
          <p><strong>Myth:</strong> apply to everything, qualified or not. Confidence is what matters.</p>
          <p><strong>Reality:</strong> that is a recipe for burnout. Every application costs energy. If you spray resumes at roles you are not remotely a fit for, you spend that energy collecting rejection instead of on the moves that actually work: customizing for roles you genuinely fit, networking with the recruiter tied to that role, and following up after you apply.</p>
        </Note>
      </div>

      <div className="card">
        <h3 className="sec">Use staffing firms. Seriously.</h3>
        <p className="body">A good agency recruiter has a direct line to the hiring manager and can advocate for you in a way a form submission never will. That is the entire value of the relationship, and it costs you nothing. Get on their radar early and stay in touch.</p>
        <Chk k="agencies" items={[
          "Create a profile with 2 or 3 staffing agencies that place HR and administrative roles",
          "Ask the recruiter directly what they are seeing in the market for someone with my background",
          "Tell them my target role and my real salary range, not a vague answer",
          "Follow up every few weeks so I stay top of mind when something opens",
        ]} />
      </div>
      <FootNav id="psych" />
    </>
  );
}

/* ───── STEP 7 · TRANSFERABLE SKILLS ───── */
const TRANS: [string, string][] = [
  ["Handled customer complaints", "Managed sensitive conversations with a focus on resolution, de-escalating roughly 40 issues per week"],
  ["Answered phones", "Served as first point of contact for 80+ inbound contacts daily, routing and resolving without escalation"],
  ["Scheduled shifts for staff", "Coordinated scheduling for a team of 18 across three locations, maintaining full coverage with zero missed shifts"],
  ["Trained new employees", "Onboarded and trained 12 new hires, building the training checklist the team still uses"],
  ["Kept records", "Maintained records for 200+ accounts with a 99% accuracy rate under weekly audit"],
  ["Worked the front desk", "Managed front of house operations and served as first impression for 100+ daily visitors"],
];

export function Skills() {
  return (
    <>
      <div className="hero">
        <HeroDoodle name="scan" />
        <div className="eyebrow">Step 7 · Translation</div>
        <h1>You already have the skills. You need the words.</h1>
        <p>The gap between where you are and where you need to be is smaller than the story you have been telling yourself.</p>
      </div>

      <Bridge why={<>Now you know what a recruiter is looking for. So here is the question that stops most people cold: <strong>do I even qualify?</strong> You read HR postings and see a language you do not speak. Here is the thing. You probably have most of what they want. You just describe it in the wrong words, and that is a translation problem, not a qualification problem.</>}
        get="an honest audit of your real skills and one experience of yours rewritten in HR language." />

      <div className="card">
        <h3 className="sec">Audit what you already have</h3>
        <p className="sub">Check everything that is true of your current or most recent job.</p>
        <Chk k="skill" items={[
          "I communicate professionally with a wide range of people and personalities",
          "I handle a high volume of interactions without dropping the ball",
          "I work toward performance metrics and get held accountable to results",
          "I solve problems quickly with limited information and limited time",
          "I juggle several priorities at once without losing track of any of them",
          "I stay steady in difficult, uncomfortable, or sensitive conversations",
          "I keep organized records, track details, and follow through",
          "I have trained, onboarded, or coached someone new",
        ]} />
        <Note kind="win" label="Quick win"><p>Whatever you left unchecked is your real gap. Not &quot;no HR degree.&quot; Not &quot;no corporate experience.&quot; Just those specific skills. That is a much shorter list to close, and every one of them can be built in your current job starting this week.</p></Note>
      </div>

      <div className="card">
        <h3 className="sec">The translation formula</h3>
        <p className="sub">This single move changes how your resume reads.</p>
        <div style={{ background: "var(--navy)", color: "#fff", padding: 26, borderRadius: 16, margin: "16px 0", textAlign: "center" }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 11, letterSpacing: ".18em", color: "var(--mint)", marginBottom: 14 }}>THE FORMULA</div>
          <div style={{ fontFamily: "var(--dsp)", fontSize: "clamp(15px,2.2vw,21px)", lineHeight: 1.6 }}>
            Strong verb + what you did + <span style={{ color: "var(--mint)" }}>the number</span> + what changed</div>
        </div>
        <p className="body">Every weak bullet on a resume is missing at least two of those four pieces. Usually it is the number and the result. Here is what the swap looks like in practice.</p>
        {TRANS.map((t) => (
          <div className="ba" key={t[0]}>
            <div className="before"><div className="lab">What people write</div><p>{t[0]}</p></div>
            <div className="after"><div className="lab">What gets read</div><p>{t[1]}</p></div>
          </div>
        ))}
        <Rec><p>I spend about ten seconds on a resume on the first pass. Ten. In that time I am looking for numbers and I am looking for whether your most recent title is easy to find. If I have to work to figure out what you actually did, I move to the next one. That is not me being harsh, that is me having 200 applications and a requisition due Friday.</p></Rec>
      </div>

      <div className="card">
        <h3 className="sec">Now do yours</h3>
        <p className="sub">Take one thing you do at work and run it through the formula.</p>
        <Note kind="action" label="Homework">
          <p style={{ marginBottom: 12 }}>Write the weak version first, then rewrite it. Getting it wrong on purpose first makes the rewrite easier.</p>
          <TA k="skillNote" ph={"Weak version:\n\nStrong version:"} rows={6} label="Your skill translation" />
        </Note>
      </div>
      <FootNav id="skills" />
    </>
  );
}

/* ───── STEP 8 · RESUME LAB ───── */
function resumeParts(S: AppState) {
  const g = (k: string, d?: string) => (txt(S, k) || d || "").trim();
  const contact = [g("rCity"), g("rPhone"), g("rEmail"), g("rLink")].filter(Boolean).join("  ·  ");
  const jobs: { head: string; bullets: string[] }[] = [];
  for (let i = 1; i <= jobCount(S); i++) {
    const head = [g("j" + i + "_title"), g("j" + i + "_co"), g("j" + i + "_d")].filter(Boolean).join("  |  ");
    const bl = ["b1", "b2", "b3"].map((b) => g("j" + i + "_" + b)).filter(Boolean);
    if (head || bl.length) jobs.push({ head, bullets: bl });
  }
  return { name: g("rName", S.user!.name).toUpperCase(), contact, summary: g("rSummary"), jobs, skills: g("rSkills"), edu: g("rEdu"), cert: g("rCert") };
}

function resumeText(S: AppState): string {
  const r = resumeParts(S), L: string[] = [];
  L.push(r.name); if (r.contact) L.push(r.contact); L.push("");
  if (r.summary) { L.push("SUMMARY"); L.push(r.summary); L.push(""); }
  if (r.jobs.length) {
    L.push("EXPERIENCE");
    r.jobs.forEach((j, i) => {
      if (j.head) L.push(j.head);
      j.bullets.forEach((b) => L.push("- " + b));
      if (i < r.jobs.length - 1) L.push("");
    });
    L.push("");
  }
  if (r.skills) { L.push("SKILLS"); L.push(r.skills); L.push(""); }
  if (r.edu || r.cert) { L.push("EDUCATION"); if (r.edu) L.push(r.edu); if (r.cert) L.push(r.cert); }
  return L.join("\n");
}

function resumeHtml(S: AppState): string {
  const r = resumeParts(S);
  const s = "font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#000;";
  const h = (t: string) => '<p style="font-weight:bold;margin:14pt 0 3pt;border-bottom:1px solid #000">' + t + "</p>";
  return '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" ' +
    'xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>Resume</title></head>' +
    '<body style="' + s + '">' +
    '<p style="font-size:18pt;font-weight:bold;margin:0 0 4pt">' + esc(r.name) + "</p>" +
    (r.contact ? '<p style="margin:0 0 12pt;font-size:10pt">' + esc(r.contact) + "</p>" : "") +
    (r.summary ? '<p style="font-weight:bold;margin:12pt 0 3pt;border-bottom:1px solid #000">SUMMARY</p><p style="margin:0">' + esc(r.summary) + "</p>" : "") +
    (r.jobs.length ? h("EXPERIENCE") + r.jobs.map((j) =>
      (j.head ? '<p style="margin:8pt 0 4pt;font-weight:bold">' + esc(j.head) + "</p>" : "") +
      (j.bullets.length ? '<ul style="margin:0 0 0 18pt;padding:0">' + j.bullets.map((b) => '<li style="margin-bottom:4pt">' + esc(b) + "</li>").join("") + "</ul>" : ""),
    ).join("") : "") +
    (r.skills ? h("SKILLS") + '<p style="margin:0">' + esc(r.skills) + "</p>" : "") +
    ((r.edu || r.cert) ? h("EDUCATION") + (r.edu ? '<p style="margin:0">' + esc(r.edu) + "</p>" : "") + (r.cert ? '<p style="margin:0">' + esc(r.cert) + "</p>" : "") : "") +
    "</body></html>";
}

function Jobs() {
  const { S, update, toast } = useApp();
  const n = jobCount(S);
  const addJob = () => {
    if (n >= 6) { toast("Six jobs is plenty. Older roles can be one line each."); return; }
    update((s) => ({ ...s, txt: { ...s.txt, jobN: n + 1 } }));
    toast("Job added. Oldest roles need fewer bullets than recent ones.");
  };
  const removeJob = (i: number) => update((s) => {
    const t = { ...s.txt };
    const F = ["title", "co", "d", "b1", "b2", "b3"];
    for (let k = i; k < n; k++) F.forEach((f) => { t["j" + k + "_" + f] = t["j" + (k + 1) + "_" + f] || ""; });
    F.forEach((f) => { delete t["j" + n + "_" + f]; });
    t.jobN = n - 1;
    return { ...s, txt: t };
  });
  return (
    <>
      {Array.from({ length: n }, (_, idx) => idx + 1).map((i) => (
        <div className="jobcard" key={i}>
          <div className="jobhd"><span className="jn">Job {i}</span>
            {i > 1 ? <button className="del" onClick={() => removeJob(i)} aria-label="Remove job">✕</button> : <span className="pill">Most recent</span>}</div>
          <div className="row2">
            <div className="field"><label>Job title</label><Inp k={"j" + i + "_title"} ph="Shift Supervisor" label={"Job " + i + " title"} /></div>
            <div className="field"><label>Company</label><Inp k={"j" + i + "_co"} ph="Company name" label={"Job " + i + " company"} /></div>
          </div>
          <div className="field"><label>Dates (exact months, always)</label><Inp k={"j" + i + "_d"} ph="March 2021 to June 2024" label={"Job " + i + " dates"} /></div>
          {[1, 2, 3].map((b) => (
            <div className="field" key={b}><label>Bullet {b}</label>
              <TA k={"j" + i + "_b" + b} ph="Verb + what you did + the number + what changed" rows={2} label={"Job " + i + " bullet " + b} /></div>
          ))}
        </div>
      ))}
      <button className="btn btn-g btn-sm" style={{ margin: "2px 0 20px" }} onClick={addJob}>+ Add another job</button>
    </>
  );
}

export function Resume() {
  const { S, toast } = useApp();
  const download = () => {
    const r = resumeParts(S);
    if (!r.jobs.some((j) => j.bullets.length) && !r.summary) { toast("Write at least one bullet or your summary first."); return; }
    if (downloadDoc(resumeHtml(S), (r.name || "Resume").replace(/[^\w]+/g, "_") + "_Resume.doc")) toast("Downloaded. Open it in Word or Google Docs to edit.");
    else toast("Download blocked here. Use copy as plain text instead.");
  };
  const copy = () => copyText(resumeText(S)).then(() => toast("Resume copied. Paste it anywhere."), () => toast("Copy failed. Select the text manually."));
  return (
    <>
      <div className="hero">
        <div className="eyebrow">Step 8 · Resume Lab</div>
        <h1>Build bullets that survive a ten second scan.</h1>
        <p>Treat this like a grad school application to a program you would have to fight your way into. No errors. None.</p>
      </div>

      <Bridge why={<>You have the raw material. Now it goes on paper, and this is where most people lose without ever finding out why. <strong>Resume advice is a mess.</strong> One page or two, do ATS systems really reject you, should you use a template. Everybody contradicts everybody. So I am going to skip the debate and show you what actually happens when a recruiter opens your file.</>}
        get="three strong bullets, a full resume you can download, and the instincts to judge your own writing." />

      <div className="card">
        <Mark icon="scan" label="Play first, then build" />
        <h3 className="sec">You be the recruiter</h3>
        <Squiggle />
        <p className="body">Before you write a single bullet, I want you to sit on my side of the desk for two minutes. Eight rounds. Two candidates each time. <strong>Pick the one you would call.</strong></p>
        <BulletGame />
      </div>

      <div className="card">
        <h3 className="sec">Real before and after, with my notes</h3>
        <p className="sub">These are from roles I have actually recruited for.</p>
        <div className="ba">
          <div className="before"><div className="lab">Before</div><p>Responsible for calendar management and filing.</p></div>
          <div className="after"><div className="lab">After</div>
            <p>Managed calendars and scheduling for a team of 12 executives across three departments, maintained 100% accuracy on filing deadlines across 40+ active files, and reduced document turnaround time by 30% by rebuilding the intake process.</p>
            <div className="ann">My note: twelve executives. Three departments. Forty plus files. Thirty percent. Four numbers in one bullet, and now I know the scale you operated at without having to ask.</div></div>
        </div>
        <div className="ba">
          <div className="before"><div className="lab">Before</div><p>Helped with hiring and onboarding.</p></div>
          <div className="after"><div className="lab">After</div>
            <p>Coordinated interview scheduling for 15 to 20 open roles per month, onboarded 30 new hires across two locations, and cut new hire paperwork errors by half by rebuilding the intake checklist.</p>
            <div className="ann">My note: &quot;helped with&quot; tells me you were near the work. The rewrite tells me you owned a piece of it. Own your piece.</div></div>
        </div>
        <div className="ba">
          <div className="before"><div className="lab">Before</div><p>Customer service representative duties.</p></div>
          <div className="after"><div className="lab">After</div>
            <p>Resolved 80+ customer issues daily in a metrics driven environment, held a 95% satisfaction score for six consecutive quarters, and trained four new representatives on the escalation process.</p>
            <div className="ann">My note: this is a call center job and it reads like a professional. Same work, same person. Different words.</div></div>
        </div>
      </div>

      <div className="card">
        <h3 className="sec">Write your three strongest bullets</h3>
        <p className="sub">Three is enough. These become the top of your resume and the backbone of every interview answer.</p>
        <div className="field"><label>Bullet 1 · your biggest number</label><TA k="rb1" ph="Verb + what you did + the number + what changed" rows={3} label="Bullet 1" /></div>
        <div className="field"><label>Bullet 2 · something you improved or fixed</label><TA k="rb2" ph="Verb + what you did + the number + what changed" rows={3} label="Bullet 2" /></div>
        <div className="field"><label>Bullet 3 · people, training, or coordination</label><TA k="rb3" ph="Verb + what you did + the number + what changed" rows={3} label="Bullet 3" /></div>
        <Note kind="mistake" label="Common mistakes">
          <p>Dates as years only. &quot;2021 to 2023&quot; tells me nothing and it actually raises a flag, because I start wondering if you are hiding a gap. Write &quot;March 2021 to June 2023.&quot; It says you have nothing to hide and you are organized enough to track it.</p>
          <p>Also: no tables, no color blocks, no three different fonts. Tables scramble when an applicant tracking system parses them and your information comes out in the wrong order.</p>
        </Note>
      </div>

      <div className="card">
        <h3 className="sec">The pre send checklist</h3>
        <p className="sub">Do not send anything until every one of these is checked.</p>
        <Chk k="resume" items={[
          "Zero typos. I mean zero. A typo is often an automatic no before a human sees it",
          "Exact months and years on every role, not just years",
          "My most recent job title is findable in under three seconds",
          "Every bullet in my top section has a number in it",
          "Keywords from the actual job posting appear in my resume",
          "No tables, no columns, no graphics that an ATS will scramble",
          "One page if I have under ten years of experience",
          "Saved as a PDF unless the posting specifically asks for Word",
        ]} />
      </div>

      <div className="card">
        <h3 className="sec">Build the whole thing, then download it</h3>
        <p className="sub">Fill this in and it becomes a real Word document you can edit and send.</p>
        <div className="row2">
          <div className="field"><label>Full name</label><Inp k="rName" ph="Your name" label="Full name" /></div>
          <div className="field"><label>City, State</label><Inp k="rCity" ph="Atlanta, GA" label="City, State" /></div>
        </div>
        <div className="row2">
          <div className="field"><label>Phone</label><Inp k="rPhone" ph="(555) 555-5555" label="Phone" /></div>
          <div className="field"><label>Email</label><Inp k="rEmail" ph="you@email.com" label="Email" /></div>
        </div>
        <div className="field"><label>LinkedIn URL</label><Inp k="rLink" ph="linkedin.com/in/yourname" label="LinkedIn URL" /></div>
        <div className="field"><label>Summary</label><TA k="rSummary" ph="Hospitality professional with 6 years of experience moving into HR. Background in high volume people management and scheduling. Known for keeping a team steady under pressure." rows={3} label="Summary" /></div>
        <Jobs />
        <div className="field"><label>Skills (separate with a comma)</label><Inp k="rSkills" ph="Candidate Coordination, Onboarding Support, ATS Navigation, Scheduling, Records Management" label="Skills" /></div>
        <div className="field"><label>Education</label><Inp k="rEdu" ph="Degree | Institution | Year" label="Education" /></div>
        <div className="field"><label>Certifications, if any</label><Inp k="rCert" ph="aPHR (in progress)" label="Certifications" /></div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
          <button className="btn btn-t" onClick={download}>Download as Word doc</button>
          <button className="btn btn-g" onClick={copy}>Copy as plain text</button>
        </div>
        <Rec><p>The download is deliberately plain. No tables, no columns, no graphics. That is not me being lazy with the design, that is what survives an applicant tracking system intact. Pretty resumes get scrambled into nonsense by the parser and you never find out why you did not hear back.</p></Rec>
      </div>

      <div className="card">
        <h3 className="sec">Or start from the skeleton</h3>
        <p className="sub">Prefer to build it yourself? Copy this structure.</p>
        <Tpl label="Resume structure" text={"YOUR NAME\nCity, State · Phone · Email · LinkedIn URL\n\nSUMMARY\n[Field] professional with [X] years moving into HR and recruiting. Background in [high volume communication / coordination / records]. Known for [the specific thing you are actually known for].\n\nEXPERIENCE\nJob Title | Company | Month Year to Month Year\n- Your bullet 1, with the number\n- Your bullet 2, with the number\n- Your bullet 3, with the number\n\nSKILLS\nCandidate Coordination · Onboarding Support · ATS Navigation\nRecords Management · Scheduling · Cross-functional Collaboration\n\nEDUCATION\nDegree | Institution | Year\nCertifications in progress: aPHR, SHRM-CP"} />
        <Rec><p>Write the cover letter. I know everyone says they are dead. They are not, and in a market this crowded it is one of the only places left where you get to sound like a person instead of getting sorted by a keyword scanner. Three or four paragraphs. Why this role, why this company, and one specific thing from your background that maps to what they need.</p></Rec>
      </div>
      <FootNav id="resume" />
    </>
  );
}

/* ───── STEP 9 · COVER LETTER LAB ───── */
function letterText(S: AppState): string {
  const g = (k: string) => txt(S, k).trim();
  const name = g("cl_name"), co = g("cl_co") || "[Company]", role = g("cl_role") || "[Role]";
  const L: string[] = [];
  L.push("Dear " + (name || "Hiring Team") + ",");
  L.push("");
  L.push((g("cl_hook") || "[Your hook]") + " I am applying for the " + role + " position at " + co + ".");
  L.push("");
  L.push(g("cl_proof") || "[Your proof paragraph]");
  L.push("");
  if (g("cl_why")) { L.push(g("cl_why")); L.push(""); }
  L.push(g("cl_pivot") || "[Your pivot paragraph]");
  L.push("");
  L.push("I would welcome the chance to talk about the " + role + " role and what I could bring to your team. Thank you for your time and consideration.");
  L.push("");
  L.push(g("rName") || S.user!.name);
  return L.join("\n");
}

export function Cover() {
  const { S, toast } = useApp();
  const [letter, setLetter] = useState<string | null>(null);
  const build = () => { setLetter(letterText(S)); toast("Letter assembled. Read it out loud before you send it."); };
  const download = () => {
    const t = letterText(S), co = (txt(S, "cl_co") || "Cover").replace(/[^\w]+/g, "_");
    const html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" ' +
      'xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>Cover Letter</title></head>' +
      '<body style="font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.5">' +
      t.split("\n").map((l) => l.trim() ? '<p style="margin:0 0 10pt">' + esc(l) + "</p>" : '<p style="margin:0 0 10pt">&nbsp;</p>').join("") +
      "</body></html>";
    if (downloadDoc(html, co + "_CoverLetter.doc")) toast("Downloaded. Open it in Word or Google Docs.");
    else toast("Download blocked here. Use the copy button instead.");
  };
  return (
    <>
      <div className="hero">
        <HeroDoodle name="note" />
        <div className="eyebrow">Step 9 · Cover Letter Lab</div>
        <h1>The last place you get to sound like a person.</h1>
        <p>Everyone tells you cover letters are dead. They are not, and in a market this crowded it is one of the only places left where you are not being sorted by a keyword scanner.</p>
      </div>

      <Bridge why={<>Your resume proves you can do the work. It cannot explain why you are switching careers, and that is the exact question every hiring manager will have about you. <strong>The cover letter is where a career changer wins or loses.</strong> It is the only document where you get to control the story instead of hoping they connect the dots.</>}
        get="a reusable letter, three openings that work, and the paragraph that explains your pivot." />

      <div className="card">
        <h3 className="sec">What a cover letter is not</h3>
        <Squiggle />
        <p className="body">It is <strong>not your resume in paragraph form.</strong> If I can get the same information by reading your bullets, you wasted the one chance you had to talk to me directly.</p>
        <p className="body">It should say three things and nothing else. Why this role. Why this company. And one or two specific things from your background that connect to what the job actually needs. <strong>Three or four paragraphs. That is it.</strong></p>
        <Rec><p>I can tell in one line whether a letter was written for us or sent to forty companies unchanged. &quot;I am excited about this opportunity at your organization&quot; tells me you did not look us up. Name something real about the company and you are instantly in the top ten percent, because almost nobody does it.</p></Rec>
      </div>

      <div className="card">
        <h3 className="sec">The four paragraph structure</h3>
        <ul style={ladder}>
          <Rung title="1 · The hook">Name the role and say the single most relevant thing about you. No &quot;I am writing to apply for.&quot; They know why you are writing.</Rung>
          <Rung title="2 · The proof">One specific accomplishment with a number, chosen because it maps to something in their posting. Not your whole career. One story.</Rung>
          <Rung title="3 · The pivot paragraph">Why HR, why now, and why your background is an asset rather than a gap. This is the paragraph career changers must not skip.</Rung>
          <Rung title="4 · The close">Say you want the job. Directly. Then thank them and stop writing.</Rung>
        </ul>
        <Band icon="bulb" color="#8EDBC2"><b>Write the pivot paragraph once and reuse it forever.</b> It barely changes between applications. The hook and the proof are what you customize each time, and that takes about ten minutes once the rest is built.</Band>
      </div>

      <div className="card">
        <h3 className="sec">Build yours</h3>
        <p className="sub">Fill these in and it assembles into a full letter you can copy or download.</p>
        <div className="row2">
          <div className="field"><label>Company</label><Inp k="cl_co" ph="Company name" label="Company" /></div>
          <div className="field"><label>Role title</label><Inp k="cl_role" ph="HR Coordinator" label="Role title" /></div>
        </div>
        <div className="field"><label>Hiring manager name, if you can find it</label><Inp k="cl_name" ph="Leave blank and it says Hiring Team" label="Hiring manager name" /></div>
        <div className="field"><label>1 · Hook. The most relevant thing about you, in one sentence.</label>
          <TA k="cl_hook" ph="Seven years running a retail team taught me hiring, onboarding, and how to keep people from quitting." rows={2} label="Hook" /></div>
        <div className="field"><label>2 · Proof. One accomplishment with a number in it.</label>
          <TA k="cl_proof" ph="I trained 22 new hires and built the onboarding checklist my store still uses, which cut ramp time for new staff by about half." rows={3} label="Proof" /></div>
        <div className="field"><label>Why this company specifically. One real detail.</label>
          <TA k="cl_why" ph="Something true you found on their site, their news, or their careers page." rows={2} label="Why this company" /></div>
        <div className="field"><label>3 · Your pivot paragraph. Write once, reuse forever.</label>
          <TA k="cl_pivot" ph="I am moving into HR deliberately, not accidentally. The work I have always done best is the people part, and I have been building toward this by..." rows={4} label="Pivot paragraph" /></div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
          <button className="btn btn-t" onClick={build}>Assemble my letter</button>
          <button className="btn btn-g" onClick={download}>Download as Word doc</button>
        </div>
        <div style={{ marginTop: 20 }}>{letter ? <Tpl label="Your assembled letter" text={letter} /> : null}</div>
      </div>

      <div className="card">
        <h3 className="sec">Three openings that work</h3>
        <p className="sub">Steal the shape, not the words.</p>
        <Tpl label="If you have a referral" text="[Name] suggested I reach out about the [Role] opening. I have spent [X] years in [field], and the part I have always done best is [the people thing]. When [Name] described what your team is working on, it lined up almost exactly with the work I have been moving toward." />
        <Tpl label="If you are a career changer" text="I am applying for the [Role] position, and I will be direct with you: my background is in [field], not HR. What I bring is [X] years of [specific relevant skill], including [one accomplishment with a number]. I have been moving toward this deliberately, and here is why I think that background is an advantage rather than a gap." />
        <Tpl label="If you have one strong number" text="In my last role I [accomplishment with the number]. That is the kind of work I want to keep doing, which is why I am applying for the [Role] position at [Company]." />
      </div>

      <div className="card">
        <h3 className="sec">Before you send it</h3>
        <Chk k="cover" items={[
          "The company name is correct and appears more than once",
          "I named something real and specific about this company",
          "There is at least one number in the letter",
          "The pivot paragraph explains why my background is an asset",
          "It is under one page and under four paragraphs",
          "I said directly that I want the job",
          "Zero typos. I read it out loud once",
          "File name is FirstName_LastName_CoverLetter, not Document1",
        ]} />
        <Note kind="mistake" label="Common mistakes"><p>Addressing it &quot;To Whom It May Concern&quot; when the recruiter&apos;s name is on the LinkedIn job post. Spending the whole letter on what you want instead of what you bring. And sending the same letter to ten companies with the name swapped, which I promise is more obvious than you think.</p></Note>
      </div>
      <FootNav id="cover" />
    </>
  );
}

/* ───── STEP 10 · LINKEDIN LAB ───── */
export function LinkedIn() {
  const { S, update, badges, toast } = useApp();
  const parts = ["hdA", "hdB", "hdC"].map((k) => txt(S, k).trim()).filter(Boolean);
  const save = () => {
    if (!parts.length) { toast("Fill in at least one field first."); return; }
    update((s) => ({ ...s, txt: { ...s.txt, liHead: parts.join(" · ") } }));
    badges();
    toast("Headline saved to your dashboard.");
  };
  return (
    <>
      <div className="hero">
        <div className="eyebrow">Step 10 · LinkedIn Lab</div>
        <h1>Make yourself findable.</h1>
        <p>Recruiters search LinkedIn all day. If your profile does not contain the words we search for, you do not exist.</p>
      </div>

      <Bridge why={<>Your resume is pull. Somebody has to already be looking at it. <strong>LinkedIn is push,</strong> and it is the only asset that works while you sleep. Recruiters like me search it all day, and if your profile does not contain the words we type, you do not exist to us. That is not an exaggeration.</>}
        get="a headline recruiters can find, an About section that sounds like you, and a message template that gets replies." />

      <div className="card">
        <h3 className="sec">Headline builder</h3>
        <p className="sub">Your headline follows you everywhere on the platform. Do not waste it on your current job title.</p>
        <div className="field"><label>What you want to be found as</label><Inp k="hdA" ph="Aspiring HR Coordinator" label="What you want to be found as" /></div>
        <div className="field"><label>What you actually do well</label><Inp k="hdB" ph="High volume customer communication" label="What you actually do well" /></div>
        <div className="field"><label>Your proof, with a number if you have one</label><Inp k="hdC" ph="6 years in hospitality, 3 years leading teams" label="Your proof" /></div>
        <div style={{ background: "var(--navy)", borderRadius: 16, padding: 24, marginTop: 6 }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: ".16em", color: "var(--mint)", marginBottom: 12 }}>LIVE PREVIEW</div>
          <div style={{ display: "flex", gap: 13, alignItems: "center" }}>
            <div className="avatar" style={{ width: 46, height: 46, fontSize: 16 }}>{initials(S.user!.name)}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: "#fff", fontWeight: 600, fontSize: 15 }}>{S.user!.name}</div>
              <div style={{ color: "var(--mint)", fontSize: 13.5, lineHeight: 1.5, marginTop: 2 }}>{parts.length ? parts.join(" · ") : "Fill the fields above to see your headline"}</div>
            </div></div>
        </div>
        <button className="btn btn-g btn-sm" style={{ marginTop: 14 }} onClick={save}>Save this headline</button>
        <Rec><p>When I am sourcing, I search job titles and skills, not personalities. &quot;Passionate people person seeking opportunity&quot; is invisible to me. &quot;Aspiring HR Coordinator&quot; is findable. Put the words in that you want to be found for, even if you do not have the title yet.</p></Rec>
      </div>

      <div className="card">
        <h3 className="sec">Your About section</h3>
        <p className="sub">First person. Short paragraphs. It should sound like you talking, not a press release.</p>
        <TA k="liAbout" ph="I spent six years in hospitality managing a team of 18 and learning how to keep people calm when everything is going wrong. I am moving into HR because..." rows={7} label="Your About section" />
        <Tpl label="About section skeleton" text={"I spent [X] years in [field], where I [the thing you actually did well, with a number].\n\nWhat I learned there translates directly to HR: [two or three specific skills].\n\nI am now focused on moving into [target role]. I am currently [certification, course, or what you are doing about it].\n\nIf you are hiring for [target role] or you work in HR and are open to a quick conversation, I would genuinely like to connect."} />
      </div>

      <div className="card">
        <h3 className="sec">Profile checklist</h3>
        <p className="sub">Every one of these makes you easier to find or easier to trust.</p>
        <Chk k="li" items={[
          "A real headshot. Clear face, decent light, no sunglasses, no group photo cropped down",
          "A banner image that is not the default gray",
          "Headline says what I want to be found as, not just my current title",
          "About section written in first person",
          "Every job has at least two bullets with numbers",
          "Skills section filled with the terms from HR job postings",
          "Open to work turned on, set to recruiters only if I am still employed",
          "Custom URL claimed, not the one with random numbers at the end",
          "Following at least 10 companies I would actually want to work for",
        ]} />
      </div>

      <div className="card">
        <h3 className="sec">The outreach message that actually works</h3>
        <p className="sub">Short. Specific reason. One real point of connection. Small ask.</p>
        <Tpl label="LinkedIn outreach" text="Hi [Name], I saw you are a recruiter at [Company] and noticed we are both [alumni of X / former Y / connected through Z]. I am in the middle of a transition into HR and would love to hear how you got into recruiting if you have five minutes for a quick call." />
        <Note kind="win" label="Why this works"><p>It is a few sentences, not a paragraph that reads like a cover letter. It gives one real point of connection and makes a small ask. People respond to that because it does not feel like a mass message, and it is not one. Send ten of these and you will get three replies. That is a good week.</p></Note>
      </div>
      <FootNav id="linkedin" />
    </>
  );
}
