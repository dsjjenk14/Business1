#!/usr/bin/env python3
"""Client copies of the owner's interior pictures, for the web client's rooms (D-066).

Reads data/interiors/<id>.json (every room the game has) and its picture art/interiors/<id>.webp, and writes
web/client/rooms/<id>.webp and web/client/rooms/manifest.json. Run it again whenever a room's picture or data
changes:

    scripts/client_rooms.py              rebuild web/client/rooms/
    scripts/client_rooms.py --check      exit 1 if web/client/rooms/ is out of date (nothing written)

Needs Python 3 and Pillow (nothing else). The output is deterministic for the same input.

What it does to each picture:
- The soft halo some pictures have outside the room (a dark or orange glow left by the generator's background
  removal) is trimmed to a clean edge: alpha below HALO_CUT goes, the rest is stretched back to full, and pixels
  that are left on their own (no opaque neighbour) go too. The room's own anti-aliased edge stays one pixel soft.
- The picture is cropped to what's left, with a small margin, and kept at the room's own scale (at most
  MAX_WIDTH wide), so the room data's coordinates (the picture's pixels) map onto the copy as
  copy = (picture - offset) * scale. The manifest gives each copy's size, offset and scale; the client only
  requests rooms listed there.
- Saved as WebP, quality QUALITY.

Rooms whose picture is missing are skipped with a note: the client then keeps the scene card for that place.
"""
import argparse
import io
import json
import pathlib
import sys

from PIL import Image, ImageFilter

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "interiors"
ART = ROOT / "art" / "interiors"
OUT = ROOT / "web" / "client" / "rooms"
MAX_WIDTH = 1536
QUALITY = 85
HALO_CUT = 96      # alpha at or below this is halo, not room
MARGIN = 4


def trimmed(img):
    """The picture with its halo cut to a clean edge (RGBA)."""
    img = img.convert("RGBA")
    r, g, b, a = img.split()
    # Stretch alpha so the halo's faint glow goes and the room's edge stays soft by about a pixel.
    a = a.point(lambda v: 0 if v <= HALO_CUT else min(255, (v - HALO_CUT) * 255 // (224 - HALO_CUT)))
    # Specks: anything more than two pixels from a solid pixel is dropped.
    solid = a.point(lambda v: 255 if v >= 250 else 0)
    near = solid.filter(ImageFilter.MaxFilter(5))
    a = Image.composite(a, Image.new("L", a.size, 0), near)
    return Image.merge("RGBA", (r, g, b, a))


def build(room_id):
    """(webp bytes, manifest entry) for one room, or None when its picture is missing."""
    src = ART / f"{room_id}.webp"
    if not src.exists():
        src = ART / f"{room_id}.png"
    if not src.exists():
        return None
    img = trimmed(Image.open(src))
    w0, h0 = img.size
    box = img.getchannel("A").getbbox() or (0, 0, w0, h0)
    x0, y0 = max(0, box[0] - MARGIN), max(0, box[1] - MARGIN)
    x1, y1 = min(w0, box[2] + MARGIN), min(h0, box[3] + MARGIN)
    img = img.crop((x0, y0, x1, y1))
    scale = 1.0
    if img.width > MAX_WIDTH:
        scale = MAX_WIDTH / img.width
        img = img.resize((MAX_WIDTH, round(img.height * scale)), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, "WEBP", quality=QUALITY, method=6, exact=False)
    entry = {"size": [img.width, img.height], "offset": [x0, y0], "scale": round(scale, 6), "source": [w0, h0]}
    return buf.getvalue(), entry


def main(argv):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check", action="store_true", help="exit 1 if web/client/rooms is out of date")
    args = ap.parse_args(argv)
    manifest, files = {}, {}
    for path in sorted(DATA.glob("*.json")):
        room = json.loads(path.read_text())["interior"]
        built = build(room["id"])
        if built is None:
            print(f"{room['id']}: no picture in art/interiors, skipped (the place keeps its scene card)", file=sys.stderr)
            continue
        data, entry = built
        if entry["source"] != room["size"]:
            sys.exit(f"{room['id']}: the picture is {entry['source']} but the room data says {room['size']}")
        manifest[room["id"]] = entry
        files[f"{room['id']}.webp"] = data
    text = json.dumps(manifest, indent=1, sort_keys=True) + "\n"
    if args.check:
        stale = [n for n, d in files.items() if not (OUT / n).exists() or (OUT / n).read_bytes() != d]
        if not (OUT / "manifest.json").exists() or (OUT / "manifest.json").read_text() != text:
            stale.append("manifest.json")
        if stale:
            print("out of date: " + ", ".join(stale), file=sys.stderr)
            return 1
        return 0
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.webp"):
        if old.name not in files:
            old.unlink()
    for name, data in files.items():
        (OUT / name).write_bytes(data)
    (OUT / "manifest.json").write_text(text)
    total = sum(len(d) for d in files.values())
    print(f"wrote {len(files)} rooms ({total // 1024} KB) and manifest.json to {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
