/**
 * Terms of Service, Privacy Policy and Community Guidelines shown in the app.
 * Plain-English drafts written from how the app actually works, reviewed for
 * common risks for a social and meetup app. They are not a substitute for a
 * licensed attorney: have one review them before launch (docs/LEGAL.md).
 */

export type LegalDoc = { title: string; updated: string; sections: { heading: string; body: string }[] };

export const LEGAL_UPDATED = 'November 8, 2026';

/** The state whose law governs the Terms and where disputes are heard. */
export const GOVERNING_STATE = 'Virginia';

export const TERMS: LegalDoc = {
  title: 'Terms of Service',
  updated: LEGAL_UPDATED,
  sections: [
    {
      heading: 'Please read: these terms include an arbitration agreement',
      body: 'By creating an account or using I’m In, you agree to these Terms, the Community Guidelines and the Privacy Policy. Section “Disputes” says that most disputes are settled by individual arbitration instead of in court, and that you give up the right to a class action or jury trial. You can opt out within 30 days of signing up. If you don’t agree, don’t use I’m In.',
    },
    {
      heading: 'Who can use I’m In',
      body: 'You must be at least 18 and able to make a binding agreement. You may not use I’m In if you have been convicted of a violent or sexual crime, are required to register as a sex offender, or have been banned from I’m In before. One account per person, with your real name, accurate information, and a phone number and email you control. You’re responsible for everything that happens on your account, so keep your login private.',
    },
    {
      heading: 'Meeting people is at your own risk',
      body: 'I’m In helps people find each other and make plans. We don’t screen members, run criminal background checks on everyone, or check what members tell us about themselves, and we can’t control what anyone does on or off the app. You’re solely responsible for your interactions with other members and for deciding whether to meet anyone. Meet in public, tell someone you trust where you’ll be, arrange your own way home, and leave if you feel unsafe. To the fullest extent the law allows, you take on the risks of meeting and spending time with people you met through I’m In.',
    },
    {
      heading: 'What vouches, badges and verification mean',
      body: 'Vouches are other members’ personal opinions, not our endorsement. Vouch levels, Verified host, Photo verified, ID verified, Background checked and other badges each confirm only one limited thing, at one point in time. They are not a promise that anyone is safe, honest, or who they say they are, and we don’t guarantee they’re accurate or current. Never rely on a badge or a vouch count alone.',
    },
    {
      heading: 'Background checks',
      body: 'Background checks are optional and are run by an independent background-check company (a consumer reporting agency), not by I’m In. Before a check starts, you agree to it and confirm your details with that company. It searches certain public records, such as criminal records and the sex offender registry, and sends you a copy of your report. If you think something in it is wrong, you can dispute it with that company for free. We never receive or show your report. We only learn whether it came back clear, and if it did, a Background checked badge shows on your profile for one year. The badge only means the company reported no records in the categories it searched, as of that date. Public records can be missing, out of date or wrong, and records from other places may not be included. The fee is shown before you pay and can’t be refunded once the check has started. It’s free for members who have had Premium for 30 days. You may not use I’m In, or anything you learn on it, to make decisions about anyone’s employment, housing, credit, insurance or eligibility for anything.',
    },
    {
      heading: 'Events, hosts and venues',
      body: 'Events are created by members and businesses, not by I’m In. Hosts are independent: they aren’t our employees, agents or partners, and we don’t organize, supervise or vouch for events. Hosts are responsible for their events, including telling guests the truth about them, getting any permits, following the law, keeping guests reasonably safe, and serving alcohol only to people 21 and older and responsibly. Venues are responsible for their premises. You go to events at your own risk, and you’re responsible for your own drinking and getting home safely.',
    },
    {
      heading: 'Zero tolerance for abuse',
      body: 'I’m In is built on trust. There is no tolerance for harassment, threats, hate, stalking, sexual content involving anyone without consent or anything involving minors, impersonation, scams, spam, or content that puts anyone in danger. We remove content and suspend or ban accounts that break these rules, often without warning. Read the Community Guidelines for details.',
    },
    {
      heading: 'Your content',
      body: 'You own what you post: pins, replies, photos, videos, Outs, messages and your profile. You give I’m In a worldwide, non-exclusive, royalty-free license to host, store, display, adapt (for example, resize) and deliver it to the people you choose, only to run, improve and promote I’m In. This ends when you delete the content or your account, except for copies others have kept (for example, pinned Outs), backups, and what the law requires us to keep. You’re responsible for what you post, and you must have the right to share it, including any photos of other people. We don’t endorse what members post, and we may remove anything for any reason.',
    },
    {
      heading: 'Copyright complaints',
      body: 'If you believe something on I’m In infringes your copyright, email us. Include your contact details, what the work is, where the content is on I’m In, a statement that you believe in good faith the use isn’t authorized, and a statement, under penalty of perjury, that your notice is accurate and you’re authorized to act. We remove infringing content and end the accounts of repeat infringers.',
    },
    {
      heading: 'Reporting and blocking',
      body: 'You can report any member, pin, reply or date, and block any member at any time. We review reports promptly, usually within 24 hours, and act on content that breaks these terms. Content reported by several members may be hidden while we review it. We aren’t required to review everything posted, and we can’t promise to catch every problem.',
    },
    {
      heading: 'Safety features are not emergency services',
      body: 'Date Mode, safety timers, check-ins, trusted contacts and “I need help” are tools to help you, not a guarantee. They depend on your phone, battery, signal, location settings and other services, and they may be late or fail. I’m In doesn’t monitor your safety and can’t send help. If you’re in danger, call 911 (or your local emergency number) first.',
    },
    {
      heading: 'AI features',
      body: 'Some features use AI and are marked ✦: suggestions, icebreakers and odds. They can be wrong, incomplete or a poor fit. They’re ideas, not facts or advice, and you decide what to do with them.',
    },
    {
      heading: 'Premium',
      body: 'Premium is an optional subscription, paid by card through Stripe. The price and billing period are shown before you pay. It renews automatically each month at the then-current price until you cancel. You can cancel any time in Premium → Manage or cancel, and it stays on until the end of the period you paid for. Payments aren’t refundable except where the law requires. If we change the price, we’ll tell you before it applies to your next renewal.',
    },
    {
      heading: 'Tickets',
      body: 'Hosts can sell tickets to their events, and the host is the seller. Payments are handled by Stripe. I’m In keeps an 8% fee from each ticket. Stripe’s card fee is taken from the host’s share, and the rest goes to the host. Refunds are up to the host. If an event fills up before your payment goes through, you’re refunded in full. Hosts are responsible for delivering the event and for any taxes on their sales.',
    },
    {
      heading: 'Drinks and drink credit',
      body: 'You can buy drink credit by card (through Stripe) and use it to send drinks to people while they’re live. Drink credit is a limited license to use a feature of I’m In. It has no cash value, can’t be transferred or withdrawn, and a drink can’t be refunded once it’s sent. The person you send a drink to earns a share of it (70% unless we tell you otherwise) as real money, paid through their Stripe payout account, and they’re responsible for any taxes on it. We may reverse drinks and earnings tied to fraud, chargebacks or rule-breaking.',
    },
    {
      heading: 'Outs',
      body: 'Outs are photos or short videos (up to 9 seconds) that disappear after 6, 12 or 24 hours (the sender picks). You choose who gets each one, and you can hide an Out from anyone you choose; they aren’t told. Anyone who can see an Out can pin it to keep it, and we tell you when they do. Anyone can also take a screenshot or a photo of their screen, so only share what you’re comfortable with.',
    },
    {
      heading: 'Split the bill',
      body: 'Split the bill lets you ask people for their share of something you paid for. I’m In doesn’t move money. People pay you directly with Venmo, Cash App or PayPal, under those services’ own terms, and I’m In takes no fee. Marking a share as paid is just a note between you and them.',
    },
    {
      heading: 'Claim your place (for businesses)',
      body: 'Businesses that claim their place pay a monthly subscription through Stripe, shown before they pay. It renews monthly until canceled. Businesses are responsible for their listings, specials and premises, and for following the law, including alcohol and advertising rules.',
    },
    {
      heading: 'Using the app fairly',
      body: 'We give you a personal, revocable license to use I’m In as offered. Don’t copy, scrape, sell or resell it or its members’ information. Don’t use bots, fake accounts or automation. Don’t get around limits, blocks or bans, interfere with how it works, or try to reverse engineer it, except where the law allows. Don’t use it for anything illegal or commercial that we haven’t approved. The I’m In name, logo and app belong to us.',
    },
    {
      heading: 'Other companies’ services',
      body: 'I’m In uses and links to services run by other companies (for example Stripe, Apple, Google, Venmo, Cash App, PayPal, the background-check company, and the places events are held). Their own terms apply, and we aren’t responsible for them.',
    },
    {
      heading: 'Ending your account',
      body: 'You can delete your account at any time in Settings → Delete account. We may suspend or end your account, or remove content, at any time if we believe you’ve broken these terms, put anyone at risk, or exposed I’m In to legal risk. The parts of these terms that by their nature should last (for example payments owed, disclaimers, limits on liability, and disputes) still apply after your account ends.',
    },
    {
      heading: 'Disclaimers',
      body: 'I’m In is provided “as is” and “as available,” without warranties of any kind, express or implied, including warranties of merchantability, fitness for a particular purpose, title and non-infringement. We don’t promise that I’m In will be safe, secure, error-free or always available, or that any member, event, venue, badge, vouch, background check or AI suggestion is what it seems. We aren’t responsible for the conduct of any member, host, venue or other person, on or off the app.',
    },
    {
      heading: 'Limits on our liability',
      body: 'To the fullest extent the law allows, I’m In and its owners, employees and partners won’t be liable for any indirect, incidental, special, consequential, exemplary or punitive damages, or for lost profits, data or goodwill. We also won’t be liable for injury, harm or loss arising from your interactions with other members or from events, whether or not we were told such harm was possible. Our total liability for any claim relating to I’m In is limited to the greater of $100 or the amount you paid us in the 12 months before the claim. Some places don’t allow some of these limits, so they apply only as far as the law allows. Nothing here limits liability for fraud, or for gross negligence or intentional misconduct where the law doesn’t allow that.',
    },
    {
      heading: 'Your responsibility to us',
      body: 'If someone brings a claim against I’m In or its owners, employees or partners because of your content, your conduct (on or off the app), your events, or your breaking these terms or the law, you agree to cover their losses and costs, including reasonable lawyers’ fees, as far as the law allows.',
    },
    {
      heading: 'Disputes',
      body: `Please contact us first; most problems can be solved quickly. If we can’t resolve a dispute within 60 days, you and I’m In agree to settle it by binding individual arbitration administered by the American Arbitration Association under its Consumer Arbitration Rules, instead of in court. Either of you can instead bring an individual claim in small claims court. You and I’m In each give up the right to a jury trial and to bring or join a class or representative action. If this class action waiver is found unenforceable, then this arbitration section doesn’t apply to that dispute. You can opt out of arbitration within 30 days of creating your account by emailing us with your name and the subject “Arbitration opt-out.” These terms are governed by the laws of ${GOVERNING_STATE} and the Federal Arbitration Act, without regard to conflict-of-law rules. Any court case allowed under these terms will be heard in the state or federal courts in ${GOVERNING_STATE}.`,
    },
    {
      heading: 'General',
      body: 'If we change these terms, we’ll tell you in the app before the changes take effect, and using I’m In afterward means you accept them. If any part of these terms can’t be enforced, the rest still applies. These terms, the Community Guidelines and the Privacy Policy are the whole agreement between you and I’m In. You can’t transfer them; we can, for example if I’m In is sold. If we don’t enforce something right away, we haven’t waived it. We aren’t responsible for delays or failures caused by things outside our reasonable control.',
    },
    {
      heading: 'Contact',
      body: 'Questions, copyright notices or arbitration opt-outs: contact us through Settings → Contact support.',
    },
  ],
};

