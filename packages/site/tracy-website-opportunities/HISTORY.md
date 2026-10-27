# Tracy import: tracy-website-opportunities

> **Closed 24/10/2026:** the subtree `vendor/tracy/tracy-website-opportunities` was split into two workspace packages per [ADR 0036](../../../docs/adr/0036-website-opportunities-independent-public-repo.md) — the domain in `packages/wo/website-opportunities` (`website-opportunities`), the client dsh plugin here. The home repo `TracyHQ/tracy-website-opportunities` no longer receives copies; the "not yet carried to the home repo" notes below are history.

## A–Z in one press: the business's trade, the name from the title, a brief sendable over http — 24/10/2026

PR #1640 + #1663 (`feat/wo-agent-demo-a2z`, `fix/wo-a2z-dev-acceptance`). Changed in TCH, NOT yet carried to the home repo:
`domain/trades.mjs` (new: `TRADES`, `tradeOfPlace` from the Google Places type, `tradeOfSchemaType` from the schema.org `@type`),
`domain/discovery-gplaces.mjs` (`searchNamedPlaces({anyKind})` searches every trade, `places.types`, drops results that are localities),
`domain/brief.mjs` + `brief-schema.json` (field `trade`; outside food and drink there is no menu page), `domain/website-crawler.mjs`
(wider `BUSINESS_TYPES`, `GENERAL_TYPES`, the profile carries `businessType`; `nameFromTitle`: a home page without JSON-LD/`og:site_name`
takes the brand part before the separator of `<title>`), `domain/index.mjs` (export), `src/client/client-demo-chat.ts` (does not re-hash
the brief when the page has no `crypto.subtle`), the CMS + template choice form (`src/client/{build-choice.ts,detail.tsx,row-actions.ts,api.ts,strings.ts}`),
tests `domain-trades`, `domain-brief`, `domain-website-crawler`, `build-choice`, `client-demo-send` and `lib/client.js`. Subtree pin unchanged.


## Research again 24/10/2026

