#!/usr/bin/env python3
"""Whole-body pictures of the founders and the four residents with art, for the web client (figures.js).

A character is cut from one of two sources, whichever they have:

- **Their sprite sheet** (art/sprites/characters/<id>/sheet.webp, D-072; made from art/PROMPT_PACK_CHARACTERS.md):
  a 4 x 3 grid at the town's camera, on a dark backdrop. Its twelve cells become web/client/figures/<id>/<frame>.webp:
  walk_front34_1..4 (a walk toward the lower left), walk_back34_1..4 (away toward the upper right), idle_front34,
  idle_back34, sit_chair and sit_sofa.
- Otherwise **their model sheet** (art/reference/characters/<id>.jpg, art/reference/residents/<id>.jpg, D-067): every
  full-body view on it becomes web/client/figures/<id>/<view>.webp (front, front34, side, back34, back).

- **Their other looks** (D-079): a sprite sheet for a look their art doesn't show yet,
  art/sprites/characters/<id>/<look>/sheet.webp (look: everyday, work or evening, never their drawn one, which is
  profile.appearance.outfits.drawn in data), cut exactly like a sprite sheet into web/client/figures/<id>/<look>/<frame>.webp
  and listed under the character's manifest entry as looks.<look>. The client draws a look's frames while they wear it
  and their own art otherwise (figures.js). STAND_INS, ERASE and EXTRA_CM take "<id>/<look>" keys for a look's sheet.

Both write web/client/figures/manifest.json. Run it again whenever a sheet changes:

    scripts/client_figures.py                  rebuild web/client/figures/
    scripts/client_figures.py --only dax,rosa-delgado
    scripts/client_figures.py --only dax:evening   only that look's sheet (the rest of the manifest is kept)
    scripts/client_figures.py --check          exit 1 if web/client/figures/ is out of date or inconsistent (nothing
                                               written; no models needed)
    scripts/client_figures.py --preview DIR    also write, per character, every picture composited on the town's
                                               sand and on the night colour, anchors marked, to look at
    scripts/client_figures.py --masters DIR    also keep the full-resolution cut-outs (PNG) there;
                                               they are masters and stay out of the repository

Needs Python 3, Pillow, numpy and rembg (pip install "rembg[cpu]", which brings scipy and scikit-image). The matte is
BiRefNet (rembg's "birefnet-general-lite"): its model (224 MB) downloads once into $U2NET_HOME (default ~/.rembg) and
then everything runs offline. Taking the generator's chair and sofa out of the seated frames also uses rembg's person
model ("u2net_human_seg", 168 MB) and Segment Anything (rembg's "sam", ViT-B quantized, 110 MB), both downloaded once
the same way. Masks are cached by sheet, box and model (--cache, default a folder under the system's temp directory),
so a second run takes seconds; BiRefNet needs about 7 GB of memory while it runs, so the models load one at a time.
A classical matte was not enough: nine of the founders' model sheets are photo collages whose only full-body shots
stand in a furnished lobby, and the sprite sheets' backdrop glows behind every figure.

What the model sheets have (layouts vary; the boxes below were measured on each sheet):
- Dominique: a five-view turnaround on a grey studio background (front, three-quarter front, side,
  three-quarter back, back).
- Dax and the four residents (Kai Morgan, Rosa Delgado, Sol Rivera, Theo Grant): a four-view
  turnaround on grey (front, three-quarter, side, back).
- Aaliyah, Andre, Graham, Harper, Julian, Leila, Maya, Naomi and Sienna: a walking shot toward the
  camera (used as "front") and a shot from behind looking back over the shoulder (used as "back34"),
  both in a scene. They have no side, three-quarter front or straight back view; the client falls back
  to the nearest view it has (figures.js).
A character with a sprite sheet is cut from it alone (its model-sheet entry below stays, for when it has none).

Each model-sheet cut-out: the sheet box is padded square and segmented; the figure is the largest connected part
of the mask (pieces of a neighbouring panel are dropped); on the studio sheets, holes the model left
inside the figure are filled unless they show the grey background's own colour (the gap between an
arm and the body stays open; in a scene the model's own call stands);
the colours of the soft edge are decontaminated (the background's colour, estimated around the
figure, is taken back out of every half-transparent pixel, so hair keeps no grey or lobby-coloured
halo); the alpha is tightened by a hair so no background fringe survives. The floor shadow is not
part of the mask. Then every view of a character is scaled to one game height: REF_PX for a
REF_CM person, each character at their real height (data/characters/*.json appearance.height_cm, the
residents' from their name cards since D-073), plus what their hat or heels add (EXTRA_CM), and their feet are
found (the lowest rows of the mask): the manifest's `foot` is the point between the feet on the ground
line, in pixels of the picture. Views from one turnaround share one scale (measured on its front view);
the collage shots are each scaled on their own. `faces` says which way the figure looks on screen
("left" or "right"; null when it faces the camera or away from it), so the client knows when to mirror.

Each sprite-sheet frame: the cell, with a fifth of a cell's width and a sixteenth of its height of the neighbours
around it (figures overrun their cells), is segmented with BiRefNet; the figure is the biggest part whose middle lies
in the cell (a neighbour's elbow or shoe is dropped), then cleaned and decontaminated like a cut-out (holes filled
unless they show the backdrop). The seated cells have the generator's furniture in them (the prompt asked for a chair
and a sofa), and the room's own seat is under the person in the game, so they show only the person: Segment Anything,
prompted with points spread over the person (from the person model) and over the furniture BiRefNet kept, the box
around the person and the person model's mask as its prior, gives the person; on the chair, the parts of the chair's
back that prior still holds (cream, beside the torso, where the same model without the prior lets go of them), the
oak legs and anything oak the person model doesn't call a person are taken out, and a dark boot it let go of against
the dark backdrop comes back; what is left over by hand is in ERASE (drawn on the sheet). Scale: the sheets don't
keep one scale in every cell, so each standing frame is scaled to the character's game height (top of the head to the
soles, as for the cut-outs), each walk row so its tallest frame is WALK_TALL of it, and the seated frames at the median
of those scales. Standing and walking frames are anchored at `foot`: under the middle of the torso (the median column
from the shoulders to the hips) on the line of the lowest sole; a walk cycle is drawn in place, so this keeps the body
steady while the feet step under it. Seated frames are anchored at their **seat point** (`seat`: where the seat is
under the hips): on the sofa, the middle of where the person's underside rests on the generator's sofa (its green
velvet, found before it was taken out); on the chair (whose seat hides under the person), under the middle of the torso
0.62 of the way down from the top of the head to the soles. The sheet's frames face the way the prompt drew them:
"left" for walking and standing toward the camera and for sitting, "right" for walking and standing away. STAND_INS
lists cells drawn wrong and the frame used instead. The manifest's "$seats" gives, per kind of seat in the rooms, how
high it is, any nudge of the seated frames and how far ahead of the seat its own furniture covers the legs (SEATS);
the client reads it (figures.js, interior.js), so seats are tuned here, never per room.

`--check` reads only the files: every sprite sheet has its frames, every listed picture exists at its listed size,
nothing unlisted is left in web/client/figures/, each sheet's bytes and its cutting recipe hash to what the manifest
recorded (a sheet changed, or this script's settings for it, means a rebuild), and "$seats" matches SEATS; a look's
sheet is one of the three looks and not their drawn one, belongs to someone with art, and has its frames listed.

The output is deterministic for the same input, models and Pillow version (the masks are cached).
"""
import argparse
import gc
import hashlib
import json
import os
import pathlib
import shutil
import sys
import tempfile

