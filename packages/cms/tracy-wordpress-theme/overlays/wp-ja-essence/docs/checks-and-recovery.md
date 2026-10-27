# Checks, backup and recovery

Read ../AGENTS.md. Checks are run from the `tracy-wordpress-theme` skill's `scripts/` against a
**running** site (Playwright: `npm i playwright && npx playwright install chromium` once in a
scratch directory). They observe; they do not change the site. Evidence of the build lives outside
the theme, in the Tracy repository's `tasks/ja-essence-wp7/`: `STATUS.md` (the last state and next
steps), `DECISIONS.md` (D-01 to D-70 and tool findings S-01 to S-23), `GROUPS.md`, `LENS.md` (a
layout review with its still-open items), `parity-accepted.json`, `severity.json`,
`review.config.json`, `design-contract.json`, `visual.contract.json` and the spec-pack `spec/`.
Screenshots, reports and seed reports of the build were kept on the build machine
(`~/tracy-data/ja-essence/`), not in any repository.

## State of the build

**The theme is built, seeded and measured; it has not been packaged or restored from a quickstart
yet.** Recorded in `STATUS.md` at the last slice: the rebuild chain closed on the current tree
(fresh contract, seed report 18), the seeder's second run was a no-op (`+0 ~0`), http-parity passed
on 29 of 31 routes (the two others are the guest-only profile pages, D-66), the group verdict was
`done` on 30 pages (the Smart Search page cannot be closed by the tool, S-23), and Visual QA
findings were all classified (0 unclassified) with 124 open clusters, each recorded as a tool gap
(S-numbers) or an open product decision (D-numbers) in `DECISIONS.md` and `severity.json`. A
layout lens pass listed further differences that are not fixed (`LENS.md`, "STILL OPEN"), so the
result is **not lens-closed**. Packaging on a clean stand, the quickstart cycle and its parity run
are listed as next steps; **nothing here claims they passed**.

| Question | Command (from the skill's directory) | Last recorded result |
| --- | --- | --- |
| Text of the port vs the source, route by route | `node scripts/http-parity.mjs --source <joomla url> --target <site url> --routes tasks/ja-essence-wp7/spec/page-map.json --pairs tasks/ja-essence-wp7/pairs.json --accept tasks/ja-essence-wp7/parity-accepted.json --map tasks/ja-essence-wp7/spec/redirects.json` | 29 of 31 routes; the two others are D-66 |
| Visual QA, light and dark, desktop and 390 | `node scripts/visual/visual-qa.mjs --contract tasks/ja-essence-wp7/visual.contract.json --site <site url> --source-site <joomla url> --spec tasks/ja-essence-wp7/spec --all-stages` | classified, 0 left; open clusters scoped in `severity.json` |
| Group verdict | `node scripts/visual/group-verdict.mjs ... --severity tasks/ja-essence-wp7/severity.json` | `done` on 30 pages |
| Seed rerun is a no-op | the seeder's paired run | `+0 ~0` (`options ~1` is a known seeder report quirk, S-08) |
| Theme zip clean, installs on a blank WordPress | `node scripts/package.mjs --zip wp-ja-essence.zip --slug wp-ja-essence --wp "<runner>" --site-url <url>` | not run yet |
| Documentation complete and inventory fresh | `node scripts/generate-docs.mjs --theme <overlay dir> --spec tasks/ja-essence-wp7/spec --seed-report <seed report> --check` | exit 0 when this file was written |

## Backup

```sh
wp db export backup-$(date +%F).sql          # words, menus, template-part rows, options, global styles, users
tar -czf uploads-$(date +%F).tar.gz wp-content/uploads
```

Keep backups outside the webroot and outside any distributed archive: a database dump holds user
rows (nine imported authors and the administrator) and any plugin secret.

## Recovery

- **A wrong edit**: WordPress keeps revisions of posts and of Site Editor template parts; restore
  from the editor's revision panel or `wp post list --post_type=revision --post_parent=<id>`.
- **A broken theme update**: `wp theme install <previous wp-ja-essence zip> --force`; the site's
  rows (pages, menus, template-part rows, options) are untouched.
- **Theme updates in general**: no update is offered until the update manifest for this theme is
  published (not known from the files). Take a backup, then `wp theme install <newer zip> --force`,
  then open `/`, `/home/home-2`, a category page, a detail page, an article, the search page and an
  unknown path (404).
- **A lost or corrupted site**: restore your own `wp db export` and `wp-content/uploads` (a
  quickstart of this theme, once published, is a baseline, not a rollback target for an edited
  site); `wp search-replace` the address if it moved, then `wp rewrite flush`.
- **Header or footer shows the wrong menu or none**: the `header` and `footer` template-part rows
  hold the navigation `ref` ids (149 and 150 on the build stand). Compare with
  `wp post list --post_type=wp_navigation --fields=ID,post_name`; re-point the ref in the Site
  Editor, or delete the rows to fall back to the files (whose menus then follow WordPress's
  navigation fallback).
- **A category page lists nothing or the wrong posts**: its query is bound to term ids
  (docs/content-model.md); compare `wp term list category --fields=term_id,slug` with the ids in the
  page. Re-select the category in the query block.
- **`/category/...` pages collide with category archives**: `category_base` must be `topic`
  (`wp option update category_base topic && wp rewrite flush`).
- **`/pages/j-pages/smart-search` answers 404, or its menu link vanished**: the page `smart-search`
  must exist and stay a **draft**; the menu link is a custom link with a trailing slash.
- **A retired address stopped redirecting**: check the must-use plugin
  `wp-content/mu-plugins/tracy-redirects.php` exists and that `wp option get tracy_redirects_option`
  returns `wp_ja_essence_redirects`; restore rules with
  `wp option update wp_ja_essence_redirects --format=json < rules.json`, rules as
  `[{"from": "/old", "to": "/new", "status": 301}]`.
- **A listing prints core's pager, author pictures are Gravatar**: the must-use plugins
  `tracy-joomla-pagination` and `tracy-author-avatars` are missing from `wp-content/mu-plugins/`.
- **The 404 text is wrong**: edit `404` in the Site Editor (templates); the draft page
  `page-not-found` is not what the theme prints.
- **Contact page shows `[contact-form-7 ...]` as text**: Contact Form 7 is inactive or the form id
  changed; `wp post list --post_type=wpcf7_contact_form --fields=ID,post_title`, then fix the id in
  the page's shortcode.
- **Footer logo missing**: option `site_logo` is unset (`wp option get site_logo`); in dark mode the footer reads option `tracy_logo_dark` instead and shows the site name as text without it (1.0.9).

## Known limits

- Contact Form 7 needs a working `wp_mail` route to deliver messages; delivery was not tested on the
  build stand. The newsletter card sends nothing (D-10).
- Open product decisions with defaults (docs/content-rules.md): registration and profile forms not
  ported (D-41), one card layout for every category view (D-53), hits not drawn (D-09), article
  footer without "Author's latest articles" (D-67).
- Category listings and the Health count differ from the source's data (D-50, D-14).
- The source theme's design pages (`fixture`, `artifact`, `landing`, `pricing` templates) and its
  inherited `tracy/*` patterns are not used by this site and were not reviewed on it.
