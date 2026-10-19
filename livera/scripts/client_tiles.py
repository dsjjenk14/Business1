#!/usr/bin/env python3
"""Client copies of the owner's ground tiles and set pieces, for the web client's map.

Reads art/tiles/*.webp and art/transit/stops/<stop>.webp, writes web/client/tiles/*.webp and
web/client/tiles/manifest.json. Run it again whenever those pictures change:

    scripts/client_tiles.py                 rebuild web/client/tiles/
    scripts/client_tiles.py --preview DIR   also write 3x3 repeats of each ground texture to DIR,
                                            to check them for seams

Needs Python 3 and Pillow (nothing else). The output is deterministic for the same input.

Ground textures. Each art tile is a 2:1 diamond; the client's view (P() in render2d.js, C = cos 30°,
S = 0.5) is a 30° isometric, about 1.73:1. The client lays a texture flat with a CanvasPattern whose
transform goes through P(), so here each diamond is turned back into a top-down square with the
inverse of the diamond's affine map: under P() world +x runs to the diamond's right corner and +y
to its left corner, so the top corner is texture (0, 0), the right corner (1, 0) and the left
corner (0, 1). The corners are found from the alpha mask (lines fitted to the four edges, which
also copes with the tiles whose bottom tip is cut off). The golden-hour light painted into the tiles
is taken out (the client lights the map by the clock), the colours are graded toward the town's
palette (art/STYLE.md) and the textures are made to repeat without seams: grass and asphalt by
cross-fading against a half-period shift (with the contrast kept even); the sidewalk's slabs by
cutting it down the middle of the joints along its edges (cross-fading would ghost the joints and
mirroring shows as a kaleidoscope); the gravel road, whose wheel ruts run along the road, along the
road only (the client stretches it across a road's width). road_corner, road_crossroad and
river_edge are not used: see web/README.md.

Set pieces (the crane, the bridge, the bus shelters) are trimmed to their content and scaled down.
The bridge is mirrored: its art runs along the art's y axis, Lexington Avenue along the map's x
axis, and a horizontal flip of an isometric picture swaps the two. Each sprite's manifest entry
carries anchor points measured on the art (fractions of the output picture), which is how the
client knows where the crane's mast stands, where the bridge's deck begins and ends, where its
piers meet the water, and where each lamp is (measured by eye, then moved to the middle of the
lamp's bright glass).
"""
import argparse
import json
import math
import pathlib
import sys

from PIL import Image, ImageFilter, ImageOps

ROOT = pathlib.Path(__file__).resolve().parent.parent
ART = ROOT / "art"
OUT = ROOT / "web" / "client" / "tiles"
SELF = "scripts/client_tiles.py"
QUALITY = 86

# ----------------------------------------------------------------------------------------------
# Ground textures: (output id, art tile, region of the re-projected square as (u0, v0, u1, v1),
# seam method, output size, palette target (daylight mean, from layout.js LOOK / art/STYLE.md),
# how far to grade toward it (0 keeps the tile's own mean), detail contrast, detail saturation).
# ----------------------------------------------------------------------------------------------
TEXTURES = [
    # The lawns: the tile's grass blades on a sage-olive between LOOK.lawn and the trees.
    ("grass", "grass", (0.03, 0.03, 0.97, 0.97), "crossfade", 7, 512, (176, 182, 140), 0.8, 1.15, 0.55),
    # Sidewalks, kerbs, plazas and the quay: the pale stone slabs. The tile's own edges are slab
    # joints, so it repeats cleanly once cut down the middle of those border joints.
    ("paving", "sidewalk", (0.0, 0.0, 1.0, 1.0), "joints", 9, 512, (236, 223, 197), 0.6, 0.95, 0.7),
    # Roads: plain asphalt from road_straight, away from its centre line (u ~0.47); a narrow blur
    # takes out the tile's streaks too, which would run across the roads that run along x.
    ("asphalt", "road_straight", (0.56, 0.06, 0.96, 0.46), "crossfade", 18, 256, (137, 131, 121), 0.85, 0.9, 0.5),
    # Founders Way while it is unpaved: the gravel road, full width (ruts run along v).
    ("gravel", "road_gravel", (0.03, 0.03, 0.97, 0.97), "along", 7, 512, (205, 182, 140), 0.55, 0.6, 0.8),
]