sys.dont_write_bytecode = True

import numpy as np  # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "web" / "client" / "figures"
SELF = "scripts/client_figures.py"
MODEL = "birefnet-general-lite"
PERSON_MODEL = "u2net_human_seg"
SAM_MODEL = "sam_vit_b_01ec64"      # rembg's "sam", quantized
REF_CM, REF_PX = 175, 360            # a 1.75 m person is 360 px tall in the pictures
QUALITY = 88
SAND, NIGHT = (235, 215, 184), (6, 26, 34)   # art/STYLE.md sand stone; layout.js LIGHT's night ambient
VIEWS = ("front", "front34", "side", "back34", "back")
LOOKS = ("everyday", "work", "evening")   # D-079: a person's own looks

CHAR = ROOT / "art" / "reference" / "characters"
RES = ROOT / "art" / "reference" / "residents"   # the four residents' sheets (data characters since D-073)
SPRITES = ROOT / "art" / "sprites" / "characters"
# What the head of the figure adds above the person's height: hats, big hair, heels (cm, by eye).
EXTRA_CM = {"dominique": 9, "aaliyah": 11, "maya": 11, "leila": 8, "naomi": 8, "sienna": 7, "harper": 6,
            "andre": 4, "kai-morgan": 6, "sol-rivera": 7}

# A view that doesn't reach the soles: how much of the person's height is missing from it (cm).
CUT_OFF_CM = {("sienna", "front"): 10}   # her walking shot ends at the ankles: boots and heels not in it

# id -> (sheet, [(view, box (x0, y0, x1, y1) on the sheet, faces, group)], notes). Views in one
# group share a scale (one turnaround); group None scales the view on its own.
SHEETS = {
    "dominique": (CHAR / "dominique.jpg", [
        ("front", (14, 0, 348, 708), None, "t"), ("front34", (334, 0, 664, 708), "left", "t"),
        ("side", (672, 0, 884, 708), "right", "t"), ("back34", (916, 0, 1200, 708), "left", "t"),
        ("back", (1222, 0, 1534, 708), None, "t")], ["Her everyday look (camel coat over the shoulders); her work look has no turnaround yet."]),
    "dax": (CHAR / "dax.jpg", [
        ("front", (858, 626, 1018, 979), None, "t"), ("front34", (1026, 626, 1200, 979), "right", "t"),
        ("side", (1210, 626, 1356, 979), "left", "t"), ("back", (1358, 626, 1524, 979), None, "t")],
        ["The turnaround's all-black tee and trousers; his work polo and evening look have no turnaround."]),
    "kai-morgan": (RES / "kai-morgan.jpg", [
        ("front", (838, 600, 1016, 962), None, "t"), ("front34", (1020, 600, 1193, 962), "right", "t"),
        ("side", (1197, 600, 1369, 962), "right", "t"), ("back", (1373, 600, 1536, 962), None, "t")],
        ["The red-and-white high-tops resemble a well-known real design (data/characters/kai-morgan.json art_notes)."]),
    "rosa-delgado": (RES / "rosa-delgado.jpg", [
        ("front", (834, 601, 1012, 964), None, "t"), ("front34", (1015, 601, 1192, 964), "right", "t"),
        ("side", (1195, 601, 1371, 964), "right", "t"), ("back", (1374, 601, 1536, 964), None, "t")], []),
    "sol-rivera": (RES / "sol-rivera.jpg", [
        ("front", (828, 618, 1005, 971), None, "t"), ("front34", (1008, 618, 1182, 971), "right", "t"),
        ("side", (1185, 618, 1362, 971), "left", "t"), ("back", (1365, 618, 1536, 971), None, "t")], []),
    "theo-grant": (RES / "theo-grant.jpg", [
        ("front", (862, 598, 1035, 949), None, "t"), ("front34", (1038, 598, 1195, 949), "right", "t"),
        ("side", (1198, 598, 1359, 949), "right", "t"), ("back", (1362, 598, 1536, 949), None, "t")], []),
    # The collage sheets: the walking shot (top left) and the shot from behind (bottom right).
    "aaliyah": (CHAR / "aaliyah.jpg", [("front", (0, 0, 378, 923), None, None), ("back34", (757, 928, 1024, 1536), "left", None)], []),
    "andre": (CHAR / "andre.jpg", [("front", (0, 0, 384, 979), None, None), ("back34", (754, 935, 1024, 1536), "left", None)], []),
    "graham": (CHAR / "graham.jpg", [("front", (0, 0, 386, 972), None, None), ("back34", (771, 954, 1024, 1536), "left", None)], []),
    "harper": (CHAR / "harper.jpg", [("front", (0, 0, 385, 937), None, None), ("back34", (751, 933, 1024, 1536), "left", None)], []),
    "julian": (CHAR / "julian.jpg", [("front", (0, 0, 382, 934), None, None), ("back34", (782, 939, 1024, 1536), "left", None)], []),
    "leila": (CHAR / "leila.jpg", [("front", (0, 0, 391, 966), None, None), ("back34", (797, 938, 1024, 1536), "left", None)], []),
    "maya": (CHAR / "maya.jpg", [("front", (0, 0, 387, 950), None, None), ("back34", (764, 938, 1024, 1536), "left", None)], []),
    "naomi": (CHAR / "naomi.jpg", [("front", (0, 0, 398, 943), None, None), ("back34", (759, 935, 1024, 1536), "left", None)], []),
    "sienna": (CHAR / "sienna.jpg", [("front", (0, 0, 405, 929), None, None), ("back34", (802, 933, 1024, 1536), "left", None)],
               ["Her walking shot ends at the ankles: in the front view her trouser hems stand on the ground and her boots are not drawn."]),
}

# The sprite sheets' cells, row by row (art/PROMPT_PACK_CHARACTERS.md, "How a sheet replaces the cut-outs"):
# (frame, row, column, which way it faces on screen).
CELLS = [*((f"walk_front34_{i + 1}", 0, i, "left") for i in range(4)), *((f"walk_back34_{i + 1}", 1, i, "right") for i in range(4)),
         ("idle_front34", 2, 0, "left"), ("idle_back34", 2, 1, "right"), ("sit_chair", 2, 2, "left"), ("sit_sofa", 2, 3, "left")]
