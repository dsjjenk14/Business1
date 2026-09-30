"use client";
import { useEffect } from "react";
import { useApp } from "../AppProvider";
import { Band, Bridge, Chk, FootNav, HeroDoodle, Mark, Note, Rec, TA, Tpl } from "../ui";
import { Doodle, Squiggle } from "../Doodle";
import { BADGES } from "@/lib/journey";
import { firstName } from "@/lib/state";

/* ───── STEP 19 · SURVIVING YOUR FIRST YEAR ───── */
export function FirstYear() {
  return (
    <>
      <div className="hero">
        <HeroDoodle name="ladder" />
        <div className="eyebrow">Step 19 · The first year</div>
        <h1>Getting hired was the easy part.</h1>
        <p>Nobody tells you this, so I will. The first year in a new field is where you either root in and grow, or quietly start to struggle around month seven. Let us make sure it is the first one.</p>
      </div>

      <Bridge why={<>You made it through 90 days. But a career change is not finished at day 90, it is finished around month twelve, when you either belong here or you are quietly wondering if you made a mistake. <strong>This is the part almost no career guide covers,</strong> and it is where a lot of pivots quietly fall apart. So here is what I wish someone had told me.</>}
        get="a real read on the first-year arc, scripts for managing up, and an honest map of the politics." />

      <div className="card">
        <h3 className="sec">The month-seven wall</h3>
        <Squiggle />
        <p className="body">Here is the pattern I have watched over and over. The first three months are exciting. Everyone is patient, everything is new, you are proving yourself. Then around month six or seven, <strong>the honeymoon ends.</strong> You are expected to just know things now. The patience thins. And nobody announces this shift, you just feel it.</p>
        <p className="body">This is not a sign you failed. It is the exact moment the job becomes real, and it happens to everyone, in every field. The people who make it through are the ones who saw it coming and did not take it personally. <strong>Now you have seen it coming.</strong></p>
        <Note kind="story" label="My story"><p>When I built that recruiting function from nothing, month seven was brutal. The novelty was gone and the expectations were real, and I genuinely wondered if I was in over my head. I was not. I just hit the wall everyone hits. I kept showing up, kept tracking what I fixed, and a year later I was training the people we hired next.</p></Note>
      </div>

      <div className="card">
        <h3 className="sec">Managing up, without the jargon</h3>
        <p className="body">Managing up just means making your manager&apos;s job easier and making sure they know what you are doing. It is not politics and it is not sucking up. It is the single highest-return habit in your first year.</p>
        <Tpl label="The weekly update your manager will love" text={"Quick end-of-week note:\n\n1. Done this week: [2 or 3 things, with a number where you can]\n2. In progress: [what is moving]\n3. Need from you: [one clear ask, or \"nothing this week\"]\n\nHave a good weekend."} />
        <Band icon="bulb" color="#8EDBC2"><b>Send that every Friday, unprompted.</b> It takes five minutes and it quietly makes you the person your manager trusts. When review season comes, you have already written the highlights for them.</Band>
      </div>

      <div className="card">
        <h3 className="sec">The politics nobody warns you about</h3>
        <p className="body">You do not have to play games, but you do have to be aware. A few honest truths for your first year:</p>
        <Chk k="politics" items={[
          "Learn who actually has influence, which is not always who has the title",
          "Do not badmouth anyone in your first year. It always gets back",
          "Find the person who has been there longest and be kind to them. They know everything",
          "Keep receipts. Save the thank-you notes and the wins in one place",
          "Say yes early to build reputation, then get selective once you have one",
        ]} />
        <Rec><p>In HR specifically, discretion is your whole reputation. You will learn things about people that you cannot repeat. The person who can hold that is the person who gets promoted. The person who cannot, does not, no matter how good their actual work is.</p></Rec>
      </div>

      <div className="card">
        <h3 className="sec">Your first review</h3>
        <p className="body">Do not walk into your first review empty-handed and hope they noticed your work. <strong>Bring the receipts.</strong> If you sent those Friday updates all year, you already have them. Come with what you did, the numbers, and one clear ask about growth.</p>
        <TA k="fy_wins" ph="My wins so far, with numbers: what I have owned, improved, or fixed since I started..." rows={4} label="Your wins so far" />
        <Band icon="star" color="#8EDBC2"><b>Ask this in your review:</b> &quot;What would I need to demonstrate to move to the next level?&quot; Then write down the answer and go do exactly that. You just turned a vague review into a promotion plan.</Band>
      </div>

      <div className="card">
        <h3 className="sec">First-year milestones</h3>
        <p className="sub">Check these off as you hit them. This is your year.</p>
        <Chk k="fymiles" items={[
          "Made it through the month-seven wall and kept going",
          "Sent weekly updates to my manager consistently",
          "Own at least one process end to end",
          "Built a brag document with real numbers in it",
          "Had the growth conversation and know my next level",
          "Started a certification or set a date to",
          "Became someone a newer person comes to for help",
        ]} />
        <Note kind="reflect" label="Reflection">
          <p style={{ marginBottom: 12 }}>One year from your start date, who do you want to be at this company? Write it now. Come back and read it when you hit the wall.</p>
          <TA k="fy_vision" ph="A year from now I want to be..." rows={3} label="A year from now" />
        </Note>
      </div>
      <FootNav id="firstyear" />
    </>
  );
}

