# Checks, backup and recovery

Read ../AGENTS.md. Checks are run from the `tracy-wordpress-theme` skill's `scripts/` against a
**running** site (Playwright: `npm i playwright && npx playwright install chromium` once in a
scratch directory). They observe; they do not change the site. Evidence of the build lives
outside the theme: the Tracy repository's `tasks/tracy-base-wp7/` (decisions, gaps, accepted
parity deltas, `evidence/`) and the build directory `quickstart-builds/tracy-base-wp7-1.0.0/`
(`seed/report-run*.json`, `evidence/`, `parity/`, `release/`).

## Checks by command

| Question | Command |
| --- | --- |
| Does dark mode leak white panels or dark text? | `node scripts/review/leak-scan.mjs <url> white` · `… darktext` |
| Is text readable in dark? | `node scripts/review/contrast-audit.mjs <url> 3.0` — filter the by-design set (accent buttons, coloured block styles) before acting. The seeded home passed 601 elements after the hero body class was pinned |
| Are borders or seams too bright or doubled in dark? | `node scripts/review/border-scan.mjs <url>` · `node scripts/review/seam-scan.mjs <url>` |
| Do hover states hold in dark? | `node scripts/review/hover-scan.mjs <url>` |
| Can a mouse reach every mega panel and its first link? | `node scripts/review/mega-hover.mjs <url>` — passed three times on the seeded header |
| Does the toggle cycle light → dark → auto and persist across reload? | `node scripts/review/toggle-test.mjs <url>` |
| What are the computed styles of a selector, light or dark? | `node scripts/review/probe.mjs <url> dark '.tracy-header'` |
| Does the port carry the source's text, route by route? | `node scripts/http-parity.mjs --source <joomla url> --target <site url> --routes tasks/tracy-base-wp7/spec/page-map.json --map …/spec/redirects.json --accept tasks/tracy-base-wp7/parity-accepted.json` — 43 source routes, 12 accepted deltas (G10–G13 and the platform's) |
| Is the theme zip clean, does it install on a blank WordPress? | `node scripts/package.mjs --zip dist/tracy-base.zip --slug tracy-base --wp "<runner>" --site-url <url>` — last: 111 entries clean, Theme Check 0 errors, 332 strings extracted |
| Does a clean restore of the quickstart match the build? | `node scripts/quickstart/verify-parity.mjs …` — routes, counts, computed styles on four axes (light/dark × 1440/390); `release/VERIFICATION.json` holds the result of the last run |
| Did the seed reach every route? | `seed/report-run2.json`: 49/49 routes as expected (43 pages, 8 redirects, 2 404s) |
| Are core files intact? | `wp core verify-checksums` |
| Is the documentation complete and its inventory fresh? | `node scripts/generate-docs.mjs --theme packages/cms/tracy-wordpress-theme/overlays/tracy-base --spec tasks/tracy-base-wp7/spec --seed-report …/seed/report-run2.json --check` (files only; no database) |

## Backup

```sh
wp db export backup-$(date +%F).sql          # the words, menus, template-part rows, options, global styles
tar -czf uploads-$(date +%F).tar.gz wp-content/uploads
```

Keep backups outside the webroot and outside any distributed archive: a database dump holds user
rows, Contact Form 7 settings and any plugin secret.

## Recovery

- **A wrong edit**: WordPress keeps revisions of posts and of the Site Editor's template parts —
  restore from the editor's revision panel or `wp post list --post_type=revision --post_parent=<id>`.
- **A broken theme update**: `wp theme install <previous tracy-base zip> --force`; the site's
  rows (pages, menus, `header`/`footer` parts, options) are untouched.
- **A lost or corrupted site**: restore the quickstart `tracy-base/wp7` (docs/install.md: untar,
  `{{DB_*}}`, SQL import, `wp search-replace`, checksums, admin password, `wp rewrite flush`) to
  get the site as built, then import your latest `wp db export` over it and restore
  `wp-content/uploads`; `wp search-replace` the address if it moved; `wp rewrite flush`.
- **Redirect rules gone**: `wp option update tracy_base_redirects --format=json < rules.json`
  with the eight rules listed in docs/content-rules.md (five retired components, three renamed
  magazine routes).

The quickstart is the site **as built** at 1.0.0; anything edited since lives only in your
backups.

## Known limits

- The quickstart's `manifest.json` counts (`page`, `wp_navigation` …) describe the stand at pack
  time; verify against `wp post list` after a restore rather than against the manifest.
- `contact.phone` / `contact.address` written by the quickstart contract land in options the
  theme does not render yet (docs/content-rules.md).
- The design pages of the source theme (`fixture`, `artifact` templates) are not used by this
  site and were not reviewed on it.
