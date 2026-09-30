"use client";
import { useState } from "react";
import { useApp } from "../AppProvider";
import { Acc, Band, Bridge, Chk, FootNav, HeroDoodle, Inp, Mark, Note, Rec, TA, Tpl } from "../ui";
import { Squiggle } from "../Doodle";
import { BgGame, ChoiceGame } from "../games";
import { IVQ, SCREEN_GAME, SCREEN_QS } from "@/lib/content";
import { txt } from "@/lib/state";

/* ───── STEP 14 · PHONE SCREEN LAB ───── */
export function Phone() {
  const { S, update, toast } = useApp();
  const [line, setLine] = useState<string | null>(null);
  const build = () => {
    const posted = txt(S, "sc_posted").trim(), target = txt(S, "sc_target").trim();
    if (posted && target) setLine("\"I saw the posted range of " + posted + ". Based on my own research I am targeting " + target + ", so we are well aligned and I am confident we can land on a number that works for both of us.\"");
    else if (target) setLine("\"Based on my research and my experience, I am targeting " + target + ". I am excited about the role and confident we can find a number that works for both of us.\"");
    else toast("Fill in at least your target range.");
  };
  return (
    <>
      <div className="hero">
        <HeroDoodle name="phone" />
        <div className="eyebrow">Step 14 · Phone Screen Lab</div>
        <h1>The screen is where most people get cut.</h1>
        <p>Everybody prepares for the interview. Almost nobody prepares for the fifteen minute call that decides whether they get one. Let us fix that.</p>
      </div>

      <Bridge why={<>Your applications are out, and the first thing that happens is not an interview. It is a short call from someone like me. <strong>This call is a filter, and it is a brutal one.</strong> I am deciding in fifteen minutes whether you are worth the hiring manager&apos;s hour. Career changers get cut here more than anywhere, usually for things that have nothing to do with whether they could do the job.</>}
        get="a phone-screen game, the salary-range answer that keeps you alive, and the 15-minute structure." />

      <div className="card">
        <h3 className="sec">What the screen is actually for</h3>
        <Squiggle />
        <p className="body">I am not trying to see if you can do the job on a screen. I am checking three fast things: <strong>are you real, are you affordable, and can you hold a conversation.</strong> That is it. Most people over-prepare answers and under-prepare for how short and how blunt it is.</p>
        <table className="tbl">
          <thead><tr><th>Minutes</th><th>What is happening</th><th>Your job</th></tr></thead>
          <tbody>
            <tr><td>0 to 2</td><td>Small talk, then &quot;walk me through your background&quot;</td><td>90-second summary, warm, tight</td></tr>
            <tr><td>2 to 8</td><td>A few fit questions, maybe one about a gap or the pivot</td><td>Answer, then stop. Do not ramble.</td></tr>
            <tr><td>8 to 11</td><td>Salary and availability</td><td>Give a range. Stay calm. This is the real test.</td></tr>
            <tr><td>11 to 15</td><td>Your questions, next steps</td><td>Ask two smart things. Ask about timeline.</td></tr>
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3 className="sec">The salary range trap</h3>
        <p className="body">Salary transparency laws changed this. Most postings now show a range, and recruiters will still ask what you expect. <strong>Here is the trap: whoever says a number first, loses a little.</strong> But refusing to answer reads as difficult. So you give a researched range, not a point, and you anchor to the posted one.</p>
        <div className="field"><label>The role&apos;s posted range, if there is one</label><Inp k="sc_posted" ph="$55,000 to $70,000" label="The role's posted range" /></div>
        <div className="field"><label>Your researched target range</label><Inp k="sc_target" ph="$58,000 to $68,000" label="Your researched target range" /></div>
        <button className="btn btn-t btn-sm" onClick={build}>Build my answer</button>
        <div style={{ marginTop: 14 }}>{line ? <Tpl label="Say this, out loud, until it is easy" text={line} /> : null}</div>
        <Rec><p>If the posted range works for you, say so and name it. &quot;Your range of 55 to 70 lines up with my research, and I am comfortable in that band.&quot; Done. You just proved you are affordable and easy to work with in one sentence, and that matters more than squeezing the screen.</p></Rec>
      </div>

      <div className="card">
        <Mark icon="star" label="Game" />
        <h3 className="sec">Pass the screen</h3>
        <p className="sub">Five calls, five moments where people get cut. Pick the answer that survives.</p>
        <ChoiceGame questions={SCREEN_GAME} unit="Call" nextLabel="Next call →" rightWord="Survived." wrongWord="Cut."
          onEnd={(score) => { if (score >= 4) update((s) => ({ ...s, badges: { ...s.badges, screener: true } })); }}
          end={(score) => ({
            msg: score >= 4 ? "You would survive my screens." : "Run it again. The screen rewards calm and brevity.",
            sub: "Short answers, a real salary range, nothing negative, and always ask about next steps.",
          })} />
      </div>

      <div className="card">
        <h3 className="sec">The five questions, and how to land them</h3>
        {SCREEN_QS.map((s) => (
          <Acc key={s.q} q={<><span className="pill" style={{ marginRight: 9 }}>Screen</span>{s.q}</>}>
            <div className="qa strong"><div className="qlab">How to land it</div><p>{s.good}</p></div>
          </Acc>
        ))}
      </div>

      <div className="card">
        <h3 className="sec">Before you pick up</h3>
        <Chk k="phonechk" items={[
          "My resume is in front of me",
          "My three numbers are on a sticky note",
          "I know my salary range and can say it without flinching",
          "I researched the company for ten minutes",
          "I am somewhere quiet with good signal",
          "I have two questions ready to ask them",
          "I know it is 15 minutes and I will not ramble",
        ]} />
      </div>
      <FootNav id="phone" />
    </>
  );
}

