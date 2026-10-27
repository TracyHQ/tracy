# Checks, backup and recovery

Read ../AGENTS.md. Checks are run from the `tracy-wordpress-theme` skill's `scripts/` against a
**running** site (Playwright: `npm i playwright && npx playwright install chromium` once in a
scratch directory). They observe; they do not change the site. Evidence of the build lives outside
the theme, in the Tracy repository's `tasks/ja-vega-wp7/`: `STATUS.md` (every step and its
result), `DECISIONS.md` (D-01 … D-71; D-56 was never issued), the gap register `content-gaps.md`, `parity-accepted.json`,
`review.config.json`, `design-contract.json`, `visual.contract.json` and the spec-pack `spec/`.
Screenshots, reports and seed reports of the build were kept on the build machine, not in any
repository.

## Checks by command

Last results are those of the build (26–29/09/2026, WordPress 7.1.2 build stand), and of the
packaging and clean restore of quickstart 1.1.2 (29/09/2026): the archive carries root-owned
members with modes 0644/0755, and the restore ran as the fleet runs it — extracted by root into a
Linux volume, wp-cli and PHP as `www-data`.

| Question | Command |
| --- | --- |
| Does the port carry the source's text, route by route? | `node scripts/http-parity.mjs --source <joomla url> --target <site url> --routes tasks/ja-vega-wp7/spec/page-map.json --map tasks/ja-vega-wp7/spec/redirects.json --accept tasks/ja-vega-wp7/parity-accepted.json` — last recorded count 31/31 routes; every accepted difference names a decision (D-16) or an open gap number |
| Do links, forms and headings work? | `node scripts/review/functional.mjs <url> …` — 31 pages, 1 finding kept on purpose: `/typography` has two `h1` (its sample content, D-17). The phone menu drawer (below 992px) is checked apart, by real taps at 390px in light and dark: the button opens it, stays on top of the open drawer as a white cross, closes it, and focus returns to the button (Escape and a tap on the dimmed page close it too); each mega item's sub-menu level opens by a tap on its caret with the source's back row and links, and the back button, Escape and a closed-then-reopened drawer behave as the source's |
| Can the owner change every word, image and link in the admin? | `node scripts/review/editability.mjs <url> --theme <theme dir>` — 0 baked-in texts on 31 routes; the template labels ("Continue Reading", "Related Posts", "Other Services", "Smart Search") are theme words below the tool's threshold |
| Does the site look like the source, light and dark, 1440 and 390? | `node scripts/visual/visual-qa.mjs …` with `tasks/ja-vega-wp7/visual.contract.json` — **no real finding on the four tiers** (1440 and 390, light and dark), with the container widths compared at the source's breakpoints (576, 768, 992, 1200, 1400) and the body's text rendering compared on every page. Every finding left is an accepted decision: `/registration-form` keeps WordPress registration off (G68 — decided by the owner on 28/09/2026, so strangers cannot create accounts; D-45), utility pages too short to compare, and the 404 frame (the source's 404 is Joomla's bare error page, D-19). One difference no tool counts is recorded apart: the source prints each article's view count, which WordPress does not keep (D-50) |
| Does motion match the source? | `node scripts/visual/motion.mjs …` — exit 0 on all 31 routes (reveals, three carousels of 3, 6 and 4 slides, two pulsing rings on `/about-us`) |
| Does dark mode leak white panels or dark text? | `node scripts/review/leak-scan.mjs <url> white` · `… darktext` |
| Is text readable in dark? | `node scripts/review/contrast-audit.mjs <url> --config tasks/ja-vega-wp7/review.config.json` |
| Can a mouse reach both mega panels and their links? | `node scripts/review/mega-hover.mjs <url>` |
| Does the toggle persist across reload? | `node scripts/review/toggle-test.mjs <url>` |
| What are the computed styles of a selector, light or dark? | `node scripts/review/probe.mjs <url> dark '.jv-header'` |
| Is the theme zip clean, does it install on a blank WordPress? | `node scripts/package.mjs --zip wp-ja-vega.zip --slug wp-ja-vega --wp "<runner>" --site-url <url>` — run on 1.1.2 (28/09/2026) against a blank WordPress 7.1.2 with debug logging on: 4/4 (zip, install and activate with HTTP 200 and no debug-log entry from the theme — core's own update-check warnings, when the stand cannot reach WordPress.org in time, are listed as `core` and are not the theme's, Theme Check with two REQUIRED notices accepted by name — `register_block_type()` and `Update URI:` — and 0 errors, translation template). Every file in the zip is 0644 and every folder 0755 |
| Does a clean restore of the quickstart match the build? | `node scripts/quickstart/verify-parity.mjs …` — run on quickstart 1.1.2 (28/09/2026), restored as the fleet restores it (a fresh database; the webroot extracted by root into a Linux volume, owner and modes from the archive; wp-cli and the web server's PHP as `www-data`, which may not read a 0600 file): the access check passes, every route answers as on the build, content counts and computed styles match with no mismatch; text and images identical on all 31 routes, functional and editability results identical to the build, and Visual QA of the restored site equals the build's finding for finding |
| Is a rerun of the seeder a no-op? | the last two seed runs of the build: every kind `+0 ~0` (29 pages, 56 posts, 9 authors, 10 categories, 6 menus, 2 parts, 1 form skipped as unchanged), media routes free of collisions |
| Are core files intact? | `wp core verify-checksums` |
| Is the documentation complete and its inventory fresh? | `node scripts/generate-docs.mjs --theme <theme dir> --spec tasks/ja-vega-wp7/spec --check` (files only; no database) |

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
- **A broken theme update**: `wp theme install <previous wp-ja-vega zip> --force`; the site's rows
  (pages, menus, `header`/`footer` parts, options) are untouched.
- **Theme updates in general**: WordPress offers an update only when
  `wordpress/theme/wp-ja-vega/update.json` (read by `inc/update.php`, which answers for the
  stylesheet `wp-ja-vega`) is published with a newer version. Without it, take a backup, then
  `wp theme install <newer wp-ja-vega zip> --force`, then open `/`, a listing, a post at its
  `/category-blog/…` address and `/404`.
- **A lost or corrupted site**: restore the quickstart `quickstart/ja-vega/wp7` (docs/install.md) to
  get the site as built, then import your latest `wp db export` over it and restore
  `wp-content/uploads`; `wp search-replace` the address if it moved; `wp rewrite flush`.
- **`/404` or an unknown path shows a bare message**: check `wp option get wp_ja_vega_404_page`
  points at the draft page `page-not-found` and that page still has content.
- **`/smart-search` answers 404, or a menu lost its Search link**: the page `smart-search` must
  exist and stay a draft.
- **A post at `/category-blog/<slug>` answers 404**: the listing page must be published, its post
  query must name the post's category, and the post must be filed directly in that category.
- **A listing lost its layout**: its slug (or its parent's) changed; see docs/content-model.md.
- **"More Articles …" shows the same titles on every page, or none**: the list's query must keep
  `tracyMore` (`after` = the cards query's `queryId`, `skip` = its posts a page) and sit inside the cards
  query (docs/content-model.md); restore it from the block markup there with the Code editor.
- **A listing pager shows no "Page N of M" box or end cells**: the pager must be the core Pagination block
  inside the post query (the kit's `tracy-joomla-pagination.php` and the filter in `inc/extra.php` read that
  query); on a category blog keep its class `tracy-joomla-pager`; a query of one page prints none.
- **Redirect rules gone**: `wp option update wp_ja_vega_redirects --format=json < rules.json`
  with the rule in docs/content-model.md.

The quickstart is the site **as built**; anything edited since lives only in your backups.

## Known limits

- The contact form needs Contact Form 7 and an outbound mail route; the build stand's mail was not
  configured, so delivery was not tested.
- No newsletter form, no share buttons, closed registration (docs/content-rules.md). Post tags are
  the source's: nine blog posts carry them and the home "Blog & News" cards print them; an article
  page prints no tag row, as on the source.
- Author pictures need the must-use plugin `tracy-author-avatars.php` (WordPress core draws avatars
  from Gravatar only); without it the cards fall back to the default avatar.
- No update offer until the theme's update manifest is published (above).
- The source theme's design pages (`fixture`, `artifact`, `landing`, `pricing` templates) and its 18
  `tracy/*` library patterns are not used by this site and were not reviewed on it.
