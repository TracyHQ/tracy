---
name: tracy-emdash-template
description: Turn a design folder (static HTML or a Claude Design canvas export, with assets and a style guide, in one or more languages) into a complete EmDash 0.37 site running locally — Astro SSR + Tailwind v4 + shadcn/ui, content editable in the admin, repeatable seed/import, acceptance evidence, and a package that rebuilds on a clean site. Use when asked to "build an EmDash template from an HTML/design folder", "port design X to EmDash", or when you must check/accept a Tracy EmDash template.
---

# Tracy Emdash Template — from a design folder to a running EmDash site

This skill is a **process + toolkit**, not a specific template. It was distilled from the build of
Northgate Industrial (EN/RU, 24 routes, 14 collections) — its record and measurements are in
[`examples/northgate.md`](examples/northgate.md); the code of that build is
`packages/cms/tracy-emdash-theme-business/`. Read **one** reference packet per phase, do the work,
measure, and only then move to the next phase. Do not read everything in one go: details will drop.

## Getting started — take the job before running tools

The user says one sentence: *"build this site as an EmDash template"*, with a URL or a folder. **Everything
else is the skill's job, not theirs** — which CMS the source is, whether the content model can be read or
only the HTML, where to put the package, what to name it. Do not make them type those out.

**Step 1 — identify, one command, before anything else:**

```bash
node scripts/ingest/detect-source.mjs <url-or-folder>
```

It answers four questions: which CMS · whether there is T4/ACM · **reach** (local or HTTP only) · the
suggested package name and location. If there is no source in the conversation yet, ask **one short question in the user's language**
("Do you have a site URL or a design folder? Send me the path") and then **wait** — do not probe the machine, do not
scan installed software, do not suggest another platform.

**Step 2 — take the road `detect-source` points to.** Four roads, and picking the wrong one loses exactly the most expensive thing:

