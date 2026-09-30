"use client";
import { useEffect, useState } from "react";
import { useApp } from "@/components/AppProvider";

const INDUSTRIES = ["Retail", "Hospitality", "Healthcare", "Customer service or call center", "Banking or finance",
  "Education", "Military", "Administration", "Operations or logistics", "Something else"];
const DREAMS = ["Recruiting Coordinator", "Recruiter", "Agency Recruiter", "Technical Recruiter", "HR Assistant",
  "HR Coordinator", "HR Generalist", "HR Business Partner", "Still figuring it out"];

export default function SignIn() {
  const { signUp, signIn, startDemo, toast } = useApp();
  const [tab, setTab] = useState<"in" | "up">("in");
  const [f, setF] = useState({ liEmail: "", liPass: "", suName: "", suEmail: "", suPass: "", suIndustry: "", suDream: "", suGoal: "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const focus = (id: string) => document.getElementById(id)?.focus();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read ?tab= once on mount
    if (new URLSearchParams(location.search).get("tab") === "up") setTab("up");
  }, []);

  const doSignIn = (e?: React.FormEvent) => {
    e?.preventDefault();
    const email = f.liEmail.trim();
    if (!email || email.indexOf("@") < 0) { toast("Enter the email you signed up with."); focus("liEmail"); return; }
    if (!f.liPass) { toast("Enter your password."); focus("liPass"); return; }
    if (!signIn(email)) { toast("No account found in this browser yet. Create one to get started."); setTab("up"); }
  };

  const doSignUp = () => {
    const name = f.suName.trim(), email = f.suEmail.trim(), pass = f.suPass;
    if (!name) { toast("Add your name so I know who I am talking to."); focus("suName"); return; }
    if (!email || email.indexOf("@") < 0) { toast("Enter a valid email address."); focus("suEmail"); return; }
    if (!pass || pass.length < 6) { toast("Password needs at least 6 characters."); focus("suPass"); return; }
    signUp({
      name, email, industry: f.suIndustry || "Another field",
      dream: f.suDream || "Still figuring it out", goal: f.suGoal.trim() || "Land my first role in HR",
    });
  };

  return (
    <div id="auth">
      <div className="auth-glow" />
      <div className="auth-left">
        <div className="brandmark"><div className="bm-dot">HR</div><div className="bm-txt">The HR Blueprint</div></div>
        <div className="auth-eyebrow">Built by a recruiter, for you</div>
        <h1 className="auth-h1">Let&apos;s build your <em>dream career</em> in HR.</h1>
        <p className="auth-sub">I&apos;ve spent eight years on the hiring side, across several very different industries. I know exactly what gets someone hired, because I&apos;m the one making the call. This is everything I&apos;d tell you if we were sitting across from each other.</p>
        <div className="auth-stats">
          <div className="astat"><b>8</b><span>Years in talent acquisition</span></div>
          <div className="astat"><b>50</b><span>Hires in 2.5 years</span></div>
          <div className="astat"><b>~90%</b><span>Offer acceptance rate</span></div>
          <div className="astat"><b>90→55</b><span>Days to fill, rebuilt</span></div>
        </div>
        <div className="auth-foot">Dominique Jenkins · 8 years in talent acquisition · hiredominique.com</div>
      </div>

      <div className="auth-right">
        <div className="auth-card">
          <div className="auth-tabs" role="tablist">
            <button className={"auth-tab" + (tab === "in" ? " on" : "")} role="tab" aria-selected={tab === "in"} onClick={() => setTab("in")}>Sign in</button>
            <button className={"auth-tab" + (tab === "up" ? " on" : "")} role="tab" aria-selected={tab === "up"} onClick={() => setTab("up")}>Create account</button>
          </div>

          {tab === "in" ? (
            <form onSubmit={doSignIn} noValidate>
              <h2>Welcome back</h2>
              <p className="lede">Pick up right where you left off.</p>
              <div className="field"><label htmlFor="liEmail">Email</label>
                <input className="inp" id="liEmail" type="email" placeholder="you@email.com" autoComplete="email" value={f.liEmail} onChange={set("liEmail")} /></div>
              <div className="field"><label htmlFor="liPass">Password</label>
                <input className="inp" id="liPass" type="password" placeholder="••••••••" autoComplete="current-password" value={f.liPass} onChange={set("liPass")} /></div>
              <div className="checkrow">
                <label className="cbx"><input type="checkbox" defaultChecked /> Remember me</label>
                <button type="button" className="link" onClick={() => toast("Password reset would be wired to your email service once this is live on your site.")}>Forgot password?</button>
              </div>
              <button type="submit" className="btn btn-p btn-full">Continue</button>
              <p style={{ textAlign: "center", fontSize: 13, color: "var(--slate)", marginTop: 18 }}>
                New here? <button type="button" className="link" onClick={() => setTab("up")}>Create your account</button></p>
            </form>
          ) : (
            <div>
              <h2>Start your pivot</h2>
              <p className="lede">Three questions so I can tailor this to you.</p>
              <div className="field"><label htmlFor="suName">Your name</label>
                <input className="inp" id="suName" placeholder="First and last" autoComplete="name" value={f.suName} onChange={set("suName")} /></div>
              <div className="row2">
                <div className="field"><label htmlFor="suEmail">Email</label>
                  <input className="inp" id="suEmail" type="email" placeholder="you@email.com" autoComplete="email" value={f.suEmail} onChange={set("suEmail")} /></div>
                <div className="field"><label htmlFor="suPass">Password</label>
                  <input className="inp" id="suPass" type="password" placeholder="••••••••" autoComplete="new-password" value={f.suPass} onChange={set("suPass")} /></div>
              </div>
              <div className="field"><label htmlFor="suIndustry">What are you coming from?</label>
                <select className="inp" id="suIndustry" value={f.suIndustry} onChange={set("suIndustry")}>
                  <option value="">Choose your current field</option>
                  {INDUSTRIES.map((o) => <option key={o}>{o}</option>)}
                </select></div>
              <div className="field"><label htmlFor="suDream">What&apos;s the dream role?</label>
                <select className="inp" id="suDream" value={f.suDream} onChange={set("suDream")}>
                  <option value="">Choose your target</option>
                  {DREAMS.map((o) => <option key={o}>{o}</option>)}
                </select></div>
              <div className="field"><label htmlFor="suGoal">Your goal, in one sentence</label>
                <input className="inp" id="suGoal" placeholder="Land my first HR role within 6 months" value={f.suGoal} onChange={set("suGoal")} /></div>
              <button className="btn btn-t btn-full" style={{ marginTop: 8 }} onClick={doSignUp}>Create account</button>
              <p style={{ fontSize: 11.5, color: "var(--slate-2)", textAlign: "center", marginTop: 14, lineHeight: 1.5 }}>
                Everything you enter saves to this browser only. Nothing is sent anywhere.</p>
            </div>
          )}

          <div className="skip-wrap">
            <button className="skip-btn" onClick={startDemo}>Skip sign in and explore the beta →</button>
            <p>Opens a preview with example data filled in. Act 1 is open to explore. Nothing you do in the beta touches a real account.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
