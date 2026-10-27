# Checks, backup and recovery

Read ../AGENTS.md. Checks are run from the `tracy-wordpress-theme` skill's `scripts/` against a
**running** site (Playwright: `npm i playwright && npx playwright install chromium` once in a scratch
directory). They observe; they do not change the site. Evidence of the build lives outside the theme, in
the Tracy repository's `tasks/ja-diner-wp7/`: `STATUS.md` (every phase and its result), `DECISIONS.md`
(decisions D-xx, tool issues S-xx), `content-gaps.md` (G1, G2), `run.jsonl` (the run log), `freeze.json`,
`design-contract.json`, `visual.contract.json`, `review.config.json`, `parity-accepted.json`, the
spec-pack `spec/` and the build tools `tools/` (`port-css.mjs`, `fix-spec.mjs`, `seed.sh`,
`post-seed.sh`, `group-step.sh`, …). Screenshots, reports, seed reports and the per-group verdicts were
kept on the build machine, not in any repository.

## State of the build (21/10/2026)

**The port is built, seeded and merged; it is not closed.** Per `STATUS.md`: stand, theme, ingest, chrome,
pilot, preflight, baseline, the three page groups and their merge are done; the groups closed
`incomplete` (D-43), and the integration checkpoint, packaging and quickstart phases had not run.

| Question | Command (from the skill's directory) | Last result recorded |
| --- | --- | --- |
| Theme builds | `node scripts/build.mjs --check --target wp-ja-diner` | exit 0 |
| Spec-pack valid | `spec-pack --validate` (wrapped by `tasks/ja-diner-wp7/tools/make-spec.sh`) | OK; 27 source routes (6 answer 303) became 26 page-map routes |
| Seed reproduces and a rerun is a no-op | `node scripts/seed.mjs --spec tasks/ja-diner-wp7/spec --patterns-map <theme>/patterns.map.json …` (wrapped by `tools/seed.sh`) | rerun `+0 ~0`; routes 34 of 35 (the one miss is the article address answering 200 where the seeder expects 301, S-13) |
| Design contract (computed styles), pilot | `node scripts/design-contract.mjs pilot …` | 0 findings |
| Admin round-trip (edit, save, reload, undo) | `tasks/ja-diner-wp7/tools/admin-roundtrip.mjs` | passed, reverted to identical bytes |
| Visual QA, pilot pages (`/`, `/other-pages/error-page`), four tiers | `node scripts/visual/visual-qa.mjs …` with `tasks/ja-diner-wp7/visual.contract.json` | pass, 0 open findings |
| Visual QA, page groups | `tools/group-step.sh` | g1 (7 pages): 0 open findings after round 6, parity 7 of 7; g2 (9 pages): 5 clusters left, parity 9 of 9; g3 (8 pages): parity 8 of 8; verdict `incomplete` for all three (D-43) |
| Preflight | `node scripts/visual/preflight.mjs …` | not trusted, partial: layout-boxes failed (S-35), hidden tab panels not reported; four tools trusted (S-34 left the four `/content/*` pages out of its routes) |
| Text of the port vs the source, route by route | `node scripts/http-parity.mjs --source <joomla url> --target <site url> --routes tasks/ja-diner-wp7/spec/page-map.json --map tasks/ja-diner-wp7/spec/redirects.json --accept tasks/ja-diner-wp7/parity-accepted.json` | run per group (parity 24 of 24 pages across g1, g2, g3); not run as one pass |
| Dark mode leaks, contrast, borders, hover, toggle | `node scripts/review/{leak-scan,contrast-audit,border-scan,seam-scan,hover-scan,toggle-test}.mjs <url>` | dark tiers are not measured against the source because it has none (D-03) |
| Theme zip clean, installs on a blank WordPress | `node scripts/package.mjs --zip wp-ja-diner.zip --slug wp-ja-diner --wp "<runner>" --site-url <url>` | not run |
| Clean restore of a quickstart matches the build | `node scripts/quickstart/verify-parity.mjs …` | not run (no quickstart yet) |
| Documentation complete and inventory fresh | `node scripts/generate-docs.mjs --theme <theme dir> --spec tasks/ja-diner-wp7/spec --check` | run when these documents were written |
| Core files intact | `wp core verify-checksums` | not recorded |

Routes checked by hand on the build stand for this document (`curl`, signed out, 21/10/2026): `/`,
`/about-us/`, `/contact-us/`, `/reservation/`, `/offers/`, `/our-blog/`, `/home/home-red/`,
`/j-pages/login/`, `/content/typography/`, `/content/all-categories/`, `/other-pages/smart-search/`,
`/other-pages/smart-search/?q=chef`, `/?s=chef`, an article at `/<slug>/` and the source address of
article 3 all answer 200; `/your-profile`, `/j-pages/user-profile/` and `/submit-an-article` answer 303 to
`/j-pages/login/`; `/joomla-content/typography` answers 301 to `/content/typography/`; an unknown path
(`/nope/`) answers 404.

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
- **A broken theme update**: `wp theme install <previous wp-ja-diner zip> --force`; the site's rows (pages,
  menus, template-part rows, options) are untouched.
- **Theme updates in general**: no update is offered until the manifest `inc/update.php` reads is published
  (not known from the files). Take a backup, `wp theme install <newer zip> --force`, then open `/`,
  `/offers`, `/about-us`, `/our-blog`, an article, `/contact-us`, the search page and an unknown path (404).
- **A lost or corrupted site**: restore your own `wp db export` and `wp-content/uploads` over a fresh
  WordPress with this theme; `wp search-replace` the address if it moved; `wp rewrite flush`. There is no
  WordPress quickstart of this theme to fall back on yet (docs/install.md).
- **`/other-pages/smart-search` answers 404, or the menu lost its Smart Search link**: the page
  `smart-search` under `other-pages` must exist and stay a **draft**.
- **A listing page lost its articles or cards**: its slug changed (`our-blog`, `tagged-items`,
  `fetured-articles`, `all-categories`), or the category `our-blog` was renamed (docs/content-model.md).
- **A Content page answers 404**: it must stay a child of the page `content`; `/joomla-content/*` is
  answered by the rules in `wp_ja_diner_redirects`.
- **A login, registration, reminder or contact page shows no form**: its path changed; the theme swaps the
  form in by path (`j-pages/login`, `j-pages/registration`, `password-reset`,
  `username-reminder-request`, `contact-us`).
- **Redirect rules gone**: `wp option update wp_ja_diner_redirects --format=json < rules.json`, rules as
  `[{"from": "/old", "to": "/new", "status": 301}]`.
- **Forms**: contact, registration and reminder need a working `wp_mail` route; without one the contact
  form answers with its send-error notice.
- **The header shows the site name instead of a logo in dark mode**: expected until `tracy_logo_dark` is
  set (D-34).

## Known limits

- The Subscribe form sends nothing (G1); the sidebar has no hit counter (G2).
- The pattern descriptions in `acm-subscribe-default.php` and the bundled `assets/fonts/OFL.txt` still
  carry text from earlier ports (a decision number that `DECISIONS.md` does not hold; copyright lines of
  fonts this theme does not ship). They do not affect the site; correct them in the next theme change.
- Contact Form 7 is active on the build stand but unused on the rendered pages; whether to remove it is not
  decided in `DECISIONS.md`.
- Several hooks forked from earlier ports are inert here (docs/architecture.md, "Inert hooks").
- The source theme's design pages (`fixture`, `artifact`, `landing`, `pricing` templates) and its inherited
  `tracy/*` patterns are not used by this site and were not reviewed on it.
- `wptexturize` is off site-wide; text typed later stays literal.