/* ───── STEP 15 · INTERVIEW ACADEMY ───── */
export function Interview() {
  const { S, setTxt } = useApp();
  return (
    <>
      <div className="hero">
        <HeroDoodle name="clock" />
        <div className="eyebrow">Step 15 · Interview Academy</div>
        <h1>Preparation is the whole game.</h1>
        <p>Most people who lose interviews they should have won did not lose on qualifications. They lost because they knew their own story but not the company, the role, or the problem the person across the table was trying to solve.</p>
      </div>

      <Bridge why={<>You cleared the phone screen, which means someone decided you are worth an hour. Now the real conversation. Good news: <strong>interviews are the most learnable part of this whole process.</strong> They reward preparation more than talent, and preparation is entirely in your control.</>}
        get="six answers in your own words, three reusable stories, and questions to ask them." />

      <div className="card">
        <h3 className="sec">Before you walk in</h3>
        <Chk k="ivprep" items={[
          "Studied the company site, their mission, and any recent news",
          "Read the job description line by line. Every bullet is a possible question",
          "Looked up my interviewers on LinkedIn",
          "Prepared a two minute answer to tell me about yourself",
          "Have three real examples ready: teamwork, problem solving, difficult situation",
          "Wrote three to five genuine questions to ask them",
          "Practiced out loud at least twice. Out loud, not in my head",
        ]} />
        <Rec><p>Be ready to back up everything on your resume. If you listed a system, you need to talk about it for real. Getting caught stretching the truth is worse than not having the skill at all, because now I am questioning everything else on the page.</p></Rec>
      </div>

      <div className="card">
        <Mark icon="clock" label="My story · how I actually prepared" />
        <h3 className="sec">I spent hours with recruiters before my recruiting interview</h3>
        <Squiggle />
        <p className="body">When I decided to go for the staffing agency job, I did not just read about recruiting. <strong>I spent hours with recruiters from other staffing agencies preparing for that interview.</strong> I asked them what the job was really like, what they got asked, what answers landed and what fell flat.</p>
        <p className="body">By the time I sat down in that interview, I was not guessing about anything. I knew the vocabulary, I knew the metrics they cared about, and I knew what a good answer sounded like because people who did the job had told me.</p>
        <p className="body">That is the single highest leverage thing you can do before an interview, and almost nobody does it. <strong>Go find people who already have the job you are interviewing for and ask them what to expect.</strong> Most will tell you.</p>
        <Band icon="bulb" color="#8EDBC2"><b>This is why networking comes before this step.</b> The people you met there are the ones who prepare you now. It was never just about referrals.</Band>
      </div>

      <div className="card">
        <h3 className="sec">Know which interview you are in</h3>
        <p className="sub">Most people prepare one way for three very different conversations.</p>
        <table className="tbl">
          <thead><tr><th>Round</th><th>Who</th><th>What they are really deciding</th></tr></thead>
          <tbody>
            <tr><td>Recruiter screen</td><td>Someone like me</td><td>Are you real, affordable, and worth the hiring manager&apos;s time? I am checking your story holds up, your salary range fits, and you can hold a conversation.</td></tr>
            <tr><td>Hiring manager</td><td>Your future boss</td><td>Can you do the work and do I want you near my team every day? This is where your stories matter most.</td></tr>
            <tr><td>Panel or team</td><td>Peers, sometimes skip level</td><td>Will you make our jobs easier or harder? They are looking for how you handle disagreement and whether you listen.</td></tr>
            <tr><td>Final or executive</td><td>Senior leader</td><td>Usually a culture and judgment check. Keep answers shorter and more strategic here, not more detailed.</td></tr>
          </tbody>
        </table>
        <Rec><p>Ask the recruiter who you are meeting and what their role is. Every good recruiter will tell you, and it is a completely normal question. Then adjust: with a peer, talk about collaboration. With an executive, talk about outcomes.</p></Rec>
      </div>

      <div className="card">
        <h3 className="sec">If it is on video, and it probably is</h3>
        <p className="body">Most first rounds are virtual now, and the setup is doing more work than people realize. <strong>Camera at eye level,</strong> not below you, because looking down at a laptop reads as looking down at them. Light in front of your face, never behind you. Plain background.</p>
        <p className="body">Look at the <strong>camera</strong> when you make your key point, not at their face on screen. It is the difference between seeming present and seeming distracted. And put a sticky note next to the lens with your three numbers on it so you never have to look away to remember them.</p>
        <Chk k="video" items={[
          "Tested the link, the camera, and the microphone the day before",
          "Camera at eye level, light in front of my face",
          "Notifications off, phone face down, door closed",
          "A glass of water within reach",
          "My resume and my three numbers on paper next to me",
          "Logged in five minutes early",
        ]} />
      </div>

      <div className="card">
        <h3 className="sec">Three cues to carry in with you</h3>
        <p className="sub">Say these to yourself in the parking lot.</p>
        <div className="cue"><span>Breathe, then answer</span><span>Say &quot;I&quot;, not &quot;we&quot;</span><span>End on the number</span></div>
        <p className="body">Silence before you speak reads as confidence, not hesitation. &quot;We&quot; hides your contribution, and the interviewer is hiring you, not your old team. And when you finish a story, land it on the result, ideally a number. <strong>Specific beats perfect.</strong></p>
      </div>

      <div className="card">
        <h3 className="sec">The question bank</h3>
        <p className="sub">Open each one. Read the weak answer, read the strong answer, then write your own.</p>
        {IVQ.map((q) => {
          const conf = txt(S, "conf_" + q.id) || "3";
          return (
            <Acc key={q.id} q={<><span className="pill" style={{ marginRight: 9 }}>{q.cat}</span>{q.q}</>}>
              <div className="qa why"><div className="qlab">Why they are asking</div><p>{q.why}</p></div>
              <div className="qa why" style={{ marginTop: 12 }}><div className="qlab">What they are evaluating</div><p>{q.ev}</p></div>
              <div className="qa weak" style={{ marginTop: 14 }}><div className="qlab">Weak answer</div><p>{q.weak}</p></div>
              <div className="qa strong" style={{ marginTop: 12 }}><div className="qlab">Strong answer</div><p>{q.strong}</p></div>
              <div style={{ marginTop: 14 }}><Rec><p>{q.note}</p></Rec></div>
              <div className="field" style={{ marginTop: 16 }}><label>Your answer, in your own words</label>
                <TA k={"iv_" + q.id} ph="Do not copy the strong answer. Use your own story." rows={4} label={"Your answer: " + q.q} /></div>
              <div className="field">
                <label htmlFor={"conf_" + q.id}>How confident do you feel saying this out loud? <span>{conf}</span> of 5</label>
                <input id={"conf_" + q.id} type="range" className="slider" min={1} max={5} value={conf}
                  onChange={(e) => setTxt("conf_" + q.id, e.target.value)} />
              </div>
            </Acc>
          );
        })}
      </div>

      <div className="card">
        <Mark icon="note" label="Your story bank" />
        <h3 className="sec">Build three stories you can tell cold</h3>
        <p className="sub">Most behavioral questions are the same four stories wearing different hats. Build them once and reuse them.</p>
        <p className="body">This is the exact format I use to prep for my own interviews. The last box is the one people forget: <strong>what you say when they dig deeper.</strong> Interviewers always ask a follow up, and that is where unprepared candidates fall apart.</p>
        {[1, 2, 3].map((n) => (
          <div className="sbank" key={n}>
            <div className="sh"><span className="sn">{n}</span><b>Story {n}</b></div>
            <div className="field"><label>Name it (so you can find it fast)</label><Inp k={"sb" + n + "_t"} ph="The angry customer / The schedule I fixed" label={"Story " + n + " name"} /></div>
            <div className="field"><label>Situation</label><TA k={"sb" + n + "_s"} ph="What was happening and why it mattered" rows={2} label={"Story " + n + " situation"} /></div>
            <div className="field"><label>What I did</label><TA k={"sb" + n + "_d"} ph="Your actions. Say I, not we." rows={3} label={"Story " + n + " what I did"} /></div>
            <div className="field"><label>Result</label><TA k={"sb" + n + "_r"} ph="What changed. Put a number on it if you can." rows={2} label={"Story " + n + " result"} /></div>
            <div className="field"><label>The one line to say out loud</label><Inp k={"sb" + n + "_l"} ph="The sentence you land on" label={"Story " + n + " one line"} /></div>
            <div className="field"><label>If they dig deeper</label><TA k={"sb" + n + "_g"} ph="The follow up you would get, and your answer" rows={2} label={"Story " + n + " if they dig deeper"} /></div>
          </div>
        ))}
        <Note kind="win" label="Quick win"><p>Three solid stories cover almost every behavioral question you will be asked. Conflict, a mistake, a win, and pressure are the four buckets, and a good story usually fits two of them.</p></Note>
      </div>

      <div className="card">
        <h3 className="sec">When you fumble, and you will</h3>
        <p className="body">Everybody blanks at least once. What separates people is what happens in the next ten seconds. <strong>Do not apologize and spiral.</strong> Say &quot;let me start that over&quot; and start it over. Interviewers respect the recovery far more than they penalize the stumble.</p>
        <p className="body">If you truly do not know something, say so plainly and then say what you would do about it. &quot;I have not worked in that system. I learned our current one in about two weeks, and I would expect the same here.&quot; That answer beats a bluff every single time, because a bluff falls apart on the follow up question.</p>
        <Note kind="mistake" label="The three real killers">
          <p><strong>Rambling.</strong> When you do not know where the answer ends, you keep talking. End on your result and stop.</p>
          <p><strong>Badmouthing.</strong> Anything negative about a current employer makes me wonder what you will say about us. Keep it neutral and forward looking.</p>
          <p><strong>No questions at the end.</strong> It reads as not caring, every time.</p>
        </Note>
      </div>

      <div className="card">
        <h3 className="sec">Your closing statement</h3>
        <p className="body">At the end, they almost always ask if you have anything to add. Most people say no. <strong>Say something.</strong> Thirty seconds, three parts: you want the job, here is the single strongest reason you are a fit, and what is the next step.</p>
        <TA k="iv_close" ph="I want this job. The reason I would be good at it is... What does the next step look like?" rows={3} label="Your closing statement" />
        <Band icon="star" color="#8EDBC2"><b>Tell them straight up that you want the role.</b> It is astonishing how few candidates do it, and it genuinely moves the needle when two people are close.</Band>
      </div>

      <div className="card">
        <h3 className="sec">The thank you note, within 24 hours</h3>
        <p className="sub">Short. Specific. Sent to every person you met.</p>
        <Tpl label="Thank you email" text={"Subject: Thank you · [Role]\n\nHi [Name],\n\nThank you for your time today. I especially appreciated what you said about [specific thing they said], and it made me more interested in the role, not less.\n\nOne thing I want to underline: [the strongest, most relevant thing about you in one sentence]. If it would help, I am glad to share [a reference, a work sample, more detail on something you discussed].\n\nThanks again, and I look forward to hearing about next steps.\n[Your Name]"} />
        <Note kind="win" label="Quick win"><p>Reference something they actually said. It proves you listened and it separates your note from the generic ones. If you interviewed with four people, send four different notes, not one email with everyone copied.</p></Note>
      </div>

      <div className="card">
        <h3 className="sec">The silence afterward</h3>
        <p className="body">This is the part that eats people. You interviewed, it went well, and then nothing for two weeks. <strong>Silence usually means internal delay, not rejection.</strong> Someone is on vacation, another candidate is still in process, or the role got put on hold. It is rarely about you.</p>
        <p className="body">Ask at the end of every interview when they expect to decide. Then follow up once, politely, a few days after that date passes. <strong>One follow up. Not four.</strong> And keep applying the entire time. Nothing is real until it is signed.</p>
      </div>

      <div className="card">
        <h3 className="sec">Questions to ask them</h3>
        <p className="sub">Always have a few ready. Not having any reads as not caring.</p>
        <Chk k="ivask" items={[
          "What does a normal day look like in this role?",
          "What would you want me to get up to speed on first?",
          "What does doing well in this role look like in the first six months?",
          "What happened to the last person in this seat?",
          "Is there room to grow from this position?",
        ]} />
        <Note kind="win" label="Quick win"><p>It is okay to take a second before you answer. Thinking looks better than rambling. And smile once at the start. One breath before you speak reads as confidence, not hesitation.</p></Note>
      </div>
      <FootNav id="interview" />
    </>
  );
}

