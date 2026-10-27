# Section 5 — packing (full path only)

Read after `SKILL.md`, when you reach section 5 on the full path. The variables (`$SLUG`, `$SITE`, `$WORK`, `$QC`, `$TD`,
`$JAP`, `$PRODUCT`, `$VER`, `$PACK`, `$PACK_SHA`…) are declared in section 3 of `SKILL.md`; `$FW` is set in step 1
below; "section N" below means a section of `SKILL.md`. Done when the pack is frozen (step 9) — then go back to `SKILL.md` section 6.

1. `(umask 077; : > "$WORK/b1-restore.log"); "$TD" restore "$SLUG" j6 > "$WORK/b1-restore.log" 2>&1` → site `"$SITE"`;
   home page 200. `umask 077` wraps only the command that creates the log file, **never** `restore`/`quickstart` (the lock rule at the top of `SKILL.md`).
   The log of every `restore` holds the admin password + token: do not print it, no `cat`; delete it in section 11.
   `node -p 'const s = require(process.argv[1]); s.version + " " + s.framework' "$SITES/$SITE/site.json"`
   → the version must be the released version (section 2), framework `t3`/`t4`. A different version (old version from cache) → stop,
   tell the requester. Never copy the password out of `site.json`. Set
   `FW=$(node -p 'require(process.argv[1]).framework' "$SITES/$SITE/site.json")`.
2. Early inventory for the multi-language test (section 1):
   `node "$QC/make-ddev-copies.mjs" --tch "$TCH_WT" --site "$SITES/$SITE"` →
   `(cd "$SITES/$SITE" && ddev exec php /var/www/html/dump-inventory-ddev.php) > "$WORK/inventory-first.json"`
   → the counting command in [`language-count.md`](language-count.md).
3. `"$TD" check "$SITE" > "$WORK/b1-check.log" 2>&1` and `"$TD" package "$SITE" > "$WORK/b1-package.log" 2>&1`
   before touching anything. Failed items = **the template's pre-existing errors**: record them in the report, **do not fix, carry on**.
   The command itself breaks (does not finish) → stop.
4. Copy the agent docs into the site before packing. Only `AGENTS.md`, `CLAUDE.md`, `docs/` (not
   `README.md`); only for parts whose version on the site **equals** the source version (`grep -o '<version>[^<]*'` on the part's
   xml file on both sides; a version mismatch in the template itself → stop, report):

   | Part | Source in `"$JAP"` | Destination in `"$SITES/$SITE/web"` |
   |---|---|---|
   | template | `products/joomlart/*-templates/$TPL/source/` | `templates/$TPL/` |
   | framework | `products/joomlart/frameworks/$FW/source/plg_system_$FW/` | `plugins/system/$FW/` |
   | ACM block | `products/joomlart/extensions/modules/mod_ja_acm/` | `modules/mod_ja_acm/` |

   Each part that has docs:
   `rsync -a "<source>/AGENTS.md" "<source>/CLAUDE.md" "<source>/docs" "<destination>/"` (drop names that do not exist) →
   `cmp` each file + `diff -r "<source>/docs" "<destination>/docs"` empty. Any other part the checker in step 7 reports as
   missing: copy it the same way.
5. `"$TD" quickstart "$SITE" "$VER" --keep-verify 2>&1 | tee "$WORK/b1-quickstart.log"` →
   `PACK_SRC="$SITES/$SITE/dist/quickstart-$SLUG-joomla-$VER"` (the name carries `joomla`, not `j6`) holds
   webroot, database, `manifest.json`, `tracy_setting.json`, `SHA256SUMS`, `README.md`, `VERIFICATION.json`;
   `node -p 'require(process.argv[1]).ok' "$PACK_SRC/VERIFICATION.json"` → `true`.
   `node "$TCH_WT/scripts/check-pack-modes.mjs" "$PACK_SRC"` → exit 0 (every file 0644/0755, every folder 0755).
   Exit 1 → the site was built under `umask 077`: rebuild the site per step 1 (umask wraps only the log file), then pack again.
6. Failures:
   - A blocked email in the demo data → **stop, ask the requester** (with the address and where it was found:
     `gunzip -c "$PACK_SRC"/*-database-*.sql.gz | grep -n <address>`). Confirmed as a demo address → rerun
     step 5 with `--allow-email <address>`.
   - Parity < 100%, regression > 0, other leaks = **a new error caused by packing** → stop, ask the requester.
7. Check the pack — `cd "$PACK_SRC"`, then:
   - `tracy_setting.json`: `version` = `"$VER"`, `install` has `webroot` + `database`, `label` = the label of the
     released version (`"$WORK/release-now/tracy_setting.json"`).
   - `manifest.json`: `release` = `"$REL"`, `version` = `"$VER"`, `framework` correct.
   - `shasum -a 256 -c SHA256SUMS` → every line OK (no `README.md` line is normal).
   - `tar -tzf *-webroot-*.tar.gz | grep -cE '^(\./)?configuration\.php$'` → `1`.
   - Table prefix: `dbprefix` in the pack's `configuration.php`
     (`tar -xzOf *-webroot-*.tar.gz "$(tar -tzf *-webroot-*.tar.gz | grep -E '^(\./)?configuration\.php$')" | grep dbprefix`)
     matches the prefix of every table in the dump:
     ``gunzip -c *-database-*.sql.gz | grep -aoE '(CREATE TABLE|INSERT INTO) `[^`]+`' | sed -E 's/^[^`]*`([a-z0-9]+_).*/\1/' | sort | uniq -c``.
   - `tar -tvzf *-webroot-*.tar.gz | cut -c1 | sort | uniq -c` → only `-` and `d` (no symlinks).
   - Agent docs: `cd "$JAP" && ruby tools/quickstart_docs.rb check "$PRODUCT" "$PACK_SRC"/*-webroot-*.tar.gz`
     → exit 0. Exit 1 → copy the missing part (step 4), then rerun step 5 (the pack is not frozen yet).
8. A failure in step 7 that is not about agent docs → stop, tell the requester.
9. **Freeze:** `mkdir -p "$PACK" && cp -p "$PACK_SRC"/* "$PACK"/` ·
   `(cd "$PACK" && shasum -a 256 * > "$PACK_SHA")`. From here on **never repack** (packs are not reproducible
   byte for byte) and change nothing in `"$PACK"`; release exactly these files.
