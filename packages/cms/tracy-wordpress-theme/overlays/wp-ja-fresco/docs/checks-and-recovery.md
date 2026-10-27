# Checks, backup and recovery

Read ../AGENTS.md. Checks are run from the `tracy-wordpress-theme` skill's `scripts/` against a
**running** site (Playwright: `npm i playwright && npx playwright install chromium` once in a
scratch directory). They observe; they do not change the site. Evidence of the build lives outside
the theme, in the Tracy repository's `tasks/ja-fresco-wp7/`: `STATUS.md` (every step and its
result), `RUN.md` (the run log, tool issues TR-01 to TR-10 and S-07 to S-34), `DECISIONS.md` (D-01 to D-30),
`content-gaps.md`, `parity-accepted.json`, `review.config.json`, `design-contract.json`,
`visual.contract.json` and the spec-pack `spec/`. Screenshots, reports and seed reports of the
build were kept on the build machine, not in any repository.

## State of the build (21/10/2026)

**The theme is built, seeded and measured on the build stand; packaging and the quickstart restore
run after this file was written into the zip, so their results are not stated here.** Recorded in
`STATUS.md`: the five page groups closed, the second integration checkpoint measured 21 pages on four
tiers (light and dark, 1440 and 390) with 0 findings, functional, editability, motion and brand checks
passed or were explained by name. Two tool gaps keep a check from reporting complete: the interaction
check refuses the 404 page (S-17) and the text check reads the search page without its query (S-31).
Open product decisions are in docs/content-rules.md; **nothing here claims the package or the
quickstart passed**.

| Question | Command (from the skill's directory) | Result of the final run |
| --- | --- | --- |
| Text of the port vs the source, route by route | `node scripts/http-parity.mjs --source <joomla url> --target <site url> --routes tasks/ja-fresco-wp7/spec/page-map.json --accept tasks/ja-fresco-wp7/parity-accepted.json` | 20 of 21 routes; the search page reads 7 of 9 runs because the tool drops the target's query (S-31, D-27); read with the query on both sides it is 9 of 9 |
| Visual QA, light and dark, 1440 and 390 | `node scripts/visual/round.mjs --config <round config> --scope full` with `tasks/ja-fresco-wp7/visual.contract.json` | 0 findings on 21 pages and four tiers (10 earlier findings closed); reported incomplete only because the interaction check refuses `/404` (S-17) |
| Functional smoke | `node scripts/review/functional.mjs <site> --routes tasks/ja-fresco-wp7/spec/page-map.json` | 21 of 21 routes pass, one `h1` on each; the profile page answers 303 to the sign-in page as on the source |
| Editability | `node scripts/review/editability.mjs <url> --theme <theme dir>` on every route | 0 BAKED on 20 routes (`/404` has no page content of its own) |
| Motion, source vs site | `node scripts/visual/motion.mjs --source <joomla url> --site <site url> --routes ...` | 10 rows on 4 pages, each explained in `DECISIONS.md` D-26: the source's autoplay (D-05, D-19), `data-aos` attributes no script animates, and heading pairing |
| Brand chrome | `node scripts/review/brand-ready.mjs --theme <theme dir>` | 0 findings |
| Theme zip clean, installs on a blank WordPress | `node scripts/package.mjs --zip wp-ja-fresco-1.0.0.zip --slug wp-ja-fresco --wp "<runner>" --site-url <url>` | run on a blank stand after this zip was built; result in `STATUS.md`, not here |
| Documentation complete and inventory fresh | `node scripts/generate-docs.mjs --theme <theme dir> --spec tasks/ja-fresco-wp7/spec --check` | run after this file was written; result in `STATUS.md` |

The tool gaps and product decisions that keep findings open are named in `parity-accepted.json`
(`registry`: S-numbers for tool gaps, D-numbers for decisions) and docs/content-rules.md.

## Backup

```sh
wp db export backup-$(date +%F).sql          # words, menus, template-part rows, options, global styles, users
tar -czf uploads-$(date +%F).tar.gz wp-content/uploads
```

Keep backups outside the webroot and outside any distributed archive: a database dump holds user
rows (the registration form creates real accounts) and any plugin secret.

## Recovery

- **A wrong edit**: WordPress keeps revisions of posts and of Site Editor template parts; restore
  from the editor's revision panel or `wp post list --post_type=revision --post_parent=<id>`.
- **A broken theme update**: `wp theme install <previous wp-ja-fresco zip> --force`; the site's
  rows (pages, menus, template-part rows, options) are untouched.
- **Theme updates in general**: no update is offered until the update manifest for this theme is
  published (not known from the files). Take a backup, then `wp theme install <newer zip> --force`,
  then open `/`, `/home/home-2`, `/pages/j-content/category-blog`, an article, the search page and
  an unknown path (404).
- **A lost or corrupted site**: restore the quickstart's webroot and database archives
  (docs/install.md), or your own `wp db export` and `wp-content/uploads`; `wp search-replace` the
  address if it moved, `wp rewrite flush`.
- **`/404` or an unknown path shows an empty page**: the template holds no words of its own; check
  `wp option get wp_ja_fresco_404_page` points at the draft page `page-not-found` and that page
  still has content (its text is the 404 copy).
- **`/pages/j-pages/smart-search` answers 404, shows "Nothing here yet." or has no masthead**: the
  page `smart-search` under `/pages/j-pages/` must exist and stay a **draft**; its featured image is
  the masthead picture.
- **`/pages/j-content/blog-detail` answers 404**: the rule in `wp_ja_fresco_redirects` is missing or
  the target post is not published.
- **Redirect rules gone**: `wp option update wp_ja_fresco_redirects --format=json < rules.json`,
  rules as `[{"from": "/old", "to": "/new", "status": 301}]`.
- **The author grid is empty**: no user carries the user meta `author_order` (docs/content-model.md).
- **The Contact page prints `[contact-form-7 …]`**: Contact Form 7 is not active.
- **Forms**: contact, registration and password mails need a working `wp_mail` route on the host.

## Known limits

- No autoplay on carousels (D-05); the home-3 text slider stands still (D-19).
- The source's search index is empty, so the source always answers "No Results Found"; the port
  searches the posts (docs/content-model.md, Search).
- "Hits" in the article info line is not printed: WordPress has no view counter (G8).
- The source theme's design pages (`fixture`, `artifact`, `landing`, `pricing` templates) and its
  inherited `tracy/*` patterns are not used by this site and were not reviewed on it.
