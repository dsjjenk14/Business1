"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/AppProvider";
import { priceLabel } from "@/config/site";
import { buy } from "@/lib/checkout";

// Phase 2 only. Phase 4 moves codes to the server and makes them one time per buyer.
const ACCESS_CODE = "BLUEPRINT";
const ACCESS_CODE_PREMIUM = "BLUEPRINT-VIP";

export default function Gate() {
  const { ready, S, demo, hasAccess, grantAccess, startDemo, toast, update } = useApp();
  const router = useRouter();
  const [code, setCode] = useState("");

  useEffect(() => {
    if (!ready) return;
    if (demo || S.user) router.replace("/app");
    else if (hasAccess()) router.replace("/signin?tab=up");
  }, [ready, demo, S.user, hasAccess, router]);

  const unlock = () => {
    const c = code.trim().toUpperCase();
    if (!c) { toast("Enter the access code you were given."); document.getElementById("gateCode")?.focus(); return; }
    const tier = c === ACCESS_CODE_PREMIUM ? "premium" : c === ACCESS_CODE ? "basic" : null;
    if (!tier) { toast("That code did not match. Check it and try again."); return; }
    grantAccess(tier);
    if (S.user) { update((s) => ({ ...s, user: { ...s.user!, paid: true, tier } })); router.push("/app"); }
    else { router.push("/signin?tab=up"); setTimeout(() => toast("You are in. Create your account to save your progress."), 400); }
  };

  if (!ready || demo || S.user) return null;

  return (
    <div id="gate">
      <div className="auth-glow" />
      <div className="gate-in">
        <div className="gate-head">
          <div className="brandmark"><div className="bm-dot">HR</div><div className="bm-txt">The HR Blueprint</div></div>
          <div className="gate-eyebrow">By a recruiter who has hired hundreds</div>
          <h1>Stop guessing. <em>Get hired</em> in HR.</h1>
          <p>The full platform that walks you from wherever you are now into a real HR, recruiting, or talent acquisition job. Built by someone who makes the hiring call, not a career blog.</p>
        </div>

        <div className="tiers">
          <div className="tier">
            <h3>The Blueprint</h3>
            <div className="tprice">{priceLabel("basic")}</div>
            <div className="tsub">One time. Yours for good. Everything you need to do this yourself.</div>
            <ul>
              <li><span className="ck">✓</span> All 21 steps, start to hired</li>
              <li><span className="ck">✓</span> Resume, cover letter &amp; LinkedIn labs</li>
              <li><span className="ck">✓</span> Interview &amp; phone screen academies</li>
              <li><span className="ck">✓</span> Your dated 90-day search plan</li>
              <li><span className="ck">✓</span> Every tracker, template &amp; game</li>
              <li className="lock"><span className="ck">✕</span> No 1:1 time with me</li>
            </ul>
            <button className="btn btn-g btn-full" onClick={() => buy("basic", toast)}>Get instant access</button>
          </div>

          <div className="tier feat">
            <div className="tier-flag">Most support · limited spots</div>
            <h3>Blueprint + 90 Days With Me</h3>
            <div className="tprice">{priceLabel("premium")}</div>
            <div className="tsub">Everything above, plus me in your corner for 90 days until you land it.</div>
            <ul>
              <li><span className="ck">✓</span> The complete Blueprint platform</li>
              <li><span className="ck">✓</span> A private kickoff call to build your plan</li>
              <li><span className="ck">✓</span> Personal resume &amp; LinkedIn review from me</li>
              <li><span className="ck">✓</span> Two live mock interviews with feedback</li>
              <li><span className="ck">✓</span> Direct message access for 90 days</li>
              <li><span className="ck">✓</span> Warm introductions where I can make them</li>
            </ul>
            <button className="btn btn-t btn-full" onClick={() => buy("premium", toast)}>Work with me →</button>
          </div>
        </div>

        <div className="trust">🔒 Secure checkout · powered by your card processor, not this page</div>

        <div className="gate-foot">
          <button onClick={startDemo}>Take a free look inside</button>
          <span className="sep">·</span>
          <button onClick={() => router.push("/signin")}>I already have an account</button>
          <div className="code-row">
            <input className="inp" id="gateCode" placeholder="Paid already? Enter your access code" aria-label="Access code"
              value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") unlock(); }} />
            <button className="btn btn-p btn-sm" onClick={unlock}>Unlock</button>
          </div>
        </div>
      </div>
    </div>
  );
}
