# Edge Functions

Server code that runs on Supabase. The app calls these with `supabase.functions.invoke(name)`.
Secrets (Twilio, Anthropic, etc.) live only here, never in the app.

| Function | What it does |
|---|---|
| `auth-phone-login` | Log in with phone number + password. Same answer for unknown numbers and wrong passwords. Rate-limited per number. |
| `phone-verify-start` | Texts a 6-digit code to the member's phone (Twilio). Rate-limited. |
| `phone-verify-check` | Checks the code, marks the phone verified. 5 tries per code, 10-minute expiry. |

## Secrets

Set in the Supabase dashboard (Project → Edge Functions → Secrets), or locally in `supabase/functions/.env`:

| Name | Needed for | Notes |
|---|---|---|
| `TWILIO_ACCOUNT_SID` | SMS | From the Twilio console |
| `TWILIO_AUTH_TOKEN` | SMS | From the Twilio console |
| `TWILIO_FROM_NUMBER` | SMS | Your Twilio number, e.g. `+12025550123` |
| `IMIN_ENV` | Safety | Set to `production` in production. Disables demo codes. |

Without the Twilio secrets, SMS runs in **demo mode**: nothing is sent, and (outside production)
the code is shown on screen so the flow can be tested end to end.
