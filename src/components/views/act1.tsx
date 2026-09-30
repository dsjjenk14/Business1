"use client";
import { useState } from "react";
import { useApp } from "../AppProvider";
import { Acc, Band, Bridge, Chk, FootNav, HeroDoodle, Mark, Note, Rec, TA } from "../ui";
import { Squiggle } from "../Doodle";
import { ChoiceGame } from "../games";
import { firstName } from "@/lib/state";
import { DECODE_MAP, DECODE_QZ, IND_OPEN, QZ, QZR } from "@/lib/content";

/* ───── STEP 1 · WELCOME ───── */
export function Welcome() {
  const { S } = useApp();
  const first = firstName(S);
  return (
    <>
      <div className="hero">
        <div className="eyebrow">Step 1 · Welcome</div>
        <h1>I know what it&apos;s like to wonder if your experience is enough.</h1>
        <p>It is. You just haven&apos;t learned how to tell the story yet. That&apos;s what we&apos;re about to fix.</p>
      </div>

      <div className="card">
        <p className="body">{first}, I want to start by saying the thing nobody said to me when I was where you are.</p>
        <p className="body"><strong>You are not behind.</strong> You are not unqualified. You are not too late. What you are is undertranslated. You have been doing work for years that maps directly onto HR and recruiting, and nobody ever showed you how to put it into words a hiring manager recognizes.</p>
        <p className="body">Coming from {S.user!.industry.toLowerCase()}? Good. Some of the best recruiters I have worked with came from retail, hospitality, the military, and call centers. They knew how to talk to people under pressure before they knew what an ATS was. That is the hard part. The rest is learnable.</p>
        <Note kind="story" label="Dominique's story">
          <p>Before I worked in recruiting, I worked in a call center. Every day I answered calls, solved problems, worked under pressure, hit metrics, and learned how to communicate with every personality imaginable. At the time I thought I was just doing customer service.</p>
          <p>Looking back, I was building the exact skills that would eventually make me a recruiter. I just did not know how to tell that story yet.</p>
        </Note>
      </div>

      <Bridge why="Most career guides open by telling you the field is wonderful. I would rather open by telling you how it actually works, because you are going to make better decisions with real information than with encouragement."
        get="a clear picture of what this takes, and a written reason to come back to on the hard weeks." />

      <div className="card">
        <Mark icon="heart" label="Read this on the hard weeks" />
        <h3 className="sec">This is going to take longer than you want</h3>
        <Squiggle />
        <p className="body">I want to be honest with you up front, because I would rather you hear it from me than conclude it about yourself at week six.</p>
        <p className="body">A career pivot takes months, not weeks. You will send messages nobody answers. You will get rejected by roles you were right for. None of that is evidence that you cannot do this. <strong>It is just the cost of doing it.</strong></p>
        <p className="body">The people who make this transition are not the most qualified ones. They are the ones who kept going after the part where it stopped being exciting.</p>
      </div>

      <div className="card">
        <h3 className="sec">Here&apos;s my promise to you</h3>
        <p className="sub">Twenty-one steps. Everything I know. No fluff.</p>
        <p className="body">By the time you finish this, you will have a resume that actually reads the way your experience deserves, a LinkedIn profile recruiters can find, a real networking strategy, interview answers you have practiced out loud, negotiation scripts, and a plan for your first 90 days on the job.</p>
        <p className="body">Not theory. The actual things I look for when I am the one deciding who gets the call.</p>
        <Rec><p>I am going to be honest with you throughout this, including when the honest answer is not the encouraging one. The market is tough right now. Pretending otherwise would not help you. What helps you is knowing exactly how the process works so you can stop guessing.</p></Rec>
      </div>

      <div className="card">
        <h3 className="sec">Before we start, commit to it</h3>
        <p className="sub">Check these off. It matters more than you think.</p>
        <Chk k="commit" items={[
          "I will do the work, not just read about the work",
          "I will stop apologizing for my background in interviews",
          "I will apply to roles I am actually a strong fit for instead of spraying applications",
          "I will reach out to real people, not just click easy apply",
          "I will come back to this even on the weeks it feels slow",
        ]} />
        <Note kind="reflect" label="Reflection">
          <p style={{ marginBottom: 12 }}>Why do you want this? Write it plainly. On the hard weeks, you are going to come back and read it.</p>
          <TA k="reflect1" ph="I want this because..." rows={4} />
        </Note>
      </div>
      <FootNav id="welcome" />
    </>
  );
}

