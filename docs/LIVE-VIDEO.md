# Live video

Everything for live video is built, except the video player itself. It stays
**off and hidden** until you're ready.

## What's built

- **Go live** (the red LIVE circle at the top of Home): a title, and who can
  watch. You can pick your circle, your network, or everyone. Your circle gets
  a notification.
- **Live now** row on Home: the people you can watch right now.
- The **live page**: the video, live comments, **End live video** for the host,
  and **Report** for viewers.
- Rules the server enforces:
  - Only the people you chose can watch, and blocked people never can.
  - Only the host can send video.
  - Comments are limited to 3 every 10 seconds.
  - A live video ends by itself after 2 hours (`live_max_minutes`).
  - Videos aren't recorded.

## What it needs (when you're ready)

1. **An Apple Developer account** and a **TestFlight build**. Live video uses the
   camera and streaming code that Expo Go doesn't include, so it can't be tested
   in Expo Go. See `docs/TESTFLIGHT.md`.
2. **A LiveKit account** (livekit.io → LiveKit Cloud). It's free to start, with a
   monthly allowance of free minutes. After that it's pay per minute watched;
   check their pricing page for current numbers.
3. **Add three GitHub secrets** (GitHub → the repo → Settings → Secrets and
   variables → Actions). Get them from LiveKit Cloud → your project → Settings → Keys:
   - `LIVEKIT_URL` (starts with `wss://`)
   - `LIVEKIT_API_KEY`
   - `LIVEKIT_API_SECRET`

   Never paste these into a chat.
4. **Tell me**, and I'll finish the last step:
   - add LiveKit's app library and the camera/microphone permissions
   - connect the video area (`src/components/live/LiveVideo.tsx`)
   - turn on `live_video_enabled`
   - build for TestFlight

## Safety

Apple requires apps with live video to let people report and block, and to act on
reports. Both are in place: Report is on every live video, and moderators see
reports in **Admin → Reports**.
