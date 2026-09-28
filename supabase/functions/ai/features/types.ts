/** The shape every AI feature module follows (see ../README.md). */
export type Ctx = { req: Request; userId: string; subject: string; refresh: boolean };

export type Gathered<F, R> = { facts: F } | { empty: R } | { error: string; status: number };

export type Feature<F = any, O = any, R = any> = {
  /** Whose result this is: the member's id, or 'all' when everyone sees the same one. */
  scope: (ctx: Ctx) => string;
  /** The person this result is about, if any (so it's deleted with their account). */
  person?: (ctx: Ctx) => string | null;
  /** How long a result stays fresh. */
  ttlMinutes: number;
  /** Whether making a new one uses one of the member's AI uses. */
  counts: (ctx: Ctx) => boolean;
  /** Collect the facts, as the member (so it only sees what they could see). */
  gather: (ctx: Ctx) => Promise<Gathered<F, R>>;
  /** What to ask the AI. */
  ask: (facts: F) => { system: string; prompt: string; schema: Record<string, unknown>; maxTokens?: number };
  /** Check the AI's answer against the facts and shape what the app gets. Null = unusable. */
  finish: (facts: F, out: O) => R | null;
};

export const clean = (s: unknown, max: number) =>
  typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, max) : '';
