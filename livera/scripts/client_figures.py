#!/usr/bin/env python3
"""Full-body cut-outs of the founders and the four residents with art, for the web client's map.

Reads each character's model sheet (art/reference/characters/<id>.jpg, art/reference/residents/<id>.jpg),
cuts every full-body view on it out of its background, and writes web/client/figures/<id>/<view>.webp
and web/client/figures/manifest.json. Run it again whenever a sheet changes:

    scripts/client_figures.py                  rebuild web/client/figures/
    scripts/client_figures.py --only dax,rosa-delgado
    scripts/client_figures.py --preview DIR    also write, per character, every view composited on the
                                               town's sand and on the night colour, to look at
    scripts/client_figures.py --masters DIR    also keep the full-resolution cut-outs (PNG) there;
                                               they are masters and stay out of the repository

Needs Python 3, Pillow, numpy and rembg (pip install "rembg[cpu]"). The matte is BiRefNet
(rembg's "birefnet-general-lite"): its model (224 MB) downloads once into $U2NET_HOME (default
~/.u2net) and then everything runs offline. Masks are cached by sheet, box and model (--cache, default
a folder under the system's temp directory), so a second run takes seconds. A classical matte was
not enough: nine of the founders' sheets are photo collages whose only full-body shots stand in a
furnished lobby, not on a studio background.

What the sheets have (layouts vary; the boxes below were measured on each sheet):
- Dominique: a five-view turnaround on a grey studio background (front, three-quarter front, side,
  three-quarter back, back).
- Dax and the four residents (Kai Morgan, Rosa Delgado, Sol Rivera, Theo Grant): a four-view
  turnaround on grey (front, three-quarter, side, back).
- Aaliyah, Andre, Graham, Harper, Julian, Leila, Maya, Naomi and Sienna: a walking shot toward the
  camera (used as "front") and a shot from behind looking back over the shoulder (used as "back34"),
  both in a scene. They have no side, three-quarter front or straight back view; the client falls back
  to the nearest view it has (figures.js).

Each cut-out: the sheet box is padded square and segmented; the figure is the largest connected part
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

The output is deterministic for the same input, model and Pillow version.
"""
import argparse
import hashlib
import json
import os
import pathlib
import sys
import tempfile

sys.dont_write_bytecode = True

import numpy as np  # noqa: E402
from PIL import Image  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "web" / "client" / "figures"
SELF = "scripts/client_figures.py"
MODEL = "birefnet-general-lite"
REF_CM, REF_PX = 175, 360            # a 1.75 m person is 360 px tall in the pictures
QUALITY = 88
SAND, NIGHT = (235, 215, 184), (6, 26, 34)   # art/STYLE.md sand stone; layout.js LIGHT's night ambient
VIEWS = ("front", "front34", "side", "back34", "back")

CHAR = ROOT / "art" / "reference" / "characters"
RES = ROOT / "art" / "reference" / "residents"   # the four residents' sheets (data characters since D-073)
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
        ("back", (1222, 0, 1534, 708), None, "t")], ["Her weekend look (camel coat over the shoulders); her work look has no turnaround yet."]),
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


# --------------------------------------------------------------------------------- the mask
def segment(img, box, cache, session_box):
    """BiRefNet's alpha (0..1) for the sheet box, padded square first so the model sees the figure
    undistorted. Cached by sheet bytes, box and model."""
    crop = img.crop(box)
    key = hashlib.sha1(img.tobytes() + repr((box, MODEL)).encode()).hexdigest()[:20]
    path = cache / f"{key}.png"
    if path.exists():
        return np.asarray(Image.open(path)).astype(np.float32) / 255
    if session_box[0] is None:
        import onnxruntime as ort
        from rembg import new_session
        opts = ort.SessionOptions()   # BiRefNet's peak memory without these is over 12 GB
        opts.enable_cpu_mem_arena = False
        opts.enable_mem_pattern = False
        opts.intra_op_num_threads = 2
        session_box[0] = new_session(MODEL, sess_opts=opts)
    from rembg import remove
    a = np.asarray(crop)
    h, w = a.shape[:2]
    n = max(h, w)
    py, px = (n - h) // 2, (n - w) // 2
    sq = np.pad(a, ((py, n - h - py), (px, n - w - px), (0, 0)), mode="edge")
    m = remove(Image.fromarray(sq), session=session_box[0], only_mask=True)
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


def height_cm(cid):
    data = json.loads((ROOT / "data" / "characters" / f"{cid}.json").read_text())
    for c in data["characters"]:
        if c["id"] == cid:
            return c["profile"]["appearance"]["height_cm"]
    raise SystemExit(f"{cid}: no height in data/characters")


