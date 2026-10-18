#!/usr/bin/env python3
"""LIVERA town director: plays founding characters nobody has claimed, as labelled scripts.

Spec: docs/MULTIPLAYER.md ("Scripted characters") and deploy/README.md.
Python 3 standard library only.

Each character gets its own TCP connection and its own script account, bot_<character id>
(made by the operator with `livera_server --db FILE --add-account bot_<id>`). The server labels
every character a bot_ account plays as "played by a script" and never lets a script claim one.

What a scripted character does, all as intents the server checks:
  * lives a day built from data: home (the property phone app, else the character's spawn
    location), workplace and shift length from the career (the career app, then data/careers),
    and the character's profile.schedule, whose activities are matched to places by name.
    Opening hours are respected: it only waits at a door when the place opens soon;
  * walks, rides the bus when that is clearly quicker, enters, buys an everyday thing where it
    goes, looks after the basics (bathroom, breakfast, a shower) and works its shifts;
  * goes to bed by leaving the world at night (the server's offline life takes over until the
    morning) and comes back at its wake-up time.
What it never does:
  * chat, message, interact with anyone or accept an ask: every ask is declined;
  * hold on to a character a person wants: on the `released` event it stops playing that
    character for the rest of the run, and a claimed character is left alone;
  * pretend: it sends intents only, and every outcome in its log is the server's reply;
  * spin: refusals back off with jitter, and every loop waits before it asks again.

Two small habits are the director's own, not character data, and are logged as such: a coffee
before some work days, and an outing on a free day. Everything else comes from data/.

Usage:
  town_director.py --password-file /etc/livera/director.env            # every founder
  town_director.py --characters dax,maya --port 27777 --once-seconds 300
  town_director.py --show-plans [--weekday monday]                     # print routines, no server
Passwords: LIVERA_BOT_PASSWORD_<ID> (e.g. LIVERA_BOT_PASSWORD_DAX) or LIVERA_BOT_PASSWORD, from
the environment or from --password-file (KEY=VALUE lines).
"""
from __future__ import annotations

import argparse
import collections
import glob
import json
import logging
import math
import os
import random
import re
import signal
import socket
import sys
import threading
import time
import unicodedata

LOG = logging.getLogger("director")
STOP = threading.Event()
WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
SHORT_DAY = {d: d[:3].capitalize() for d in WEEKDAYS}

# Tunables (game minutes unless noted). Kept here, not in data/, because they describe how this
# script behaves, not the world.
WAKE_BEFORE_FIRST = 60          # wake this long before the first scheduled thing
WAKE_EARLIEST, WAKE_LATEST = 5 * 60 + 30, 9 * 60
BED_AFTER_LAST = 120            # go to bed this long after the last scheduled thing
BED_EARLIEST, BED_LATEST = 22 * 60 + 30, 23 * 60 + 45
VISIT_MAX = 150                 # a scheduled visit lasts at most this long, then home
WAIT_FOR_OPENING = 45           # wait at a closed door only if it opens within this
TRAVEL_SLACK = 4                # leave for the next thing this much before the travel estimate
BUS_MIN_SAVING_S = 10           # real seconds the bus must save over walking
EVERYDAY_MAX_CENTS = 1500       # an "everyday thing" costs at most this
NEED_URGENT = {"bladder": 30, "hunger": 25, "energy": 10}
NEED_RECOVERED = {"bladder": 60, "hunger": 50, "energy": 30}
HOME_CARE = {"bladder": 50, "hunger": 50, "hygiene": 45, "energy": 30, "dental": 40}
MORNING_CARE = {"bladder": 95, "dental": 90, "hygiene": 80, "hunger": 80}
BED_CARE = {"bladder": 95, "dental": 90}


class ConnectionLost(Exception):
    pass


def jittered(seconds):
    return seconds * random.uniform(0.7, 1.3)


class Backoff:
    """Exponential backoff with jitter: base, 2*base, 4*base ... up to cap (real seconds)."""

    def __init__(self, base, cap):
        self.base, self.cap, self.n = base, cap, 0

    def next(self):
        d = min(self.cap, self.base * (2 ** self.n))
        self.n = min(self.n + 1, 16)
        return jittered(d)

    def reset(self):
        self.n = 0


def dist(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])


def hhmm(minute_of_day):
    m = int(minute_of_day) % 1440
    return f"{m // 60:02d}:{m % 60:02d}"


def money(cents):
    return "${:,.2f}".format((cents or 0) / 100)


# ----------------------------------------------------------------------------------------------
# Content: a read-only view of data/ (the same files the server loads)
# ----------------------------------------------------------------------------------------------
def _load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def open_at(hours, hour, weekday_index):
    """The server's OpeningHours rule: [open, close), wrapping past midnight; open_days 0=Monday."""
    if not hours:
        return True
    o, c = int(hours[0]), int(hours[1])
    if o == c:
        return True
    return hour >= o and hour < c if o < c else (hour >= o or hour < c)