FRAMES = tuple(c[0] for c in CELLS)
SEATED = {"sit_chair": "chair", "sit_sofa": "sofa"}
WALK_TALL = 0.985                    # a walking figure at its tallest, against standing still
CELL_PAD = (0.2, 0.06)               # how much of the neighbouring cells is segmented with a cell (of its width, height)
# Cells the generator drew wrong, and the frame that stands in (the showdown's PITCH.md §10 risk 7): Dax's and
# Harper's standing cell is drawn seated, so their standing frame is the walk's passing frame (feet nearest together).
STAND_INS = {"dax": {"idle_front34": "walk_front34_3"}, "harper": {"idle_front34": "walk_front34_3"}}
# Bits the cut keeps that aren't the person, erased by hand: polygons on the sheet (pixels). The generator's furniture
# under a seated figure, or a neighbouring cell's figure close enough to touch (its head under a shoe).
ERASE = {
    ("leila", "sit_chair"): [[(1001, 886), (1012, 882), (1031, 940), (1018, 945)]],   # the chair's back leg under her coat
    ("sienna", "sit_chair"): [[(848, 914), (865, 914), (869, 926), (863, 973), (847, 973)]],   # the front leg between her boots
    ("hamid-sultani", "walk_back34_1"): [[(232, 655), (275, 655), (275, 705), (200, 705), (200, 668), (222, 664)]],  # the head below his shoe
}
# Per kind of seat in the rooms (data/interiors spots): how high the seat is, as a fraction of a standing 1.75 m
# person; a nudge of a seated frame's seat point (fractions of the person's height: dx toward the way they face, dy
# down); and how far ahead of the seat the furniture the seat belongs to (a booth with its table) is drawn again over
# a seated frame's legs (reach, a fraction of the height). Written to the manifest's "$seats" for figures.js and
# interior.js; a kind not named here is drawn as a "seat".
SEATS = {
    "seat": {"height": 0.26, "dx": 0.0, "dy": 0.0, "reach": 0.22},
    "stool": {"height": 0.42, "dx": 0.0, "dy": 0.0, "reach": 0.22},
    "sofa": {"height": 0.24, "dx": 0.0, "dy": 0.0, "reach": 0.22},
    "bed": {"height": 0.3, "dx": 0.0, "dy": 0.0, "reach": 0.22},
}


# --------------------------------------------------------------------------------- the masks
class Models:
    """rembg's sessions, one model loaded at a time (BiRefNet alone peaks near 7 GB)."""

    def __init__(self):
        self.name, self.session = None, None

    def get(self, name):
        if self.name != name:
            self.session = None
            gc.collect()
            import onnxruntime as ort
            from rembg import new_session
            opts = ort.SessionOptions()   # BiRefNet's peak memory without these is over 12 GB
            opts.enable_cpu_mem_arena = False
            opts.enable_mem_pattern = False
            opts.intra_op_num_threads = 2
            if name == SAM_MODEL:
                self.session = new_session("sam", sess_opts=opts, sam_model=SAM_MODEL, sam_quant=True)
            else:
                self.session = new_session(name, sess_opts=opts)
            self.name = name
        return self.session


def segment(img, box, cache, models, model=MODEL):
    """A model's alpha (0..1) for the sheet box, padded square first so the model sees the figure
    undistorted. Cached by sheet bytes, box and model."""
    crop = img.crop(box)
    key = hashlib.sha1(img.tobytes() + repr((box, model)).encode()).hexdigest()[:20]
    path = cache / f"{key}.png"
    if path.exists():
        return np.asarray(Image.open(path)).astype(np.float32) / 255
    session = models.get(model)
    from rembg import remove
    a = np.asarray(crop)
    h, w = a.shape[:2]
    n = max(h, w)
    py, px = (n - h) // 2, (n - w) // 2
    sq = np.pad(a, ((py, n - h - py), (px, n - w - px), (0, 0)), mode="edge")
    m = remove(Image.fromarray(sq), session=session, only_mask=True)
    m = np.asarray(m)[py:py + h, px:px + w]
    Image.fromarray(m).save(path)
    return m.astype(np.float32) / 255




def components(mask):
    """Labels of the 8-connected parts of a boolean mask, by runs: (labels, sizes)."""
    h, w = mask.shape
    parent = []

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    runs_prev, all_runs = [], []
    for y in range(h):
        row = mask[y]
        d = np.diff(np.concatenate(([0], row.view(np.int8), [0])))
        starts, ends = np.flatnonzero(d == 1), np.flatnonzero(d == -1)
        runs = []
        for s, e in zip(starts, ends):
            lab = len(parent)
            parent.append(lab)
            for ps, pe, pl in runs_prev:
                if ps <= e and pe >= s:   # touching, diagonals included
                    a, b = find(lab), find(pl)
                    if a != b:
                        parent[max(a, b)] = min(a, b)
            runs.append((int(s), int(e), lab))
        all_runs.append(runs)
        runs_prev = runs
    labels = np.zeros((h, w), np.int32)
    sizes = {}
    for y, runs in enumerate(all_runs):
        for s, e, lab in runs:
            r = find(lab) + 1
            labels[y, s:e] = r
            sizes[r] = sizes.get(r, 0) + e - s
    return labels, sizes


def box_blur(a, r):
    """A box blur of radius r along both axes (cumulative sums), edges clamped."""
    def along(x, axis):
        pad = [(0, 0)] * x.ndim
        pad[axis] = (r + 1, r)
        c = np.cumsum(np.pad(x, pad, mode="edge"), axis=axis, dtype=np.float64)
        hi = np.take(c, range(2 * r + 1, c.shape[axis]), axis=axis)
        lo = np.take(c, range(0, c.shape[axis] - 2 * r - 1), axis=axis)
        return (hi - lo) / (2 * r + 1)
    return along(along(a, 0), 1).astype(np.float32)


def background_estimate(rgb, alpha, r=12, rounds=4):
    """What the background looks like behind every pixel: a normalized convolution of the pixels
    the mask calls background, widened a few times so it reaches into the figure."""
    w = np.clip(1 - alpha * 1.6, 0, 1) ** 2
    num, den = rgb * w[..., None], w
    est = None
    for k in range(rounds):
        bn, bd = box_blur(num, r * (k + 1)), box_blur(den, r * (k + 1))
        cur = bn / np.maximum(bd, 1e-4)[..., None]
        est = cur if est is None else np.where((bd > 1e-3)[..., None] & (prev_d <= 1e-3)[..., None], cur, est)
        prev_d = bd if k == 0 else np.maximum(prev_d, bd)
    return est


