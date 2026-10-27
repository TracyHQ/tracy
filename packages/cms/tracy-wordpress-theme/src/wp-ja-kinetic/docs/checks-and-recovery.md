# Checks, backup and recovery

Read ../AGENTS.md. Checks are run from the `tracy-wordpress-theme` skill's `scripts/` against a
**running** site (Playwright: `npm i playwright && npx playwright install chromium` once in a
scratch directory). They observe; they do not change the site. Evidence of the build lives
outside the theme: the Tracy repository's `tasks/ja-kinetic-wp7/` (status, gap register
`content-gaps.md`, `parity-accepted.json`, the review configs, the post-seed step) and the build
directory `quickstart-builds/ja-kinetic-wp7/` (`step2/spec` the spec-pack, `step7/seed` and
`step8/seed` the seed reports, `step8/` parity evidence, `step8b/` review evidence, `step9/` the
theme zip checks).

## Checks by command

Last results are those of the build; the site is dark by default, so a light-axis run passes the
light cookie (`cookie:tracy_theme=light`).

| Question | Command |
| --- | --- |
| Does the port carry the source's text, route by route? | `node scripts/verify.mjs --source <joomla url> --target <site url> --spec <spec> --pairs tasks/ja-kinetic-wp7/pairs.json --accept tasks/ja-kinetic-wp7/parity-accepted.json --config tasks/ja-kinetic-wp7/review-config.json --evidence <dir> --both` — last: parity 30/30 routes, 2 accepted deltas (G10, G11) |
| Can the owner change every word, image and link in the admin? | `node scripts/review/editability.mjs <url> --theme <theme dir>` — last: 30/30 pages, 0 baked-in; the template sentences of G13–G15 are allowed by decision |
| Does the site look like the source, light and dark, 1440 and 390? | `node scripts/visual/visual-qa.mjs --run-root tasks/ja-kinetic-wp7 …` — last: four tiers pass, 0 findings, 0 unclassified, every exception with a decision |
| Does dark mode leak white panels or dark text? | `node scripts/review/leak-scan.mjs <url> white` · `… darktext` |
| Is text readable in dark? | `node scripts/review/contrast-audit.mjs <url> --config tasks/ja-kinetic-wp7/review-config.json` — the Signal page's muted text is below 4.5:1 by design (G16) |
| Can a mouse reach every mega panel and its first link? | `node scripts/review/mega-hover.mjs <url> --items '.tracy-mega'` |
| What are the computed styles of a selector, light or dark? | `node scripts/review/probe.mjs <url> dark '.tracy-header'` |
| Is the theme zip clean, does it install on a blank WordPress? | `node scripts/package.mjs --zip wp-ja-kinetic.zip --slug wp-ja-kinetic --wp "<runner>" --site-url <url> --accept-theme-check 'register_block_type,Update URI'` — last: see `step9/package-report.json` |
| Did the seed reach every route? | `step8/seed/report-s17.json`: 31/31 routes as expected, every kind `+0 ~0` on rerun |
| Are core files intact? | `wp core verify-checksums` |
| Is the documentation complete and its inventory fresh? | `node scripts/generate-docs.mjs --theme packages/cms/tracy-wordpress-theme/overlays/wp-ja-kinetic --spec …/step2/spec --seed-report …/step8/seed/report-s17.json --check` (files only; no database) |

Theme Check, by decision: two REQUIRED lines are accepted by name — `register_block_type()` (the
theme's 29 blocks draw source views) and `Update URI:` (the theme ships outside wordpress.org) —
and two warnings are kept on purpose: the toolbar hidden for accounts that cannot edit (G27), and
"wrong directory" (the folder is `wp-ja-kinetic` while the Theme Name reads "JA Kinetic").

## Backup

```sh
wp db export backup-$(date +%F).sql          # the words, menus, template-part rows, post meta, options, AcyMailing lists
tar -czf uploads-$(date +%F).tar.gz wp-content/uploads
```

Keep backups outside the webroot and outside any distributed archive: a database dump holds user
rows, newsletter subscribers and any plugin secret.

## Recovery

- **A wrong edit**: WordPress keeps revisions of posts and of the Site Editor's template parts —
  restore from the editor's revision panel or `wp post list --post_type=revision --post_parent=<id>`.
- **A broken theme update**: `wp theme install <previous wp-ja-kinetic zip> --force`; the site's
  rows (pages, post meta, menus, `header`/`footer` parts, options) are untouched.
- **A lost or corrupted site**: restore the quickstart `quickstart/ja-kinetic/wp7`
  (docs/install.md) to get the site as built, then import your latest `wp db export` over it and
  restore `wp-content/uploads`; `wp search-replace` the address if it moved; `wp rewrite flush`.
- **A page lost its look or its list**: check its meta (`wp post meta list <id>`) against
  docs/content-model.md — `wp_ja_kinetic_style`, `wp_ja_kinetic_theme_default`,
  `wp_ja_kinetic_page_template`, `wp_ja_kinetic_list`.
- **Redirect rules gone**: `wp option update wp_ja_kinetic_redirects --format=json < rules.json`
  with the two rules in docs/content-rules.md.

The quickstart is the site **as built**; anything edited since lives only in your backups.

## Known limits

- The newsletter form needs AcyMailing and an outbound mail route; the contact form mails
  option `tracy_contact_to`, else the public mailbox in `tracy_site_identity`, and stores nothing.
  A site that has neither says every message failed: set one (`docs/content-model.md`).
- Read counts and bylines are frozen at port time (post meta); WordPress does not count views.
- The theme's self-update finds nothing until a manifest is published at
  `wordpress/theme/wp-ja-kinetic/update.json` in `TracyHQ/claude-cowork`.
- The source theme's design pages (`fixture`, `artifact` templates) and its 17 `tracy/*` library
  patterns are not used by this site and were not reviewed on it.
