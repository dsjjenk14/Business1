/** Data tables from the prototype, word for word. */

export const QZ: { q: string; a: [string, string][] }[] = [
  { q: "What sounds more like a good day at work?",
    a: [["Talking to fifteen new people and moving deals forward", "ta"], ["Solving one complicated situation really well", "gen"],
      ["A mix, as long as I am not doing the same thing all day", "both"], ["Getting through a clean list of tasks with nothing dropped", "ops"]] },
  { q: "How do you feel about being measured on a number every week?",
    a: [["Bring it on, I want the scoreboard", "ta"], ["I would rather be judged on quality than quantity", "gen"],
      ["Fine with it if the target is fair", "both"], ["I prefer accuracy targets over volume targets", "ops"]] },
  { q: "Someone comes to you upset about a coworker. Your instinct?",
    a: [["Listen, then get them to the right person fast", "ta"], ["Dig in, ask questions, help them work it out", "gen"],
      ["Depends entirely on the situation", "both"], ["Document it properly and follow the process", "ops"]] },
  { q: "Which would you rather be known for?",
    a: [["Being the person who always closes", "ta"], ["Being the person everyone trusts", "gen"],
      ["Being the person who can do a bit of everything", "both"], ["Being the person who never lets anything slip", "ops"]] },
  { q: "What are you best at right now?",
    a: [["Building rapport with strangers quickly", "ta"], ["Handling sensitive or difficult conversations", "gen"],
      ["Adapting to whatever the day throws at me", "both"], ["Keeping records, systems, and details straight", "ops"]] },
  { q: "Which pressure would bother you less?",
    a: [["A monthly target I have to hit", "ta"], ["Carrying confidential information I cannot discuss", "gen"],
      ["Honestly, neither would break me", "both"], ["A compliance audit of my work", "ops"]] },
];

export const QZR = {
  ta: { path: "Talent Acquisition", role: "Agency Recruiter or Recruiting Coordinator",
    d: "You are built for momentum and accountability. Recruiting will give you a scoreboard and a fast feedback loop, and agency work especially will teach you sourcing, pipeline management, and negotiation faster than any other entry point. This is the door I went through.",
    next: "Target agency recruiter and recruiting coordinator roles. Firms like Robert Half, Beacon Hill, Aerotek, Insight Global, and Randstad hire recruiters constantly and care more about drive than credentials." },
  gen: { path: "HR Generalist", role: "HR Coordinator or HR Assistant",
    d: "You lean toward the human and organizational side. The generalist track rewards judgment, discretion, and steadiness, and it leads to HR Business Partner, HR Manager, and eventually director level work. It is a steadier climb, but do not mistake steady for easy.",
    next: "Target HR Coordinator and HR Assistant roles at companies with a real HR department. Look into the aPHR certification while you are applying. It signals you are serious." },
  both: { path: "Either path, start broad", role: "HR Coordinator",
    d: "You have not committed yet, and that is genuinely fine this early. The smart move is a role that touches both sides so you can find out from the inside instead of guessing from the outside.",
    next: "Target HR Coordinator roles specifically. They blend recruiting support with benefits and employee relations, which means you get to sample both careers before you commit to one." },
  ops: { path: "People Operations", role: "HR Assistant or HR Operations Coordinator",
    d: "You are precise and process minded, and that is worth more in HR than people admit. Payroll, HRIS, compliance, and records are where careful people become indispensable fast, because the cost of getting them wrong is enormous.",
    next: "Target HR Assistant, HR Operations, and HRIS Coordinator roles. Get comfortable naming specific systems like Workday, ADP, or BambooHR. That fluency alone separates you from most applicants." },
};

