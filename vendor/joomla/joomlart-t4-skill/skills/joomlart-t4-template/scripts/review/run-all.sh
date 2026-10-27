#!/usr/bin/env bash
# Run the review sweep over the MATRIX a reader actually meets, not one point of it.
#
# Usage: run-all.sh <base-url> <tag> <out.tsv> [pages-file]
#        TEMPLATE_DIR=<template dir> run-all.sh …   ← also runs the coverage gates
#        OD_DIR=<od-design-system> OD_SYSTEM=<id> run-all.sh …   ← also checks the Sass variables
#
# TEMPLATE_DIR is optional and the runner says so in its output rather than skipping in silence:
# a gate that stands down when a condition is missing reports the same colour as a gate that ran.
#
# WHY A MATRIX. The old sweep ran every scanner over every page at ONE viewport, in ONE colour
# scheme, with the page at rest, through ONE entry point — and reported 320 green measurements while
# six real defects sat in the states it never visited:
#
#   · a headline at contrast 1.25 in LIGHT, correct in dark, on the home page (contrast-audit ran
#     dark only, on the reasoning that dark is where palettes break);
#   · the mobile drawer at background #fff in DARK, its links already flipped to #f8f8f8 — the whole
#     menu unreadable, and the close button with it;
#   · opening that drawer pushed 83 elements past the right edge at 800px, 135 at 390px;
#   · every `tmpl=component` page — modals, iframes, print views — loading `template.css` with none
#     of its tokens declared, because component.php is a second entry point.
#
# None of those exists on a page at rest, at 1440px, in dark, through index.php. So:
#
#   VIEWPORTS × MODES for the per-page scanners that read colour and width,
#   plus the two gates that drive a STATE (drawer-state opens the drawer) and the two that ask
#   structural questions once per page (cascade-ownership, geometry-fidelity).
#
# The cost is real — a full matrix is roughly 20x a single pass — so it runs in the background and
# writes one TSV row per (page, viewport, mode, scanner). A sweep diffs against the previous sweep.
#
# `timeout` is deliberately absent: it is not on macOS, and wrapping in it silently turned every row
# into "timeout: command not found" while the output file still looked full.
cd "$(dirname "$0")/../.."
R="$(dirname "$0")"
BASE="$1"; TAG="$2"; OUT="$3"; PAGES="${4:-$R/pages.txt}"

# REFUSE rather than run empty. Every verdict this script produces goes through `row()`, which
# appends to "$OUT" — so with $OUT unset the redirect fails once per row and the sweep prints
# `line 59: : No such file or directory` forty times and then EXITS 0. Measured: a full matrix over
# 39 pages reported nothing at all and looked, to the caller, exactly like a clean run.
#
# That is the fail-open shape every gate in this directory exists to prevent, so the runner is not
# allowed to have it either. It costs three lines here and removes a whole class of green lie.
if [ -z "$BASE" ] || [ -z "$TAG" ] || [ -z "$OUT" ]; then
  echo "Usage: run-all.sh <base-url> <tag> <out.tsv> [pages-file]" >&2
  echo "       every verdict is written to <out.tsv>; without it the sweep would run and report nothing." >&2
  exit 2
fi
if [ ! -f "$PAGES" ]; then
  echo "ERROR: no pages file at $PAGES — the sweep would visit nothing and still exit 0." >&2
  exit 2
fi
: > "$OUT"

VIEWPORTS="${VIEWPORTS:-1440 768 390}"
MODES="${MODES:-light dark}"

