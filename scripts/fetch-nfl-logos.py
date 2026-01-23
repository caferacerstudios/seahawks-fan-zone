#!/usr/bin/env python3
"""
One-time downloader for NFL team logos into:
  public/images/nfl/teams/

It pulls a public CSV that includes team abbreviations + logo URLs,
then downloads each logo to a local file named like SEA.svg / SF.png etc.

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

    print(f"\nDone.")
    print(f"Downloaded: {downloaded}")
    print(f"Failed: {failed}")
    print(f"Output dir: {OUT_DIR}")
    return 0 if failed == 0 else 2

if __name__ == "__main__":
    raise SystemExit(main())