/* ───── STEP 2 · HOW I GOT IN ───── */
export function Story() {
  return (
    <>
      <div className="hero">
        <HeroDoodle name="door" />
        <div className="eyebrow">Step 2 · How I got in</div>
        <h1>Two of my jobs came from just applying.</h1>
        <p>Two of them I found on a job board, applied to like everybody else, and got. It does happen, and I am not going to pretend otherwise. But every other door I walked through opened because of a person or a staffing agency. I want you to know the real ratio before we go further, because it changes where you spend your energy.</p>
      </div>

      <Bridge why="Before I teach you anything, you should know whether I actually did this myself or just read about it. So here is the first part of how I got in, including the part most people leave out of the story."
        get="the real ratio of how jobs get filled, and a list of five people who already know you are reliable." />

      <div className="card">
        <Mark icon="phone" label="Where it started" />
        <h3 className="sec">The call center</h3>
        <Squiggle />
        <p className="body">I answered calls all day. High volume, a metric on everything, and people who were usually already frustrated by the time they reached me. I was measured on how fast I resolved things and how well, and I got good at both.</p>
        <p className="body">What I did not understand at the time is that I was learning to build trust with a stranger in under ninety seconds, stay steady when someone was upset with me, and hit a number every day without anyone standing over me. <strong>That is the recruiting job.</strong> I just did not have the words for it yet.</p>
        <Band icon="bulb"><b>Your version of this exists.</b> Whatever job you are underselling right now taught you something a hiring manager wants. We spend the next few steps digging it out.</Band>
      </div>

      <div className="card">
        <Mark icon="hand" label="The first door" />
        <h3 className="sec">I got my first HR job because I knew somebody</h3>
        <Squiggle />
        <p className="body">I am going to be straight with you about this, because I think the polished version of these stories does people harm.</p>
        <p className="body">My first role was as a recruiting coordinator. I did not get it by applying. <strong>I knew someone who owned a staffing firm.</strong> They won a contract, and that is how I got in the door. No HR degree, no HR experience, no clever cover letter. A person who knew me thought of me when an opening existed.</p>
        <p className="body">I want to name that plainly for two reasons. First, because pretending I out-applied everyone would be a lie. Second, and this is the part that matters for you: <strong>this is how a huge number of jobs actually get filled,</strong> and it is a door you can build for yourself starting today. It is not luck. It is being known by enough people that your name comes up in a room you are not standing in.</p>
        <Rec><p>Here is the uncomfortable math. A posted role gets hundreds of applicants and you are a resume in a pile. A referred candidate gets read every time. Same person, same resume, completely different odds. That gap is not fair, but you can use it starting this week.</p></Rec>
      </div>

      <div className="card">
        <Note kind="reflect" label="Reflection · do this one properly">
          <p style={{ marginBottom: 12 }}>Before you read another word: list five people who already know you are reliable. Old managers, coworkers, someone from church, a friend who runs a business, a former customer. Do not filter for whether they work in HR. Just write the names.</p>
          <TA k="reflect2" ph={"1.\n2.\n3.\n4.\n5."} rows={6} label="Five people who know you are reliable" />
          <p style={{ marginTop: 12 }}>That list is the single most valuable thing on this page. We come back to it in the Networking Hub.</p>
        </Note>
      </div>
      <FootNav id="story" />
    </>
  );
}

/* ───── STEP 3 · IS HR RIGHT FOR YOU ───── */
const MYTHS: [string, string][] = [
  ["You need an HR degree to get into HR.", "Most people in this field do not have one. My degree is not in HR. What you need is a demonstrated ability to work with people, handle sensitive information, and stay organized under pressure."],
  ["HR is the easy, low stress option.", "It is not. You will handle terminations, investigations, and people at the worst moments of their working lives. It is meaningful, and it is heavy. Go in knowing that."],
  ["HR is just paperwork and parties.", "The admin work is real, especially early. But the job is judgment. Companies get sued over decisions HR makes. That is why trust matters more than credentials here."],
  ["You have to start at the very bottom forever.", "You start at an entry point, yes. But this field moves fast for people who show competence. I went from staffing consultant to building an entire recruiting function in under two years."],
  ["Recruiting and HR are the same job.", "They are two different careers under one umbrella, and the tables below show you exactly how they split."],
];

