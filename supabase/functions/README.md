# Edge Functions

Server code that runs on Supabase. The app calls these with `supabase.functions.invoke(name)`.
Secrets (Twilio, Anthropic, etc.) live only here, never in the app.

| Function | What it does |
|---|---|
| `auth-phone-login` | Log in with phone number + password. Same answer for unknown numbers and wrong passwords. Rate-limited per number. |
| `phone-verify-start` | Texts a 6-digit code to the member's phone (Twilio). Rate-limited. |
| `phone-verify-check` | Checks the code, marks the phone verified. 5 tries per code, 10-minute expiry. |
| `ai` | All AI features (People like you, icebreakers, Tonight for You, intro odds). Members don't need an AI account: it uses the business's Anthropic key. See `ai/README.md`. |
| `delete-account` | Deletes the signed-in member's account: hands off their groups, removes their photos, deletes their login (everything else cascades). Needs `{ "confirm": "DELETE" }`. |

## Secrets

Set in the Supabase dashboard (Project → Edge Functions → Secrets), or locally in `supabase/functions/.env`:

| Name | Needed for | Notes |
|---|---|---|
| `TWILIO_ACCOUNT_SID` | SMS | From the Twilio console |
| `TWILIO_AUTH_TOKEN` | SMS | From the Twilio console |
| `TWILIO_FROM_NUMBER` | SMS | Your Twilio number, e.g. `+12025550123` |
| `ANTHROPIC_API_KEY` | AI features | From console.anthropic.com. Without it, AI features say "coming soon". Pay per use. |
| `IMIN_ENV` | Safety | Set to `production` in production. Disables demo codes. |

Without the Twilio secrets, SMS runs in **demo mode**: nothing is sent, and (outside production)
the code is shown on screen so the flow can be tested end to end.
