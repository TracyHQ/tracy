---
description: A customer site is bound to a named design system — the profile contract names the system, the site folder records the system it currently wears, the agent is instructed by token name, the output is inspected by value in Chrome and only receives warnings; learned from how Claude Design attaches a system to a project
sources:
  - apps/tracy-web/src/lib/contracts.js
  - scripts/lib/contract-design.mjs
  - apps/tracy-web/src/lib/quickstart-releases.js
  - packages/site/tracy-site-build-core/src/host/stages-shared.mjs
  - packages/tools/tracy-site-tools/src/host/site-context.mjs
  - packages/tools/tracy-site-tools/src/host/length-advice.mjs
  - packages/tools/tracy-site-tools/src/host/design-drift.mjs
---

# 0023 — A site is bound to a named design system

**Status:** (binding) · 29/09/2026 · Lee decided, Claude wrote. Adds to, does not replace, [ADR 0022](0022-quickstart-contract-is-advice.md).

## Context

Until 29/09/2026 a Tracy customer site **did not know which design system it was wearing**. The quickstart card
(`tracy_design_inspiration.json`) describes the look but does not name the system; the content contract only has text
and image slots; T4 compiles tokens into `template.css`, so the running site keeps no trace of the tokens; the
WordPress theme carries all 154 variations but the site keeps only one option name. The rule "no hex outside the
palette" lives in three places of prose and no machine checks it — the seeder itself injects `#ddd` and raw px. The brand
engine can extract the customer's system, but both build doors refuse `brand:`.

Claude Design (measured on the Broadsheet project and their app bundle) does it differently on four layers, **all generated
from the system's files**: the project *attaches* a system; the context carries a binding sentence and the token list; lint
rules are generated from `tokens.css` and the components; and the model must call `ready_for_verification`, the client
inspects and returns findings as a *soft nudge* so the model fixes them itself. Every rule is `warn`, none blocks.

## Decision

1. **The binding source is the profile contract.** Each profile carries `<version>.design.json` next to its **folder**
   (`contracts/tracy-apple/j6/1.3.0.design.json`): `{"design": {"id": "<catalog id>", "source":
   "catalog"}}` or `{"design": null}` — null is an answer, a missing file is an error. The `contracts` gate
   requires the file and checks the id against `vendor/tracy/od-design-system/catalog.json`. The release card does **not**
   carry the system id; tracy-web joins it into the card row at read time (`templateCards`), so there is nothing on GitHub
   to drift from the repo.
   - Not written into `manifest.json`: the Claude Cowork plugin pins the manifest hash byte for byte.
   - Not kept inside the profile folder: every `.json` of a profile is served as part of the plugin package and
     must be pinned in `design-templates.json`. Both were measured red right away on 29/09.
2. **The site folder records the system it wears**: `docs/agents/design.json` (`tracy-site-design/v1`), written by the
   `check` stage of all three build paths, containing the id, the source (`catalog | brand | template | none`), the platform,
   and **the values of the 56 tokens** frozen at build time (T4 keeps no tokens at runtime, so the yardstick has to be here).
   A successful skin change through `theme.style` rewrites it. Site = layout × system
   (`tasks/todo-catalog-cai-tu-release.md` decision 3): the system worn may differ from the system the profile names.
3. **Context with teeth, but names only.** `site-context.mjs` adds exactly one line when `design.json`
   exists: the binding sentence, the names of the 56 tokens grouped, how they appear on each CMS, and an instruction to call
   `tracy_design_check` before telling the customer it is done. No values in the context — "addresses,
   never values" of that very file.
4. **Inspect by value, in Chrome.** The compliance check measures the computed `color` / `background-color` /
   `border-*-color` / `font-family` of elements on the built page and compares them with the system's palette; it does not
   inspect `var()` names (T4 is compiled, EmDash is Tailwind). One engine, two exposures: `facts` in the `shot` stage
   and the `tracy_design_check` tool the agent can call.
5. **Only warnings, never refusal** (ADR 0022). The pattern is `LENGTH_RATIO`: `warnings:[{code…}]`
   + `next` on an `ok:true` answer. No new refusal codes.

## Consequences

- Whoever adds a profile contract must add `<version>.design.json`; whoever reads `GET /api/templates` sees `design`.
- The yardstick is `design.json.tokens` frozen at build time: changing the skin without rewriting it means a drifted yardstick —
  which is why `site-call` rewrites it after `theme.style`.
- False positives (admin bar, third-party embeds, faded colours) are handled with the `near` and `allow` bands, not
  by blocking.
- Brand on WordPress needs the theme to read variations outside the theme folder (`uploads/tracy/styles/`) and the
  Claude Cowork plugin to accept `variation` — two repos, two releases; recorded in `tasks/todo-he-thiet-ke-site-khach.md`.

## Addendum 29/09/2026 — brand on WordPress (PR 7–8)

