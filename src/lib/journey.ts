export type StepId =
  | "welcome" | "story" | "isright" | "decoder" | "assess"
  | "psych" | "skills" | "resume" | "cover" | "linkedin"
  | "plan" | "network" | "apply"
  | "phone" | "interview" | "refs" | "offer" | "ninety"
  | "firstyear" | "grad" | "next";

export type ViewId = StepId | "dashboard" | "premium" | "contact";

export interface Step {
  id: StepId;
  part: string;
  nav: string;
  eyebrow: string;
  title: string;
}

export const STEPS: Step[] = [
  { id: "welcome", part: "Act 1 · Decide", nav: "Welcome", eyebrow: "Step 1", title: "Welcome" },
  { id: "story", part: "Act 1 · Decide", nav: "How I Got In", eyebrow: "Step 2", title: "How I Got In" },
  { id: "isright", part: "Act 1 · Decide", nav: "Is HR Right For You?", eyebrow: "Step 3", title: "Is HR Right For You?" },
  { id: "decoder", part: "Act 1 · Decide", nav: "Title & Industry Decoder", eyebrow: "Step 4", title: "Title & Industry Decoder" },
  { id: "assess", part: "Act 1 · Decide", nav: "Career Assessment", eyebrow: "Step 5", title: "Career Assessment" },
  { id: "psych", part: "Act 2 · Prepare", nav: "How Recruiters Think", eyebrow: "Step 6", title: "How Recruiters Think" },
  { id: "skills", part: "Act 2 · Prepare", nav: "Transferable Skills", eyebrow: "Step 7", title: "Transferable Skills" },
  { id: "resume", part: "Act 2 · Prepare", nav: "Resume Lab", eyebrow: "Step 8", title: "Resume Lab" },
  { id: "cover", part: "Act 2 · Prepare", nav: "Cover Letter Lab", eyebrow: "Step 9", title: "Cover Letter Lab" },
  { id: "linkedin", part: "Act 2 · Prepare", nav: "LinkedIn Lab", eyebrow: "Step 10", title: "LinkedIn Lab" },
  { id: "plan", part: "Act 3 · Hunt", nav: "90-Day Search Plan", eyebrow: "Step 11", title: "Your 90-Day Search Plan" },
  { id: "network", part: "Act 3 · Hunt", nav: "Networking Hub", eyebrow: "Step 12", title: "Networking Hub" },
  { id: "apply", part: "Act 3 · Hunt", nav: "Application Strategy", eyebrow: "Step 13", title: "Application Strategy" },
  { id: "phone", part: "Act 4 · Land", nav: "Phone Screen Lab", eyebrow: "Step 14", title: "Phone Screen Lab" },
  { id: "interview", part: "Act 4 · Land", nav: "Interview Academy", eyebrow: "Step 15", title: "Interview Academy" },
  { id: "refs", part: "Act 4 · Land", nav: "References & Background", eyebrow: "Step 16", title: "References & Background Check" },
  { id: "offer", part: "Act 4 · Land", nav: "Offer Negotiation", eyebrow: "Step 17", title: "Offer Negotiation" },
  { id: "ninety", part: "Act 4 · Land", nav: "Your First 90 Days", eyebrow: "Step 18", title: "Your First 90 Days" },
  { id: "firstyear", part: "Act 5 · Grow", nav: "Surviving Year One", eyebrow: "Step 19", title: "Surviving Your First Year" },
  { id: "grad", part: "Act 5 · Grow", nav: "Congratulations", eyebrow: "Step 20", title: "Congratulations" },
  { id: "next", part: "Act 5 · Grow", nav: "Next Steps", eyebrow: "Step 21", title: "Next Steps" },
];

export const VIEW_IDS: ViewId[] = ["dashboard", "premium", "contact", ...STEPS.map((s) => s.id)];

export function viewMeta(id: ViewId): { eyebrow: string; title: string } {
  if (id === "dashboard") return { eyebrow: "Dashboard", title: "Home base" };
  if (id === "premium") return { eyebrow: "Premium", title: "Work With Me" };
  if (id === "contact") return { eyebrow: "Always open", title: "Contact Dominique" };
  return STEPS.find((s) => s.id === id)!;
}

export function stepIndex(id: string): number {
  return STEPS.findIndex((s) => s.id === id);
}

export interface Badge { id: string; i: string; n: string; d: string }

export const BADGES: Badge[] = [
  { id: "started", i: "🚀", n: "First Step", d: "You showed up" },
  { id: "known", i: "🧭", n: "Self Aware", d: "Finished the assessment" },
  { id: "built", i: "📄", n: "Resume Ready", d: "Built your bullets" },
  { id: "visible", i: "💼", n: "Findable", d: "LinkedIn optimized" },
  { id: "social", i: "🤝", n: "Connector", d: "5 people tracked" },
  { id: "hunter", i: "🎯", n: "In The Game", d: "5 applications logged" },
  { id: "ready", i: "🎤", n: "Interview Ready", d: "5 answers drafted" },
  { id: "eye", i: "👁️", n: "Recruiter Eye", d: "Beat the bullet game" },
  { id: "decoder", i: "🔎", n: "Decoder", d: "Learned the title map" },
  { id: "planner", i: "🗓️", n: "Planned", d: "Set your search dates" },
  { id: "screener", i: "☎️", n: "Screen Ready", d: "Beat the phone screen game" },
  { id: "vouched", i: "🛡️", n: "Vouched For", d: "Lined up your references" },
  { id: "rooted", i: "🌳", n: "Rooted", d: "Planned your first year" },
  { id: "grad", i: "🎓", n: "Graduate", d: "Completed the journey" },
];

/** Stage labels for the trackers. */
export const NSTAGES = ["To reach out", "Message sent", "Call booked", "Followed up"];
export const ASTAGES = ["Applied", "Interviewing", "Offer", "Closed"];