class Content:
    def __init__(self, data_dir):
        self.data_dir = data_dir
        self.locations = {}
        for f in sorted(glob.glob(os.path.join(data_dir, "world", "*.json"))):
            for loc in _load(f).get("locations", []):
                self.locations[loc["id"]] = loc
        self.careers = {}
        for f in sorted(glob.glob(os.path.join(data_dir, "**", "*.json"), recursive=True)):
            doc = _load(f)
            if isinstance(doc, dict):
                for c in doc.get("careers", []) or []:
                    if isinstance(c, dict) and "id" in c:
                        self.careers[c["id"]] = c
        self.characters = {}
        for f in sorted(glob.glob(os.path.join(data_dir, "characters", "*.json"))):
            for ch in _load(f).get("characters", []):
                if ch.get("playable", False):
                    self.characters[ch["id"]] = ch
        self.lines, self.boarding_radius = [], 15.0
        for f in sorted(glob.glob(os.path.join(data_dir, "transit", "*.json"))):
            t = _load(f).get("transit", {})
            self.boarding_radius = float(t.get("boarding_radius_m", self.boarding_radius))
            self.lines.extend(t.get("lines", []))
        sim = _load(os.path.join(data_dir, "config", "simulation.json")).get("simulation", {})
        self.walk_speed = float(sim.get("walk_speed_mps", 6.0))
        self.minutes_per_second = float(sim.get("minutes_per_real_second", 1.0))
        self.entry_radius = float(sim.get("entry_radius_m", 5.0))
        self.by_name = {loc["name"]: lid for lid, loc in self.locations.items()}

    def name(self, lid):
        return self.locations.get(lid, {}).get("name", lid or "?")

    def door(self, lid):
        return tuple(self.locations[lid]["door"])

    def enterable(self, lid):
        return self.locations.get(lid, {}).get("enterable", True)

    def public(self, lid):
        return self.locations.get(lid, {}).get("access", "public") == "public"

    def hours(self, lid):
        return self.locations.get(lid, {}).get("hours")

    def is_open(self, lid, minute):
        loc = self.locations.get(lid, {})
        hours = loc.get("hours")
        if not hours:
            return True
        day = (minute // 1440) % 7
        days = loc.get("open_days")
        if days and day not in days:
            return False
        return open_at(hours, (minute % 1440) // 60, day)

    def opens_within(self, lid, minute, window):
        """Minutes until the place opens, if that is within `window`; 0 if open now; None otherwise."""
        for m in range(0, window + 1, 5):
            if self.is_open(lid, minute + m):
                return m
        return None

    def everyday_offers(self, lid):
        """Offers anyone might buy on an ordinary day: food, drink, a small treat. Not items,
        services, alcohol or anything illegal, and not over EVERYDAY_MAX_CENTS."""
        out = []
        for o in self.locations.get(lid, {}).get("offers", []):
            if o.get("illegal") or o.get("service") or o.get("item") or o.get("substance"):
                continue
            if o.get("price_cents", 0) > EVERYDAY_MAX_CENTS:
                continue
            if any(v > 0 for v in (o.get("needs") or {}).values()):
                out.append(o)
        return out

    def activity_for(self, lid, need):
        """The activity at this place that helps `need` most (from its data), or None."""
        best, gain = None, 0
        for a in self.locations.get(lid, {}).get("activities", []):
            g = (a.get("needs") or {}).get(need, 0)
            if g > gain:
                best, gain = a["id"], g
        return best

    def line_open(self, line, minute):
        h = line.get("hours")
        return open_at(h, (minute % 1440) // 60, 0) if h else True


# ----------------------------------------------------------------------------------------------
# Matching schedule text ("Gym or a run in Founders Park") to places, by name
# ----------------------------------------------------------------------------------------------
GENERIC = {"the", "a", "an", "and", "or", "of", "at", "in", "on", "to", "with", "co", "apt", "unit", "for",
           "by", "her", "his", "their", "she", "he", "it", "when", "whatever", "use", "take", "practice", "go",
           "s", "inc", "my", "your"}
SYNONYMS = {"run": "jog"}


def stem(w):
    if len(w) > 5 and w.endswith("ing"):
        return w[:-3]
    if len(w) > 3 and w.endswith("s") and not w.endswith("ss"):
        return w[:-1]
    return w


def tokens(text):
    t = unicodedata.normalize("NFKD", text)
    t = "".join(ch for ch in t if not unicodedata.combining(ch)).lower()
    return [stem(w) for w in re.findall(r"[a-z0-9]+", t)]


def key(text):
    return [w for w in tokens(text) if w not in GENERIC]


class Goal:
    """What a character is after: kind is home, work, place or sleep."""

    __slots__ = ("kind", "place", "activity", "why", "start", "end", "index", "habit")

    def __init__(self, kind, place=None, activity=None, why="", start=0, end=0, index=-1, habit=False):
        self.kind, self.place, self.activity, self.why = kind, place, activity, why
        self.start, self.end, self.index, self.habit = start, end, index, habit

    def ident(self):
        return (self.kind, self.place, self.activity, self.start)

    def __repr__(self):
        return f"{self.kind}:{self.place}:{self.activity}@{hhmm(self.start)}-{hhmm(self.end)}"


class Matcher:
    def __init__(self, content):
        self.c = content
        self.name_keys = {lid: key(loc["name"]) for lid, loc in content.locations.items()}
        self.type_keys = {lid: key(loc.get("type", "").replace("_", " ")) for lid, loc in content.locations.items()}
        self.act_keys, self.offer_keys = [], []
        for lid, loc in content.locations.items():
            if not content.public(lid):
                continue
            for a in loc.get("activities", []):
                k = key(a["id"].replace("_", " "))
                if k and a["id"] != "restroom":
                    self.act_keys.append((lid, a["id"], k))
            for o in loc.get("offers", []):
                k = key(o["id"].replace("_", " "))
                if k and not o.get("illegal"):
                    self.offer_keys.append((lid, o["id"], k))

    @staticmethod
    def _contiguous(seq, words):
        n = len(seq)
        return any(words[i:i + n] == seq for i in range(len(words) - n + 1))

    def match(self, text, home, workplaces):
        """Best (place, activity) for one alternative of a schedule line, or None. 'home' for home."""
        words = [SYNONYMS.get(w, w) for w in tokens(text)]
        wordset = set(words)
        if "home" in wordset:
            return ("home", None)
        scores = {}

        def offer(lid, score, activity=None):
            old = scores.get(lid)
            if not old or score > old[0]:
                scores[lid] = (score, activity or (old[1] if old else None))
            elif activity and not old[1]:
                scores[lid] = (old[0], activity)

        for lid, k in self.name_keys.items():
            if not k:
                continue
            if set(k) <= wordset:
                offer(lid, 10 + len(k))
                continue
            for n in range(len(k) - 1, 1, -1):  # "Common Ground" names "Common Ground Community Center"
                if self._contiguous(k[:n], words):
                    offer(lid, n)
                    break
        for lid, act, k in self.act_keys:
            if set(k) <= wordset:
                offer(lid, 5 + len(k), act)
        for lid, _offer, k in self.offer_keys:
            if set(k) <= wordset:
                offer(lid, 5 + len(k))
        for lid, k in self.type_keys.items():
            if k and self.c.public(lid) and set(k) <= wordset:
                offer(lid, 3)
        # Only places this character may walk into: public ones, their workplace, their home.
        allowed = {lid: s for lid, s in scores.items()
                   if self.c.public(lid) or lid in workplaces or lid == home}
        if not allowed:
            return None

        def rank(item):
            lid, (score, _) = item
            return (score, lid in workplaces, lid == home, self.c.public(lid), lid)

        lid, (score, act) = max(allowed.items(), key=rank)
        if score < 2:
            return None
        if act is None:  # a named place may also name what to do there ("Greater Hope service")
            for alid, aid, k in self.act_keys:
                if alid == lid and set(k) <= wordset:
                    act = aid
        return (lid, act)

    def alternatives(self, text, home, workplaces):
        out = []
        for part in re.split(r",|;|\bor\b", text):
            if part.strip():
                m = self.match(part, home, workplaces)
                if m and m not in out:
                    out.append(m)
        return out


def schedule_entries(schedule, weekday):
    """The schedule lines for a weekday: weekdays (Mon-Fri) or weekend lines, then that day's own
    lines, which win at the same time."""
    out = {}
    general = "weekdays" if WEEKDAYS.index(weekday) < 5 else "weekends"
    for name in (general, general[:-1], weekday):
        for e in schedule.get(name, []) or []:
            try:
                h, m = e["time"].split(":")
                out[int(h) * 60 + int(m)] = e.get("activity", "")
            except (KeyError, ValueError, AttributeError):
                continue
    return sorted(out.items())


class DayPlan:
    def __init__(self, daykey, weekday, wake, bed, blocks):
        self.daykey, self.weekday, self.wake, self.bed, self.blocks = daykey, weekday, wake, bed, blocks
        self.skipped = set()

    def awake(self, mod):
        return self.wake <= mod < self.bed

    def current(self, mod):
        for b in self.blocks:
            if b.start <= mod < b.end:
                return b
        return None

    def describe(self):
        parts = []
        for b in self.blocks:
            what = {"home": "home", "work": "work at {p}", "place": "{p}"}[b.kind].format(p=b.place)
            if b.activity:
                what += f" ({b.activity})"
            if b.habit:
                what += " [director habit]"
            parts.append(f"{hhmm(b.start)}-{hhmm(b.end)} {what}")
        return f"wake {hhmm(self.wake)}, bed {hhmm(self.bed)}: " + "; ".join(parts)


def build_plan(content, matcher, profile, ctx, daykey, weekday, rng):
    """One day's blocks from the schedule. ctx: home, workplaces, max_shift_hours, status."""
    schedule = (profile.get("profile") or {}).get("schedule") or {}
    entries = schedule_entries(schedule, weekday)
    home, workplaces = ctx["home"], ctx["workplaces"]
    first = entries[0][0] if entries else None
    last = entries[-1][0] if entries else None
    wake = min(max((first - WAKE_BEFORE_FIRST) if first is not None else 8 * 60 + 30, WAKE_EARLIEST), WAKE_LATEST)
    if first is not None and first < wake:
        wake = max(first - 30, 5 * 60)
    bed = min(max((last + BED_AFTER_LAST) if last is not None else 23 * 60, BED_EARLIEST), BED_LATEST)
    blocks = []

    def add(kind, start, end, place=None, activity=None, why="", habit=False):
        start, end = max(start, wake), min(end, bed)
        if end <= start:
            return
        if blocks and blocks[-1].kind == "home" and kind == "home":
            blocks[-1].end = end
            return
        blocks.append(Goal(kind, place if kind != "home" else home, activity, why, start, end, len(blocks), habit))

    add("home", wake, first if first is not None else bed, why="morning at home")
    worked = False
    for i, (t, text) in enumerate(entries):
        end = entries[i + 1][0] if i + 1 < len(entries) else bed
        alts = [a for a in matcher.alternatives(text, home, workplaces)
                if ctx["status"].get(a[0]) != "under_construction"]
        choice = rng.choice(alts) if alts else None
        if choice and choice[0] in workplaces and not worked:
            wend = min(end, t + int(ctx["max_shift_hours"] * 60))
            add("work", t, wend, choice[0], None, text)
            add("home", wend, end, why="after work")
            worked = True
        elif choice and choice[0] not in ("home", home):  # a visit (a workplace after the shift too)
            vend = min(end, t + VISIT_MAX)
            hours = content.hours(choice[0])
            if hours and int(hours[0]) < int(hours[1]) and t < int(hours[1]) * 60:
                vend = min(vend, int(hours[1]) * 60)  # leave by closing time
            add("place", t, vend, choice[0], choice[1], text)
            add("home", vend, end, why="home again")
        else:
            add("home", t, end, why=text)
    work = next((b for b in blocks if b.kind == "work"), None)
    # Director habit: a coffee before some work days, when a coffee shop is open and on the way.
    if work and rng.random() < 0.4:
        cafes = [lid for lid, loc in content.locations.items()
                 if loc.get("type") == "coffee_shop" and content.public(lid)]
        before = blocks[blocks.index(work) - 1] if blocks.index(work) > 0 else None
        cafe = min(cafes, key=lambda c: dist(content.door(c), content.door(work.place))) if cafes else None
        if cafe and before and before.kind == "home":
            h, c, w = content.door(home), content.door(cafe), content.door(work.place)
            detour = dist(h, c) + dist(c, w) - dist(h, w)
            to_work = math.ceil(dist(c, w) / content.walk_speed * content.minutes_per_second)
            start = work.start - 30 - to_work
            if detour <= 150 and start >= before.start + 20 and content.is_open(cafe, daykey_minute(daykey) + start):
                before.end = start
                blocks.insert(blocks.index(work), Goal("place", cafe, None, "coffee before work", start, work.start,
                                                       habit=True))
    # Director habit: an outing on a day with nothing scheduled.
    if not entries:
        def outing_spot(lid, loc):
            if not content.public(lid) or ctx["status"].get(lid, "open") == "under_construction":
                return False
            if loc.get("construction_project") and not ctx["status"]:
                return False  # status unknown (no server yet): don't plan around a building site
            if (loc.get("hours") or [0, 0])[0] >= 20:
                return False  # night spots aren't an afternoon outing
            if loc.get("enterable", True):
                return bool(content.everyday_offers(lid))
            return any(a["id"] != "restroom" for a in loc.get("activities", []))

        spots = [lid for lid, loc in content.locations.items() if outing_spot(lid, loc)]
        if spots:
            spot = rng.choice(sorted(spots))
            start = rng.choice([11 * 60, 14 * 60, 16 * 60])
            if content.is_open(spot, daykey_minute(daykey) + start) and blocks and blocks[0].kind == "home":
                tail = blocks[0].end
                blocks[0].end = start
                acts = [a["id"] for a in content.locations[spot].get("activities", []) if a["id"] != "restroom"]
                blocks.append(Goal("place", spot, acts[0] if acts and not content.enterable(spot) else None,
                                   "an outing", start, start + 90, habit=True))
                blocks.append(Goal("home", home, None, "home again", start + 90, tail))
    for i, b in enumerate(blocks):
        b.index = i
    return DayPlan(daykey, weekday, wake, bed, blocks)


def daykey_minute(daykey):
    """Absolute game minute at the start of a day key (year, month, day)."""
    y, mo, d = daykey
    return (((y - 1) * 12 + (mo - 1)) * 28 + (d - 1)) * 1440


WORLD_TIME = re.compile(r"(\w+), Year (\d+) Month (\d+) Day (\d+), (\d+):(\d+)")


# ----------------------------------------------------------------------------------------------
# One connection: newline-delimited JSON, replies matched by id, events queued
# ----------------------------------------------------------------------------------------------
class Conn:
    def __init__(self, host, port):
        try:
            self.sock = socket.create_connection((host, port), timeout=10)
        except OSError as e:
            raise ConnectionLost(f"can't connect to {host}:{port}: {e}") from None
        self.buf = b""
        self.next_id = 0
        self.events = collections.deque()

    def close(self):
        try:
            self.sock.close()
        except OSError:
            pass

    def _line(self, deadline):
        while True:
            nl = self.buf.find(b"\n")
            if nl >= 0:
                line, self.buf = self.buf[:nl], self.buf[nl + 1:]
                if not line.strip():
                    continue
                try:
                    return json.loads(line)
                except ValueError:
                    LOG.warning("ignoring a line that isn't JSON: %r", line[:120])
                    continue
            left = deadline - time.monotonic()
            if left <= 0:
                return None
            self.sock.settimeout(min(left, 1.0))
            try:
                chunk = self.sock.recv(65536)
            except socket.timeout:
                if STOP.is_set() and deadline - time.monotonic() > 2:
                    deadline = time.monotonic() + 2  # shutting down: don't sit out long waits
                continue
            except OSError as e:
                raise ConnectionLost(str(e)) from None
            if not chunk:
                raise ConnectionLost("the server closed the connection")
            self.buf += chunk
            if len(self.buf) > (8 << 20):
                raise ConnectionLost("a server line over 8 MB")

    def call(self, op, timeout=30.0, **args):
        self.next_id += 1
        rid = self.next_id
        req = {"id": rid, "op": op}
        req.update(args)
        try:
            self.sock.sendall((json.dumps(req) + "\n").encode())
        except OSError as e:
            raise ConnectionLost(str(e)) from None
        deadline = time.monotonic() + timeout
        while True:
            msg = self._line(deadline)
            if msg is None:
                raise ConnectionLost(f"no reply to {op} within {timeout:.0f} s")
            if "event" in msg:
                self.events.append(msg)
                continue
            re_ = msg.get("re")
            # Servers before livera/1 sent rate_limited and bad_request without `re`; only one
            # request is ever outstanding here, so such a reply is this one's.
            if re_ == rid or re_ is None:
                return msg

    def pump(self, seconds, wake_on=()):
        """Reads events for up to `seconds`; returns early when one named in wake_on arrives."""
        deadline = time.monotonic() + max(0.0, seconds)
        while not STOP.is_set():
            msg = self._line(deadline)
            if msg is None:
                return
            if "event" in msg:
                self.events.append(msg)
                if msg["event"] in wake_on:
                    return


# ----------------------------------------------------------------------------------------------
# One scripted character
# ----------------------------------------------------------------------------------------------
class Interrupted(Exception):
    """The server took the character away (released) or the account logged in elsewhere (kicked)."""


class Bot(threading.Thread):
    WAKE_EVENTS = ("released", "request", "kicked", "arrived")

    def __init__(self, director, cid, password):
        super().__init__(name=f"bot-{cid}", daemon=True)
        self.d, self.cid, self.password = director, cid, password
        self.c, self.matcher = director.content, director.matcher
        self.profile = self.c.characters[cid]
        self.username = "bot_" + cid.replace("-", "_")
        self.first = self.profile.get("first_name", cid)
        self.rng = random.Random(f"{cid}-{time.time()}")
        self.conn = None
        self.logged_in = self.playing = False
        self.finished = False           # never play this character again in this run
        self.stats = collections.Counter()
        self.plans = {}
        self.ctx = None                 # home, workplaces, max_shift_hours, place status
        self.ctx_day = None
        self.clock = (None, 0.0)        # (absolute game minute at the last look, monotonic time then)
        self.play_wait_until = 0.0
        self.play_backoff = Backoff(60, 1800)
        self.refusals = collections.Counter()
        self.cooldown = {}              # (action, target) -> monotonic time before which not to retry
        self.done = {}                  # goal ident -> what has been done on that visit today
        self.errand = None              # (need, Goal): an urgent need being dealt with
        self.heading = None             # where the current walk or ride is going
        self.riding = False
        self.routine_done = set()       # (daykey, "morning" | "bed")
        self.slept_on = None            # the day key of the night this character went to bed
        self.committed = None           # the next block (or ("sleep", day)) we already left for
        self.no_bus_until = 0.0
        self.pending_asks = []
        self.released = self.kicked = False
        self._last_once = None

    # -------------------------------------------------------------- logging
    def game_now(self):
        m, at = self.clock
        if m is None:
            return None
        return m + (time.monotonic() - at) * self.c.minutes_per_second

    def stamp(self):
        m = self.game_now()
        if m is None:
            return "--- --:--"
        return f"{SHORT_DAY[WEEKDAYS[(int(m) // 1440) % 7]]} {hhmm(m)}"

    def log(self, action, text, level=logging.INFO):
        LOG.log(level, "[%s] %-10s %-9s %s", self.stamp(), self.cid, action, text)

    def log_once(self, k, action, text):
        if self._last_once != k:
            self._last_once = k
            self.log(action, text)

    # -------------------------------------------------------------- requests and events
    def req(self, op, **args):
        """(ok, data or error). Polite about rate limits; notes events as they arrive."""
        if (self.released or self.kicked) and op != "logout":
            raise Interrupted()
        msg = self.conn.call(op, **args)
        self.handle_events()
        if msg.get("ok"):
            return True, msg.get("data") or {}
        err = msg.get("error") or {"code": "unknown", "message": str(msg)}
        if err.get("code") in ("rate_limited", "chat_rate_limited"):
            self.log("slow", f"the server asked us to slow down ({op}); pausing", logging.WARNING)
            self.conn.pump(jittered(5.0))
        return False, err

    def pause(self, seconds):
        """Waits, listening for events; returns early on one that matters."""
        self.conn.pump(seconds, self.WAKE_EVENTS)
        self.handle_events()

    def refused(self, action, target, err, backoff_base=3.0, cap=120.0):
        """Logs a refusal and backs off: base, 2x, 4x ... (with jitter) for this (action, target).
        Every action checks its cooldown before it asks again (see waiting())."""
        k = (action, target)
        self.refusals[k] += 1
        self.stats["refusals"] += 1
        wait = jittered(min(cap, backoff_base * (2 ** (self.refusals[k] - 1))))
        self.cooldown[k] = time.monotonic() + wait
        self.log("refused", f"{action} {target or ''}: {err.get('code')} ({err.get('message', '')}); "
                            f"not again for {wait:.0f} s", logging.WARNING)
        self.pause(min(wait, 5.0))

    def succeeded(self, action, target):
        self.refusals.pop((action, target), None)
        self.cooldown.pop((action, target), None)

    def cooling(self, action, target):
        return self.cooldown.get((action, target), 0) > time.monotonic()

    def waiting(self, action, target):
        """True (after a short wait) if this action is still backing off from a refusal."""
        left = self.cooldown.get((action, target), 0) - time.monotonic()
        if left <= 0:
            return False
        self.pause(min(left, 10.0))
        return True

    def handle_events(self):
        while self.conn and self.conn.events:
            ev = self.conn.events.popleft()
            kind, data = ev.get("event"), ev.get("data") or {}
            if kind == "released" and data.get("character") in (self.cid, None):
                self.released = True
            elif kind == "kicked":
                self.kicked = True
            elif kind == "request":
                self.pending_asks.append(data)
            elif kind == "arrived":
                self.riding = False

    def deal_with_asks(self):
        while self.pending_asks:
            ask = self.pending_asks.pop(0)
            rid = ask.get("id") or ask.get("request")
            if not rid:
                continue
            ok, r = self.req("respond", request=rid, accept=False)
            self.stats["asks_declined"] += 1
            self.log("decline", f"declines a '{ask.get('kind', '?')}' ask from {ask.get('from', 'someone')} "
                                "(scripts never accept asks)" + ("" if ok else f"; the server said {r.get('code')}"))

    # -------------------------------------------------------------- lifecycle
    def run(self):
        backoff = Backoff(5, 300)
        while not STOP.is_set() and not self.finished:
            try:
                self.session()
                backoff.reset()
            except ConnectionLost as e:
                self.logged_in = self.playing = False
                if self.kicked:
                    self.log("stop", "this script account logged in somewhere else; stopping so two directors "
                                     "never fight over one character", logging.ERROR)
                    self.finished = True
                    break
                if STOP.is_set():
                    break
                wait = backoff.next()
                self.log("offline", f"connection lost ({e}); reconnecting in {wait:.0f} s", logging.WARNING)
                STOP.wait(wait)
            except Exception:  # a bug must neither take the other characters down nor spin
                self.logged_in = self.playing = False
                wait = backoff.next()
                LOG.exception("[%s] %s: unexpected error; retrying in %.0f s", self.stamp(), self.cid, wait)
                STOP.wait(wait)
            finally:
                if self.conn:
                    self.conn.close()
                    self.conn = None
        self.log("done", "stopped. " + (", ".join(f"{k} {v}" for k, v in sorted(self.stats.items())) or "did nothing"))

    def session(self):
        self.conn = Conn(self.d.host, self.d.port)
        self.conn.pump(0.3)
        self.handle_events()
        self.logged_in = self.playing = False
        try:
            while not STOP.is_set() and not self.finished:
                self.deal_with_asks()
                if self.playing:
                    self.step()
                else:
                    self.offstage()
        except Interrupted:
            pass
        finally:
            if self.released:
                self.log("released", f"a person took {self.first}: the director stops playing them until it "
                                     "is restarted")
                self.finished = True
                self.playing = False  # the server already took them out of the world
            if self.kicked:
                self.finished = True
            if self.conn and (self.playing or self.logged_in) and not self.kicked:
                self.leave("the director is stopping" if STOP.is_set() else "")

    def leave(self, why):
        try:
            if self.playing:
                ok, look = self.req("look")
                if ok and look.get("you", {}).get("on_shift"):
                    self.end_shift()
            if self.logged_in:
                self.req("logout")
                self.log("logout", "logs out" + (f": {why}" if why else ""))
        except (ConnectionLost, Interrupted):
            pass
        self.logged_in = self.playing = False

    def server_clock(self):
        ok, h = self.req("hello")
        m = WORLD_TIME.search((h or {}).get("world_time", "")) if ok else None
        if not m:
            raise ConnectionLost("hello carried no world_time")
        weekday = m.group(1).lower()
        y, mo, d, hh, mm = (int(x) for x in m.groups()[1:])
        self.clock = (daykey_minute((y, mo, d)) + hh * 60 + mm, time.monotonic())
        return (y, mo, d), weekday, hh * 60 + mm

    def login(self):
        # Script accounts can't be registered (the server refuses bot_ names in `register`, dev
        # servers too): the operator makes them with livera_server --add-account.
        ok, r = self.req("login", username=self.username, password=self.password)
        if ok:
            self.logged_in = True
            return True
        code = r.get("code")
        wait = {"bad_credentials": 600, "login_throttled": 660}.get(code, 120)
        hint = (f"; make the account with livera_server --db FILE --add-account {self.username} and put its "
                "password in --password-file" if code == "bad_credentials" else "")
        self.log("login", f"{self.username} can't log in: {code} ({r.get('message')}){hint}; trying again in "
                          f"{wait / 60:.0f} min", logging.ERROR)
        self.conn.pump(jittered(wait), ("kicked",))
        return False

    def offstage(self):
        """Out of the world: asleep, waiting to be allowed back, or about to wake up."""
        daykey, weekday, mod = self.server_clock()
        plan = self.plan_for(daykey, weekday)
        if not plan.awake(mod) or self.slept_on == daykey:
            later = mod >= plan.wake or self.slept_on == daykey
            self.log_once(("asleep", daykey, later), "asleep",
                          f"out of the world until {'tomorrow morning' if later else hhmm(plan.wake)}")
            self.conn.pump(jittered(20), ("kicked",))
            return
        if time.monotonic() < self.play_wait_until:
            self.conn.pump(min(30.0, self.play_wait_until - time.monotonic()), ("kicked",))
            return
        if not self.logged_in and not self.login():
            return
        ok, r = self.req("play", character=self.cid)
        if not ok:
            code = r.get("code")
            if code == "unknown_character":
                self.log("stop", f"the server has no playable {self.cid}; stopping", logging.ERROR)
                self.finished = True
                return
            if code == "already_playing":
                self.playing = True
                return
            wait = self.play_backoff.next()
            if code == "character_claimed":
                wait = max(wait, jittered(1800))  # a person's character now; look again now and then
            self.play_wait_until = time.monotonic() + wait
            self.log("play", f"won't play {self.first}: {code} ({r.get('message')}); asking again in "
                             f"{wait / 60:.0f} min", logging.WARNING)
            return
        self.play_backoff.reset()
        self.playing = True
        self.errand = self.committed = self.heading = None
        self.riding = False
        self.stats["plays"] += 1
        self.observe(r)
        you = r.get("you", {})
        where = self.c.name(you.get("inside")) if you.get("inside") else f"outdoors at {you.get('position')}"
        self.discover(daykey)
        plan = self.plan_for(daykey, weekday)
        self.log("play", f"enters the world as {self.first} ({where}). Today: {plan.describe()}")

    def observe(self, look):
        t = look.get("time") or {}
        if "minute" in t:
            self.clock = (t["minute"], time.monotonic())
        return look

    def discover(self, daykey):
        """Where this character lives and works now (people move house and change jobs) and which
        places are still being built. Once a game day."""
        self.ctx_day = daykey
        home = self.profile.get("spawn_location")
        ok, prop = self.req("phone", app="property")
        if ok:
            for p in prop.get("properties", []):
                if p.get("lives_here") and p.get("location") in self.c.locations:
                    home = p["location"]
        career_id = (self.profile.get("career") or {}).get("id")
        workplaces = list(self.c.careers.get(career_id, {}).get("workplaces", []))
        ok, car = self.req("phone", app="career")
        if ok:
            if car.get("career") is None:
                workplaces, career_id = [], None
            else:
                found = [self.c.by_name[n] for n in car.get("workplaces") or [] if n in self.c.by_name]
                workplaces = found or workplaces
                career_id = next((k for k, v in self.c.careers.items() if v.get("name") == car.get("career")),
                                 career_id)
        max_h = float(self.c.careers.get(career_id, {}).get("max_shift_hours", 8)) if career_id else 8.0
        ok, mp = self.req("map")
        status = {p["id"]: p.get("status", "open") for p in mp.get("places", [])} if ok else {}
        old = self.ctx
        self.ctx = {"home": home, "workplaces": workplaces, "max_shift_hours": max_h, "status": status}
        if old is None or not old["status"]:
            self.plans = {}  # now we know which places are still being built
        elif (old["home"], old["workplaces"], old["max_shift_hours"]) != (home, workplaces, max_h):
            self.plans = {}  # rebuilt from the new home or job
            self.log("routine", f"lives at {self.c.name(home)}, works at "
                                f"{', '.join(self.c.name(w) for w in workplaces) or 'nowhere'}")

    def plan_for(self, daykey, weekday):
        if self.ctx is None:
            car = self.c.careers.get((self.profile.get("career") or {}).get("id"), {})
            self.ctx = {"home": self.profile.get("spawn_location"), "workplaces": list(car.get("workplaces", [])),
                        "max_shift_hours": float(car.get("max_shift_hours", 8)), "status": {}}
        if daykey not in self.plans:
            rng = random.Random(f"{self.cid}/{daykey}/{self.rng.random()}")
            self.plans = {daykey: build_plan(self.c, self.matcher, self.profile, self.ctx, daykey, weekday, rng)}
            self.done = {}
            self.committed = None
        return self.plans[daykey]

    # -------------------------------------------------------------- in the world
    def look(self):
        ok, r = self.req("look")
        if not ok:
            if r.get("code") in ("not_playing", "not_in_world", "not_logged_in"):
                self.log("left", f"the server says we're not in the world ({r.get('code')})", logging.WARNING)
                self.playing = False
                if r.get("code") == "not_logged_in":
                    self.logged_in = False
            return None
        return self.observe(r)

    def travel(self, pos, dest_xy, minute):
        """('walk', seconds) or ('bus', seconds, line, from_stop, to_stop), whichever is quicker; the bus
        only when it runs now, the trip is long enough and it saves BUS_MIN_SAVING_S."""
        ws = self.c.walk_speed
        best = ("walk", dist(pos, dest_xy) / ws)
        if time.monotonic() < self.no_bus_until or dist(pos, dest_xy) < self.d.bus_min_distance:
            return best
        for line in self.c.lines:
            stops = line.get("stops", [])
            if len(stops) < 2 or not self.c.line_open(line, minute):
                continue
            s1 = min(stops, key=lambda s: dist(pos, s["at"]))
            s2 = min(stops, key=lambda s: dist(dest_xy, s["at"]))
            if s1["id"] == s2["id"]:
                continue
            t = (dist(pos, s1["at"]) / ws + dist(s1["at"], s2["at"]) / float(line.get("speed_mps", 20))
                 + dist(s2["at"], dest_xy) / ws + 3)
            if t + BUS_MIN_SAVING_S < best[1]:
                best = ("bus", t, line, s1, s2)
        return best

    def eta_minutes(self, pos, place, minute):
        if not place or place not in self.c.locations:
            return 0
        return self.travel(pos, self.c.door(place), minute)[1] * self.c.minutes_per_second

    def step(self):
        look = self.look()
        if look is None:
            self.pause(jittered(5))
            return
        t = look["time"]
        daykey = (t.get("year", 1), t.get("month", 1), t.get("day", 1))
        weekday = str(t.get("weekday", "monday")).lower()
        minute = t["minute"]
        mod = minute % 1440
        if self.ctx_day != daykey:
            self.discover(daykey)
        plan = self.plan_for(daykey, weekday)
        you = look["you"]
        pos = tuple(you.get("position") or (0, 0))
        home = self.ctx["home"]
        if not plan.awake(mod):
            goal = Goal("sleep", home, why="bedtime")
        else:
            goal = plan.current(mod) or Goal("home", home, why="free time", start=mod, end=plan.bed)
            if goal.index in plan.skipped:
                goal = Goal("home", home, why=f"skipped {self.c.name(goal.place)}", start=goal.start, end=goal.end)
            routine_first = (goal.kind == "home" and (you.get("inside") or "") == home and mod < 12 * 60
                             and (daykey, "morning") not in self.routine_done)
            # Once on the way to the next thing, stay on the way: the travel estimate shrinks as we get
            # closer, and re-deciding from it would turn people around mid-trip.
            committed = self.committed
            if committed == ("sleep", daykey):
                goal = Goal("sleep", home, why="bedtime")
            elif (isinstance(committed, Goal) and committed in plan.blocks and committed.start > mod
                  and committed.index not in plan.skipped):
                goal = committed
            elif not (goal.kind == "work" and you.get("on_shift")) and not routine_first:
                nxt = plan.blocks[goal.index + 1] if 0 <= goal.index < len(plan.blocks) - 1 else None
                if nxt is None and goal.index < 0:
                    nxt = next((b for b in plan.blocks if b.start > mod), None)
                if nxt is not None:
                    if nxt.index not in plan.skipped and nxt.start - mod <= self.eta_minutes(pos, nxt.place,
                                                                                             minute) + TRAVEL_SLACK:
                        goal = self.committed = nxt
                elif plan.bed - mod <= self.eta_minutes(pos, home, minute) + TRAVEL_SLACK:
                    goal = Goal("sleep", home, why="bedtime")
                    self.committed = ("sleep", daykey)
        if goal.kind == "place" and goal in plan.blocks and not self.too_late_checked(goal, you, pos, plan, minute):
            return
        goal = self.urgent(look, goal, minute)
        self.pursue(look, goal, plan, minute)

    def too_late_checked(self, goal, you, pos, plan, minute):
        """False (after skipping it) if a visit can't fit any more: we'd arrive with under 10 minutes
        before having to leave for the next thing."""
        loc = self.c.locations.get(goal.place)
        if loc is None or (you.get("inside") or "") == goal.place:
            return True
        here = float(loc.get("outdoor_radius_m", 30)) if not loc.get("enterable", True) else self.c.entry_radius
        if dist(pos, self.c.door(goal.place)) <= here:
            return True  # already there
        mod = minute % 1440
        arrive = mod + self.eta_minutes(pos, goal.place, minute)
        leave_by = goal.end
        nxt = plan.blocks[goal.index + 1] if goal.index + 1 < len(plan.blocks) else None
        if nxt is not None and nxt.place and nxt.place in self.c.locations:
            leave_by -= self.eta_minutes(self.c.door(goal.place), nxt.place, minute) + TRAVEL_SLACK
        if arrive + 10 <= leave_by:
            return True
        self.skip(plan, goal, f"no time left for it today (would arrive {hhmm(arrive)}, leave by {hhmm(leave_by)})")
        if self.committed is goal:
            self.committed = None
        return False

    def urgent(self, look, goal, minute):
        """The bathroom, food or rest when a need gets low, before anything else (except bedtime)."""
        if goal.kind == "sleep":
            return goal
        you = look["you"]
        needs = you.get("needs") or {}
        if self.errand:
            need, g = self.errand
            if needs.get(need, 100) >= NEED_RECOVERED[need]:
                self.errand = None
            else:
                return g
        for need in ("bladder", "hunger", "energy"):
            if needs.get(need, 100) >= NEED_URGENT[need] or self.cooling("errand", need):
                continue
            if need == "bladder" and you.get("on_shift"):
                continue  # the server lets people on shift use the restroom at work
            if need == "hunger" and you.get("on_shift") and (minute % 1440) < 11 * 60:
                continue  # lunch, not mid-morning
            g = self.place_for_need(need, tuple(you.get("position") or (0, 0)), you.get("inside") or "", minute)
            if g:
                self.errand = (need, g)
                self.log("needs", f"{need} is down to {needs.get(need):.0f}: {g.why}, so {self.c.name(g.place)}")
                return g
        return goal

    def place_for_need(self, need, pos, here, minute):
        home = self.ctx["home"]
        options = []
        for lid in self.c.locations:
            if lid != home and lid not in self.ctx["workplaces"] and not self.c.public(lid):
                continue
            if self.ctx["status"].get(lid) == "under_construction" or self.cooling("place", lid):
                continue
            act = self.c.activity_for(lid, need)
            food = need == "hunger" and any((o.get("needs") or {}).get("hunger", 0) > 0
                                            for o in self.c.everyday_offers(lid))
            if not act and not food:
                continue
            eta = 0 if lid == here else self.eta_minutes(pos, lid, minute)
            if lid != home and lid not in self.ctx["workplaces"] and not self.c.is_open(lid, int(minute + eta)):
                continue
            options.append((eta + (0 if lid == home else 2), lid, act))
        if not options:
            return None
        _, lid, act = min(options)
        why = {"bladder": "needs the bathroom", "hunger": "hungry", "energy": "exhausted"}[need]
        mod = int(minute % 1440)
        return Goal("place" if lid != home else "home", lid, act, why, start=mod, end=mod + 90)

    def pursue(self, look, goal, plan, minute):
        you = look["you"]
        inside = you.get("inside") or ""
        pos = tuple(you.get("position") or (0, 0))
        target = goal.place or self.ctx["home"]
        if you.get("on_shift") and not (goal.kind == "work" and inside == target):
            self.end_shift()
            return
        if you.get("moving"):
            if self.riding or you.get("mode") == "bus":
                self.pause(15)  # on the bus until the stop
                return
            if self.heading == target or (isinstance(self.heading, tuple) and self.heading[0] == target):
                self.pause(10)
                return
        if inside == target:
            self.at_place(look, goal, plan, minute)
            return
        if inside:
            self.exit(f"heading to {self.c.name(target)}")
            return
        door = self.c.door(target)
        if self.c.enterable(target):
            if dist(pos, door) <= self.c.entry_radius - 0.5:
                self.enter(goal, plan, minute)
                return
        elif dist(pos, door) <= float(self.c.locations[target].get("outdoor_radius_m", 30)) - 1:
            self.at_place(look, goal, plan, minute)
            return
        self.go(goal, target, pos, minute, plan)

    def go(self, goal, target, pos, minute, plan):
        if goal.kind == "place":
            if self.ctx["status"].get(target) == "under_construction":
                self.skip(plan, goal, f"{self.c.name(target)} is still being built")
                return
            if target not in self.ctx["workplaces"]:
                eta = self.eta_minutes(pos, target, minute)
                if self.c.opens_within(target, int(minute + eta), WAIT_FOR_OPENING) is None:
                    self.skip(plan, goal, f"{self.c.name(target)} is closed then (hours {self.c.hours(target)})")
                    return
        route = self.travel(pos, self.c.door(target), minute)
        if route[0] == "bus":
            _, _secs, line, s1, s2 = route
            if dist(pos, s1["at"]) <= self.c.boarding_radius - 3:
                self.ride(line, s1, s2, target)
            else:
                self.walk_to(tuple(s1["at"]), (target, s1["id"]),
                             f"the {s1['name']} stop (bus to {s2['name']}, for {self.c.name(target)})")
            return
        self.walk_to(target, target, self.c.name(target) + (f" ({goal.why})" if goal.why else ""))

    def walk_to(self, dest, heading, label):
        tkey = heading if isinstance(heading, str) else heading[0]
        if self.waiting("move", tkey):
            return
        args = {"location": dest} if isinstance(dest, str) else {"x": dest[0], "y": dest[1]}
        ok, r = self.req("move", **args)
        if not ok:
            if r.get("code") == "inside_building":
                return  # the next look shows the building; we leave it first
            self.refused("move", tkey, r)
            return
        self.succeeded("move", tkey)
        self.heading = heading
        self.stats["walks"] += 1
        eta = r.get("eta_seconds", 0)
        self.log("walk", f"walks to {label}, about {eta:.0f} s")
        self.pause(min(max(eta, 1) + 1, 12))

    def ride(self, line, s1, s2, target):
        if self.waiting("ride", s2["id"]):
            return
        ok, r = self.req("ride", to=s2["id"], pay=True, pay_with="card")
        if not ok:
            if r.get("code") in ("no_service", "insufficient_funds", "unknown_stop", "invalid_payment"):
                self.no_bus_until = time.monotonic() + jittered(600)  # walk for a while
            self.refused("ride", s2["id"], r)
            return
        self.succeeded("ride", s2["id"])
        if r.get("caught"):  # only fare dodgers are inspected, and this script always pays
            self.log("ride", f"a fare inspector stopped the ride: {r}", logging.WARNING)
            return
        self.riding = True
        self.heading = (target, s2["id"])
        self.stats["rides"] += 1
        self.log("ride", f"rides {r.get('line', line.get('name'))} from {r.get('from', s1['name'])} to "
                         f"{r.get('to', s2['name'])}: fare {money(r.get('fare_cents'))} by card, about "
                         f"{r.get('eta_seconds', 0):.0f} s")
        self.pause(min(r.get("eta_seconds", 5) + 1, 15))

    def enter(self, goal, plan, minute):
        target = goal.place or self.ctx["home"]
        if self.waiting("enter", target):
            return
        ok, r = self.req("enter", location=target)
        if ok:
            self.succeeded("enter", target)
            self.stats["enters"] += 1
            self.observe(r)
            self.log("enter", f"goes into {self.c.name(target)}")
            self.pause(jittered(1.5))
            return
        code = r.get("code")
        if code == "inside_building":
            return  # the next look shows where we are
        if code == "closed" and goal.kind != "sleep":
            wait = self.c.opens_within(target, int(minute), WAIT_FOR_OPENING)
            if wait:
                self.log_once(("wait", target, plan.daykey), "wait",
                              f"{self.c.name(target)} is closed; waits at the door (opens in about {wait} min)")
                self.pause(min(15, max(3, wait)))
                return
        if code in ("too_far", "riding", "rate_limited"):
            self.refused("enter", target, r, backoff_base=2)
            return
        if goal.kind == "sleep":  # can't get home: go to bed from where we are
            self.log("home", f"can't get into {self.c.name(target)} ({code}: {r.get('message')})", logging.WARNING)
            self.go_to_bed(plan, "outdoors")
            return
        self.skip(plan, goal, f"{code} ({r.get('message', '')})")
        self.refused("enter", target, r, backoff_base=10)

    def exit(self, why):
        if self.waiting("exit", None):
            return
        ok, r = self.req("exit")
        if not ok:
            if r.get("code") != "not_inside":
                self.refused("exit", None, r, backoff_base=10, cap=300)
            return
        self.succeeded("exit", None)
        self.stats["exits"] += 1
        shift = r.get("shift")
        extra = (f"; that ended the shift: {money(shift.get('pay_cents'))} for {shift.get('minutes_worked')} min"
                 if isinstance(shift, dict) else "")
        self.log("exit", f"leaves {self.c.name(r.get('left'))} ({why}){extra}")
        self.pause(jittered(1.0))

    def skip(self, plan, goal, why):
        if goal in plan.blocks:
            plan.skipped.add(goal.index)
        if self.errand and self.errand[1] is goal:
            self.cooldown[("errand", self.errand[0])] = time.monotonic() + jittered(60)
            self.cooldown[("place", goal.place)] = time.monotonic() + jittered(300)
            self.errand = None
        self.log("skip", f"skips {self.c.name(goal.place)}" + (f" ({goal.why})" if goal.why else "") + f": {why}")
        self.pause(jittered(2.0))

    def end_shift(self):
        if self.waiting("work_end", None):
            return
        ok, r = self.req("work", action="end")
        if not ok:
            if r.get("code") != "not_working":
                self.refused("work_end", None, r, backoff_base=10, cap=300)
            return
        self.succeeded("work_end", None)
        self.stats["shifts"] += 1
        promo = f" Promoted to {r['promoted_to']}!" if r.get("promoted_to") else ""
        note = f" ({r['note']})" if r.get("note") else ""
        self.log("work", f"ends the shift as {r.get('title')} after {r.get('minutes_worked')} min: paid "
                         f"{money(r.get('pay_cents'))}{note}.{promo}")

    def do_activity(self, activity, why=""):
        if self.cooling("activity", activity):
            return False
        ok, r = self.req("activity", activity=activity)
        if not ok:
            if r.get("code") == "too_soon":
                self.cooldown[("activity", activity)] = time.monotonic() + jittered(60)
                return False
            self.refused("activity", activity, r, backoff_base=10, cap=300)
            return False
        self.succeeded("activity", activity)
        self.stats["activities"] += 1
        needs = ", ".join(f"{k} {v:.0f}" for k, v in (r.get("needs") or {}).items())
        self.log("activity", r.get("label", activity) + (f" ({why})" if why else "") + (f": {needs}" if needs else ""))
        self.pause(jittered(1.5))
        return True

    def buy_everyday(self, place, needs, need=None):
        offers = [o for o in self.c.everyday_offers(place) if not need or (o.get("needs") or {}).get(need, 0) > 0]
        if not offers or self.cooling("buy", place):
            return False

        def value(o):
            gain = sum(v * (100 - needs.get(k, 50)) for k, v in (o.get("needs") or {}).items() if v > 0)
            return (gain, -o.get("price_cents", 0))

        offer = max(offers, key=value)
        ok, r = self.req("buy", offer=offer["id"], method="card")
        if not ok:
            self.refused("buy", place, r, backoff_base=30, cap=900)
            return False
        self.succeeded("buy", place)
        self.stats["buys"] += 1
        self.log("buy", f"buys {r.get('item', offer['id'])} at {self.c.name(place)}: {money(r.get('price_cents'))} "
                        f"by card, balance {money(r.get('balance_cents'))}")
        self.pause(jittered(1.5))
        return True

    def care(self, place, needs, thresholds, why):
        """One activity for the lowest need under its threshold that this place helps with."""
        low = sorted((needs.get(n, 100), n) for n, limit in thresholds.items() if needs.get(n, 100) < limit)
        for _, need in low:
            act = self.c.activity_for(place, need)
            if act and not self.cooling("activity", act) and self.do_activity(act, why):
                return True
        return False

    def go_to_bed(self, plan, where):
        self.req("logout")
        self.logged_in = self.playing = False
        self.errand = self.committed = self.heading = None
        self.slept_on = plan.daykey
        self.stats["nights"] += 1
        self.log("bed", f"goes to bed ({where}): leaves the world until {hhmm(plan.wake)} tomorrow; the "
                        f"server's offline life looks after {self.first} overnight")

    def at_place(self, look, goal, plan, minute):
        you = look.get("you") or {}
        needs = you.get("needs") or {}
        place = goal.place or self.ctx["home"]
        done = self.done.setdefault(goal.ident(), set())
        if goal.kind == "sleep":
            if (plan.daykey, "bed") not in self.routine_done:
                if self.care(place, needs, BED_CARE, "before bed"):
                    return
                self.routine_done.add((plan.daykey, "bed"))
            self.go_to_bed(plan, "at home")
            return
        if self.errand and self.errand[1] is goal:
            need = self.errand[0]
            acted = False
            if need == "hunger" and "food" not in done:
                done.add("food")
                acted = self.buy_everyday(place, needs, "hunger")
            act = goal.activity or self.c.activity_for(place, need)
            if not acted and act and act not in done:
                done.add(act)
                acted = self.do_activity(act, goal.why)
            if acted:
                return
            # Nothing more this place can do for it.
            self.cooldown[("errand", need)] = time.monotonic() + jittered(90)
            if needs.get(need, 100) < NEED_RECOVERED[need]:
                self.cooldown[("place", place)] = time.monotonic() + jittered(600)
                if need == "energy" and place == self.ctx["home"]:
                    self.errand = None
                    self.go_to_bed(plan, "early, exhausted")
                    return
            self.errand = None
            return
        if goal.kind == "work":
            if not you.get("on_shift"):
                if self.waiting("work_start", place):
                    return
                ok, r = self.req("work", action="start")
                if ok:
                    self.succeeded("work_start", place)
                    self.log("work", f"starts a shift at {self.c.name(place)} (until about {hhmm(goal.end)})")
                    return
                if r.get("code") in ("no_career", "wrong_place", "no_employer"):
                    self.skip(plan, goal, r.get("message", r.get("code")))
                self.refused("work_start", place, r, backoff_base=15, cap=600)
                return
            self.idle(goal, minute)
            return
        if goal.kind == "home":
            if (plan.daykey, "morning") not in self.routine_done and minute % 1440 < 12 * 60:
                if self.care(place, needs, MORNING_CARE, "morning"):
                    return
                self.routine_done.add((plan.daykey, "morning"))
            if self.care(place, needs, HOME_CARE, "at home"):
                return
            self.idle(goal, minute)
            return
        # A scheduled place: what the schedule names there, an everyday purchase, the restroom.
        if goal.activity and goal.activity not in done:
            done.add(goal.activity)
            if self.do_activity(goal.activity, goal.why):
                return
        if "buy" not in done:
            done.add("buy")
            if self.buy_everyday(place, needs):
                return
        if "restroom" not in done and needs.get("bladder", 100) < 60:
            done.add("restroom")
            act = self.c.activity_for(place, "bladder")
            if act and self.do_activity(act, "while here"):
                return
        self.idle(goal, minute)

    def idle(self, goal, minute, cap=20.0):
        """Nothing to do until this block ends: listen for events, look again soon (a dev time skip
        moves the clock without warning)."""
        left = (goal.end - (minute % 1440)) / max(self.c.minutes_per_second, 0.01) if goal.end else cap
        self.pause(max(2.0, min(cap, left - 2)))


# ----------------------------------------------------------------------------------------------
# The director: one Bot thread per character
# ----------------------------------------------------------------------------------------------
def read_password_file(path):
    out = {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            k = k.strip()
            if k.startswith("export "):
                k = k[7:].strip()
            v = v.strip()
            if len(v) >= 2 and v[0] == v[-1] and v[0] in "'\"":
                v = v[1:-1]
            out[k] = v
    return out


def password_for(cid, file_vars):
    specific = "LIVERA_BOT_PASSWORD_" + re.sub(r"[^A-Z0-9]", "_", cid.upper())
    for source in (os.environ, file_vars):
        if source.get(specific):
            return source[specific]
    for source in (os.environ, file_vars):
        if source.get("LIVERA_BOT_PASSWORD"):
            return source["LIVERA_BOT_PASSWORD"]
    return None


class Director:
    def __init__(self, args):
        self.host, self.port = args.host, args.port
        self.bus_min_distance = args.bus_min_distance
        self.content = Content(args.data)
        self.matcher = Matcher(self.content)


def main(argv=None):
    here = os.path.dirname(os.path.abspath(__file__))
    ap = argparse.ArgumentParser(description="LIVERA town director: plays unclaimed founding characters as "
                                             "labelled scripts (bot_<id> accounts).")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=7777)
    ap.add_argument("--data", default=os.path.normpath(os.path.join(here, "..", "data")),
                    help="the data/ folder the server uses (default: ../data next to this script)")
    ap.add_argument("--characters", default="",
                    help="comma-separated character ids to play (default: every playable founder)")
    ap.add_argument("--password-file", help="KEY=VALUE file with LIVERA_BOT_PASSWORD_<ID> or LIVERA_BOT_PASSWORD")
    ap.add_argument("--once-seconds", type=float, default=0,
                    help="run this many real seconds, leave the world cleanly and exit (tests)")
    ap.add_argument("--bus-min-distance", type=float, default=250,
                    help="never take the bus for trips shorter than this many meters (default 250)")
    ap.add_argument("--stagger", type=float, default=1.5, help="seconds between characters starting")
    ap.add_argument("--show-plans", action="store_true", help="print each character's routine and exit")
    ap.add_argument("--weekday", default="", help="with --show-plans: one weekday (default: all)")
    ap.add_argument("--log-file", help="also write the log here")
    ap.add_argument("-v", "--verbose", action="store_true")
    args = ap.parse_args(argv)

    handlers = [logging.StreamHandler(sys.stdout)]
    if args.log_file:
        handlers.append(logging.FileHandler(args.log_file, encoding="utf-8"))
    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO, handlers=handlers,
                        format="%(asctime)s %(levelname)-7s %(message)s", datefmt="%Y-%m-%d %H:%M:%S")

    director = Director(args)
    content = director.content
    wanted = [c.strip() for c in args.characters.split(",") if c.strip()] or sorted(content.characters)
    unknown = [c for c in wanted if c not in content.characters]
    if unknown:
        LOG.error("not playable founders in %s: %s", args.data, ", ".join(unknown))
        return 2

    if args.show_plans:
        days = [args.weekday.lower()] if args.weekday else WEEKDAYS
        for cid in wanted:
            prof = content.characters[cid]
            car = content.careers.get((prof.get("career") or {}).get("id"), {})
            ctx = {"home": prof.get("spawn_location"), "workplaces": car.get("workplaces", []),
                   "max_shift_hours": float(car.get("max_shift_hours", 8)), "status": {}}
            print(f"{cid}: home {ctx['home']}, works at {', '.join(ctx['workplaces']) or 'nowhere'} "
                  f"(shifts up to {ctx['max_shift_hours']:g} h)")
            for i, wd in enumerate(days):
                rng = random.Random(f"{cid}/{wd}")
                plan = build_plan(content, director.matcher, prof, ctx, (1, 1, 1 + WEEKDAYS.index(wd)), wd, rng)
                print(f"  {wd:9s} {plan.describe()}")
        return 0

    file_vars = read_password_file(args.password_file) if args.password_file else {}
    bots = []
    for cid in wanted:
        pw = password_for(cid, file_vars)
        if not pw:
            LOG.error("no password for %s: set LIVERA_BOT_PASSWORD_%s (or LIVERA_BOT_PASSWORD) in the "
                      "environment or the --password-file", cid, re.sub(r"[^A-Z0-9]", "_", cid.upper()))
            continue
        if len("bot_" + cid) > 24:
            LOG.error("bot_%s is longer than the 24 characters a username may have; skipping", cid)
            continue
        bots.append(Bot(director, cid, pw))
    if not bots:
        LOG.error("nothing to play")
        return 1

    def on_signal(signum, _frame):
        LOG.info("signal %d: leaving the world and stopping", signum)
        STOP.set()

    signal.signal(signal.SIGTERM, on_signal)
    signal.signal(signal.SIGINT, on_signal)
    LOG.info("town director: %d character(s) on %s:%d: %s", len(bots), args.host, args.port,
             ", ".join(b.cid for b in bots))
    if args.once_seconds:
        timer = threading.Timer(args.once_seconds, STOP.set)
        timer.daemon = True
        timer.start()
    for i, b in enumerate(bots):
        if STOP.is_set():
            break
        b.start()
        STOP.wait(jittered(args.stagger) if i + 1 < len(bots) else 0)
    while any(b.is_alive() for b in bots):
        for b in bots:
            b.join(timeout=0.5)
        if STOP.is_set():
            deadline = time.monotonic() + 30
            for b in bots:
                b.join(timeout=max(0.1, deadline - time.monotonic()))
            break
    total = collections.Counter()
    for b in bots:
        total.update(b.stats)
    LOG.info("director stopped. totals: %s", ", ".join(f"{k} {v}" for k, v in sorted(total.items())) or "none")
    return 0


if __name__ == "__main__":
    sys.exit(main())
