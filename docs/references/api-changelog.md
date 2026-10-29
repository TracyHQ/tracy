---
description: Dated changelog of the public Tracy API (the reference at docs.tracy.ai/api/reference/) — what was added, changed or removed, and when; the api-spec gate holds it to the committed snapshot.
sources:
  - apps/tracy-web/src/api-reference/spec.js
  - apps/tracy-web/src/api-reference/routes/index.js
  - apps/tracy-web/api-reference.snapshot.json
  - scripts/build-api-spec.mjs
  - scripts/check-api-spec.ts
---

# Tracy API changelog

## 2026-10-29: Per-link business research outcomes

Changed (internal): business-link intake keeps every pasted address on `candidate.pastedLinks`. Opportunity detail, research results and Build from my business return `links` with `readStatus`, `readReason`, `primary` and collected `counts: {photos, reviews, contacts}`. `requiresLinkReview` is true when no link was read or the primary input failed; Add site waits for the customer to fix the links or explicitly continue before showing the template suggestion. A valid public link with an unavailable source remains recorded even when it is the only input.

## 2026-10-28: The name the site goes by while the business name is held

Changed (internal, not in the public reference): `GET /api/website-opportunities/:id/place-profile` also answers `siteName` while the latest brief holds the business name off the site and the owner has not shown it since: the neutral identity the site goes by instead (the brief's home page title made without the name). Absent otherwise.

## 2026-10-27: Templates pages served at tracy.ai

Added: `GET /templates/sitemap.xml` and `GET /templates/llms.txt`, the same sitemap and plain text as `/sitemap.xml` and `/llms.txt`, under `/templates/` so they also exist on the public origin. Changed: on the production deployment the Templates pages, sitemap, llms.txt and JSON-LD state `https://tracy.ai` addresses; a direct `GET`/`HEAD` of any `/templates*` address there answers 301 to the same path and query on `https://tracy.ai`, except a request from that host's Cloudflare Worker (`CF-Worker: tracy.ai`), which is served the page. `/robots.txt` names `<public origin>/templates/sitemap.xml`; the old `/design-inspiration` addresses move to `https://tracy.ai/templates/...` in one hop.

## 2026-10-27: May each fact go on the site, and the key messages

Added (internal, not in the public reference): `PUT /api/website-opportunities/:id/facts` with `{factId, onSite: true | false | null}` puts one fact of the place profile on the business's site or leaves it off, whatever the rule decided; `null` lets the rule decide again; kept on the candidate as `factOverrides: {<factId>: {onSite, at}}` for every later revision, Research again included; 400 `INVALID_FACT`, `INVALID_ON_SITE`. `PUT /api/website-opportunities/:id/key-messages` with `{removed, order, labels}` (key message ids, and a label of 1 to 60 characters per id) saves the owner's edits of the key messages, merged into the stored ones (removals stay), as `keyMessagePicks: {removed, order, labels, at}`; 400 `INVALID_KEY_MESSAGES`. Changed: `GET /api/website-opportunities/:id/place-profile` also answers `decisions: [{factId, confidence, onSite, decidedBy, reasons}]`, with `confidence` one of `corroborated`, `single-source`, `inferred` and `decidedBy` `rule` or `owner`.

## 2026-10-27: Files and creation actions in onboarding Help

Added: `POST /api/assistant/attachments` stores a signed-in customer's PNG, JPEG, GIF, WebP, PDF, DOCX, XLSX, TXT or CSV (20 MiB per file) for their Help conversation, returning `{file: {id, name, type, bytes, url}}`. Changed: `POST /api/assistant/turns` accepts up to ten `attachments`, optional creation-action flag `start`, and `requestId` / `retryTurnId` to reuse a stored question on retry; a file-only question may have empty text. `GET /api/assistant/conversation?start=1` includes allowed creation actions, stored file metadata and answer-to-question links. `GET /api/assistant/attachments/:id` also serves customer files, only to the owning account; non-picture files download.

## 2026-10-26: What a business sells, who it is for and its team

Added (internal, not in the public reference): `PUT /api/website-opportunities/:id/reading` with `{item, choice: "remove" | "restore" | "show" | "hide"}` removes an item of the business reading from the site or brings it back, and shows (or hides) a person named only in reviews; 400 `INVALID_ITEM`, `INVALID_CHOICE`. Changed: `GET /api/website-opportunities/:id` answers `profile.trade` (the trade the brief speaks in: `food`, another trade, or `unknown`) and `profile.readingCard` (`{method, reason?, services, audience, team, story}`, each item `{id, label, quote, source, removed}`, a team member also `{role?, reviewsOnly, onSite}`). The brief carries `reading` and, for a business that is not food, a `services` page; its hero section carries `heroCandidates` (up to three `{id, width, height, source}`, never the logo; absent when none qualifies) and their ids as `assetIds`; a listing page's star rating is read into the place profile as a statistic of its own.

## 2026-10-26: Templates as plain text for AI readers

Added: `GET /llms.txt`, the published templates as plain text (a title, one paragraph, one line per template with address, blurb, CMS and industry); no sign-in.

## 2026-10-26: Public Templates pages, sitemap and robots

Added: `GET /templates/`, `GET /templates/{id}/` (a template id, or `wordpress`, `joomla`, `emdash` for a platform filter page) and the slash-less forms `GET /templates`, `GET /templates/{id}` (301 to the slash form), the sign-in-free HTML pages of every published template; `GET /sitemap.xml` and `GET /robots.txt`, which let crawlers find them. Changed: `GET /design-inspiration` and any `/design-inspiration/<path>` that is not a file and not under `/design-inspiration/api/` answer a 301 to `/templates/` (or `/templates/<id>/` for `?open=<id>` or `/design-inspiration/<id>` when that template is published, `utm_*` kept) instead of the page; the `/design-inspiration/api/*` doors and the page's files answer as before.

## 2026-10-26: Every phone a business lists

Changed: in `GET /api/website-opportunities/:id`, `profile.phone` is the main number (Google's, else the one most of the business's own sources state, the numbers written in its bios included) with `profile.phoneSources`, and `profile.otherPhones: [{phone, sources, whatsapp?}]` holds the others; a directory's own social page and a listing site's description are never read for a number. The brief carries `business.otherPhones: [{phone, whatsapp?}]`, listed in the Contact section only.

## 2026-10-26: Google's rating, shown or left off

Added (internal, not in the public reference): `PUT /api/website-opportunities/:id/rating` with `{choice: "show" | "leave"}` sets whether the business's site shows Google's rating; 400 `INVALID_CHOICE`. Changed: `GET /api/website-opportunities/:id` answers `profile.googleRating` (`{state, score, reviews, few, choice, from}`), read from Place Details (which now asks for `rating` and `userRatingCount`) or the search listing; under 5 reviews the brief leaves the rating out and lists it in `missing` as `googleRating` with `withheld: [{source, values}]` until the person shows it.

## 2026-10-26: Open 24 hours every day, from one source, waits for a check

Added (internal, not in the public reference): `PUT /api/website-opportunities/:id/hours` with `{choice: "keep" | "leave" | "edit", hours?}` sets the opening hours the business's site shows; 400 `INVALID_CHOICE`, `INVALID_HOURS`. Changed: `GET /api/website-opportunities/:id` answers `profile.hoursCheck`; when one source alone says open 24 hours every day for a business that is not a hotel, hospital or pharmacy, the brief shows no hours and lists them in `missing` with `withheld: [{source, hours}]` until the person keeps, edits or leaves them off.

## 2026-10-26: The name on a business's site

Added (internal, not in the public reference): `PUT /api/website-opportunities/:id/name` with `{name}` sets the name the business's site carries (the person's pick on the Profile card); 400 `INVALID_NAME`. Changed: in `GET /api/website-opportunities/:id`, `profile.name` is the name on the site (the picked or typed name, else the one two sources other than Google agree on, else today's) and `profile.nameCheck` holds the decision, the names the sources give and who gives each. A name typed with links (`POST /api/website-opportunities`, `name`) is kept on the candidate as `typedName`, beside Google's own name.

## 2026-10-26: Templates grouped by the business's trade

Added (internal, not in the public reference): `GET /api/website-opportunities/demo/template-ranking?ids=<id>,<id>` answers `{ranking}` for the template picker before a demo build: `{trade, recommended, generic}`, the ids of the cards made for the opportunities' one trade and of the cards that suit any business, or null when the trade is unknown, mixed, or an opportunity is not the account's. Changed (internal): `GET /api/sites/from-business/:id` at `choose` also carries `ranking`, the same shape for the business's own trade. The fitness trade now also reads boxing, martial arts, workout, tennis, padel, swimming, personal training and coaching, in a template's words and in a business's own words. A template counts as fitting any business by its description only, no longer by its id or name: on the dev catalogue Tracy Business leaves that group, which changes the template `autoTemplate` suggests for a business with no template of its own trade.

## 2026-10-26: One business from several links

Changed (internal, not in the public reference): `POST /api/website-opportunities` and `POST /api/sites/from-business` take `links` (up to 5 links of one business: a Google Maps or share link, its website, its social pages, its pages on listing sites such as magicpin), an optional `name` and, after a 409, `place`; the old `url` means `links: [url]` and keeps its refusals. The answer carries `links`, one `{url, kind, source?, used, reason?}` a link. A Google link is turned into exactly one Google place or left out as `unresolvable`; when it matches several the answer is 409 `GOOGLE_LINK_AMBIGUOUS` with up to 5 `candidates` to pick from; none usable is 422 `NO_USABLE_LINKS`. A listing page is read once and never crawled, scored as a website or used for its social pages. Saving an opportunity again with new links adds them to it.

## 2026-10-26: Tracy's Cowork package updating itself is a Tracy update

Changed: in `GET /api/sites/:key/activity?version=2`, files changed outside Tracy that are all Tracy's own Cowork package (Joomla component, its system plugins, their media, language files and package manifest; the WordPress `claude-cowork` plugin), one of its manifests among them, read as Source `deployment` by `Tracy deploy`, described `deploy.updated` with `component: 'cowork'` and `tag: null`, instead of `unknown` / `files.changed-source-unknown`. Read at request time, so rows recorded before this change read the same way. A change that also holds any other file stays `unknown`.

## 2026-10-26: Demo requests with frozen place profiles

Added: `GET /v1/demos/options` announces `profile/1`; `POST /v1/demos` accepts v2 alongside v1. Each revision freezes the sender profile with its canonical hash and host-owned fact assessment. V2 photos, including the logo, share the existing guarded fetch and limits. Sender-declared provenance does not approve people, claims, testimonials or review content. The body requires `schema`; v1 requires `business`, v2 requires `profile` and `photos`.

## 2026-10-25: The Welcome popup's one-time mark

Changed: `GET /api/seen-hints` and `POST /api/seen-hints` take one more name, `welcome`, in their closed list (`site-tour`, `voice-tip`, `welcome`): the account has closed the first-run Welcome to Tracy popup. Added (internal, not in the public reference): `GET /welcome/scenes/*`, the popup's animated scenes, for a signed-in account only.

## 2026-10-25: See the research's photos in an agent demo

Added: `media.look` to the `demo.research` action's operations, with an optional `offset`. It answers up to 12 of the frozen research's photos as `photos` (`n`, `id`, `width`, `height`, `unavailable` when its bytes cannot be read) and one JPEG contact sheet of them, numbered as listed, base64 in `sheet`; `nextOffset` names the next page or null. Read-only: nothing is imported or written.

## 2026-10-24: Read the menu again on the public Find

Changed: `GET /find/api/research-again` takes an optional `?parts=` and `POST /find/api/research-again` an optional `parts` beside `placeId` — a list, or a comma-separated string, of research parts that limits Research again to them (Read menu again sends `menu-file,menu-photos`); left out, every part is looked at as before, and a name that is not a research part answers 400 `INVALID_RESEARCH`. A `menu-photos` part in `plan.run` carries `photos`, how many menu photos the run would read.

## 2026-10-24: Sync to live

Added: `GET /api/sites/:key/push`, `POST /api/sites/:key/push/preview`, `POST /api/sites/:key/push` (`{previewId, confirm: {deletes: boolean}}`) and `POST /api/sites/:key/push/:id/undo` — an imported Joomla or WordPress site's Owner previews the content changes Tracy made on the copy, sends them to the live site through its Claude Cowork engine (a change the live site made since the last sync is skipped as a conflict, never overwritten; removals go only when ticked; at most 200 changes in one push, the rest left for the next), and undoes the push where the live site still holds what it wrote. Owners only, in a browser session: the agent and seat keys get 403 `FORBIDDEN_PUSH`. A push and its undo show in Site changes as `site-changes.sync-to-live` and `site-changes.sync-to-live-undo`.

## 2026-10-24: Research a place again on the public Find

Added: `GET /find/api/research-again?placeId=` and `POST /find/api/research-again`, without sign-in. The GET previews what Research again would look at for a researched place: the parts that failed, are more than 30 days old, were never tried or whose rule changed, each with its reason and the most it may cost in cents, and the parts kept; `plan` is null for a place nobody researched, `payer` is `"tracy"`. The POST takes only `{placeId}` and runs those parts, paid by Tracy from the strangers' research budget, at most `publicResearchAgainPerPlacePerDay` times a place a UTC day (default 1, an operator setting) within the existing per-address and per-day limits; it answers `up-to-date`, `queued`/`running` with a receipt for `GET /find/api/research`, or `refused` with `PUBLIC_AGAIN_LIMIT`, `PUBLIC_RESEARCH_LIMIT`, `PUBLIC_RESEARCH_SPENT` or `NOT_RESEARCHED`. `GET /api/ops/wo/demos/summary` carries the new limit in `publicFind`.

## 2026-10-24: Content coverage checks page hygiene

Staff-only doors under `/api/ops`. Added to `params` of step `content-coverage` (codes `coverage-holes`, `coverage-live-holes`, `coverage-ready`): `hygiene` (page problems without an accepted reason), `hygieneByKind`, `hygieneAccepted`, `hygieneShown` (`{ kind, value, token, where, pages, firstPage }`, at most 8). Changed: `coverage-holes` also fires with `holes: 0` when page problems remain (a raw language constant, PHP error text, an unfilled placeholder), and `CONTENT_COVERAGE_NOT_READY` names them; a `content-coverage.json` from audit 1.0.0 (no `hygiene` list) is `coverage-invalid` until measured again.

## 2026-10-24: Content coverage gates Publish

Staff-only doors under `/api/ops`. Added: step `content-coverage` in `road` on each row of `GET /api/ops/quickstarts`, between `contract` and `customize` (ten steps), read from `content-coverage.json` beside the contract that seals the release's version. Codes `coverage-not-needed`, `coverage-waiting`, `coverage-not-measured`, `coverage-stale`, `coverage-invalid`, `coverage-holes`, `coverage-live-holes`, `coverage-ready`; `params` `{ version, slug, platform, contract, live, coverage, pages, holes, byClass, lockedContent, accepted, incomplete, causes, shown, measuredAt, toolVersion, reason }` (the fields each code carries). Changed: `POST /api/ops/quickstart/inspiration/publish` refuses with `CONTENT_COVERAGE_NOT_READY` while a Joomla release not yet published has no measurement, a stale one, or holes without an accepted reason; a published release only warns.

## 2026-10-23: Research places from the public Find

Added: `POST /find/api/research` and `GET /find/api/research`, without sign-in. The POST takes only `{placeIds}` (1 to 10 Google place ids); a place already researched answers `researched` and costs nothing, a place being researched is joined, a new place is queued within the operator's day limits (new places per address and per deployment, and the strangers' research budget), otherwise that place answers `refused` with `PUBLIC_RESEARCH_LIMIT` or `PUBLIC_RESEARCH_SPENT`. The GET reads `researched`/`none` per place id, and a research's progress by the receipt the POST gave. `GET /api/ops/wo/demos/summary` carries the three new limits in `publicFind`.

