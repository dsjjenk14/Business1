/**
 * Going Out Recommendation ("Tonight for You").
 *
 * Method: the database lists what's on tonight near you (events you can see,
 * starting in the next few hours) and the spots your people are heading to,
 * with who's going: friends by name, how many one intro away, and how many
 * friends there you haven't vouched for yet. The AI picks one top pick and two
 * alternatives, and says why: who'll be there, how it grows your network, and
 * whether it's a chance to vouch.
 *
 * Each new pick uses one AI use and stays saved for two hours.
 */
import { userRpc } from '../../_shared/http.ts';
import { dataBlock, VOICE } from '../../_shared/claude.ts';
import { clean, type Feature } from './types.ts';

type Option = {
  key: string; kind: 'event' | 'spot'; id: number; title: string; where: string | null; area: string | null;
  starts?: string; friends_going: string[]; network_going: number; going?: number; price?: string | null;
};
type Facts = { now: string; options: Option[]; me: Record<string, unknown> };
type Out = { pick: { key: string; headline: string; reasons: string[] }; alternatives: { key: string; reason: string }[] };
type Shown = { key: string; kind: Option['kind']; id: number; title: string; where: string | null; area: string | null; starts: string | null; friends_going: string[]; network_going: number };
export type TonightResult = { pick: (Shown & { headline: string; reasons: string[] }) | null; alternatives: (Shown & { reason: string })[] };

const shown = (o: Option): Shown => ({
  key: o.key, kind: o.kind, id: o.id, title: o.title, where: o.where, area: o.area,
  starts: o.starts ?? null, friends_going: o.friends_going ?? [], network_going: o.network_going ?? 0,
});

export const tonight: Feature<Facts, Out, TonightResult> = {
  scope: (ctx) => ctx.userId,
  ttlMinutes: 120,
  counts: () => true,
  async gather(ctx) {
    const [opts, me] = await Promise.all([
      userRpc<{ now: string; options: Option[] }>(ctx.req, 'ai_tonight_options'),
      userRpc<Record<string, unknown>>(ctx.req, 'ai_profile_facts', { p_person: ctx.userId }),
    ]);
    if (!opts.ok || !opts.data) return { error: 'Couldn’t load tonight.', status: 500 };
    if (!opts.data.options.length) return { empty: { pick: null, alternatives: [] } };
    return { facts: { ...opts.data, me: { interests: me.data?.interests, usual_nights: me.data?.usual_nights, favorite_spots: me.data?.favorite_spots } } };
  },
  ask: (f) => ({
    system: VOICE,
    prompt: [
      `It is ${f.now} in DC.`,
      dataBlock('me', f.me),
      dataBlock('tonight', f.options),
      'Choose my best plan for tonight from <tonight>, plus up to 2 alternatives, using the exact key values. ' +
        'Prefer where my friends are going, then where I could meet people one intro away, then what fits my interests. ' +
        'Skip anything I am already going to unless it is clearly the best. ' +
        'For the pick: a headline under 10 words, and 2 or 3 short reasons (under 16 words each) covering who will be there, ' +
        'how it grows my network, and any friend there I could vouch for. For each alternative: one reason under 16 words.',
    ].join('\n\n'),
    schema: {
      type: 'object',
      properties: {
        pick: {
          type: 'object',
          properties: { key: { type: 'string' }, headline: { type: 'string' }, reasons: { type: 'array', items: { type: 'string' } } },
          required: ['key', 'headline', 'reasons'],
          additionalProperties: false,
        },
        alternatives: {
          type: 'array',
          items: {
            type: 'object',
            properties: { key: { type: 'string' }, reason: { type: 'string' } },
            required: ['key', 'reason'],
            additionalProperties: false,
          },
        },
      },
      required: ['pick', 'alternatives'],
      additionalProperties: false,
    },
  }),
  finish(f, out) {
    const byKey = new Map(f.options.map((o) => [o.key, o]));
    const top = out.pick && byKey.get(out.pick.key);
    if (!top) return null;
    const alternatives = (out.alternatives ?? [])
      .filter((a) => a.key !== top.key && byKey.has(a.key))
      .slice(0, 2)
      .map((a) => ({ ...shown(byKey.get(a.key)!), reason: clean(a.reason, 140) }));
    return {
      pick: { ...shown(top), headline: clean(out.pick.headline, 80), reasons: (out.pick.reasons ?? []).map((r) => clean(r, 140)).filter(Boolean).slice(0, 3) },
      alternatives,
    };
  },
};