/* ───── STEP 16 · REFERENCES & BACKGROUND CHECK ───── */
export function Refs() {
  return (
    <>
      <div className="hero">
        <HeroDoodle name="people" />
        <div className="eyebrow">Step 16 · References &amp; the check</div>
        <h1>The part that quietly kills offers.</h1>
        <p>You can ace every interview and still lose the job here, usually over something small and fixable. This is the step nobody teaches, and it is the one I care about most.</p>
      </div>

      <Bridge why={<>You are interviewing well. Before an offer becomes real, two things happen that you can prepare for right now: they call your references, and they run a background check. <strong>My single strongest piece of advice in this whole thing lives here.</strong> Do not resign from anything until both of these clear, because I have watched offers vanish at this exact stage.</>}
        get="a briefed set of references, and a background check you have already de-risked." />

      <div className="card">
        <h3 className="sec">Who to pick</h3>
        <Squiggle />
        <p className="body">Three is the standard ask. You want people who <strong>managed you or worked closely with you,</strong> who will pick up the phone, and who actually liked your work. A glowing reference who is hard to reach is worse than a good one who answers on the first ring.</p>
        <p className="body">Line them up now, in fixed slots, so you are never scrambling when a recruiter asks. Fill these in.</p>
        <div>
          {[1, 2, 3].map((i) => (
            <div className="sbank" key={i}>
              <div className="sh"><span className="sn">{i}</span><b>Reference {i}</b></div>
              <div className="row2">
                <div className="field"><label>Name</label><Inp k={"ref" + i + "_n"} ph="Their name" label={"Reference " + i + " name"} /></div>
                <div className="field"><label>How they know you</label><Inp k={"ref" + i + "_r"} ph="Former manager at..." label={"Reference " + i + " how they know you"} /></div>
              </div>
              <div className="row2">
                <div className="field"><label>Phone or email</label><Inp k={"ref" + i + "_c"} ph="Best way to reach them" label={"Reference " + i + " phone or email"} /></div>
                <div className="field"><label>Story to point them at</label><Inp k={"ref" + i + "_s"} ph="The scheduling fix, the training..." label={"Reference " + i + " story"} /></div>
              </div>
            </div>
          ))}
        </div>
        <Rec><p>The biggest mistake is listing someone without asking them first. I have called references who had no idea they were a reference, and it is awkward for everyone and it hurts the candidate. Always ask, and always give them a heads up before each call.</p></Rec>
      </div>

      <div className="card">
        <h3 className="sec">How to brief them</h3>
        <p className="sub">A briefed reference is worth three cold ones. Send this before the call happens.</p>
        <Tpl label="Reference heads-up message" text={"Hi [Name], thank you again for being a reference for me. I wanted to give you a heads up that [Company] may reach out this week about a [Role] position.\n\nIf it helps, the things they care most about for this role are [1 or 2 specifics]. If you are comfortable speaking to [a specific thing you did together], that would mean a lot.\n\nI really appreciate you. I will let you know how it goes."} />
        <Band icon="bulb" color="#8EDBC2"><b>Tell each reference what to emphasize.</b> If the job is heavy on organization, remind them of the time you fixed the scheduling mess. You are not scripting them, you are pointing them at your best story.</Band>
      </div>

      <div className="card">
        <Mark icon="scan" label="What they actually get asked" />
        <h3 className="sec">The reference call, from the other side</h3>
        <p className="body">Reference calls are shorter and blunter than people think. I usually ask: how do you know them, what were they like to work with, would you hire them again, and is there anything I should know. <strong>That last question is the one that matters,</strong> and a good reference knows to say &quot;no, hire them.&quot;</p>
        <Chk k="refchk" items={[
          "I asked all three references before listing them",
          "I have their current, correct phone and email",
          "At least one managed me directly",
          "I briefed each one on the role before the call",
          "I told them the exact story I want them to mention",
          "I will thank them after, win or lose",
        ]} />
      </div>

      <div className="card">
        <Mark icon="star" label="Game" />
        <h3 className="sec">Clears or flags?</h3>
        <p className="sub">Six background-check scenarios. Guess which ones will get flagged. Some will surprise you.</p>
        <BgGame />
      </div>

      <div className="card">
        <h3 className="sec">De-risk your background check now</h3>
        <Chk k="bgchk" items={[
          "My job titles match exactly what each employer has on file",
          "My employment dates match my pay stubs, not my memory",
          "I did not list any degree or certification I have not completed",
          "I know what a check will find and nothing on my resume contradicts it",
          "I will not resign my current job until the check clears and the offer is signed",
        ]} />
        <Note kind="mistake" label="The one that ends offers"><p>I saw a post telling people to give two weeks notice the moment they are &quot;in talks.&quot; Please do not. I have watched an offer get pulled after a reference did not check out the way everyone assumed. Until you have signed something and cleared every contingency, you still have a job, and you keep showing up to it.</p></Note>
      </div>
      <FootNav id="refs" />
    </>
  );
}