function Door({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--fog)", padding: 20, borderRadius: 14 }}>
      <div className="pill navy">Door {n}</div>
      <b style={{ display: "block", fontFamily: "var(--dsp)", fontSize: 16, marginTop: 10 }}>{title}</b>
      <p className="body" style={{ fontSize: 14, marginTop: 7 }}>{children}</p>
    </div>
  );
}

export function Rung({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <li style={{ background: "var(--fog)", padding: "16px 18px", borderRadius: 13 }}>
      <b style={{ fontFamily: "var(--dsp)" }}>{title}</b>
      <p className="body" style={{ fontSize: 14, margin: "5px 0 0" }}>{children}</p>
    </li>
  );
}
const ladder = { listStyle: "none", display: "flex", flexDirection: "column", gap: 11 } as const;

export function IsRight() {
  return (
    <>
      <div className="hero">
        <div className="eyebrow">Step 3 · The lay of the land</div>
        <h1>Two careers, four doors, and one honest question.</h1>
        <p>Before you write a single resume bullet, you need to know what you are actually applying for. This is the step most people skip, and it is why they spend a year applying to the wrong roles.</p>
      </div>

      <Bridge why={<>Here is the part nobody explains. <strong>HR job titles are genuinely confusing,</strong> and not because you are missing something. The same title means different things at different companies, half the roles overlap, and nobody hands you a map. So before you apply to anything, let me draw you one.</>}
        get="a clear view of both career paths, both ladders, and an honest read on whether this fits you." />

      <div className="card">
        <Mark icon="people" label="How I figured this out" />
        <h3 className="sec">I picked recruiting by watching recruiters</h3>
        <Squiggle />
        <p className="body">In that first coordinator role, I made a point of networking with the HR team. Not strategically, at first. I just talked to people.</p>
        <p className="body">That is how I met the recruiters, and honestly, I was fascinated by them. <strong>They were always on the go. Always talking to somebody.</strong> The pace was fast and it was competitive, and the more I watched, the more I thought: that is the part of this building I want to be in.</p>
        <p className="body">Nobody told me to figure it out that way. I just paid attention to which people seemed to be doing work I actually envied. That is a genuinely good way to choose a career, and it beats reading a job description and guessing.</p>
        <Band icon="bulb" color="#8EDBC2"><b>You can do this before you commit.</b> Find someone doing the job you think you want and get twenty minutes with them. Ask what their Tuesday looks like. Not their highlights, their Tuesday. That single question tells you more than any career quiz.</Band>
      </div>

      <div className="card">
        <h3 className="sec">First, the split</h3>
        <p className="body">When people say they want to get into HR, they almost always mean one of two very different careers. Both live under the same umbrella, both hire people from non traditional backgrounds, and early on they even overlap. But the day to day work, the personality each one rewards, and where they eventually take you are not the same.</p>
        <p className="body"><strong>Recruiting is the front door of the company.</strong> You find people, sell them on the role, guide them through the process, and close the offer. It is fast, it is target driven, and it has a scoreboard.</p>
        <p className="body"><strong>The generalist side is everything that happens after someone is already an employee.</strong> Onboarding, benefits, employee relations, performance, policy, and the messy human situations nobody puts in a job description. It is broader, steadier, and far more judgment heavy.</p>
        <table className="tbl">
          <thead><tr><th></th><th>Recruiting / TA</th><th>HR Generalist</th></tr></thead>
          <tbody>
            <tr><td>The work</td><td>Find people, sell the role, close the offer</td><td>Onboard, advise, resolve, support employees</td></tr>
            <tr><td>Measured on</td><td>Hires, time to fill, offer acceptance</td><td>Retention, compliance, employee experience</td></tr>
            <tr><td>Pace</td><td>Fast, target driven, has a scoreboard</td><td>Steadier, ongoing, situation driven</td></tr>
            <tr><td>You will love it if</td><td>You like momentum and talking to new people</td><td>You like depth, judgment, and the human side</td></tr>
            <tr><td>The hard part</td><td>The pressure and the feast or famine swings</td><td>Carrying the difficult and sensitive situations</td></tr>
            <tr><td>Where it leads</td><td>Senior Recruiter → TA Lead → Head of TA</td><td>HRBP → HR Manager → Director → CHRO</td></tr>
          </tbody>
        </table>
        <Rec><p>You do not have to choose forever. Coordinator roles touch both sides, which is exactly why they are such a smart first job. Plenty of people start in recruiting, find they love the human side, and cross over. I have watched it go both ways more than once.</p></Rec>
      </div>

      <div className="card">
        <h3 className="sec">The four doors in</h3>
        <p className="sub">Entry level roles are stepping stones, not destinations. The point of the first one is exposure.</p>
        <p className="body">Most people trying to break in aim too high too fast. They chase recruiter roles before they have any context, or generalist roles before they have any credibility. The smarter move is to start somewhere that will genuinely teach you, then climb from real knowledge instead of borrowed confidence.</p>
        <div className="grid2">
          <Door n={1} title="HR Assistant">You see how the engine runs. Onboarding, HRIS data, compliance paperwork, employee records. The strongest operational foundation, especially for the generalist path.</Door>
          <Door n={2} title="Recruiting Coordinator">Interview scheduling, ATS management, candidate communication. The fastest exposure to how hiring actually works, from day one.</Door>
          <Door n={3} title="HR Coordinator">A blend of both. Benefits, employee relations, and recruiting support at once. The most well rounded first job if you have not picked a side.</Door>
          <Door n={4} title="Agency Recruiter">Fast and performance driven. The single most open door in the industry, and the one I walked through myself.</Door>
        </div>
        <Note kind="decode" label="What hiring managers really mean"><p>The title matters far less than what the role will teach you. Read the posting and ask one question: will this put me near the hiring process, near candidates, or near HR systems? If yes, it is worth your time even if the title sounds junior.</p></Note>
      </div>

      <div className="card">
        <h3 className="sec">Why agency work is the fastest launchpad</h3>
        <p className="body">Agency environments are high volume and performance driven. You will learn to source candidates, manage pipelines, and hold your own with hiring managers. You will also learn to handle rejection, stay organized under pressure, and close. Those skills follow you everywhere afterward.</p>
        <p className="body">A lot of the strongest corporate recruiters put in time at an agency early, precisely because nothing builds the fundamentals faster. You are placing real people in real roles and answering to real numbers. <strong>In a year at an agency you will work more roles than many corporate recruiters see in three.</strong></p>
        <Note kind="mistake" label="The honest trade off"><p>Agency life is demanding and not everyone thrives in it. The pressure is real, the hours run long, and the income can be variable if commission is involved. But even one or two years of it on your resume opens corporate doors for the rest of your career. Go in with your eyes open, not with a fantasy.</p></Note>
      </div>

      <div className="card">
        <Mark icon="ladder" label="Ladder one" />
        <h3 className="sec">The ladder, if you go recruiting</h3>
        <p className="sub">So you know what you are climbing toward.</p>
        <ul style={ladder}>
          <Rung title="Recruiting Coordinator">You run scheduling, the ATS, and candidate communication. You learn the machinery of hiring before you have to sell anything.</Rung>
          <Rung title="Recruiter or Sourcer">You own searches. Sourcers find people, recruiters run the whole process. Either way you now have a number attached to your name.</Rung>
          <Rung title="Senior Recruiter">You take the hard roles, the executive searches, and the ones that have failed twice. You advise hiring managers instead of taking orders from them.</Rung>
          <Rung title="TA Lead or Recruiting Manager">You own a team or a function. You are accountable for time to fill, quality of hire, and whether the process itself works.</Rung>
          <Rung title="Director of TA, then VP or Head of Talent">You set hiring strategy, own the budget and the employer brand, and sit at the leadership table.</Rung>
        </ul>
        <p className="body" style={{ marginTop: 18 }}>Coordinator to recruiter is often one to two years, and agency experience compresses that timeline more than anything else. <strong>Recruiting rewards results faster than almost any function in a company,</strong> because your output is countable. That is the upside of a job with a scoreboard.</p>
      </div>

      <div className="card">
        <Mark icon="ladder" label="Ladder two" />
        <h3 className="sec">The ladder, if you go generalist</h3>
        <p className="sub">Slower to climb, but it runs all the way to the top of the company.</p>
        <ul style={ladder}>
          <Rung title="HR Assistant or Coordinator">The operational foundation. You learn the systems and prove you are reliable.</Rung>
          <Rung title="HR Generalist">You own a bit of everything. Onboarding, benefits, employee relations, performance cycles. This is where you build range.</Rung>
          <Rung title="HR Business Partner">You stop doing tasks and start advising. You coach managers through people problems and influence decisions.</Rung>
          <Rung title="HR Manager">You own a function and usually manage people. The judgment calls become yours. This is the jump most people are aiming for.</Rung>
          <Rung title="Director and beyond">You set strategy and own budget. From here the path runs to VP and eventually CHRO.</Rung>
        </ul>
        <p className="body" style={{ marginTop: 18 }}>Coordinator to generalist is usually one to two years. Generalist to manager is another three to five. Certifications help: <strong>aPHR</strong> needs no experience and is worth doing while you are still breaking in, <strong>PHR or SHRM-CP</strong> is the mid career standard, and <strong>SPHR or SHRM-SCP</strong> is the senior one.</p>
      </div>

      <div className="card">
        <h3 className="sec">Myth versus reality</h3>
        <p className="sub">Tap each one. These are the five I hear most.</p>
        {MYTHS.map((m) => (
          <Acc key={m[0]} q={<><span className="pill coral" style={{ marginRight: 9 }}>Myth</span>{m[0]}</>}>
            <div className="qa strong"><div className="qlab">Reality</div><p>{m[1]}</p></div>
          </Acc>
        ))}
      </div>

      <div className="card">
        <h3 className="sec">The honest gut check</h3>
        <p className="sub">Check what is true. There are no wrong answers here, only useful ones.</p>
        <Chk k="gut" items={[
          "I can keep something confidential even when it would be interesting to share",
          "I can stay steady when someone is upset with me",
          "I am comfortable being measured on numbers",
          "I can hold a difficult conversation without avoiding it",
          "I like solving problems that involve people more than problems that involve spreadsheets",
          "I can handle knowing things about people that I cannot talk about",
        ]} />
        <Note kind="win" label="Quick win"><p>Four or more and you have the temperament, which is the part that cannot really be taught. Everything else in this field is learnable, and the next eighteen steps are how you learn it.</p></Note>
      </div>

      <div className="card">
        <h3 className="sec">What to look for in your first HR job</h3>
        <p className="sub">Not every role with HR in the title will actually teach you anything.</p>
        <Chk k="firstjob" items={[
          "Access to a real applicant tracking system or HRIS",
          "Exposure to the full hiring or employee lifecycle, not one narrow slice",
          "At least one HR person above me who will answer questions",
          "A company with actual HR infrastructure, not just a title with no support",
          "Pay that lets me stay long enough to learn before I have to move again",
        ]} />
      </div>
      <FootNav id="isright" />
    </>
  );
}