| `road` | When | What to do |
|---|---|---|
| `contract` | CMS **within reach** (this machine, or access has been granted) | Read the **content model**, do not scrape HTML: `joomla-dump.mjs` → `from-joomla.mjs` → `site-model.json` → `tools/compile-seed.mjs`. **The first two scripts live in the sibling repo** `JoomlArt-Products/tracy-wordpress-theme` — see [`references/site-model.md`](references/site-model.md) §Where to get the two sibling-repo scripts |
| `rendered-ask` | CMS but **HTTP only** (someone else's demo, a production site) | Ask **exactly one question**: is there database access, a backup, or a quickstart package? Yes → `contract` (faster and more accurate). No → `rendered` — **the template can still be built**, it just costs more work; record in `DECISIONS.md` the fields that had to be inferred from markup |
| `contract-pending` | WordPress | No skill has an adapter that reads WordPress yet. Write `from-wordpress.mjs` emitting `site-model.json`, or go `rendered` and say so plainly |
| `rendered` | No CMS declared — HTML folder, canvas, frames | The old road: `tools/inventory.mjs` on the source folder ([`references/source-inventory.md`](references/source-inventory.md)) |

⚠ **Do not overstate the database — the main job can still be done without it.**

A Joomla site has articles, categories, menus, and (if it runs T4) page sections that are ACM modules **with named
fields**. Reading them is faster and more accurate: the field names are given, not guessed.

But **building a template does not need a database**, and the proof is the two templates that already exist: Tracy
Business (24 routes · 14 collections) and the T4 template `tracy` were both built from a design folder, not
from any DB. What this skill produces is **the outfit** — layout, components, CSS, tokens — and the outfit can be read
from what the site renders.

Without a DB, the **content** part is more expensive, not impossible:

| Available from rendered HTML | Only available by reading the DB |
|---|---|
| titles, body text, images on the page, dates, breadcrumb → category, the menu in `<nav>` | the real ACM field names (`heading`, `items[]`, `btn-1-link`…) instead of inferring them from markup |
| section type, guessable with `detectSectionType()` from the WordPress kit | unpublished posts, drafts, pages not in the menu |
| | original image files (HTML only has resized versions) |

So the right statement is: **with a DB it is cheaper; without one you still do it, and record what had to be inferred**. Only when the job
is a **faithful content migration** — not building a template — is a missing DB something
to put to the user for a decision.

**Step 3 — default, do not ask what can be inferred.** `detect-source` suggests `packages/cms/tracy-emdash-theme-<slug>`,
a label, and the language from `<html lang>`. Ask only when it declares `needsName: true` — meaning the site declares no
`og:site_name` and `<title>` is just a page name ("Home", "Trang chủ"), so guessing further would name the
template after the first menu item.

**Step 4 — state the scope before starting.** This run is P0→P8: content model, runtime, every page
family, Fast Gate, four-tier Visual QA, handoff package. Northgate is 24 routes · 14 collections. Say one
sentence so the user knows what they are signing up for, then start — do not ask permission for each phase.

## Inputs — the contract

| Needed | Example | If missing |
|---|---|---|
| **Immutable** source folder | `vendor/joomla/html/tracy_business/` | stop, ask |
| Source kind | static HTML · Claude Design canvas (`<x-dc>`, `<sc-for>`, script `text/x-dc`) · renderable URL · frames/images exported from Figma/Pencil (`source.kind` + `source.parity` in the contract — [`references/source-inventory.md`](references/source-inventory.md)) | `scripts/tools/inventory.mjs` detects HTML/canvas itself; frames are declared by hand, there is no adapter that reads live Figma/Pencil |
| Language list and default language | one default language without a prefix, other languages under `/<locale>` (Northgate: EN, RU) | choose from the root folder, record in `DECISIONS.md` (reversible) |
| Package location | `packages/cms/tracy-emdash-theme-<name>/` | per TCH; the package is an **independent** pnpm project (own lockfile) and must be **excluded** from the root workspace glob `packages/*/*` |
| Template identity | `template.config.json`: `id`/`label` (product, e.g. `tracy-business` / Tracy Business), `locales`, `site.title` (demo content), `forms.bindings`, `mail`, `audit` | every tool reads this file; never hardcode customer names/locales in a tool |
| License rights to the source (HTML, images, fonts) | | local work is still fine; **release** is recorded as blocked until Lee settles it |

Do not modify the source. Do not invent URLs, prices, figures, download files — if missing, leave empty/hidden and record in
`content-gaps.md`. Do not enable commerce. Do not push to the fleet/production, do not bind Cowork.

## Phases and gates

| Phase | What to do | Packet | Exit gate |
|---|---|---|---|
| P0 | Read the real EmDash code (do not trust old plans), settle stack/pins, license, location, runtime | [`references/runtime.md`](references/runtime.md) | `architecture.md` · `DECISIONS.md` · `STATUS.md` |
| P1 | Inventory: hash every file, page → route, assets, tokens, gaps; render the source | [`references/source-inventory.md`](references/source-inventory.md) | `source-inventory.json` · `assets.json` · `routes.json` · `visual-contract.md` · `content-gaps.md` |
| P2 | Content model: collection/field/taxonomy/menu, i18n, plugins, seed; **start** the package's hand-written `AGENTS.md` + `docs/` (content-model, content-rules, design-system) | [`references/content-model.md`](references/content-model.md) · [`references/package-docs.md`](references/package-docs.md) | `seed/seed.json` **valid** · `field-map.json` · `plugin-matrix.md` |
| P3 | Runtime + a Home slice + one content page, all locales; a second clean site; **Fast Gate** on the built slice | [`references/frontend-stack.md`](references/frontend-stack.md) · [`references/qa-lenses.md`](references/qa-lenses.md) §8 | two independent sites render; admin round-trip; admin not touched by storefront CSS; `fast-gate.mjs verdict` passes (the shared frame is clean before scaling out) |
| P4 | Importer: media, content, forms; receipts, resume, conflicts; backup/restore | [`references/seed-and-recovery.md`](references/seed-and-recovery.md) | running twice = no change; editor edits → kept; seed + editor both changed → conflict |
| P5 | Every page family, list/detail, search, 404, real forms, static kit; each family is added to the `layouts[]` declaration (+ `family`) and the related Fast Gate cases are rerun (`plan --changed`) | `frontend-stack.md` §Pages | every route in `routes.json` has a view in every locale; unknown → 404 with chrome; Fast Gate still clean |
| P6 | Turn what was proven into a skill (this very file) | — | other agents can discover it; no command that was never run |
| P7 | **Fast Gate clean against the contract + the current build first**, then the full acceptance matrix, audit, interactions, forms, mail sandbox — per the **contract** `qa.contract.json` | [`references/qa-and-packaging.md`](references/qa-and-packaging.md) + [`references/qa-contract.md`](references/qa-contract.md) | `tools/qa.mjs --browser --visual --visual-fast-gate <run>` → `report.json`: `contracts` · `browser` · `routing` · `visual` (scope `full`) pass; review gates have receipts |
| P4.5 | **Personalization**: `seed/questions.json` (what to ask the customer) + `seed/personalize.json` (which field each answer lands in) + `tools/personalize.mjs` from the kit; all three in `distribution.include` | the *Personalization* section below | `node tools/personalize.mjs --answers-json '{"name":"…","sector":"…"}' --dry-run --json` names exactly the fields that will change, no `__…__` placeholder left; `tools/release.mjs` does not reject the package |
| P4.6 | **Brand and pages ready for "Customize your site"**: chrome entry with image field `logo_dark` and `brand.logoDark` in `seed/personalize.json`; every logo spot through `<BrandLogo>` (`src/lib/brand.ts`, kit-owned); the template icon only behind `templateIconWanted`; `<html lang>`/hreflang through `displayLocaleOf`; copyright from `{year}` + `{name}`; header pages on the `primary` menu | [`references/brand-and-pages.md`](references/brand-and-pages.md) | the checklist at the end of that file ticked; `tests/brand.test.mjs` + `tests/display-locale.test.mjs` pass; the release carries `tracy_site_pages.json` (`release.mjs --site-pages`) |
| P8 | Package by allowlist (`distribution.mjs pack`), lockfile, seed, media map, provenance, runbook, `artifact.json`, `AGENTS.md` and two-layer docs; independent handoff | `qa-and-packaging.md` §Package + [`references/package-docs.md`](references/package-docs.md) | `qa.mjs --artifact --reviews` **exit 0** — every gate pass/not-applicable, no `pending`/`blocked` (the `independent` receipt is signed from an independent agent's report; `visual-review` is **signed by no one** — it passes on the five machine checks of the last full run of each tier); docs not missing/stale |

`STATUS.md` is updated after **every** phase: task, files owned, runtime identity (port, data folder,
pins), gates pass/fail/skipped with evidence paths, blockers, next command. Do not mark done because
the build is green or the home page looks nice.

## Toolkit — copy into the template's `tools/`, run from the template folder

`scripts/new-template.sh <target> [package] [template-id]` copies the skeleton + `scripts/tools/*` +
`scripts/tests/*` (mock EmDash API + DE/FR fixtures) + a skeleton `template.config.json` into a new
package. Every tool has `--help`/usage at the top of the file, meaningful exit codes, no hardcoded machine paths, **no
hardcoded identity**: site name, locales, form bindings, audit policy, theme hook (`qa.theme`) are all read
from `template.config.json` (`--config`). They import `playwright`, `acorn`, `emdash`, `better-sqlite3`
from the **template's** `node_modules`, so they must be run as `node tools/<x>.mjs` in the template folder —
not from the skill folder. **`npm test` in the kit does exactly that for you**: `scripts/test-kit.mjs`
builds a throwaway template in a temp folder, copies `tools/tests/contract/ingest` into it, places exactly
the files that `clean-install.test.mjs` asserts a new target must receive, and runs the tests **there**.
Run in place inside `scripts/`, four tests go red on a clean checkout for reasons unrelated to either the product
or the machine — `restore.test.mjs` reads `template.config.json` next to the tool, and `clean-install.sh` computes the
source as `dirname($0)/..`, which in the kit gives `scripts/` rather than the template root.
`npm test` (kit) or `node --test tests/*.test.mjs` in the template runs the kit's 184 regression tests
(clean-install, seed-apply F2/F3/F4, backup/restore, audit F7, contract F8, package F9, acceptance gate
F10 on a fake site, receipts F11, visual F12, notes F14, Fast Gate F15) without a real EmDash site — ~8–9
minutes (measured 14/09), mostly F10/F12 opening a browser; do not run it alongside another `visual-qa` run.

| Tool | Job | Phase |
|---|---|---|
| `ingest/detect-source.mjs <url\|folder>` | **run BEFORE everything**: which CMS · whether T4/ACM · reach (local/remote) · suggested package name + location → pick the road (§Getting started) | P0 |
| `ingest/from-url.mjs <url> --out <dir>` | running site → a source folder `inventory.mjs` can read: same-origin crawl, keeps the site's paths, also pulls assets referenced by CSS, `crawl.json` as the record; says so when it hits the page cap or when the site renders with JS ([`references/inputs/from-url.md`](references/inputs/from-url.md)) | P1 |
| `inventory.mjs <src> <out>` | hash + classify pages + referenced assets (HTML **and** strings in data scripts) | P1 |
| `extract.mjs <src> <out.json>` | extract the canvas data objects via **AST literals**, no eval | P1 |
| `render-source.mjs <url> <out> --pages a,b` | render the source at 1440/390 × light/dark, measure overflow/fonts/errors | P1 |
| `validate-seed.mjs seed/seed.json` | EmDash's own `validateSeed` | P2 |
| `contract/validate.mjs <site-model.json>` | **source contract gate** ([`references/site-model.md`](references/site-model.md), ADR 0016): named error codes, one negative fixture per rule; also scans the storage vocabulary of the three CMSes in `scripts/contract/` | P1/P2 |
| `compile-seed.mjs <site-model.json> <seed-dir> [--config]` | contract → `seed.json` + `field-map.json` + `media-map.json`; rebuilds translation relations, rejects unmapped field kinds instead of guessing | P2 |
| `from-emdash-seed.mjs <seed.json> <out>` | **one-time bootstrap**: the seed of a template built before the contract → `site-model.json` + `compile.config.json` | P2 |
| `from-wp-spec.mjs <spec-dir> <out-dir>` | **bridge** ([`references/inputs/from-wp-spec.md`](references/inputs/from-wp-spec.md)): an existing Joomla spec-pack from the WordPress kit → `site-model.json`, stripping WordPress-isation traces; not the long-term Joomla adapter road | P1/P2 |
| `mint-admin.cjs` | admin account + agent token without a browser (run in the folder that has `data/data.db`) | P3 |
| `bootstrap-site.sh [origin] [data] [--config f] [--seed d]` | first-time setup (title/tagline from config) → mint → schema/content/media/forms/status; **never `--force`**; content created by setup is *adopted* when live == seed; different → exit 3 | P3/P8 |
| `clean-install.sh <target> <port>` | a second clean site from source + lockfile; preflight **before** any write: target new/empty, no symlinks, not inside/the source/an ancestor/inside another project, port free; no `--delete` | P3/P8 |
| `seed-apply.mjs status\|schema\|adopt\|content\|media\|forms\|all` | reconcile with receipts (`--config`, `--seed`, `--receipts`), `--dry-run`, `--force` (conflicts only) / `--force-all` (editor entries too), exit 3 on conflict; media by content hash `sha1:`; media/form edits do not touch entries with a draft or edited by an editor | P4 |
| `backup.sh` / `restore.sh` | SQLite snapshot (online backup) + uploads + receipts; restore reads the whole archive (tar, `data/data.db`, opens SQLite) **before** moving the old copy to `*.before-restore-*`; rejects targets with < 3 path components | P4 |
| `configure-smtp.mjs --test <mail>` | Generic SMTP provider of `emdash-smtp` → Mailpit, selects the `email:deliver` hook, sends a test | P5-E |
| `shoot.mjs <url> <out> --paths … --viewports … --themes …` | quick matrix screenshots; seeds the theme via `qa.theme.storageKey`, observes it back via `selector`/`attribute`; exit 1 on overflow, console errors, sub-resource 4xx, unhydrated island, theme not changing, image not decoding, status mismatching `qa.expectedStatus` | P3/P7 |
| `qa-contract.mjs init <source> <out> --config f` / `qa-contract.mjs <contract> --source <source>` | contract skeleton (hash every source file, `converted`/`asset`) · validator: unmapped pages, open decisions, source hash drift, missing measured styles, gates without policy → exit 1 | P1/P7 |
| `qa.mjs --contract … --source … --site … --out <new> [--browser] [--artifact d] [--reviews d]` | **acceptance gate**: pages × variants × states matrix in a real browser (image decode, MIME, theme, content matches source, measured styles, fonts in `allowed`, mega panel + Escape/focus), `audit.mjs` (routing), package verify, review-gate receipts; `pending`/`blocked` never become pass | P7/P8 |
| `qa-receipt.mjs <gate> --report <run>/report.json --out <dir> --reviewer … --method … --cases … --evidence f1,f2` | receipt for one review gate: copies + hashes evidence, pins the report's `contractHash`/`artifactHash`/`origin` — `qa.mjs --reviews <dir>` only accepts receipts produced exactly this way | P7/P8 |
| `admin-session.mjs --site … --email <admin> --out state.json` | admin sign-in on the **built** site (no dev bypass, no passkey) via an "email link" read from Mailpit; closes the welcome dialog; saves storage state for the tools below | P7 |
| `admin-roundtrip.mjs --site … --storage-state … --entry <admin path> --field <id> --public <path> --out f` | `editability` gate through the **admin UI**: discard old draft → edit field → Save → Publish changes now → public page changes → revert → back to old; drafts do not leak to public | P7 |
| `recovery-check.mjs --site … --collection … --slug … --field … --public … --out f` | `recovery` gate on the running site (run from the site folder): published edits survive a restart; `backup.sh` → overwrite → stop → `restore.sh` → editor text is back; restores the original value itself | P7 |
| `distribution.mjs pack <contract> <new>` / `verify <dir>` | package by allowlist — rejects `data/`, `.env`, `*.token`, `node_modules`, missing `required`; `distribution.json` hashes each file; verify catches changed/added/removed bytes | P8 |
| `audit.mjs <url> <out> [--config f]` | crawl from the root of every locale; **asserts** the policy: indexable → canonical in the right form (path + `page`), full hreflang for every locale + x-default, alternates return 200 with the right `<html lang>`; noindex → `noindex`; `/404` → 404; hitting `--max` with a queue left → incomplete, exit 1 | P7 |
| `fast-gate.mjs plan --contract … [--json f] [--changed a,b]` / `fast-gate.mjs verdict <run> --contract …` | **Fast Gate** (`references/qa-lenses.md` §8): a resolver picks a small, deterministic case set from the contract — root page, pages ≠ 200, each state, each `layouts[].family`, each shared component, locales with their own risk at the narrowest variant; every tier; `visual.fastGate` overrides carry a reason and are validated; prints why each was chosen and what only full checks (`FAST-GATE-PLAN.md`); `verdict` grades a `--scope fast-gate` run: every tier passes, notes merged and all closed, images with a consumer were opened, page hashes match the current tree → `FAST-GATE.json/.md` (machine clean but notes open is a fail) | P3 → P7 |
| `visual-qa.mjs --contract … --site … --out … --source-site … [--source-dir <frames>] --scope fast-gate\|full [--fast-gate <run>] --stage <id> [--reuse <previous runs,…>] [--tile-height 1200]` | **by tier** light-desktop → light-responsive → dark-desktop → dark-responsive (`references/qa-lenses.md`): one script shoots by layout (`visual.shots` — a generator derived from the contract, no language names written) **and cuts each image into readable tiles** (`index.json.tiles`), measures every page in scope (rules, coverage, two-sided source comparison or declared frames, image census, scanner, design system) → `index.json` + `notes/machine.md`; the main agent spins up 5 QA lenses → `notes/<lens>.md`; `qa-notes.mjs merge` → `NOTES-<stage>.md`; a coding agent fixes → reshoot only pages whose hash changed. Scope is recorded in `visual.json`; `--pages` = `targeted-debug`; full rejects a stale/non-passing Fast Gate | P3 → P7 |
| `qa.mjs … --visual --source-site <source> --visual-fast-gate <run> --visual-reuse <last runs of each tier>` | `visual` gate: **scope `full` only**, every tier passes in the same run; `visual-review` passes on the five machine checks from the `--visual-runs` receipt (no signature; `fast-gate` runs may not be cited) | P7/P8 |
| `visual-scan.mjs <white\|darktext\|contrast\|border\|seam\|hover\|toggle\|probe\|snapshot\|diff> <url>` | one page, one measurement, one JSON verdict; fails when the page does not render (`examined < 20`) | P3/P7 |
| `mega-hover.mjs <url> --contract … [--state s]` | megamenu with a real mouse: hover → move straight down 4 px/step → link → click; `gapPx`, Escape returns focus, outside click | P5/P7 |
| `provenance.mjs` | hash table of imported shadcn files | P3/P8 |
| `artifact.mjs` | `artifact.json` from `template.config.json` + package + lockfile (templateId, label, pins, locales, env, entrypoints, checksums) | P8 |
| `content-api-gate.mjs [<package>]` | the package answers Tracy's Content API and prints provenance stamps: reader + `seed/content-api-map.json` + `seed/site-model.json`, `astro.config.mjs` attaches `contentApi` behind the `TRACY_CONTENT_API_SCALARS` flag, the Dockerfile defaults the flag to **1** in every stage with `ENV`, `src/lib/stamps.ts` + `PageOwner.astro`, middleware calls `keepPickPrivate`, every type of the site model has a row in the map; `release.mjs` calls it | P2/P8 |
| `generate-docs.mjs [--check]` | generates `docs/generated/inventory.{json,md}` from the source; `--check` is read-only, fails when docs are missing, skeletons are unfinished or the inventory is stale | P2/P8 |

`new-template.sh` also copies `assets/package-docs/` into the new package, keeping guide files that already exist.
The agent completes every `DOCS_REQUIRED:` in the skeleton from the template's code, without copying Northgate/EN-RU
rules into a different design. Only `docs/generated/` is owned by the script. Read
[`references/package-docs.md`](references/package-docs.md) before creating or updating the handoff set.

Template-specific (not in the kit): `forms.json`,
`interact.mjs` (that design's selectors).

## Personalization — three files, and no package ships without them

A Tracy template must turn the customer's copy into **the customer's** site: business name, sector,
address, hotline in place of the demo text. That is done by **three files inside the package itself**, not by
Tracy from the outside:

| File | What it is |
|---|---|
| `seed/questions.json` | The questionnaire the customer answers before the site is built (`tracy-questions/v1`). The `name` question is mandatory; every label must have **every language** listed in `languages`, otherwise a Vietnamese form gets an English line wedged in. `tools/release.mjs` pushes this very file to the release as `tracy_site_question.json` — Tracy reads the questionnaire there (ADR 0017) |
| `seed/personalize.json` | The map: which answer lands in which collection/slug/field. Six kinds — `identity` (written verbatim; a missing answer **leaves it empty**, it does not keep the demo text), `replace` (demo brand name → customer name, everywhere), `copy` (the model writes for the sector), `rewrite` (rewrite the whole entry), `facts` (**delete**: project counts, founding year, certifications, client names — inventing them is lying in the customer's name), `trim` (`[{collection, keep, why, leadsTo, list}]`: demo rows beyond `keep` leave the site **before** anything is written into them — no PUT, no republish; with no model, every collection in `rewrite` keeps **0** rows and the `list` page is hidden; links to removed rows are changed to `leadsTo`) |
| `tools/personalize.mjs` | The kit tool that reads the two files above and writes to the site through the Admin API (draft → publish, with receipts, rerunning changes nothing more). Copy it from `scripts/tools/`, do not rewrite it. Model: `TRACY_SEED_TEXT_PROVIDER` (the one `/ops` assigns) → `TRACY_MODEL_URL` → DeepSeek → OpenRouter; the report records the `model` actually used. The report separates `errors` (failed writes — exit code **4**), `unanswered` (missing answers), `skipped` (valid skips). Each mutation writes two lines to `data/personalize-journal.jsonl` (before/after, with `before`, `after`, `rev`, `origin`); a `generated` cell without `evidence` is rejected at the write door. `--inspect --json` reads the journal against the live site; `--revert <applyId> --json` returns the latest run to `before`, refusing when a cell was hand-edited afterwards |

`scripts/new-template.sh` puts the two `seed/*` files in place as **placeholders**; filling them is the
template author's job. Left as is, `tools/release.mjs` refuses to package — on purpose.

🔒 **Why this is a gate and not advice.** Until 19/09/2026 the kit had no such tool and
did not mention the other two files. `tracy-saas` 1.0.0 therefore shipped a release with none of the three — and
**nothing went red**: the package was valid, every gate green, the built site ran. The customer was still asked the questionnaire
(Tracy falls back to the CMS default set when a release lacks `tracy_site_question.json`), typed in the business
name, and then got back the sentence *"this template has no personalization tool"* on a site still full of the
template's demo text.

## Brand and pages — the seven questions reach the site (08/10/2026)

Tracy asks every customer seven questions (name, logo, favicon, one line, pages, language, tone) and
`tools/personalize.mjs` writes the answers; the **template** must read them in the right place, or the answer
never shows. The kit ships the brand code in `scripts/src/` (copied by `new-template.sh`, held byte for byte by
`check-kit-sync.mjs`): `src/lib/brand.ts`, `src/lib/media.ts`, `src/lib/display-locale.ts`,
`src/components/site/BrandLogo.astro`. What the template still writes — the `logo_dark` field, the
`<BrandLogo>` spots in header and footer, the two `.brand-when-*` rules, the favicon guard in `Base.astro`, the
chrome word table, the primary menu — and the checklist: [`references/brand-and-pages.md`](references/brand-and-pages.md).

## Content API and provenance stamps — every template has them (27/09/2026)

Tracy reads an EmDash site through the **Content API** (`tools/content-api/`: the `/content.json` route injected by `contentApi`
at build time) and knows which element on a page prints which field thanks to the **provenance stamps** that the
template itself prints — EmDash has no Claude Cowork plugin like WordPress/Joomla. The two go together: a stamp names an
id (`emdash:<collection>:<id>:<slug> field:<key>`), and only the reader can resolve that id. Until 27/09 only Tracy
Business had both; Brian decided to put them in the kit so every generated template has them.

| Thing | Kit-owned? | Where |
|---|---|---|
| `src/lib/stamps.ts` (`stampFor`, `stampsFor`, `islandMarks`, `stampBlocks`, `BLOCK_SRC`, `keepPickPrivate`), `src/components/site/{PageOwner,ProseBlock,ProseListItem,ProseQuote}.astro` | **yes** — `scripts/src/`, compared byte for byte (`check-kit-sync.mjs`) | copied by `new-template.sh` |
| `src/middleware.ts` calls `keepPickPrivate` | skeleton (`assets/src-starter/`), the template edits it further | only placed when absent |
| `seed/content-api-map.json` | skeleton (`assets/seed-starter/`), the template fills it | one row per collection of the site model |
| `seed/site-model.json` | template (contract, `references/site-model.md`); a template built before the contract: `from-emdash-seed.mjs` + a test keeps it in step with the seed | |
| `astro.config.mjs` attaches `contentApi` behind `process.env.TRACY_CONTENT_API_SCALARS === '1'` | template | |
| Dockerfile: `ARG TRACY_CONTENT_API_SCALARS=1` + `ENV` in **both** stages + label `io.tracy.content-api.scalars` | `Dockerfile.template` | the fleet build passes no build arg, so the default **is** what the customer gets; `ENV` so a rebuild inside the container still sees the flag |
| Each view: `stampFor(Astro.request, '<collection>', entry)` → `{...$page('title')}`, `<PageOwner stamp={$page} />` at the top of `<main>`, islands receive `...islandMarks({...})`, Portable Text through `stampBlocks` + the three `Prose*` renderers | template (views are the design's own) | |

**Stamp rules** (the top of `stamps.ts` is the contract; changing it changes the picker, the resolver and both plugins): only requests
with `X-Tracy-Preview: pick` (set by Tracy's site proxy after checking the ticket) get stamps and receive
`private, no-store` + `Vary`; ordinary requests get HTML **identical byte for byte** — measured with two builds.
Only stamp an element whose **visible** text comes from exactly that field (do not stamp a hidden language name on the
language switcher); menus have no Content API record, so they are not stamped. In a component with `<style>`, only
spread stamps onto elements **that have a `class`** (Astro merges scoped classes into a frozen object and throws on
ordinary requests). `content-api-gate.mjs` is the machine gate; `release.mjs` rejects a package without it.

## Eleven invariants — a violation is a bug, not a choice

1. **Content lives in the CMS, not in code.** Text, images, links, figures, menus are fields/settings/menus;
   layout, colour, spacing belong to the template. No HTML blob as "the whole page".
2. **Images go through the importer, not through the seed's `$media`** — 0.37 only downloads `$media.url` (D14).
3. **Writes through the Admin API are drafts; only `publish` reaches the public page** (D17). Reading back via REST still
   looks "right" because REST overlays drafts — the evidence is the public page, not REST.
4. **A live collection's `entry.id` is the slug; the real id is `entry.data.id`** (D21). Get this wrong and
   taxonomies/translations come back empty without any error.
5. **Tailwind/Preflight only in the storefront.** `global.css` is imported in exactly one layout; the admin
   `/_emdash/admin` must not load it — check via the `<link>` in the admin HTML.
6. **No default-locale prefix, no `i18n.fallback`** (D4, D24): a prefix makes the admin 404, fallback
   turns a 404 under `/ru` into a 302.
7. **Missing means record, not invent.** No PDF file → the row has no link; figures contradicting across pages →
   keep each page as it is and let Lee decide.
8. **No command forces itself (`--force`), no tool takes over an entry by itself.** A bootstrap rerun must keep everything
   an editor has published; an entry without a receipt is only adopted when live == seed (D28). A lost receipt is not a
   licence to overwrite.
9. **Image/form edits never publish anyone's draft** (D29): patch on `liveData`; a draft or a mismatched rev →
   conflict. Media reuse only by EmDash's `contentHash` `sha1:`, not by name + size (D30).
11. **Visual QA by tier, Fast Gate before full, images shot only when they have a consumer** (`references/qa-lenses.md`,
    measurement method: `references/visual-review-method.md`): light-desktop → light-responsive →
    dark-desktop → dark-responsive, a later tier runs only when the earlier one is clean; **Fast Gate** (a case set the machine
    picks from the contract, all tiers) clean before full; shoot by **layout** (not by page, not multiplied by
    language), each image declares a consumer and is **cut into tiles** — lenses open tiles, a full image cannot be
    read; measure every page in scope; 5 QA lenses write notes = todos **with grounds** (source · system ·
    content · output), **a source that is also wrong is still a defect** (Flag `SOURCE`, fix it better than the source), a coding agent
    fixes, the lens closes; `visual-review` passes
    on the five machine checks, **signed by no one**; subsets (`fast-gate`, `targeted-debug`) never pass the
    `visual` gate. A source missing frames/dark/404 does not waive the output requirement. List the components first, do not
    spot-check samples; a green probe on a broken render is a FAIL; scanners must print `examined`.
10. **Canonical/hreflang is a written policy** (D27): canonical = path + `page`; every indexable page has full
    hreflang + x-default; noindex/404 are explicit exceptions in `template.config.json → audit`; the audit
    must **be able to fail** (negative fixture) before trusting that it passes.

## Stop conditions

Before P7/P8 or acceptance through a proxy/Docker, **you must read**
[`references/release-regressions.md`](references/release-regressions.md): check the clean package,
images in the right access context, glyphs for each locale and runtime evidence. What the machine can measure is
in `qa.mjs` (see [`references/qa-contract.md`](references/qa-contract.md)); the rest is
receipts, and a missing receipt is a `pending` report — not "treat it as pass for now".

- The source has no clear reuse rights and the job is a **release** → stop, ask Lee.
- A plugin forces upgrading/modifying EmDash core → offer an alternative + cost, do not upgrade on your own.
- Touching a running customer site, the gateway, the fleet image, the wizard, Cowork → that is M2, ask separately.
- Machine disk < 1 GB free → do not install/build more; record it in STATUS.
- Astro 7's dev server returns an "Error" 500 HTML page with no message for every PUT → `astro dev stop`
  and start it again (D25); do not dig into the API.