/* ───── STEP 17 · OFFER NEGOTIATION ───── */
export function Offer() {
  const { S, update, toast } = useApp();
  const [co, setCo] = useState("");
  const [base, setBase] = useState("");
  const [pto, setPto] = useState("");
  const add = () => {
    const c = co.trim();
    if (!c) { toast("Add the company name."); return; }
    update((s) => ({ ...s, offers: [...s.offers, { c, b: base, p: pto }] }));
    setCo(""); setBase(""); setPto("");
  };
  const del = (i: number) => update((s) => ({ ...s, offers: s.offers.filter((_, k) => k !== i) }));
  const best = S.offers.length ? Math.max(...S.offers.map((o) => +o.b || 0)) : 0;
  return (
    <>
      <div className="hero">
        <div className="eyebrow">Step 17 · Offer negotiation</div>
        <h1>Do not leave money on the table.</h1>
        <p>Negotiating is not rude and it is not aggressive. It is expected, and most hiring managers respect it. The ones who do not are telling you something important about the company.</p>
      </div>

      <Bridge why={<>Your references are briefed and your background is clean, so an offer is close. This is the shortest window in the entire process and the one where the most money changes hands, and almost nobody prepares for it the way they prepared for the interview. <strong>Read the first box before you do anything else.</strong> It is the mistake I have watched hurt people most.</>}
        get="researched numbers, three negotiation scripts, and a checklist that protects you before you resign." />

      <div className="card" style={{ border: "2px solid var(--coral)" }}>
        <h3 className="sec" style={{ color: "#B8523C" }}>Read this before you resign from anything</h3>
        <p className="body">I saw a post once telling people to give their two weeks notice as soon as they were &quot;in talks&quot; about an offer. I want to be very clear, because I have watched this exact mistake put someone&apos;s whole life in a bad spot.</p>
        <p className="body"><strong>Do not give notice until your background check, your employment verification, and your references are all fully complete.</strong> Not when you get a verbal. Not when you are in talks. Not when the recruiter tells you it is basically a done deal.</p>
        <p className="body">I have seen offers pulled after all of that, because a reference did not check out the way everyone assumed it would. If you have not signed something and cleared every contingency, you still have a job, and you keep showing up to it.</p>
      </div>

      <div className="card">
        <Mark icon="star" label="My story · what negotiating taught me" />
        <h3 className="sec">I negotiate for other people all day</h3>
        <Squiggle />
        <p className="body">Part of my job is negotiating offers between candidates and clients, and I push offers up by about <strong>$5,500 on average.</strong> I want to tell you how, because it is not charm and it is not nerve.</p>
        <p className="body">It is data. When I go back to a client, I am not saying my candidate wants more. I am saying here is what this role pays in this market, here is what this person brings, and here is what it will cost you to lose them. <strong>That is an argument, not a request,</strong> and it is very hard to say no to.</p>
        <p className="body">You can do exactly the same thing for yourself. The only reason it feels harder is that it is your own name on the line. The script does not change.</p>
        <Band icon="bulb" color="#8EDBC2"><b>Negotiate the way a third party would negotiate for you.</b> Take yourself out of it emotionally and make the case with numbers. That mental trick is most of the skill.</Band>
      </div>

      <div className="card">
        <h3 className="sec">Research before the conversation</h3>
        <p className="body">Walking in without a researched number puts you at a disadvantage in the first sentence. Walking in with data puts you in control. Check Glassdoor, Salary.com, LinkedIn Salary, PayScale, and the Bureau of Labor Statistics. Find the midpoint for your experience level in your city. That is your anchor.</p>
        <div className="field" style={{ maxWidth: 340 }}><label>My researched target range</label><Inp k="salTarget" ph="$55,000 to $65,000" label="My researched target range" /></div>
        <Rec><p>I negotiate salaries up by about $5,500 on average for my candidates, and I do it with market data, not opinions. When you can say &quot;based on my research, this role in this market pays X,&quot; you are not asking for a favor. You are making a case. That is a completely different conversation.</p></Rec>
      </div>

      <div className="card">
        <h3 className="sec">Your scripts</h3>
        <Tpl label="When they ask your salary expectations" text="Based on my research and my experience, I am targeting a range of $[X] to $[Y]. I am excited about this role and I am confident we can land on a number that works for both of us." />
        <Tpl label="When the offer comes in below target" text="Thank you, I am genuinely excited about this opportunity. Based on the market rates I have researched and what I know I will bring to the role, I was hoping we could get closer to $[X]. Is there flexibility there, or are there other parts of the package we could look at together?" />
        <Tpl label="When they will not move on base" text="I understand the base is fixed. Could we look at the other pieces? An earlier performance review, additional PTO, a signing bonus, or a professional development budget for my certification would all make a real difference to me." />
      </div>

      <div className="card">
        <h3 className="sec">Compare your offers</h3>
        <p className="sub">Base salary is not the whole picture. Log what you have and look at it side by side.</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
          <input className="inp" placeholder="Company" aria-label="Company" style={{ flex: 1, minWidth: 120 }} value={co} onChange={(e) => setCo(e.target.value)} />
          <input className="inp" placeholder="Base salary" aria-label="Base salary" type="number" inputMode="numeric" style={{ flex: 1, minWidth: 110 }} value={base} onChange={(e) => setBase(e.target.value)} />
          <input className="inp" placeholder="PTO days" aria-label="PTO days" type="number" inputMode="numeric" style={{ width: 110 }} value={pto} onChange={(e) => setPto(e.target.value)} />
          <button className="btn btn-t" onClick={add}>Add offer</button>
        </div>
        <div>
          {!S.offers.length ? (
            <div className="empty"><div className="ei">💼</div><b>No offers logged</b><p>When they start coming in, put them here so you are comparing the whole package and not just the base.</p></div>
          ) : S.offers.map((o, i) => {
            const top = +o.b === best && best > 0;
            return (
              <div className="trk" key={i} style={top ? { borderColor: "var(--mint)", background: "#EDF9F3" } : undefined}>
                <div className="trk-main"><b>{o.c}{top ? <> <span className="pill mint">Highest base</span></> : null}</b>
                  <span>${Number(o.b || 0).toLocaleString()} base{o.p ? " · " + o.p + " PTO days" : ""}</span></div>
                <button className="del" onClick={() => del(i)} aria-label="Remove">✕</button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card">
        <h3 className="sec">Before you accept</h3>
        <Chk k="accept" items={[
          "I have the full offer in writing, not just a verbal",
          "Background check and references are fully cleared",
          "I know the exact start date and what onboarding looks like",
          "I understand the benefits, when they start, and what they cost me",
          "I asked about the review cycle and when I would be eligible for an increase",
          "I have not given notice at my current job yet",
        ]} />
      </div>
      <FootNav id="offer" />
    </>
  );
}

/* ───── STEP 18 · FIRST 90 DAYS ───── */
export function Ninety() {
  return (
    <>
      <div className="hero">
        <HeroDoodle name="ladder" />
        <div className="eyebrow">Step 18 · Your first 90 days</div>
        <h1>Getting hired is the start, not the finish.</h1>
        <p>What you do in the first three months decides whether you are the person they promote or the person they tolerate.</p>
      </div>

      <Bridge why={<>You got it. Now here is what nobody tells you: <strong>getting hired was the easy part.</strong> The first three months decide whether you become the person they promote or the person they tolerate, and almost nobody plans for them.</>}
        get="a 30, 60, and 90 day plan, and the signals that tell you when to move up or move on." />

      <div className="card">
        <h3 className="sec">Days 1 to 30 · Learn everything</h3>
        <p className="sub">Do not try to fix anything yet. Understand how it actually works first.</p>
        <Chk k="d30" items={[
          "Learn the ATS or HRIS cold. Ask for a walkthrough in week one",
          "Meet every person on the HR team one on one, even briefly",
          "Ask my manager what doing well looks like at 90 days, and write down the answer",
          "Learn the full hiring or employee lifecycle end to end for this company",
          "Keep a running document of every question I have. Ask them in batches",
          "Say yes to everything reasonable. This is when you build your reputation",
        ]} />
      </div>

      <div className="card">
        <h3 className="sec">Days 31 to 60 · Own something</h3>
        <p className="sub">Find the piece nobody wants and take it.</p>
        <Chk k="d60" items={[
          "Take full ownership of one process, even a small one",
          "Start tracking my own numbers. Whatever my role touches, count it",
          "Build one relationship outside of HR, ideally with a hiring manager",
          "Notice one thing that is inefficient and understand why it is that way before suggesting a change",
          "Ask my manager for feedback at the 45 day mark. Do not wait for the review",
        ]} />
        <Note kind="story" label="Dominique's story"><p>When I was brought in to build that function, I did not walk in and start changing things. I spent the first stretch mapping the whole hiring process to find where it was actually stalling, and it was not where everyone assumed. That is the only reason the fix worked. If I had guessed, I would have optimized the wrong step and looked foolish doing it.</p></Note>
      </div>

      <div className="card">
        <h3 className="sec">Days 61 to 90 · Show the impact</h3>
        <p className="sub">Now you can make a case.</p>
        <Chk k="d90" items={[
          "Bring one documented improvement with a number attached to it",
          "Have the conversation about what growth looks like here",
          "Start a brag document. Every win, every number, every thank you note",
          "Ask what I would need to demonstrate to move to the next level",
          "Update my resume and LinkedIn with what I have actually done here",
        ]} />
        <Note kind="action" label="Homework">
          <p style={{ marginBottom: 12 }}>Write your own 30 day goal now, before you even have the job. It makes the interview answer easy when they ask what you would do first.</p>
          <TA k="ninetyNote" ph="In my first 30 days I will..." rows={4} label="Your 30 day goal" />
        </Note>
      </div>
      <div className="card">
        <h3 className="sec">Then: knowing when to move up, or move on</h3>
        <p className="body">Staying somewhere that has stopped investing in you is not loyalty, it is inertia, and the two are easy to confuse. Loyalty is showing up and doing the work. Inertia is staying long after the role stopped doing anything for your career because leaving feels uncertain.</p>
        <p className="body"><strong>The best time to look is before you are desperate to leave.</strong> Make your moves from a position of strength.</p>
        <Chk k="moveon" items={[
          "I have been in the role 18 months or more with no clear path to what is next",
          "My pay is well below market for my role and experience",
          "I have not learned anything meaningfully new in six months",
          "I had a direct conversation about growth and got no concrete commitment",
          "I am operating well below what I am capable of and nothing is changing",
        ]} />
        <Rec><p>When you do go, go clean. Give proper notice and protect your references while you are still there. HR is a far smaller world than it looks, and how you exit becomes part of your reputation. I have had hiring managers call me about a candidate and mention how someone left a job six years ago.</p></Rec>
      </div>
      <FootNav id="ninety" />
    </>
  );
}