# ----------------------------------------------------------------------------------------------
# Set pieces: (output id, source, mirror, max width, anchors in SOURCE pixels, measured on the art).
# ----------------------------------------------------------------------------------------------
SPRITES = [
    # The mast stands on its concrete pad ("ground"); "jib" is the slewing ring under the jib.
    ("crane", ART / "tiles" / "crane.webp", False, 420, {"ground": (362, 1442), "jib": (362, 378)}),
    # The bridge, mirrored. Deck centre line at deck level at its cut-off end (the west end on the
    # map, toward River Road) and at the top of its stair (the east end), and the line where the
    # front piers meet the water.
    ("bridge", ART / "tiles" / "bridge.webp", True, 640,
     {"west": (1394, 222), "east": (250, 840), "water_west": (1456, 500), "water_east": (600, 890)}),
]
# The bridge's ten lamp heads in the source picture: the five on the front parapet, then the five
# on the back one.
BRIDGE_LAMPS = [(360, 710), (612, 572), (873, 440), (1209, 285), (1454, 130),
                (160, 590), (485, 400), (796, 275), (1066, 140), (1334, 55)]
# Bus shelters with a full picture; "ground" is near the back corner of the shelter's paved slab, so
# that standing at the stop the shelter is in front of it, clear of the road behind.
STOPS = ["stop_founders_main", "stop_church_street", "stop_civic_row", "stop_maple_court"]
STOP_ANCHORS = {"ground": (850, 610)}
STOP_WIDTH = 360


# ------------------------------------------------------------------------------------- geometry
def fit_line(pts):
    """Least-squares x = a*y + b through (x, y) points."""
    n = len(pts)
    sx = sum(p[0] for p in pts)
    sy = sum(p[1] for p in pts)
    syy = sum(p[1] * p[1] for p in pts)
    sxy = sum(p[0] * p[1] for p in pts)
    a = (n * sxy - sx * sy) / (n * syy - sy * sy)
    return a, (sx - a * sy) / n


def diamond_corners(img):
    """The diamond's top, right, bottom and left corners, from lines fitted to its four edges."""
    alpha = img.getchannel("A").point(lambda v: 255 if v > 128 else 0)
    w, h = alpha.size
    rows = {}
    for y in range(h):
        bb = alpha.crop((0, y, w, y + 1)).getbbox()
        if bb:
            rows[y] = (bb[0], bb[2])
    ys = sorted(rows)
    top, height = ys[0], ys[-1] - ys[0]
    upper = [y for y in ys if top + 0.12 * height < y < top + 0.42 * height]
    lower = [y for y in ys if top + 0.58 * height < y < top + 0.88 * height]
    lu, ru = fit_line([(rows[y][0], y) for y in upper]), fit_line([(rows[y][1], y) for y in upper])
    ll, rl = fit_line([(rows[y][0], y) for y in lower]), fit_line([(rows[y][1], y) for y in lower])

    def meet(l1, l2):
        y = (l2[1] - l1[1]) / (l1[0] - l2[0])
        return (l1[0] * y + l1[1], y)

    return meet(lu, ru), meet(ru, rl), meet(ll, rl), meet(lu, ll)


def reproject(img, region, size):
    """The region (u0, v0, u1, v1) of the diamond's top-down square, `size` pixels square."""
    t, r, _, l = diamond_corners(img)
    u0, v0, u1, v1 = region
    big = size * 2  # sample at twice the size, then scale down with a proper filter

    def at(u, v):
        return (t[0] + u * (r[0] - t[0]) + v * (l[0] - t[0]), t[1] + u * (r[1] - t[1]) + v * (l[1] - t[1]))

    o = at(u0, v0)
    ux = ((r[0] - t[0]) * (u1 - u0) / big, (r[1] - t[1]) * (u1 - u0) / big)
    vx = ((l[0] - t[0]) * (v1 - v0) / big, (l[1] - t[1]) * (v1 - v0) / big)
    coef = (ux[0], vx[0], o[0], ux[1], vx[1], o[1])
    sq = img.transform((big, big), Image.AFFINE, coef, Image.BICUBIC)
    return sq.convert("RGB").resize((size, size), Image.LANCZOS)