def matte(rgb, alpha, fill_holes):
    """The cleaned alpha and decontaminated colours of the main figure. `fill_holes` only on a plain
    studio background, where "the background's colour" is known well enough to tell a gap between
    an arm and the body from a light shirt; in a scene, the model's own call stands."""
    h, w = alpha.shape
    solid = alpha > 0.5
    labels, sizes = components(solid)
    if not sizes:
        raise SystemExit("no figure found in the box")
    main = max(sizes, key=sizes.get)
    keep = labels == main
    # Anything the model half-kept away from the main figure goes (a neighbour panel's edge, a shadow).
    near = box_blur(keep.astype(np.float32), 6) > 0.001
    a = np.where(near, alpha, 0).astype(np.float32)
    a[keep] = np.maximum(a[keep], 0.5)
    # Holes inside the figure: fill unless they show the background's own colour.
    bg = background_estimate(rgb, a)
    hole_lab, hole_sizes = components(~(a > 0.5))
    border = set(np.unique(np.concatenate([hole_lab[0], hole_lab[-1], hole_lab[:, 0], hole_lab[:, -1]]))) - {0}
    area = float(keep.sum())
    filled = 0
    for lab, n in hole_sizes.items():
        if not fill_holes or lab in border or n > area * 0.02:
            continue
        m = hole_lab == lab
        diff = np.abs(rgb[m] - bg[m]).sum(axis=1).mean()
        if diff > 60:   # not the background: a light shirt the model wasn't sure of
            a[m] = 1
            filled += n
    # Decontaminate the soft edge: I = a F + (1 - a) B, so F = (I - (1 - a) B) / a.
    bg = background_estimate(rgb, a)
    soft = (a > 0.02) & (a < 0.98)
    f = rgb.copy()
    af = np.maximum(a, 0.08)[..., None]
    fc = np.clip((rgb - (1 - af) * bg) / af, 0, 255)
    # Where alpha is very low the solve is noisy: lean on the nearest solid colour instead.
    solid_col = box_blur(rgb * (a > 0.9)[..., None], 3) / np.maximum(box_blur((a > 0.9).astype(np.float32), 3), 1e-4)[..., None]
    t = np.clip((a - 0.08) / 0.4, 0, 1)[..., None]
    mixed = fc * t + np.where(box_blur((a > 0.9).astype(np.float32), 3)[..., None] > 1e-3, solid_col, fc) * (1 - t)
    f[soft] = mixed[soft]
    # Tighten the edge a hair: nothing faint survives as a halo.
    a = np.clip((a - 0.06) / 0.94, 0, 1)
    return f, a, filled


# ----------------------------------------------------------------------------- measuring
def bbox(a, thr=0.04):
    ys, xs = np.nonzero(a > thr)
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def feet(a):
    """The ground line (lowest solid row) and the point between the feet on it, in pixels."""
    rows = np.flatnonzero((a > 0.5).sum(axis=1) >= 2)
    top, bottom = rows[0], rows[-1] + 1
    band = a[max(top, bottom - max(3, int((bottom - top) * 0.025))):bottom]
    cols = band.sum(axis=0)
    xs = np.arange(a.shape[1])
    return float((cols * xs).sum() / max(cols.sum(), 1e-6)), float(bottom), float(top)


def drawn_look(cid):
    """The look a character's art shows (profile.appearance.outfits.drawn, D-079), or None."""
    path = ROOT / "data" / "characters" / f"{cid}.json"
    if not path.exists():
        return None
    for c in json.loads(path.read_text())["characters"]:
        if c["id"] == cid:
            return c["profile"]["appearance"].get("outfits", {}).get("drawn")
    return None


def look_sheets(cid):
    """A character's sheets for their other looks (D-079): {look: art/sprites/characters/<id>/<look>/sheet.webp}."""
    d = SPRITES / cid
    return {q.parent.name: q for q in sorted(d.glob("*/sheet.webp"))} if d.is_dir() else {}


def height_cm(cid):
    data = json.loads((ROOT / "data" / "characters" / f"{cid}.json").read_text())
    for c in data["characters"]:
        if c["id"] == cid:
            return c["profile"]["appearance"]["height_cm"]
    raise SystemExit(f"{cid}: no height in data/characters")


# ------------------------------------------------------------------------------- building (model sheets)
def cut(cid, spec, cache, models, masters):
    sheet, views, notes = spec
    img = Image.open(sheet).convert("RGB")
    cm = height_cm(cid)
    target = (cm + EXTRA_CM.get(cid, 0)) * REF_PX / REF_CM     # px from the top of the head (hat) to the soles
    cuts = []
    for view, box, faces, group in views:
        alpha = segment(img, box, cache, models)
        rgb = np.asarray(img.crop(box)).astype(np.float32)
        f, a, filled = matte(rgb, alpha, fill_holes=group is not None)
        x0, y0, x1, y1 = bbox(a)
        fx, fy, top = feet(a)
        cuts.append(dict(view=view, box=box, faces=faces, group=group, rgb=f, a=a, bb=(x0, y0, x1, y1), foot=(fx, fy),
                         top=top, filled=filled))
        if masters:
            out = np.dstack([f, a * 255]).astype(np.uint8)
            Image.fromarray(out[y0:y1, x0:x1], "RGBA").save(masters / f"{cid}_{view}.png")
    # One scale per turnaround: its front view's height; the collage shots each on their own.
    scales = {}
    for c in cuts:
        if c["group"] and c["group"] not in scales and c["view"] == "front":
            scales[c["group"]] = target / (c["foot"][1] - c["top"])
    out_views = {}
    for c in cuts:
        s = scales.get(c["group"]) if c["group"] else None
        if s is None:
            s = (target - CUT_OFF_CM.get((cid, c["view"]), 0) * REF_PX / REF_CM) / (c["foot"][1] - c["top"])
        im, (fx, fy) = scaled(c["rgb"], c["a"], c["bb"], c["foot"], s)
        out_views[c["view"]] = dict(im=im, foot=(fx, fy), faces=c["faces"], filled=c["filled"], src=c["box"])
    return cm, out_views, notes


def scaled(rgb, a, bb, anchor, s, pad=3):
    """The picture trimmed to its box (a little margin, the anchor's row always inside) and scaled by s; the anchor
    in the scaled picture's pixels."""
    x0, y0, x1, y1 = bb
    x0, y0, x1, y1 = max(0, x0 - pad), max(0, y0 - pad), min(a.shape[1], x1 + pad), min(a.shape[0], y1 + pad)
    y1 = max(y1, int(np.ceil(anchor[1])) + pad)
    rgba = np.dstack([rgb, a * 255])[y0:y1, x0:x1]
    if rgba.shape[0] < y1 - y0:   # the ground line at the box's edge: pad below the feet
        rgba = np.pad(rgba, ((0, y1 - y0 - rgba.shape[0]), (0, 0), (0, 0)))
    im = Image.fromarray(rgba.astype(np.uint8), "RGBA")
    W, H = max(1, round(im.width * s)), max(1, round(im.height * s))
    im = im.resize((W, H), Image.LANCZOS)   # Pillow resamples RGBA premultiplied: no dark fringe
    return im, ((anchor[0] - x0) * s, (anchor[1] - y0) * s)


def preview(cid, views, path, order=VIEWS):
    """Every picture on the sand and on the night colour, side by side, feet (or seat) on one line, anchors marked."""
    names = [v for v in order if v in views]
    anchor = {v: views[v].get("foot") or views[v]["seat"] for v in names}
    feet_y = max(anchor[v][1] for v in names)
    H = int(max(feet_y + (views[v]["im"].height - anchor[v][1]) for v in names)) + 10
    W = sum(views[v]["im"].width for v in names) + 12 * (len(names) + 1)
    sheet = Image.new("RGB", (W, 2 * H), SAND)
    sheet.paste(Image.new("RGB", (W, H), NIGHT), (0, H))
    d = ImageDraw.Draw(sheet)
    x = 12
    for v in names:
        im, (fx, fy) = views[v]["im"], anchor[v]
        for row in (0, H):
            y = int(row + 5 + feet_y - fy)
            sheet.paste(im, (x, y), im)
            cx, cy = x + fx, y + fy
            col = (220, 40, 160) if "seat" in views[v] else (40, 140, 220)
            d.line([(cx - 6, cy), (cx + 6, cy)], fill=col, width=2)
            d.line([(cx, cy - 6), (cx, cy + 6)], fill=col, width=2)
        x += im.width + 12
    sheet.save(path)


