# Proposal: proximity voice in the web client

**Status: proposal (October 2026), not yet a decision.** The owner asked for proximity voice "as soon as possible" in the 2.5D web client (D-045), with the same three volumes as text chat. This report compares three ways to build it, records two experiments run in the cloud container, and gives one recommended design with a plan. When it is accepted it needs a new entry in `docs/DECISIONS.md` (the voice part of D-019 is already superseded by D-045).

# Verdict: proximity voice

## In plain words
- **What to build:** voice that goes straight from phone to phone. The LIVÉRA server decides who is connected to whom, using the same rules as text chat:
  - **whisper:** one person within 2 m;
  - **say:** everyone within 20 m;
  - **shout:** everyone within 60 m;
  - **inside a building:** everyone in the building hears say and shout, until buildings get rooms.
- **How it stays private:** your voice only leaves your phone toward the people the server says can hear you right now. A hacked app cannot listen in across town, because nobody's phone ever sends it their voice.
- **Your internet address stays hidden:** by default the audio passes through a small relay program (coturn) on your own server, so friends never see each other's home internet address. The relay can't understand the audio: it is encrypted from phone to phone.
- **It works, and was tested here:** two and three simulated phones (headless Chrome) talked through a stand-in for the LIVÉRA server. Audio flowed only between people in range. A cheating client was refused. Whisper reached only its target. Leaving range hung up the call. This also worked through a relay, and with 8 people all talking in one group.
- **How soon:** about 2 weeks of Claude Code work after Phase 0:
  - safety tools first, about 3–4 days: block, report, admin kick, mute and ban, and an 18+ confirmation;
  - then voice itself, about 5–6 days;
  - then about 1 day of testing on real phones with you.
- **What it costs:** nothing extra. The relay runs on the server you already rent. Voice uses roughly 30 GB of server traffic a month for 5 friends playing 2 hours a day with push-to-talk (an estimate), well inside a normal plan.
- **What you need to do:**
  - agree the house rules and the 18+ wording;
  - decide whether a report may include the last few lines of text chat the reporter heard (never audio);
  - spend one evening testing on your phone with a friend: an iPhone, an Android phone, and Bluetooth earbuds if you use them.
- **What we will not do:** record voice. Ever, by default.
- **Not chosen for now:**
  - **LiveKit on your server:** a good voice server, but in our test it could not stop a modified app from listening to everyone in its room unless each phone also polices itself. That is the same promise as the simpler peer-to-peer design, with more to run.
  - **LiveKit Cloud:** about $50 a month at your usage. It sends voice through a company's servers, in the US by default.

---

## 1. What was tested in this container (October 2026)

GitHub release downloads are blocked here. The npm registry and the Go module proxy work. Chromium 141 (headless) and Playwright 1.56 are installed. All scripts are in the session scratchpad (`phase0/voice/`), not in the repo. Every number below came from running them.

### Experiment 1: peer-to-peer audio through a server-gated relay (Option A)

**Setup:**
- A 100-line Node relay (`relay.mjs`, using `ws` 8) plays the LIVÉRA server's part. It owns positions, links two people when they are within 60 m, and tells both sides to connect (`voice_peers add`) or hang up (`remove`).
- It relays offers, answers and ICE candidates **only inside a pair it created**.
- It tells each speaker whom their voice reaches (`voice_reach`).
- Three headless Chromium pages run with `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`.
- One run used Chrome's fake beep. Another fed a 20 s voice-like WAV (`--use-file-for-fake-audio-capture`).