## 2026-10-23: Search restaurants without signing in

Added: `GET /find` (the Website Opportunities Find view in a public mode), its files under `GET /find/find-assets/*`, `GET /find/api/capabilities`, `POST /find/api/search`, and the place box's `GET /find/api/places/suggest` and `GET /find/api/places/suggest/{placeId}`, all without sign-in. The search takes `{query, radiusM}` or `{lat, lon, radiusM}` with `radiusM` 1000, 3000, 5000 or 10000 and answers `{center, provider, pages, hiddenChains, candidates}` in the signed-in search's row shape (no photos, nothing of any account; published shared research shows as `status: "researched"` with its `research`, website check and social pages), at most 20 Google places from one request. Every limit is an operator setting in `/ops/settings/wo`; defaults: searches 10 a minute and 60 an hour per address, 60 a minute and 500 a day per deployment (at about $35 per 1,000 calls, roughly $17 a day before Google's free tier); suggestions 60 a minute and 300 an hour per address, 60 a minute and 5,000 a day per deployment (about $2.83 per 1,000, roughly $14 a day). A refused call answers 429 with `RATE_LIMITED`, `BUSY`, `DAILY_LIMIT` or `CLOSED`. A signed-in visitor of `/find` is redirected to the signed-in Find. All of it answers only on the main deployment and while the two Website Opportunities switches are on. Google answers (searches, suggestions, picked places) are kept for both the signed-in and the public Find for `placesCacheDays` (default 183 days); a search is asked around the centre of its cache cell (a fifth of the radius, or `placesCacheCellMeters`), and a kept answer costs no Google call.

## 2026-10-23: Remember one-time hints per account

Added: `GET /api/seen-hints` reads the signed-in account's seen hint names (`site-tour`, `voice-tip`), sorted alphabetically; `POST /api/seen-hints` accepts JSON `{hint}` from the same origin, records it once while keeping the first timestamp, and returns the same `{hints: [...]}` shape. Both web and desktop share these account marks. Unknown hints and malformed JSON answer 400 `INVALID_REQUEST`; no session answers 401 `NOT_SIGNED_IN`. Responses are not cached.

## 2026-10-23: Chat token statistics and recorded growth capabilities

Changed: internal `GET /api/ops/usage` adds recorded token totals, request coverage, partial-request counts and nearest-rank median token use (at least 20 measured requests), with matching previous periods, daily or hourly rows, CMS totals and a customer-only non-demo leaderboard. Missing measurements remain null. Every period and filter reads the production tables directly; empty periods return normal empty aggregates.

Changed: desktop activity capability follows the complete current filter scope before pagination. Opening-dependent blocks and columns render only when that scope contains an opening event. Unsupported account/download links are removed because the production download recorder does not write them. The desktop opening recorder remains available.

## 2026-10-22: Rolling 24-hour and all-time growth periods

Changed: internal `GET /api/ops/beta/signals`, `/api/ops/beta/customers`, `/api/ops/beta/stuck`, `/api/ops/app-statistic`, `/api/ops/usage` and `/api/ops/usage/turns` accept `days=24h` and `days=all`. The 24-hour interval is exactly `[readAt - 24 hours, readAt)`, with hourly chart buckets. All time starts at the first recorded event, uses UTC+7 day buckets and has no previous-period comparison. Empty history stays empty. Existing calendar presets and inclusive custom dates keep their semantics. Stuck range metadata selects historical analytics while retaining the lifetime fold required for current open cases.

## 2026-10-22: Usage outcomes and customer value analysis

Changed: internal `GET /api/ops/usage` accepts inclusive UTC+7 custom dates, CMS, customer/staff and demo filters, with equal-elapsed previous-period aggregates, daily series and per-customer metadata. Existing aggregate fields remain. All site/request blocks share the cohort; form openings and their linked creations remain dates-and-audience only because opening records have no CMS/demo classification. Unknown historical classification is disclosed, never assumed non-demo. Closure-based timings, mature undo/follow-up/rework windows, same-incarnation undo attribution, unknown change outcomes, answer-limit endings, customer-only first requests, true two-day returns and missing build durations are corrected. Standalone restores and row undos count even without a new request in that period. Historical aggregate snapshots cannot supply missing raw facts or be silently recalculated.

Changed: the existing audited `GET /api/ops/usage/turns` action accepts the same date/cohort filters and matches the aggregate group definitions, including Site changes undos. The `USAGE_TEXT_READERS` rule and read audit remain; no new write action or customer chat exposure is added.

## 2026-10-22: Growth cohorts and desktop adoption analysis

Changed: internal `GET /api/ops/beta/customers` adds uncapped `growth` aggregates for the filtered first-sign-in cohort: ordered own-site activation, between-step conversion and drop-off, observed-completer timing (median only with at least 20 people), weekly retention with mature denominators, and channel/source/campaign comparisons. Follow-up ends at `readAt`, independently of acquisition dates. Successful changes require request-bound write or committed-file evidence; unknown historical classifications remain disclosed. Existing customer rows retain their cap and semantics.

Corrected: deletion ends the activation lifetime's readiness, request and change windows, while observed progress before deletion remains historical evidence. Customer `edits.done` requires explicit `ok=true`; missing change outcomes appear in additive `edits.editUnknown` rather than completed changes.

Changed: internal `GET /api/ops/app-statistic` adds `analytics.desktopGrowth`: uncapped platform/version shares, a current linked-copy/opened-copy subset, new observed copies by `first_seen`, and daily observed foreground-opening version adoption from immutable opening events. Download requests stay separate because the recorder does not link them to app copies. No historical install success, first account link, or version history is inferred from mutable updater state. Quickstart analysis remains unchanged.

## 22/10/2026 · Desktop foreground activity

Added: `POST /api/desktop/installs/opened` records one small foreground-opening claim per existing app copy and UTC+7 day in `ops_signal`, with optional existing session identity, bounded validation and rate limits. No new table or customer content. Desktop 0.6.1 is the first sender.

Added: App Statistics returns `activeAppUsers` in current, previous and daily summaries, `lastOpened` and `daysUsed` on people rows, sortable activity columns, and `activityAvailable` / `activityMinimumVersion` to distinguish unmeasured data from a true zero. Existing update-check metrics retain their meaning.

## 2026-10-22: Signals historical event outcomes and site lifetimes

Changed: internal `GET /api/ops/beta/customers` counts only explicit successful undos in `edits.undone`, adding `undoFailed` and `undoUnknown` for failed and historical unknown outcomes. Site activity uses historical incarnation and demo classification; missing classification is excluded rather than treated as customer activity. Reused domains retain separate owners, CMS and states. Signals affected-site totals distinguish incarnations. Historical blocked-attempt gaps and unknown undo outcomes cannot be reconstructed. Current-period deltas retain calendar arithmetic with an explicit partial-versus-full-period disclosure and neutral presentation when today is incomplete; Desktop latest-state distributions are labelled as such.

## 2026-10-22: Read-only Desktop App Statistics analysis

Changed: internal `GET /api/ops/app-statistic` accepts inclusive UTC+7 `start/end` dates, table pages of 10 or 25 rows, and sorting by every displayed record field. Responses add same-scope previous-period aggregates, zero-filled UTC+7 daily series and range metadata. Preset periods use UTC+7 calendar days, ending exclusively at the next UTC+7 midnight and marking today as incomplete, matching User Growth Statistics. All-time comparisons are null; available filter values cover all time. Users daily counts each account at its latest matching activity; installs still measure latest contact, never new installations. Install acquisition source is not recorded, so its source filter is ignored. Users rows add nullable `lastAppContact` from matching app update checks and default to sorting by it, with missing app connections last. Template requests do not change this timestamp; background checks do not prove an app open or active use. Explicit `sort=time` retains its existing meaning. Existing list fields and staff access remain.

## 2026-10-22: Remove an unfinished import

Added: `DELETE /api/sites/{key}/import` removes an imported site whose import never reached a build: its seats, its record, what the read left on the host and the stored copies inside the site's own keys, only once the host that ran the read confirms none is running. Owner only. Refusals: 409 `NOT_UNFINISHED_IMPORT`, `IMPORT_RUNNING`, `IMPORT_BUSY`, `IMPORT_REMOVING`; 503 `HOST_UNAVAILABLE` (try again later). While a removal runs, `POST /api/sites` for the same import, `POST /api/sites/{key}/provision` and `POST /api/sites/{key}/agent` answer 409 `IMPORT_REMOVING`. `GET /api/sites` marks an unfinished import with `importPending: true` and `importRecovery`, and `POST /api/sites/{key}/agent` refuses one with 409 `IMPORT_NOT_FINISHED`.

## 2026-10-22: Read-only Signals analysis filters

Changed: internal `GET /api/ops/beta/signals` and `/api/ops/beta/customers` accept inclusive Vietnam `start/end`, comparison and scoped attribution/site filters. Signals adds the previous daily series, deltas, range metadata, failure-event counts separate from unique sites, available filter values and the matching sign-in count before its 50-row cap. Existing response fields remain; customer activity stays lifetime. All six filters scope linked sign-ins, source counts, site metrics and both daily series. Sites use their creator's historical first-sign-in attribution; CMS and latest lifetime status must match one site. Waitlist and Discord remain period-only and the UI labels that limitation. Attribution options cover both periods and retain selected zero-result values. Invalid filters answer 400.

## 2026-10-21: Read-only existing site import preflight

Added: `GET /api/sites/import-address?siteKey=…` checks an address for a signed-in person without claiming it. Returns `ownership` (`available`, `mine` or `other`) and an optional safe `joinPath` for an existing site in another account, never its owner's identity. Invalid input answers 400 `INVALID_REQUEST`; no session answers 401 `NOT_SIGNED_IN`; responses are not cached. `TAKEN` answers from site creation also include `joinPath` when the local site label is known.
## 2026-10-22: Private agent demo research and plan capability

Added: `demo.research` at the Apply door supports the assigned agent-demo/1 chat's private research catalogue, paginated source/media reads, durable editorial plan and frozen media-ID import. A current content seat plus the exact account/site/session assignment is required; seat keys and arbitrary asset URLs are refused. New Website Opportunities single/bulk builds may select `workflow: "agent-demo/1"`; Retry inherits its original workflow and snapshot.

## 2026-10-22: Keep an explicitly selected quickstart release through provisioning

Added: optional `expectedQuickstartRelease` on `POST /api/sites` and `/api/sites/claim`: the release version and archive file/checksum map must match the selected quickstart before a site is claimed or provisioned. Changed release bytes or version return 409 `TEMPLATE_VERSION_CHANGED`. Website Opportunities freezes this identity with the customer's explicit CMS/template choice; a new single or bulk demo build requires that choice and Retry keeps the original snapshot.

## 2026-10-20: Sync an imported site from its live site

Added: `GET /api/sites/{key}/sync` says whether an imported Joomla site can be synced from its live site and reads its newest sync; `POST /api/sites/{key}/sync` starts one (optional `{allowHeld: true}`), answering 202 with the sync row. Owners only (403 `FORBIDDEN_SYNC`); a refused start answers 409 or 502 with a `SYNC_*` code.

## 2026-10-20: Apply writes named by the record's title

Added: `POST /api/sites/{key}/apply` reads the optional `x-tracy-write-title` header (`encodeURIComponent` of the record's title, read by dsh from the same site, kind and id) on a `content.update`, `content.delete`, `content.language`, `media.upload` or `media.delete` write, and keeps it as the write's title in the site changes: one line, at most 200 characters. Only the signed `x-tracy-actor` may send it; a session cookie's or a seat key's is ignored, and a value that does not decode is dropped, never refused. The title is a display label and never decides which record is written or undone.

## 2026-10-19: Voice provider integration with current site previews

Changed: the combined reference preserves the live design system preview doors together with the provider, model discovery and native widget conversation contracts introduced on 18 October. Provider health reports account limits separately from rejected credentials; short probes do not clear limits encountered during real speech.

## 2026-10-18: Verified widget conversations continue in native sessions

Changed: temporary widget dependency failures return HTTP 503 with `WIDGET_UNAVAILABLE` and `retryable: true`. Other unavailable failures return HTTP 500 with `retryable: false`. This marker permits bounded startup reads to retry; it does not permit replaying messages or site operations.

Added: `POST /widget/api/native/open` adopts verified discovery context into an owner-bound native onboarding session without sending prompts or creating a site. Repeated opens reuse the persisted session identity. `GET /widget/api/native/context` and the first-party `GET /api/widget-native/context` expose the imported context only to its verified owner or signed internal actor. `POST /widget/api/native/logout` ends the widget's transient authentication and native seat. Ready imported context follows account retention; anonymous/preparing context still expires after 24 hours. Private credentials are excluded from imported context.

## 2026-10-18: Voice sign-in instructions follow the conversation language

Added: `POST /widget/api/auth/language` accepts only an ISO language or BCP 47 tag and returns fixed localized instructions plus a validated confirmation, digit and email-symbol lexicon. The existing assistant translates public templates only, with bounded cache, coalescing and admission; email addresses, OTPs, cookies, history and private speech are rejected as request fields. Unavailable localization returns 503 without silently falling back to English. Speech recognition and synthesis still depend on the active speech provider.

## 2026-10-18: Read-only current widget build context

Added: `GET /api/sites/{key}/jobs/{id}?inspect=1` returns persisted creation status after session, editable grant, job/site and creator-account checks. It performs SELECTs only and never calls a host or completes a handover. Widget conversations now retain encrypted, visitor/account-bound context for 24 hours; interrupted work requires manual review and is never replayed automatically.

## 2026-10-18: Independent speech providers and coherent voice sessions

Added: admin-only draft test and atomic Apply under `/api/ops/speech/provider`. ElevenLabs and separately installed VoiceStudio retain independent profiles and disabled-by-default cross-provider fallback settings. Secrets stay sealed on the server. Fallback is one hop before audio; Tracy quota, cancellation and agent errors never trigger it, and partial output is never replayed.

Changed: speech facts and WS ready include the primary/actual provider, revision, effective voices, capabilities and provider timeouts. Ready also returns an account-bound opaque sessionToken; sending it with `/api/speech/say` keeps STT/TTS on the same provider across tabs. Changed/expired/ambiguous sessions return409 and must restart. VoiceStudio uses PCM16k input/PCM24k output and disables speculative TTS prewarming; no language count or commercial model rights are implied.

## 2026-10-18: Design system preview on a quickstart's demo, live

Added: `live=1` on `GET /api/design-system/preview` (the Add site form's preview). With it the door runs the same checks, reads nothing, and answers `{live: true, src, mode, modes}`: `src` is the demo's home page at its own address with a `tracy_ds_preview` ticket signed for the demo and system (one hour); framed, the demo's address serves the real page with its scripts running and the bytes an apply would write laid in, so the preview shows what the new site will show once the system is applied (carousels, sticky headers, lazy pictures). `mode` is the side the system opens on, `modes` whether the template offers Light | Dark. Changed: on a site address, a same-site redirect answered to a framed `tracy_ds_preview` ticket keeps the ticket on its `Location`, so the page it leads to (a login page, a language home) wears the system too.

## 2026-10-17: Design system preview of a running site, live

Added: `live=1` on `GET /api/sites/{key}/design-system/preview`. With it the door runs the same checks, reads nothing, and answers `{live: true, src, mode}`: `src` is the site's home page at its own address with a `tracy_ds_preview` ticket signed for this site and system (one hour); framed, the site address serves the real page with its scripts running and the bytes an apply would write laid in, so the preview shows what applying the system shows (carousels, sticky headers, lazy pictures). `mode` is the side the system opens on. Changed: on a site address, `tracy_ds_preview` wears a system only with such a ticket; any other value answers the page as it is.

## 2026-10-17: Fonts of a running site in its design system preview

Added: `GET /api/sites/{key}/design-system/preview-asset?path=<path>`, one stylesheet or font of the running site served through Tracy's origin. `GET /api/sites/{key}/design-system/preview` now points the site's own stylesheets at it, so the preview frame loads the site's icon fonts (before, a site's icons drew as empty squares in the preview, since a site sends no CORS header for its fonts).

## 2026-10-17: Sites of a person who lives on a shard; sign-ups no shard can take

Changed: `POST /api/sites` (an import included) and `POST /api/sites/claim` answer 409 `USE_SHARD` with `redirect` for a signed-in person whose sites live on a shard, and make nothing: the Add site page of that shard while it still takes new accounts, else this server's own `/new/?fresh=1`, which starts them on another shard or answers 503 `NO_SHARD_ACCEPTING` when none takes anybody. A site label (and a Tracy name set with `PUT /api/sites/{key}/address`) that a shard holds or uses is taken here too: 409 `TAKEN` and 409 `NAME_TAKEN`, the answers a taken name already had.

Added: `POST /verify` (and the Google, GitHub and JoomlArt sign-in callbacks) have a new refusal, 503 `NO_SHARD_ACCEPTING` (a page for a form post or a callback, `{code}` for JSON), for a new address while no shard takes new accounts: the code is sent and checked as always, but no session is minted and nothing is kept but the address; signing in again later tries again. `POST /login` is unchanged and never answers this code. An address that already has a place is never refused this way.

## 2026-10-17: Experimental voice website widget

Added: `/widget` and `/widget/embed.js`, plus visitor state, real catalogue discovery, explicit selections, support checks, conversation and verified site creation under `/widget/api`. The operator must enable `website-voice-widget` (off by default). Email OTP stays in the inline sign-in flow; Google uses a fresh, single-use popup handoff. Speech uses the existing relay and TTS service through a strict backend allowlist. Visitor state is held in memory and lost on restart. The widget visitor cookie is host-only and partitioned on HTTPS; sign-out clears the matching scope.

## 2026-10-17: Which opening of the Add site form a site came from

Added: `POST /api/sites` takes an optional `wizardId`, the id the Add site form drew when it opened; Tracy keeps it with the creation to count openings that never reached Create. A malformed one is not refused, only not kept.

## 2026-10-16: Tracy reads its replies out loud

Added: `POST /api/speech/say`. A voice conversation in the chat sends the start of Tracy's reply, or a short line while Tracy works, and the answer streams it spoken: 16-bit mono PCM at the rate in `x-sample-rate`. At most 600 characters a reading, counted per account and per day.

Changed: `GET /api/speech` also returns `voices` (the voices Tracy may read in) and `speak` (`maxChars`, `sampleRate`).

## 2026-10-16: Whether answers can be written

Added: `GET /api/sites/questions` answers `answersWritten`, false when no text model is assigned to write the answers into a new site. A site created then is built with the template's own text.

## 2026-10-16: A backup still being made answers 202

Changed: `POST /api/sites/{key}/backup` answers 202 `{code: "BACKUP_PENDING"}` when the host has not finished the backup within two minutes, where it used to answer 502 `FLEET_JOB_FAILED` with `reason: "timeout"` while the host went on and made it. A press while a backup of the site is still being made answers the same 202 and starts no second backup. The 202 now also includes `jobId` and `startedByRequest`, so a caller can wait for its own timed-out job without starting a duplicate, or retry after another caller's job ends. The backup shows in `GET /api/sites/{key}/backups` once the host has made it. 502 `FLEET_JOB_FAILED` now means the host refused or failed it.

## 2026-10-16: Estimated clicks of invitation emails

Added: `GET /c/{token}/{n}` on the Tracy host. When an operator turns on estimated clicks for JoomlArt invitation emails, each web link of a customer invitation points here; it answers 302 to that letter's own link, read from the sent record and never from the request, and an unknown token or place answers 404 with no redirect. A press is counted unless it looks like a mail scanner (within two minutes of sending, or a robot's user agent). No cookie, IP or user agent is kept.

## 2026-10-15: No design system on an imported site

Changed: a site imported into Tracy (not created from a Tracy template) cannot wear a new design system, for Tracy staff too. `GET /api/sites/{key}/design-system` answers it `supported: false`, `reason: SITE_IMPORTED`, `imported: true`, `locked: true`; `GET /api/sites/{key}/design-system/preview` (except `id=template-default`) and `POST /api/sites/{key}/design-system` answer 403 `DS_IMPORTED_SITE`. `id: "template-default"` and the undo door still answer.

## 2026-10-15: Back to the template's own look

Added: `POST /api/sites/{key}/design-system` takes `id: "template-default"`, which takes the worn design system off the site (the template's own look) instead of putting one on. It is an apply of its own: `applyId`, a Site changes row, and `POST /api/sites/{key}/design-system/undo` puts the system back. It works on every template, a locked one included; 409 `DS_NOTHING_WORN` when nothing is worn, and on WordPress 409 `DS_NO_TEMPLATE_LOOK` when the site's look from before its first design system was never kept.

## 2026-10-15: Design systems are offered on Tracy Business on EmDash too

Changed: customers may now put a design system on Tracy Business on EmDash as well as on Joomla. `GET /api/design-system/support` and `GET /api/sites/{key}/design-system` answer such a site as its contract says (no `locked`), and the preview, apply and `POST /api/sites` `designSystem` doors no longer answer it 403 `DS_TEMPLATE_LOCKED`. Every other template stays locked for customers.


## 2026-10-15: Connect ChatGPT and Claude through Tracy MCP and OAuth

Added: `POST /mcp` on the application host (`https://cowork.tracy.ai/mcp` in production), with tools generated from the existing `/v1` routes. The same Apply door enforces permissions, revision checks, audit history and undo receipts. ChatGPT connects through the public client `tracy-chatgpt`: OAuth discovery, `/oauth/authorize` on the Tracy sign-in host and `/oauth/token`, `/oauth/revoke` on the same application host. Consent names one accepted editable site and the `content` scope; S256 PKCE, single-use five-minute codes, one-hour access tokens and rotated refresh tokens under a stable key id. Replayed credentials, revoked keys and lost seats cannot restore access. Consent expires after 30 days. A cookie or an API key minted without OAuth consent does not authenticate MCP. Hosted Claude uses HTTPS claude.ai client metadata (CIMD) and its exact callback; codes, grants, refresh and revocation are bound to their client. Protected-resource metadata names the full MCP URL, including `/mcp`.

## 2026-10-15: Design systems are offered on Tracy Business / Joomla only

Changed: until a template is design system ready, customers cannot put a design system on it; today only Tracy Business on Joomla is open. For any other template a customer gets `supported: false`, `reason: TEMPLATE_NOT_READY`, `locked: true` from `GET /api/design-system/support` and `GET /api/sites/{key}/design-system`, and 403 `DS_TEMPLATE_LOCKED` from `GET /api/design-system/preview`, `GET /api/sites/{key}/design-system/preview` (except `id=template-default`), `POST /api/sites/{key}/design-system` and `POST /api/sites` with a `designSystem`. A site that already wears a design system keeps it: the read still names it and its undo still works. Tracy staff are not locked.

## 2026-10-15: Voice input follows the conversation's language

Changed: `GET /api/speech/stream` takes `?language=<code>`, the language the conversation is in. For `vi` the speech service is told it, so a Vietnamese request that switches to English is transcribed whole; speech it then makes nothing of reopens the session without it, once. A phrase the service restarts at a language switch keeps the words already sent as a `committed` phrase. Any other code, or none, changes nothing.

## 2026-10-15: Voice input's switch and key on /ops

Changed: `GET /api/speech` answers `available: false`, and `GET /api/speech/stream` refuses every handshake (404), while the operator has voice off (the User Interface switch `composer-voice-input`, now also on /ops › Agents › Voice); a switch that cannot be read refuses for now (503). The speech key is the one saved on /ops, the environment's `SPEECH_TO_TEXT_API_KEY` only while none is saved. Added (staff): `GET /api/ops/speech`, `PUT /api/ops/speech/key` and `POST /api/ops/speech/key/test`.

## 2026-10-15: Voice input in the chat box

Added: `GET /api/speech`, whether this deployment offers voice input (`available`) and its limits (`sessionSeconds`, `silenceSeconds`), and `GET /api/speech/stream`, the WebSocket the chat box's microphone streams 16 kHz PCM into and receives the recognised words from (`partial`, `committed`, the language heard, then `end` with its reason). The speech service's key stays on the server; a session runs at most five minutes of audio, ends after 30 seconds without a word, one per account at a time, within a daily budget of minutes. Signed in, from a page on Tracy's own origin; over plain HTTP the stream answers 426 `UPGRADE_REQUIRED`.

## 2026-10-14: The template's own look in the running site's design system preview

Changed: `GET /api/sites/{key}/design-system/preview` also takes `id=template-default`, the site's page with the design system it wears taken off and nothing laid in, for the Template default card's preview. A WordPress site that wears a design system answers 409 `DS_PREVIEW_UNAVAILABLE` with `reason` `NO_BARE` (its design system is merged into the page's global styles). Nothing is written.

## 2026-10-14: Fonts and stylesheets of a design system preview

Added: `GET /api/design-system/preview-asset?quickstart=<tag>&path=<path>`, one stylesheet or web font of a quickstart's live demo served through Tracy's origin, so the preview frame of `GET /api/design-system/preview` loads the demo's icon and text fonts (a demo sends no CORS header). Only `.css` and font files of the demo the server knows for that tag, at most 3 MB each, read on its web container; nothing is written. Signed in, any seat. Changed: the preview page now points the demo's own stylesheets at this door.

## 2026-10-14: The site's recent changes, without an apply_id

Changed: `apply.list` (through `POST /api/sites/{key}/apply`) takes `apply_id` as optional. Without it, Tracy answers from its own record of the site rather than the CMS: `{changes}`, the changes asked for by a conversation or a key in the last 30 days (at most 15 apply_ids, newest first), each `{apply_id, at, thisConversation, changed: [{action, kind, id, fields}], undone}` — the ids `apply.revert` takes back, the site name's `site.identity` writes included. A viewer sees only its own. With `apply_id` the answer is unchanged.

## 2026-10-14: Estimated opens of invitation emails

Added: `GET /o/{token}.gif`, the 1x1 image at the foot of a customer invitation sent from the Invitations mailbox (test sends carry none). It always answers the same transparent GIF with `no-store`, no cookie and no redirect; a known token records the first load and a capped count, with no IP or user agent kept. The count is an estimate: mail clients and image proxies load images without a person reading.

## 2026-10-14: Unsubscribe links in invitation emails

Added: `GET` and `POST /invitations/unsubscribe/{token}` and `POST /invitations/one-click/{token}`, the footer link and the RFC 8058 `List-Unsubscribe` address of invitation emails sent from the Invitations mailbox. The one-time token is the whole authority; no session is read. Opening the link changes nothing (its page POSTs the same token); the POSTs stop that campaign from emailing the address, and nothing else. Unknown token: 400 page or 404 text.

## 2026-10-13 — Connected account model selection

Added: `POST /api/seat-plan/models` lists models by the signed-in viewer’s connected accounts for a site/session. `POST /api/seat-plan/model` persists an owned account/model selection or clears the account pin for an enabled deployment provider. Both require same-origin JSON, site membership and conversation access; credentials are never returned. Internal reference also documents the signed-actor model display identity lookup.

## 2026-10-13 — Published desktop version in Help & about

Added: `desktopVersion` in `GET /api/build`, the stable desktop release offered by tracy.ai/download, read from the public stable Mac channel feed and cached for up to 60 seconds. It is null when unavailable or malformed; `commit` and `builtAt` still identify the running server image. Signed in only.
## 2026-10-12 — Design system previews can be browsed page by page

Added: `GET /api/design-system/preview` and `GET /api/sites/{key}/design-system/preview` take an optional `path` — a path of the same site or demo (`/about`, `/index.php?option=com_content&Itemid=105`); absent, the home page as before. Every link of a served page to the same site now points back at the door with its own `path` (a link to another host opens a new tab), so each page opened inside the preview wears the system. A `path` that names a host, a scheme, a backslash, a dot segment or an escaped slash is 400 `INVALID_REQUEST` `reason` `PATH`. With `path`, refusals are small `text/html` pages with the same status, and a page the site has not got is 404 (`PAGE_NOT_FOUND`), a file or a redirect off the site 409 (`NOT_A_PAGE`, `LEAVES_SITE`). Changed: the answers' `Content-Security-Policy` is now `sandbox allow-same-origin allow-popups allow-popups-to-escape-sandbox; frame-ancestors 'self'` (still no script and no form). Each page counts against the shared thirty-a-minute cap.

## 2026-10-12 — Design system previews are capped per account

Changed: `GET /api/design-system/preview` and `GET /api/sites/{key}/design-system/preview` allow thirty requests a minute per signed-in account, the two doors together, every request counted. Past that they answer 429 `RATE_LIMITED` with `Retry-After` (seconds until the next minute).

## 2026-10-12 — Create a site wearing a design system

Added: `POST /api/sites` takes `designSystem` — a library id (`refero:<uuid>`, from `GET /api/design-system/library`) for the new site to wear. The server keeps it on the site and puts it on at the end of the build (after the install and the `brief`), through the same write as `POST /api/sites/{key}/design-system`, as the caller; no browser has to stay open. An id the library does not offer is 400 `DS_UNKNOWN` before anything is created. The 202 answer carries `designSystem: {id, name, state: "queued"}`. `GET /api/sites/{key}/jobs/{id}` answers `running` (step `applying your design system`) until it is on, then `done` with `designSystem: {id, name, state, reason?, applyId?}` — `applied`, `skipped` (the template cannot wear a system) or `failed`.

## 2026-10-12 — The design system library is Refero only (BREAKING for apply)

Added: `GET /api/design-system/library` (any signed-in seat, `customer`): the design systems the Design system tab and the Add site form offer, as `{systems: [{id, kind, name, description, group, theme, image, fonts, colors, ok}]}` — every Refero system that passes the quality gate, `id` `refero:<uuid>`, `image` its screenshot address. Kept five minutes by the browser.

Added: `GET /api/design-system/library/refero/{uuid}/screenshot.jpg` (no sign-in): the picture of one offered Refero system, a 480-px WebP thumbnail served as `image/webp` (the `.jpg` name is kept so cards already drawn still load); any other uuid is 404 `NOT_FOUND`.

Added: `GET /api/design-system/support?quickstart=<tag>&platform=<cms>` (any signed-in seat, `customer`): `{supported, reason, need, have}` — whether a site built now from the newest release of that quickstart can wear a design system. An unknown quickstart or platform is `supported: false` with `TEMPLATE_NOT_READY`.

**BREAKING** — Changed: `POST /api/sites/{key}/design-system` accepts only Refero ids (`refero:<uuid>`). An OpenDesign id (`stripe`, `od:stripe`) or any id the library does not list is refused with 400 `DS_UNKNOWN`; a listed row the quality gate refuses is 400 `DS_REFUSED`. The two preview doors (`GET /api/design-system/preview`, `GET /api/sites/{key}/design-system/preview`) refuse the same ids the same way. A site already wearing an OpenDesign system still reads its name in `GET /api/sites/{key}/design-system` and can still undo that apply with `POST /api/sites/{key}/design-system/undo`.

## 2026-10-12 — The quickstart preview takes its platform from the demo

Changed: `GET /api/design-system/preview` dresses the page by the platform the server recorded for the quickstart's live demo, not by the `platform` the request sends. `platform` is now an optional hint: a value that differs from the demo's is ignored (the answer is that demo's own preview), and a value outside `joomla`, `wordpress`, `emdash` is still 400 `INVALID_REQUEST`. A demo whose platform is not recorded is 409 `DS_PREVIEW_UNAVAILABLE` `NO_SLOT`.

## 2026-10-12 — Design system preview on WordPress

Changed: `GET /api/design-system/preview` and `GET /api/sites/{key}/design-system/preview` answer WordPress too. WordPress prints a design system into its global styles instead of serving the file an apply writes, so the page comes back with the global styles WordPress prints once that system is applied (the theme’s own custom CSS replaced by the system’s, its fonts loaded). Neither door answers 409 `DS_PREVIEW_UNAVAILABLE` `PLATFORM` for WordPress any more; `NO_DEMO`, `NO_SLOT` and `DEMO_UNREADABLE` are unchanged.

## 2026-10-12 — Preview a design system on the running site

Added: `GET /api/sites/{key}/design-system/preview?id=<library id>&template=<template>` (any seat on the site, a viewer too, `customer`): the home page the running site serves now wearing the design system, as `text/html` sent with `Content-Security-Policy: sandbox` — read on the site's own web container, the design system it wears taken off, the bytes an apply to this site would write laid last in the head, plus a `<base href>` at the site's address. Nothing is written to the site. `template` (optional) is the `template` the design-system read answered. Kept up to a minute; an apply or undo of the site forgets it. 409 `DS_PREVIEW_UNAVAILABLE` with `reason` `PLATFORM` (WordPress) or `NO_SLOT`; 502 `DS_PREVIEW_FAILED` when the page could not be read. The Design system tab's card popup reads it.

## 2026-10-12 — "Design inspiration" is now "Design templates" in the reference

Changed: wording only. Summaries and descriptions that named the gallery "Design inspiration" now say "Design templates" (the public page, its badge and banner scripts, the staff card doors under `/api/ops/quickstart/inspiration`, the design-system apply door, the `design` field of `POST /api/sites`). No path, field, operation id or answer changed.

## 2026-10-12 — Preview a design system on a quickstart's demo

Added: `GET /api/design-system/preview?quickstart=<tag>&platform=<cms>&id=<library id>` (any signed-in seat, `customer`): the home page of that quickstart's live demo wearing the design system, as `text/html` sent with `Content-Security-Policy: sandbox` (the bytes an apply writes, laid last in the head, plus a `<base href>` at the demo's public address). The demo is never written to. Joomla and EmDash only; anything it cannot preview is 409 `DS_PREVIEW_UNAVAILABLE` with `reason` `PLATFORM` (WordPress), `NO_DEMO`, `NO_SLOT` or `DEMO_UNREADABLE`. The Add site form's design system popup reads it.

## 2026-10-12 — Pictures reach a subscription model that reads them

Added: `inputModalities` (`["text", "image"]` or `["text"]`) on `next` in `GET /api/seat-plan/status` and on a subscription `route` from `GET /api/seat-plan/session` and `POST /internal/seat-plan/pin` — whether that route's model reads pictures (Claude, ChatGPT Codex GPT-6, Grok, the vision models of Copilot and Kimi) or text only (GLM, Qwen, Antigravity, any model not in its vendor's table). Changed: `POST /internal/seat-plan/run` carries inline pictures in user and tool messages to a model that reads them and puts a placeholder in place of each one for a model that does not, decided on every attempt from the route actually used (a failover to a text-only model goes on as text); its 16 MiB body limit counts UTF-8 bytes; it refuses more than 20 pictures or more than 12 MiB of base64 in one request with 413 `invalid` and `reason: "images"`, and an outside picture URL with 400 `invalid` and `reason: "images"`.

## 2026-10-12 — ChatGPT Codex signs in with a code on the web

Added: `surface` in the body of `POST /api/seat-plan/connect/start` — `desktop` from the desktop app, `web` otherwise (optional; any other value is `web`). From the web, ChatGPT Codex now starts a device-code sign-in (`signIn: "device"`, `userCode`, `authorizeUrl` = OpenAI's device page; finish by polling `POST /api/seat-plan/connect/complete` with `{attemptId, state}`) instead of a browser sign-in whose `localhost:1455` callback address had to be pasted back; from the desktop app it keeps the browser sign-in, whose callback the app catches. An attempt finishes the way it started: a pasted address for a device attempt, or a poll for a browser one, is refused with 400 `invalid`. Added: `webSignIn` on each provider in `GET /api/seat-plan/status`, how it signs in from the web (`browser`, `device` or `key`); `signIn` keeps its meaning.

## 2026-10-12 — Getting started can be shown in the account menu again

Added: `POST /api/onboarding/menu-show` (no body, `customer` and `desktop`) undoes `POST /api/onboarding/menu-hide`: it clears the account's `menuHiddenAt` and answers `{menuHiddenAt: null}`, so `GET /api/onboarding` reads `null` again and the account menu shows the Getting started row while setup steps remain. Showing a row that is not hidden changes nothing; a later hide records a new time. Same guards as the hide: 401 `NOT_SIGNED_IN` without a session, 403 `CSRF_ORIGIN` from another site's page.

## 2026-10-12 — Tracy AI is an entry in the AI account order

Changed: `routing` in `GET /api/seat-plan/status` has no `tracyFallback` any more; `routing.connectionOrder` carries every connection id and the literal `tracy` (Tracy AI) exactly once, the first entry being the Default and Tracy AI ending the walk — a new connection stands before `tracy` while `tracy` is last, else after everything. `PUT /api/seat-plan/routing` requires `connectionOrder` to name every connection of the account and `tracy` exactly once (400 `invalid` otherwise); a `tracyFallback` field it still receives is ignored. The column `tracy_fallback` behind the old flag is kept one release, unread and nullable, so an older web image still runs against the schema; a later migration drops it. Changed: `GET /api/onboarding`, `POST /api/onboarding` and the new `POST /api/onboarding/menu-hide` are listed for the desktop app as well as the web (`x-audience`), where they were already used. `next` keeps its meaning (the effective route of a new chat; `null` = Tracy AI). Added: `menuHiddenAt` on `GET /api/onboarding` — when the account hid the Getting started row from the account menu, or `null`; `POST /api/onboarding/menu-hide` (no body) records it once, the first time being kept.
## 2026-10-11 — Retired: the site build report door; sign-out ends the session

Removed: `GET /__tracy/build` and `POST /__tracy/build` on a customer site's address. Nothing had recorded a build since the fleet hook was retired, so every site answered `{ "built": null }`; both now answer the HTML 404 page, like any other unknown path under `/__tracy/`. Changed: `POST /auth/signout` now ends the session on the server as well as clearing the cookie, so a copy of the old `tracy_sess` cookie no longer signs in and cannot be renewed by `GET /auth/me`. Sessions created before this change are unaffected until they expire. Changed: every answer on Tracy's own https address carries `Strict-Transport-Security: max-age=31536000`; a customer site's address never does.

## 2026-10-11 — A record's ETag covers the whole record; Site changes says Tracy setup and API

Changed: the `ETag` of `GET /v1/sites/{key}/records/{kind}/{id}` (WordPress `post`, `templatePart`, `template`, plugin 0.17.0+) is now the revision of the whole editable record — a sha256 over every field it holds (title, content, excerpt, status, slug, meta…), normalised before hashing — not its `body_revision` alone; a tag read before this change no longer matches. `PATCH` on that route with `If-Match` answers `412 REVISION_STALE` (was `409`) with the current `ETag` when any field of the record changed since, and nothing is written; a body write that lands between Tracy's read and the plugin's lock is `412` too. The answer of a `PATCH` carries no `ETag` any more: read the record for its new one. `GET /api/sites/{key}/activity?version=2` has two more Sources (filter values): `setup` — Tracy writing a new site's words and pictures from the brief its person sent — and `api`, a write made with a seat key; a revert made through `/v1` is a row of its own (`description.key` `apply.revert`). Rows written before this change keep the Source they had.

## 2026-10-11 — Getting started is remembered per account

Added: `GET /api/onboarding` answers `{completedAt}` — when the signed-in account closed the Getting started screen, or `null`; the web shows the screen once while it is `null`. `POST /api/onboarding` (no body) records the close; the first time is kept and later calls answer the same time.
## 2026-10-11 — Download a backup

Added: `POST /api/sites/:key/backups/:version/export` asks the site's host to pack one backup — its files, its database dump, `tracy_setting.json`, `manifest.json` and `SHA256SUMS` — into one zip, and answers 202 with `{exportId, state}`; `GET /api/sites/:key/backups/:version/export/:exportId` reads its state and, once `ready`, a download link signed anew on every call that works for five minutes. The package is kept for 24 hours. Owners only (403 `FORBIDDEN_EXPORT`); WordPress and Joomla only; one export per site at a time, two at a time and ten an hour per account. Both doors exist only on a server that offers backup downloads; elsewhere they answer 404 `EXPORT_OFF`. Changed: `GET /api/sites/:key/backups` `may` gains `export`, true for an owner's seat on such a server.

## 2026-10-16 — Export requires a fresh email code

Changed: `POST /api/sites/:key/backup` accepts optional `includeLarge: true` and captures files over 50 MB under the same site lock as that fresh backup. `POST /api/sites/:key/backups/:version/export` accepts the same option and packages that snapshot; EmDash exports include app source, SQLite and uploads. Archives include a platform README and are capped at 1 GiB. The ••• menu handles `202 BACKUP_PENDING` while the backup finishes. `GET /api/sites/:key/backups/:version/export/:exportId` reports status only and never issues a URL. Added `POST …/export/:exportId/code`, which emails a six-digit code valid for ten minutes, and `POST …/export/:exportId/download`, which consumes that code once and returns a five-minute URL. Both new and historical exports require the fresh code. Owners only; all export doors answer 404 `EXPORT_OFF` when the kill switch is off.

## 2026-10-12 — Design system gates Publish

Staff-only doors under `/api/ops`. Added: step `design-system` in `road` on each row of `GET /api/ops/quickstarts`, between `customize` and `demo` (nine steps), the Template Design System Readiness check of the release's version (ADR 0031): `params` `{ passed, total, mustFix: [{ rule, text, question, owner, message, fix }], worthFixing: [...], version, checkedAt? }`; codes `ds-waiting` (blocked by `release` or `install-file`), `ds-not-checked`, `ds-checking`, `ds-error`, `ds-must-fix` (todo), `ds-worth-fixing` (warn), `ds-live-failing` (warn: a published release is never taken off) and `ds-ready`. Changed: `POST /api/ops/quickstart/inspiration/publish` refuses with `DESIGN_SYSTEM_NOT_READY` (`{ error, reason, rules }`) while must-fix rules of that check remain or the version is not checked. Added: `POST /api/ops/quickstart/design-system/check?tag=` (owners and admins) runs the check of one release again and answers 202 `{ ok, state: 'checking' }`; `UNKNOWN_QUICKSTART` (404), `NOT_CHECKABLE` (400). What customers see is unchanged.

## 2026-10-11 — Customize your site gates Publish

Staff-only doors under `/api/ops`. Added: step `customize` in `road` on each row of `GET /api/ops/quickstarts`, between `contract` and `demo` (eight steps), the Template Customization Question Readiness check of the release's version: `params` `{ passed, total, mustFix: [{ rule, text, question, owner, message, fix }], worthFixing: [...], version, checkedAt? }`; a new state `checking` while the check runs; codes `customize-waiting` (blocked by `contract`), `customize-not-checked`, `customize-checking`, `customize-error`, `customize-must-fix` (todo), `customize-worth-fixing` (warn), `customize-live-failing` (warn: a published release is never taken off) and `customize-ready`. Changed: `POST /api/ops/quickstart/inspiration/publish` refuses with `CUSTOMIZE_NOT_READY` (`{ error, reason, rules }`) while must-fix rules remain or the version is not checked. Added: `POST /api/ops/quickstart/customize/check?tag=` (owners and admins) runs the check of one release again and answers 202 `{ ok, state: 'checking' }`; `UNKNOWN_QUICKSTART` (404), `NOT_CHECKABLE` (400). What customers see is unchanged.

## 2026-10-11 — The template landing also offers Tracy Desktop

No door changed: `GET /api/quickstarts/{template}/{cms}/quickstart.zip` still serves the zip to any signed-in session, from a browser or from the app. The template landing page `/new?template=<id>` keeps its Build button and quickstart download link everywhere; in a browser it now also offers Tracy Desktop (a link to the app download page) and names the account to sign in with there. Signed in to the app as the same account, the person is sent to that template's page once.

## 2026-10-11 — Connect an AI account with a pasted API key

Added: `POST /api/seat-plan/connect/key` with `{ provider, key }` connects a provider that signs in by API key (Kimi, GLM, Qwen; each off until an operator offers it). The provider checks the key first; refusals are `invalid` (400), `key` (401, the provider refused the key), `plan` (403, the provider knows the key but refuses access), `disabled` (403), `conflict` (409, disconnected while the key was checked) and `vendor` (502), in the same `{ code, message }` shape as the other seat-plan doors. Changed: each row of `providers` in `GET /api/seat-plan/status` carries `signIn` (`browser`, `device` or `key`).

## 2026-10-11 — Desktop sign-in: cancel a round, say why it ended

Added: `POST /auth/link/:nonce/cancel` lets the desktop app end its own pending round with its client secret (same `Origin`, JSON and per-address rules as `POST /auth/link/:nonce/session`); the round reads `denied` and can no longer be approved or redeemed. `GET /login` accepts an optional `reason` (`not-admitted`, `expired`, `denied`, `failed`) and shows a short message for it; any other value is ignored.

## 2026-10-11 — The road to live gives one recommended order

Staff-only doors under `/api/ops`. Changed: in `road` on each row of `GET /api/ops/quickstarts`, step `demo` is `blocked` by `contract` while the release has no content contract of its own (`no-contract`), since the contract work may cut a new version; a live demo stays `done` or `warn`. Step `listing` is `blocked` by `demo` while no demo is live and no listing is saved; a saved listing stays `done` when the demo later goes down. The publish door's refusals are unchanged (it never needed a demo). What customers see is unchanged.

## 2026-10-11 — The road to live drops the hand check

Staff-only doors under `/api/ops`. Removed: step `check` and state `manual` from `road` on each row of `GET /api/ops/quickstarts`; the road now has seven steps, `release`, `install-file`, `contract`, `demo`, `listing`, `published`, `polish`. The publish door's refusals are unchanged. What customers see is unchanged.

## 2026-10-11 — Desktop first-run sign-in doors

Added: `GET /login?onboard=1` draws the sign-in form inside the desktop app's setup frame; `GET /signin/email` hands a typed address to the desktop app (a browser lands on `/login?email=`); `POST /signin/code` and `POST /signin/verify` send and check a code bound to one desktop sign-in round and approve that round in the same press (exact `Origin` and a round-bound form token required); `GET /signin?use=session` keeps the browser's current account for a round started with another address. `POST /auth/link/browser` accepts an optional `email` for desktop rounds.

## 2026-10-11 — The page a quickstart download came from

Changed: `GET /signin/joomlart` and `GET /api/quickstarts/{template}/{cms}/quickstart.zip` accept an optional `ref`, an absolute http(s) URL of the page the person came from. The sign-in door adds it (else the `Referer` header, never a page of Tracy's own origin) to a template landing `next`; the download door keeps it with the download record. A value that is not an absolute http(s) URL of at most 512 characters is ignored; it never refuses a sign-in or a download. Only scheme, host and path are kept. Recorded for Tracy staff only. `GET /signin/{provider}/callback` now answers with `Referrer-Policy: no-referrer`, as the JoomlArt callback already did, so the page a sign-in returns to never learns the provider as its referrer.

## 2026-10-11 — The road to live, in the order steps finish

Staff-only doors under `/api/ops`. Changed: `road` on each row of `GET /api/ops/quickstarts` now has eight steps in the order they finish, `release`, `install-file`, `contract`, `demo`, `listing`, `published`, `check`, `polish`, and each waits only for what its own door needs: `contract` for the install file alone (its `params.path` is `full` for an installer release, `direct` for a captured package); `listing` for no demo (`params.demo` says whether Create listing can read one); `polish` for nothing. New step `check` (the end to end test site built from the card after Publish) with a new state `manual`: done by hand, never `done`, `blocked` by `published` until then. The publish door's refusals are unchanged. What customers see is unchanged.

## 2026-10-11 — The road to live of a quickstart release

Staff-only doors under `/api/ops`. Changed: every row of `GET /api/ops/quickstarts` carries `road`, the seven steps a release walks before customers can pick it (`release`, `install-file`, `demo`, `listing`, `contract`, `published`, `polish`), each `{ step, state: done | blocked | todo | warn, code, params, blockedBy? }`; null for a design pack. `POST /api/ops/quickstart/inspiration/publish` refuses with the road's first blocked step in its existing codes (`NOT_A_CARD`, `NO_CARD`, `NO_CONTRACT`, `NOT_SHOWABLE`); the `NO_CONTRACT` reason no longer names `batch-contracts.mjs`. `GET /api/ops/quickstart` marks the release's own demo in `sites` (`demo`, `live`). What customers see is unchanged.

## 2026-10-11 — The site's own words for the design system previews

Added `GET /api/sites/{key}/design-system/words`: the words the Design system panel draws its previews in — the site's name, menu, first heading, its lead and its first two calls to action — read off the home page the running site serves now, kept two minutes per site; `{present: false}` when the page could not be read or says none of them. Any seat on the site may read it.

## 2026-10-11 — Design system on a running site

Added `GET /api/sites/{key}/design-system`, `POST /api/sites/{key}/design-system` and `POST /api/sites/{key}/design-system/undo`: read the design system a running EmDash, WordPress or Joomla site wears and whether its template can wear one, put a design system of the Design inspiration catalogue on it (no chat turn, no rebuild; recorded in Site changes), and put back exactly what it wore before the newest apply. Applying needs the `code` toolset (owner, editor); a viewer reads only. `POST …/design-system` takes an optional `template` (the `template` the read answered) so it writes without reading the site first, and both writes answer `read` — the read as the site stands after the write. `GET /api/sites/{key}/turns` answers `designSystem`, the site's newest design system apply (`canUndo` for this seat), which the site browser's Undo offers when it is newer than the chat's newest change.

## 2026-10-11 — The documentation moved to its own host

Changed: the documentation site and the interactive reference are served at the root of their own
host, `https://docs.tracy.ai` (development: `https://docs.tracy.site`); the reference is at
`/api/reference/` there, and its three documents at `/api/openapi.json`, `/api/claude-cowork.json` and
`/api/llms.txt`. Every `/docs/…` address on `api.tracy.ai` and on Tracy's own hostname answers a 302
to the same page on the new host (`/docs/api` to `/api/reference/`). On `api.tracy.ai` the three
documents keep their published addresses, `/docs/api/openapi.json`, `/docs/api/claude-cowork.json`
and `/docs/api/llms.txt`, and `GET /` redirects to the documentation host. `/v1` now answers
cross-origin calls from the documentation host alone (`Access-Control-Allow-Origin` set to that
origin, no credentials), so the reference's **Test request** reaches the API; every other origin
still gets no CORS header.

## 2026-10-11 — An author's job and bio, and a layout's literal words (Joomla, WordPress)

Added content kinds: Joomla `userProfile` (Claude Cowork 0.24.13) and WordPress `usermeta` (Claude Cowork 0.18.9), an author's visitor-facing fields (the bio, a theme's job title or tagline; never another field of the account). `content.list` lists them (`{id, user_id, name, field, value}` on Joomla, `{id, name, meta}` on WordPress), `content.update` writes one `value`, undone by `apply.revert`; toolset `content`. Changed: `template.languageOverrides` `read` may answer `reason: literal` rows, words a layout prints with no language key, under a `TRACY_LITERAL_` key (Joomla 0.24.13).
## 2026-10-10 — Joomla language overrides through the Apply door

Added the Apply action `template.languageOverrides` (Joomla, Claude Cowork 0.24.11, toolset `site`): `read` the front-end language strings of the site template and extensions that still read in en-GB in a language (`strings`, `overrides`, `truncated`), and `set` the site's override file for that language (`language/overrides/<locale>.override.ini`), undone by `apply.revert`. The door refused it with `ACTION_NOT_ALLOWED` until now.
## 2026-10-10 — Sign in with a JoomlArt account

Added `GET /signin/joomlart` and `GET /signin/joomlart/callback`: Login with JoomlArt, a signed redirect to aMember (`www.joomlart.com/member`) and back, HMAC-SHA256 over a base64 payload with a shared secret. The start door records a one-time nonce, sets the `tracy_oauth_state` cookie and redirects to aMember; the callback verifies the signature, consumes the nonce once, links the account by identity (`joomlart`, aMember's `external_id`), keeps aMember's `entitlement` on that identity, and sets the session cookie. A paid, unexpired entitlement admits the person during the beta; otherwise the beta gate decides as for every other sign-in. Only on deployments where `JOOMLART_SSO_URL` and `JOOMLART_SSO_SECRET` are set; elsewhere both doors answer 404.

## 2026-10-10 — Quickstart download

Added `GET /api/quickstarts/{template}/{cms}/quickstart.zip`: the quickstart package of a JoomlArt template's release (`quickstart/ja-kinetic/j6`), streamed through Tracy to the signed-in person as an attachment, with `x-tracy-sha256` when GitHub states the asset's digest. The person is never sent to GitHub. Ten downloads an hour per account, two open at once; 404 `QUICKSTART_NOT_AVAILABLE` when the release is not one Tracy can read.

## 2026-10-10 — Which release's card customers see

Staff-only door under `/api/ops`. Changed: every row of `GET /api/ops/quickstarts` carries `cardSource`, true on the one release per template whose card (blurb, category, picture, layouts) `GET /api/templates` serves, and false everywhere else, including every release of a template no customer is shown. What customers see is unchanged.

## 2026-10-10 — Design inspiration cards: Save card and Publish are two doors

Staff-only doors under `/api/ops`. Changed: `PUT /api/ops/quickstart/inspiration` now saves a card without offering it — a card customers do not see yet is kept hidden (the release carries `tracy_design_inspiration_hidden.json`), a card already shown stays shown; it answers `hidden` instead of `warnings` and no longer checks the content contract. Added `POST /api/ops/quickstart/inspiration/publish`: shows the card already saved, refused with `NO_CARD`, `NO_CONTRACT` or `NOT_SHOWABLE` before anything is written. Changed: `DELETE /api/ops/quickstart/inspiration` keeps the card and leaves the hidden mark, answering `{ ok, hidden }` instead of `{ ok, deleted }`. What customers see is unchanged until someone presses Publish.

## 2026-10-10 — Staff questionnaire doors removed, customer questions preview added

Staff-only doors under `/api/ops`. Removed with the questionnaire generator and the question-set editor: `PUT /api/ops/quickstart/questions/choice`, `POST /api/ops/quickstart/questions/generate`, `GET /api/ops/quickstart/questions/generation`, `POST /api/ops/quickstart/questions/generation/cancel`, `GET /api/ops/quickstart/capabilities`, `PUT` and `DELETE /api/ops/quickstart/questions/set` and `POST /api/ops/quickstart/questions/translate`. Changed: `GET /api/ops/quickstart` no longer answers `sets`, `choice`, `capabilities`, `generations`, `canGenerate` or `canTranslate`; `GET /api/ops/quickstarts` rows no longer carry `questions`; `GET /api/ops/attention/questionnaire` no longer answers `canGenerate`. Added `GET /api/ops/quickstart/customer-questions`: read-only, the questions `GET /api/sites/questions` serves for one release, with what the release decided (logo layout, page list). What customers are asked is unchanged.

## 2026-10-09 — Account pictures from Google and GitHub

Added `GET /auth/avatar/{accountId}`: the profile picture an account's last Google or GitHub sign-in handed over, fetched and kept by Tracy so pages never request it from the provider. Changed: a face's `avatarUrl` (on `GET /auth/me`, `GET /api/team`, the comment doors, the Inbox and Site changes) is now this same-origin address when the account has a picture, and still null when it has none. A Google sign-in now asks for the `profile` scope as well, and fills an empty display name from the provider's profile; a name already set is never replaced.

## 2026-10-08 — Account model subscriptions

Added `/api/seat-plan/status`, `/routing`, `/connect/start`, `/connect/complete`, `/disconnect` and `/session`. Subscription connections and routing belong to the signed-in account across web and desktop. Routing includes account-wide `tracyFallback`, defaulting to true. Unavailable subscriptions can fall back to Tracy AI before any output; users may disable this independently of switching between subscriptions. Operator subscription switches now govern both surfaces; existing saved credentials and ordering are preserved when disabled.

This page is public-facing, so it is written in English. It records every change to the public API
described at `/docs/api` (OpenAPI document: `/docs/api/openapi.json`, plain-text summary:
`/docs/api/llms.txt`).

**Versioning.** The API carries its own version (`info.version`, today `v1`), separate from the
version of the Claude Cowork plugin on Joomla/WordPress and of the EmDash reader. Adding an
operation, a parameter, a field or an action stays `v1` and gets a dated line here. Removing
something, or changing what it means, is a new version (`v2`) for the Bearer doors under `/v1/*`,
the ones third parties integrate with. The session doors under `/api/*` are called by Tracy's own
interface and ship together with it: a change to one of them is recorded here as a dated "Changed"
line, without a new version.

**How this page is kept honest.** `apps/tracy-web/api-reference.snapshot.json` is the last agreed
shape of the API, generated by `pnpm api:snapshot`. The `api-spec` gate (`scripts/check-api-spec.ts`)
rebuilds the reference on every CI run and names each difference from that snapshot: a breaking one
is red until `info.version` moves; any other one is red until the snapshot is regenerated. The
snapshot records the date its public part last changed, and the gate is red while the newest entry
below is older than that date. Wording changes (summaries, descriptions) are not API changes and need
no entry.

**Adding an entry.** Newest first, one `## YYYY-MM-DD` heading per day, one line per change, naming
the operation (`METHOD /path`), parameter, field or action — added, changed or removed.

## 2026-10-09

- **Changed `PUT /api/sites/{key}/address`, `GET /api/sites/{key}/address/availability` and
  `POST /api/sites/{key}/address/verify` (custom domains):** refused 503 `OWN_DOMAIN_UNAVAILABLE` on a
  server without Cloudflare for SaaS (or with only one of its two settings); `PUT` also refuses 409 `DOMAIN_RELEASING` while the custom
  hostname of an earlier reservation of the name is still being deleted. The `routing` record now
  names `connect.<site domain>`.
- **Added field `hostname` `{ready, reason?}`** to a custom domain (`pending`, `connected[]`), and
  `checks` entries with `record: "validation"`: the DNS records the certificate's validation asked
  for, every one whole, exactly as returned. New `connection.error` codes: `HOSTNAME_PREPARING`,
  `HOSTNAME_UNCONFIRMED`, `HOSTNAME_CONFLICT`, `HOSTNAME_PENDING`, `HOSTNAME_FAILED`, `CERT_PENDING`,
  `CERT_FAILED`, `HOSTNAME_UNREAD`. A custom domain reads `connected` only while its hostname and
  certificate are active as last read successfully, besides the HTTPS probe; otherwise its
  `connection` reads `failed` with the hostname's reason.
- **Changed `DELETE /api/sites/{key}/address/domain`:** the domain's custom hostname is deleted once
  the name is no longer the site's.
- **Added `GET /api/build`:** which build of the Tracy server answers — `commit` (full SHA) and
  `builtAt` (ISO-8601 UTC), `null` when unknown. Signed in only; never cached. Settings › Help & about
  shows it.
- **Added field `sitename_pagetitles`** to action `site.identity` (Joomla, Claude Cowork 0.24.5+): Site Name
  in Page Titles, `0` no, `1` "Site - Page", `2` "Page - Site"; read with the other two, set on its own.
- **Added key `other_shareImage`** to action `template.siteSettings` (Joomla, Claude Cowork 0.24.5+): the
  share picture the plugin prints as `og:image`. On a template without T4 it replaces any other `og:image`
  on every page; on T4 it is a fallback, printed only where the page has none of its own, and is taken in
  `fields` only (refused inside `profiles`).

## 2026-10-08

- **Added `POST /api/sites/{key}/edit-access-request`:** a viewer asks the site's owners for edit access.
- **Added `POST /api/sites/{key}/seats/{grant}/edit-access`:** an owner answers that request with
  `{decision: "approve" | "decline"}`; approve makes the viewer an editor.
- **Added field `editRequestedAt`** to the rows of `GET /api/sites` and to each seat of `GET /api/team`.
- **Changed — three seat roles (ADR 0028):** a seat on a site or a workspace is now `viewer`, `editor`
  or `owner`; `admin` and `developer` are retired (their seats became `editor`). The `role` of
  `POST /api/team/invite` and `POST /workspaces/{id}/seats` takes `viewer` or `editor`; the `role` of
  `PATCH /api/sites/{key}/seats/{grant}` and `PATCH /workspaces/{id}/seats/{accountId}` takes `owner`,
  `editor` or `viewer`. Each role holds a fixed set of toolsets (viewer none; editor `content`,
  `code`, `site`; owner those and `lifecycle`): no site or workspace policy changes them, and a key's
  `scopes` (`POST /api/me/keys`) must sit inside that set, so a viewer mints no key.
- **Changed `POST /api/sites/{key}/go-live` and `POST /api/sites/{key}/state`:** an editor may publish;
  a viewer is refused 403 `NOT_SITE_EDITOR` (was `NOT_SITE_ADMIN` for anyone not owner or admin).
- **Changed `POST /api/sites/{key}/backup`, `POST /api/sites/{key}/turns/undo` and
  `POST /api/sites/{key}/artifacts/{step}`:** a viewer is refused 403 `FORBIDDEN_WRITE`.
- **Changed `PUT /api/sites/{key}/component-credential` and the `/api/sites/{key}/mail` doors:**
  owners only, 403 `NOT_SITE_OWNER` (was `NOT_SITE_ADMIN`).
- **Changed `POST /api/sites/{key}/apply`:** `content.read`, `content.locate` and the reads of
  `content.contract` (`inspect`, `*.plan`, `*.verify`) are open to any live seat, a viewer included
  (its agent is read-only); writes stay by role, and `db.dump` and `apply.list` stay gated. The
  refusal `COMMENT_NOT_IN_FLIGHT` is removed: `comment` never widens what a seat may write.
- **Changed `POST /api/sites/{key}/preview-ticket`:** any live seat, a viewer included, gets a comment
  picker ticket (a viewer comments, and pins a comment to an element).

## 2026-10-07

- **Changed `PUT /api/sites/{key}/address`, `GET /api/sites/{key}/address/availability` and
  `POST /api/sites/{key}/address/verify`:** a custom domain that is a registrable domain itself
  (`example.com`, `example.co.uk`, by the public suffix list) is refused with 400 `DOMAIN_APEX_UNSUPPORTED`
  `{name, suggestion}` — it cannot carry the CNAME that connects it; `suggestion` is `www.` of it. A public
  suffix, or a name under a suffix the list does not know, is 400 `INVALID_SITE_KEY`.
- **Changed `PUT /api/sites/{key}/address`:** a custom domain whose ownership is not proven holds its name
  for 72 hours (`pending.holdUntil`). Past that the reservation lapses: another site may reserve the name,
  and the site that held it reads it in `addressChange.lapsed` (`{name, kind, state: "lapsed", lapsedAt}`) of
  `GET /api/sites/{key}/settings` until it removes it with `DELETE /api/sites/{key}/address/domain` or
  reserves again (a new token). `POST /api/sites/{key}/address/verify` answers 409 `RESERVATION_LAPSED` for
  it, besides its existing 404 `NAME_NOT_RESERVED`. A pending domain reserved before these rules carries
  the code it would be refused with now in `problem` and no `routing` record: `DOMAIN_APEX_UNSUPPORTED`
  with `suggestion` for a bare domain, `INVALID_SITE_KEY` (no `suggestion`) for a name under a suffix the
  list does not know. It can only be removed.
- **Changed `PUT /api/sites/{key}/address`, `GET /api/sites/{key}/address/availability` and
  `POST /api/sites/{key}/address/verify`:** while the operator has turned the `site-connect-domain` switch
  off, starting a custom domain is refused with 403 `OWN_DOMAIN_DISABLED` (503 `UI_SETTING_UNREADABLE` when
  the switch cannot be read). `DELETE /api/sites/{key}/address/domain` and a Tracy address are not affected.

- **Added the Apply action `template.siteSettings`** (Joomla, Claude Cowork 0.23.0, toolset `site`): read or set a
  template's logo, dark-background and small-screen logos, name, slogan and favicon (a T4 template's site profile
  files; a T3 template's favicon), undone by `apply.revert`.
- **Added `POST /signin/deny`, and a desktop round's `GET /signin` page:** a sign-in round opened by the Tracy Cowork
  for Mac app shows the app's name, a match code and a Deny button; Deny marks the round denied (same checks as
  `POST /signin/approve`). Internal: `POST /auth/link/browser` takes an optional `purpose` (`lane` | `desktop`) and
  answers `matchCode` for a desktop round, `GET /auth/link/{nonce}` can answer `denied`, and the new
  `POST /auth/link/{nonce}/session` trades an approved desktop round for a session cookie.
- **Added the Apply action `site.identity`** (Joomla, Claude Cowork 0.22.0, toolset `site`): read or set Global
  Configuration's `sitename` and `MetaDesc`, undone by `apply.revert`. **Changed `GET /api/sites/questions`:** the
  standard set is fitted to the template — the `logo` question carries `variants`, the `pages` question the template's
  own pages as `options` with `locked` (its home page) or `keepsAllPages: true` when the template ships no page list,
  `logo` and `favicon` are left out while the `site-brand-uploads` switch is off — and `languages: "one"` is answered
  for every site. **Changed `POST /api/sites`:** `brief.answers.pages` keeps only page ids of the template being built,
  its home page always.
- **Added `POST /api/sites/brand-files`** (session, internal): upload a PNG logo or favicon (`multipart` `file` +
  `role`) before a site exists; answers 201 `{id, width, height}`, 422 with the problem code. **Changed `POST /api/sites`:**
  `brief.answers.logo` may be a file id or `{light?, dark?, single?}` of them and `brief.answers.favicon` a file id; ids
  that are not the caller's own uploads are dropped without failing the create.
- **Changed the AI Assistant doors (now Help, asked as `/help` in the agent's chat):** `GET /api/assistant/conversation`
  gains the optional query `session` (the agent session whose Help conversation to read; absent = the account-level
  one) and answers `sessionId`, `tipSeen` (on a restore) and an `anchorSeq` on each Help turn. `POST /api/assistant/turns`
  gains the optional body field `session` (`{id, anchorSeq, title?, state?}`): the conversation is now one per account
  and agent session. Added `POST /api/assistant/tip/seen` (the one-time "type /help" tip was shown, 204) and `POST /api/assistant/turns/{id}/rating` (a thumbs up or down on a Help answer, 204); a turn of `GET /api/assistant/conversation` carries its `rating` when it has one.
- **Changed `DELETE /api/sites/{key}`:** the host is asked first, and the site record, its seats and its
  repository are removed only once the host has said the site is gone. `{removed: true, host: true, …}` is
  answered then; a host that could not finish answers 409 `TEARDOWN_FAILED` (`removed: false`, `hostReason`,
  `retry: true`) with the site untouched in Tracy, and one that has not finished in time answers 202
  `DELETE_PENDING`. A 200 with `host: false` is no longer answered. The delete holds the site like a publish
  does: 409 `PUBLISH_BUSY` while another operation holds it, and nothing else starts while it runs.
- **Added to `GET /api/sites/{key}/state`, the `publishing` part of `GET /api/sites/{key}/settings` and
  `GET /api/sites`:** `operation.op` may be `delete`, and `publishing` in the list may be `delete`.
- **Changed `PUT /api/sites/{key}/address`, `POST /api/sites/{key}/address/verify` and
  `DELETE /api/sites/{key}/address/domain`:** a body that carries a field the door does not read, or a
  `kind` that is not `managed` or `custom` (`null` included), is refused with 400 `INVALID_REQUEST` instead
  of being read without it.
- **Changed `POST /api/sites/{key}/address/verify`:** `checkedAt` is when the lookup was asked, and a lookup
  that ends after a later one no longer replaces it; the answer is the reading on record.

## 2026-10-06

- **Added `DELETE /api/sites/{key}/address/domain`:** removes a custom domain from the site. A domain that
  was only reserved is removed at once (200); one the host may route is removed as an operation of the site
  (202, `operation.op: "drop-domain"` in `GET /api/sites/{key}/state`).
- **Added to `GET /api/sites/{key}/state` and the `publishing` part of `GET /api/sites/{key}/settings`:**
  `operation.op` may be `drop-domain`; `operation.domains` (the custom domains the operation carries, when
  any); `operation.retry: true` on a failed draft or removal that can be continued; operation codes
  `DOMAIN_NOT_ROUTED`, `DOMAIN_STILL_ROUTED` and `ROUTING_TARGET_CHANGED`.
- **Added to the custom domain in `PUT /api/sites/{key}/address`, `POST /api/sites/{key}/address/verify`
  and `addressChange` of `GET /api/sites/{key}/settings`:** `routing` (the CNAME record to create), `checks`
  (per record: what was expected, what the last lookup found, why nothing was, and when), `checkedAt`, and
  `addressChange.connected` (the custom domains the host carries). `readiness.routing` is now measured;
  `readiness.tls` stays `false`.
- **Added to `PUT /api/sites/{key}/address` and `GET /api/sites/{key}/address/availability`:** optional
  `kind` (`managed` · `custom`); refusals `DOMAIN_NOT_BARE`, `DOMAIN_TOO_LONG`, `DOMAIN_IS_TRACY`,
  `ADDRESS_NOT_TRACY` (400) and `DOMAIN_LIMIT` (409).
- **Changed `PUT /api/sites/{key}/address` for a custom domain:** the name must be the bare domain. A scheme,
  a port, a path, userinfo, an IP address, a wildcard or a name nobody can own is refused (400) instead of
  being cut down to a host name; a leading `www.` is kept as part of the name. A name under the Tracy site
  domain is read as before. A site holds one custom domain at a time.
- **Changed `POST /api/sites/{key}/go-live`:** `live` also connects the site's custom domain when DNS proves
  it at that moment, and `draft` disconnects it. A site with no custom domain behaves as before. The address
  doors and `DELETE /api/sites/{key}` answer 409 (`ADDRESS_CHANGE_BUSY`, `PUBLISH_BUSY`) while a publish, a
  draft or a domain removal holds the site.
- **Changed `POST /api/sites/{key}/state`:** the door no longer moves the publish flag. A body that names
  `publish` is refused with 409 `PUBLISH_BY_GO_LIVE`, whatever else it carries; `plan` is unchanged. The field
  stays in the request schema so a caller that still sends it reads why it is refused. Publishing and going back
  to draft are `POST /api/sites/{key}/go-live` only.
- **Changed `POST /api/sites/{key}/go-live`:** answers 202 with the job the host started; the site reads
  `published` only once that job has ended done (`GET /api/sites/{key}/state` → `operation`, `mayPublish`,
  `liveSince`). One operation per site at a time (409 `PUBLISH_BUSY`). A body that carries `domains` is refused
  with 400 `DOMAINS_NOT_SUPPORTED`, because a custom domain that DNS proves travels with `live` by itself; the
  field stays in the request schema so a caller that still sends it reads why. The 207 answer is gone.
  An operation whose ending the host has not said (no answer, a job the host no longer has, a job record
  without its script's exit code) keeps the site and is resolved the next time anyone reads the site —
  `GET /api/sites/{key}/state`, `GET /api/sites/{key}/settings` or its job — and in the background when
  nobody reads it.
  Every such read asks the host again for the same operation, whatever its age. An operation ends as
  refused (`BAD_REQUEST`, `NOT_FOUND`, `NOT_CONFIGURED`) only on the host's own refusal that also says the
  host never took that operation; any other error answer leaves it unconfirmed (504 `HOST_UNREACHABLE` on
  the press). The host says so from a durable mark it writes when it takes an operation, not from its job
  record: an operation it took whose record is since lost, damaged or unreadable is still "taken, outcome
  unknown", and a host that cannot look at the mark says neither — both leave the operation unconfirmed.
- **Changed `POST /api/sites/{key}/state`:** a body that carries any field beside `plan` is refused with 400
  `INVALID_REQUEST` (`reason: unknown field: …`) before anything is written.
- **Changed `GET /api/sites`:** an accepted seat's row carries `publish` (`draft` or `published`) and, while a
  publish or a return to draft is under way on the site, `publishing` (`live` or `draft`).
- **Changed `GET /api/sites/{key}/activity` with `version=2`:** every event gains `undone` — on a chat or comment
  turn the chat-turn undo took back, `{at, complete}` (`complete` false when only part of the turn went back),
  else null. Such a turn's `capabilities.canUndoFiles` is false with reason `undone`.
- **Added a `filter` value to `GET /api/sites/{key}/activity?version=2`:** `people`, every Source except
  `automatic` (the changes people made, themselves or through Tracy), applied before the page is cut. A cursor
  cut under `people` goes back only to `people`; `counts` are unchanged. V1 still refuses it (`400 INVALID_FILTER`).
- **Changed `POST /api/sites/brief/rewrite`:** it now always answers with text. An empty `text` is no longer a
  `400 BAD_TEXT`: it, and text that means nothing, get one sample sentence of about 10 words. New optional body
  fields `question` (the question being answered) and `again` (the text is the last rewrite, unedited: the answer
  keeps its length). The answer gains `mode` (`rewrite`, `sample` or `again`). No answer is longer than 50 words.
- **Added the turn undo doors:** `GET /api/sites/{key}/turns?session=` lists each turn of one chat on the site,
  what it changed (file moments by zone, content writes) and whether it can be undone, with the reasons when
  not; `POST /api/sites/{key}/turns/undo` undoes the latest turn (`scope: "turn"`) or goes back to before an
  older one (`scope: "from-here"`), files then content, newest first, after a preflight.
- **Added the AI Assistant doors**, all on the signed-in person's own account: `POST /api/assistant/turns`
  (a question, answered as `text/event-stream`), `GET /api/assistant/conversation` (the current conversation,
  `?after=<turn id>` for what came since), `POST /api/assistant/conversation/read` and
  `POST /api/assistant/conversation/clear`, `POST /api/assistant/handoff` and `POST /api/assistant/handoff/end`
  (hand the conversation to the Tracy team and back), and `GET /api/assistant/attachments/{id}` (a photo the
  team sent).

## 2026-10-05

- **Changed `GET /build-with-tracy-demo.js`:** the banner now shows only on a demo whose `data-template` is a
  template Design inspiration offers on the serving deployment (the ids of `GET /api/templates`, written into the
  script). Any other demo gets no banner, where before its button opened the gallery on no card. If the list
  cannot be read, the script draws as it did before. The tag and its attributes are unchanged.
- **Added `GET` and `POST /api/notifications/unsubscribe`:** the one-click unsubscribe of RFC 8058. Every
  notification mail whose group can be switched off now carries `List-Unsubscribe` and `List-Unsubscribe-Post`;
  the POST turns off the email switch of that letter's group only, by a signed token that names no address
  (90 days). The locked `join-requests` letters carry no header. The GET only offers the form.
- **Changed `POST /api/team/invite`:** each result may carry `inviteUrl`, the accept link of that person's
  invitation mail, in the inviter's answer only, so the link can be shared another way when the mail lands in
  Spam. It is present whenever a link was minted (also when the mail itself failed), works only for the invited
  address and for the same seven days, and is stored nowhere.

## 2026-10-04

- **Changed `POST /api/sites/{key}/comments/{id}/read`, `POST /api/sites/{key}/comments/{id}/unread` and
  `GET /api/sites/{key}/comments/reads`:** a read mark is now what the reader saw, not the server's time. `/read`
  takes `seenN` (the largest comment number of the other people's messages in the thread as shown) and answers
  `{read: {id, seenN}}`; `/reads` answers `{reads: [{id, seenN}]}`, `seenN: null` for "Mark as unread"; `readAt`
  is gone. The mark sits on the thread's first comment, is never lowered, and reading a thread also reads the
  caller's Inbox rows about the replies it covers.
- **Changed `GET /api/sites/{key}/activity/unseen`:** the badge now counts a Tracy deploy of its own plugin and
  automatic changes to the site's SOFTWARE (a plugin, theme, core or Joomla extension part installed, updated or
  removed by cron or a self-update); automatic content changes (cron posts, a catalogue sync, housekeeping) still
  do not count. Software rows of one CMS log and one account that follow each other within two seconds — one
  upgrade run, one extension install — count as one thing.
- **Changed `GET /api/sites/{key}/activity` with `version=2`:** the answer gains `unseenCount` (the badge's number
  for the caller at `readAt`, null while `seenBefore` is null) and every CMS event `unit` (its software grouping
  key, null on a content row).
- **Added `GET /api/sites/{key}/activity/unseen` and `PUT /api/sites/{key}/activity/seen`:** the Site changes
  badge — how many events of the Site changes list were recorded after the caller last looked (not the caller's
  own work through Tracy, nor automatic changes or Tracy deploys), and marking the list seen up to the moment it
  was read. The watermark is the caller's, per site, on the server; its first ask writes it at now and answers 0.
- **Changed `GET /api/sites/{key}/activity` with `version=2`:** the answer gains `readAt` and `seenBefore`, and
  every event `recordedAt` — when Tracy recorded it, as distinct from when it happened.
- **Added `GET /api/notifications`, `GET /api/notifications/unread`, `POST /api/notifications/{id}/read` and
  `POST /api/notifications/read-all`:** the signed-in person's Inbox (newest first, 50 per page, 90 days), its
  unread count, and marking rows read. Rows name the event (`kind`), the site, the actor and the facts the
  sentence needs (`data`); the words are the client's, in the reader's language.
- **Added `GET /api/notifications/preferences` and `PUT /api/notifications/preferences`:** the six notification
  groups with an Inbox and an Email switch each; the `join-requests` group is locked on.
- **`GET /api/notifications` rows carry `siteName`:** the site's address now (a deleted site keeps the name it had);
  `siteKey` never changes. `GET /api/notifications` and `GET /api/notifications/unread` take an optional `lang`, the
  interface language, stored as the language of notification email.
- **`GET /api/sites` invitation rows name the inviter by address when they have no display name** (`inviterName`).
- **Added `POST /api/sites/{key}/decline`, `GET /invite/{token}/decline` and `POST /invite/{token}/decline`:**
  decline a site invitation from My Sites or from its email link.
- **Added `GET /api/sites/{key}/comments/people`:** the people a comment can `@mention` (live seats on the site).
- **Added field `mentions` to `POST /api/sites/{key}/comments` and `PATCH /api/sites/{key}/comments/{id}`:** the account ids picked in the `@`
  picker; each person kept gets a `comment.mention` notification.
- **`POST /api/sites`**: the optional `brief` now also takes `answers` (an object of the answers by question id) and
  `questionnaire` (the `set.contentHash` the questions were served under). The Add site popup asks the questions of the
  site's own questionnaire (`GET /api/sites/questions`), so it sends the answers by question id; the server judges them
  against the set that was shown, drops an answer to a question the set does not hold or one its condition hides, and
  reads each by the feed its question names. The older `about`, `goal` and `style` are still read when no `answers` are
  sent.
- **`DELETE /api/sites/{key}/seats/{grant}`**: new optional body `{kind}` — `revoke`, `cancel_invite` or
  `decline_request` — naming which of the three removals the call is; each is stored and recorded as itself. The
  answer carries `kind` (`{revoked: true, kind, lanes?}`). A body, when sent, is exactly `{kind}`: new code 409
  `SEAT_STATE_CHANGED` (with the `kind` the row calls for now) when the named kind no longer matches the row or the
  seat's role changed between the read and the write, and 400 `INVALID_REQUEST` for a body without a known `kind`
  or with any other key (a body of whitespace only is such a body). A call with no body is answered as before, with the act read from the row; the document
  says so (`requestBody.required: false`, and `kind` required inside a body that is sent). A row the invitee
  declined now answers 404 `GRANT_UNKNOWN` (it was revoked before, to no effect). `GET /api/team` rows carry
  `removalKind` (`null` on a live row and on a row removed before this date).
- **`PATCH /api/sites/{key}/seats/{grant}`**: new code 409 `SEAT_STATE_CHANGED` when the seat's role was changed by
  somebody else between the read and the write; the role is not overwritten.

## 2026-10-03

- **Changed in `v1`, without a new version: `POST /api/sites/{key}/restore` with `mode: "everything"` is confirmed
  by `confirm: "restore"` (the word, any case), no longer by `confirmSiteKey` (the site key typed in full).**
  `confirmSiteKey` is gone, with no alias; codes `CONFIRM_SITE_KEY_REQUIRED` and `CONFIRM_SITE_KEY_MISMATCH` are now
  `CONFIRM_REQUIRED` and `CONFIRM_MISMATCH`. The same exception as the rename below: no caller outside Tracy's own
  dialog yet (Brian, 03/10/2026).
- **Renamed in `v1`, without a new version: `GET /api/sites/{key}/releases` is now `GET /api/sites/{key}/backups`,
  and `POST /api/sites/{key}/release` is now `POST /api/sites/{key}/backup`.** This is an exception to the rule above
  ("removing something … is a new version"): no customer had called either door yet, so there was nobody to keep a
  `v2` for (Brian, 03/10/2026). The old paths are gone, with no alias. The rows of `/backups` say `kind: "backup"`
  (was `"release"`), and its answer now documents `may` (`{restoreFiles, restoreEverything}`, already returned since
  02/10). `POST /backup` answers `{ok, version, title, sha, database}`: `ledger` and `releaseUrl`, always `null`, are
  removed. The tag a backup stands on keeps its name, `tracy-release/v<N>`. `GET /api/sites/{key}/changes` and
  `GET /api/sites/{key}/file-diff` now say "since the last backup" for the same point as before.
- Added `POST /api/sites/brief/rewrite`: says a person's one-sentence description of their business again in clearer
  words, keeping its meaning and never more than 10 words longer than the original; `{text, words, sourceWords}`,
  with `400 BAD_TEXT`, `429 RATE_LIMITED` and `502 MODEL_FAILED` / `REWRITE_UNUSABLE`.
- **`POST /api/sites`**: new optional body field `brief` — `{about, goal, style}`, all optional — the Add site popup's
  answers. A site created with a brief gets its text and pictures written while it installs: the job poll
  (`GET /api/sites/{key}/jobs/{id}`) answers `running` with a `step` naming the text and pictures until they are in, then
  `done`. Without `brief` the site is created exactly as before.

## 2026-10-02

- **Backups (ADR 0024).** `GET /api/sites/{key}/releases`: each release row carries `database`
  (`{state, engine, sha256, size, reason?}` — `full`, `missing`, `none` or `unknown-host`) and
  `auto: "pre-restore"` on a backup the host made itself; `POST /api/sites/{key}/release` answers
  `database` for the new point. `POST /api/sites/{key}/restore`: new `mode: "everything"` with
  `version` and `confirmSiteKey` — files and database back to a `full` backup; `sha` is no longer
  required for that mode; new codes `INVALID_VERSION`, `CONFIRM_SITE_KEY_REQUIRED`,
  `CONFIRM_SITE_KEY_MISMATCH`, `BACKUP_UNKNOWN`, `BACKUP_NOT_FULL`, `RESTORE_REFUSED`.
- **`GET /api/sites/{key}/activity`** with `version=2`: Source `cms-admin` now covers every change
  the CMS's own log records under a signed-in CMS account (admin screen or API — the log does not
  say which); such rows were `unknown` before. A CMS change with no account stays `unknown`, a
  WordPress cron change stays `automatic`.
- **`POST /api/sites/{key}/moment`**: new optional body fields `reply` and `replyState` (with
  `turnId`) — Tracy's answer for the turn, stored cut to 2000 characters; 400 `INVALID_REPLY`.
  **`GET /api/sites/{key}/activity`** with `version=2`: each event carries `reply` — `{text, state}`
  for a turn whose answer was kept, `null` otherwise.
- **`GET /api/sites/{key}/activity`**: new optional parameter `version`. `version=2` answers Site
  changes V2 — `schemaVersion: 2`, one event per recorded change with its Source (`chat`, `comment`,
  `cms-admin`, `automatic`, `deployment`, `site-changes`, `unknown`), the actor, the effects
  (content, settings, files — counted separately), the original request and its completeness, the
  reversal state and the evidence references; `filter` then takes `all` or one Source, `counts`
  carries one number per Source plus `complete` and `reasons`, and the cursor is bound to the
  version and filter it was cut for. Without `version=2` the answer is unchanged.
- **`GET /api/sites/{key}/activity`** with `version=2`: each event carries `conversation` —
  `{sessionId, turn, promptMessageId, mine}` for a chat or comment turn (the chat it came from, and
  whether the caller typed it), `null` for every other event.
- **`POST /api/sites/{key}/restore`**: new optional body field `idemKey` — the same key retried
  answers the same operation, and the restore never runs twice. The answer carries `operationId`
  and `status` (`succeeded`, `succeeded_noop`, `failed`, `unknown`); an answer lost in transit is
  settled from the job later instead of being reported as "nothing changed".
- Added `GET /api/sites/{key}/moments/{sha}/undo-scope`: what an undo of that moment would really
  revert — `{files, complete, truncatedList}` from the same computation the restore runs, counting
  past the 500-file listing cap and the files the history listing hides.
- **`PATCH /v1/sites/{key}/records/{kind}/{id}`** honours `If-Match` (new `If-Match` header parameter): one tag `"<body_revision>"` (weak `W/` accepted) writes only over that body of a WordPress `post`, `templatePart` or `template` on Claude Cowork plugin 0.17.0+. Tracy reads the record first: changed since → `409 REVISION_STALE` with the current `body_revision` and its `ETag`, nothing written; equal → written with `expected_body_revision`, which the plugin checks again (a write that landed in between is `409 REVISION_STALE` too). A site that answers no `body_revision` (Joomla, a kind without a body, an older plugin) → `400 IF_MATCH_NOT_SUPPORTED`, nothing written. `*`, a list or any other form → `400 INVALID_REQUEST`. A success answers `ETag: "<new body_revision>"`. Without `If-Match` nothing changes; `DELETE` still refuses `If-Match`.
- **`GET /v1/sites/{key}/records/{kind}/{id}`**: answers `ETag: "<body_revision>"` when the record carries one, and takes `If-None-Match` (new header parameter) → `304` while the body is unchanged.
- **`GET /api/sites/{key}/moments/{sha}/files`**: a file the site history no longer records (a CMS cache an older moment still holds) carries `excluded: true`. **`GET /api/sites/{key}/activity`**: a chat turn or an outside row whose files were all such caches is no longer listed (a turn that also wrote content stays, with no files), and `files.count` leaves those files out.
- **`GET /api/sites/{key}/moments/{sha}/files`** answers `truncated` (true when the moment touched more than the 500 files listed). **`GET /api/sites/{key}/activity`**: `counts.chat` counts chat turns only (an undo or reset from the tab stays in `all`); `undo.reason` gains `forbidden` (the caller's role may not change files); `coverage.fileHistory` (false on EmDash sites) and `coverage.cmsLog.limits` (what the CMS's own log does not record — EmDash: `menus`, `settings`, `media`) are added; **`GET /api/sites/{key}/cms-log`** carries `coverage.cmsLog.limits` too.
- Added `GET /api/sites/{key}/activity`: the Site changes list, one row per chat turn that changed the site (who typed it, the words, the files changed and the content written in that turn), with changes made outside Tracy in between (files, including a Tracy deploy, and CMS admin edits). Parameters `cursor`, `limit`, `filter` (`all`, `chat`, `outside`); `counts` over the whole list; `coverage` of the file history and the CMS admin log. Content writes carry field names, never values.
- Added optional parameter `sha` to `GET /api/sites/{key}/file-diff`: the diff of the file in that one moment instead of since the last release; the answer echoes `sha`. A malformed value is `400 INVALID_SHA`.
- **`GET /api/sites/{key}/changes`**: each moment carries `turn` (the chat turn it belongs to, or null), and the answer carries `truncated: {moments, files}` once the 200-moment or 500-file ceiling is reached. **`GET /api/sites/{key}/releases`** answers `truncated` too. **`POST /api/sites/{key}/apply`** reads the optional `x-tracy-turn` header (`<session id>:<turn number>`) from dsh; a malformed value is ignored.
- **WordPress Claude Cowork plugin 0.17.0** (`POST /api/sites/{site}/apply`, the plugin reference `/docs/api/claude-cowork.json`): `content.get` of a `post`, `templatePart` or `template` answers `body_revision` (sha256 of the body a write replaces); **`content.update`** takes the new optional `expected_body_revision` — nothing is written when the body changed since that read, and the answer is the new plugin refusal `revision_stale` with the current `body_revision`; **`content.list`** and **`content.get`** take `kind: "pattern"` (registered block patterns, read-only), and `content.list` the new optional `category` (`kind: "pattern"` only). Older plugins ignore `expected_body_revision` and refuse the `pattern` list.
- **`GET /v1/sites/{key}/records/{kind}`**: `pattern` documented as a listable WordPress kind (plugin 0.17.0+), and the new optional `category` query parameter. (`If-Match` on the record `PATCH`: the first line of this date.)

## 2026-10-01

- Added `GET /api/sites/{key}/cms-log`: edits people made in the site's own CMS admin (WordPress, Joomla, EmDash) outside Tracy, newest first — CMS user, resource, operation, time — with `coverage.cmsLog` saying whether the CMS keeps that log. No field values.
- Added `POST /api/sites/{key}/cms-log/pull`: read the CMS admin log now instead of waiting for the next scheduled read.
- Added `GET /api/sites/{key}/moments/{sha}/files`: the files one moment touched, each with its status (added, modified, deleted) and lines added/removed. Used by the Site changes tab when a row is opened.
- Added `GET /api/beta/waitlist` and `POST /api/beta/waitlist` for the landing early access form. Both use the signed email link's Bearer token, without a Tracy session. GET returns its email; POST validates and upserts the request without granting access. CORS permits the configured landing origin.

## 2026-09-30

- **`content.list`** (`POST /api/sites/{site}/apply`) and **`GET /v1/sites/{key}/records/{kind}`**: new
  optional parameter `search` (added; `?search=` on the records route) — keeps the records whose title
  holds the text (Joomla: title or alias; WordPress: title or slug, in every language), ignoring case, at
  most 200 characters, one piece of text rather than words. Read by Joomla plugin 0.20.0 and WordPress
  plugin 0.16.0 and later; on an older plugin the call is refused `501 LIST_SEARCH_UNSUPPORTED` (added
  earlier today, below) and returns no rows. The answer carries `search` (the text as cleaned) and
  `matched` (every match, whatever `offset` and `limit` are). A blank value filters nothing. Kinds with no
  title are refused `bad_params` (`400 BAD_PARAMS` on `/v1`).
- **`/v1` refusals that carry a sentence** (changed): `SITE_BUSY` (`409`, on the write routes — `PATCH` and
  `DELETE /v1/sites/{key}/records/{kind}/{id}`, `POST /v1/sites/{key}/contract/{operation}` with `apply`,
  `POST /v1/sites/{key}/applies/{id}/revert` — when another key or chat holds the site) and
  `LIST_SEARCH_UNSUPPORTED` (`501`, `GET /v1/sites/{key}/records/{kind}` with `?search=`) now answer
  `{ "error": { "code", "message" } }` as this reference has always described: the sentence is
  `error.message`, beside `error.code`. Before, `error` was the bare sentence and the code was lost —
  `SITE_BUSY` since `/v1` opened, `LIST_SEARCH_UNSUPPORTED` since earlier today. What `SITE_BUSY` says
  about the hold (`holder`, `holderIsYou`, `aheadOfYou`, `freeInSeconds`, `next`) is unchanged, at the top
  level. A caller that read `error` as a string for either code reads `error.message` now.
- **`POST /signin/approve`** (added) — approves a dsh sign-in round from the page `GET /signin`
  shows. **`GET /signin`** (changed): opening it no longer approves the round; it shows which address
  would be signed in and one button that posts here. The post is refused `403` unless its `Origin` is
  Tracy's own, `401` without a session, `400` for a round that is unknown, expired or already approved.
- **`POST /login`**: new refusal `429 RATE_LIMITED` (added) — sign-in codes mailed per hour are capped
  per address and per client address. No code is written or mailed when refused; a form post gets the
  sign-in page with a message instead of JSON.
- **`content.list`** (`POST /api/sites/{site}/apply`): new refusal code `LIST_SEARCH_UNSUPPORTED` (added,
  `501`) — a call that carried a `search` key reached a Claude Cowork plugin that does not read it. The
  relay refuses and returns no rows, instead of handing back the whole list as if it were filtered.
  (`search` itself is documented in the entry above.)
- **`POST /api/sites`**: new optional body field `brandFrom` (added) — with a brand design
  (`brand:<host>`), the site whose `Brand/<host>/` folder the new site takes its brand from. The
  caller must hold a seat on that site, or the request is refused `403 SEAT_NOT_AUTHORIZED` before
  anything is created.

## 2026-09-29

- **Refusal code** `COMMENT_NOT_IN_FLIGHT` (added, `POST /api/sites/{key}/apply`): a call naming
  `comment` beside `action` whose numbers are not comments the caller sent on this site in the last
  two hours; it names `comment`, `toolset` and `role`. A seat key never answers a comment, so a key
  caller does not meet it.
- **`/v1` error statuses** (changed): a site that failed while doing the call (plugin `<verb>_failed`,
  `fatal`) answers `500` (was `502`); a site that did not answer (`COMPONENT_UNREACHABLE`,
  `COMPONENT_BAD_RESPONSE`) answers `503` (was `502`). Same JSON body. The API host answers through
  Cloudflare, which replaced every `502` body with its own page, so a caller could not read the
  error at all; no caller could have depended on the old status.
- **`Tracy-Apply-Id` response header** on `PATCH` and `DELETE /v1/sites/{key}/records/{kind}/{id}`
  and `POST /v1/sites/{key}/contract/{operation}` (added): the apply id the write is recorded under —
  the one sent, or the one Tracy made. Before, a write that sent none could not be undone, since
  nothing named the id Tracy made.
- **`GET /api/sites`**: each site now carries `createdAt` (added), the ISO time the site was
  created, or `null` when the site row could not be read.
- **`GET /v1/sites/{key}/design`** (added) — the design system the site wears: `id`, `name`,
  `source` (`catalog`, `brand`, `quickstart`, `template`, `none`), `platform`, `tokens` (CSS custom
  property → value), `tokensFrom`, `updatedAt`; `{"design": null}` when the site wears no system
  Tracy knows of. Reads Tracy's own record, rewritten when `theme.style` switches the look; needs
  the `content` scope; ETag follows `updatedAt`. New schema `V1Design`.
- **`content.contract`** (`POST /api/sites/{site}/apply`): new operations `string` (added, WordPress:
  override one gettext string, `domain`, `msgid`, `context?`, `locale`, `value`, `apply_id`, undone by
  `apply.revert`) and `derive` (added to the plugin's surface, refused at the Apply door with the new
  door code `CONTRACT_OPERATION_PROVISION_ONLY`); a write to an imported site's derived slot may carry
  a `WRITTEN_NOT_VISIBLE` warning and be refused with the new plugin code `SLOT_UNWRITABLE`.
- **`content.update` / `content.batch`** (`POST /api/sites/{site}/apply`): new Joomla kind
  `fieldValue` (added) — one stored custom-field value (a text, textarea, editor or media field
  holding one row), `id` = field_id × 1000000000 + item_id.
- **Describe document** (`GET /v1/sites/{key}`, `content.read { describe: true }`): new optional
  `where` (added) — where a site keeps its SEO, design, menus, forms, analytics, robots file,
  language strings, redirects and how to add a page, and which call changes each, per quickstart
  release, every entry with the proof it was read from. Present only for releases Tracy has verified.
- **Page rows** (`GET /v1/sites/{key}/pages`, `content.read { view: "pages" }`): new optional
  `alternates` on a page row (added) — the same page in the other languages, only when the walk
  listed every language.
- **`next`** on a content field (changed): on an EmDash site it can now name a `tracy_emdash
  content_update` call for a writable field, beside the `tracy_site content.contract` apply call it
  named before. The existing shape is unchanged.

## 2026-09-28

- **Documentation site** at `GET /docs` and `GET /docs/*` (added): overview, quickstart,
  authentication, concepts, one guide per CMS, the errors and compatibility tables (generated from
  the reference), this changelog, and the OpenAPI reference embedded. Served on every hostname;
  `/docs/api` and `/docs/api/*` stay the OpenAPI reference. On the API host `GET /` now answers
  `302` to `/docs/` (changed: it answered `{ name, docs, openapi }` earlier the same day).
- **REST layer `/v1` on the api host** (`API_ORIGIN`; Bearer seat key only): added `GET /v1/me`,
  `GET /v1/sites/{key}` (describe), `GET /v1/sites/{key}/pages`, `GET /v1/sites/{key}/contents`,
  `GET /v1/sites/{key}/contents/{id}`, `GET /v1/sites/{key}/changes`,
  `GET /v1/sites/{key}/records/{kind}`, `GET|PATCH|DELETE /v1/sites/{key}/records/{kind}/{id}`,
  `POST /v1/sites/{key}/contract/{operation}`, `GET /v1/sites/{key}/applies`,
  `GET /v1/sites/{key}/applies/{id}` and `POST /v1/sites/{key}/applies/{id}/revert` — each a thin
  alias of one Apply action through the same door. Answers carry `X-Tracy-Api-Version: v1`; content
  reads carry an `ETag` and take `If-None-Match` (→ `304`); `If-Match` (`"<contentId>:<revision>"`
  tags) is honoured on `contract/apply` only; `Idempotency-Key` on the contract route only;
  `Tracy-Apply-Id` names the receipt of a records write (required on `DELETE`). A plugin refusal is
  no longer a `200` there: it gets an HTTP status by its `error` word (400 · 403 · 404 · 409 · 413 ·
  422 · 501 · 502; `REVISION_STALE` → 409) and the shape `{ error: { code, message }, errors, next }`.
  New refusals in the door table: `APPLY_ID_REQUIRED`, `IF_MATCH_NOT_SUPPORTED`,
  `IDEMPOTENCY_KEY_NOT_SUPPORTED` (400). New security scheme `bearer`. On the api host
  `/docs/api/openapi.json` and `/docs/api/llms.txt` describe `/v1` alone, with that host as server.
- **Seat keys** (`Authorization: Bearer trk_<id>.<secret>`): added `GET /api/me/keys`,
  `POST /api/me/keys` and `DELETE /api/me/keys/{id}` on the cowork host — a person with a live seat
  mints a key bound to their account and one site, with `scopes` inside the seat's toolsets; revoke is
  permanent. `POST /api/sites/{key}/apply` accepts such a key **on the api host only** (no cookie, no
  actor there); the seat's toolsets are intersected with the key's scopes on every call. New refusals
  in the door table: `KEY_INVALID`, `KEY_REVOKED`, `KEY_EXPIRED` (401), `API_KEYS_NOT_CONFIGURED`
  (503), `RATE_LIMITED` (429, with `Retry-After`; 600 changing calls or 6000 reads per key per hour).
- **API host** (`API_ORIGIN`, e.g. `https://api.tracy.ai`): one more hostname the service answers
  on. There, `GET /` answers `{ name: "Tracy API", docs, openapi }` (added), `/docs/*`, `/v1/*`,
  `/.well-known/*` and `/health` are served, and every other path answers `404 NOT_ON_THIS_HOST`.
  The API host reads no session cookie. Nothing changes on the other hostnames.
- **`content.read {view: "pages"}`** answers within the 256 KiB budget: a larger list is cut at
  whole pages with `truncated: true`, and the new field `next` (schema `readCall`) names the
  narrower read — one `locale`, or one `type` through the listing. The `later` field (the
  `changedSince` read) is now documented in the `pages` schema as well.
- **Public reference published** at `/docs/api` (API version `v1`), with its OpenAPI 3.1 document at
  `/docs/api/openapi.json`. It lists these operations:
  - **Sites** (29): creating, building, releasing, restoring, publishing and deleting a site, its
    address and settings, and the Apply door `POST /api/sites/{key}/apply`.
  - **Accounts & seats** (32): sign-in (email code, Google, GitHub), sessions, site teams and seats,
    invitations, workspaces and their members.
  - **Platform** (17): health, public configuration, the badge scripts, the API reference itself,
    the Design inspiration page, join requests and site mail settings.
- **Apply door actions** (33), each with the toolset it needs and the plugin versions that answer
  it: `info`, `content.list`, `content.get`, `content.read`, `content.update`, `content.delete`,
  `content.batch`, `content.contract`, `content.language`, `content.locate`, `media.upload`,
  `apply.list`, `apply.revert`, `core.manifest`, `core.upgrade`, `extension.list`,
  `extension.install`, `extension.enable`, `plugin.list`, `plugin.install`, `plugin.activate`,
  `theme.list`, `theme.install`, `theme.activate`, `theme.style`, `language.install`, `db.tables`,
  `db.dump`, `db.snapshot`, `db.rollback`, `db.cleanup`, `db.restore`, `db.purge`.
- **One page per action**: `POST /api/sites/{key}/apply/{action}` is the same door with the action
  in the path and its `params` as the body, listed once per action and grouped as Apply · Content
  API, Contract, Records, Undo, Database and Software.
- **`content.read`** answers the Content API documents (`envelope`, `describe`, `pages`,
  `changes`, `notModified`) with typed parameters (`ContentReadParams`).
- **Refusals** are documented as tables: Tracy's own (`DoorRefusal`), `content.read`'s, and the
  site's answers passed through (`PluginAnswer`).
- An internal reference for Tracy staff (`/ops/api`) lists every route the service answers; it is
  not part of this public API and not covered by this changelog.

- 18 October 2026 — PR #1426 adds internal GET/POST `/api/ops/speech/providers/:provider/models`: independent metadata caches, server-only credentials, and no inference or selection/revision changes. Models incompatible with the STT/TTS transport are rejected; VoiceStudio ASR is read-only. Public API v1 is unchanged.
- 28 October 2026 — adds internal GET `/api/ops/wo/revisions/:revId/labels`, `/api/ops/wo/places/:id/briefs` and `/api/ops/wo/revisions/:revId/assets/:assetId/image` (staff read of a brief revision's photo labels, links and readiness). Public API v1 is unchanged.
