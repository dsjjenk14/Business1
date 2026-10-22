#!/usr/bin/env python3
"""Writes web/client/figures/standins.json: how the client draws a town character who has no art yet (D-073).

The townspeople (data/characters, cast "townsperson") have no model sheet until the owner makes one from the prompt
pack (scripts/character_prompts.py). Until then the client draws its canvas stand-in body (web/client/figures.js) in
their own colours from data (profile.appearance.stand_in: skin, hair and its style, top, bottom, shoes, and an apron or
headwear where they wear one) at their own height, so the barista and the sergeant read as who they are and not as
a broken picture. Anyone with cut-outs in figures/manifest.json is left out: their art wins.

Their three looks (D-079): the stand_in colours are the look named by profile.appearance.outfits.drawn, and
stand_in.outfits gives the garments of the other two ({"<look>": {top, bottom, shoes, and apron, headwear or accent
where that look has one}}: a whole set, an absent optional one means none; skin, hair and its style stay theirs, so a
hijab stays and each look names its colour as headwear). The client draws whoever wears a look in its colours.

Usage: scripts/client_standins.py            rewrite the file
       scripts/client_standins.py --check    exit 1 if it is stale or a townsperson has no stand-in colours
"""
import argparse
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "web" / "client" / "figures" / "standins.json"
FIGURES = ROOT / "web" / "client" / "figures" / "manifest.json"
SELF = "scripts/client_standins.py"
HEX = re.compile(r"^#[0-9a-f]{6}$")
STYLES = {"short", "buzz", "curls", "long", "bun", "bald", "cap", "hijab"}
COLOURS = ("skin", "hair", "top", "bottom", "shoes")
OPTIONAL = ("apron", "headwear", "accent")
LOOKS = ("everyday", "work", "evening")
LOOK_COLOURS = ("top", "bottom", "shoes")   # what changes with the clothes; skin and hair don't


def looks_of(cid, s, want, problems):
    """The colours of the looks the stand_in itself doesn't show, checked (D-079)."""
    given = s.get("outfits")
    if not isinstance(given, dict):
        problems.append(f"{cid}: stand_in.outfits needs the colours of {' and '.join(want)}, the looks the stand_in doesn't show")
        return {}
    if set(given) != set(want):
        problems.append(f"{cid}: stand_in.outfits has {sorted(given)}; it needs exactly {want} (the stand_in is the drawn look)")
    out = {}
    for k in want:
        g = given.get(k) if isinstance(given.get(k), dict) else {}
        one = {}
        for c in LOOK_COLOURS + OPTIONAL:
            v = g.get(c)
            if v is None and c in OPTIONAL:
                continue
            if not isinstance(v, str) or not HEX.match(v):
                problems.append(f"{cid}: stand_in.outfits.{k}.{c} must be a colour like #1f2d4a")
            one[c] = v
        extra = set(g) - set(LOOK_COLOURS) - set(OPTIONAL)
        if extra:
            problems.append(f"{cid}: stand_in.outfits.{k} has {sorted(extra)}: a look changes only the clothes (skin and hair stay)")
        if s.get("hair_style") == "hijab" and "headwear" not in g:
            problems.append(f"{cid}: stand_in.outfits.{k} needs headwear: the hijab stays, in that look's colour")
        out[k] = one
    return out


def build():
    figures = json.loads(FIGURES.read_text(encoding="utf-8"))
    out, problems = {}, []
    for f in sorted((ROOT / "data" / "characters").glob("*.json")):
        for c in json.loads(f.read_text(encoding="utf-8")).get("characters", []):
            cid, look = c["id"], c.get("profile", {}).get("appearance", {})
            s = look.get("stand_in")
            if cid in figures:
                continue
            if not s:
                if c.get("cast") == "townsperson":
                    problems.append(f"{cid}: no profile.appearance.stand_in")
                continue
            entry = {"height_cm": look.get("height_cm")}
            for k in COLOURS + OPTIONAL:
                v = s.get(k)
                if v is None and k in OPTIONAL:
                    continue
                if not isinstance(v, str) or not HEX.match(v):
                    problems.append(f"{cid}: stand_in.{k} must be a colour like #1f2d4a")
                entry[k] = v
            if s.get("hair_style", "short") not in STYLES:
                problems.append(f"{cid}: stand_in.hair_style is one of {', '.join(sorted(STYLES))}")
            entry["hair_style"] = s.get("hair_style", "short")
            unknown = set(s) - set(COLOURS) - set(OPTIONAL) - {"hair_style", "outfits"}
            if unknown:
                problems.append(f"{cid}: stand_in has unknown keys {sorted(unknown)}")
            drawn = (look.get("outfits") or {}).get("drawn")
            if drawn not in LOOKS:
                problems.append(f"{cid}: profile.appearance.outfits.drawn is the look the stand_in shows, one of {', '.join(LOOKS)}")
                continue
            entry["drawn"] = drawn
            entry["looks"] = looks_of(cid, s, [k for k in LOOKS if k != drawn], problems)
            out[cid] = entry
    doc = {"$comment": f"Generated by {SELF} from data/characters (profile.appearance.stand_in); do not edit by hand. "
                       "The colours the client's stand-in figure wears for a town character with no art yet (D-073); "
                       "it is a stand-in, labelled as such on their card, until their model sheet is made. The colours are "
                       "their drawn look; looks has the garments of their other looks (D-079)."}
    doc.update(out)
    return json.dumps(doc, ensure_ascii=False, indent=1) + "\n", problems


def main(argv):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--check", action="store_true", help="exit 1 if the file is stale; write nothing")
    args = ap.parse_args(argv)
    text, problems = build()
    for p in problems:
        print(f"client_standins: {p}", file=sys.stderr)
    if problems:
        return 1
    if args.check:
        if not OUT.exists() or OUT.read_text(encoding="utf-8") != text:
            print(f"client_standins: {OUT.relative_to(ROOT)} is stale; run python3 {SELF}", file=sys.stderr)
            return 1
        print("client_standins: ok")
        return 0
    OUT.write_text(text, encoding="utf-8")
    print(f"client_standins: wrote {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