| Check | Result |
|---|---|
| A and B 10 m apart, C 500 m away: A linked only to B, C linked to nobody | PASS |
| A receives B's audio and B receives A's (`getStats` inbound `bytesReceived` > 0) | PASS |
| The audio is not silence (WebAudio analyser peak 0.61–1.1) | PASS |
| A modified client C sends a forged offer to A: relay refuses (`not_in_range`); A never sees it | PASS |
| C walks to 15 m: linked to A and B, and receives A's say | PASS |
| A whispers to B at 1.5 m: B keeps receiving A; bystander C at 15 m gets **0 bytes** in 3 s (`RTCRtpSender.replaceTrack(null)`) | PASS |
| C walks away: both of C's links hang up | PASS |
| **Total: 15/15**, with the fake beep and with the voice-like WAV | PASS |
| Same test forced through a TURN relay (`iceTransportPolicy: "relay"`, the pure-JS `node-turn` 0.0.6 standing in for coturn, which can't be installed here): path `relay/udp` | **15/15** |
| 8 pages standing together, all in say: 56 of 56 one-way links carry audio | PASS (desktop CPU, **not** a phone) |

**Measured on one Opus stream** (voice-like signal, Chrome defaults, `minptime=10;useinbandfec=1`, 50 packets/s):
- Opus payload: 22.8 kbps.
- RTP headers: 11.5 kbps.
- Everything on the connection, including SRTP and RTCP: 42.7 kbps.
- IP and UDP headers add about 11 kbps (28 bytes × 50 packets/s, calculated, not measured).
- **That is about 54 kbps per stream each way.**
- An audio-only offer was 1.3–1.4 KB, far below the 16 KB line limit (one network interface; phones with Wi-Fi plus mobile data and TURN will be bigger).

**What this proves:**
- Option A can be built and tested end to end in this container, including a Playwright test with fake microphones.
- A refused signal really stops a call.
- Whisper really sends audio to one person.

**What it does not prove:**
- Phone CPU and battery.
- iOS Safari, which can't run here.
- Real NAT traversal across the internet.
- coturn itself.

### Experiment 2: can a LiveKit server decide who hears whom? (Option B)

**Setup:**
- The LiveKit server binary normally comes from GitHub releases (blocked here). Instead it was built from source: `livekit-server` **v1.13.10**, through the Go module proxy with Go 1.26.9.
- It ran with `--dev` on 127.0.0.1.
- Headless Chromium used `livekit-client` 2.23.0.
- The "game server" used `livekit-server-sdk` 2.19.1 (`RoomServiceClient`, `AccessToken`).

| # | Check | Result |
|---|---|---|
| 1 | B joins with `canSubscribe: false` and `autoSubscribe: true`. Does it get A's audio? | No (correct) |
| 2 | The server calls `updateSubscriptions("town", "b", [A's track], true)` while B has `canSubscribe: false` | **API answers 200, but B never receives audio.** The server log shows `executing subscribe` and nothing more. |
| 3 | The server calls `updateParticipant(b, {permission: {canSubscribe: true}})`, then `updateSubscriptions` | B receives A |
| 4 | A modified client M joins with `canSubscribe: true` and `autoSubscribe: false`, then calls `setSubscribed(true)` on every track itself | **M hears A and B** (eavesdropping possible) |
| 5 | A's own app calls `setTrackSubscriptionPermissions(false, [{participantIdentity: "b", allowAll: true}])` | M is cut off (`permission a not_allowed`); B keeps hearing A |
| 6 | Every participant sees every other participant's identity in the room | Yes: M saw `["a", "b"]` |
| – | Memory | 68 MB idle, about 100 MB with 3 audio participants (RSS) |

**Why check 2 fails:**
- In v1.13.10, `SubscriptionManager.subscribe` returns `ErrNoSubscribePermission` whenever `!Participant.CanSubscribe()`, whoever asked ([subscriptionmanager.go:790](https://github.com/livekit/livekit/blob/v1.13.10/pkg/rtc/subscriptionmanager.go)).
- `RoomService.UpdateSubscriptions` reaches the same code through `Room.UpdateSubscriptions → SubscribeToTrack` (`pkg/rtc/room.go:1361`).
- LiveKit's docs reportedly say an admin can subscribe a participant "even if they do not have canSubscribe permission" ([Room service API](https://docs.livekit.io/reference/other/roomservice-api.md), as quoted by a search engine; the page could not be opened from here). The open-source server tested here does not behave that way. LiveKit Cloud might; that is unverified.
- `ForwardParticipant` and `MoveParticipant`, which could build per-listener rooms, return `"not implemented"` in the open-source server (`pkg/service/roommanager.go:912-918`).
- `livekit-client` also opens every new publisher to everyone by default: the server log shows `subscriptionPermission: {allParticipants: true}` right after joining. So there is a short window before an honest app narrows it.

**Conclusion:**
- With self-hosted LiveKit, either everyone can subscribe to anything in the room (check 4), or the server can't subscribe anyone (check 2).
- What remains is the publisher's own app limiting who may subscribe (check 5). That is the **same "honest sender" guarantee** as the peer-to-peer design, plus a roster leak and a startup window.

### What could not be checked from here
- **The web pages themselves:**
  - `WebFetch` failed with DNS errors on every host, MDN included.
  - The proxy refused `docs.livekit.io` and `livekit.com` (HTTP 403).
  - LiveKit doc and pricing claims below therefore come from search-engine summaries of those pages, and are marked.
- **Devices:** no iPhone, Android phone or Bluetooth headset is available. Phone behaviour comes from bug trackers and developer reports, and must be tested on your phones.

---

## 2. The options compared

| | **A: peer-to-peer, server-gated, coturn relay (recommended)** | **B: LiveKit self-hosted on the VPS** | **C: LiveKit Cloud** |
|---|---|---|---|
| Who decides who hears whom | The LIVÉRA server links pairs and relays their setup messages; each speaker's app sends only to the people the server names. A receiver can't get audio from a phone that was never told to connect to it. | Check 2 shows the server can't subscribe a participant without `canSubscribe`; with `canSubscribe` a modified app can subscribe to anyone (check 4). Only the publisher's own app can restrict listeners (check 5). | Same API. Docs say admins can override `canSubscribe`; unverified. |
| Built and tested here | **Yes, 15/15 checks, also through TURN** | Built from source, API behaviour tested | No (needs an account) |
| Extra monthly cost (5 players, 2 h/day) | **$0.** About 30 GB/month of relay traffic with push-to-talk, about 120 GB with open mic (worst case, estimate). | $0 software. About 100 MB RAM. More open ports. | 5 × 120 min × 30 days = 18,000 participant-minutes. The free Build plan includes 5,000; Ship is $50/month with 150,000 ([LiveKit plans](https://livekit.com/pricing.md) via search summary; [Fora Soft](https://www.forasoft.com/blog/article/livekit-vs-agora-cost-analysis)). **About $50/month (unverified).** |
| Phone load | One upload per listener while talking. Fine for a handful. Mesh guidance says 3–6 people before upload and CPU suffer, mostly for video ([BlogGeek.me](https://bloggeek.me/webrtc-p2p-mesh/), [Stream](https://getstream.io/resources/projects/webrtc/architectures/p2p/)). Capped at 8 links (below). | One upload per phone. Best for big groups. | Same as B |
| Privacy | Relay-only by default: peers see only the VPS address. Audio is encrypted end to end (DTLS-SRTP); the relay can't decode it. Nobody learns who else is in voice. | Audio is decrypted on your VPS (unless LiveKit's end-to-end encryption is added). Everyone in a room sees everyone in it. | Audio passes through LiveKit's servers. Project data is in the US by default, EU (Frankfurt) if chosen at creation. Network region pinning needs the Scale plan ([data residency](https://docs.livekit.io/deploy/admin/regions/data-residency), [region pinning](https://docs.livekit.io/deploy/admin/regions/region-pinning.md)). |
| Running it | One `apt install coturn`, a 15-line config, UFW for 3478 and a small UDP range | Docker setup from `livekit/generate`, or the binary. Ports 7881/tcp, 50000–60000/udp (or 7882/udp mux), TURN 3478/udp and 5349 or 443 for TLS ([firewall](https://docs.livekit.io/transport/self-hosting/ports-firewall.md), [VM deploy](https://docs.livekit.io/transport/self-hosting/vm.md)). Its generated Caddy clashes with ours. | An account and API keys; the game server mints tokens |
| Grows to | About 8 people in earshot of each other on phones (estimate; to measure on devices) | Hundreds | Hundreds |
| **Verdict** | **Build now** | Keep as the plan if crowds of more than 8 become normal | Not worth $50/month or the data leaving your server |

**Option D, for later and not tested:** an SFU that the game server controls completely, such as mediasoup. There, consumers exist only when server code creates them. It is the only design where a modified *sender* is also contained. It is much more work, and its native worker downloads from GitHub, so it can't be built here.

---

## 3. Recommended design (Option A)

### 3.1 The rule, stated once
**Your voice leaves your phone only toward people the server says hear you now. Your phone plays a voice only while the server says that person is talking to you.**

Both sides are honest clients following the server. So one modified app can neither pull audio out of anyone, nor push audio at someone the server didn't connect it to.

What a modified app *can* still do:
- record what it legitimately hears. That's true of text too, and can't be prevented.
- keep its own microphone sending to peers it is linked to. Their apps mute it unless the server says it is talking to them.

### 3.2 Hearing comes from the same code as text
- Add `World::hears(listener, speaker, volume)` and make `World::say` use it. Then text and voice can never disagree:
  - whisper: the target only, and only if `together(…, whisper_range_m)`;
  - say: `together(…, hearing_range_m)`;
  - shout: `together(…, shout_range_m)`.
- `together()` already means:
  - outdoors: within the range;
  - inside: same building, any distance;
  - never across a wall.
- **Indoor caveat (until rooms, Phase 1):**
  - inside a building, say and shout reach everyone in it;
  - a whisper reaches its target anywhere in the building;
  - everyone else inside sees "Maya whispers to Leila".
- The voice UI must say this inside buildings: "Indoors: everyone in the building hears you."

### 3.3 Server state (in memory only, never saved)
`World` keeps:
- **voice-joined characters:** set by `voice_join`, cleared by `voice_leave` or disconnect;
- **each speaker's mode:** `off | whisper | say | shout`, plus `to` for a whisper;
- **the link set:** unordered pairs, with an initiator;
- **the last `reach` sent to each speaker** and the last `talking` set sent to each listener.

No save-format change and no migration: voice state is session state, like the `people` snapshot.

**Links**, computed at the end of every `advanceRealTime` tick, right after `emitPeopleChanges`:
- A pair is linked when:
  - both are voice-joined and online;
  - neither blocks the other (section 4);
  - they are `together(a, b, shout_range_m)`.
- That is the loudest anyone can be heard, so a shout never waits for a call to be set up.
- Linked people are always in sight, because `sight_range_m` ≥ `shout_range_m` (contract 1.1). The client always has their position from the `people` stream.
- Each person gets at most `voice_max_peers` links, nearest first:
  - a new data value in `simulation.json`, default 8;
  - `ContentDatabase` checks that it is between 1 and 16.
- When someone has more people in earshot than that, their client says so honestly ("Voice: the 8 nearest people are connected").
- The initiator is the character id that sorts first. Only one side ever makes the offer, so offers never collide.

**Reach**, per speaker per tick: whom `hears()` says their current mode reaches, limited to linked people.

### 3.4 Protocol additions (`livera/1`)

**Ops** (all require `playing`; `id` stays the request id):

| Op | Arguments | Reply | Refusals |
|---|---|---|---|
| `voice_join` | none | `{ice_servers: [{urls: [...], username, credential}], relay_only: true, max_peers: 8, credential_ttl_s: 3600}` | `forbidden` (`bot_` accounts: scripts never speak), `not_playing` |
| `voice_leave` | none | `{}` | none |
| `voice_mode` | `mode` (`off`, `whisper`, `say`, `shout`), `to` (whisper only) | `{mode, reach: [character ids]}` | `voice_off` (not joined), `target_unavailable`, `too_far` (whisper beyond 2 m outdoors), `muted` (admin mute), `invalid_mode` |
| `voice_signal` | `to`, `kind` (`offer`, `answer`, `candidate`), `sdp` (string ≤ 8 KB) or `candidate` (`{candidate, sdpMid, sdpMLineIndex}`, strings ≤ 512) | `{}` | `not_linked` (the server has not linked you two), `invalid_signal`, `voice_off` |

**Events** (each sent at most once per tick per player, and only when something changed):

```json
{"event": "voice_peers", "data": {
  "add":    [{"character": "maya", "initiator": true}],
  "remove": [{"character": "dax", "reason": "out_of_range"}]}}

{"event": "voice_reach", "data": {"mode": "say", "to": ["maya", "leila"]}}

{"event": "voice_talking", "data": {"changes": [
  {"character": "maya", "mode": "say", "distance_m": 12},
  {"character": "dax", "mode": "off"}]}}

{"event": "voice_signal", "data": {"from": "maya", "kind": "offer", "sdp": "v=0..."}}
```

| Event | Who gets it | What it means |
|---|---|---|
| `voice_peers` | Both sides of a pair | Open or close a call. `remove.reason`: `out_of_range`, `went_inside`, `went_outside`, `left_voice`, `left_world`, `blocked`. |
| `voice_reach` | The speaker | Whom your voice reaches **now**. It changes as people walk. The client attaches the microphone track only on those calls (`replaceTrack(track)` or `replaceTrack(null)`, tested above). |
| `voice_talking` | Each listener in reach | Who is talking to you and how loud (`distance_m` outdoors only). The client plays a call's audio only while its speaker is listed. |
| `voice_signal` | The other side of a linked pair | The relayed setup message, with `from` set by the server |

The existing `whispering` event gains `"voice": true` when the whisper is spoken. Onlookers within say range see the leaning in, never the words or the audio.

**Where it lives:**
- **`World` (core, tested in `test_world.cpp`):** `voiceJoin`, `voiceLeave`, `voiceMode` (validates like `say`), `relayVoiceSignal(actor, to, payload)` (checks the link, then emits `voice_signal` to `to`), `emitVoiceChanges()`, and `setVoiceBlocked(a, b, bool)` (section 4).
- **`Server`:** mints TURN credentials, because HMAC needs OpenSSL and core must not depend on it. It refuses `bot_` accounts. It gives `voice_signal` its own rate bucket (20/s, bursts of 60), because ICE candidates come in bursts. It gives `voice_mode` a bucket too (5/s, bursts of 10), since push-to-talk toggles.
- **The gateway** stays a pipe. Signals fit in its 16 KB message limit.

**How it hooks into what Phase 0 builds:**
- Same tick, after the `people` stream, so a link never appears before the person does.
- Same `together()` rule as `speech` and `whispering`.
- Disconnect drops links with `left_world`, just as the `people` snapshot is dropped.
- Scripted characters are never in voice.

### 3.5 TURN relay (coturn on the same VPS)
- **Why a relay at all:** about 10–25% of real-world WebRTC sessions can't connect directly and fall back to TURN ([Metered](https://www.metered.ca/blog/what-is-a-turn-server/), [No Jitter](https://www.nojitter.com/video-conferencing/know-where-to-turn-when-deploying-webrtc)).
- **Why always use it:** relay-only also keeps players' home addresses private. That is real-world information rule 5 would not show anyone. It is on by default, with a setting "Direct voice (shows your internet address to people you talk to)" for anyone who wants lower delay.
- **Install:** `apt install coturn`. Ubuntu 24.04 ships 4.6.1-1build4 ([packages.ubuntu.com](https://packages.ubuntu.com/noble/coturn)).
- **Config (`/etc/turnserver.conf`):**
  - `listening-port=3478`
  - `fingerprint`
  - `use-auth-secret` and `static-auth-secret=<random>` (the "TURN REST API" scheme: username `expiry:character`, password `base64(HMAC-SHA1(secret, username))`; [coturn man page](https://dyn.manpages.debian.org/jessie/coturn/coturn.1.en.html))
  - `realm=<domain>`
  - `external-ip=<VPS IP>`
  - `min-port=49160` and `max-port=49200` (a 5-player game needs about 20 allocations)
  - `no-cli`
  - `no-multicast-peers`
  - `denied-peer-ip` for 10/8, 172.16/12, 192.168/16 and 127/8, so nobody can use the relay to reach services on the VPS itself
  - `total-quota` and `user-quota`
- An Ubuntu walk-through with `use-auth-secret` exists ([HCL guide](https://help.hcl-software.com/sametime/v1203/admin/turnserver_ubuntu.html)). Whether 24.04 still needs `TURNSERVER_ENABLED=1` in `/etc/default/coturn` is **unverified**.
- **Firewall:** UFW allows 3478/udp, 3478/tcp and 49160–49200/udp.
- **TURN over TLS:** 5349 can be added later if a friend's network blocks UDP. Port 443 is Caddy's.
- **Server flags:**
  - `--turn-url turn:<domain>:3478`
  - `--turn-secret-file /etc/livera/turn.secret` (a file, not argv, so `ps` doesn't show it)
  - `--turn-ttl 3600`
- **Without them:** `voice_join` still works. It returns no relay and `relay_only: false`, and the client warns that addresses are visible.
- **Hosted fallback:** Cloudflare's TURN gives 1,000 GB/month free, then $0.05/GB ([Cloudflare pricing](https://developers.cloudflare.com/realtime/sfu/platform/pricing/)). Its credentials come from Cloudflare's API, so the gateway or server would need an HTTP call and an API key. Only worth it if coturn misbehaves.

**Bandwidth estimate:**
- A stream is about 54 kbps (measured above).
- Relayed both sides, each spoken second can cross the VPS up to four times per listener.
- 5 players each talking 30 minutes a day to 4 listeners comes to about 1 GB/day, about 30 GB/month.
- Open mic for 2 hours is about 4×.
- Check the plan you rent; small VPS plans usually include at least 1 TB (not verified for your provider).

### 3.6 Client design (`web/client/voice.js` plus UI)

**Turning voice on:**
- A "Voice" toggle; voice is off by default.
- The first tap does everything iOS requires inside one user gesture:
  - `getUserMedia({audio: {echoCancellation: true, noiseSuppression: true, autoGainControl: true}})`;
  - `AudioContext.resume()`;
  - a silent buffer to unlock playback;
  - `navigator.audioSession.type = "play-and-record"` where it exists (experimental, [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Audio_Session_API); its behaviour on iOS 17–18 is mixed per [WebKit 264473](https://bugs.webkit.org/show_bug.cgi?id=264473)).
- Then it sends `voice_join`.
- **Why that order:**
  - Microphone access needs HTTPS (the deploy uses Caddy; [MDN getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)).
  - iOS needs a tap before any audio plays. Permission to use the microphone does not include permission to use the speaker ([webrtcHacks](https://webrtchacks.com/autoplay-restrictions-and-webrtc/), [WebKit 177292](https://bugs.webkit.org/show_bug.cgi?id=177292)).
  - A "Join audio" tap is the pattern LiveKit users report fixes most "can't hear anyone" cases on Safari ([LiveKit community](https://community.livekit.io/t/seeking-react-patterns-to-gracefully-handle-safaris-strict-autoplay-policies-and-background-audio-suspension-for-ios-users/1649)).

**Push-to-talk by default on phones:**
- A large Talk button, at least 64 px, next to the chat bar's Whisper / Say / Shout switch, which it shares.
- Hold to talk: `pointerdown` sends `voice_mode`; `pointerup`, `pointercancel` and the page being hidden send `off`.
- A "tap to latch" option for accessibility.
- **Why push-to-talk:**
  - no accidental hot microphone in a game with adult themes;
  - less echo on speakerphone;
  - less battery and data.
- Open mic is a desktop setting for people with headphones (v2).

**Whisper:** picks from people within 2 m, exactly like the text whisper. Holding Talk in whisper mode sends audio to that one call only.

**Mic indicator, always visible while voice is on:**
- grey "Voice on: listening";
- red "Talking: say, 3 people hear you", with the names from `voice_reach`;
- "Nobody can hear you" when the reach is empty.
- The browser's and the phone's own microphone indicator stays on while voice is on, because the microphone is held open so talking starts instantly. The UI says so in the voice settings.

**Who's talking:**
- a ring and the voice volume on their pin;
- "Maya (say, 12 m)" in a small list.

**Per-person mute:**
- on their person card;
- local and remembered in `localStorage`;
- instant.
- It is separate from **Block** (section 4), which the server enforces.

**Distance falloff is cosmetic, on top of the server's decision:**
- The server decides *whether* you hear someone.
- The client only shapes *how loud*, using:
  - the distance from the `people` positions;
  - `gain = 1` up to a quarter of the range, falling smoothly to 0.3 at the edge, never 0 (if the server says you hear them, you do);
  - left or right by bearing (`StereoPannerNode`; `PannerNode` distance models are an option, [MDN](https://developer.mozilla.org/docs/Web/API/PannerNode/distanceModel));
  - indoors: flat volume (no distances inside yet).
- **Platform caveats (must be tested on devices):**
  - iOS ignores `audio.volume` (always 1), so volume must go through a WebAudio `GainNode` ([WebKit 151589](https://bugs.webkit.org/show_bug.cgi?id=151589), [Apple forum](https://developer.apple.com/forums/thread/82939)).
  - Chromium historically did not echo-cancel audio played through WebAudio, only through media elements ([Atmoky known issues](https://docs.atmoky.com/known-issues), [Babylon.js forum](https://forum.babylonjs.com/t/browser-audio-cancellation-doesnt-work-using-babylons-sound-component/16759)). Chrome-wide echo cancellation fixes this on desktop and ChromeOS from about Chrome 111/116 ([Zoom dev forum](https://devforum.zoom.us/t/issupportchromewideaec-sniffs-browser-name-version-breaking-echo-cancellation-on-microsoft-edge/145288)). Android is unknown.
  - So on Android Chrome, use the `<audio>` element's volume for falloff; on iOS, use a GainNode.
  - Recommend earphones in the help text.

**Background and lock screen:**
- Voice is a foreground feature.
- iOS has ended microphone capture when Safari or a home-screen app goes to the background. Reports vary by version and are worst in home-screen mode (WebKit reports [204681](https://bugs.webkit.org/show_bug.cgi?id=204681), [226620](https://bugs.webkit.org/show_bug.cgi?id=226620), [236509](https://bugs.webkit.org/show_bug.cgi?id=236509), [273938](https://bugs.webkit.org/show_bug.cgi?id=273938)).
- Chrome on Android has stopped capture shortly after the screen turns off (older reports: [W3C list](https://lists.w3.org/Archives/Public/public-webrtc-logs/2020Mar/0129.html), [Chromium review](https://codereview.chromium.org/2263373003)).
- So:
  - on `visibilitychange` to hidden: send `voice_mode off`;
  - on return: if the track's `readyState` is `"ended"`, call `getUserMedia` again and `replaceTrack`. No renegotiation is needed.
  - The server keeps links while the socket lives.

**Bluetooth:**
- Opening the microphone switches most Bluetooth headsets to the hands-free profile, which lowers playback quality while voice is on ([Daily](https://www.daily.co/blog/why-bluetooth-audio-quality-suffers-in-video-calls/), [Unity Vivox](https://docs.unity.com/en-us/vivox-core/developer-guide/android/bluetooth-profile-comparison)).
- A later setting, "Bluetooth-friendly: open the mic only while holding Talk", trades the first half-second of speech for music-quality playback in between. Untested.

**Fewer setup messages:**
- Wait up to 1.5 s for ICE gathering to finish and send one offer with its candidates.
- Trickle only latecomers.
- That keeps a crowd of 8 well under the rate limits.

### 3.7 Tests the server change needs
**`tests/test_world.cpp`:**
- **Links:**
  - two voice-joined people outdoors at 59 m are linked, with exactly one initiator; at 61 m they are not;
  - walking apart removes the link (`out_of_range`); going inside removes it (`went_inside`);
  - two people in the same building at any distance are linked; different buildings never are;
  - only voice-joined people are linked; `voice_leave` gives `left_voice`; disconnect gives `left_world`;
  - the `voice_max_peers` cap with 10 people: nearest first, never more.
- **Reach:**
  - say reaches 20 m and not 21; shout reaches 60 m;
  - whisper reaches only its target within 2 m (`too_far` and `target_unavailable` refusals);
  - `off` reaches nobody;
  - reach updates as people walk across the boundary.
- **Equivalence:** for random positions, indoors and out, voice reach equals the text `say` `heard_by` for the same volume.
- **Talking:**
  - listeners in reach get `voice_talking` with mode and distance, and an `off` change when it stops;
  - nobody outside reach ever does;
  - whisper onlookers get `whispering` with `voice: true` and no `voice_talking`.
- **Relay:**
  - `relayVoiceSignal` between a linked pair emits `voice_signal` to the other with the server-set `from`;
  - an unlinked pair is refused with `not_linked`, including right after a link is removed;
  - a signal to yourself, an oversized `sdp` and a bad `kind` give `invalid_signal`.
- **Blocks:**
  - a blocked pair is never linked;
  - an existing link is removed with `blocked`;
  - text `speech` is not delivered between them either.
- **Admin mute:** `voice_mode say` is refused with `muted`, and the reach empties.
- **Data:** `voice_max_peers` outside 1–16 is refused by `ContentDatabase`.

**`tests/test_server.cpp`:**
- voice ops before `play` give `not_playing`;
- `bot_` accounts get `forbidden`;
- TURN credentials: format `expiry:character`, and HMAC-SHA1 against a known test vector;
- `voice_signal` rate limiting carries `re`;
- two sessions end to end: join, `voice_peers`, a relayed offer.

**`web/` Playwright:** the experiment above, pointed at the real gateway and server:
- three pages with fake microphones;
- `bytesReceived` only within reach;
- a forged signal is refused;
- whisper reaches one person;
- leaving range hangs up;
- once through `node-turn` with relay-only.

---

## 4. Safety first: what must exist before voice goes live

D-025 makes LIVÉRA adults-only with mature themes. ROADMAP already says moderation comes before voice. For a friends-only invite server, the minimum is:

| # | Tool | What it does | Server-enforced? | Days |
|---|---|---|---|---|
| 1 | **Block** | `block {character}` and `unblock`, stored per **account** (so it follows the person across characters), with a migration for a `blocks` table. While both are in the world: no voice link, no `speech` or `whispering` either way, no `message` or `request` from them. You still see them walk, because the town is shared. `Server` maps account blocks onto played characters with `World::setVoiceBlocked` / `setBlocked` when sessions enter (like `setScripted`). | Yes | 1.5 |
| 2 | **Report** | `report {character, reason, note}` appends to a `reports` table (migration): reporter, reported account and character, time, place, reason and note. Owner CLI: `livera_server --db FILE --list-reports`. **Owner decision:** whether a report may also attach the last 20 text lines the reporter heard, from a 10-minute in-memory buffer. Audio is never kept. | Yes | 1 |
| 3 | **Admin kick, mute, ban** | `--admins USER,...` flag. Ops `admin_kick {account}`, `admin_mute {character, minutes}` (in memory) and `admin_ban {account, reason}` (migration: `accounts.banned_at`, checked at `login` and `resume`). CLI `--ban-account` and `--unban-account`. A small owner panel in the client. | Yes | 1–1.5 |
| 4 | **House rules + 18+** | At first login: "I am 18 or older and agree to the house rules", stored with the account (migration). You only invite adults you know. | Yes | 0.5 |
| 5 | **Consent and visibility** | Voice off by default. The browser's microphone prompt only after a tap. A visible mic state at all times (3.6). Per-person mute. Mute-all in one tap. | Client | in voice work |
| – | **Never record** | No server or client code records audio. The TURN relay sees only encrypted packets. Any future recording would need a decision, a visible "recording" banner and everyone's opt-in. | By design | – |

**Total: about 4–4.5 days, or about 3 days for block, report and admin kick and ban only.** Rule 9 applies: three new tables or columns, so migrations appended to `kMigrations`, each with a test.

### Legal notes in plain words (not legal advice)
- **Recording:**
  - Don't record voice.
  - In many US states everyone in a conversation must agree before it is recorded, for example California, Florida, Illinois and Washington ([Citizen Media Law Project via Journalist's Resource](https://journalistsresource.org/?p=20525), [Metaverse Law](https://www.metaverselaw.com/two-party-consent-requirements-for-recording-calls-2/)).
  - Friends may live in different states or countries. The safe rule is "never, unless everyone opts in first".
  - In the UK and EU, recordings of voices are personal data.
- **Adults only:**
  - The game has sexual themes (fade to black, D-025).
  - The US Supreme Court upheld Texas's age-verification law in June 2025 for sites where more than a third of the content is sexual material harmful to minors ([Wikipedia](https://en.wikipedia.org/wiki/Free_Speech_Coalition_v._Paxton), [CRS](https://www.everycrsreport.com/files/2025-08-28_LSB11354_22855559d4cf482ef130608e56f124ae6084e9df.html)).
  - LIVÉRA is not that kind of site. Still, invite-only adults plus an 18+ confirmation is the sensible floor.
  - Get proper advice before ever opening to strangers or app stores.
- **UK users:**
  - Services where people talk to each other are "user-to-user services" under the Online Safety Act, with duties scaled to size: risk assessment, ways to report, and protecting children if they could get in ([Ofcom roadmap](https://www.ofcom.org.uk/online-safety/illegal-and-harmful-content/roadmap-to-regulation/), [Mayer Brown](https://www.mayerbrown.com/en/insights/publications/2025/08/the-online-safety-act-enters-phase-2)).
  - A private friends server is a small case. The block, report and ban tools above are the start of what it expects if it ever grows.
- **Addresses:** peer-to-peer voice can reveal home internet addresses. Relay-only by default avoids that. Say so in the help text.

---

## 5. Plan

| Phase | What | Days | Needs from you |
|---|---|---|---|
| V0 | Feasibility (this report): mesh, gated signalling, TURN path, 8-person mesh, LiveKit permissions | done | – |
| — | **Phase 0 finishes** (web client, gateway, deploy) | per `web_client.md` | VPS and domain |
| V1a | Safety: block, report, admin kick, mute and ban, 18+ and house rules, with migrations and tests | 3.5–4.5 | Approve the rules text; decide the report context |
| V1b | Voice server: `World` voice state, links, reach, talking, relay; `hears()` shared with text; TURN credentials; rate buckets; `voice_max_peers` in data; tests | 2–2.5 | – |
| V1c | Voice client: `voice.js`, Talk button with the three modes, mic indicator, who's talking, per-person mute, falloff, iOS unlock, visibility handling, relay-only setting; Playwright test with fake microphones | 2.5–3 | – |
| V1d | Deploy: coturn install and config, UFW ports, secret file, server flags, README section | 0.5 | Paste the update command |
| V1e | Real-device evening: iPhone Safari (tab and home screen), Android Chrome, Bluetooth earbuds, mobile data versus Wi-Fi; fix what breaks | 1 | One evening with a friend |
| **Total after Phase 0** | | **about 10–11 days (about 2 weeks)** | |
| V2 (later) | Indoor rooms (Phase 1 indoor acoustics, 2 days) so whisper, say and shout differ inside; open mic with voice activity for headphone users; the Bluetooth-friendly mode; stereo placement polish; LiveKit or a server-controlled SFU only if crowds of more than 8 become normal | – | – |

**Costs:** $0 extra per month for Option A (coturn on the existing VPS, about 30–120 GB/month of traffic as estimated). Compare about $50/month for LiveKit Cloud at this usage (unverified), and $0 but more upkeep for self-hosted LiveKit.

## 6. Risks
1. **Phones are untested.** CPU and battery with up to 8 calls, iOS background behaviour, home-screen mode and Bluetooth are all unmeasured here. Mitigation: V1e with your phones; the 8-link cap is in data, so it can be lowered without a release.
2. **Echo on speakerphone.** Echo cancellation through WebAudio is uneven across browsers (3.6). Mitigation: push-to-talk by default, the element volume on Android, earphones advice.
3. **Honest-client trust.** A modified app can record what it legitimately hears, and can try to send audio when it shouldn't (receivers mute it). That is the same as any voice app. Containing a modified sender completely would need Option D.
4. **Crowds.** More than 8 people within 60 m means the nearest-8 cap kicks in, honestly labelled. If that becomes normal, move to an SFU.
5. **Indoors is coarse** until rooms exist: the whole building hears say and shout.
6. **coturn exposure.** An open relay could be abused. Mitigation: time-limited HMAC credentials, peer-IP deny lists, quotas, `unattended-upgrades`.
7. **LiveKit docs versus code.** If LiveKit Cloud does let admins override `canSubscribe`, Option C would offer real server-side subscriptions. That would still cost money and send audio off your server. Re-check before ever switching.

## 7. Server changes, summarised
1. `World::hears(listener, speaker, volume)`, and `World::say` refactored onto it (no behaviour change). Test: the existing speech tests still pass.
2. In-memory voice state in `World`: joined set, modes, links, reach and talking snapshots. Commands `voiceJoin`, `voiceLeave`, `voiceMode`, `relayVoiceSignal`. Tests: section 3.7.
3. `emitVoiceChanges()` at the end of `advanceRealTime`, after `emitPeopleChanges`, emitting `voice_peers`, `voice_reach` and `voice_talking`. Tests: links, reach, talking, cap.
4. `whispering` gains `voice: true` for spoken whispers. Test: no text, no audio event for onlookers.
5. `simulation.json` gains `voice_max_peers` (default 8), validated 1–16. Test: refusal.
6. `Server`: ops `voice_join`, `voice_leave`, `voice_mode` and `voice_signal`; `bot_` refusal; rate buckets; TURN credentials (OpenSSL HMAC-SHA1) from `--turn-url`, `--turn-secret-file` and `--turn-ttl`. Tests: section 3.7.
7. Moderation (section 4): `block`, `unblock`, `report` and the admin ops; account bans checked at `login` and `resume`; CLI `--list-reports`, `--ban-account` and `--unban-account`; migrations for blocks, reports, bans and rules acceptance. Tests: each op's happy path and refusals, each migration, and that a blocked pair gets neither speech nor voice.
8. Docs: a new decision (voice design: peer-to-peer, server-gated, relay-only by default, never recorded); `MULTIPLAYER.md` (voice ops, events and rate limits; moderation moves from "Not yet" to built); `ROADMAP.md` status; the deploy README section for coturn.

---

**Files checked:**
- /home/user/Business1/livera/CLAUDE.md
- /home/user/Business1/livera/docs/proposals/web_client.md
- /home/user/Business1/livera/docs/DECISIONS.md (D-019, D-025, D-045)
- /home/user/Business1/livera/docs/MULTIPLAYER.md
- /home/user/Business1/livera/docs/ROADMAP.md
- /home/user/Business1/livera/data/config/simulation.json
- /home/user/Business1/livera/src/core/World.cpp (`say`, `together`, `presentWith`)
- /home/user/Business1/livera/src/core/World.h
- /home/user/Business1/livera/src/server/Server.h
- /home/user/Business1/livera/src/server/Server.cpp
- LiveKit server v1.13.10 source: `pkg/rtc/subscriptionmanager.go`, `pkg/rtc/room.go`, `pkg/service/roommanager.go`, `pkg/service/roomservice.go`
- `livekit-server-sdk` 2.19.1 and `@livekit/protocol` 1.51.0 type definitions

Only this file was written in the repo.
