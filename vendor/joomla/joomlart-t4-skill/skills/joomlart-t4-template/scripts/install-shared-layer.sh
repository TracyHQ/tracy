#!/usr/bin/env bash
# install-shared-layer.sh — Put this skill's authored layer into a T4 template.
#
# Usage:
#   bash scripts/install-shared-layer.sh --template <template-dir> [--dry-run] [--prune]
#
# WHY THIS SCRIPT EXISTS. `scaffold-template.sh` does `cp -R` of `t4_bs5_blank`, so a fresh template
# starts with the blank's ENTIRE override tree — 39 PHP files nobody has read, rendering under the
# new design's CSS and looking deliberate. The authored replacements live in `assets/shared-layer/`
# (html · php · scss · js · acm), and until now nothing installed them: every build copied them by
# hand, which is how four `mod_articles_category` layouts stayed the blank's while the layout the
# modules actually selected had no override at all (gotchas #155).
#
# WHAT IT DOES. Copies each of the five trees over the template, file by file, and SAYS what it did
# — new, replaced, or identical. It never deletes on its own: `--prune` is opt-in and removes only
# override files that are byte-identical to the blank's and have no authored replacement, which is
# the one case where deletion is the correct answer (an unread copy is a design decision nobody
# made). Run `override-authorship` afterwards to confirm; this script installs, that one judges.
#
# It is idempotent: running it twice reports every file as identical and changes nothing.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LAYER="$HERE/assets/shared-layer"

TPL=""
BLANK=""
DRY=false
PRUNE=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --template) TPL="${2:-}"; shift 2 ;;
        --blank)    BLANK="${2:-}"; shift 2 ;;
        --dry-run)  DRY=true; shift ;;
        --prune)    PRUNE=true; shift ;;
        -h|--help)  sed -n '2,24p' "${BASH_SOURCE[0]}"; exit 0 ;;
        *) echo "ERROR: unknown argument: $1" >&2; exit 2 ;;
    esac
done

if [[ -z "$TPL" ]]; then
    echo "ERROR: --template is required" >&2
    exit 2
fi
if [[ ! -d "$TPL" || ! -f "$TPL/templateDetails.xml" ]]; then
    echo "ERROR: not a template directory (no templateDetails.xml): $TPL" >&2
    exit 2
fi
if [[ ! -d "$LAYER" ]]; then
    echo "ERROR: shared layer not found at $LAYER" >&2
    exit 2
fi

# The blank is only needed for --prune, and it is guessed from the template's own neighbourhood so
# the common case takes no flag.
[[ -z "$BLANK" ]] && BLANK="$(dirname "$TPL")/t4_bs5_blank"

# Every file in the layer carries a `@package <template>` docblock, and the layer was authored
# inside a template with some other name. Copied verbatim, it stamps the WRONG package name into
# dozens of files — the kind of wrong that no gate reads and every future reader believes. The name
# comes from `templateDetails.xml`, which is where Joomla itself reads it.
PKG="$(sed -n 's:.*<name>\(.*\)</name>.*:\1:p' "$TPL/templateDetails.xml" | head -1)"
[[ -z "$PKG" ]] && PKG="$(basename "$TPL")"

# Measured on this build: ONE template carried three spellings — `TRACY_APPLE` in the entry points,
# `Tracy` in 55 overrides, `tracy` in two. All three are drift from templates the files were copied
# between, and none of them is readable as authority. `templateDetails.xml` is the name Joomla
# itself installs under, so it is the one that gets to be right. The spacing of the original line is
# preserved, because these docblocks are column-aligned by hand.
stamp() { sed -E "s:(@package[[:space:]]+)[A-Za-z0-9_.]+:\1$PKG:" "$1"; }

new=0; replaced=0; same=0; pruned=0

install_tree() {
    local sub="$1" src="$LAYER/$1" dst="$TPL/$1"
    [[ -d "$src" ]] || return 0

    # `find -print0` + read: a path with a space is a path, not two paths.
    while IFS= read -r -d '' f; do
        local rel target state
        rel="${f#$src/}"
        target="$dst/$rel"
        if [[ ! -f "$target" ]]; then
            state="new";      new=$((new + 1))
        elif stamp "$f" | cmp -s - "$target"; then
            state="identical"; same=$((same + 1))
        else
            state="replaced"; replaced=$((replaced + 1))
        fi

        [[ "$state" == "identical" ]] || printf '  %-10s %s/%s\n' "$state" "$sub" "$rel"

        if [[ "$DRY" == false && "$state" != "identical" ]]; then
            mkdir -p "$(dirname "$target")"
            stamp "$f" > "$target"
        fi
    done < <(find "$src" -type f -print0)
}

echo "# install-shared-layer → $TPL"
echo "  @package stamped as: $PKG"
$DRY && echo "  (dry run — nothing is written)"

for tree in html scss js acm; do
    install_tree "$tree"
done

# `php/` holds the template's ENTRY POINTS — `component.php` and friends — which Joomla reads from
# the template root, not from a subdirectory. Installing it as a tree would create a `php/` folder
# nothing ever loads, and the entry point would silently stay the blank's.
install_tree_flat() {
    local src="$LAYER/php"
    [[ -d "$src" ]] || return 0
    while IFS= read -r -d '' f; do
        local rel target state
        rel="${f#$src/}"
        target="$TPL/$rel"
        if [[ ! -f "$target" ]]; then
            state="new";      new=$((new + 1))
        elif stamp "$f" | cmp -s - "$target"; then
            state="identical"; same=$((same + 1))
        else
            state="replaced"; replaced=$((replaced + 1))
        fi
        [[ "$state" == "identical" ]] || printf '  %-10s %s  (template root)\n' "$state" "$rel"
        if [[ "$DRY" == false && "$state" != "identical" ]]; then
            stamp "$f" > "$target"
        fi
    done < <(find "$src" -type f -print0)
}
install_tree_flat

# ── prune: the blank's leftovers this layer does not replace ─────────────────────────────────────
# Only files that are BYTE-IDENTICAL to the blank qualify. A file that differs has been edited by
# someone, and deleting an edit is never this script's call.
if [[ "$PRUNE" == true ]]; then
    if [[ ! -d "$BLANK/html" ]]; then
        echo "  prune SKIPPED — no blank to compare against at $BLANK" >&2
    else
        while IFS= read -r -d '' f; do
            rel="${f#$TPL/html/}"
            [[ -f "$LAYER/html/$rel" ]] && continue          # this layer authored it
            [[ -f "$BLANK/html/$rel" ]] || continue          # not the blank's to begin with
            cmp -s "$f" "$BLANK/html/$rel" || continue       # edited by someone — leave it
            printf '  %-10s html/%s\n' "pruned" "$rel"
            pruned=$((pruned + 1))
            $DRY || rm -f "$f"
        done < <(find "$TPL/html" -type f -name '*.php' -print0)
    fi
fi

echo ""
echo "  $new new · $replaced replaced · $same identical · $pruned pruned"
echo ""
echo "Now ask who wrote what is left:"
echo "  node scripts/review/override-authorship.mjs --template=$TPL"