# ------------------------------------------------------------------------------- building
def cut(cid, spec, cache, session_box, masters):
    sheet, views, notes = spec
    img = Image.open(sheet).convert("RGB")
    cm = height_cm(cid)
    target = (cm + EXTRA_CM.get(cid, 0)) * REF_PX / REF_CM     # px from the top of the head (hat) to the soles
    cuts = []
    for view, box, faces, group in views:
        alpha = segment(img, box, cache, session_box)
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
        x0, y0, x1, y1 = c["bb"]
        pad = 3
        x0, y0, x1, y1 = max(0, x0 - pad), max(0, y0 - pad), min(c["a"].shape[1], x1 + pad), min(c["a"].shape[0], y1 + pad)
        y1 = max(y1, int(np.ceil(c["foot"][1])) + pad)
        rgba = np.dstack([c["rgb"], c["a"] * 255])[y0:y1, x0:x1]
        if rgba.shape[0] < y1 - y0:   # the ground line at the box's edge: pad below the feet
            rgba = np.pad(rgba, ((0, y1 - y0 - rgba.shape[0]), (0, 0), (0, 0)))
        im = Image.fromarray(rgba.astype(np.uint8), "RGBA")
        W, H = max(1, round(im.width * s)), max(1, round(im.height * s))
        im = im.resize((W, H), Image.LANCZOS)   # Pillow resamples RGBA premultiplied: no dark fringe
        foot = ((c["foot"][0] - x0) * s, (c["foot"][1] - y0) * s)
        out_views[c["view"]] = dict(im=im, foot=foot, faces=c["faces"], filled=c["filled"], src=c["box"])
    return cm, out_views, notes


def preview(cid, views, path):
    """Every view on the sand and on the night colour, side by side, feet on one line."""
    ims = [views[v]["im"] for v in VIEWS if v in views]
    feet_y = max(views[v]["foot"][1] for v in VIEWS if v in views)
    H = int(max(feet_y + (im.height - views[v]["foot"][1]) for v, im in zip([v for v in VIEWS if v in views], ims))) + 10
    W = sum(im.width for im in ims) + 12 * (len(ims) + 1)
    sheet = Image.new("RGB", (W, 2 * H), SAND)
    sheet.paste(Image.new("RGB", (W, H), NIGHT), (0, H))
    x = 12
    for v in VIEWS:
        if v not in views:
            continue
        im, (fx, fy) = views[v]["im"], views[v]["foot"]
        for row in (0, H):
            sheet.paste(im, (x, int(row + 5 + feet_y - fy)), im)
        x += im.width + 12
    sheet.save(path)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--only", help="comma-separated character ids (the manifest keeps the others)")
    ap.add_argument("--cache", type=pathlib.Path, default=pathlib.Path(tempfile.gettempdir()) / "livera-figure-masks")
    ap.add_argument("--preview", type=pathlib.Path, help="write <id>.png previews here")
    ap.add_argument("--masters", type=pathlib.Path, help="keep the full-resolution cut-outs here (not in the repo)")
    args = ap.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    for d in (args.preview, args.masters):
        if d:
            d.mkdir(parents=True, exist_ok=True)
    only = set(args.only.split(",")) if args.only else None
    if only and only - set(SHEETS):
        raise SystemExit(f"unknown ids: {sorted(only - set(SHEETS))}")
    OUT.mkdir(parents=True, exist_ok=True)
    mpath = OUT / "manifest.json"
    manifest = json.loads(mpath.read_text()) if mpath.exists() and only else {}
    manifest.pop("$comment", None)
    session_box = [None]

    def write_manifest():
        ordered = {"$comment": f"Generated by {SELF} from the model sheets in art/reference; do not edit by hand. "
                   f"Pictures are {REF_PX} px for a {REF_CM} cm person (px_per_cm), each character at their own height; "
                   "foot is the point between the feet on the ground line, in pixels of the picture; faces is the way "
                   "the figure looks on screen (null: toward the camera or away)."}
        for k in sorted(manifest):
            ordered[k] = manifest[k]
        mpath.write_text("{\n" + ",\n".join(f" {json.dumps(k)}: {json.dumps(v, ensure_ascii=False)}" for k, v in ordered.items()) + "\n}\n")

    for cid, spec in SHEETS.items():
        if only and cid not in only:
            continue
        cm, views, notes = cut(cid, spec, args.cache, session_box, args.masters)
        d = OUT / cid
        d.mkdir(exist_ok=True)
        for old in d.glob("*.webp"):
            if old.stem not in views:
                old.unlink()
        entry = {"height_cm": cm, "px_per_cm": round(REF_PX / REF_CM, 4), "from": str(spec[0].relative_to(ROOT)), "views": {}}
        for v in VIEWS:
            if v not in views:
                continue
            x = views[v]
            x["im"].save(d / f"{v}.webp", "WEBP", quality=QUALITY, method=6, exact=False)
            entry["views"][v] = {"size": [x["im"].width, x["im"].height], "foot": [round(x["foot"][0], 1), round(x["foot"][1], 1)],
                                 "faces": x["faces"]}
        if notes:
            entry["notes"] = notes
        manifest[cid] = entry
        filled = ", ".join(f"{v} {views[v]['filled']} px" for v in views if views[v]["filled"])
        print(f"{cid:13s} {cm} cm  " + "  ".join(f"{v} {views[v]['im'].width}x{views[v]['im'].height}" for v in VIEWS if v in views)
              + (f"   holes filled: {filled}" if filled else ""))
        write_manifest()   # after each character: a long run that stops early keeps what it made
        if args.preview:
            preview(cid, views, args.preview / f"{cid}.png")


if __name__ == "__main__":
    main()
