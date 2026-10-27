# Checks, backup and recovery

Read ../AGENTS.md. Checks are run from the `tracy-wordpress-theme` skill's `scripts/` against a
**running** site (Playwright: `npm i playwright && npx playwright install chromium` once in a
scratch directory). They observe; they do not change the site. Evidence of the build lives outside
the theme, in the Tracy repository's `tasks/ja-nova-wp7/`: `RUN.md` (every step, its timing and
result, and the skill issues met), `DECISIONS.md`, the gap register `content-gaps.md`,
`parity-accepted.json`, `review.config.json`, `design-contract.json`, `visual.contract.json` and
the spec-pack `spec/`. Screenshots and reports of the build were kept on the build machine, not in
any repository.

## Checks by command

Last results are those of the build stand (29/09/2026, WordPress 7.1.2), before packaging.

| Question | Command |
| --- | --- |
| Does the port carry the source's text, route by route? | `node scripts/http-parity.mjs --source <joomla url> --target <site url> --routes tasks/ja-nova-wp7/spec/page-map.json --pairs tasks/ja-nova-wp7/pairs.json --accept tasks/ja-nova-wp7/parity-accepted.json` — last full count 29/30 routes (30/09, after D-13, before G16 closed); rerun it after a content change |
| Do the phone widths hold (no wrapped header control, no overflow)? | the task's `tools/mobile-intrinsic.mjs` at 320, 360, 375, 390 and 414px on every route — 0 defects |
| Do links, forms and headings work? | `node scripts/review/functional.mjs <url> …` |
| Can the owner change every word, image and link in the admin? | `node scripts/review/editability.mjs <url> --theme <theme dir>` |
| Does the site look like the source, light and dark, 1440 and 390? | `node scripts/visual/visual-qa.mjs …` with `tasks/ja-nova-wp7/visual.contract.json` — **not a pass yet**: see `tasks/ja-nova-wp7/RUN.md` for the open findings |
| Does motion match the source? | `node scripts/visual/motion.mjs …` |
| Does dark mode leak white panels or dark text? | `node scripts/review/leak-scan.mjs <url> white` · `… darktext` |
| Is text readable in dark? | `node scripts/review/contrast-audit.mjs <url> --config tasks/ja-nova-wp7/review.config.json` |
| Does the toggle persist across reload? | `node scripts/review/toggle-test.mjs <url>` |
| What are the computed styles of a selector, light or dark? | `node scripts/review/probe.mjs <url> dark '.jn-header'` |
| Is the theme zip clean, does it install on a blank WordPress? | `node scripts/package.mjs --zip wp-ja-nova.zip --slug wp-ja-nova --wp "<runner>" --site-url <url> --accept-theme-check 'register_taxonomy,Update URI:'` — 4/4 on a blank WordPress 7.1.2 (30/09): installs and activates, front page 200, nothing in the debug log; Theme Check has two REQUIRED lines accepted by name (`register_taxonomy`: the Keywords taxonomy and tags on pages the theme keeps; `Update URI:`), one WARNING (the directory `wp-ja-nova` is not the name-derived slug `ja-nova`); make-pot 242 strings |
| Does a clean restore of the quickstart match the build? | `node scripts/quickstart/verify-parity.mjs …` (run by `scripts/quickstart/cycle.mjs` after the restore) — the release's `VERIFICATION.json` holds its result: routes, counts and computed-style differences between the build and the restored site |
| Is a rerun of the seeder a no-op? | the last seed run of the build: every kind `+0 ~0` (28 pages, 45 posts, 7 categories, 9 authors, 6 menus, 2 parts, 1 form), 33/33 routes answer |
| Are core files intact? | `wp core verify-checksums` |
| Is the documentation complete and its inventory fresh? | `node scripts/generate-docs.mjs --theme <overlay dir> --spec tasks/ja-nova-wp7/spec --out <overlay dir>/docs/generated --check` (files only; no database) |

## Backup

```sh
wp db export backup-$(date +%F).sql          # the words, menus, template-part rows, the contact form, options, global styles
tar -czf uploads-$(date +%F).tar.gz wp-content/uploads
```

Keep backups outside the webroot and outside any distributed archive: a database dump holds user
rows, Contact Form 7's settings and any plugin secret.

## Recovery

- **A wrong edit**: WordPress keeps revisions of posts and of the Site Editor's template parts —
  restore from the editor's revision panel or `wp post list --post_type=revision --post_parent=<id>`.
- **A broken theme update**: `wp theme install <previous wp-ja-nova zip> --force`; the site's rows
  (pages, menus, `header`/`footer` parts, options) are untouched.
- **Theme updates in general**: WordPress offers an update only when
  `wordpress/theme/wp-ja-nova/update.json` (read by `inc/update.php`) is published with a newer
  version. Without it, take a backup, then `wp theme install <newer wp-ja-nova zip> --force`, then
  open `/`, a listing, a post at its `/category-blog/…` address, `/tagged-items` and `/404`.
- **A lost or corrupted site**: restore the quickstart `quickstart/ja-nova/wp7` (docs/install.md) to
  get the site as built, then import your latest `wp db export` over it and restore
  `wp-content/uploads`; `wp search-replace` the address if it moved; `wp rewrite flush`.
- **`/404` or an unknown path shows a bare message**: check `wp option get wp_ja_nova_404_page`
  points at the draft page `page-not-found` and that page still has content.
- **`/smart-search` answers 404, or a menu lost its Search link**: the page `smart-search` must
  exist and stay a draft.
- **A post at `/category-blog/<slug>` or `/project/<category>/<slug>` answers 404**: the listing
  page must be published, its post query must name the post's category, and the post must be filed
  directly in that category.
- **The service pages lost their side menu**: the `wp_navigation` post `services` must exist under
  that slug.
- **A listing lost its layout**: its slug (or its parent's) changed; see docs/content-model.md.
- **`/blog-detail` or `/project/project-detail` answers 404, or the header marks no entry on
  those posts**: restore the two rules of `wp_ja_nova_redirects` (docs/content-model.md).

The quickstart is the site **as built**; anything edited since lives only in your backups.

## Known limits

- The contact form needs Contact Form 7 and an outbound mail route; the build stand's mail was not
  configured, so delivery was not tested.
- The open items listed in docs/content-rules.md. Mail for registration passwords and passkeys on a domain other than the one they were made on are the site owner's to set up.
- No update offer until the theme's update manifest is published (above).
- The source theme's design pages (`fixture`, `artifact`, `landing`, `pricing` templates) and its
  19 `tracy/*` library patterns are not used by this site and were not reviewed on it.