# --------------------------------------------------------------------------------- pixel planes
# Plain lists of floats per channel: small images, a one-off script, no NumPy needed.
def planes(img):
    data = list(img.get_flattened_data() if hasattr(img, "get_flattened_data") else img.getdata())
    return [[float(p[c]) for p in data] for c in range(3)]


def image(pl, w, h):
    clamp = lambda v: 0 if v < 0 else 255 if v > 255 else int(v + 0.5)
    out = Image.new("RGB", (w, h))
    out.putdata([(clamp(r), clamp(g), clamp(b)) for r, g, b in zip(*pl)])
    return out


def flatten(img, blur):
    """(mean colour, detail planes): the painted light taken out with a blur of width/`blur`."""
    w, _ = img.size
    low = planes(img.filter(ImageFilter.GaussianBlur(w / blur)))
    pl = planes(img)
    mean = [sum(c) / len(c) for c in pl]
    return mean, [[a - b for a, b in zip(pl[c], low[c])] for c in range(3)]


def shift(pl, w, h, dx, dy):
    return [[c[((y - dy) % h) * w + (x - dx) % w] for y in range(h) for x in range(w)] for c in pl]


def ramp(n, i):
    """0 at the edges, 1 over the middle half, smooth between."""
    t = min(i, n - 1 - i) / (n / 4)
    t = min(1.0, t)
    return t * t * (3 - 2 * t)


