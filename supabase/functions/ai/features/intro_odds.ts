/**
 * Intro Success Prediction.
 *
 * Method: the score itself is plain math in the database (see intro_odds in
 * migration 036), so it's free and updates live as you change who's picked:
 * it starts at 25 and adds points for shared interests, groups, spots, nights
 * out and extra mutual friends, living nearby, both being active lately and
 * your own intro track record, capped between 5 and 95.
 *
 * This module only adds the AI's two-sentence explanation of that score,
 * when you tap Explain. That uses one AI use and stays saved for a week.
 */
import { userRpc } from '../../_shared/http.ts';
import { dataBlock, VOICE } from '../../_shared/claude.ts';
import { clean, type Feature } from './types.ts';

type Facts = { score: number; band: string; a: string; b: string; signals: { label: string; good: boolean }[]; facts: Record<string, unknown> };
type Out = { reasoning: string };
export type IntroOddsResult = { reasoning: string; score: number };

const UUID = /^[0-9a-f-]{36}$/;

export const introOdds: Feature<Facts, Out, IntroOddsResult> = {
  scope: (ctx) => ctx.userId,
  ttlMinutes: 7 * 24 * 60,
  counts: () => true,
  async gather(ctx) {
    const [a, b] = ctx.subject.split(':');
    if (!UUID.test(a ?? '') || !UUID.test(b ?? '')) return { error: 'Bad request', status: 400 };
    const r = await userRpc<Facts>(ctx.req, 'intro_odds', { p_a: a, p_b: b });
    if (!r.ok || !r.data) return { error: 'You can only check intros between people you know.', status: 403 };
    return { facts: r.data };
  },
  ask: (f) => ({
    system: VOICE,
    prompt: [
      dataBlock('intro', f),
      `I'm thinking of introducing ${f.a} and ${f.b}. The app rates the chance they actually meet up within 30 days at ${f.score}%. ` +
        'In 2 short sentences (under 40 words total), tell me why, using only the facts given, and one thing I could mention in the intro to help it land.',
    ].join('\n\n'),
    schema: {
      type: 'object',
      properties: { reasoning: { type: 'string' } },
      required: ['reasoning'],
      additionalProperties: false,
    },
  }),
  finish(f, out) {
    const reasoning = clean(out.reasoning, 320);
    return reasoning ? { reasoning, score: f.score } : null;
  },
};
