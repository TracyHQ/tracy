# Checks, backup and recovery

Read ../AGENTS.md. Checks are run from the `tracy-wordpress-theme` skill's `scripts/` against a
**running** site (Playwright: `npm i playwright && npx playwright install chromium` once in a
scratch directory). They observe; they do not change the site. Evidence of the build lives outside
the theme, in the Tracy repository's `tasks/ja-morgan-wp7/`: `STATUS.md` (every step and its
result), `RUN.md` (the run log and skill issues S-1 to S-55), `DECISIONS.md` (D-01 to D-46),
`content-gaps.md` (G1 to G10), `parity-accepted.json`, `review.config.json`,
`design-contract.json`, `visual.contract.json` and the spec-pack `spec/`. Screenshots, reports and
seed reports of the build were kept on the build machine (`~/tracy-data/ja-morgan/`), not in any
repository.

## State of the build (01/10/2026)

**The port is built, packaged and restored, and it is not a layout pass.** Every phase ran: pilot,
the other layouts, packaging, the quickstart cycle (prune, pack, clean restore as the fleet user,
parity). The four-tier Visual QA checkpoint (light and dark, 1440 and 390 px, 26 pages) ends with 0
findings that no recorded decision covers; the findings it does cover are named tool gaps and open
product decisions, each scoped to the measured page, element and value in `review.config.json`
(`DECISIONS.md` D-30, D-31, D-43). A layout lens pass found more differences that are listed, not
fixed (`DECISIONS.md` D-34 to D-42, `lens-layout-cp1.md`), so the tiers are **not lens-closed**.
The archive hashes and counts of the final run are in `tasks/ja-morgan-wp7/release/VERIFICATION.json`
and `manifest.json`, not repeated here (this file ships inside the theme zip).

| Question | Command (from the skill's directory) | Result of the final run |
| --- | --- | --- |
| Text of the port vs the source, route by route | `node scripts/http-parity.mjs --source <joomla url> --target <site url> --routes tasks/ja-morgan-wp7/spec/page-map.json --map tasks/ja-morgan-wp7/spec/redirects.json --accept tasks/ja-morgan-wp7/parity-accepted.json` | every route matches; the three guest-only routes answer 303 on both sides (tool reads 303 as a failure: S-40) |
| Design contract (computed styles) | `node scripts/design-contract.mjs pilot ...` | pilot: 8 of 8 cases, 0 findings |
| Visual QA, light and dark, 1440 and 390 | `node scripts/visual/visual-qa.mjs ...` with `tasks/ja-morgan-wp7/visual.contract.json` | four tiers complete; findings accepted only by the scoped exceptions above |
| Functional smoke | `node scripts/review/functional.mjs <site> --routes tasks/ja-morgan-wp7/spec/page-map.json` | links, alt, labels, language and search pass; named exceptions: the collapsed core search button (S-53), the guest redirects read as 200 (S-54), two `h1` on `/joomlart-content/typography` (D-44) |
| Editability | `node scripts/review/scan.mjs <site> --routes ... --tools editability --theme <theme dir>` | 0 BAKED on 26 routes; text read from parts (header, footer, search) is listed as `part`, editable in the Site Editor |
| Motion, source vs site | `node scripts/visual/motion.mjs --source <joomla url> --site <site url> --routes ...` | 8 carousel rows on 4 pages (dots or navigation drawn by the site's motion library, heading pairing): open decision D-45 |
| Admin round-trip (edit, save, reload, undo) | script recorded in `RUN.md` | passed on the pilot pages |
| Seed rerun is a no-op | the seeder's paired run | `+0 ~0` |
| Theme zip clean, installs on a blank WordPress | `node scripts/package.mjs --zip wp-ja-morgan.zip --slug wp-ja-morgan --wp "<runner>" --site-url <url>` | 4 of 4 on a clean stand |
| Documentation complete and inventory fresh | `node scripts/generate-docs.mjs --theme <theme dir> --spec tasks/ja-morgan-wp7/spec --check` | exit 0 |

The tool gaps and product decisions that keep findings open are named in `parity-accepted.json`
(`registry`: S-numbers for tool gaps, D-numbers for open decisions with their default) and docs/content-rules.md.

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
- **A broken theme update**: `wp theme install <previous wp-ja-morgan zip> --force`; the site's
  rows (pages, menus, template-part rows, options) are untouched.
- **Theme updates in general**: no update is offered until the update manifest for this theme is
  published (not known from the files). Take a backup, then `wp theme install <newer zip> --force`,
  then open `/`, `/home/home-style-2`, a listing under `/joomlart-content/`, an article, the search
  page and an unknown path (404).
- **A lost or corrupted site**: restore the quickstart's webroot and database archives (docs/install.md),
  or your own `wp db export` and `wp-content/uploads`; `wp search-replace` the address if it moved,
  `wp rewrite flush`.
- **`/404` or an unknown path shows an empty page**: the template holds no words of its own; check `wp option get wp_ja_morgan_404_page`
  points at the draft page `page-not-found` and that page still has content (its text is the 404 copy).
- **`/other-pages/smart-search` answers 404, or a menu lost its Search link**: the page
  `smart-search` must exist and stay a **draft**.
- **A listing page under `/joomlart-content/` lost its cards**: its slug or parent changed
  (docs/content-model.md), or the pattern `b-*` was not registered.
- **`/joomlart-content/single-article` redirects instead of serving the article**: the rule in
  `wp_ja_morgan_redirects` is missing or the target post is not published.
- **Redirect rules gone**: `wp option update wp_ja_morgan_redirects --format=json < rules.json`,
  rules as `[{"from": "/old", "to": "/new", "status": 301}]`.
- **Forms**: `/contact-us`, registration and username reminder need a working `wp_mail` route;
  failing that the contact form answers with its send-error notice.

## Known limits

- Delivery of every form's mail is measured with a stand-only capture (`tasks/ja-morgan-wp7/tools/stand-mail-capture.php`); a real mail route is the host's.
- No autoplay on carousels (D-15). The carousel runtime pages by position where the source pages by view, so a
  carousel's dot count differs from the source's Owl pages (D-45, measured, listed in the browser record).
- Tag-list cards and category-list pictures are hard-coded from the source
  (docs/content-model.md); hit counts are a snapshot.
- The source theme's design pages (`fixture`, `artifact`, `landing`, `pricing` templates) and its
  inherited `tracy/*` patterns are not used by this site and were not reviewed on it.
- `wptexturize` is off site-wide; text typed later stays literal.
