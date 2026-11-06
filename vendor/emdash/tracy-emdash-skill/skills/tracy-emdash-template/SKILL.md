---
name: tracy-emdash-template
description: Turn a design folder (static HTML or a Claude Design canvas export, with assets and a style guide, in one or more languages) into a complete EmDash site running locally (pins in `references/runtime.md`: emdash 1.1.0 on Astro 7) — Astro SSR + Tailwind v4 + shadcn/ui, content editable in the admin, repeatable seed/import, acceptance evidence, and a package that rebuilds on a clean site. Use when asked to "build an EmDash template from an HTML/design folder", "port design X to EmDash", or when you must check/accept a Tracy EmDash template.
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
| `contract` | CMS **within reach** (this machine, or access has been granted) | Read the **content model**, do not scrape HTML: `joomla-dump.mjs` → `from-joomla.mjs` → `site-model.json` → `tools/compile-seed.mjs`. **The first two scripts live in the sibling repo** `JoomlArt-Products/tracy-wordpress-theme` — see [`references/site-model.md`](references/site-model.md) §Where to get the two sibling-repo scripts (their dependencies — jsdom, parse5, php-parser, acorn, playwright — must be installed first: `npm install` in that skill's folder, or in a copy of it when its folder is read-only) |
| `rendered-ask` | CMS but **HTTP only** (someone else's demo, a production site) | Ask **exactly one question**: is there database access, a backup, or a quickstart package? Yes → `contract` (faster and more accurate). No → `rendered` — **the template can still be built**, it just costs more work; record in `DECISIONS.md` the fields that had to be inferred from markup |
| `contract-pending` | WordPress | No skill has an adapter that reads WordPress yet. Write `from-wordpress.mjs` emitting `site-model.json`, or go `rendered` and say so plainly |
| `rendered` | No CMS declared — HTML folder, canvas, frames | The old road: `tools/inventory.mjs` on the source folder ([`references/source-inventory.md`](references/source-inventory.md)) |

⚠ **Do not overstate the database — the main job can still be done without it.** With a DB the content part is
cheaper (named fields, drafts, original images); without one you still build the template and record in `DECISIONS.md`
what had to be inferred. Only a **faithful content migration** puts a missing DB to the user. What rendered HTML gives
and what only a DB gives: [`references/site-model.md`](references/site-model.md) §Without a database.

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
| P4.5 | **Personalization**: `seed/questions.json` (what to ask the customer) + `seed/personalize.json` (which field each answer lands in) + `tools/personalize.mjs` from the kit; all three in `distribution.include` | [`references/brand-and-pages.md`](references/brand-and-pages.md) §Personalization | `node tools/personalize.mjs --answers-json '{"name":"…","sector":"…"}' --dry-run --json` names exactly the fields that will change, no `__…__` placeholder left; `tools/release.mjs` does not reject the package |
| P4.6 | **Brand and pages ready for "Customize your site"**: chrome entry with image field `logo_dark` and `brand.logoDark` in `seed/personalize.json`; every logo spot through `<BrandLogo>` (`src/lib/brand.ts`, kit-owned); the template icon only behind `templateIconWanted`; `<html lang>`/hreflang through `displayLocaleOf`; copyright from `{year}` + `{name}`; header pages on the `primary` menu | [`references/brand-and-pages.md`](references/brand-and-pages.md) | the checklist at the end of that file ticked; `tests/brand.test.mjs` + `tests/display-locale.test.mjs` pass; the release carries `tracy_site_pages.json` (`release.mjs --site-pages`) |
| P5 | Every page family, list/detail, search, 404, real forms, static kit; each family is added to the `layouts[]` declaration (+ `family`) and the related Fast Gate cases are rerun (`plan --changed`) | `frontend-stack.md` §Pages | every route in `routes.json` has a view in every locale; unknown → 404 with chrome; Fast Gate still clean |
| P6 | Turn what was proven into a skill (this very file) | — | other agents can discover it; no command that was never run |
| P7 | **Fast Gate clean against the contract + the current build first**, then the full acceptance matrix, audit, interactions, forms, mail sandbox — per the **contract** `qa.contract.json` | [`references/qa-and-packaging.md`](references/qa-and-packaging.md) + [`references/qa-contract.md`](references/qa-contract.md) | `tools/qa.mjs --browser --visual --visual-fast-gate <run>` → `report.json`: `contracts` · `browser` · `routing` · `visual` (scope `full`) pass; review gates have receipts |
| P8 | Package by allowlist (`distribution.mjs pack`), lockfile, seed, media map, provenance, runbook, `artifact.json`, `AGENTS.md` and two-layer docs; independent handoff | `qa-and-packaging.md` §Package + [`references/package-docs.md`](references/package-docs.md) | `qa.mjs --artifact --reviews` **exit 0** — every gate pass/not-applicable, no `pending`/`blocked` (the `independent` receipt is signed from an independent agent's report; `visual-review` is **signed by no one** — it passes on the five machine checks of the last full run of each tier); docs not missing/stale |

`STATUS.md` is updated after **every** phase: task, files owned, runtime identity (port, data folder,
pins), gates pass/fail/skipped with evidence paths, blockers, next command. Do not mark done because
the build is green or the home page looks nice.

## Execution rules — cost, sessions, fan-out

Binds the main agent and every subagent on a port: cost ≈ tool turns × context, one job per session with the
handoff in `STATUS.md`, the coordinator sliced at phase-table boundaries, subagents in the **foreground** (a headless
run ends with the turn), bounded output and batched reads, images opened once, lens readers get a brief + their crops
(not this file), source sanity at P1, owner questions batched, a model per role — and how to measure tokens:
[`references/execution-rules.md`](references/execution-rules.md). Read it before the first tool call of a port.

## Toolkit — copy into the template's `tools/`, run from the template folder

`scripts/new-template.sh <target> [package] [template-id]` copies `scripts/tools/*`, `scripts/src/*`, `scripts/tests/*`
and a skeleton `template.config.json` into a new package (also `scripts/contract/` and `scripts/ingest/`, which `compile-seed.mjs` and the copied tests import). It does **not** scaffold the Astro project — `package.json`, `astro.config.mjs`, `tsconfig.json`, `components.json`, the layout, styles, `[...path].astro` and a lockfile come from a sibling theme on the same stack or are written per [`references/runtime.md`](references/runtime.md). The tools import `playwright`, `acorn`, `emdash`,
`better-sqlite3` from the **template's** `node_modules`: run them as `node tools/<x>.mjs` in the template folder, not
from the skill folder, and read identity (site name, locales, forms, audit policy, theme hook) from `template.config.json`.
Every tool, its flags and its phase: [`references/tools.md`](references/tools.md).

`npm test` (kit; `scripts/test-kit.mjs` runs the suite inside a throwaway template) or `node --test tests/*.test.mjs`
in the template runs the kit's 357 regression tests (`test(`/`it(` calls in `scripts/tests/*.test.mjs`; the runner
reports more, because a few are declared once in a loop) without a real EmDash site. Duration: ~8–9 min measured
14/09/2026 on a smaller suite — dated, not re-measured since. Needs Playwright's browser installed (`npx playwright install chromium`); do not run it
alongside another `visual-qa` run. `npm run test:docs` checks the counts these docs quote.

Which tool per phase (rows in `references/tools.md`). Every phase: `scripts/lessons.mjs scan <template> --phase <Pn>`
before it ([`references/lessons.md`](references/lessons.md)), `checkpoint.mjs complete` after it, `gates.mjs <qa-run>`
to read a `qa.mjs` report.

- **P0/P1** `checkpoint.mjs init` · `ingest/detect-source.mjs` first · `ingest/from-url.mjs` · `inventory.mjs` · `extract.mjs` · `render-source.mjs` · `qa-contract.mjs init`
- **P2** `contract/validate.mjs` · `compile-seed.mjs` · `validate-seed.mjs` · `generate-docs.mjs`
- **P3** `mint-admin.cjs` · `bootstrap-site.sh` · `clean-install.sh` · `fast-gate.mjs` + `visual-qa.mjs --scope fast-gate` + `qa-notes.mjs`
- **P4/P4.5** `seed-apply.mjs` · `backup.sh`/`restore.sh` · `personalize.mjs`
- **P5** `configure-smtp.mjs` · `mega-hover.mjs` · `fast-gate.mjs plan --changed` + `visual-qa.mjs --reuse`
- **P7** `qa.mjs` · `visual-qa.mjs --scope full` · `audit.mjs` · `admin-session.mjs` + `admin-roundtrip.mjs` · `recovery-check.mjs` · `qa-receipt.mjs`
- **P8** `release-chain.mjs` (runs `generate-docs.mjs --check` · `artifact.mjs` · `distribution.mjs pack` · `clean-install.sh` · `qa.mjs --artifact` · `content-api-gate.mjs` · `release.mjs` in order) · `provenance.mjs` · `lessons.mjs scan --pack`

## Personalization, brand and pages, Content API — what every package carries

- **Personalization** (P4.5): `seed/questions.json` + `seed/personalize.json` + `tools/personalize.mjs` ship in every
  package; `new-template.sh` places the two `seed/*` files as placeholders and `tools/release.mjs` refuses a package
  that leaves them so (`personalize-gate.mjs`). The six map kinds, the model chain, the journal and why it is a gate:
  [`references/brand-and-pages.md`](references/brand-and-pages.md) §Personalization.
- **Brand and pages** (P4.6, 08/10/2026): Tracy's seven questions reach the site only where the template reads them;
  the kit ships `src/lib/brand.ts`, `src/lib/media.ts`, `src/lib/display-locale.ts`, `src/components/site/BrandLogo.astro`
  (held byte for byte by `check-kit-sync.mjs`); what the template writes and the checklist:
  [`references/brand-and-pages.md`](references/brand-and-pages.md).
- **Content API and provenance stamps** (27/09/2026): every template answers Tracy's Content API (`tools/content-api/`)
  and prints stamps for preview-pick requests only; ordinary requests get byte-identical HTML. Gates:
  `content-api-gate.mjs`, and `release.mjs` rejects a package without it. Ownership table and stamp rules:
  [`references/content-api.md`](references/content-api.md).

## Eleven invariants — a violation is a bug, not a choice

1. **Content lives in the CMS, not in code.** Text, images, links, figures, menus are fields/settings/menus;
   layout, colour, spacing belong to the template. No HTML blob as "the whole page".
2. **Images go through the importer, not through the seed's `$media`** — measured on EmDash 0.37: only `$media.url` is
   downloaded (D14); `references/runtime.md` does not record it re-measured on 1.1.
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
10. **Canonical/hreflang is a written policy** (D27): canonical = path + `page`; every indexable page has full
    hreflang + x-default; noindex/404 are explicit exceptions in `template.config.json → audit`; the audit
    must **be able to fail** (negative fixture) before trusting that it passes.
11. **Visual QA by tier, Fast Gate before full, every page in scope measured, notes are todos with grounds that only the
    lens which opened them closes; `visual-review` passes on five machine checks, signed by no one; subsets never pass
    the `visual` gate; full scope runs twice on the clean path.** The rules are stated once, in
    [`references/qa-lenses.md`](references/qa-lenses.md) (§2–§8, loop caps §6); how to measure — components listed
    first, a green probe on a broken render is a FAIL, scanners print `examined`:
    [`references/visual-review-method.md`](references/visual-review-method.md).

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
