/**
 * AI Profile Badges and AI Read.
 *
 * Method: from what anyone can see on a profile (vouch words and how often
 * they're used, groups, public events attended and hosted, open plans and the
 * nights and hours they happen, intros made), the AI chooses up to 3
 * descriptive badges ("Natural connector", "Night owl") and writes a short,
 * kind, two-sentence read of how the person moves socially. It never uses
 * messages. (Chat-based badges are opt-in only and not built yet.)
 *
 * Everyone who opens the profile sees the same read, so it's made once, saved
 * for a week, and only uses an AI use for the person who asked for it.
 * Profiles without enough activity get no read rather than a made-up one.
 */
import { userRpc } from '../../_shared/http.ts';
import { dataBlock, VOICE } from '../../_shared/claude.ts';
import { clean, type Feature } from './types.ts';

type Facts = Record<string, unknown> & {
  first_name: string; vouch_count: number; events_last_90_days: number; nights_out_last_90_days: number;
  intros_made: number; groups: string[]; events_hosted: number;
};
type Out = { badges: { label: string; why: string }[]; read: string };
export type ProfileReadResult = { badges: { label: string; why: string }[]; read: string | null; thin?: boolean };

const UUID = /^[0-9a-f-]{36}$/;

export const profileRead: Feature<Facts, Out, ProfileReadResult> = {
  scope: () => 'all',
  person: (ctx) => ctx.subject,
  ttlMinutes: 7 * 24 * 60,
  counts: () => true,
  async gather(ctx) {
    if (!UUID.test(ctx.subject)) return { error: 'Bad request', status: 400 };
    const r = await userRpc<Facts>(ctx.req, 'ai_profile_facts', { p_person: ctx.subject });
    if (!r.ok || !r.data) return { error: 'Not available.', status: 404 };
    const f = r.data;
    const activity = (f.vouch_count ?? 0) + (f.events_last_90_days ?? 0) + (f.nights_out_last_90_days ?? 0) + (f.intros_made ?? 0) + (f.events_hosted ?? 0) + (f.groups?.length ?? 0);
    if (activity < 3) return { empty: { badges: [], read: null, thin: true } };
    return { facts: f };
  },
  ask: (f) => ({
    system: VOICE,
    prompt: [
      dataBlock('profile', f),
      `Describe how ${f.first_name} moves socially, for people deciding whether to connect. ` +
        'Give up to 3 badges: 1 to 3 words each, descriptive and kind (like "Natural connector", "Night owl", "Brunch regular", "Always shows up"), ' +
        'each backed by the data, with a short "why" (under 12 words). ' +
        'Then a read: 2 sentences, under 45 words, in third person, kind and specific. ' +
        'If the data is too thin to say something true, give fewer badges rather than guessing.',
    ].join('\n\n'),
    schema: {
      type: 'object',
      properties: {
        badges: {
          type: 'array',
          items: {
            type: 'object',
            properties: { label: { type: 'string' }, why: { type: 'string' } },
            required: ['label', 'why'],
            additionalProperties: false,
          },
        },
        read: { type: 'string' },
      },
      required: ['badges', 'read'],
      additionalProperties: false,
    },
  }),
  finish(_f, out) {
    const read = clean(out.read, 360);
    const badges = (out.badges ?? [])
      .map((b) => ({ label: clean(b.label, 28), why: clean(b.why, 90) }))
      .filter((b) => b.label && b.label.split(' ').length <= 4)
      .slice(0, 3);
    return read ? { badges, read } : null;
  },
};
