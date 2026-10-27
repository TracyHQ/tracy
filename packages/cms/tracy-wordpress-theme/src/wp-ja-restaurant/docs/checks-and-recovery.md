# Checks, backup and recovery

Read ../AGENTS.md. Checks are run from the `tracy-wordpress-theme` skill's `scripts/` against a
**running** site (Playwright: `npm i playwright && npx playwright install chromium` once in a scratch
directory). They observe; they do not change the site. Evidence of the build lives outside the theme, in
the Tracy repository's `tasks/ja-restaurant-wp7/`: `STATUS.md` (every phase and its result),
`DECISIONS.md` (D-01 to D-17, tool issues S-1 to S-20), `content-gaps.md` (G1 to G5), `run.jsonl` (the
run log), `freeze.json`, `design-contract.json`, `visual.contract.json`, `review.config.json`,
`parity-accepted.json` (empty), the spec-pack `spec/` and the build tools `tools/` (`port-css.mjs`,
`fix-spec.mjs`, `seed.sh`, `post-seed.sh`, …). Screenshots, reports and seed reports were kept on the
build machine, not in any repository.

## State of the build (20/10/2026)

**The port is built and seeded; it is not finished.** Phases 0 to 5 and the seed are done, the pilot gate
is in progress, and the packaging, full Visual QA and quickstart phases have not run (`STATUS.md`). No
blocker is recorded.

| Question | Command (from the skill's directory) | Last result |
| --- | --- | --- |
| Seed reproduces and a rerun is a no-op | `node scripts/seed.mjs --spec tasks/ja-restaurant-wp7/spec --patterns-map <theme>/patterns.map.json …` (wrapped by `tasks/ja-restaurant-wp7/tools/seed.sh`) | run 2 `+0 ~0` on every kind; routes 36 of 37 (the one miss is the album route answering 200 where the seeder expects 301, S-13); 69 media items |
| Design contract (computed styles), pilot | `node scripts/design-contract.mjs pilot …` | 8 of 8 cases, 0 findings |
| Admin round-trip (edit, save, reload, undo) | `tasks/ja-restaurant-wp7/tools/admin-roundtrip.mjs` | passed on `/explore/j-pages/category-blog`, reverted to identical bytes |
| Visual QA, pilot | `node scripts/visual/visual-qa.mjs …` with `tasks/ja-restaurant-wp7/visual.contract.json` | round 1: 289 findings in 121 clusters, being fixed |
| Preflight | `node scripts/preflight.mjs …` | not trusted, partial: dark mode and containers certified; Visual QA misread (S-17), skrollr not recognised (S-19), hidden tab panels not reported (S-20), layout limited to six pages |
| Text of the port vs the source, route by route | `node scripts/http-parity.mjs --source <joomla url> --target <site url> --routes tasks/ja-restaurant-wp7/spec/page-map.json --map tasks/ja-restaurant-wp7/spec/redirects.json --accept tasks/ja-restaurant-wp7/parity-accepted.json` | not recorded in `STATUS.md` |
| Dark mode leaks, contrast, borders, hover, toggle | `node scripts/review/{leak-scan,contrast-audit,border-scan,seam-scan,hover-scan,toggle-test}.mjs <url>` | not run as a full pass |
| Submenus reachable by mouse | `node scripts/review/mega-hover.mjs <url>` | not recorded |
| Theme zip clean, installs on a blank WordPress | `node scripts/package.mjs --zip wp-ja-restaurant.zip --slug wp-ja-restaurant --wp "<runner>" --site-url <url>` | not run |
| Clean restore of a quickstart matches the build | `node scripts/quickstart/verify-parity.mjs …` | not run (no quickstart yet) |
| Documentation complete and inventory fresh | `node scripts/generate-docs.mjs --theme <theme dir> --spec tasks/ja-restaurant-wp7/spec --check` | not run when this file was written |
| Core files intact | `wp core verify-checksums` | not recorded |

Routes checked by hand on the build stand for this document (`curl` on the 31 spec paths with a
trailing slash, signed out, 20/10/2026): 28 answer 200 (including `/gallery/18-sample-album-1/`); the two
profile pages answer 303 to `/explore/j-pages/login/`; the synthetic `/404/` answers 404. Without the
trailing slash a page answers 301 to the slashed address first. `/submit-an-article` answers 303 to Login
and `/homepage` 301 to `/`.

## Backup

```sh
wp db export backup-$(date +%F).sql          # words, menus, template-part rows, options, global styles, users
tar -czf uploads-$(date +%F).tar.gz wp-content/uploads
```

Keep backups outside the webroot and outside any distributed archive: a database dump holds user rows
(registration is open and creates real accounts) and any plugin secret.

## Recovery

- **A wrong edit**: WordPress keeps revisions of posts and of Site Editor template parts; restore from the
  editor's revision panel or `wp post list --post_type=revision --post_parent=<id>`.
- **A broken theme update**: `wp theme install <previous wp-ja-restaurant zip> --force`; the site's rows
  (pages, menus, template-part rows, options) are untouched.
- **Theme updates in general**: no update is offered until the manifest `inc/update.php` reads is
  published (not known from the files). Take a backup, `wp theme install <newer zip> --force`, then open
  `/`, `/menu`, `/offers`, `/blog`, an article, `/gallery`, `/contact/contact-us`, the search page and an
  unknown path (404).
- **A lost or corrupted site**: restore your own `wp db export` and `wp-content/uploads` over a fresh
  WordPress with this theme; `wp search-replace` the address if it moved; `wp rewrite flush`. There is no
  WordPress quickstart of this theme to fall back on yet (docs/install.md).
- **`/explore/j-pages/smart-search` answers 404, or the menu lost its Smart Search link**: the page
  `smart-search` under `explore/j-pages` must exist and stay a **draft**.
- **A listing page lost its articles or cards**: its slug changed (`blog`, `gallery`, `tagged-items`,
  `featured-articles`, `all-categories`), or the category `restaurant` was renamed (docs/content-model.md).
- **A login, registration, reminder or contact page shows no form**: its path changed; the theme swaps the
  form in by path.
- **Redirect rules gone**: `wp option update wp_ja_restaurant_redirects --format=json < rules.json`, rules as
  `[{"from": "/old", "to": "/new", "status": 301}]`.
- **Forms**: contact, registration and reminder need a working `wp_mail` route; without one the contact
  form answers with its send-error notice.
- **The header shows the site name instead of a logo in dark mode**: expected until `tracy_logo_dark` is
  set (D-08).

## Known limits

- The Subscribe box sends nothing (D-07); no OpenTable widget (D-02); colour pages share the default
  colours (D-09); the home gallery strip opens the album page, not a lightbox (G5).
- Contact Form 7 is active on the build stand but unused on the rendered pages; whether to remove it
  is not decided in `DECISIONS.md`.
- Several hooks forked from the JA Morgan port are inert here (docs/architecture.md, "Inert hooks").
- The source theme's design pages (`fixture`, `artifact`, `landing`, `pricing` templates) and its
  inherited `tracy/*` patterns are not used by this site and were not reviewed on it.
- `wptexturize` is off site-wide; text typed later stays literal.