/* ───── STEP 4 · TITLE & INDUSTRY DECODER ───── */
export function Decoder() {
  const { update } = useApp();
  const [sel, setSel] = useState(0);
  const m = DECODE_MAP[sel];
  const rows: [string, keyof typeof m][] = [["In tech", "tech"], ["In law & professional services", "law"], ["In government", "gov"], ["In healthcare", "health"], ["In startups", "startup"]];
  return (
    <>
      <div className="hero">
        <HeroDoodle name="map" />
        <div className="eyebrow">Step 4 · The decoder</div>
        <h1>The same job has five different names.</h1>
        <p>This is the step that stops you from applying to the wrong things for a year. HR job titles are genuinely confusing, and it is not you. Let me translate.</p>
      </div>

      <Bridge why={<>You know HR is right for you. But here is the trap nobody warns you about: <strong>the job you want is posted under a title you are not searching for.</strong> A tech company will never post &apos;HR Generalist,&apos; so if that is all you type in, their whole company is invisible to you. Fix that before you apply to anything.</>}
        get="the real search terms for every industry, and an honest read on which ones welcome career changers." />

      <div className="card">
        <Mark icon="scan" label="The translator" />
        <h3 className="sec">One job, five industries</h3>
        <Squiggle />
        <p className="body">Pick a role you think you want. I will show you what that exact job is called in five different worlds, so you actually find it when you search.</p>
        <div className="field" style={{ maxWidth: 340 }}><label htmlFor="decSel">Show me the translations for</label>
          <select className="inp" id="decSel" value={sel} onChange={(e) => setSel(+e.target.value)}>
            {DECODE_MAP.map((d, i) => <option key={d.base} value={i}>{d.base}</option>)}
          </select></div>
        <div>
          <div className="decoder-flip">
            <div className="dfrom"><div className="dl">You would search</div><b>{m.base}</b></div>
            <div className="dto"><div className="dl">But it is also posted as</div><b>{m[rows[0][1]]}</b></div>
          </div>
          {rows.slice(1).map((r) => (
            <div key={r[0]} style={{ background: "var(--fog)", borderRadius: 12, padding: "14px 16px", marginBottom: 8 }}>
              <span style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--slate)" }}>{r[0]}</span>
              <b style={{ display: "block", fontFamily: "var(--dsp)", fontSize: 14, marginTop: 4 }}>{m[r[1]]}</b>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <Mark icon="door" label="Which doors are actually open" />
        <h3 className="sec">How open each industry is to a career changer</h3>
        <p className="sub">Honest ratings. Green is walk right in, yellow means bring something extra, red means slow and credential-heavy.</p>
        {IND_OPEN.map((o) => {
          const dot = o.open === "g" ? "dot-g" : o.open === "y" ? "dot-y" : "dot-r";
          const lbl = o.open === "g" ? "Very open" : o.open === "y" ? "Open with a catch" : "Tough door";
          return (
            <div key={o.ind} style={{ background: "var(--fog)", borderRadius: 13, padding: "16px 18px", marginBottom: 10 }}>
              <div className="opencol" style={{ justifyContent: "space-between" }}>
                <b style={{ fontFamily: "var(--dsp)", fontSize: 15 }}>{o.ind}</b>
                <span className="opencol" style={{ fontSize: 12, fontWeight: 600, color: "var(--slate)" }}><span className={dot} />{lbl}</span>
              </div>
              <p className="body" style={{ fontSize: 14, margin: "8px 0 0" }}>{o.note}</p>
            </div>
          );
        })}
        <Note kind="story" label="My story"><p>I have recruited across legal, federal, corporate, and professional services, and I promise you the same person with the same resume gets very different responses depending on which of these worlds they apply into. It is not about being good enough. It is about aiming where the door is already open.</p></Note>
      </div>

      <div className="card">
        <Mark icon="star" label="Quick game" />
        <h3 className="sec">Decode five real postings</h3>
        <p className="sub">Five questions. Prove you can read between the lines of a job title.</p>
        <ChoiceGame
          questions={DECODE_QZ} unit="Question" nextLabel="Next →"
          rightWord="Correct." wrongWord="Not quite."
          onEnd={(score) => { if (score >= 4) update((s) => ({ ...s, badges: { ...s.badges, decoder: true } })); }}
          end={(score) => ({
            msg: score >= 4 ? "You can read a job title now." : "Go back through the translator once more.",
            sub: "The titles change by industry. The job underneath is the same. Search all the names.",
          })}
        />
      </div>

      <div className="card">
        <h3 className="sec">Build your search list</h3>
        <p className="sub">Write the exact terms you will type into LinkedIn and Indeed. Pull from the translator above.</p>
        <TA k="decodeTerms" ph="People Partner, Talent Partner, Recruiting Coordinator, People Ops Coordinator..." rows={3} label="Your search terms" />
        <Band icon="bulb" color="#8EDBC2"><b>Save five to eight search terms, not one.</b> Set a job alert for each. The person who searches five titles sees five times the roles, and most of your competition is searching one.</Band>
      </div>
      <FootNav id="decoder" />
    </>
  );
}

/* ───── STEP 5 · CAREER ASSESSMENT ───── */
export function Assess() {
  const { S, update, badges, celebrate } = useApp();
  const [idx, setIdx] = useState(0);
  const [ans, setAns] = useState<string[]>([]);

  if (S.quiz) return <AssessResult />;

  const q = QZ[idx];
  const pick = (tag: string) => {
    const a = ans.slice(); a[idx] = tag;
    setAns(a);
    if (idx + 1 < QZ.length) { setIdx(idx + 1); return; }
    const c: Record<string, number> = {};
    a.forEach((t) => { c[t] = (c[t] || 0) + 1; });
    const best = Object.keys(c).sort((x, y) => c[y] - c[x])[0];
    update((s) => ({ ...s, quiz: best }));
    badges();
    celebrate();
  };

  return (
    <>
      <div className="hero">
        <div className="eyebrow">Step 5 · Assessment</div>
        <h1>Which door should you walk through?</h1>
        <p>Six questions. Answer honestly, not aspirationally. Nobody sees this but you.</p>
      </div>
      <Bridge why="You have the map. Now the question is which road is yours. Six questions, and I want you to answer how you actually are, not how you think you should be. Nobody sees this but you."
        get="a recommended path, a specific first role to target, and the salary range that comes with it." />

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div className="pill">Question {idx + 1} of {QZ.length}</div></div>
        <div style={{ height: 6, background: "var(--fog-2)", borderRadius: 4, overflow: "hidden", marginBottom: 26 }}>
          <div style={{ height: "100%", width: (idx / QZ.length) * 100 + "%", background: "linear-gradient(90deg,var(--mint),var(--teal))", transition: "width .4s" }} /></div>
        <h3 className="sec" style={{ fontSize: 23, marginBottom: 22 }}>{q.q}</h3>
        <ul className="chk">
          {q.a.map((o) => (
            <li key={o[0]} role="button" tabIndex={0} onClick={() => pick(o[1])}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(o[1]); } }}>
              <span className="cbox" aria-hidden="true">✓</span><span>{o[0]}</span></li>
          ))}
        </ul>
        {idx > 0 ? <button className="btn btn-g btn-sm" style={{ marginTop: 18 }} onClick={() => setIdx(idx - 1)}>← Previous question</button> : null}
      </div>
    </>
  );
}

