/**
 * People like you (Behavioral Vibe Match).
 *
 * Method:
 * 1. The database ranks up to 15 people you could meet (your 2nd degree, people
 *    in your groups, people in your city) by what you share: interests, groups,
 *    the spots you both go to, the nights you both go out, mutual friends and
 *    neighborhood. That list alone is the free, instant version.
 * 2. The AI reads what you share with each and picks the 5 you'd most likely
 *    click with, weighing real overlap (same group, same spots, same nights)
 *    over a single shared interest, and writes one sentence per person on why.
 * 3. The app shows those 5 first with their sentence, then the rest.
 *
 * Only open plans and public events count, never circle-only posts or messages.
 * The daily pick is made automatically and doesn't use an AI use; tapping
 * Refresh does.
 */
import { userRpc } from '../../_shared/http.ts';
import { dataBlock, VOICE } from '../../_shared/claude.ts';
import { clean, type Feature } from './types.ts';

type Candidate = { user_id: string; display_name: string; degree: number | null; via: { display_name: string } | null; shared: Record<string, unknown> };
type Facts = { me: Record<string, unknown>; candidates: Candidate[] };
type Out = { picks: { user_id: string; reason: string }[] };
export type PeopleResult = { picks: { user_id: string; reason: string }[] };

export const peopleLikeYou: Feature<Facts, Out, PeopleResult> = {
  scope: (ctx) => ctx.userId,
  ttlMinutes: 24 * 60,
  counts: (ctx) => ctx.refresh,
  async gather(ctx) {
    const [list, me] = await Promise.all([
      userRpc<Candidate[]>(ctx.req, 'people_like_you', { p_limit: 15 }),
      userRpc<Record<string, unknown>>(ctx.req, 'ai_profile_facts', { p_person: ctx.userId }),
    ]);
    if (!list.ok || !me.ok) return { error: 'Couldn’t load your matches.', status: 500 };
    if (!list.data?.length) return { empty: { picks: [] } };
    return { facts: { me: me.data ?? {}, candidates: list.data } };
  },
  ask: (f) => ({
    system: VOICE,
    prompt: [
      dataBlock('me', { interests: f.me.interests, groups: f.me.groups, usual_nights: f.me.usual_nights, neighborhood: f.me.neighborhood }),
      dataBlock('people', f.candidates.map((c) => ({
        user_id: c.user_id,
        first_name: c.display_name.split(' ')[0],
        how_to_meet: c.degree === 2 && c.via ? `needs an intro from ${c.via.display_name.split(' ')[0]}` : 'no mutual friend yet to introduce us',
        in_common: c.shared,
      }))),
      'Pick up to 5 people from <people> I would most likely click with, best first. Weigh real overlap in how we spend time ' +
        '(same group, same spots, same nights out, mutual friends) above a single shared interest. ' +
        'For each, write one sentence (max 22 words) to me about why, naming the specific things we share. ' +
        'I can only meet people here through an introduction from a mutual friend, so never suggest messaging them or reaching out directly. ' +
        'Use the exact user_id from the data.',
    ].join('\n\n'),
    schema: {
      type: 'object',
      properties: {
        picks: {
          type: 'array',
          items: {
            type: 'object',
            properties: { user_id: { type: 'string' }, reason: { type: 'string' } },
            required: ['user_id', 'reason'],
            additionalProperties: false,
          },
        },
      },
      required: ['picks'],
      additionalProperties: false,
    },
  }),
  finish(f, out) {
    const ids = new Set(f.candidates.map((c) => c.user_id));
    const seen = new Set<string>();
    const picks = (out.picks ?? [])
      .filter((p) => ids.has(p.user_id) && !seen.has(p.user_id) && seen.add(p.user_id))
      .map((p) => ({ user_id: p.user_id, reason: clean(p.reason, 180) }))
      .filter((p) => p.reason)
      .slice(0, 5);
    return picks.length ? { picks } : null;
  },
};