export function BadgeGrid() {
  const { S } = useApp();
  return (
    <div className="badge-grid">
      {BADGES.map((b) => (
        <div key={b.id} className={"badge" + (S.badges[b.id] ? " got" : "")}>
          <div className="bi" aria-hidden="true">{b.i}</div><b>{b.n}</b><span>{b.d}</span>
        </div>
      ))}
    </div>
  );
}

function Built({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#EDF9F3", padding: 20, borderRadius: 14 }}>
      <b style={{ fontFamily: "var(--dsp)", fontSize: 16 }}>{title}</b>
      <p className="body" style={{ marginTop: 7, fontSize: 14 }}>{children}</p>
    </div>
  );
}

/* ───── STEP 20 · CONGRATULATIONS ───── */
export function Grad() {
  const { S, celebrate } = useApp();
  useEffect(() => { const t = setTimeout(celebrate, 350); return () => clearTimeout(t); }, [celebrate]);
  const got = BADGES.filter((b) => S.badges[b.id]).length;
  return (
    <>
      <div className="hero" style={{ textAlign: "center" }}>
        <div style={{ marginBottom: 14 }}><Doodle name="trophy" size={72} color="#8EDBC2" /></div>
        <div className="eyebrow" style={{ justifyContent: "center" }}>Step 20 · You did it</div>
        <h1 style={{ margin: "0 auto", maxWidth: "none" }}>Congratulations, {firstName(S)}.</h1>
        <p style={{ marginLeft: "auto", marginRight: "auto" }}>You did not just read something. You built something.</p>
      </div>

      <div className="card">
        <h3 className="sec">Here is what you actually have now</h3>
        <p className="sub">Nineteen steps ago none of this existed.</p>
        <div className="grid2">
          <Built title="A resume that reads right">Bullets with real numbers, formatted so a parser and a human can both read it.</Built>
          <Built title="A findable LinkedIn">A headline with the words recruiters actually search for.</Built>
          <Built title="A real network">{S.contacts.length} {S.contacts.length === 1 ? "person" : "people"} tracked, with templates for every message.</Built>
          <Built title="Interview answers">Written in your words, with a confidence score on each one.</Built>
          <Built title="Negotiation scripts">And the one warning that protects you from the worst mistake in this whole process.</Built>
          <Built title="A 90 day plan">So you keep the job and grow in it, not just get it.</Built>
        </div>
      </div>

      <div className="card">
        <h3 className="sec">Your badges</h3>
        <p className="sub">{got} of {BADGES.length} unlocked.</p>
        <BadgeGrid />
      </div>

      <div className="card">
        <Note kind="story" label="One last thing from me">
          <p>The only thing I could not do for you is make you deliberate about your own search. That part has to come from you, and if you got this far, you clearly have it.</p>
          <p>You were never unqualified. You were undertranslated. Now go get the job.</p>
        </Note>
      </div>
      <FootNav id="grad" />
    </>
  );
}

/* ───── STEP 21 · NEXT STEPS ───── */
export function Next() {
  const { go } = useApp();
  return (
    <>
      <div className="hero">
        <div className="eyebrow">Step 21 · Next steps</div>
        <h1>Stay in touch. I mean it.</h1>
        <p>I am not disappearing on you the second you finish. If I know someone with a strong work ethic, I will put them in front of people I trust.</p>
      </div>

      <div className="card">
        <Mark icon="people" label="My story · where this goes" />
        <h3 className="sec">The coordinator became the person who built the team</h3>
        <Squiggle />
        <p className="body">I want to close the loop on the story I started at the beginning, because you are standing where I stood.</p>
        <p className="body">I got in as a coordinator because somebody knew me. A few years later I was the founding recruiter building a function from nothing, and then I hired and trained the next three recruiters. <strong>The team went from just me to four.</strong> Nobody who met me answering phones would have predicted that, including me.</p>
        <p className="body">The distance between where you are now and something like that is not talent. It is a few years of showing up, keeping track of what you changed, and staying curious about work you do not understand yet. <strong>That is genuinely the whole formula.</strong></p>
        <Note kind="story" label="One more thing">
          <p>The people who hired me early did not do it because my resume was impressive. They did it because someone vouched for me, or because I clearly wanted it and was willing to prepare harder than the next person.</p>
          <p>Both of those are available to you starting today. Neither requires permission.</p>
        </Note>
      </div>

      <div className="card">
        <h3 className="sec">Your next four weeks</h3>
        <p className="sub">Do not stop now. Momentum is the whole thing.</p>
        <Chk k="after" items={[
          "Week 1: finalize the resume and send it to one person for honest feedback",
          "Week 1: update LinkedIn with the new headline and About section",
          "Week 2: send 10 outreach messages. Expect 3 replies, that is a good week",
          "Week 2: apply to 5 roles you are genuinely a strong fit for",
          "Week 3: have 2 coffee chats and ask each one who else I should talk to",
          "Week 3: get on the radar of 2 staffing agencies",
          "Week 4: practice my 6 interview answers out loud with someone real",
          "Week 4: come back here and check my progress",
        ]} />
      </div>

      <div className="card">
        <h3 className="sec">Keep going after this</h3>
        <Chk k="longer" items={[
          "Look into the aPHR certification. It is the entry level one and it does not require experience",
          "Join SHRM or your local chapter",
          "Set a calendar reminder to update my brag document every month",
          "Revisit the Interview Academy before every single interview",
        ]} />
        <div style={{ marginTop: 22, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn btn-t" onClick={() => go("contact")}>Contact Dominique →</button>
          <button className="btn btn-g" onClick={() => go("dashboard")}>Back to dashboard</button>
        </div>
      </div>
      <FootNav id="next" />
    </>
  );
}
