# Legal: what's in the app, and what only the owner can do

The Terms of Service, Privacy Policy and Community Guidelines live in
`src/features/legal/content.ts` and show in the app (Settings, and at signup).
They were written to cover the common risks of a social and meetup app. **They
are not legal advice.** Have a licensed attorney in your state review them before
launch. Many offer a flat-fee review for startups.

## What the app now does to limit the owner's risk

- **Signup.** Members must tick a box agreeing to the Terms (which include arbitration and a class action waiver), the Community Guidelines and the Privacy Policy. The agreement is saved with the account (`accepted_terms`).
- **Terms cover:**
  - eligibility (18+, no violent or sexual convictions, no registered sex offenders)
  - meeting people at your own risk
  - what badges, vouches and background checks do and don't mean
  - background checks run by an independent consumer reporting agency
  - hosts and venues being independent and responsible for their events and alcohol
  - safety features not being emergency services
  - AI features
  - auto-renewing subscriptions
  - tickets, drink credit, Outs, Split the bill and Claim your place
  - fair use of the app
  - copyright complaints
  - disclaimers
  - a cap on liability (the greater of $100 or what the member paid in 12 months)
  - members covering claims caused by their conduct
  - individual arbitration (AAA consumer rules) with a 30-day opt-out
  - governing law
- **Privacy Policy covers:**
  - what's collected
  - verification (selfies are compared by a person, with no face-recognition software)
  - background checks (we never get the report)
  - hashed contacts, location, AI
  - who we share with
  - no selling or sharing of personal data for ads
  - retention, security, and state privacy rights
  - an age floor of 18
- **Short notices where they matter:**
  - Date Mode and the safety timer: not an emergency service, call 911.
  - New event: the host is responsible, alcohol 21+.
  - Buying tickets: the host sells and decides refunds.
  - Checking contacts: only contacts you have permission to share.
  - Vouching: it's your personal opinion.
  - Background check: authorization, a copy of the report, free disputes, what the badge means, no refund once started.
- **Deleting an account** now removes every file the member uploaded: photos, post photos and videos, Outs, event covers and verification selfies. Receipt photos stay with shared bills, as the Privacy Policy says.

## Things only you can do (in order)

1. **Form a company (an LLC).** This is the biggest protection: it keeps the business's debts and lawsuits separate from your personal savings and home. Then put the company's name in the Terms (tell me the exact name).
2. **Governing state: Virginia** (confirmed by the owner, November 8, 2026). It's `GOVERNING_STATE` in `content.ts`.
3. **Get insurance.** Ask an insurance broker for:
   - general liability
   - cyber/data breach
   - technology errors & omissions (E&O)
   - a quote on liquor liability if you host events yourself
4. **Have an attorney review the documents** and the arbitration section. AAA charges businesses fees when a consumer files, and a lawyer can suggest the right setup.
5. **Register a DMCA agent** with the U.S. Copyright Office (copyright.gov/dmca-directory, about $6). This protects you from copyright claims over what members post.
6. **Background checks:** pick a company that handles FCRA compliance for "consumer-initiated" checks (they run the consent, disclosures and disputes). Have the attorney confirm the setup before turning it on.
7. **Set the real support email** (`app_config.support_email`). The Terms send copyright notices, privacy requests and arbitration opt-outs there.
8. **Taxes:** ask an accountant about sales tax on Premium and tickets, and about reporting host payouts (Stripe sends hosts 1099s).

## When to update the documents

Any time you add a feature that collects new information, takes payments,
involves meeting in person, or uses a new outside company, the Terms or Privacy
Policy may need a new line. Ask me to update them, then change `LEGAL_UPDATED`.
