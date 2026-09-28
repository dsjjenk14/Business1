/**
 * Icebreaker Generator.
 *
 * Method: the database gathers what you could already see about the person
 * (interests, groups, vouch words, usual nights and spots, a few recent posts
 * shown to you) and what you share (interests, groups, spots, nights, mutual
 * friends). The AI writes three different openers: one from something you
 * share, one from something they've posted or done, and one light question.
 * No message content is ever used.
 *
 * Each new set uses one AI use. A set stays saved for a week.
 */
import { userRpc } from '../../_shared/http.ts';
import { dataBlock, VOICE } from '../../_shared/claude.ts';
import { clean, type Feature } from './types.ts';

type Facts = Record<string, unknown> & { them: { first_name: string } };
type Out = { icebreakers: string[] };
export type IcebreakersResult = { icebreakers: string[] };

export const icebreakers: Feature<Facts, Out, IcebreakersResult> = {
  scope: (ctx) => ctx.userId,
  person: (ctx) => ctx.subject,
  ttlMinutes: 7 * 24 * 60,
  counts: () => true,
  async gather(ctx) {
    if (!/^[0-9a-f-]{36}$/.test(ctx.subject)) return { error: 'Bad request', status: 400 };
    const r = await userRpc<Facts>(ctx.req, 'ai_icebreaker_facts', { p_person: ctx.subject });
    if (!r.ok || !r.data) return { error: 'Not available.', status: 404 };
    return { facts: r.data };
  },
  ask: (f) => ({
    system: VOICE,
    prompt: [
      dataBlock('conversation', f),
      `Write 3 different first messages I (the "me" person) could send ${f.them.first_name}. ` +
        'One from something we share, one from something they have posted or done, and one easy, specific question. ' +
        'Each under 25 words, casual, no greetings like "Hey there", no flattery about looks, and nothing that sounds like a pickup line.',
    ].join('\n\n'),
    schema: {
      type: 'object',
      properties: { icebreakers: { type: 'array', items: { type: 'string' } } },
      required: ['icebreakers'],
      additionalProperties: false,
    },
  }),
  finish(_f, out) {
    const list = (out.icebreakers ?? []).map((s) => clean(s, 200)).filter(Boolean).slice(0, 3);
    return list.length ? { icebreakers: list } : null;
  },
};
