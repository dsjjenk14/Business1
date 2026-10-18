# Voice experiments (for `docs/proposals/voice.md`)

The scripts behind section 1 of `docs/proposals/voice.md`, kept so the checks can be re-run and
so the voice Playwright test (voice.md 3.7) has something to start from. They are throwaway
experiment code, not part of the game: nothing in `src/`, `web/` or `deploy/` uses them.

| File | What it is |
|---|---|
| `relay.mjs` | Experiment 1: a stand-in for the LIVÉRA server's voice role (`ws` 8). It owns positions, links two people within 60 m, and relays offers, answers and ICE candidates only inside a pair it linked. Serves `page.html` on port 8099 (`PORT` changes it; of the scripts, only `test.mjs` follows `PORT`). |
| `page.html` | One "phone": fake microphone, one WebRTC call per link, sends only to the people in `voice_reach`, reports `getStats` and a WebAudio peak. |
| `test.mjs` | The 15 checks (in range, out of range, forged offer, walking into range, whisper, hanging up) with three headless Chromium pages. |
| `scale.mjs` | N pages standing together, all in say; counts the one-way links that carry audio. |
| `turn.cjs` | `node-turn` 0.0.6 on 127.0.0.1:3478, standing in for coturn. |
| `sdpsize.mjs` | Size of an audio-only offer and its ICE candidates. |
| `lk/lktest.mjs`, `lk/lkpage.html` | Experiment 2: whether a LiveKit server (`livekit-server-sdk` 2.19.1, `livekit-client` 2.23.0) can decide who hears whom. |

## Running them

Needs Node 18+ (run with 22) and Playwright with its Chromium (run with 1.56 and Chromium 141).
`test.mjs`, `scale.mjs`, `sdpsize.mjs` and `lk/lktest.mjs` load Playwright from the global
install at `/opt/node22/lib/node_modules/` (where the cloud container has it); elsewhere, change
that path in the `createRequire` line.

```bash
cd livera/docs/proposals/voice_experiment
npm ci                       # ws and node-turn, from package-lock.json

node relay.mjs &             # the stand-in server, port 8099
node test.mjs                # Experiment 1 with Chrome's fake beep: prints "15/15 passed"
WAV=voice.wav node test.mjs  # the same with a recording as the microphone (see below)
node turn.cjs &              # then the same through the TURN relay only:
WAV=voice.wav node test.mjs turn:127.0.0.1:3478 relay
WAV=voice.wav node scale.mjs 8
node sdpsize.mjs             # needs the relay running (it opens a page from it)
```

`WAV` is any 16-bit PCM WAV that Chrome accepts for `--use-file-for-fake-audio-capture`. The
runs in voice.md used `voicelike.wav`, a 20 s, 48 kHz mono voice-like file that is **not** kept
here (1.9 MB, and where it came from wasn't recorded). The checks pass with any sound, but the
bitrate depends on it: voice.md's 22.8 kbps Opus payload came from that file, while a re-run of
`test.mjs` from this folder with the fake beep (18 October 2026, 15/15) measured 8.7 kbps.

Experiment 2 needs a `livekit-server` v1.13.10 binary on 127.0.0.1:7880. GitHub release
downloads were blocked in the container, so it was built from the module source fetched through
the Go module proxy, with Go 1.26.9 (`go install ...@v1.13.10` refuses, because that module's
`go.mod` has replace directives): download the module, copy its directory out of the module
cache, and run `go build ./cmd/server` in the copy. Then:

```bash
livekit-server --dev --bind 127.0.0.1 --node-ip 127.0.0.1 &
cd lk && npm ci && node lktest.mjs   # prints checks 1-6; voice.md has the results table
```

`--dev` uses LiveKit's placeholder key `devkey` and secret `secret`, which is what `lktest.mjs`
signs its tokens with. Nothing here holds a real secret.
