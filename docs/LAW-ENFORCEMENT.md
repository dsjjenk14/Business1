# Police requests, subpoenas and sharing records

**This is not legal advice.** It's a plain summary of the main federal law, so you know what to
ask your lawyer. Send every subpoena, warrant or court order to your lawyer before you respond.

The main law is the federal **Stored Communications Act** (SCA), 18 U.S.C. §§ 2701–2713. It
splits data into two kinds:

- **Contents:** what people wrote (messages, notes in date plans).
- **Records:** everything else about an account (name, phone, sign-in times, payments, location
  check-ins, who met whom).

## 1. When I'm In may share on its own (no subpoena)

| Situation | What we may share | Law |
|---|---|---|
| The reporter says yes in the app | Messages between them and the person they reported, and their date plans. A service may share a message with the consent of someone who sent or received it. | 18 U.S.C. § 2702(b)(3) |
| Emergency: someone could be killed or seriously hurt | Contents and records, to police, if we believe it in good faith | § 2702(b)(8) and (c)(4) |
| Anything else about the *reported* member (their location, encounters, account details) | Not to police without legal process, that member's consent, or an emergency | § 2702(c) |

That's why the app's "Send records to police" button only includes messages and date plans when
the basis is "Reporter agreed", and adds location and Date Mode only for "Subpoena or warrant" or
"Emergency". Every use is logged (`private.police_disclosures`).

## 2. When police make us share (compelled)

| What police bring | What it can get | Law |
|---|---|---|
| Subpoena (grand jury, trial or administrative) | Basic subscriber info: name, address, phone, sign-in times, how long the account existed, how they paid | § 2703(c)(2) |
| Court order (a "2703(d) order") | Other records, such as location check-ins and who met whom. A judge must find "specific and articulable facts" that the records are relevant. | § 2703(d) |
| Search warrant | Contents (messages) and everything else | § 2703(a), (b) |

- **Preservation letters:** police can ask us to save an account's data while they get a warrant.
  We must keep it for 90 days, and another 90 if they renew (§ 2703(f)). Reports already save the
  key records automatically, but follow the letter for anything else.
- **Gag orders:** a court can order us not to tell the member (§ 2705(b)). Don't tell them if
  the paperwork says not to.
- **Costs:** we can ask to be reimbursed for the cost of pulling records (§ 2706).
- **Protection:** relying in good faith on a warrant, court order or subpoena is a complete defense
  if someone later sues us over it (§ 2707(e)).
- **Virginia** has its own matching law for Virginia police: Va. Code § 19.2-70.3. It also lets a
  provider ask the court to narrow a request that's unusually large or burdensome.

## 3. Lawsuits that aren't criminal (divorces, civil suits)

A civil subpoena **can't** make us hand over messages. Courts have held that the SCA bars it
(*Crispin v. Christian Audigier*, 717 F. Supp. 2d 965 (C.D. Cal. 2010); *O'Grady v. Superior
Court*, 139 Cal. App. 4th 1423 (2006)). The lawyer has to get messages from the member
themselves. Send these to your lawyer too.

## 4. What to do when a request comes in

1. Don't answer the officer on the spot. Ask for the request in writing, sent to the support email.
2. Forward it to your lawyer the same day.
3. If it's an emergency (someone in danger right now), share what's needed to help right away,
   using "Emergency" in the app, and tell your lawyer after.
4. Keep a copy of the request and what you sent. The app logs what was prepared.

## Sources

- 18 U.S.C. § 2702 (voluntary disclosure): https://law.justia.com/codes/us/title-18/part-i/chapter-121/sec-2702/
- 18 U.S.C. § 2703 (required disclosure): https://www.govinfo.gov/content/pkg/USCODE-2024-title18/html/USCODE-2024-title18-partI-chap121-sec2703.htm
- DOJ, *Searching and Seizing Computers and Obtaining Electronic Evidence* (excerpt): https://cyber.harvard.edu/practicallawyering/Week9DOJECPAExcerpt.pdf
- EFF, Stored Communications Act overview: https://ilt.eff.org/Stored_Communications_Act.html
- *Crispin v. Christian Audigier* (summary): https://blog.ericgoldman.org/archives/2010/06/post_1.htm
- Va. Code § 19.2-70.3: https://law.lis.virginia.gov/vacode/19.2-70.3/
