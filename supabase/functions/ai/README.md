# AI features (`ai` Edge Function)

Every AI feature in I'm In runs here, on our server. **Members don't need an AI
account.** The server calls Claude (Anthropic's AI) with one key the business
owns, `ANTHROPIC_API_KEY`, and the business pays per use. The key never goes in
the app.

Each feature is its own module in `features/`, with its method written at the
top of the file. How they all work:

1. **Facts come from the database, as the member.** The function calls the
   database with the member's own login, so it only ever sees what that member
   could already see in the app. Circle-only posts never feed matches or the AI
   Read, and messages are never used.
2. **Plain math first.** Where a feature has a score (People like you, intro
   odds), the database computes it. It's free, instant and works even with AI
   off. The AI adds the judgment and the words on top.
3. **The AI answers in a fixed shape** (JSON Schema), and the answer is checked
   against the facts. For example, people it names must be in the list, and
   events it picks must be on tonight. Anything off is dropped.
4. **Results are saved** (`ai_cache`), so opening the same thing again is free.
5. **Free members get 3 AI uses; Premium is unlimited** (`plan_limits.ai_uses`).
   Only something a member asks for counts. Saved results and the automatic
   daily People like you picks are free.

| Feature | Where | Method | Saved for | Uses one AI use |
|---|---|---|---|---|
| People like you (`people_like_you`) | Home, Circles → Network | The database ranks up to 15 people you could meet by shared interests, groups, spots, nights out, mutual friends and area. The AI picks the best 5 and says why. | 1 day | Only "Refresh" |
| Icebreakers (`icebreakers`) | Someone's profile | Three openers from what you share and what they've posted that you can see. | 1 week | Yes |
| Tonight for You (`tonight`) | Menu, Tonight tab | What's on tonight near you and where your people are heading. The AI picks one top pick and two alternatives, with reasons. | 2 hours | Yes |
| Intro odds (`intro_odds`) | Make an Intro | The score and signals are plain math (see `intro_odds` in migration 036). The AI only writes the "why". | 1 week | Yes ("Explain with AI") |
| AI Read (`profile_read`) | Every profile | Up to 3 badges and a two-sentence read from public activity: vouch words, groups, public events, open plans. Everyone sees the same read. | 1 week | Yes, once, for whoever asks first |

Not built yet: Momentum Score and Trust Monitor (scheduled jobs, not AI calls),
and chat-based badges (opt-in only).

## The model

`claude-opus-5-5` with low effort, since these are short everyday tasks. Server-side
fallbacks are on (`fallbacks: "default"`), so a declined request is retried on a
fallback model in the same call. If the AI still declines, times out or gives an
unusable answer, the member sees a friendly message and the plain version still
works. Nothing is saved or counted.

Rough cost: about 1–3 cents per AI answer at current prices. Opening a saved
result costs nothing.

## Setup

1. Create a key at console.anthropic.com (Settings → API keys) on the
   business's account, and add billing there.
2. In GitHub: repo → Settings → Secrets and variables → Actions → New
   repository secret, named `ANTHROPIC_API_KEY`. Paste the key there only,
   never in chat or in the code.
3. The next deploy copies it into Supabase. Until then, AI features show
   "coming soon" and everything else keeps working.

## Testing locally

Point the SDK at a stand-in server by setting `ANTHROPIC_BASE_URL` (plus any
`ANTHROPIC_API_KEY`) in the functions env file, so tests don't spend money. The
database side is covered by `supabase/tests/database/020_ai.test.sql`.