Branch `wo/research-again` (PR #1670). Changed in TCH, **not yet carried to the home repo**; version unchanged.
Domain: `domain/social-search.mjs` (`socialQueries`: name + city, the branch phone number excluding hotlines/shared
numbers, core name + `site:`; at most 3 queries per network, `not_found` tries the next query; `searched` per network
`{status confirmed|pending|not_found|failed, queries, reason}`; `nameNear` = drop dish words + one word of ≥ 5 letters off
by one character, `confirmed` only with the branch's phone number or an address with a street name, reason `name_near`; a page
marked temporarily/permanently closed → `pending` with `page_closed`; `searchPlaceOf` carries `seed.sharedPhones`),
`domain/gplaces-details.mjs` (field mask + facts add `formattedAddress`, `nationalPhoneNumber`,
`internationalPhoneNumber`); tests `domain-social-search.test.mjs`, `domain-gplaces-details.test.mjs`.
Client: new file `src/client/research-again.ts` (reads the plan of the two preview doors, USD price, reason/error keys, pages found
by the search row) and `src/client/research-again-dialog.tsx` (`useResearchAgain`, the button + the "N parts need a new
look" line, a `@tracy/ui` Dialog: parts that will run + reason + "≈ $x", parts kept, cap, who pays); changed
`api.ts` (`researchAgainPreview`, `researchAgain`, `startResearchAgain`, `publicAgainPreview`, `publicResearchAgain`),
`source-retry.ts` (`useCardResearchAgain`), `demo-progress.tsx` (`Steps` takes `again`), `inspector.tsx` (`Sources`:
`facebook-search`/`instagram-search` rows with Added / Needs a check / Not used pages and short evidence, the customer does not
confirm; `Inspector` takes `researchAgain`), `detail.tsx`, `list.tsx`, `public-research.ts` (`readAgainStart`,
`researchAgain`), `public-research-cell.tsx` (Research again on an already-researched row, Tracy pays), `find.tsx`,
`status.ts` (`SourceInput.pages/queries`), `cms-label.ts` (Facebook search / Instagram search labels),
`layout-css.ts`, `strings.ts` (keys `again.*`, `source.facebookSearch|instagramSearch`). New test
`client-research-again.test.mjs`, more cases in `client-sources.test.mjs`, `client-api.test.mjs`. Rebuilt `lib/client.js`.
Translations for 8 languages in `packages/locale`.

## The brief carries no template 24/10/2026

Decided 23/10: the brief is a snapshot of research and carries no CMS or template; the build keeps the choice. `domain/brief.mjs`:
`buildBrief` takes `madeAt` instead of `cms/cmsSource/resolvedAt/template`, drops the two acceptance lines tied to the CMS/design
system; new function `briefForBuild(brief, {cms, cmsSource, resolvedAt, template})` attaches them again for one build;
`validateBrief` checks `cms/template` only when the brief carries them; the markdown prints the three CMS/Template/Design system lines
only for the build's view. `domain/brief-schema.json` follows (`madeAt`). `domain/site-answers.mjs` takes its timestamp
from `madeAt`. Client: the Site briefs card becomes Demos (each demo: CMS, template, time, state, source brief) +
a brief status line (up to date / research changed + Refresh, View brief); the brief page is read-only, without the CMS and
Template lines; Retry on the brief page goes through the demo action (`retryOf`), no longer `api.build`; `api.createRevision` no
longer takes a template. New strings `demos.*`, `brief.current|stale|view|refresh|refreshing|readOnly`; removed the brief's
template-choice keys. Removed the `create-brief` action entirely (no action produced it): the template picker in the list and Inspector,
`useTemplateChoices`/`templateChoices`, the template parameter of `runAction`, the `brief.create` string.
Tests: `domain-brief`, `domain-site-answers`, `client-detail`, `client-row-actions`. Rebuilt
`lib/client.js`; version unchanged. Not yet carried to the home repo; must be carried in the same line of work.

## The Steps card lists every source + Retry one source — 23/10/2026

Branch `feat/wo-sources-card` (cut from `feat/wo-public-find` `88eb712850`). Changed in TCH, **not yet carried to the home repo**:
`src/client/{status.ts,inspector.tsx,inspector-model.ts,opportunity-row.ts,opportunity-cells.tsx,cms-label.ts,api.ts,detail.tsx,list.tsx,layout-css.ts,strings.ts}`
and the new file `src/client/source-retry.ts` (tone `skipped`, `retryable` of a source row, a Retry button on `Sources` on the
Details page and in the Inspector, `only` of `research` takes a source name, `notFound` counted next to `done`, the `Google Places` label), tests
`client-status`, `client-inspector-model`, `client-opportunity-row` and the new file `client-sources.test.mjs`, plus `lib/client.js`.
No change to `domain/`, `package.json` or the version. Translations for 8 languages in `packages/locale`.

## Sourced dishes and prices are demo data; gaps are sample content — 23/10/2026

Branch `feat/wo-menu-soft` (cut from `feat/wo-public-find`). Changed in TCH, NOT yet carried to the home repo:
`domain/brief.mjs` (every sourced dish goes into `menuItems` with `provenance`/`priceConflict`/`currencyAssumed`; a dish's source is
the menu's source, so a menu photo alone also gets a Menu page; `validateBrief` accepts unchecked dishes, a `verified` dish still needs a price from
a page/PDF; the `missing`/`acceptance` wording and the `## Missing (not collected)` heading say sample content is a suggestion for the owner, never replacing or contradicting collected data;
collected reviews keep their text and author verbatim), `domain/brief-schema.json` (describes `menuItems`; `menuSuggestions` only remains for old briefs),
`domain/pinned-copy.mjs` (`menuDishes` takes every sourced dish, checked dishes first, a dish without a price is still a dish),
`domain/agent-prompt.mjs` (one sentence: "collected menu items … verified ones first"), tests `domain-brief`, `domain-pinned-copy`,
`domain-agent-prompt`; `domain/index.mjs` also exports `looksGraphic` (tracy-web uses it to pick text-heavy pictures for the vision menu-reading step). No change to `src/` or `lib/client.js`; subtree pin unchanged.

## The place's logo + a Media row on the profile — 23/10/2026

Branch `feat/wo-logo-media` (built on `feat/wo-menu-photos`). Changed in TCH, not yet carried to the home repo:
`domain/website-crawler.mjs` (`extractPage` returns `logos`: JSON-LD logo, the first header/nav image, images with "logo" in alt/class/id/file name,
apple-touch-icon, og:image, favicon; `crawlWebsite` keeps the home page's list in `result.logos`), `domain/website-browser.mjs` (the same list),
`domain/social-profile.mjs` (social page images carry `role: 'profile' | 'cover'`), `domain/brief.mjs` + `brief-schema.json` + `domain/agent-prompt.mjs`
(the brief and prompt state the chosen logo, its source, the confidence, the remaining candidates, or "not found"), `src/client/{media-row.tsx,detail-model.ts,detail.tsx,api.ts,strings.ts,layout-css.ts}`
(Media row: Brand · Photos and files · Video, three states, a Retry button that reruns only the logo, hidden pictures behind "Show them"), tests `client-media-row`, `client-detail`,
`domain-website-crawler`, `domain-social-profile`, `domain-brief`, `domain-agent-prompt` and `lib/client.js`. Translations for 8 languages in `packages/locale`.

## Provider `photo-vision` in the `menu-items` group — 23/10/2026

`domain/capabilities.mjs`: the `menu-items` group adds the `photo-vision` provider (reads menu photos with the vision model assigned in /ops); the default order stays `['document-text']`; test `domain-capabilities.test.mjs`. Changed in TCH on branch `feat/wo-menu-photos`; carried to the home repo, branch `feat/wo-menu-photos` (cut from `feat/public-find-pick` `5ea709b`), commit `7cef212`, pushed; not yet merged into the home repo's `main`.

## Public Find on the Find component itself (option 3) — 23/10/2026

PR #1636 (`feat/wo-public-find`), version `0.1.9`: `publicMode` in `find.tsx`/`results.tsx`/`find-advanced.tsx`,
`public-find.tsx`, `find-entry.ts` (exports `./find` and `./strings`), `layout-css.ts` (layout CSS split out of the
`__TAILWIND_CSS__` macro of `styles.ts`), `searchPlacesText` takes `maxPages`, test `client-public-mode.test.mjs` and
`lib/client.js`. Home repo branch `feat/public-find-pick` commit `5ea709b` (follows the 5 provider-order groups; `bb20c98` fixes menu heading reading; `c3bce0a` rounds A/B/C: provider order, social profiles via ScrapeCreators, social page search, dishes + prices, public research; before that `a65ea0d`: `e0c580f` + the public-row fix + place suggestions + UUID over http): this pass syncs **all** of `src/`,
`domain/`, `test/`, `lib/`, `scripts/` and `package.json` from TCH (the home branch lacks many develop changes by
others; copying only our part would leave the home branch unbuildable). Not yet merged into the home repo's `main`; subtree pin unchanged.

## Public Find hands the place over through sign-in — 23/10/2026

PR #1636 (`feat/wo-public-find`): `src/client/{public-pick.ts,find.tsx,flow.ts,strings.ts}`, test
`client-public-pick.test.mjs` and `lib/client.js` synced to the home repo, branch `feat/public-find-pick`,
commit `2ba034d` (following `feat/place-name-search`). A partial sync that does not replace the subtree pin; not yet merged into
the home repo's main. The `/find` page, the public search door and translations belong to TCH.

## Original images instead of downsized CDN copies 23/10/2026

`domain/website-crawler.mjs` has `originalImageUrl`: per image host (Wix, WordPress
`/wp-content/uploads/…-WxH.ext`, Shopify `_WxH`/`?width=`), the crawler puts the original image URL first and keeps
the URL it saw in `fallbackUrl` (for several downsized copies of the same original it keeps the widest by the width in the URL,
otherwise the first — `keepFallbackCopy`); other hosts are untouched. The `/cdn/shop/(files|products|t)/` path
is treated as Shopify on every host, because shops serve it on their own domain. `domain/website-browser.mjs` carries `fallbackUrl`
along. Tests in `test/domain-website-crawler.test.mjs`. Domain-only change, no change to the client bundle or
version (the bundle pins `workspace:^`, no pin to fix). Not yet carried to the home repo; must be carried
in the same line of work.

## Multi-source reviews 22/10/2026

The bundle built from the new wo-views and plugin version `0.1.6` synced to the home repo
`feat/place-name-search` at `9431ed6`. The ReviewsCell source, translations and the Tripadvisor
projection belong to TCH; no collector added and no producer code of PR1546 replaced.

## Find uses Research and Action 22/10/2026

The client of the same `feat/wo-place-name-search` line synced to the home repo `feat/place-name-search`
at `1e47e02`, version `0.1.5`: API/Find/Action/results/flow/memory/input/advanced,
tests and the bundle built with TCH's wo-views. This is a partial sync that does not replace the pin of the whole
subtree below. Backend, wo-views and translations belong to TCH; not yet merged into the home repo's main.

- Home: `TracyHQ/tracy-website-opportunities` (private). Tracy owns this code; it is not a fork, so
  versions are plain semver (no `-tracy.N`), bumped on every subtree pull.
- Version: `0.1.9` (home branch `feat/public-find-pick`; home `main` is still `0.1.3`).
- Code/domain/bundle pinned at **`18d04019a7d0df98264e6bc3e0bf9358c53b327d`**, the home repo's `main`;
  pushed fast-forward from `4147da57a35077e81cb2366313fe4ae92ed07bdf` on 20/10/2026,
  TCH split `ec8ff56191` (`feat/wo-facebook-apify`). This note was updated after the split;
  code/domain/bundle match the pin. The client bundle did not change in the social completion part.
- Previous pin: `4147da57a35077e81cb2366313fe4ae92ed07bdf` (`0.1.2`).
  The tree is code Tracy owns; a change in TCH must be carried to the home repo in the same line of work.
- Role: dsh plugin (`@tracy/dsh-website-opportunities`, cordis id `tracy-website-opportunities`),
  pnpm workspace member, loaded by `@tracy/dsh-native-bundle` and copied into the fleet image by
  `packages/fleet/tracy-fleet-operation/dsh/Dockerfile`. tracy-web reads `domain/` by path.
- `lib/client.js` is committed and must match `src/client/` (`scripts/build-client.mjs --check`,
  gate `bundles`). It also bundles `@tracy/core` (switch catalogue included) and `@tracy/ui`, so a
  change to `packages/core/tracy-core/src/ui-switches/catalogue.json` needs a rebuild here too.
- Strings: namespace `tracy-website-opportunities`; `vi` in `packages/locale/tracy-locale-vi/vi/`,
  the other six in `packages/locale/tracy-locales/<lang>/` (not in this repo).
- Rule: change it here or in its home, never both without carrying the change across in the same
  pass.
- PR #1481 (Sync from live) adds the `site-sync-from-live` switch to the catalogue, so `lib/client.js` is
  rebuilt here against it; plugin source and version stay at the pin above. The home repo gets the
  same rebuild with its next subtree split once #1481 reaches develop.

## Testimonial sync 21/10/2026

Four files `domain/{brief,agent-prompt}.mjs` and their tests synced to the home repo,
branch `fix/wo-review-testimonials`, commit `28ef7b5`. This is a follow-up fix on top of the pin above,
not a full subtree pull. Client bundle unchanged.

## Search by name and address 21/10/2026

The `feat/wo-place-name-search` line synced the Find part to the home repo, branch
`feat/place-name-search`, commit `5203902` (following `18d0401`), version `0.1.4`.
Includes `domain/{discovery-gplaces,index}.mjs`, `src/client/{find-input,find-memory,find,place-suggest,strings}`,
the matching tests and `lib/client.js`. This is a partial sync of changes that does not replace the whole subtree
pin above. The home repo has the feature branch pushed; not yet merged into main. Translations and the HTTP door live in TCH.


## Pick a template before building a demo — 22/10/2026

Version `0.1.5`: WO calls the `@tracy/core/template-picker` bridge to open the Gallery/PreviewDialog
of the Design templates plugin. Both single and bulk builds send an explicit choice to the backend;
Retry keeps the original snapshot. Source, tests and bundle carried to the home repo on branch
`feat/demo-template-picker` (following Find's `5203902`); not yet committed/pushed/merged.
Backend, migration, bridge and the Design templates plugin belong to TCH and must ship with this bundle.


## Ask Tracy to build a demo — candidate 22/10/2026

The UI label and a new build request send workflow `agent-demo/1`; Retry sends no workflow override.
Source `src/client/{api,strings}.ts`, the API test and the bundle synced into the home worktree
`wo-demo-picker-plugin-home`, same branch `feat/demo-template-picker`, not yet committed/pushed.
Keeps version 0.1.5 pending picker integration (Find 0.1.4 is included). Backend, site-tools and
translations belong to TCH and must ship with the native bundle; no runtime agent PASS yet.

## Open the demo session — 22/10/2026

The client follows the exact action it just received and opens the workspace/chat only after the session-creation receipt; Retry keeps the same chat. Wired into list/Inspector/Details/Brief/bulk; the automatic switch is cancelled when the user leaves the screen. Source/test/bundle synced to `wo-demo-picker-plugin-home`, branch `feat/demo-template-picker`, not yet committed/pushed. No new translated strings.

## User message before provisioning — 22/10/2026

The `client-send/1` marker uses prepare/claim → new session → the native composer sends the brief from the browser. The backend keeps the native ID so a reload or two tabs do not create a new message. Open demo chat reopens the existing action. Source/test/bundle and the Open demo chat key synced to the home worktree on the same feature branch; translations in TCH. Chrome on kaffepaus proved the catalogue/profile before provisioning and the first baseline PASS; no final content/QA PASS yet.

## TripAdvisor reviews on the customer screen 21/10/2026

Version 0.1.4, home commit `166dcaf` on `feat/tripadvisor-user-details`, following pin `dfa94e6`.
Synced customer UI/test/bundle/package/README; the home repo took back the handoff patches
`api/status/demo-progress/detail/strings` already in TCH so the bundle does not regress. Kept the domain testimonial patch `28ef7b5`
and other changes already in TCH, without pulling the whole history of home main 0.1.3. Details reads
`profile.reviewSources.tripadvisor`, keeps attribution/source link, does not show quota/provider errors.
The 7 non-English translations in TCH were updated and built in the same pass. Not yet merged into home or TCH.

## No social quota on the customer screen

Version 0.1.5, home commit `e20a1f4` on the same branch `feat/tripadvisor-user-details`.
The customer translator drops the daily-limit/reset line of the Social cell and uses neutral wording for
quota/rate-limit on Details. Deferred data, polling and admin diagnostics are unchanged.
The bundle is built with TCH's config and synced byte-for-byte to home; the shared wo-views library is not changed.

## Review photos and contributor profile

Version 0.1.6, home commit `a9c93a2` on the same branch `feat/tripadvisor-user-details`.
The Google normalizer keeps the contributor avatar next to the name/profile link; Details shows the author's avatar and link.
TripAdvisor reviews keep photos tied to the right review ID/link, using saved media or the original photo link when not saved.
Avatars are kept apart from the restaurant gallery. Client/domain tests 32 PASS, TypeScript/build PASS; bundle identical to home.

## Restaurant review sources 21/10/2026

Version 0.1.7, home commit `dc24ac3` on the same branch `feat/tripadvisor-user-details`.
Details shows the actual TripAdvisor listing name/address/link before the quotes, without assuming the review source is the same Google branch.
Root checked 21 client tests, TypeScript/build PASS; source and bundle synced through the home repo.

## Local integration and PR1600 — 22/10/2026

ScrapeCreators from PR1600 was merged together with TripAdvisor, Find and the demo/chat choice flow; plugin version stays `0.1.8`. PR1600's provider/chain domain matches the integrated code. Added an idempotent migration and the PR's regression case. The merged source/domain/client was committed locally in the home repo, branch `local/integration-20261022`, commit `524b586`; not pushed, merged or released. The historical main pin above does not represent this local candidate.

## JA Restaurant WordPress pilot sync 23/10/2026

The files `domain/{contract-copy-pins,index,page-plan,pinned-copy}.mjs`, `domain/slot-roles/wordpress.json`
and the three matching domain tests (#1612) synced to the home repo, branch `sync/wo-ja-restaurant-pilot`,
commit `69ca9fc`, continuing from `fix/wo-review-testimonials`. Not a full subtree pull;
client bundle unchanged.