export const DECODE_MAP = [
  { base: "HR Generalist", tech: "People Partner, People Ops Generalist", law: "HR Generalist, Human Resources Coordinator", gov: "Human Resources Specialist (GS-0201)", health: "HR Business Partner, Employee Relations Specialist", startup: "People Ops Manager, First HR Hire" },
  { base: "Recruiter", tech: "Talent Partner, Technical Recruiter", law: "Legal Recruiting Coordinator, Recruiting Specialist", gov: "Human Resources Specialist (Recruitment & Placement)", health: "Talent Acquisition Partner, Nurse Recruiter", startup: "Founding Recruiter, Talent Lead" },
  { base: "Recruiting Coordinator", tech: "Recruiting Coordinator, TA Coordinator", law: "Legal Recruiting Assistant, Recruiting Coordinator", gov: "HR Assistant (OA)", health: "Talent Acquisition Coordinator", startup: "Recruiting Ops, People Coordinator" },
  { base: "HR Manager", tech: "People Manager, Head of People (small co)", law: "HR Manager, Director of Administration", gov: "Supervisory HR Specialist", health: "HR Manager, Employee Relations Manager", startup: "Head of People, People Lead" },
  { base: "HR Business Partner", tech: "People Partner, HRBP", law: "HR Business Partner, Practice Group HR Lead", gov: "Human Resources Officer", health: "HRBP, HR Consultant", startup: "People Partner" },
];

export const IND_OPEN = [
  { ind: "Staffing & agencies", open: "g", note: "The most open door in the field. They hire for drive over pedigree, and a temp role converts to permanent all the time." },
  { ind: "Startups & small companies", open: "g", note: "Often need their first HR hire and cannot be picky about background. If you can wear many hats, they will take a chance on you." },
  { ind: "Retail, hospitality, high-volume", open: "g", note: "Constant hiring, constant turnover, and they value people who have actually worked the floor. Your operations background is an asset here." },
  { ind: "Tech", open: "y", note: "Open to non-traditional paths, but you must speak their language. Search \"People Ops\" and \"Talent Partner,\" not \"HR Generalist,\" or you will never see the roles." },
  { ind: "Healthcare", open: "y", note: "Huge and always hiring, but often wants some HR exposure or a certification first. A coordinator role is your way in." },
  { ind: "Professional services & law firms", open: "y", note: "Values polish, discretion, and stability. They hire heavily through staffing agencies for support roles, which is your side door." },
  { ind: "Government & federal", open: "r", note: "The most credential-driven and the slowest. USAJOBS is its own skill, and the process can take months. Worth it for stability, but not the fast door." },
];

export interface ChoiceQ { q: string; a: [string, "right" | "wrong"][]; e: string }

export const DECODE_QZ: ChoiceQ[] = [
  { q: "A tech company is hiring a \"People Partner.\" In plain terms, what is that?", a: [["An HR Generalist or HRBP", "right"], ["A recruiter only", "wrong"], ["An office manager", "wrong"], ["A payroll clerk", "wrong"]], e: "People Partner is what most tech companies call an HR Generalist or Business Partner. If you only search \"HR,\" you miss every one of these roles." },
  { q: "You want recruiting roles in government. What do you actually search on USAJOBS?", a: [["Human Resources Specialist", "right"], ["Recruiter", "wrong"], ["Talent Partner", "wrong"], ["People Ops", "wrong"]], e: "Government wraps almost everything into \"Human Resources Specialist\" with a parenthetical. \"Recruiter\" barely returns federal results." },
  { q: "Which of these is usually the FASTEST door in for a career changer?", a: [["A staffing agency", "right"], ["A federal agency", "wrong"], ["A large law firm, direct", "wrong"], ["A FAANG tech company", "wrong"]], e: "Staffing agencies hire for hustle and convert temp to permanent constantly. It is the door I walked through, and the one most people overlook." },
  { q: "A startup posts \"Founding Recruiter, wear many hats.\" Good or bad sign for a career changer?", a: [["Good, they cannot be picky and value range", "right"], ["Bad, they only want experts", "wrong"], ["Bad, it is a scam", "wrong"], ["Neutral", "wrong"]], e: "\"Wear many hats\" usually means they need someone capable and adaptable more than someone credentialed. That is often you." },
  { q: "In healthcare, what should you probably get while applying?", a: [["A certification like aPHR", "right"], ["A law degree", "wrong"], ["Nothing, they do not care", "wrong"], ["A nursing license", "wrong"]], e: "Healthcare tends to want some proof you are serious. An aPHR while you apply signals commitment and helps you clear the first screen." },
];

