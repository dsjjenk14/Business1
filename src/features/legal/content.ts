/**
 * Terms of Service, Privacy Policy and Community Guidelines shown in the app.
 * Plain-English drafts written from how the app actually works.
 * NOTE: Have a lawyer review before launch (see docs/LAUNCH-CHECKLIST.md).
 */

export type LegalDoc = { title: string; updated: string; sections: { heading: string; body: string }[] };

export const LEGAL_UPDATED = 'September 30, 2026';

export const TERMS: LegalDoc = {
  title: 'Terms of Service',
  updated: LEGAL_UPDATED,
  sections: [
    {
      heading: 'Who can use I’m In',
      body: 'You must be 18 or older and able to agree to these terms. One account per person, using your real name and a phone number and email you control.',
    },
    {
      heading: 'Zero tolerance for abuse',
      body: 'I’m In is built on trust. There is no tolerance for harassment, threats, hate, sexual content involving anyone without consent, impersonation, scams, spam, or content that puts anyone in danger. We remove content and suspend or ban accounts that break these rules, often without warning. Read the Community Guidelines for details.',
    },
    {
      heading: 'Your content',
      body: 'You own what you post (pins, replies, photos, messages). You give I’m In permission to store, display and deliver it to the people you choose, only to run the app. You’re responsible for what you post and must have the right to share it.',
    },
    {
      heading: 'Vouches, intros and meeting in person',
      body: 'Vouches reflect members’ personal opinions after meeting you; they are not background checks or guarantees. You’re responsible for your own safety when meeting people. Meet in public, tell someone where you’ll be, and use the safety features. I’m In doesn’t conduct criminal background checks unless you choose an optional check.',
    },
    {
      heading: 'Reporting and blocking',
      body: 'You can report any member, pin or reply and block any member at any time. We review reports promptly, usually within 24 hours, and act on content that breaks these terms. Content reported by several members may be hidden while we review it.',
    },
    {
      heading: 'Premium',
      body: 'Premium is an optional monthly subscription paid by card through Stripe. The price is shown before you pay, and it renews each month until you cancel. You can cancel any time in Premium → Manage or cancel.',
    },
    {
      heading: 'Tickets',
      body: 'Hosts can sell tickets to their events. Payments are handled by Stripe. I’m In keeps an 8% fee from each ticket, Stripe’s card fee is taken from the host’s share, and the rest goes to the host. Refunds are up to the host. If an event fills up before your payment goes through, you are refunded in full.',
    },
    {
      heading: 'Ending your account',
      body: 'You can delete your account at any time in Settings → Delete account. We may suspend or end accounts that break these terms.',
    },
    {
      heading: 'Disclaimers',
      body: 'I’m In is provided “as is.” To the extent the law allows, we aren’t liable for the conduct of members, on or off the app, or for indirect damages. Nothing here limits rights you have under law that can’t be limited.',
    },
    {
      heading: 'Changes and contact',
      body: 'If we change these terms we’ll tell you in the app. Questions: contact us through Settings → Contact support.',
    },
  ],
};

export const PRIVACY: LegalDoc = {
  title: 'Privacy Policy',
  updated: LEGAL_UPDATED,
  sections: [
    {
      heading: 'What we collect',
      body: 'Account details you give us: name, email, phone number, date of birth, city, and an optional photo. What you create: pins, replies, photos, vouches, intros, messages and group activity. Location: approximate location to show nearby pins and people, and a precise reading only when you tap Check In or use Date Mode.',
    },
    {
      heading: 'Usage counts',
      body: 'To learn which features help people, we count when features are used (for example: a pin was posted, a group chat was started, an event was joined). We record the feature name and a few simple details like a category, never the text of anything you write. These records are kept for 180 days and are only seen by the I’m In team.',
    },
    {
      heading: 'Your location',
      body: 'We never show your exact location to anyone. Locations you share are rounded to about a quarter mile. Precise readings from Check In are only used to confirm you met someone in person. Nobody can see them, not even you, and they’re deleted after 30 days. We use location while the app is open. If you choose to allow it, the phone also watches the places of events and plans you said I’m In to, so you can be marked there when you arrive with the app closed. It never tracks you anywhere else, and you can turn this off in your phone’s Settings.',
    },
    {
      heading: 'What other members see',
      body: 'Your display name, photo, headline, bio, city or neighborhood, age (unless you hide it), vouches and the words people used, your groups, and pins shared with them. Your email, phone number and birthday are never shown. You control who sees each pin, whether your vouch count and going-out venue show, whether you appear in search, and whether 2nd-degree members can request intros to you (Settings → Privacy).',
    },
    {
      heading: 'AI features',
      body: 'Some features use AI (always marked ✦). They use patterns like when you go out, RSVPs, venues and pin activity. They don’t read your private messages unless you explicitly turn that on for AI profile badges (off by default).',
    },
    {
      heading: 'Who we share with',
      body: 'We don’t sell your personal information. We use service providers to run the app, bound to protect your data: hosting and database (Supabase), text messages (Twilio), app delivery and notifications (Expo), payments (Stripe; we never see or store your full card number), and AI processing (Anthropic). We share information if the law requires it or to protect someone’s safety.',
    },
    {
      heading: 'Keeping and deleting your data',
      body: 'We keep your information while your account is open. Delete your account in Settings → Delete account and we delete your profile, photos, pins, replies, vouches, connections and messages. Some records may be kept briefly in backups or where the law requires.',
    },
    {
      heading: 'Your choices and rights',
      body: 'You can see and edit your profile, change privacy settings, download or delete your data, and turn off location or notifications in your phone settings. Depending on where you live you may have more rights; contact us to use them.',
    },
    {
      heading: 'Age',
      body: 'I’m In is only for people 18 and older. We don’t knowingly collect information from anyone younger.',
    },
    {
      heading: 'Contact',
      body: 'Questions about privacy: contact us through Settings → Contact support.',
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
      body: 'Harassment, threats, stalking or intimidation. Hate or discrimination. Sexual content or advances without consent, or anything involving minors. Sharing someone’s private information. Fake profiles or impersonation. Scams, spam, or selling. Anything illegal or dangerous. Fake or traded vouches, or check-ins you didn’t really do together.',
    },
    {
      heading: 'Vouch honestly',
      body: 'Only vouch for people you actually spent time with, and pick the word that’s true. Vouch rings and paid vouches get detected and removed, along with the accounts involved.',
    },
    {
      heading: 'Meeting up',
      body: 'Meet in public places. Tell a friend where you’ll be. Use Date Mode and safety check-ins. Passing on a date or an intro is always okay, and no explanation is needed.',
    },
    {
      heading: 'If something’s wrong',
      body: 'Report it: tap Report on the member’s profile, pin or reply. Block anyone, any time. We review reports promptly, usually within 24 hours. If you’re in danger, call 911.',
    },
    {
      heading: 'What happens when rules are broken',
      body: 'Depending on what happened: content removed, a warning, a suspension, or a permanent ban. Serious violations lead to an immediate ban and, where appropriate, a report to law enforcement.',
    },
  ],
};

export const LEGAL_DOCS = { terms: TERMS, privacy: PRIVACY, guidelines: GUIDELINES } as const;
export type LegalKey = keyof typeof LEGAL_DOCS;