- The `tracy` theme reads variations in two places: the theme's `styles/<id>.json`, then
  `wp-content/uploads/tracy/styles/<id>.json`; catalogue = the theme's `inspirations.json` merged with
  `uploads/tracy/inspirations.json` (`inc/variations.php`). Uploads rather than the theme folder because
  a theme update replaces the whole folder; a file rather than an option because `?style=`, the cookie and `tracy_site_inspiration`
  stay unchanged.
- The variation generator is the library `@tracy/wordpress-theme/variation` (`tokensOf`, `variationOf`): the
  Build WordPress plugin makes the brand's variation at build time from `Brand/<host>/tokens.css` with exactly the code that bakes the 154
  variations, and sends it along with `theme.style {style: brand-<host>, variation, meta}`; the Claude Cowork plugin writes it
  under uploads and then wears it. A plugin that does not yet accept `variation` answers as before (`the theme has no styles/…`) and
  the `style` stage repeats that sentence — it degrades to today's behaviour, it does not break.
- `check` no longer refuses `brand:`; the seeder reads the brand from `--system-dir <site>/Brand/<host>`; the brand engine
  also outputs `USAGE.md` and `components.manifest.json` so that a brand is a system like the other 154.
- Joomla T4 and EmDash do not take this path yet (T4 compiles tokens at build; EmDash edits `/app` + rebuild).

## Addendum 29/09/2026 — the `quickstart` source (Tracy Business)

- Sites built from `tracy-business` used to be reported "none bound" because its look is not in the catalogue.
  Now the profile's design file accepts `source: "quickstart"`:
  `{id: "tracy-business", source: "quickstart", name: "Tracy Business", tokensFrom: <the theme's token file>}`
  and a `tokens` key with the 56 `TOKEN_NAMES` with every `var()` resolved.
- Each CMS takes its tokens from its own theme: Joomla from
  `template-patches/tracy_business/css/styles/tracy-business.css` (resolving the `var(--tb-*)`),
  WordPress from the overlay `wp-tracy-business/tokens.css`. The two sets differ in 40/56 values, so
  one shared set is not used.
- The tokens live INSIDE the design file because both images carry the contract tree but neither image carries
  the theme's token file. `scripts/build-quickstart-design.mjs` generates them; the `contracts` gate compares them back
  with the theme (`quickstartTokens` in `scripts/lib/contract-design.mjs`), so no new gate is needed.
- tracy-web reads both `name` and `tokens` (`readContracts`), the design plan carries them to the job
  (`designPlanOf` blocks unknown shapes and caps at 120 tokens), `designRecord` writes straight from the plan with
  `source: "quickstart"`. `GET /api/templates` exposes only `{id, source}`.
- Still waiting on #606 (the original copy in tracy-web): the generated token map and the `site_design` table do not yet know the
  `quickstart` source. Until then Business's original copy lives only in `docs/agents/design.json`.

## Addendum 29/09/2026 — `tracy_design_check` on Joomla: use dsh's browser

- **Problem.** The tool runs Chromium INSIDE the site's web container (ADR 0014). WordPress sites
  (`tracy/web-wordpress`) have a browser; Joomla sites run the stock image `joomla:6-apache` — no node,
  no chromium — so on Joomla the tool always returns `DESIGN_CHECK_SKIPPED`.
- **Chosen: when the site has no browser, use dsh's browser** (`/usr/local/bin/tracy-chrome`,
  the very one the `shot` stage uses to inspect styles). Lee: "if it's missing, install it, wherever makes sense for us or for
  the customer".
- **Why not install Chromium into the Joomla site:** it adds ~500 MB to EVERY customer site (measured in `tracy/web-wordpress`: `/usr/lib/chromium` 374 MB + node 117 MB, not counting bundled libraries), on
  an image Tracy does not build (the stock image `joomla:6-apache`); installing into the running container is lost the next time
  compose recreates the container. dsh already has a Chromium — no customer image grows.
- **Why not let dsh's Chrome call `<label>-web-1` directly:** on the fleet host dsh is NOT on the site's
  network (`host-dsh.yml`: only `docker-api` + `egress`), and should not be: dsh sits next to the docker
  socket proxy. So in host mode dsh's Chrome **makes no connections of its own anywhere**: no name resolves
  (`MAP * ~NOTFOUND`), every connection (bare IP, WebSocket — two things Fetch cannot block) goes into a proxy
  nobody listens on, page scripts are off. The documents and stylesheets of that one site are fetched by the `curl`
  inside the site container itself over its own loopback (`docker exec -u www-data <label>-web-1 curl …`) — the path
  `page.text` already takes. Addresses and origin stay as they are inside the container, so the off-site guard compares against
  the same origin; requests to another origin are aborted, not let through.
