#!/usr/bin/env python3
"""
One-time downloader for NFL team logos into:
  public/images/nfl/teams/

It pulls a public CSV that includes team abbreviations + logo URLs,
downloads each logo to SEA.svg / SF.png etc, and then creates alias
files for common abbreviation mismatches (LA <-> LAR, WAS <-> WSH, etc).

Run from repo root:
  python3 scripts/fetch-nfl-logos.py
"""

import csv
import os
import sys
import urllib.request
from urllib.parse import urlparse

CSV_URL = "https://raw.githubusercontent.com/nflverse/nflverse-pbp/master/teams_colors_logos.csv"
OUT_DIR = os.path.join("public", "images", "nfl", "teams")

ABBR_CANDIDATES = ["team_abbr", "abbr", "team"]
LOGO_CANDIDATES = [
    "team_logo_wikipedia",
    "team_logo_espn",
    "team_logo",
    "logo",
    "logo_url",
]

# Alias pairs: if one exists, copy to the other if missing.
# This handles common source differences across providers.
ALIASES = [
    ("LA", "LAR"),     # Rams
    ("WSH", "WAS"),    # Washington
    ("JAX", "JAC"),    # Jaguars (rare)
    ("LV", "LVR"),     # Raiders (rare)
]

def ext_from_url(url: str) -> str:
    path = urlparse(url).path.lower()
    if path.endswith(".svg"):
        return ".svg"
    if path.endswith(".png"):
        return ".png"
    if path.endswith(".jpg") or path.endswith(".jpeg"):
        return ".jpg"
    return ".img"

def download_bytes(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "seahawksfanzone/1.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()

def pick_column(headers, candidates):
    headers_lc = {h.lower(): h for h in headers if h}
    for c in candidates:
        if c.lower() in headers_lc:
            return headers_lc[c.lower()]
    return None

def find_existing_file(abbr: str):
    """Return path to an existing file for abbr (any ext), else None."""
    for ext in [".svg", ".png", ".jpg", ".jpeg", ".img"]:
        p = os.path.join(OUT_DIR, f"{abbr}{ext}")
        if os.path.exists(p) and os.path.getsize(p) > 0:
            return p
    return None

def copy_if_missing(src_abbr: str, dst_abbr: str):
    src_file = find_existing_file(src_abbr)
    if not src_file:
        return 0

    # Copy to dst with same extension if dst missing
    _, ext = os.path.splitext(src_file)
    dst_file = os.path.join(OUT_DIR, f"{dst_abbr}{ext}")
    if os.path.exists(dst_file) and os.path.getsize(dst_file) > 0:
        return 0

    try:
        with open(src_file, "rb") as f:
            data = f.read()
        with open(dst_file, "wb") as f:
            f.write(data)
        print(f"alias {src_abbr} -> {dst_abbr} ({os.path.basename(dst_file)})")
        return 1
    except Exception as e:
        print(f"FAILED alias {src_abbr} -> {dst_abbr}: {e}", file=sys.stderr)
        return 0

def main() -> int:
    os.makedirs(OUT_DIR, exist_ok=True)

    # Fetch CSV
    try:
        with urllib.request.urlopen(CSV_URL, timeout=30) as r:
            text = r.read().decode("utf-8", errors="replace")
    except Exception as e:
        print(f"Failed to fetch CSV: {e}", file=sys.stderr)
        return 1

    text = text.replace("\r\n", "\n").replace("\r", "\n")
    reader = csv.DictReader(text.splitlines())

    if not reader.fieldnames:
        print("Could not read CSV headers", file=sys.stderr)
        return 1

    headers = [h.strip() for h in reader.fieldnames if h and h.strip()]
    abbr_col = pick_column(headers, ABBR_CANDIDATES)
    logo_col = pick_column(headers, LOGO_CANDIDATES)

    if not abbr_col or not logo_col:
        print("Could not find expected columns in CSV.", file=sys.stderr)
        print("Headers:", headers, file=sys.stderr)
        return 1

    downloaded = 0
    failed = 0

    for row in reader:
        abbr = (row.get(abbr_col) or "").strip().upper()
        logo_url = (row.get(logo_col) or "").strip()

        if not abbr or not logo_url:
            continue

        ext = ext_from_url(logo_url)
        out_path = os.path.join(OUT_DIR, f"{abbr}{ext}")

        # Skip if already downloaded
        if os.path.exists(out_path) and os.path.getsize(out_path) > 0:
            continue

        try:
            data = download_bytes(logo_url)
            with open(out_path, "wb") as f:
                f.write(data)
            print(f"saved {abbr} -> {out_path}")
            downloaded += 1
        except Exception as e:
            print(f"FAILED {abbr} ({logo_url}): {e}", file=sys.stderr)
            failed += 1

    # Create aliases both directions
    alias_made = 0
    for a, b in ALIASES:
        alias_made += copy_if_missing(a, b)
        alias_made += copy_if_missing(b, a)

    print("\nDone.")
    print(f"Downloaded: {downloaded}")
    print(f"Aliases created: {alias_made}")
    print(f"Failed: {failed}")
    print(f"Output dir: {OUT_DIR}")
    return 0 if failed == 0 else 2

if __name__ == "__main__":
    raise SystemExit(main())
