#!/usr/bin/env python3
"""
Fetch NFL team logos into:
  public/images/nfl/teams/

What it does:
1) Downloads logos from nflverse CSV.
2) Creates alias copies for common abbreviation mismatches.
3) Reads your current schedule JSON (src/data/nfl/seahawks.json) and ensures every
   team abbreviation appearing in that file has a logo.
   - If still missing after nflverse+aliases, it pulls a fallback PNG from ESPN.

Run from repo root:
  python3 scripts/fetch-nfl-logos.py
"""

import csv
import json
import os
import sys
import urllib.request
from urllib.parse import urlparse

CSV_URL = "https://raw.githubusercontent.com/nflverse/nflverse-pbp/master/teams_colors_logos.csv"
OUT_DIR = os.path.join("public", "images", "nfl", "teams")
SCHEDULE_JSON = os.path.join("src", "data", "nfl", "seahawks.json")

ABBR_CANDIDATES = ["team_abbr", "abbr", "team"]
LOGO_CANDIDATES = [
    "team_logo_wikipedia",
    "team_logo_espn",
    "team_logo",
    "logo",
    "logo_url",
]

# Alias pairs: if one exists, copy to the other if missing
ALIASES = [
    ("LA", "LAR"),     # Rams
    ("WSH", "WAS"),    # Washington
    ("JAX", "JAC"),    # Jaguars (rare)
    ("LV", "LVR"),     # Raiders (rare)
]

# ESPN team ID mapping (for fallback download)
# We only need teams appearing in your schedule file. Add more if needed.
ESPN_TEAM_IDS = {
    "ARI": 22,
    "ATL": 1,
    "BAL": 33,
    "BUF": 2,
    "CAR": 29,
    "CHI": 3,
    "CIN": 4,
    "CLE": 5,
    "DAL": 6,
    "DEN": 7,
    "DET": 8,
    "GB": 9,
    "HOU": 34,
    "IND": 11,
    "JAX": 30,
    "KC": 12,
    "LA": 14,   # Rams (ESPN uses LA for Rams)
    "LAR": 14,  # alias
    "LAC": 24,
    "LV": 13,
    "MIA": 15,
    "MIN": 16,
    "NE": 17,
    "NO": 18,
    "NYG": 19,
    "NYJ": 20,
    "PHI": 21,
    "PIT": 23,
    "SEA": 26,
    "SF": 25,
    "TB": 27,
    "TEN": 10,
    "WAS": 28,
    "WSH": 28,  # alias
}

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
    for ext in [".svg", ".png", ".jpg", ".jpeg", ".img"]:
        p = os.path.join(OUT_DIR, f"{abbr}{ext}")
        if os.path.exists(p) and os.path.getsize(p) > 0:
            return p
    return None

def copy_if_missing(src_abbr: str, dst_abbr: str):
    src_file = find_existing_file(src_abbr)
    if not src_file:
        return 0

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

def espn_logo_url(abbr: str) -> str:
    """
    ESPN CDN logo endpoint by team id:
    https://a.espncdn.com/i/teamlogos/nfl/500/<id>.png
    """
    team_id = ESPN_TEAM_IDS.get(abbr)
    if not team_id:
        return ""
    return f"https://a.espncdn.com/i/teamlogos/nfl/500/{team_id}.png"

def ensure_from_espn(abbr: str) -> bool:
    """
    Download ESPN fallback PNG if abbr still missing.
    Saves as <ABBR>.png.
    """
    url = espn_logo_url(abbr)
    if not url:
        return False
    out_path = os.path.join(OUT_DIR, f"{abbr}.png")
    if os.path.exists(out_path) and os.path.getsize(out_path) > 0:
        return True
    try:
        data = download_bytes(url)
        with open(out_path, "wb") as f:
            f.write(data)
        print(f"espn saved {abbr} -> {out_path}")
        return True
    except Exception as e:
        print(f"FAILED espn {abbr} ({url}): {e}", file=sys.stderr)
        return False

def read_schedule_abbrs():
    if not os.path.exists(SCHEDULE_JSON):
        return set()
    with open(SCHEDULE_JSON, "r") as f:
        data = json.load(f)

    abbrs = set()
    for g in data.get("games", []):
        vt = g.get("visitor_team", {}) or {}
        ht = g.get("home_team", {}) or {}
        if vt.get("abbreviation"):
            abbrs.add(str(vt["abbreviation"]).upper())
        if ht.get("abbreviation"):
            abbrs.add(str(ht["abbreviation"]).upper())
    return abbrs

def main() -> int:
    os.makedirs(OUT_DIR, exist_ok=True)

    # 1) Fetch CSV and download what it provides
    downloaded = 0
    failed = 0

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

    for row in reader:
        abbr = (row.get(abbr_col) or "").strip().upper()
        logo_url = (row.get(logo_col) or "").strip()
        if not abbr or not logo_url:
            continue

        ext = ext_from_url(logo_url)
        out_path = os.path.join(OUT_DIR, f"{abbr}{ext}")

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

    # 2) Aliases both directions
    alias_made = 0
    for a, b in ALIASES:
        alias_made += copy_if_missing(a, b)
        alias_made += copy_if_missing(b, a)

    # 3) Ensure all abbreviations in your current schedule JSON exist
    schedule_abbrs = read_schedule_abbrs()
    ensured = 0
    still_missing = []

    for abbr in sorted(schedule_abbrs):
        if find_existing_file(abbr):
            continue

        # Try alias sources if possible (copy in the other direction)
        for a, b in ALIASES:
            if abbr == a:
                ensured += copy_if_missing(b, a)
            if abbr == b:
                ensured += copy_if_missing(a, b)

        if find_existing_file(abbr):
            continue

        # Try ESPN fallback
        if ensure_from_espn(abbr):
            ensured += 1
        else:
            still_missing.append(abbr)

    print("\nDone.")
    print(f"Downloaded from nflverse: {downloaded}")
    print(f"Aliases created: {alias_made}")
    print(f"Ensured via schedule scan: {ensured}")
    print(f"Failed downloads: {failed}")
    if still_missing:
        print("Still missing:", ", ".join(still_missing))
    print(f"Output dir: {OUT_DIR}")

    return 0 if (failed == 0 and not still_missing) else 2

if __name__ == "__main__":
    raise SystemExit(main())

