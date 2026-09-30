/** Beta preview data. Copied from the prototype's demoState(). */
import { blank, type AppState } from "./state";

export function demoState(): AppState {
  const d = blank();
  d.user = {
    name: "Jordan Ellis", email: "jordan@example.com", industry: "Retail",
    dream: "HR Coordinator", goal: "Land my first HR role within 6 months", paid: true, tier: "premium",
  };
  d.done = { welcome: 1, story: 1, isright: 1, assess: 1, skills: 1, resume: 1, linkedin: 1, network: 1 };
  d.quiz = "both";
  d.streak = { n: 6, last: new Date().toDateString() };
  d.txt = {
    reflect1: "Because I have been good at this work for years and nobody has ever called it a career. I want a job with a path in it.",
    reflect2: "Running the front end at the store. I trained every new hire we brought in and nobody ever wrote that down anywhere.",
    rb1: "Managed daily operations for a 14 person team across two locations, holding full shift coverage for 18 straight months.",
    rb2: "Onboarded and trained 22 new hires and built the training checklist the store still uses today.",
    rb3: "Resolved 60+ customer escalations weekly and held the highest satisfaction score in the district for four quarters.",
    skillNote: "Weak version: Handled customer complaints.\n\nStrong version: Resolved 60+ escalations weekly with a focus on retention, holding the top satisfaction score in a 12 store district.",
    hdA: "Aspiring HR Coordinator", hdB: "People operations and onboarding",
    hdC: "7 years in retail leadership, 22 hires trained",
    liHead: "Aspiring HR Coordinator · People operations and onboarding · 7 years in retail leadership, 22 hires trained",
    liAbout: "I spent seven years in retail, most recently running a 14 person team across two locations. The part I have always been best at is the people side: hiring, training, and keeping everyone steady when it gets busy.\n\nI am now focused on moving into an HR Coordinator role, and I am working toward my aPHR.",
    rName: "Jordan Ellis", rCity: "Columbus, OH", rPhone: "(614) 555-0182", rEmail: "jordan@example.com",
    rLink: "linkedin.com/in/jordanellis", rTitle: "Store Team Lead", rCompany: "Regional Retail Group",
    rDates: "March 2021 to June 2025",
    rSummary: "Retail leadership professional with 7 years of experience moving into HR. Background in hiring, onboarding, and high volume people management. Known for training teams that stay.",
    rSkills: "Onboarding Support, Candidate Coordination, Scheduling, Employee Relations Support, Records Management",
    rEdu: "BA Communications | Ohio State University | 2018", rCert: "aPHR (in progress)",
    salTarget: "$52,000 to $60,000",
    ninetyNote: "Learn the HRIS cold in week one and ask my manager what doing well looks like at 90 days.",
    iv_q1: "I have spent seven years in retail, most recently leading a team of 14 across two locations. The part I have always done best is the people side: hiring, training, and keeping everyone steady when it gets busy. I have been building toward HR on purpose and a coordinator role is exactly where I want to put that experience to work.",
    iv_q2: "The work I have always done best involves people. I have been moving toward HR deliberately, talking to people in the field and starting my aPHR. I am not leaving my background behind, I am bringing all of it with me.",
    iv_q3: "A customer was furious about a second wrong order. I let them finish, repeated back what went wrong, told them exactly what I could do and by when, then followed up the next day. They came back and asked for me by name.",
    iv_q4: "I entered the wrong availability on a schedule and it left us short on a Saturday. I owned it, fixed it, told the team it affected, and then built a template so it could not happen the same way again.",
    iv_q5: "I use our scheduling and POS system daily for reporting. I have not worked in Workday directly, but I picked up our current system fast and I would be up to speed within a couple of weeks.",
    iv_q6: "Because I already do a version of this work. I keep a lot moving at once, I handle people when they are frustrated, and I follow through. I would come in and help without needing a lot of hand holding.",
    conf_q1: "4", conf_q2: "4", conf_q3: "5", conf_q4: "3", conf_q5: "3", conf_q6: "4",
  };
  ["commit_0", "commit_1", "commit_2", "commit_3", "commit_4", "gut_0", "gut_1", "gut_2", "gut_4",
    "skill_0", "skill_1", "skill_2", "skill_4", "skill_6", "skill_7", "resume_0", "resume_1", "resume_2",
    "resume_3", "resume_4", "li_0", "li_2", "li_3", "li_4", "li_6", "netwhere_0", "netwhere_2",
    "applyhow_0", "applyhow_1", "applyhow_2", "ivprep_0", "ivprep_1", "ivprep_3", "coffee_0", "coffee_4",
    "firstjob_0", "firstjob_1", "d30_0", "d30_2"].forEach((k) => { d.chk[k] = true; });
  d.contacts = [
    { n: "Maria Lopez", c: "Recruiter, Cardinal Health", s: 3 },
    { n: "Andre Bell", c: "HR Manager, Aramark", s: 2 },
    { n: "Tasha Kim", c: "Beacon Hill Staffing", s: 1 },
    { n: "Chris Odom", c: "TA Lead, Nationwide", s: 1 },
    { n: "Priya Raman", c: "HR Coordinator, Marriott", s: 0 },
    { n: "Devon Walsh", c: "SHRM chapter contact", s: 0 },
  ];
  d.apps = [
    { c: "Nationwide", r: "HR Coordinator", s: 1, d: "Jul 18" },
    { c: "Cardinal Health", r: "Recruiting Coordinator", s: 1, d: "Jul 16" },
    { c: "Aramark", r: "HR Assistant", s: 2, d: "Jul 14" },
    { c: "Beacon Hill", r: "Agency Recruiter", s: 0, d: "Jul 11" },
    { c: "Marriott", r: "HR Coordinator", s: 3, d: "Jul 08" },
    { c: "OhioHealth", r: "HR Generalist", s: 0, d: "Jul 07" },
  ];
  d.offers = [
    { c: "Aramark", b: "54000", p: "15" },
    { c: "Marriott", b: "49500", p: "20" },
  ];
  Object.assign(d.txt, {
    sb1_t: "The angry customer", sb1_s: "A customer was furious about a second wrong order in one week.",
    sb1_d: "I let them finish, repeated back what went wrong, told them exactly what I could do and by when, then followed up the next day.",
    sb1_r: "They came back and asked for me by name. We kept the account.",
    sb1_l: "Once people know you are actually handling it, most of the heat comes out of the room.",
    sb1_g: "They asked what I would have done if I could not fix it. I said I would have told them that honestly and early rather than let them find out.",
    jobN: 2,
    j1_title: "Store Team Lead", j1_co: "Regional Retail Group", j1_d: "March 2021 to June 2025",
    j1_b1: "Managed daily operations for a 14 person team across two locations, holding full shift coverage for 18 straight months.",
    j1_b2: "Onboarded and trained 22 new hires and built the training checklist the store still uses today.",
    j1_b3: "Resolved 60+ customer escalations weekly and held the highest satisfaction score in the district for four quarters.",
    j2_title: "Shift Supervisor", j2_co: "Regional Retail Group", j2_d: "June 2018 to March 2021",
    j2_b1: "Scheduled and supervised a team of 9 across nights and weekends with no coverage gaps.",
    j2_b2: "Cut register discrepancies to zero over 14 months by rebuilding the cash handling checklist.",
    cl_co: "Nationwide", cl_role: "HR Coordinator",
    cl_hook: "Seven years running a retail team taught me hiring, onboarding, and how to keep good people from quitting.",
    cl_proof: "I trained 22 new hires and built the onboarding checklist my store still uses, which cut ramp time for new staff by about half.",
    cl_why: "Your careers page talks about promoting from within, and that is exactly the kind of people team I want to learn under.",
    cl_pivot: "I am moving into HR deliberately, not accidentally. The work I have always done best is the people part, and I have been building toward this by talking to HR professionals, starting my aPHR, and learning how hiring actually works from the inside.",
    planStart: new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10),
    decodeTerms: "People Partner, Talent Partner, Recruiting Coordinator, People Ops Coordinator, HR Coordinator",
    sc_posted: "$52,000 to $68,000", sc_target: "$56,000 to $64,000",
    ref1_n: "Andre Bell", ref1_r: "My store manager for 3 years", ref1_c: "andre.b@email.com", ref1_s: "The holiday scheduling turnaround",
    ref2_n: "Maria Lopez", ref2_r: "District trainer, worked closely", ref2_c: "(614) 555-0148", ref2_s: "Training the 22 new hires",
    fy_wins: "Owned onboarding for the region, cut new-hire ramp time roughly in half, became the person the newer coordinators ask for help.",
    iv_close: "I want this job. The strongest reason I would be good at it is that I have already been doing a version of this work for seven years, just without the HR title. What does the next step look like?",
  });
  ["plan_w0_0", "plan_w0_1", "plan_w0_2", "plan_w0_3", "plan_w1_0", "plan_w1_1", "plan_w1_2", "plan_w2_0"].forEach((k) => { d.chk[k] = true; });
  d.badges = { started: true, known: true, built: true, visible: true, social: true, hunter: true, ready: true, eye: true };
  return d;
}