export const SCREEN_QS = [
  { q: "Walk me through your background.", good: "Ninety seconds, not five minutes. Where you are now, the thread that connects it to this role, and why you are excited. The screen is not the interview. Keep it tight." },
  { q: "What interests you about this role?", good: "Name something specific about the company or the role, not \"I am looking for growth.\" Generic here reads as mass-applying, and I move on." },
  { q: "What are your salary expectations?", good: "This is the real reason for the call. Give a researched range, not a number, and make it a range you would actually accept. More on this below." },
  { q: "Are you interviewing anywhere else?", good: "A light yes is good. It signals you are in demand. \"I have a couple of processes going\" is plenty. Do not name companies or oversell." },
  { q: "When could you start?", good: "Standard two weeks if employed. Do not say \"immediately\" if you have a job, it makes me wonder how you will leave us." },
];

export const SCREEN_GAME: ChoiceQ[] = [
  { q: "\"What are your salary expectations?\" Best answer on a screen?", a: [["Based on my research the range for this role is 55 to 65, and I am comfortable there", "right"], ["Whatever you think is fair", "wrong"], ["I would need at least 80 to consider it", "wrong"], ["I do not really care about money", "wrong"]], e: "A researched range keeps you in the running and shows you did homework. \"Whatever is fair\" gives away your leverage. A wild number ends the call." },
  { q: "Recruiter asks why you are leaving your current job. Best move?", a: [["Keep it neutral and forward looking", "right"], ["Explain in detail how bad your boss is", "wrong"], ["Say you are being underpaid and disrespected", "wrong"], ["Say you are bored", "wrong"]], e: "Anything negative about a current employer makes me wonder what you will say about us. Neutral and forward looking, every time." },
  { q: "The screen is scheduled for 15 minutes. You should plan to talk for about?", a: [["Half the time, and listen the other half", "right"], ["The whole 15 minutes, show enthusiasm", "wrong"], ["As little as possible", "wrong"], ["However long they let you", "wrong"]], e: "A screen is a conversation, not a monologue. If you talk the whole time, I learn you cannot read a room. Answer, then let me lead." },
  { q: "You do not know an answer on the screen. Best response?", a: [["Say so plainly and say how fast you learn", "right"], ["Make something up and hope", "wrong"], ["Go silent", "wrong"], ["Change the subject", "wrong"]], e: "A bluff falls apart on the follow up. \"I have not done that, here is how quickly I picked up the last new thing\" beats a fake answer every time." },
  { q: "End of the screen. What is the single best thing to do?", a: [["Ask what the next step and timeline are", "right"], ["Just say thanks and hang up", "wrong"], ["Ask if you got the job", "wrong"], ["Immediately start negotiating", "wrong"]], e: "Asking about next steps shows you are serious and gives you a date to follow up on. It is the easiest point you can score." },
];

export const BG_GAME: { q: string; v: "clear" | "flag"; e: string }[] = [
  { q: "Your last title was \"Team Lead\" but HR listed you as \"Associate.\" Background check flags it. Problem?", v: "flag", e: "Title mismatches are the number one background check flag, and they are almost always innocent. List the exact title HR has on file, not the one everyone called you. Verify it before you apply." },
  { q: "You said you worked somewhere March 2021, they have you starting in May 2021. Big deal?", v: "flag", e: "Date gaps of a month or two get flagged by automated checks even when harmless. Use the exact dates from your pay stubs or offer letters, not your memory." },
  { q: "You listed a degree you are six credits short of finishing. Safe to leave as-is?", v: "flag", e: "This is the one that actually ends offers. Never list a degree you did not complete. Say \"coursework toward\" or list it honestly. A pulled offer over this is common and completely avoidable." },
  { q: "A reference is a coworker who liked you, not your manager. Acceptable?", v: "clear", e: "Usually fine, especially if a manager is hard to reach. A peer who can speak to your actual work beats a manager who barely remembers you. Just brief them first." },
  { q: "You have a job now and do not want your current boss called. Can you control that?", v: "clear", e: "Yes, and it is normal. \"Please do not contact my current employer until we have an offer\" is a standard, reasonable request that no good recruiter will hold against you." },
  { q: "You got let go from a job two years ago. Will a background check reveal why?", v: "clear", e: "Background checks confirm dates and title, not the reason you left. That story is yours to frame in the interview. The check itself will not out you." },
];

