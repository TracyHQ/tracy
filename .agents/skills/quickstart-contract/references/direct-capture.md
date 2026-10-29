# Direct-capture path — take the release's pack

Read after `SKILL.md`, as soon as section 2 chooses the direct-capture path and section 3b is set (`$PACK`, `$PACK_SHA`). The variables
`$REL`, `$REL_WEBROOT`, `$REL_DATABASE` are set in section 2 of `SKILL.md`. Done when the pack is frozen — then
go back to `SKILL.md`: finish section 3b from the tracy-dev paragraph (0.7.2, or 0.7.1 with `check-pack-modes.mjs` on `"$PACK"`; `doctor`, worktree,
`tch` bootstrap, the PR #691 check), read section 4, skip section 5, move on to section 6. The "First site" section below is done later, at section 6 step 4.

Download the release's pack files, check sha, and use that folder as `"$PACK"` for every later step:

```bash
mkdir -p "$PACK"
gh release download "$REL" -R JoomlArt-Products/joomlart-products -D "$PACK" \
  -p "$REL_WEBROOT" -p "$REL_DATABASE" -p manifest.json -p tracy_setting.json -p SHA256SUMS
ls "$PACK"                                                                     # exactly 5 files
cd "$PACK" && shasum -a 256 -c --ignore-missing SHA256SUMS
```

Pass: exactly 5 files; every line `OK`, including the lines for `"$REL_WEBROOT"` and `"$REL_DATABASE"`. Then freeze:
`shasum -a 256 * > "$PACK_SHA"`. From here on change nothing in `"$PACK"`.

## First site

Do this when you reach `SKILL.md` section 6 step 4, right after the `restore` by tag that builds the site `"$SITE"`, **before**
`tch local`:

```bash
node -p 'const s = require(process.argv[1]); s.version + " " + s.framework' "$SITES/$SITE/site.json"
```

→ the version must equal `"$VER"`. A different version (old version from cache) → stop, tell the requester. Then:

```bash
FW=$(node -p 'require(process.argv[1]).framework' "$SITES/$SITE/site.json")   # must be t3 or t4 (section 1)
node "$QC/make-ddev-copies.mjs" --tch "$TCH_WT" --site "$SITES/$SITE"
(cd "$SITES/$SITE" && ddev exec php /var/www/html/dump-inventory-ddev.php) > "$WORK/inventory-first.json"
```

Then run the language-counting command in [`language-count.md`](language-count.md). `FW` other than `t3` /
`t4`, or several languages → stop, tell the requester (section 1). Done → go back to section 6 step 4 (`tch local`).