# ------------------------------------------------------------------------------- building (sprite sheets)
def sprite_sheet(cid):
    p = SPRITES / cid / "sheet.webp"
    return p if p.exists() else None


def cell_box(W, H, r, c):
    """A cell of the 4 x 3 grid with CELL_PAD of its neighbours around it, on the sheet."""
    cw, ch = W / 4, H / 3
    px, py = round(cw * CELL_PAD[0]), round(ch * CELL_PAD[1])
    return (max(0, round(c * cw) - px), max(0, round(r * ch) - py), min(W, round((c + 1) * cw) + px), min(H, round((r + 1) * ch) + py))


def cell_figure(alpha, box, W, H, r, c):
    """The figure drawn in a cell: the biggest solid part whose middle lies in the cell itself (the box around it
    reaches into the neighbours, whose elbows and shoes are dropped)."""
    from scipy import ndimage as ndi
    lab, _ = ndi.label(alpha > 0.5, structure=np.ones((3, 3)))
    cw, ch = W / 4, H / 3
    x0, y0 = c * cw - box[0], r * ch - box[1]
    best, size = 0, 0
    for i, sl in enumerate(ndi.find_objects(lab), 1):
        if sl is None:
            continue
        m = lab[sl] == i
        ys, xs = np.nonzero(m)
        cx, cy = xs.mean() + sl[1].start, ys.mean() + sl[0].start
        if len(xs) > size and x0 <= cx < x0 + cw and y0 <= cy < y0 + ch:
            best, size = i, len(xs)
    if not best:
        raise SystemExit(f"cell {r},{c}: no figure in it")
    return lab == best


def spread(mask, n, frac):
    """Up to n points well inside a mask and far apart (the deepest first, then farthest from those chosen): prompts."""
    from scipy import ndimage as ndi
    dist = ndi.distance_transform_edt(mask)
    if dist.max() <= 0:
        return []
    cand = np.argwhere(dist > max(3, dist.max() * frac))
    chosen = [np.array(np.unravel_index(np.argmax(dist), dist.shape))]
    for _ in range(n - 1):
        if not len(cand):
            break
        d = np.min([np.hypot(*(cand - c).T) for c in chosen], axis=0)
        if d.max() < 6:
            break
        chosen.append(cand[int(np.argmax(d))])
    return [[int(c[1]), int(c[0])] for c in chosen]


def sam_person(img, box, rgb, hs, main, cache, models):
    """Segment Anything's idea of the person in a seated cell, twice: with the person model's mask as its prior (which
    takes the sofa out cleanly but holds on to a chair's back) and without it (which lets go of the chair's back, and
    sometimes of a leg). Prompts: points spread over the person and over the furniture BiRefNet kept, and the box
    around the person. Cached by sheet, box and prompts."""
    from scipy import ndimage as ndi
    smooth = ndi.gaussian_filter(hs, 1.5) * main
    person = smooth > 0.5
    furn = ndi.binary_erosion(main & (smooth < 0.08), iterations=3)
    pos = spread(person, 6, 0.45)
    lab, n = ndi.label(furn)
    neg = []
    for i in range(1, n + 1):
        m = lab == i
        if m.sum() >= 60:
            neg += spread(m, 2, 0.6)
    ys, xs = np.nonzero(person)
    bx = [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())]
    key = hashlib.sha1(img.tobytes() + repr((box, SAM_MODEL, "quant", pos, neg, bx)).encode()).hexdigest()[:20]
    path = cache / f"{key}.npz"
    if path.exists():
        z = np.load(path)
        return z["prior"], z["free"]
    from rembg.sessions.sam import apply_coords, transform_masks, warp_affine
    sam = models.get(SAM_MODEL)
    size = (684, 1024)                 # rembg's encoder input (h, w)
    s = min(size[1] / rgb.shape[1], size[0] / rgb.shape[0])
    T = np.array([[s, 0, 0], [0, s, 0], [0, 0, 1]])
    im = warp_affine(rgb.astype(np.uint8), T[:2], size)
    emb = sam.encoder.run(None, {sam.encoder.get_inputs()[0].name: im.astype(np.float32)})[0]

    def decode(pts, labels, prior=None):
        coord = np.concatenate([np.array(pts, np.float64), [[0.0, 0.0]]], axis=0)[None]
        lb = np.concatenate([np.array(labels, np.float64), [-1]])[None].astype(np.float32)
        coord = apply_coords(coord, size, 1024)
        coord = np.concatenate([coord, np.ones((1, coord.shape[1], 1))], axis=2)
        coord = np.matmul(coord, T.T)[:, :, :2].astype(np.float32)
        mask_in, has = np.zeros((1, 1, 256, 256), np.float32), np.zeros(1, np.float32)
        if prior is not None:
            mask_in[0, 0], has[0] = prior, 1
        masks, _, _ = sam.decoder.run(None, {"image_embeddings": emb, "point_coords": coord, "point_labels": lb, "mask_input": mask_in,
                                            "has_mask_input": has, "orig_im_size": np.array(size, np.float32)})
        return transform_masks(masks, rgb.shape[:2], np.linalg.inv(T))[0][0] > 0

    # The person model's mask as SAM's prior: logits on the 256 x 256 grid of the padded 1024 x 1024 input.
    pri = np.zeros((1024, 1024), np.float32)
    hsr = np.asarray(Image.fromarray((hs * 255).astype(np.uint8)).resize((round(rgb.shape[1] * s), round(rgb.shape[0] * s)), Image.BILINEAR))
    pri[:hsr.shape[0], :hsr.shape[1]] = hsr.astype(np.float32) / 255
    prior_logits = (np.asarray(Image.fromarray(pri).resize((256, 256), Image.BILINEAR)) - 0.5) * 20
    corners = [[bx[0], bx[1]], [bx[2], bx[3]]]
    with_prior = decode(pos + corners, [1] * len(pos) + [2, 3], prior_logits)
    free = decode(pos + neg + corners, [1] * len(pos) + [0] * len(neg) + [2, 3])
    np.savez_compressed(path, prior=with_prior, free=free)
    return with_prior, free