export const PRIVACY: LegalDoc = {
  title: 'Privacy Policy',
  updated: LEGAL_UPDATED,
  sections: [
    {
      heading: 'The short version',
      body: 'We collect what we need to run I’m In. We never sell your personal information or share it for cross-app ads. We never show your exact location. You can see, change, download or delete your information.',
    },
    {
      heading: 'What we collect',
      body: 'Account details: name, email, phone number, date of birth, city and neighborhood, and your photos (including a header photo, if you add one). Your profile: headline, bio, mood, pronouns, prompts, song, interests and profile color. What you create: pins, replies, photos, videos, Outs, vouches, intros, messages, dates, RSVPs and group activity. Location: an approximate location to show what’s nearby, and a precise reading only when you tap Check In, use Date Mode or a safety timer, or allow arrival alerts. Device details: your device type, app version and a push-notification token.',
    },
    {
      heading: 'Verification',
      body: 'Phone: we text you a code through Twilio to confirm your number. Photo check: you take a live selfie doing a random gesture, and a person on our team compares it with your profile photos. We don’t use face-recognition software or make a faceprint. Your selfie is stored privately, only our review team can see it, and it’s kept until you delete your account. ID verification is done by a person on our team, and we keep only the date you were verified.',
    },
    {
      heading: 'Background checks',
      body: 'If you choose a background check, you give your details directly to the background-check company, and the company keeps your report under its own privacy policy and the Fair Credit Reporting Act. We never receive your report. We keep only the check’s status, its dates, how it was paid for, and whether it came back clear. Only a clear result is shown, as a badge. Nobody else ever sees whether a check didn’t come back clear.',
    },
    {
      heading: 'Contacts',
      body: 'If you choose to find friends from your contacts, the phone numbers are scrambled on your phone (hashed) before they’re sent. We compare them with members’ scrambled numbers to show who’s already here, and we don’t keep your contact list. Only use this with contacts you have permission to share.',
    },
    {
      heading: 'Usage counts',
      body: 'To learn which features help people, we count when features are used (for example, a pin was posted or an event was joined). We record the feature name and a few simple details, never the text of anything you write. These records are kept for 180 days, and only the I’m In team sees them.',
    },
    {
      heading: 'Your location',
      body: 'We never show your exact location to anyone. Locations you share are rounded to about a quarter mile. Precise readings from Check In are used only to confirm you met someone in person. Nobody can see them, not even you, and they’re deleted after 30 days. If you allow arrival alerts, your phone watches only the places of events and plans you said I’m In to, so you can be marked there when you arrive. You can turn location off in your phone’s Settings.',
    },
    {
      heading: 'What other members see',
      body: 'Your display name, photos, header, headline, bio, mood, song, prompts, interests, age (unless you hide it), city or neighborhood (unless you hide it), vouches and the words people used, badges, your groups, and posts shared with them. Your email, phone number, birthday and exact location are never shown. You control who sees each post, whether your area, age, vouch count and going-out venue show, whether you appear in search, and whether 2nd-degree members can request intros to you (Settings → Privacy).',
    },
    {
      heading: 'AI features',
      body: 'Some features use AI (always marked ✦): People like you, icebreakers, Tonight for You and intro odds. They use the interests you pick and patterns like when you go out, RSVPs, groups, venues and vouch words, and only what you could already see in the app. Insiders-only posts never feed matches, and AI never reads your messages. The AI runs through Anthropic, and your information isn’t used to train their models.',
    },
    {
      heading: 'How we use information',
      body: 'To run I’m In and show you relevant people, posts and events. To keep members safe, prevent fraud and abuse, review reports, and enforce our terms. To process payments and payouts. To send you notifications you can turn off. To understand and improve the app. To follow the law.',
    },
    {
      heading: 'Who we share with',
      body: 'We don’t sell your personal information or share it for targeted advertising. We use service providers to run the app, and they must protect your data: hosting and database (Supabase), text messages (Twilio), app delivery and notifications (Expo, Apple, Google), payments (Stripe; we never see or store your full card number), song previews (Apple Music), live video (LiveKit, only while you’re watching or broadcasting; live videos aren’t recorded), AI processing (Anthropic), and, only if you choose one, the background-check company. We also share information if the law requires it, to protect someone’s safety, to investigate abuse, or if I’m In is sold or reorganized (under this policy).',
    },
    {
      heading: 'Keeping and deleting your data',
      body: 'Outs are deleted 6, 12 or 24 hours after they’re sent, unless someone pinned them. A pinned Out is kept until everyone who pinned it unpins it, or the sender deletes their account. We keep your information while your account is open. When you delete your account in Settings → Delete account, we delete your profile, photos, posts, replies, vouches, Insiders, messages and verification selfie. Some records may stay briefly in backups, and we keep what the law requires, or what we need to resolve disputes, prevent fraud or keep a banned person from coming back.',
    },
    {
      heading: 'Security',
      body: 'We protect your information with encryption in transit, access controls and private storage for sensitive files. No system is perfectly secure, so we can’t guarantee it. If a breach affects you, we’ll tell you as the law requires.',
    },
    {
      heading: 'Your choices and rights',
      body: 'You can see and edit your profile, change privacy settings, delete your account and data, ask us for a copy of your data, and turn off location or notifications in your phone settings. Depending on where you live, including California, Virginia and other states with privacy laws, you may have rights to access, correct, delete or get a copy of your information, and to opt out of sale, sharing or targeted ads (we don’t do those). Contact us to use your rights, and we won’t treat you differently for using them. If we turn down a request, you can appeal by replying to our answer.',
    },
    {
      heading: 'Age',
      body: 'I’m In is only for people 18 and older. We don’t knowingly collect information from anyone younger, and we delete accounts we learn belong to someone under 18.',
    },
    {
      heading: 'Changes and contact',
      body: 'If we make important changes to this policy, we’ll tell you in the app first. Questions about privacy: contact us through Settings → Contact support.',
    },
  ],
};

