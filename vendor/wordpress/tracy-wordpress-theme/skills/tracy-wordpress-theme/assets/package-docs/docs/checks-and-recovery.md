# Checks, backup and recovery

DOCS_REQUIRED: Give the exact check commands run against this site with their last result, the
quickstart assets and their restore commands, where the evidence of the build lives, and the
known blockers.

Read ../AGENTS.md. Checks are run from the `tracy-wordpress-theme` skill's `scripts/` against a
**running** site (Playwright, `npx playwright install chromium` once). They observe; they do not
change the site.

## Checks by command

| Question | Command |
| --- | --- |
| Does dark mode leak white panels or dark text? | `node scripts/review/leak-scan.mjs <url> white` · `… darktext` |
| Is text readable in dark? | `node scripts/review/contrast-audit.mjs <url> [minRatio]` — filter the by-design set (accent buttons, coloured block styles) before acting |
| Are borders/seams too bright or doubled in dark? | `node scripts/review/border-scan.mjs <url>` · `node scripts/review/seam-scan.mjs <url>` |
| Do hover states hold in dark? | `node scripts/review/hover-scan.mjs <url>` |
| Can a mouse reach every submenu / mega panel? | `node scripts/review/mega-hover.mjs <url>` |
| Does the toggle persist across reload? | `node scripts/review/toggle-test.mjs <url>` |
| What are the computed styles of a selector? | `node scripts/review/probe.mjs <url> light\|dark '<selector>'` |
| Does the port carry the source's text, route by route? | `node scripts/http-parity.mjs --source <src> --target <site> --routes page-map.json --map redirects.json --accept accepted.json` |
| Is the theme zip clean, does it install on a blank site? | `node scripts/package.mjs --zip <zip> --slug <slug> --wp "<runner>" --site-url <url>` |
| Does a clean restore of the quickstart match the build? | `node scripts/quickstart/verify-parity.mjs …` (routes, counts, computed styles on four axes) |
| Are core files intact? | `wp core verify-checksums` |
| Is the documentation complete and its inventory fresh? | `node scripts/generate-docs.mjs --theme <theme> --check` (files only; no database) |

## Backup

```sh
wp db export backup-$(date +%F).sql          # the words, menus, options, global styles
tar -czf uploads-$(date +%F).tar.gz wp-content/uploads
```

Keep backups outside the webroot and outside any distributed archive; a database dump holds
user rows and plugin secrets.

## Recovery

- **A wrong edit**: WordPress keeps revisions of posts and of Site Editor templates/parts —
  restore from the editor's revision panel or `wp post list --post_type=revision --post_parent=<id>`.
- **A broken theme update**: `wp theme install <previous zip> --force`; the site's rows are untouched.
- **A lost site**: restore the quickstart (docs/install.md) to get the baseline, then import
  the latest `wp db export` over it and restore `wp-content/uploads`; `wp search-replace` the
  address if it moved; `wp rewrite flush`.

The quickstart is the site **as built**; anything edited since lives only in your backups.
