#!/usr/bin/env python3
"""Formats data/**/*.json compactly: containers that fit on one line stay on one line.

Usage: scripts/format_data.py [files...]   (default: every file under data/)
"""
import json
import pathlib
import sys

WIDTH = 110


def fmt(value, indent=0):
    flat = json.dumps(value, ensure_ascii=False)
    if len(flat) + indent <= WIDTH or not isinstance(value, (dict, list)) or not value:
        return flat.replace('", "', '", "')
    pad = " " * (indent + 2)
    if isinstance(value, dict):
        items = [f'{pad}{json.dumps(k, ensure_ascii=False)}: {fmt(v, indent + 2)}' for k, v in value.items()]
        return "{\n" + ",\n".join(items) + "\n" + " " * indent + "}"
    items = [pad + fmt(v, indent + 2) for v in value]
    return "[\n" + ",\n".join(items) + "\n" + " " * indent + "]"


def main(paths):
    root = pathlib.Path(__file__).resolve().parent.parent / "data"
    files = [pathlib.Path(p) for p in paths] or sorted(root.rglob("*.json"))
    for f in files:
        data = json.loads(f.read_text(encoding="utf-8"))
        f.write_text(fmt(data) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main(sys.argv[1:])