export const GAME: { w: string; s: string; e: string }[] = [
  { w: "Responsible for opening and closing the store.", s: "Opened and closed a $2M location for 14 months with zero cash handling errors.", e: "Same duty, but now I know the size of what you were trusted with and that you did it cleanly." },
  { w: "Answered customer calls and resolved issues.", s: "Handled 80+ calls a day and held a 95% satisfaction score across six straight quarters.", e: "Volume plus consistency. Six quarters tells me it was not a fluke month." },
  { w: "Helped train new staff members.", s: "Trained 22 new hires and built the onboarding checklist the team still uses.", e: "\"Helped\" puts you near the work. Building something that outlived you puts you in charge of it." },
  { w: "Managed calendars and scheduling for executives.", s: "Managed calendars for 12 executives across three departments with zero missed deadlines.", e: "Twelve and three tell me the scale instantly. I do not have to ask a follow up." },
  { w: "Handled patient scheduling and intake paperwork.", s: "Scheduled 200+ appointments weekly and cut no-shows 18% with a reminder process I built.", e: "You did not just do the job, you improved it. That is the difference between a worker and a hire." },
  { w: "Led a team and completed assigned missions.", s: "Led a 9 person team through a 6 month deployment at 100% readiness.", e: "Military experience gets undersold constantly. Put the numbers on it like any other job." },
  { w: "Communicated with students and parents regularly.", s: "Managed communication for 140 families and resolved 30+ escalations a semester with no formal complaints.", e: "Escalations resolved is employee relations experience. You just have not called it that yet." },
  { w: "Worked to improve processes and efficiency.", s: "Rebuilt the intake process and cut turnaround from 5 days to 2.", e: "\"Improved processes\" is a phrase. \"5 days to 2\" is a fact. Facts get interviews." },
];

export const IVQ = [
  { id: "q1", cat: "Opening", q: "Tell me about yourself.",
    why: "It is the warm up, but it sets the frame for the entire interview. I am checking whether you can be concise and whether you understand what this role actually is.",
    ev: "Communication, self awareness, and whether you did any homework on the role.",
    weak: "Well, I was born in Ohio, went to school for marketing, then I worked retail for a while, then I did some customer service, and now I am here looking for something new.",
    strong: "I have spent six years in hospitality, most recently managing a team of 18. The part I have always done best is the people side: hiring, training, and keeping everyone steady when it gets busy. I have been building toward HR intentionally, and a coordinator role is exactly where I want to put that experience to work.",
    note: "Two minutes maximum. Do not start at birth. Start with what you do now, connect it to this role, and stop talking." },
  { id: "q2", cat: "The pivot", q: "Why are you making this transition into HR?",
    why: "I want to know this is a real decision and not a random escape from a job you dislike. I am also checking whether you will leave in six months.",
    ev: "Intentionality and whether you understand what the job actually involves.",
    weak: "I am kind of burnt out where I am and HR seems like a good next step. I have always been a people person.",
    strong: "The work I have always done best involves people: communicating, coordinating, and solving problems in real time. I have been moving toward HR on purpose. I have been reading up on employment basics and talking to people in the field, and this role is the right next step. I am not leaving my background behind, I am bringing all of it with me.",
    note: "Do not apologize for your background and do not over explain it. Connect the dots and let your confidence do the rest." },
  { id: "q3", cat: "Behavioral", q: "Tell me about a time you handled a difficult person or situation.",
    why: "In HR you will handle upset people constantly. I need evidence you do not avoid conflict and do not escalate it either.",
    ev: "Composure, judgment, and whether you actually resolved anything.",
    weak: "I had a really difficult customer once but I stayed calm and handled it professionally and it worked out fine.",
    strong: "A customer was furious that their order was wrong for the second time. I let them finish, repeated back what went wrong so they knew I heard it, told them exactly what I could do and by when, and then followed up the next day to confirm it landed. They came back and asked for me by name after that.",
    note: "Specific beats polished every single time. What happened, what you did, what changed. Use a real story with a real ending." },
  { id: "q4", cat: "Behavioral", q: "Tell me about a mistake you made and how you handled it.",
    why: "I am looking for accountability. Everyone makes mistakes. Not everyone owns them, and in HR a hidden mistake becomes a legal problem.",
    ev: "Honesty, ownership, and whether you built something so it does not happen again.",
    weak: "I cannot really think of a big one. I am pretty detail oriented so I do not make many mistakes.",
    strong: "I entered the wrong information on a schedule and it threw off two shifts. As soon as I caught it I owned it, fixed it, and told the people it affected so it would not cause more problems downstream. Then I started double checking that step, and I made a template so the rest of the team would not hit the same thing.",
    note: "Never say you cannot think of one. That answer tells me you either lack self awareness or you are hiding something." },
  { id: "q5", cat: "Systems", q: "What systems or tools have you used to track work or data?",
    why: "Every HR job runs on an applicant tracking system or an HRIS. I am gauging how much ramp up you will need.",
    ev: "Honesty about what you know and how fast you learn what you do not.",
    weak: "I have used Workday a bit, and I think I have seen Greenhouse. I am pretty good with computers generally.",
    strong: "I use our scheduling and POS system daily for reporting and records, and I picked it up fast when I started. I have not worked in Workday or Greenhouse directly. I have been reading about how applicant tracking systems work, and based on how quickly I learned our current system I am confident I would be up to speed within a couple of weeks.",
    note: "Only claim what you have actually used. If I ask a follow up and it falls apart, that is a dealbreaker, and it is a much bigger problem than not having the system. Honesty plus \"I learn fast\" beats a fake answer every time." },
  { id: "q6", cat: "Closing", q: "Why should we hire you?",
    why: "Last chance to make your case. I am checking whether you can advocate for yourself without arrogance.",
    ev: "Confidence, clarity, and whether you actually want this specific job.",
    weak: "I feel like I would be a really good fit and I am a hard worker and a fast learner, so I think I would do well here.",
    strong: "Because I already do a version of this work and I do it well. I keep a lot moving at once, I handle people when they are frustrated, and I follow through. I am reliable and I ramp fast. I would come in and help the team without needing a lot of hand holding.",
    note: "Then ask what the next step is. Tell them straight up that you want the job. It is astonishing how few people do, and it genuinely moves the needle." },
];