function AssessResult() {
  const { S, update } = useApp();
  const r = QZR[S.quiz as keyof typeof QZR] ?? QZR.both;
  return (
    <>
      <div className="hero">
        <div className="eyebrow">Your result</div>
        <h1>{r.path}</h1>
        <p>Best first role for you: <strong style={{ color: "var(--mint)" }}>{r.role}</strong></p>
      </div>
      <Bridge why="You picked a lane. Now here is what that actually means day to day, what to target first, and what it pays, so the decision comes with real numbers attached."
        get="a target role, a first move, and the salary range that goes with it." />

      <div className="card">
        <h3 className="sec">Why this fits you</h3>
        <p className="body">{r.d}</p>
        <Note kind="action" label="Your next move"><p>{r.next}</p></Note>
        <button className="btn btn-g btn-sm" onClick={() => update((s) => ({ ...s, quiz: null }))}>Retake the assessment</button>
      </div>
      <div className="card">
        <h3 className="sec">Salary reality for this path</h3>
        <p className="sub">National ranges. Major metros like DC, New York, and San Francisco run higher.</p>
        <table className="tbl"><thead><tr><th>Role</th><th>Typical range</th></tr></thead><tbody>
          <tr><td>HR Assistant</td><td>$40,000 to $55,000</td></tr>
          <tr><td>HR / Recruiting Coordinator</td><td>$50,000 to $65,000</td></tr>
          <tr><td>HR Generalist</td><td>$55,000 to $80,000</td></tr>
          <tr><td>Recruiter</td><td>$65,000 to $90,000</td></tr>
          <tr><td>Senior Recruiter</td><td>$85,000 to $115,000</td></tr>
          <tr><td>HR Business Partner</td><td>$85,000 to $125,000</td></tr>
          <tr><td>HR Manager</td><td>$95,000 to $135,000+</td></tr>
        </tbody></table>
        <Rec><p>You may start at the lower end of a range. That is normal and it is fine. What is not fine is staying there quietly. Document what you contribute and have the conversation about moving toward the midpoint within your first 18 to 24 months.</p></Rec>
      </div>
      <FootNav id="assess" />
    </>
  );
}

