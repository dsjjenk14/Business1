#!/usr/bin/env bash
# Plays the town director against a real livera_server for a few minutes and checks what happened.
#
#   scripts/test_director.sh [path/to/livera_server] [port] [work dir]
#
# Defaults: build/livera_server, port 27777, a fresh temporary folder. Takes about 7 minutes of
# real time (the clock runs a game minute per real second; dev_advance skips the dull parts).
#
# The scenario, on a dev server with closed registration (accounts made with --add-account, the way
# deploy/setup.sh makes them):
#   * the director plays every founder as bot_<id>, passwords from a --password-file;
#   * a person ("watcher") makes a character, goes into Common Ground where Maya works, sees her
#     labelled as a script, and asks her on a date: the director must decline;
#   * the morning commute and shifts run live, then dev_advance jumps to the end of the work day,
#     the evening, bedtime and the next morning;
#   * another person ("taker") plays Maya while the director has her: the director gets `released`
#     and stops playing her; the taker leaves and Maya stays claimed.
# Checks (PASS/FAIL lines; exit 1 on any FAIL): walks, bus rides, entering, shifts started and paid,
# a purchase, bedtime, the scripted label, the declined ask, the released event, and that the
# director never spins (requests per character per minute stay low).
set -euo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ROOT=$(dirname "$HERE")
SERVER=${1:-$ROOT/build/livera_server}
PORT=${2:-27777}
WORK=${3:-$(mktemp -d "${TMPDIR:-/tmp}/livera-director-test.XXXXXX")}
mkdir -p "$WORK"
DB=$WORK/world.db
[[ -x "$SERVER" ]] || { echo "no server binary at $SERVER (build it first)" >&2; exit 2; }
if (exec 3<>"/dev/tcp/127.0.0.1/$PORT") 2>/dev/null; then echo "port $PORT is in use" >&2; exit 2; fi
rm -f "$DB" "$DB"-wal "$DB"-shm
echo "work dir: $WORK"