export const GUIDELINES: LegalDoc = {
  title: 'Community Guidelines',
  updated: LEGAL_UPDATED,
  sections: [
    {
      heading: 'The short version',
      body: 'Be real. Be kind. Show up. Your reputation is earned in person, so treat people the way you’d want your vouchers to hear about.',
    },
    {
      heading: 'Not allowed, ever',
      body: 'Harassment, threats, stalking or intimidation. Hate or discrimination. Sexual content or advances without consent, or anything involving minors. Sharing someone’s private information, or photos of them they didn’t agree to. Fake profiles or impersonation. Scams, spam, or selling. Anything illegal or dangerous. Fake or traded vouches, or check-ins you didn’t really do together. Using anything you learn here, including someone’s badges, to harass, shame or discriminate against them.',
    },
    {
      heading: 'Vouch honestly',
      body: 'Checking in with someone never vouches for them. Only vouch if you’d recommend them, and take a vouch back if that changes. Only vouch for people you actually spent time with, and pick the word that’s true. Vouch rings and paid vouches get detected and removed, along with the accounts involved.',
    },
    {
      heading: 'Meeting up',
      body: 'Meet in public places. Tell someone you trust where you’ll be. Use Date Mode and safety check-ins, but call 911 if you’re in danger. Passing on a date or an intro is always okay, and no explanation is needed. Badges and vouches help, but trust your own judgment.',
    },
    {
      heading: 'Hosting and drinking',
      body: 'Hosts: describe your event honestly, follow the law and the venue’s rules, and only serve alcohol to people 21 and older. Everyone: drink responsibly, look out for each other, and never drive after drinking.',
    },
    {
      heading: 'If something’s wrong',
      body: 'Report it: tap Report on the member’s profile, post, reply or date. Block anyone, any time. We review reports promptly, usually within 24 hours. If you’re in danger, call 911.',
    },
    {
      heading: 'What happens when rules are broken',
      body: 'Depending on what happened: content removed, a warning, a suspension, or a permanent ban. Serious violations lead to an immediate ban and, where appropriate, a report to law enforcement.',
    },
  ],
};

export const LEGAL_DOCS = { terms: TERMS, privacy: PRIVACY, guidelines: GUIDELINES } as const;
export type LegalKey = keyof typeof LEGAL_DOCS;