- **The cost:** the page is measured with scripts OFF (colours/fonts computed from CSS; classes added by JS are not counted) — in exchange
  the customer's code does not run inside dsh. The answer records `browser: "host"` per page. dsh's Chromium
  runs `--no-sandbox` (the image's wrapper), so turning scripts off is the main layer of protection.
- Code: `measurePage` (`design-check-tool.mjs`), `hostBrowserTarget`/`hostBrowserCommand`/`hostBrowserExec`
  and the host mode of `BROWSER_SCRIPT` (`exec.mjs`). Evidence:
  `tasks/evidence/design-check/2026-09-29-joomla-tool.json`.

## Addendum 30/09 — the tool's score (host mode) and the `shot` stage's score differ, on purpose

- **What was measured.** Site `dfinj1` (`tracy-business/j6`, page `/en/`, private stand `dsgnm`, 29/09): the `shot` stage
  scores **88**, 785 samples (332 elements); `tracy_design_check` (`browser: "host"`) scores **84**, 626
  samples (263 elements). The drift lists are **identical** (1 off + 93 near, same values, same places).
- **Cause: scripts off, not missing resources.** Opening the same page in Chrome in four modes
  (build-core's `STYLE_PROBE` probe, viewport 1280×800): scripts on → 332 elements; scripts off, document + CSS only
  (like host mode) → 263; scripts off but all resources (fonts, images) → still 263;
  scripts on but fonts and images blocked → still 332. No font, image or stylesheet is missing in host mode
  (all 6 same-origin stylesheets are fetched by `curl` in the container). The 69-element difference is what T4's scripts
  build: the off-canvas menu (`#off-canvas-right`, a second brand block, the `li.nav-item`s), 6 `a.dropdown-item`,
  and `#tracy-badge` inserted by `badge.js` — all on the palette, so only the denominator grows.
- **Chosen: keep it as is, say so.** Turning scripts on in dsh would drop exactly the main protection layer of host mode (see the section
  above). The tool's answer carries a `note` (`SCRIPTS_OFF_NOTE`, `design-check-tool.mjs`) whenever a page
  was measured in host mode, and the tool description says so: compare the **warnings**, not the two numbers.
- Evidence: `tasks/evidence/design-check/2026-09-30-host-vs-shot-dfinj1.json`.

## Addendum 30/09/2026 — a look-changing turn returns system-drift warnings by itself (Lee: "do it now")

- **Problem.** Until 30/09 the agent was only TOLD (one sentence in `designLine`) to call `tracy_design_check` before reporting
  done; DeepSeek could skip it. Claude Design does not leave it to the model's memory: `ready_for_verification` returns findings that must
  be read. Now the change turn itself returns the measurement — the same engine (`measurePage` → `judge` → `checkNext`, record
  `docs/agents/design.json` pulled from tracy-web), no second copy: `measureSitePage` in `index.ts` is the ONLY
  measuring path, the tool and the write turn both call it.
- **Two ways in, one pattern.** (1) A `tracy_site` write turn that may change the look (`lookWrite`, an explicit list with
  tests): `theme.style`; `content.update`/`content.batch` into look surfaces (`wp_global_styles`, `wp_template`,
  `wp_template_part`, `custom_css`, Joomla `templateStyle`); and other records ONLY when they carry a hard-coded colour or font
  (hex, `rgb()`/`hsl()`/`oklch()`…, `font-family:`). Presets (`"backgroundColor":"primary"`, `var:preset|…`) are
  the system's palette itself and so cannot drift — writing text, titles, images, options is not measured. Not measured: `content.contract`,
  `content.replace`, `media.*`, deletes, translations, `apply.revert`, `theme.activate`/install (a different theme is not the system the record
  names). Page measured: a WordPress post `/?p=<id>` (`/?page_id=` when the previous read said it is a `page`), a Joomla article
  `index.php?option=com_content&view=article&id=<id>`, otherwise `/`. The result is attached to the `ok:true` answer: `warnings`
  (`OFF_PALETTE_COLOR {prop, props?, value, band, nearest, count, where}` / `OFF_SYSTEM_FONT {family, count, where}`,
  merged with `LENGTH_RATIO` if present), `designCheck: "measured"|"skipped"`, `designScore`, `designPage`, `designMs`,
  `designExisting`, `designWhy`; the `next` from `checkNext` replaces the generic receipt sentence (keeping the `apply.revert` clause) or is appended after
  the write turn's own `next`. (2) **Measuring on a stand showed that most look changes do NOT go through the write door**: `dfinwp1`,
  "hero button to #ff00ff" — the agent tried block attributes via `tracy_site` (WordPress 7.1 does not paint the button block's colour),
  reverted, then edited `sections.css` with the `edit`/`bash` tool. So a successful `edit`/`write`/`bash` turn that writes a look file
  (`.css/.scss/.less`, `theme.json`, `styles/*.json`, `tools/t4-scss.php`) or `tracy_site_build_emdash site.rebuild`
  is recorded at `tools/result` (`lookEdit`), and the `/` page is measured BEFORE the model's next step, the result
  arriving as a notice (`tracy-site-tools:design-drift`, `driftNotice`). A `tracy_design_check` called by the agent afterwards
  clears the pending measurement.
- **Only what is new.** The site already has drift the agent did not cause (seeder `#ddd`, 93 near on T4) — repeating it after every write
  is the wrong job. `driftFindings` (build-core) compares with the previous report for the SAME page (`docs/agents/build/design-check.json`, written by
  the `shot` stage, the tool or the previous measurement; comparing path + query because hosts differ): only new values or a rise in element count
  are warnings (near counts too), the rest is counted in `designExisting`. No previous report: only `off` and unknown fonts,
  no near. One colour on one element is ONE warning even if it paints the background and four borders (measured 30/09: at first it became five). At most 8.
- **Never refuse** (ADR 0022). No new refusal code, no `ok:false`, no blocking of the write; not being able to measure (no
  system, no browser, page does not answer, over the 15 s budget, error) is a FACT (`designCheck: "skipped"`,
  `designWhy`). The notice sentence and `designLine` say it plainly: a colour the customer named explicitly is kept, tell the customer.
- **Measured (private stand `dsgnm`, `dfinwp1`, `deepseek-flash`, 30/09).** A block write of `#00c853`: the answer carries
  `OFF_PALETTE_COLOR color rgb(0, 200, 83) on p.wtb-eyebrow`, `designScore 91`, `designExisting 3`, `designMs 6533`;
  the agent: "the design check sees it as off-palette — expected, since the customer named the hex" and then told the customer. A CSS edit
  with `edit`: the notice arrived 6.0 s after the edit; the agent: "The design check flagged the hex as off-palette — expected… Keep
  it", without calling `tracy_design_check` again. A text edit (`content.replace`): not measured, turn 5.4 s. Added to each look-changing
  turn ≈ 6–6.5 s (the WordPress site's browser). Evidence: `tasks/evidence/design-check/2026-09-30-drift-on-write-*.json`.
- **Not done / limits.** EmDash `site.rebuild` and Joomla CSS take path (2) but have not been measured on a stand. Bash edits of look
  files are detected by text matching (path + write signs) — if one slips through, the agent still has the context line and the tool. The previous report
  keeps only ONE page, so switching back and forth between two pages means the first time on each page has no baseline to compare.

## Not decided

- ~~EmDash templates have no contract yet → `design.json` only records `source: 'template'`.~~ Decided 29/09 (Lee): see the section "Addendum — EmDash reads the look from the site itself".
- ~~`tracy-business` has its own token set not in the catalog: needs a `source` other than `catalog`.~~
  Done, see the section "Addendum — the quickstart source" above.
- The door that changes **one** colour (`theme.palette`) is still outside `APPLY_RULES`.
- Deriving a system from parameters in the style of Claude Design's `theme.json`: upstream OpenDesign does not have it either.

## Addendum 29/09/2026 — EmDash reads the look from the site itself (Lee settled "do it")

- EmDash sites are now bound to the template's own look: `docs/agents/design.json` records
  `{id: <templateId>, source: "quickstart", name: <label>, tokens, tokensFrom: "site:/app/src/styles/tokens.css"}`.
  The id and label come from `template/artifact.json` next to the site.
- **No EmDash contract, only the design half.** The content half (text fields, images) already has its own path through
  the site model (ADR 0020, 0022). There is no profile to put a design file next to, and none is needed.
- **Tokens are read from the site's container, not from the repo.** Every Tracy EmDash template keeps its whole look in
  `src/styles/tokens.css` (default Tailwind colours are turned off). The `check` stage reads that file with
  `docker exec <label>-web-1 cat`, and `site.rebuild` reads it again after each build. The record is therefore always the
  look the site is wearing, even after the agent edits tokens. There is no copy to drift, and no need for one
  file per version (16 versions across three releases on 29/09).
- `var()` is resolved to values. Astro's font variables (`--font-archivo`) are taken from `src/fonts.json`.
- **Which theme:** the token set is that of the page as it is served. The write step reads the home page's `<html>` tag
  (inside the container) and then applies the blocks matching its attributes in cascade order. Business and Base open light; SaaS
  opens `data-style="terminal" data-theme="dark"`. The first version (taking the first declaration) measured dark SaaS with the light
  palette and got 95; the releasing agent caught it and fixed it the same day.
- **Astro fonts carry a hash:** the page computes `Archivo-d7009d10e90b12ba`, the token records `"Archivo"`. The scorer
  strips the hash suffix before comparing. Without this step, every font on an EmDash site is reported as drift.
- Measured 29/09 on three running sites, with exactly the `shot` stage's probe
  (`tasks/evidence/design-check/2026-09-29-emdash-template-look.json`): Business 100, SaaS 100,
  Base 99 (2 backgrounds `rgb(10, 79, 168)`).
- The agent's context line keeps at most 20 names per group, the rest written as `+N more` (Business has 77
  tokens). The line is 953 bytes long.

## Addendum 29/09 — the original copy lives in tracy-web

The "API" session (per Lee) pointed out two holes in decision 2, both measurable in code: tracy-web does not
mount the site folder, so `/v1` cannot read `docs/agents/design.json`; and only site-tools refreshes
that file after `theme.style`, so a `theme.style` going another path (`/v1`, ops, a script) silently drifts the record
— and it is the very yardstick of `tracy_design_check`.

So **the original copy moves to tracy-web**: the `site_design` table (migration 038), the generated token map
`apps/tracy-web/src/design-tokens.json` (154 systems, gate `design-tokens`, because the tracy-web image does not carry
`systems/`), the door `GET /api/sites/:key/design` (every valid seat, always 200, `{design: … | null}`) and
`PUT` (accepts only the lane's actor assertion — a browser seat or an API key is refused with
`DESIGN_RECORD_BUILD_ONLY`; `wrote_by` is filled in by the server). `applyDoor` — where every call passes, including
`/v1` — rewrites the record when `theme.style` returns ok (`apply:<applyId>`). The `check` stage still writes
`docs/agents/design.json` and then sends it up via site-tools; site-tools pulls the original down to overwrite the copy before
building the context and before `tracy_design_check`, and keeps the copy when tracy-web does not answer or has no
record yet. The public shape `{id, name, source, platform, tokens, tokensFrom, updatedAt}` is the contract
with `/v1` (`tasks/todo-api-public.md` S8); `manifest_design`, `wrote_by` do not go out.
`source` adds `quickstart` for a quickstart's own system (`tracy-business`).

## Addendum 29/09/2026 (afternoon) — the original copy for `source: quickstart`

- **Rule: for `quickstart`, the tokens the build sends up ARE the original.** tracy-web has no other copy: the
  Tracy Business tokens live in the profile's `<version>.design.json`, EmDash tokens are read from
  `src/styles/tokens.css` in the site container — neither is in the tracy-web image, and
  `design-tokens.json` only knows the 154 catalogue systems. So the `PUT` door keeps `tokens` exactly as sent; only a
  later build can replace them. A `quickstart` record must name the quickstart's id (not `null`, not
  `brand:`); `tokens: null` is still accepted (name known, values not yet readable — truer than an old record).
- **Nothing that regenerates tokens may erase a quickstart's tokens.** `styleRecord` (the write after
  `theme.style` in `applyDoor`): a `theme.style` calling back the same quickstart being worn (same id) keeps
  the name, tokens and `tokensFrom` unchanged; this is checked before `tokensFor`, so a quickstart sharing an id with a catalogue
  system is not repainted either. A `theme.style` to a different system is a real look change and replaces the record.
- **EmDash sends a named record, once.** Before, the `check` stage sent tracy-web a `template` record
  (no name, no tokens) and only then named the look in the copy in the folder; site-tools then pulled the original down to
  overwrite the copy before every chat turn and `tracy_design_check`, so the EmDash look was lost on the very next turn. Now only
  `lookRecording` sends, after reading the site; `site.rebuild` sends the look it just re-read.
- **A build opened from the form is signed by the person who clicked.** The "API" session measured on dev (29/09, `s8bdesign.tracy.site`):
  the folder had the correct record, `site_design` was empty — a build session from the form has nobody typing, the lane has no
  prompter to sign, so it returned `409 NO_ACTOR`, and the build was still green. The person who clicked is the viewer of that same session
  (the browser sends hello with `sessionId`): tracy-web reads the email from the cookie (`/auth/me`), the gate signs for
  that email, tracy-web still checks the seat as for any actor. Nothing is loosened: a viewer of another session, a cookie
  tracy-web does not accept, a lane with no signer — none of them sign.
- **Failure is no longer silent.** A record tracy-web does not accept leaves a line
  `[site-design] build record not sent: <status> <code> <siteKey>` in the dsh log and a fact
  `designRecord` on the `check` stage (`job.json`); the build does not go red because of it.

## Addendum 20/10/2026 — the harness locks the design system for new elements (requested by Akemi; council Codex 20/10)

- **The PO's rule.** "Making a new button must still follow the original template if the customer has not installed a design system; installing
  a new system means it must follow the new system's rules." Every template already reads the standard role variables with its own value as
  fallback (`var(--ds-c-accent, #A3E635)`, VARS-1), and `--ds-*` exists only while a system is worn. So a value written
  **through a role, with the template's value as fallback** satisfies both halves: not worn → exactly the template, worn → follows the system,
  removed → back to the template. A literal does not.
- **The gap before (measured in code 20/10).** The slot-style `- Design system:` line (10/10) existed only when the site WAS wearing a system, and only
  spoke about EDITING existing elements; a site not wearing a system was told no role variable names. Pin checks existed only in EmDash
  `site.rebuild` and only while a system was worn. WP/Joomla `look.set` told the agent to write a literal when the token belonged to a slot.
- **Decision.**
  1. Context: a site not wearing a system (the slot reader returns "none" — not "no answer"; imported sites do not
     count) gets the roles line (`rolesLine`, names taken from `role-variables.mjs`); every design system line has the sentence "a
     NEW element copies the class of the template's element of the same kind, does not invent its own style". Names only, no values.
  2. The yardstick for a site not wearing a system is **the template's roles read from the site itself**: each slot read also returns the
     `var(--ds-*, fallback)` pairs in the template's stylesheets (`templateRolesOf`; the most frequent fallback wins, fallbacks
     through the template's own variables are resolved). While a system is worn, the same table gives the template's value as fallback,
     never the worn system's (removing the system returns to the template).
  3. Check what the agent WRITES, not the page: EmDash `site.rebuild` checks sites not wearing a system too; WP/Joomla
     `tracy_site` writes (`look.set`, `content.update/batch`) and CSS file edits with file tools return `rolePins` + `next`
     (`role-pins.mjs`); `page.look` attaches `pin` for sites not wearing a system. When two roles share a value (`fg`, `heading`),
     both are named, the role chosen first by what is painted (background / text / border) and then by colour distance.
  4. **Still only warnings (decision 5 unchanged), no automatic rewriting.** Council: the host turning a literal into a `var()` by the
     nearest colour easily picks the wrong role, which shows when the system changes; a value the customer named explicitly is kept and the agent says it does not
     follow the system.
  5. **Bash editing CSS (second council, 20/10, option A).** dsh's `tools/execute` middleware: for a bash command that writes
     look files (`shellLookFiles`: `sed -i`, `>`/heredoc, `tee`, `cp`/`mv`, an inline script opening a file for writing), the files
     it names are read BEFORE and AFTER the command, inside the site's own web container, from the command's working directory (the fence's
     world: relative paths resolve as the command does, no other site's files), at most 6 files × 256 KB, 5 s per
     read. Only NEW violations are reported (comparing the before/after check results — an edit in one-line minified CSS does not drag along the template's old
     literals); a file that cannot be read is reported as "could not check", never "clean"; a failed command is still re-read; errors of
     the checker do not touch the command's result; each pin is mentioned once per turn. Option B (`git diff` of the webroot via tracy-host)
     dropped: GIT_DIR lives on the fleet host, dsh cannot reach it, and a diff from the last commit includes changes made before the command. Still open:
     commands that name no file (`find -exec`, external scripts) — only drift measurement and context.
  6. **Templates from before the readiness round do not read roles** (measured 20/10: Tracy Business EmDash 1.7.4, `/app/src/styles` has no
     `var(--ds-`). The context line names role variables only when the read sees the template reading them; otherwise it keeps the old wording ("keep
     the template's classes and variables") plus the new-element rule, and no pin check runs (there is no yardstick).
- **Review 20/10 (independent agent) — fixed before merge.** (a) Fallback: not wearing a system it is the literal itself (the page looks exactly as
  the agent wrote it), wearing a system it is the template's value for the right role — never the template's value replacing the literal
  when not wearing a system (the first version turned orange text black). (b) Role: a colour EQUAL to a role is that role whatever is painted; otherwise only the role
  of exactly what is painted within threshold 48 (the design check's "near" band), farther than that no role is assigned. (c) Radius 0, %, ≥999px
  on a non-button element is shape, not the system's radius. (d) WP block attributes are only considered in
  `style.color/border/typography`; `url(#…)` is not a colour. (e) File tools also read before/after (new_string repeats old
  lines); a whole-page body of `content.update` is only compared with the copy the agent read in the session. (f) A previous read that errored/timed out
  → could not check; a pin is not lost when the agent calls `tracy_design_check`; at most 8 pins per step, the rest in the next step.
  (g) The role-reading script tolerates errors (broken symlinks, locked folders), strips comments, skips `node_modules`, does not read
  `styles/*.json` variations, reads Joomla's parent theme. (h) The light side is the role's value, the dark side (`prefers-color-scheme: dark`,
  `[data-theme=dark]`, `.dark`…) is only a secondary candidate (measured on Tracy Business WP: before that `--ds-c-bg` came out `#101214`); PHP
  splits dark blocks by bracket counting because the recursive pattern ran out of backtracking on a 30 KB `theme.json`.
- **Second review round 20/10.** A dark-side value is only a candidate for a role of the same paint kind (dark text never becomes a background
  role); "is a button" is judged by the selector/tag holding the declaration, not by the whole file; `@font-face` is not pinned; the record address
  has a `key`, a new page is compared with empty, a block edited in place is compared with the body that was read, only the body field is remembered (20 copies per
  session); "dark side" is only a dark switch on the root (`prefers-color-scheme: dark`, `html[data-theme=dark]`, `.t4-dark …`),
  not `.btn-dark`, `:root:not(.dark)` or a mixed list; a slot that does not answer means no fallback is guessed, reported as could not
  check; a read slower than 8 s, the 7th file onwards, a `cd` to an unknown place are all reported as could not check; the 9th pin
  onwards moves to the next step.
- **Third review round 20/10.** The body is remembered from the ORIGINAL answer of `content.get` (`onRead` in `runSiteCall`, before
  W2 cuts it into an outline) — without it, block edits on a long page were never checked; writing a whole page not yet read,
  or a slot not answering, is reported as "could not check". Role: a near match on the light side of the same paint kind beats every dark-side value;
  unknown paint kind means the dark side is not read. Dark switches add `is-dark-theme`, `[data-color-mode=dark]`, all-dark
  lists, a theme.json `css` string opening with a dark rule; an unclosed dark block only skips itself. `@font-face`
  anywhere is not pinned; comments are stripped; quoted values are read whole; buttons are judged by tag/selector (not `.btn-group`,
  `wp-block-buttons`; including `input[type=submit]`); a Joomla record without `kind` is an article; a `cd` inside a subshell or a `pushd` means
  relative names are unknown.
- **Fourth review round 20/10.** `cd` follows subshell depth (`splitShell` records `depth`), not raw string scanning — CSS in a
  heredoc (`calc(… (…))`, `@media (…)`) no longer makes the whole command "could not check"; a tag is read up to its own `>`; `>` in
  a selector is the child combinator, only `<style>` is a boundary; a quoted value does not run past the next attribute's `=`; only
  body fields are compared with the copy that was read, title/status belong to the write itself; a write with text only adds no
  note; `/*` in markup is not a comment; unclosed dark blocks at most 5, then stop; the accent colour is a role for both text and
  border.
- Code: `site-context.mjs` (`rolesLine`, `NEW_ELEMENT_RULE`), `ds-slot-worn.mjs` (`templateRolesOf`, `nearestRoles`,
  `parseRolesRead`, `ROLES_PHP`/`ROLES_JS`), `role-pins.mjs` (`rolePins`, `newRolePins`, `LOOK_FILES_SH`),
  `shell-look-write.mjs` (`shellLookFiles`), `index.ts` (`tools/execute`), `slot-pins.mjs`, `look-set.mjs`.

## Amendment 26/10/2026: the Website Opportunities demo site takes ONE accent colour from the logo (settled by Akemi)

- **Who decided, when.** Akemi (COO) settled it on 26/10/2026, issue #1780 item 15. She said explicitly that Lee's approval
  was not needed; this ADR was decided by Lee, so this section records who decided the amendment.
- **Decision.** The demo site Website Opportunities builds for a business takes **exactly one accent colour** from that
  business's logo (`brief.brand.accent`, only when the source is the logo). That colour paints the template's accent spots:
  buttons, rules, accent blocks, links. The text colour on it is chosen by contrast, at least 4.5:1 (WCAG AA). Every other
  colour, the fonts and the layout stay the template's.
- **Why.** A business owner opening the demo must see it is their site from the first second; colour is what they notice
  before text. The logo is the most trustworthy source of brand colour. Colours read from photos (a training ground, a dish)
  say nothing about the brand, so they are still not used.
- **How (per the 20/10 addendum).** The accent goes into the **standard role variables** of the design-system slot:
  `--ds-c-accent`, `--ds-c-accent-hover`, `--ds-c-accent-active`, `--ds-c-accent-on` (`role-variables.mjs`). A template
  reads a role as `var(--ds-c-accent, <its own value>)`, so only the accent spots change; a template that reads no role
  changes nothing, and that is correct. Text on the accent is white or black, whichever contrasts more; the hover and
  active colours move away from the text colour so text never becomes less readable. Code:
  `apps/tracy-web/src/opportunities-build/brand-on-site.js`.
- **Who writes it.** The agent-demo build step receives exactly one CSS rule computed by the server and puts it where the
  CMS keeps the site's own CSS (WordPress Additional CSS, the template's Joomla `custom.css`, the EmDash site stylesheet
  followed by `site.rebuild`).
- **Bounded exceptions for the checkers.**
  - The `look-kept` gate (tracy-host `demo-qa.js`) allows exactly the accent tokens at exactly the values the server gave
    (`accentTokens`); any other value or any other `--ds-c-*` token is still a look change and fails.
  - The `OFF_PALETTE_COLOR` warning of `tracy_site` and `tracy_design_check` no longer reports the accent (27/10/2026,
    option A): the checker does not know the brief, so its probe reads the accent role variables
    (`--ds-c-accent`, its hover, pressed, on-accent and text roles) off the page root and counts their values as the
    site's accent (`site-build-core` `design-check.mjs` `ACCENT_ROLES`). Only those roles: another `--ds-c-*` value
    and any other colour are still reported. Setting the roles by hand stays held by `look-kept` on a demo and by the
    Design system door on a customer site.
  - The "do not change colours" sentence in the brief (`brief.mjs`) must also state this exception for the
    quickstart-first path.
- **Links (27/10/2026, option A, one rule for every template).** Links are the readable accent as text
  (`--ds-c-accent-text`, `--ds-c-accent-text-hover`). They take the logo accent only when it reaches 4.5:1 (WCAG AA,
  normal text) against every page ground the template paints, light and dark, as its slot contract records them
  (`baseTokens`/`darkTokens` `--bg`, `apps/tracy-web/src/lib/ds-slot.js` `pageGroundsOf`). Otherwise, or with no
  ground recorded, the links keep the template's own colour. The build's steps and the `look-kept` gate read the same
  grounds, so the link tokens the build writes are exactly the ones the gate allows.
- **Risk accepted.** A dark accent on a dark template (a forest-green button on a near-black page) can be hard to see even
  though the text on the button still meets AA: the link rule above measures links, not the button fill against the
  page; reviewing the demo is where that is caught. A side of the page the slot contract does not record (a template
  whose switch has a second side measured nowhere) is not measured either.
- **Unchanged.** The door for changing a colour for customers (`theme.palette`) stays outside `APPLY_RULES`; this section
  is only the Website Opportunities demo build step.


## Amendment 29/10/2026: a brief build takes the brand colour ROLES from the logo, not one accent (settled by Akemi)

- **Who decided, when.** Akemi (COO) approved the rule on 29/10/2026 for brief builds (spec TracyHQ/tracy#189), after a
  local build of a sports club brief on a dark T4 template kept the template's red on every button, link, accent and
  icon although the brief held the club's own logo (dark green and gold).
- **Why the one accent was not enough.** The 26/10 rule set `--ds-c-accent*`, and only templates that read those roles
  changed. The measured T4 template paints its brand through its own theme variables (`--color-primary`,
  `--body-link-color`, `--mainnav-link-*`, compiled from `etc/theme/*.json`), a T3 template through literal colours its
  LESS compiled; neither reads the role for its buttons, and the brief-build path never wrote the accent at all. A site that
  keeps another brand's colour does not feel like the owner's.
- **Decision.**
  1. A brief whose `brand.logo` is set and whose colours were read from that logo (`colorsFrom: 'logo'`) gives a palette:
     the primary, and a secondary when the logo clearly holds another colour. Near white, near black and greys are never
     brand colours. No logo of the brief (Tracy draws one, or the name shows as text), colours from photographs, or a logo
     of greys only: the site keeps every colour of the template (site plan `colours.decision: 'template'`).
  2. Only the template's brand colour ROLES change: wherever it paints its own brand colour (buttons, links, accents,
     menu states, icons, overlays on pictures, inline SVG drawings). Page grounds, neutral text, greys, status colours
     (danger, warning, success, info), fonts and layout stay the template's.
  3. Each role is moved in lightness, its hue kept, until it reads where it sits: text 4.5:1 on the page ground, fills and
     lines 3:1, the words on a fill 4.5:1 (the template's own words when they still read, else white or black). Each side of
     the template (the side the page opens on, and every mode it can switch to: a `.light-active` class, a
     `[data-bs-theme]` attribute, the colour-scheme media) gets the tones that read on its own ground; words also reach 3:1
     on the other sides' grounds when one tone can, since a hero title on a photograph keeps its look on every side.
  4. The template's brand colour is MEASURED, never named: the colour the framework role rules resolve to (links, the
     primary button, `.text-primary`, `.bg-primary`, the primary/link/accent theme variables), voted; a shade is the same hue
     on a role that also wears the brand colour (a compiled hover). Code: `website-opportunities/domain/brand-colours.mjs`,
     `brand-colour-measure.mjs`, `brand-colour-css.mjs`.
  5. Icons the demo drew in its brand colour are drawn in the palette's primary at the same luminance (same contrast on any
     ground); drawn pictures are told the palette in plain words (`picture-draw.js`).
- **How it is written (Joomla).** One CSS block built from the stylesheets and pages the site serves travels inside the
  marked head block the leftover rules use: T3 prints it from the style's head-code param, T4 from one custom module on
  every page. Every rule is declared again under the same selector and media and reads a Tracy variable per role
  (`--tracy-brand-<n>-text|fill|on|line`), set on `:root` and again under each side's marker; the template's own
  variables that held the brand colour, and `--ds-c-accent*` where the template reads them, are set the same way.
  T4's theme settings files are not written: no Apply door writes them, and they only reach the page once the admin
  saves; the admin therefore still names the template's colours (risk accepted). Code:
  `apps/tracy-web/src/sites/brief-engines/joomla-brand-colours.js`.
- **Not changed.** The agent demo (`brand-on-site.js`) keeps the one accent and its `look-kept` exception; WordPress and
  EmDash brief builds do not take the roles yet.