def seated_person(rgb, hs, prior, free, main, kind, erase):
    """The person in a seated cell without the generator's chair or sofa (boolean mask). See the module's notes."""
    from scipy import ndimage as ndi
    from skimage.color import rgb2hsv
    hsv = rgb2hsv(rgb / 255)
    H, S, V = hsv[..., 0] * 360, hsv[..., 1], hsv[..., 2]
    person = prior & main
    ys = np.flatnonzero(person.any(axis=1))
    top, bottom = ys[0], ys[-1]
    gone = erase.copy()
    if kind == "chair":
        # The chair's back where the prior held on to it and the free cut let go: cream, above the feet.
        lab, n = ndi.label(ndi.binary_opening(person & ~free, iterations=1))
        for i in range(1, n + 1):
            m = lab == i
            if m.sum() < 120:
                continue
            cy = np.nonzero(m)[0].mean()
            if 12 <= H[m].mean() <= 50 and S[m].mean() < 0.5 and V[m].mean() > 0.55 and cy < bottom - (bottom - top) * 0.2:
                gone |= m
        # Oak the person model doesn't call a person; then thin upright oak in the lower half (the legs).
        gone |= person & (H > 15) & (H < 40) & (S > 0.5) & (V > 0.3) & (hs < 0.35)
        low = np.zeros_like(person)
        low[int(top + (bottom - top) * 0.5):] = True
        oak = (H > 14) & (H < 42) & (S > 0.42) & (V > 0.28) & person & low
        thin = oak & ~ndi.binary_dilation(ndi.binary_opening(oak, structure=np.ones((1, 11))), iterations=2)
        lab, n = ndi.label(thin)
        for i in range(1, n + 1):
            m = lab == i
            my, mx = np.nonzero(m)
            hh, ww = my.max() - my.min() + 1, mx.max() - mx.min() + 1
            if hh >= 18 and hh >= 2.5 * ww:
                gone |= ndi.binary_dilation(m, iterations=1) & person
        # A dark boot or trouser hem the prior let go of against the dark backdrop comes back: dark, low down (below the
        # knees), and hanging from the person (the leg it continues is right above its top).
        back = ndi.binary_opening(main & ~person & ~gone & (V < 0.22), iterations=1)
        lab, n = ndi.label(back)
        for i in range(1, n + 1):
            m = lab == i
            my, mx = np.nonzero(m)
            if m.sum() < 40 or my.min() < top + (bottom - top) * 0.6:
                continue
            cols = mx[my <= my.min() + 1]
            above = person[max(0, my.min() - 4):my.min(), :][:, cols].any(axis=0)
            if above.mean() >= 0.5:
                person |= m
    person = ndi.binary_opening(person & ~gone, iterations=1)
    lab, n = ndi.label(person, structure=np.ones((3, 3)))
    if n > 1:
        person = lab == (1 + int(np.argmax(ndi.sum(person, lab, range(1, n + 1)))))
    return person, gone


def sofa_of(rgb, person):
    """The generator's sofa in a seated cell, as far as it shows: its green velvet near the person (BiRefNet often
    leaves a sofa out, so by its colour)."""
    from scipy import ndimage as ndi
    from skimage.color import rgb2hsv
    hsv = rgb2hsv(rgb / 255)
    H, S, V = hsv[..., 0] * 360, hsv[..., 1], hsv[..., 2]
    f = (H > 90) & (H < 200) & (S > 0.15) & (V > 0.06) & ndi.binary_dilation(person, iterations=40)
    return ndi.binary_opening(f & ~ndi.binary_dilation(person, iterations=1), iterations=1)


def seat_point(a, seat=None):
    """Where the seat is under the hips, in a seated frame's pixels. On a sofa: the middle (medians) of the places
    where the person's underside rests on the sofa the generator drew (the thighs and the seat of the trousers on the
    cushion), between the hips' height and the knees' (not the feet on the floor, not a forearm on the armrest). On a
    chair (whose cream seat hides under the person and whose legs BiRefNet keeps or not), and on a sofa with too little
    of it showing: under the middle of the torso, 0.62 of the way down from the top of the head to the soles, where a
    seated person's hips are at this camera (measured on the ten sheets' chair frames)."""
    solid = a > 0.5
    rows = np.flatnonzero(solid.sum(axis=1) >= 2)
    top, bottom = rows[0], rows[-1]
    h = bottom - top
    edge = np.zeros_like(solid)
    edge[:-1] = solid[:-1] & ~solid[1:]                  # the person ends here, going down
    below = np.zeros_like(solid)
    for k in range(1, 7):
        if seat is not None:
            below[:-k] |= seat[k:]                       # and the seat is within a few pixels below
    ys, xs = np.nonzero(edge & below) if seat is not None else (np.zeros(0, int), np.zeros(0, int))
    keep = (ys >= top + 0.38 * h) & (ys <= bottom - 0.2 * h)
    if keep.sum() >= 8:
        return float(np.median(xs[keep])), float(np.median(ys[keep]) + 1)
    xs = np.nonzero(solid[int(top + 0.2 * h):int(top + 0.45 * h)])[1]
    return float(np.median(xs)), float(top + 0.62 * h)


def stand_point(a):
    """Where a standing or walking frame stands, and the top of its head: under the middle of the torso (the median
    column of the rows from the shoulders to the hips, which a swinging arm or a bag moves least) on the line of the
    lowest sole. A walk cycle is drawn in place, so registering its frames by the torso keeps the body steady while
    the feet step under it."""
    solid = a > 0.5
    rows = np.flatnonzero(solid.sum(axis=1) >= 2)
    top, bottom = rows[0], rows[-1] + 1
    h = bottom - top
    xs = np.nonzero(solid[int(top + 0.18 * h):int(top + 0.45 * h)])[1]
    return float(np.median(xs)), float(bottom), float(top)


def cut_sprites(cid, sheet, cache, models, masters, look=None):
    """Every frame of a character's sprite sheet (or of one of their looks' sheets): {frame: {im, foot | seat, faces}},
    and notes."""
    from scipy import ndimage as ndi
    img = Image.open(sheet).convert("RGB")
    W, H = img.size
    key = f"{cid}/{look}" if look else cid
    cm = height_cm(cid)
    target = (cm + EXTRA_CM.get(key, EXTRA_CM.get(cid, 0))) * REF_PX / REF_CM
    stand_ins = STAND_INS.get(key, {})
    cuts, notes = {}, []
    for name, r, c, faces in CELLS:
        if name in stand_ins:
            continue
        box = cell_box(W, H, r, c)
        rgb = np.asarray(img.crop(box)).astype(np.float32)
        alpha = segment(img, box, cache, models)
        main = cell_figure(alpha, box, W, H, r, c)
        kind = SEATED.get(name)
        erase = np.zeros(main.shape, bool)
        for poly in ERASE.get((key, name), []):
            m = Image.new("L", (main.shape[1], main.shape[0]), 0)
            ImageDraw.Draw(m).polygon([(x - box[0], y - box[1]) for x, y in poly], fill=1)
            erase |= np.asarray(m).astype(bool)
        if kind:
            hs = segment(img, box, cache, models, PERSON_MODEL)
            prior, free = sam_person(img, box, rgb, hs, main, cache, models)
            person, gone = seated_person(rgb, hs, prior, free, main, kind, erase)
            sofa = sofa_of(rgb, person) if kind == "sofa" else None
            near = ndi.binary_dilation(person, iterations=2)
            alpha = alpha * near * np.clip(ndi.gaussian_filter(person.astype(np.float32), 0.8) * 1.4, 0, 1)
        else:
            alpha = alpha * ndi.binary_dilation(main & ~erase, iterations=6) * ~erase
        f, a, filled = matte(rgb, alpha, fill_holes=True)
        x0, y0, x1, y1 = bbox(a)
        fx, fy, top = stand_point(a)
        cut = dict(rgb=f, a=a, bb=(x0, y0, x1, y1), foot=(fx, fy), top=top, faces=faces, kind=kind, row=r)
        if kind:
            cut["seat"] = seat_point(a, sofa)
        cuts[name] = cut
        if masters:
            stem = f"{cid}_{look}_{name}" if look else f"{cid}_{name}"
            Image.fromarray(np.dstack([f, a * 255]).astype(np.uint8)[y0:y1, x0:x1], "RGBA").save(masters / f"{stem}.png")
    for name, src in stand_ins.items():
        cuts[name] = dict(cuts[src])
        notes.append(f"The sheet's {name} cell is drawn wrong; {src} stands in for it.")
    # The sheets don't keep one scale in every cell (a row can be drawn bigger than the next), so each standing frame
    # is scaled to the character's height, each walk row so its tallest frame (the passing step) is WALK_TALL of it,
    # and the seated frames at the median of those scales.
    scale = {}
    for name, c in cuts.items():
        if name.startswith("idle_"):
            scale[name] = target / (c["foot"][1] - c["top"])
    for side in ("front34", "back34"):
        row = [n for n in cuts if n.startswith(f"walk_{side}_")]
        tallest = max(cuts[n]["foot"][1] - cuts[n]["top"] for n in row)
        for n in row:
            scale[n] = target * WALK_TALL / tallest
    seated = float(np.median(list(scale.values())))
    frames = {}
    for name in FRAMES:
        c = cuts[name]
        anchor = c.get("seat") or c["foot"]
        im, pt = scaled(c["rgb"], c["a"], c["bb"], anchor, scale.get(name, seated))
        frames[name] = dict(im=im, faces=c["faces"], **({"seat": pt} if c.get("seat") else {"foot": pt}))
    return cm, frames, notes


