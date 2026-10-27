#!/usr/bin/env bash
# scaffold-template.sh — clone t4_bs5_blank → ja_<name> with full rename
#
# Usage:
#   scaffold-template.sh --src <blank-dir> --dest <templates-dir> \
#                        --name <machine_name> --title "<Title>" \
#                        [--preview <path>] [--thumbnail <path>]
#
# Portability: uses perl -pi -e for in-place edits (macOS + GNU compatible).

set -euo pipefail

# ---------------------------------------------------------------------------
# Arg parsing
# ---------------------------------------------------------------------------
SRC=""
DEST=""
NAME=""
TITLE=""
PREVIEW=""
THUMBNAIL=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --src)       SRC="$2";      shift 2 ;;
        --dest)      DEST="$2";     shift 2 ;;
        --name)      NAME="$2";     shift 2 ;;
        --title)     TITLE="$2";    shift 2 ;;
        --preview)   PREVIEW="$2";  shift 2 ;;
        --thumbnail) THUMBNAIL="$2"; shift 2 ;;
        *) echo "ERROR: unknown argument: $1" >&2; exit 1 ;;
    esac
done

# ---------------------------------------------------------------------------
# Validate required args
# ---------------------------------------------------------------------------
missing=()
[[ -z "$SRC"   ]] && missing+=("--src")
[[ -z "$DEST"  ]] && missing+=("--dest")
[[ -z "$NAME"  ]] && missing+=("--name")
[[ -z "$TITLE" ]] && missing+=("--title")

if [[ ${#missing[@]} -gt 0 ]]; then
    echo "ERROR: missing required argument(s): ${missing[*]}" >&2
    echo "Usage: scaffold-template.sh --src <blank-dir> --dest <templates-dir> --name <machine_name> --title \"<Title>\" [--preview <path>] [--thumbnail <path>]" >&2
    exit 1
fi

# Validate source
if [[ ! -d "$SRC" ]]; then
    echo "ERROR: source directory does not exist: $SRC" >&2
    exit 1
fi

# Validate dest parent
if [[ ! -d "$DEST" ]]; then
    echo "ERROR: destination directory does not exist: $DEST" >&2
    exit 1
fi

TARGET="$DEST/$NAME"

# Refuse to overwrite existing target
if [[ -e "$TARGET" ]]; then
    echo "ERROR: target already exists — refusing to overwrite: $TARGET" >&2
    exit 1
fi

# Validate optional assets if provided
if [[ -n "$PREVIEW" && ! -f "$PREVIEW" ]]; then
    echo "ERROR: --preview file does not exist: $PREVIEW" >&2
    exit 1
fi
if [[ -n "$THUMBNAIL" && ! -f "$THUMBNAIL" ]]; then
    echo "ERROR: --thumbnail file does not exist: $THUMBNAIL" >&2
    exit 1
fi

# ---------------------------------------------------------------------------
# Step 2: Copy the blank template
# ---------------------------------------------------------------------------
echo "copying: $SRC -> $TARGET"
cp -R "$SRC" "$TARGET"

# ---------------------------------------------------------------------------
# Step 3: Rename language files
# Derive old basename by globbing — don't hardcode t4_bs5_blank in case src differs.
# ---------------------------------------------------------------------------
LANG_DIR="$TARGET/language/en-GB"

# Find the old .ini file (not .sys.ini)
OLD_INI_PATH=$(compgen -G "$LANG_DIR/en-GB.tpl_*.ini" | grep -v '\.sys\.ini$' | head -1)
if [[ -z "$OLD_INI_PATH" ]]; then
    echo "ERROR: could not find en-GB.tpl_*.ini in $LANG_DIR" >&2
    exit 1
fi

OLD_INI_BASENAME=$(basename "$OLD_INI_PATH")
# Derive the old template slug: strip "en-GB.tpl_" prefix and ".ini" suffix
OLD_SLUG="${OLD_INI_BASENAME#en-GB.tpl_}"
OLD_SLUG="${OLD_SLUG%.ini}"

OLD_INI="$LANG_DIR/en-GB.tpl_${OLD_SLUG}.ini"
OLD_SYS="$LANG_DIR/en-GB.tpl_${OLD_SLUG}.sys.ini"
NEW_INI="$LANG_DIR/en-GB.tpl_${NAME}.ini"
NEW_SYS="$LANG_DIR/en-GB.tpl_${NAME}.sys.ini"

if [[ ! -f "$OLD_INI" ]]; then
    echo "ERROR: expected language file not found: $OLD_INI" >&2
    exit 1
fi
if [[ ! -f "$OLD_SYS" ]]; then
    echo "ERROR: expected language file not found: $OLD_SYS" >&2
    exit 1
fi

mv "$OLD_INI" "$NEW_INI"
echo "renamed lang: en-GB.tpl_${OLD_SLUG}.ini -> en-GB.tpl_${NAME}.ini"

mv "$OLD_SYS" "$NEW_SYS"
echo "renamed lang: en-GB.tpl_${OLD_SLUG}.sys.ini -> en-GB.tpl_${NAME}.sys.ini"

# ---------------------------------------------------------------------------
# Step 4: Update templateDetails.xml
# ---------------------------------------------------------------------------
XML="$TARGET/templateDetails.xml"

# Replace <name>...old...</name>
perl -pi -e "s|<name>[^<]*</name>|<name>${NAME}</name>|" "$XML"
echo "set <name> = $NAME  in templateDetails.xml"

# Replace language path entries (both .ini and .sys.ini)
perl -pi -e "s|en-GB/en-GB\.tpl_${OLD_SLUG}\.ini|en-GB/en-GB.tpl_${NAME}.ini|g" "$XML"
echo "set language .ini path = en-GB/en-GB.tpl_${NAME}.ini  in templateDetails.xml"

perl -pi -e "s|en-GB/en-GB\.tpl_${OLD_SLUG}\.sys\.ini|en-GB/en-GB.tpl_${NAME}.sys.ini|g" "$XML"
echo "set language .sys.ini path = en-GB/en-GB.tpl_${NAME}.sys.ini  in templateDetails.xml"

# ---------------------------------------------------------------------------
# Step 5: Update .ini — set T4_TPL_DESC_1 to the provided title
# ---------------------------------------------------------------------------
# Escape title for use inside perl replacement (escape / and & which are special in perl RHS)
TITLE_ESC=$(printf '%s' "$TITLE" | perl -pe 's/[\/&]/\\$&/g')

perl -pi -e "s|^(T4_TPL_DESC_1\s*=\s*).*|\${1}\"${TITLE_ESC}\"|" "$NEW_INI"
echo "set T4_TPL_DESC_1 = \"$TITLE\"  in en-GB.tpl_${NAME}.ini"

# ---------------------------------------------------------------------------
# Step 6: Optional preview/thumbnail images
# ---------------------------------------------------------------------------
if [[ -n "$PREVIEW" ]]; then
    cp "$PREVIEW" "$TARGET/template_preview.png"
    echo "copied preview: $PREVIEW -> $TARGET/template_preview.png"
fi

if [[ -n "$THUMBNAIL" ]]; then
    cp "$THUMBNAIL" "$TARGET/template_thumbnail.png"
    echo "copied thumbnail: $THUMBNAIL -> $TARGET/template_thumbnail.png"
fi

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
echo ""
echo "scaffold complete: $TARGET"
echo "  template name : $NAME"
echo "  title         : $TITLE"
echo "  language files: en-GB.tpl_${NAME}.ini / en-GB.tpl_${NAME}.sys.ini"
