"use client";
import { useApp } from "../AppProvider";
import { BETA_OPEN_ACTS } from "@/config/site";
import { STEPS, type ViewId } from "@/lib/journey";
import { Assess, Decoder, IsRight, Story, Welcome } from "./act1";
import { Cover, LinkedIn, Psych, Resume, Skills } from "./act2";
import { Apply, Network, Plan } from "./act3";
import { Interview, Ninety, Offer, Phone, Refs } from "./act4";
import { FirstYear, Grad, Next } from "./act5";
import { BetaLock, Contact, Dashboard, Premium } from "./other";

const VIEWS: Record<ViewId, () => React.ReactNode> = {
  dashboard: Dashboard, premium: Premium, contact: Contact,
  welcome: Welcome, story: Story, isright: IsRight, decoder: Decoder, assess: Assess,
  psych: Psych, skills: Skills, resume: Resume, cover: Cover, linkedin: LinkedIn,
  plan: Plan, network: Network, apply: Apply,
  phone: Phone, interview: Interview, refs: Refs, offer: Offer, ninety: Ninety,
  firstyear: FirstYear, grad: Grad, next: Next,
};

/** Beta preview only opens the dashboard, Act 1 and contact. */
function lockedInBeta(id: ViewId): boolean {
  if (id === "dashboard" || id === "contact") return false;
  if (id === "premium") return true;
  const s = STEPS.find((x) => x.id === id);
  return !!s && !BETA_OPEN_ACTS.includes(s.part);
}

export function ViewSwitch({ id }: { id: ViewId }) {
  const { demo } = useApp();
  if (demo && lockedInBeta(id)) return <BetaLock />;
  const V = VIEWS[id];
  return <V />;
}