def recipe(cid, look=None):
    """Everything this script does to a sprite sheet beyond its bytes, hashed: a change means a rebuild (--check)."""
    key = f"{cid}/{look}" if look else cid
    spec = (REF_CM, REF_PX, QUALITY, MODEL, PERSON_MODEL, SAM_MODEL, CELLS, CELL_PAD, WALK_TALL, height_cm(cid),
            EXTRA_CM.get(key, EXTRA_CM.get(cid, 0)),
            sorted(STAND_INS.get(key, {}).items()), sorted((k[1], v) for k, v in ERASE.items() if k[0] == key))
    return hashlib.sha1(repr(spec).encode()).hexdigest()[:12]


def file_sha1(path):
    return hashlib.sha1(path.read_bytes()).hexdigest()[:16]


# ------------------------------------------------------------------------------- checking
def everyone_with_art():
    """Everyone with a model sheet, a sprite sheet or a sheet for one of their looks."""
    return sorted(set(SHEETS) | {q.parent.name for q in SPRITES.glob("*/sheet.webp")}
                  | {q.parent.parent.name for q in SPRITES.glob("*/*/sheet.webp")})


def files_problems(label, d, listed):
    """Every listed picture in folder d exists at its listed size, with its anchor inside it."""
    problems = []
    for name, v in listed.items():
        f = d / f"{name}.webp"
        if not f.exists():
            problems.append(f"{label}/{name}.webp is missing")
            continue
        with Image.open(f) as im:
            if list(im.size) != v.get("size") or im.mode != "RGBA":
                problems.append(f"{label}/{name}.webp is {im.size} {im.mode}, the manifest says {v.get('size')} RGBA")
        anchor = v.get("seat") or v.get("foot")
        if not anchor or not (0 <= anchor[0] <= v["size"][0] and 0 <= anchor[1] <= v["size"][1] + 4):
            problems.append(f"{label}/{name}: its anchor {anchor} is outside the picture")
    return problems


def check():
    """Problems with web/client/figures/ as it stands (empty: up to date)."""
    problems = []
    mpath = OUT / "manifest.json"
    if not mpath.exists():
        return ["web/client/figures/manifest.json is missing"]
    m = json.loads(mpath.read_text())
    if m.get("$seats") != SEATS:
        problems.append('manifest "$seats" differs from SEATS in the script')
    ids = {k for k in m if not k.startswith("$")}
    for cid in sorted(set(SHEETS) | {q.parent.name for q in SPRITES.glob("*/sheet.webp")}):
        sheet = sprite_sheet(cid)
        e = m.get(cid)
        if e is None:
            problems.append(f"{cid}: not in the manifest")
            continue
        if sheet:
            if e.get("from") != str(sheet.relative_to(ROOT)):
                problems.append(f"{cid}: cut from {e.get('from')}, but it has a sprite sheet ({sheet.relative_to(ROOT)})")
                continue
            if e.get("sha1") != file_sha1(sheet) or e.get("recipe") != recipe(cid):
                problems.append(f"{cid}: its sprite sheet or this script's settings for it changed since it was cut")
            if set(e.get("frames", {})) != set(FRAMES) or e.get("views"):
                problems.append(f"{cid}: the manifest doesn't list exactly the sheet's frames")
        elif e.get("from") != str(SHEETS[cid][0].relative_to(ROOT)):
            problems.append(f"{cid}: cut from {e.get('from')}, expected {SHEETS[cid][0].relative_to(ROOT)}")
    # The sheets for their other looks (D-079).
    for cid in sorted({q.parent.parent.name for q in SPRITES.glob("*/*/sheet.webp")}):
        e, drawn = m.get(cid), drawn_look(cid)
        for look, sheet in look_sheets(cid).items():
            label = f"{cid}/{look}"
            if look not in LOOKS:
                problems.append(f"{label}: {look} isn't a look (everyday, work or evening)")
                continue
            if look == drawn:
                problems.append(f"{label}: their art already shows their {look} look (drawn): that sheet is {cid}/sheet.webp")
                continue
            if e is None:
                problems.append(f"{label}: a sheet for a look, but no sprite sheet or model sheet of {cid} yet")
                continue
            le = (e.get("looks") or {}).get(look)
            if le is None:
                problems.append(f"{label}: not in the manifest")
                continue
            if le.get("from") != str(sheet.relative_to(ROOT)):
                problems.append(f"{label}: cut from {le.get('from')}, expected {sheet.relative_to(ROOT)}")
            if le.get("sha1") != file_sha1(sheet) or le.get("recipe") != recipe(cid, look):
                problems.append(f"{label}: its sprite sheet or this script's settings for it changed since it was cut")
            if set(le.get("frames", {})) != set(FRAMES):
                problems.append(f"{label}: the manifest doesn't list exactly the sheet's frames")
    for cid in sorted(ids):
        e, d = m[cid], OUT / cid
        listed = {**e.get("views", {}), **e.get("frames", {})}
        looks = e.get("looks") or {}
        problems += files_problems(cid, d, listed)
        for look, le in looks.items():
            if look not in look_sheets(cid):
                problems.append(f"{cid}/{look}: in the manifest, but art/sprites/characters/{cid}/{look}/sheet.webp is gone")
            problems += files_problems(f"{cid}/{look}", d / look, le.get("frames", {}))
            ld = d / look
            extra = sorted(q.name for q in ld.glob("*") if q.stem not in le.get("frames", {})) if ld.exists() else []
            if extra:
                problems.append(f"{cid}/{look}: files the manifest doesn't list: {', '.join(extra)}")
        extra = sorted(q.name for q in d.glob("*") if (q.is_dir() and q.name not in looks) or (q.is_file() and q.stem not in listed)) if d.exists() else []
        if extra:
            problems.append(f"{cid}: files the manifest doesn't list: {', '.join(extra)}")
    stray = sorted(q.name for q in OUT.iterdir() if q.is_dir() and q.name not in ids)
    if stray:
        problems.append(f"folders with no manifest entry: {', '.join(stray)}")
    return problems