def crossfade(pl, w, h, along_u=True, along_v=True):
    """Seamless by blending with a copy shifted half a period; the blend's loss of contrast is
    put back (dividing by the blend's own spread), so the joins don't show as softer bands."""
    other = shift(pl, w, h, w // 2 if along_u else 0, h // 2 if along_v else 0)
    mu = [ramp(w, x) if along_u else 1.0 for x in range(w)]
    mv = [ramp(h, y) if along_v else 1.0 for y in range(h)]
    out = [[0.0] * (w * h) for _ in range(3)]
    for y in range(h):
        for x in range(w):
            m = mu[x] * mv[y]
            k = 1.0 / math.sqrt(m * m + (1 - m) * (1 - m))
            i = y * w + x
            for c in range(3):
                out[c][i] = (pl[c][i] * m + other[c][i] * (1 - m)) * k
    return out


def grade(mean, detail, target, amount, contrast, sat):
    """Mean moved toward the palette target; detail scaled and partly desaturated."""
    base = [m + (t - m) * amount for m, t in zip(mean, target)]
    out = [[0.0] * len(detail[0]) for _ in range(3)]
    for i in range(len(detail[0])):
        r, g, b = detail[0][i], detail[1][i], detail[2][i]
        y = 0.299 * r + 0.587 * g + 0.114 * b
        for c, v in enumerate((r, g, b)):
            out[c][i] = base[c] + contrast * (y + (v - y) * sat)
    return out


def border_joints(img):
    """Cut the square down the middle of the slab joints along its four edges (the darkest line
    within a few pixels of each edge), so that side by side two copies share one joint."""
    g = img.convert("L")
    w, h = g.size
    px = g.load()
    col = lambda x: sum(px[x, y] for y in range(h)) / h
    row = lambda y: sum(px[x, y] for x in range(w)) / w
    near = max(4, w // 64)
    x0 = min(range(0, near), key=col)
    x1 = min(range(w - near, w), key=col)
    y0 = min(range(0, near), key=row)
    y1 = min(range(h - near, h), key=row)
    return img.crop((x0, y0, x1, y1))


def build_texture(spec, preview):
    tid, src, region, seam, blur, size, target, amount, contrast, sat = spec
    art = Image.open(ART / "tiles" / f"{src}.webp").convert("RGBA")
    sq = reproject(art, region, size * 2 if seam == "joints" else size)
    if seam == "joints":
        sq = border_joints(sq).resize((size, size), Image.LANCZOS)
    w, h = sq.size
    mean, detail = flatten(sq, blur)
    if seam == "crossfade":
        detail = crossfade(detail, w, h)
    elif seam == "along":
        detail = crossfade(detail, w, h, along_u=False, along_v=True)
    out = image(grade(mean, detail, target, amount, contrast, sat), w, h)
    out.save(OUT / f"{tid}.webp", "WEBP", quality=QUALITY, method=6)
    if preview:
        rep = Image.new("RGB", (w * 3, h * 3))
        for i in range(3):
            for j in range(3):
                rep.paste(out, (i * w, j * h))
        rep.thumbnail((1200, 1200))
        rep.save(preview / f"repeat_{tid}.png")
    return tid, {"kind": "texture", "size": [w, h], "from": f"art/tiles/{src}.webp"}


# ------------------------------------------------------------------------------------- sprites
def refine(img, x, y, r=36):
    """The middle of the bright warm glass near (x, y) in the source picture."""
    px = img.load()
    pts = [(i, j) for j in range(max(0, y - r), min(img.height, y + r)) for i in range(max(0, x - r), min(img.width, x + r))
           if px[i, j][3] > 200 and px[i, j][0] > 240 and px[i, j][1] > 200 and px[i, j][0] - px[i, j][2] > 50]
    if len(pts) < 10:
        return x, y
    return sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)


def build_sprite(sid, src, mirror, max_w, anchors, lamps=()):
    img = Image.open(src).convert("RGBA")
    sw = img.width
    lamps = [refine(img, x, y) for x, y in lamps]
    if mirror:
        lamps = [(sw - 1 - x, y) for x, y in lamps]
        img = ImageOps.mirror(img)
        anchors = {k: (sw - 1 - x, y) for k, (x, y) in anchors.items()}
    box = img.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    img = img.crop(box)
    k = min(1.0, max_w / img.width)
    out = img.resize((round(img.width * k), round(img.height * k)), Image.LANCZOS)
    out.save(OUT / f"{sid}.webp", "WEBP", quality=QUALITY, method=6)
    frac = {name: [round((x - box[0]) / img.width, 4), round((y - box[1]) / img.height, 4)] for name, (x, y) in anchors.items()}
    entry = {"kind": "sprite", "size": list(out.size), "anchors": frac,
             "from": str(src.relative_to(ROOT)) + (" (mirrored)" if mirror else "")}
    if lamps:
        entry["lamps"] = [[round((x - box[0]) / img.width, 4), round((y - box[1]) / img.height, 4)] for x, y in lamps]
    return sid, entry


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--preview", type=pathlib.Path, help="also write 3x3 repeats of the ground textures here")
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    if args.preview:
        args.preview.mkdir(parents=True, exist_ok=True)
    manifest = {"$comment": f"Generated by {SELF} from art/tiles and art/transit/stops; do not edit by hand. "
                            "Textures are top-down squares; sprite anchors are fractions of the picture."}
    for spec in TEXTURES:
        tid, entry = build_texture(spec, args.preview)
        manifest[tid] = entry
        print(f"  texture {tid}: {entry['size'][0]}x{entry['size'][1]}")
    for sid, src, mirror, max_w, anchors in SPRITES:
        sid, entry = build_sprite(sid, src, mirror, max_w, anchors, BRIDGE_LAMPS if sid == "bridge" else ())
        manifest[sid] = entry
        print(f"  sprite  {sid}: {entry['size'][0]}x{entry['size'][1]}")
    for stop in STOPS:
        src = ART / "transit" / "stops" / f"{stop}.webp"
        if not src.exists():
            continue
        sid, entry = build_sprite(stop, src, False, STOP_WIDTH, STOP_ANCHORS)
        manifest[sid] = entry
        print(f"  sprite  {sid}: {entry['size'][0]}x{entry['size'][1]}")
    lines = [f" {json.dumps(k)}: {json.dumps(v, ensure_ascii=False)}" for k, v in manifest.items()]
    (OUT / "manifest.json").write_text("{\n" + ",\n".join(lines) + "\n}\n", encoding="utf-8")
    print(f"wrote {len(manifest) - 1} files and manifest.json to {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