# THE VERDICT LINE, not the last line. Several gates close with a paragraph of guidance, so
# `tail -1` stored the advice and threw the finding away — measured on a live run: four rows of
# "count all three columns, elements included" and not one of the defects they were describing.
# A finding line starts with ✗; otherwise the OK/FAIL line is the answer.
verdict() {
  awk '
    # A finding may span lines: cascade-ownership puts the element on one and the two rules under it,
    # indented. Join them so one row holds the whole finding.
    /✗/ { buf = substr($0, index($0, "✗")); collecting = 1; next }
    collecting && /^ {4,}/ { gsub(/^ +/, "", $0); buf = buf " | " $0; next }
    collecting { print buf; found = 1; exit }
    # contrast-audit and palette-leak list hits without a ✗ and without an OK line.
    /cr=|\[light\]|\[dark\]|bg rgb|text rgb/ { gsub(/^ +/, "", $0); print; found = 1; exit }
    # Coverage lines are part of the verdict, not noise: "0 menu label(s) read" beside an OK is the
    # difference between a gate that passed and a gate that examined nothing. They were dropped, so
    # the sweep showed only the OK. Kept beside the verdict line rather than instead of it — and
    # only when the verdict line does not already carry the count, or the row reads "[5 elements
    # examined]  [5 elements examined]".
    /^[0-9]+ (menu label|link|block|element|image|page)/ { cover = $0 }
    /elements probed:|stale names looked for:/ { cover = $0 }
    /^(OK|FAIL|ERR|PASS|CHECK)/ { last = $0 }
    END { if (!found) { if (buf) print buf; else if (last) print last (cover && index(last, cover) == 0 ? "  [" cover "]" : "") } }
  '
}

row() { printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$TAG" "$1" "$2" "$3" "$4" "$5" >> "$OUT"; }

while read -r p; do
  [ "$p" = "/home" ] && p="/"
  u="$BASE$p"

  # ── Per page, once: structure does not change with the viewport ────────────
  row "$p" "-" "-" "cascade-ownership" "$(node "$R/cascade-ownership.mjs" "$u" 2>&1 | verdict)"
  row "$p" "-" "-" "geometry-fidelity" "$(node "$R/geometry-fidelity.mjs" "$u" 2>&1 | verdict)"
  row "$p" "-" "-" "nav-integrity" "$(node "$R/nav-integrity.mjs" "$u" --allow-minimal 2>&1 | verdict)"
  row "$p" "-" "-" "seam-doubling" "$(node "$R/seam-doubling.mjs" "$u" 2>&1 | verdict)"
  row "$p" "-" "-" "interaction-states" "$(node "$R/interaction-states.mjs" "$u" 2>&1 | verdict)"

  # THE SECOND ENTRY POINT. Every modal and iframe renders through component.php, which is a
  # different file with a different head — and no scanner had ever fetched one.
  row "$p" "-" "component" "contrast-audit" "$(node "$R/contrast-audit.mjs" "${u}?tmpl=component" 2>&1 | verdict)"

  # ── The drawer, opened, in both modes ──────────────────────────────────────
  row "$p" "800" "both" "drawer-state" "$(node "$R/drawer-state.mjs" "$u" 2>&1 | verdict)"

  # ── Per viewport, per mode ────────────────────────────────────────────────
  for vw in $VIEWPORTS; do
    row "$p" "$vw" "both" "layout-fit" "$(node "$R/layout-fit.mjs" "$u" --viewport="$vw" 2>&1 | verdict)"
    # contrast-audit and palette-leak drive both modes internally; font/border read one.
    row "$p" "$vw" "both" "contrast-audit" "$(node "$R/contrast-audit.mjs" "$u" 2>&1 | verdict)"
    for m in white darktext; do
      row "$p" "$vw" "dark" "leak-$m" "$(node "$R/palette-leak.mjs" "$u" "$m" 2>&1 | verdict)"
    done
    row "$p" "$vw" "light" "font-fidelity" "$(node "$R/font-fidelity.mjs" "$u" 2>&1 | verdict)"
    row "$p" "$vw" "dark" "border-visibility" "$(node "$R/border-visibility.mjs" "$u" 2>&1 | verdict)"
    row "$p" "$vw" "light" "band-rhythm" "$(node "$R/band-rhythm.mjs" "$u" 2>&1 | verdict)"
  done
done < "$PAGES"

# ── SITE-WIDE gates ────────────────────────────────────────────────────────────
# These read the whole build once rather than page by page, so they run outside the loop. They are
# the ones that answer "is this site finished", which no per-page scanner can see: a footer that
# describes yesterday's menu, a layout profile no page selects, a listing with three items in it.
# `image-relevance` is deliberately NOT here — it calls a model, costs money per image and can be
# wrong, so it is run on purpose rather than on every sweep.
if [ -n "$TEMPLATE_DIR" ]; then
  row "(site)" "-" "-" "layout-coverage" "$(node "$R/layout-coverage.mjs" "$BASE" --template="$TEMPLATE_DIR" 2>&1 | verdict)"
  row "(site)" "-" "-" "block-coverage"  "$(node "$R/block-coverage.mjs"  "$BASE" --template="$TEMPLATE_DIR" --styles 2>&1 | verdict)"
  row "(site)" "-" "-" "token-existence" "$(node "$R/token-existence.mjs" --template="$TEMPLATE_DIR" 2>&1 | verdict)"
  # Guards the toolkit, not the site — so it needs no URL and no template, but it belongs in the
  # sweep's output for the same reason as everything else: a verdict nobody prints is not a verdict.
  row "(site)" "-" "-" "gate-wiring" "$(node "$R/gate-wiring.mjs" 2>&1 | verdict)"
  row "(site)" "-" "-" "override-authorship" "$(node "$R/override-authorship.mjs" --template="$TEMPLATE_DIR" 2>&1 | verdict)"
  # `identity-leak` needs the template's NAME, which is its directory name — what it hunts for are
  # the names a rename left behind, so the caller names them in STALE_NAMES.
  row "(site)" "-" "-" "identity-leak" "$(node "$R/identity-leak.mjs" --url="$BASE" --template="$(basename "$TEMPLATE_DIR")" ${STALE_NAMES:+--stale="$STALE_NAMES"} 2>&1 | verdict)"
  # `variables-drift` needs to know WHICH design system this template wears, which nothing else in
  # the sweep does — so it takes two more env vars and says so when they are missing.
  if [ -n "$OD_DIR" ] && [ -n "$OD_SYSTEM" ]; then
    row "(site)" "-" "-" "variables-drift" "$(node "$R/variables-drift.mjs" --template="$TEMPLATE_DIR" --system="$OD_SYSTEM" --od="$OD_DIR" 2>&1 | verdict)"
  else
    row "(site)" "-" "-" "variables-drift" "SKIPPED — set OD_DIR and OD_SYSTEM to check the Sass variables"
  fi
else
  row "(site)" "-" "-" "layout-coverage" "SKIPPED — set TEMPLATE_DIR to run the coverage gates"
  row "(site)" "-" "-" "block-coverage"  "SKIPPED — set TEMPLATE_DIR to run the coverage gates"
  row "(site)" "-" "-" "token-existence" "SKIPPED — set TEMPLATE_DIR to run the coverage gates"
  row "(site)" "-" "-" "override-authorship" "SKIPPED — set TEMPLATE_DIR to run the coverage gates"
  row "(site)" "-" "-" "variables-drift" "SKIPPED — set TEMPLATE_DIR to run the coverage gates"
fi

row "(site)" "-" "-" "link-integrity" "$(node "$R/link-integrity.mjs" "$BASE" --max=200 2>&1 | verdict)"
row "(site)" "-" "-" "footer-parity"  "$(node "$R/footer-parity.mjs"  "$BASE/" 2>&1 | verdict)"
row "(site)" "-" "-" "naming-voice"   "$(node "$R/naming-voice.mjs"   "$BASE/" 2>&1 | verdict)"
row "(site)" "-" "-" "content-depth"  "$(node "$R/content-depth.mjs"  "$BASE" 2>&1 | verdict)"
row "(site)" "-" "-" "image-seo"      "$(node "$R/image-seo.mjs"      "$BASE" 2>&1 | verdict)"
row "(site)" "-" "-" "dark-toggle"    "$(node "$R/dark-toggle.mjs"    "$BASE" 2>&1 | verdict)"


echo "DONE $TAG" >> "$OUT"