def write_pictures(d, pics, order):
    """Saves the pictures into folder d (dropping files it no longer has) and returns their manifest entries."""
    d.mkdir(parents=True, exist_ok=True)
    for old in d.glob("*"):
        if old.is_file() and old.stem not in pics:
            old.unlink()
    out = {}
    for v in order:
        if v not in pics:
            continue
        x = pics[v]
        x["im"].save(d / f"{v}.webp", "WEBP", quality=QUALITY, method=6, exact=False)
        pt = x.get("foot") or x["seat"]
        out[v] = {"size": [x["im"].width, x["im"].height], ("seat" if "seat" in x else "foot"): [round(pt[0], 1), round(pt[1], 1)],
                  "faces": x["faces"]}
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--only", help="comma-separated character ids, or <id>:<look> for one look's sheet (the manifest keeps the others)")
    ap.add_argument("--check", action="store_true", help="exit 1 if web/client/figures is out of date (nothing written)")
    ap.add_argument("--cache", type=pathlib.Path, default=pathlib.Path(tempfile.gettempdir()) / "livera-figure-masks")
    ap.add_argument("--preview", type=pathlib.Path, help="write <id>.png previews here")
    ap.add_argument("--masters", type=pathlib.Path, help="keep the full-resolution cut-outs here (not in the repo)")
    args = ap.parse_args()
    if args.check:
        problems = check()
        for p in problems:
            print(p)
        print("web/client/figures is up to date" if not problems else f"{len(problems)} problem(s): run scripts/client_figures.py")
        sys.exit(1 if problems else 0)
    args.cache.mkdir(parents=True, exist_ok=True)
    for d in (args.preview, args.masters):
        if d:
            d.mkdir(parents=True, exist_ok=True)
    everyone = everyone_with_art()
    # --only: id -> None (everything of theirs) or the set of looks to cut.
    only = None
    if args.only:
        only = {}
        for part in args.only.split(","):
            cid, _, look = part.partition(":")
            if not look:
                only[cid] = None
            elif only.get(cid, set()) is not None:
                only.setdefault(cid, set()).add(look)
        if set(only) - set(everyone):
            raise SystemExit(f"unknown ids: {sorted(set(only) - set(everyone))}")
    OUT.mkdir(parents=True, exist_ok=True)
    mpath = OUT / "manifest.json"
    manifest = json.loads(mpath.read_text()) if mpath.exists() and only else {}
    for k in [k for k in manifest if k.startswith("$")]:
        manifest.pop(k)
    models = Models()

    def write_manifest():
        ordered = {"$comment": f"Generated by {SELF} from the sprite sheets in art/sprites/characters and the model sheets in "
                   f"art/reference; do not edit by hand. Pictures are {REF_PX} px for a {REF_CM} cm person (px_per_cm), each "
                   "character at their own height. A sprite sheet's frames: foot is the point between the feet on the ground "
                   "line, seat (seated frames) where the seat is under the hips, in pixels of the picture; sha1 and recipe say "
                   "what they were cut from (--check). A model sheet's views: foot as above. faces is the way the figure looks "
                   "on screen (null: toward the camera or away). $seats: per kind of seat in the rooms, its height as a fraction "
                   "of a standing 1.75 m person and a nudge of the seated frames (dx toward the way they face, dy down).",
                   "$seats": SEATS}
        for k in sorted(manifest):
            ordered[k] = manifest[k]
        mpath.write_text("{\n" + ",\n".join(f" {json.dumps(k)}: {json.dumps(v, ensure_ascii=False)}" for k, v in ordered.items()) + "\n}\n")

    for cid in everyone:
        if only and cid not in only:
            continue
        d = OUT / cid
        base = only is None or only[cid] is None
        if base and (sprite_sheet(cid) or cid in SHEETS):
            sheet = sprite_sheet(cid)
            if sheet:
                cm, pics, notes = cut_sprites(cid, sheet, args.cache, models, args.masters)
                entry = {"height_cm": cm, "px_per_cm": round(REF_PX / REF_CM, 4), "from": str(sheet.relative_to(ROOT)),
                         "sha1": file_sha1(sheet), "recipe": recipe(cid)}
                order, key = FRAMES, "frames"
            else:
                spec = SHEETS[cid]
                cm, pics, notes = cut(cid, spec, args.cache, models, args.masters)
                entry = {"height_cm": cm, "px_per_cm": round(REF_PX / REF_CM, 4), "from": str(spec[0].relative_to(ROOT))}
                order, key = VIEWS, "views"
            entry[key] = write_pictures(d, pics, order)
            if notes:
                entry["notes"] = notes
            manifest[cid] = entry
            print(f"{cid:13s} {cm} cm  " + "  ".join(f"{v} {pics[v]['im'].width}x{pics[v]['im'].height}" for v in order if v in pics))
            if args.preview:
                preview(cid, pics, args.preview / f"{cid}.png", order)
        entry = manifest.get(cid)
        sheets = look_sheets(cid)
        if entry is None:
            if sheets:
                print(f"{cid}: sheets for their looks, but no sprite sheet or model sheet of them yet; nothing cut", file=sys.stderr)
            continue
        # Their other looks (D-079): all of them with the base, else the ones --only names; the rest are kept.
        looks = {} if base else dict(entry.get("looks") or {})
        drawn = drawn_look(cid)
        for look, sheet in sheets.items():
            if not base and look not in only[cid]:
                continue
            if look not in LOOKS or look == drawn:
                print(f"{cid}/{look}: not cut (a look is everyday, work or evening, and not the one their art shows: {drawn})", file=sys.stderr)
                continue
            cm, pics, notes = cut_sprites(cid, sheet, args.cache, models, args.masters, look)
            le = {"from": str(sheet.relative_to(ROOT)), "sha1": file_sha1(sheet), "recipe": recipe(cid, look),
                  "frames": write_pictures(d / look, pics, FRAMES)}
            if notes:
                le["notes"] = notes
            looks[look] = le
            print(f"{cid + '/' + look:13s} {cm} cm  " + "  ".join(f"{v} {pics[v]['im'].width}x{pics[v]['im'].height}" for v in FRAMES if v in pics))
            if args.preview:
                preview(cid, pics, args.preview / f"{cid}_{look}.png", FRAMES)
        for gone in [q for q in d.glob("*") if q.is_dir() and q.name not in sheets]:
            shutil.rmtree(gone)   # a look whose sheet is gone
        looks = {k: looks[k] for k in LOOKS if k in looks and k in sheets}
        if looks:
            entry["looks"] = looks
        else:
            entry.pop("looks", None)
        write_manifest()   # after each character: a long run that stops early keeps what it made
    write_manifest()


if __name__ == "__main__":
    main()
