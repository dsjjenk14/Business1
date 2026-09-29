# Live video and virtual event rooms

## Virtual events (built, needs the same LiveKit keys)

Group admins can make an event **Online** or **Both** (in person and online) and
pick how people join:

- **Video call**: everyone on camera
- **Voice chat**: everyone can talk, no cameras
- **Livestream**: the host and the group's admins on camera; everyone else
  watches, chats and sends reactions (heart, fire, raise hand)
- **Your own link**: Zoom, Google Meet, Instagram Live, YouTube and so on.
  Only people going see the link.

The room opens 15 minutes before the start, only for the host, the group's
admins and people who said I'm In. Chat isn't saved and nothing is recorded.

**Phones:** Expo Go can't do live audio and video, so tapping Join opens the
same room in the browser. It works on iPhone Safari, with no sign-in needed:
the link carries a pass for that one room. The App Store build can open rooms
inside the app later.

**Turning it on:** the same three LiveKit secrets as live video (below). Until
they're set, "Join" says rooms are coming soon, and "Your own link" works
already. LiveKit Cloud is free to start, then paid per participant-minute:
a 10-person, 1-hour video call is 600 participant-minutes. Check their pricing
page.


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