# Accounts, as deploy/setup.sh makes them: a generated password per script account.
: >"$WORK/director.env"
chmod 600 "$WORK/director.env"
for cid in $(python3 -c '
import glob, json, sys
for f in sorted(glob.glob(sys.argv[1] + "/characters/*.json")):
    for c in json.load(open(f)).get("characters", []):
        if c.get("playable"): print(c["id"])' "$ROOT/data"); do
  pw=$(python3 -c 'import secrets; print(secrets.token_hex(16))')
  printf '%s\n' "$pw" | "$SERVER" --db "$DB" --add-account "bot_$cid" >/dev/null 2>>"$WORK/accounts.log"
  echo "LIVERA_BOT_PASSWORD_$(echo "$cid" | tr '[:lower:]-' '[:upper:]_')=$pw" >>"$WORK/director.env"
done
printf 'watcher-pass-1\n' | "$SERVER" --db "$DB" --add-account watcher >/dev/null 2>>"$WORK/accounts.log"
printf 'taker-pass-1\n' | "$SERVER" --db "$DB" --add-account taker >/dev/null 2>>"$WORK/accounts.log"

"$SERVER" --data "$ROOT/data" --db "$DB" --port "$PORT" --dev --closed-registration >"$WORK/server.log" 2>&1 &
SERVER_PID=$!
DIRECTOR_PID=""
cleanup() {
  [[ -n "$DIRECTOR_PID" ]] && kill "$DIRECTOR_PID" 2>/dev/null || true
  kill "$SERVER_PID" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup EXIT
for _ in $(seq 1 100); do (exec 3<>"/dev/tcp/127.0.0.1/$PORT") 2>/dev/null && break; sleep 0.1; done

python3 "$HERE/town_director.py" --port "$PORT" --data "$ROOT/data" --password-file "$WORK/director.env" \
  --once-seconds 430 --stagger 0.3 >"$WORK/director.log" 2>&1 &
DIRECTOR_PID=$!
sleep 5

OBS=0
python3 - "$PORT" "$WORK" <<'PY' || OBS=$?
import json, socket, sys, time

PORT, WORK = int(sys.argv[1]), sys.argv[2]
T0 = time.time()
RESULTS = {}


def log(*a):
    print(f"[observer +{time.time() - T0:4.0f}s]", *a, flush=True)


class Client:
    def __init__(self, user, password):
        self.s = socket.create_connection(("127.0.0.1", PORT))
        self.f = self.s.makefile("rwb")
        self.n, self.events = 0, []
        self.f.readline()  # welcome
        r = self.call("login", username=user, password=password)
        assert r["ok"], r

    def call(self, op, **a):
        self.n += 1
        a.update(op=op, id=self.n)
        self.f.write((json.dumps(a) + "\n").encode())
        self.f.flush()
        while True:
            m = json.loads(self.f.readline())
            if "event" in m:
                self.events.append(m)
                continue
            if m.get("re") == self.n:
                return m

    def look(self):
        return self.call("look")["data"]

    def walk(self, **a):
        if self.look()["you"]["inside"]:
            self.call("exit")
        self.call("move", **a)
        for _ in range(150):
            if not self.look()["you"]["moving"]:
                return
            time.sleep(1)


def advance(c, hh, mm=0, next_day=False):
    m = c.look()["time"]["minute"]
    target = m - m % 1440 + (1440 if next_day else 0) + hh * 60 + mm
    if target > m:
        r = c.call("dev_advance", minutes=target - m)
        log("dev_advance", target - m, "min ->", (r.get("data") or {}).get("now"))


SHEET = {
    "first_name": "Wren", "last_name": "Watcher", "age_group": "twenties", "age": 27, "pronouns": "she/her",
    "gender": "woman", "sex": "female",
    "appearance": {"skin_tone": "olive", "undertone": "warm", "face_shape": "oval", "eyes": "almond",
                   "eye_color": "dark brown", "nose": "straight", "lips": "full", "body_type": "athletic",
                   "hair_style": "ponytail", "hair_color": "black", "facial_hair": "none", "makeup": "natural",
                   "outfit": "athleisure", "tattoos": ["wrist"], "piercings": ["ears"], "accessories": ["watch"],
                   "height_cm": 168},
    "personality": {"ambition": 65, "sociability": 50, "empathy": 70, "patience": 55, "confidence": 60,
                    "risk_tolerance": 35, "competitiveness": 40, "impulsiveness": 25},
    "values": {"family": 60, "career": 70, "wealth": 25, "loyalty": 75, "freedom": 35, "status": 20,
               "community": 80, "romance": 40, "creativity": 45},
    "traits": ["driven", "caring", "calm"], "interests": ["fitness", "cooking", "volunteering", "film"],
    "education": "some college", "relationship_status": "single",
    "goals": ["give back to the community", "get promoted"], "origin": "career_advancement", "career": "retail",
    "background": "Watches the town director for a test.",
}

w = Client("watcher", "watcher-pass-1")
r = w.call("create_character", character=SHEET)
assert r["ok"], r
cid = r["data"]["id"]
assert w.call("play", character=cid)["ok"]
log("watcher plays", cid)

# 1. The morning commute, live, from the corner by Heritage Coffee.
w.walk(x=470, y=440)
seen_scripted = set()
for _ in range(6):
    lk = w.look()
    for p in lk["people"]:
        if p.get("scripted"):
            seen_scripted.add(p["id"])
    log(lk["time"]["text"], "sees:", ", ".join(f'{p["id"]}{" (script)" if p.get("scripted") else ""}'
                                              f'{" moving" if p.get("moving") else ""}' for p in lk["people"]) or "nobody")
    time.sleep(10)

# 2. Common Ground, where Maya works: is she labelled, and does the director decline an ask?
advance(w, 10, 0)
time.sleep(15)
w.walk(location="common_ground")
r = w.call("enter", location="common_ground")
log("watcher enters Common Ground:", r["ok"], r.get("error"))
time.sleep(3)
lk = w.look()
maya = next((p for p in lk["people"] if p["id"] == "maya"), None)
log("inside Common Ground:", [(p["id"], p.get("scripted")) for p in lk["people"]])
RESULTS["maya labelled as a script"] = bool(maya and maya.get("scripted"))
chars = w.call("characters")["data"]["characters"]
RESULTS["characters shows scripted_now"] = any(c["id"] == "maya" and c.get("scripted_now") for c in chars)
r = w.call("request", kind="date", target="maya")
log("asks Maya on a date:", r["ok"], r.get("data") or r.get("error"))
answer = None
for _ in range(20):
    w.call("ping")
    answer = next((e for e in w.events if e["event"] == "answer"), None)
    if answer:
        break
    time.sleep(1)
log("answer:", answer)
RESULTS["ask declined"] = bool(answer and answer["data"].get("accepted") is False)

# 3. A person takes Maya: the director must let go.
t = Client("taker", "taker-pass-1")
r = t.call("play", character="maya")
log("taker plays maya:", r["ok"], r.get("error"))
RESULTS["a person can take a scripted character"] = r["ok"]
time.sleep(3)
lk = w.look()
maya = next((p for p in lk["people"] if p["id"] == "maya"), None)
RESULTS["maya no longer labelled after the takeover"] = bool(maya) and not maya.get("scripted")
t.call("logout")

# 4. The rest of the day, skipping ahead.
w.call("exit")
w.walk(x=470, y=440)
for hh, mm, nd, wait in ((17, 50, False, 50), (19, 5, False, 45), (22, 20, False, 45), (7, 30, True, 45)):
    advance(w, hh, mm, nd)
    end = time.time() + wait
    while time.time() < end:
        lk = w.look()
        for p in lk["people"]:
            if p.get("scripted"):
                seen_scripted.add(p["id"])
        time.sleep(10)
log("scripted characters seen in the street:", sorted(seen_scripted))
json.dump(RESULTS, open(f"{WORK}/observer.json", "w"))
log("done")
PY
wait "$DIRECTOR_PID" || true
DIRECTOR_PID=""

fails=0
check() { # check NAME CONDITION...
  local name=$1
  shift
  if "$@"; then echo "PASS  $name"; else
    echo "FAIL  $name"
    fails=$((fails + 1))
  fi
}
has() { grep -qE "$1" "$WORK/director.log"; }
count() { grep -cE "$1" "$WORK/director.log" || true; }
obs() { python3 -c 'import json,sys; sys.exit(0 if json.load(open(sys.argv[1])).get(sys.argv[2]) else 1)' "$WORK/observer.json" "$1"; }
check "observer ran" test "$OBS" -eq 0
check "characters walk" has ' walk +walks to '
check "characters ride the bus" has ' ride +rides '
check "characters enter places" has ' enter +goes into '
check "shifts start" has ' work +starts a shift'
check "shifts end with pay" has ' work +ends the shift .* paid \$[1-9]'
check "an everyday purchase" has ' buy +buys '
check "bedtime leaves the world" has ' bed +goes to bed'
check "the ask was declined by the director" has 'decline +declines a .date. ask'
check "released on takeover" has 'maya +released'
check "maya labelled as a script" obs "maya labelled as a script"
check "characters shows scripted_now" obs "characters shows scripted_now"
check "the server reported the ask declined" obs "ask declined"
check "a person can take a scripted character" obs "a person can take a scripted character"
check "maya not labelled after the takeover" obs "maya no longer labelled after the takeover"
check "no unexpected errors" bash -c "! grep -q 'unexpected error' '$WORK/director.log'"
check "the director exited cleanly" has 'director stopped\. totals'
# Never spins: every request that changes something is a log line, and every refusal backs off.
# A spinning character would write hundreds of lines a minute; a living one writes a few.
lines=$(count '\] [a-z-]+ +[a-z_]+ ')
refusals=$(count ' refused ')
check "no spinning ($lines action lines, $refusals refusals, ~7 min, 11 characters)" test "$lines" -lt 1500 -a "$refusals" -lt 150
echo "logs: $WORK/director.log, $WORK/server.log"
[[ $fails -eq 0 ]] || { echo "$fails check(s) failed"; exit 1; }
echo "all checks passed"
