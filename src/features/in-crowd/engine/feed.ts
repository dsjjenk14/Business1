import type { RequestKind } from './types';

/**
 * The live feed under the party: what the guests are posting about you.
 * `{h}` is the poster's handle, `{dish}` what they ate.
 */
export const GOOD: string[] = [
  'this party is a whole vibe',
  '{me} remembered my order. Iconic behavior',
  'posting this venue on my story right now',
  'best-run event of the year, no notes',
  'whoever planned this, I owe you',
  'hydrated, charged, glowing. Thank you {me}',
  'the service here is unreal',
  'ten out of ten, would attend again',
  'my followers are SO jealous right now',
  '{me} is the main character tonight',
];

export const GOOD_FOR: Partial<Record<RequestKind, string[]>> = {
  drink: ['this mocktail has more layers than my skincare routine', 'the mocktails here are elite', 'perfect ice-to-mocktail ratio. Science'],
  charger: ['1% to 100%. {me} saved my content', 'phone revived. The content continues', 'never been so happy to see a cable'],
  glam: ['touch-up kit came in clutch', 'face is BACK', 'blotted, powdered, ready for my close-up'],
  light: ['ring light secured. The angles are angling', 'lighting so good I look airbrushed', 'finally, flattering light'],
  contract: ['just signed a brand deal at a party. Iconic', 'new partnership loading', 'my manager is going to cry (happy)'],
  selfie: ['selfie with the planner. Framing it', 'got a pic with {me} before she gets famous', 'photo dump incoming'],
  food: ['rating this {dish} a solid ten', 'the {dish} here could have its own account', 'eating good tonight'],
  plate: ['they cleared my plate before I even asked', 'clean table, clean feed'],
};

export const BAD: string[] = [
  'unfollowed the party: "this is giving 2014"',
  'left: "waited so long my phone updated twice"',
  'left early. Their story just says "never again"',
  'walked out mid-stream. Brutal',
  'is gone. "Do not tag me in this"',
];

export function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '');
}
