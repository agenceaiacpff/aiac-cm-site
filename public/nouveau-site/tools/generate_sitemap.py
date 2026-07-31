#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AIAC — Générateur de carte du site (site-map.json)
- Parcourt le dossier du site
- Exporte une structure arborescente JSON lisible par explorer.html

Usage:
  python tools/generate_sitemap.py

Astuce Netlify (optionnel) :
  Vous pouvez utiliser ce script comme commande de build.
"""
from __future__ import annotations
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]  # dossier du site

EXCLUDE_DIRS = {".git", ".github", "node_modules", "__pycache__", "tools"}
EXCLUDE_FILES = {"site-map.json"}

def build_node(path: Path, rel: str) -> dict:
    if path.is_dir():
        children = []
        for child in sorted(path.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower())):
            if child.name in EXCLUDE_DIRS:
                continue
            if child.is_file() and child.name in EXCLUDE_FILES:
                continue
            # ignore large binaries except images under autres? Keep all files except excluded
            child_rel = (Path(rel) / child.name).as_posix() if rel else child.name
            children.append(build_node(child, child_rel))
        return {"type": "dir", "name": path.name if rel else "AIAC_SITE", "path": rel if rel else "", "children": children}
    else:
        return {"type": "file", "name": path.name, "path": rel}

def main():
    tree = build_node(ROOT, "")
    out = ROOT / "site-map.json"
    out.write_text(json.dumps(tree, ensure_ascii=False, indent=2), encoding="utf-8")
    print("✅ site-map.json généré :", out)

if __name__ == "__main__":
    main()