export const PLAN_WEEKS = [
  { t: "Foundation", tasks: ["Resume finalized and downloaded", "LinkedIn headline and About section live", "List 15 target companies", "Write down 5 people to reach out to"] },
  { t: "Go visible", tasks: ["Send 5 outreach messages", "Apply to 5 roles you genuinely fit", "Set job alerts on all 5 search terms", "Post or comment once on LinkedIn"] },
  { t: "Build momentum", tasks: ["Book 2 coffee chats", "Apply to 5 more strong-fit roles", "Follow up on last week's outreach", "Get on 1 staffing agency's radar"] },
  { t: "Widen the net", tasks: ["Send 5 more outreach messages", "Apply to 5 roles", "Get on a second agency's radar", "Ask one contact for a referral"] },
  { t: "First screens", tasks: ["Practice the phone screen out loud", "Expect and take phone screens", "Send a thank-you after each one", "Keep applying, do not coast"] },
  { t: "Interview prep", tasks: ["Drill your 6 answers out loud", "Finalize your 3 stories", "Research each company before you talk", "Prep your questions to ask them"] },
  { t: "The wall (this is normal)", tasks: ["Reread why you started", "Adjust what is not working, do not quit", "Ask a contact to look at your materials", "Apply to 3, protect your energy"] },
  { t: "Push through", tasks: ["Reconnect with 3 older contacts", "Apply to 5 roles", "Follow up on every open interview", "Line up your references"] },
  { t: "Closing in", tasks: ["Prep negotiation numbers", "Keep every process warm", "Do not resign anything yet", "Send one more round of thank-yous"] },
  { t: "Decisions", tasks: ["Compare offers on the whole package", "Negotiate with data, not nerves", "Confirm references cleared before resigning", "Get the offer in writing"] },
  { t: "Land it", tasks: ["Accept in writing", "Give proper notice, leave clean", "Plan your first 30 days", "Tell the people who helped you"] },
  { t: "Ready to start", tasks: ["Rest before day one", "Reread your first 90 days plan", "Thank your references again", "Update LinkedIn once you start"] },
];

export const CHALLENGES = [
  "Send three LinkedIn messages to people already working in HR. Not asking for a job. Asking how they got in.",
  "Rewrite three resume bullets so every one of them has a real number attached.",
  "Apply to five roles you are genuinely a strong fit for. Quality over volume this week.",
  "Book one coffee chat. Twenty minutes, phone or video, with somebody in the field.",
  "Say your two minute answer to tell me about yourself out loud five times. Out loud, not in your head.",
];
