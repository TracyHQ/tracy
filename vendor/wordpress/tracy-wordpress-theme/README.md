# tracy-wordpress-theme

Turns **one source** — a running Joomla site, an HTML folder, a live URL, or a brief — into **one WordPress
7 site on Tracy's block theme**: a gated spec-pack, `theme.json` generated from the design system, templates / parts /
patterns editable in the admin, content poured in with WP-CLI, light **and** dark, acceptance by a real render against
the source, then the theme zip and the quickstart for the fleet.

The skill was **drawn from the Tracy Base 1.0.0 / wp7 build** (13/09/2026, `tasks/tracy-base-wp7/`,
plan `tasks/todo-wordpress-theme-skill.md`). What has run is recorded as having run; what is new and planned is recorded as
planned — each packet says which.

## Inputs

| What you have | Adapter | What parity is checked against | Status 14/09 |
|---|---|---|---|
| Joomla quickstart folder (`inventory.json` + `render-routes.json` + `capture/templates/<tpl>`) | `from-joomla` | `kind: url` — computed style on both sides against the live Joomla site, dark cookie/hook on each side | **proven**: 40 pages, 51 posts, 14 categories, 3 menus, 46 ACM |
| HTML folder (bundle with a manifest, raw, or a **Claude Design canvas export**) | `from-html` | `kind: html` — rendered DOM (Playwright) against the target DOM, `--runs leaf` mode | **proven** 14/09 (`wp-tracy-business`): 17 pages × EN/RU, 134 sections, 8 menus, parity 17/17 per language |
| Live site URL | `from-url` | `kind: url` — live DOM, early snapshot | ported from T4, proven by tests |
| Brief / topic | `from-brief` (handwritten) | `kind: none` — self-consistency gate | no run yet |
| `.pen` Pencil · Figma | — | — | **no adapter yet** — export HTML, then `from-html` |

Every adapter emits **the same** spec-pack, so the pipeline learns only one format. Contract:
[`references/inputs/spec-pack.md`](skills/tracy-wordpress-theme/references/inputs/spec-pack.md).

## Phase → product

The phase list belongs to `scripts/checkpoint.mjs` (`PHASE_LIST`). Each phase **one** packet.

| Phase | Product | Packet |
|---|---|---|
| 0 provision | Docker stand `wordpress:apache` + `mariadb:11` + `wordpress:cli`, WP installed, permalinks | [`INSTALL.md`](INSTALL.md) §3 |
| 1 scaffold | build target `tracy-base` in `packages/cms/tracy-wordpress-theme/overlays/` | [`references/theme-json-tokens.md`](skills/tracy-wordpress-theme/references/theme-json-tokens.md) §2 |
| 2 ingest | spec-pack through `spec-pack.mjs --validate`, two contracts | [`references/inputs/spec-pack.md`](skills/tracy-wordpress-theme/references/inputs/spec-pack.md) → one `from-*.md` · [`design-contract.md`](skills/tracy-wordpress-theme/references/design-contract.md) · [`content-contract.md`](skills/tracy-wordpress-theme/references/content-contract.md) |
| 3 chrome | `parts/header.html`, `parts/footer.html`, mega menu block, `wp_navigation` | [`references/chrome-and-navigation.md`](skills/tracy-wordpress-theme/references/chrome-and-navigation.md) |
| 4 theme-json | `theme.json` generated from `rootVariation`, `theme.overlay.json` | [`references/theme-json-tokens.md`](skills/tracy-wordpress-theme/references/theme-json-tokens.md) |
| 5 templates-patterns | 16 templates, 21 `section-*` patterns with `metadata.name` | [`references/templates-and-patterns.md`](skills/tracy-wordpress-theme/references/templates-and-patterns.md) |
| 6 css-dark | `styles.css` restates 16 presets, `tracy_theme` cookie, three-state toggle | [`references/dark-light-mode.md`](skills/tracy-wordpress-theme/references/dark-light-mode.md) |
| 6b imagery | licence-clean images in the media library | [`references/inputs/spec-pack.md`](skills/tracy-wordpress-theme/references/inputs/spec-pack.md) §4 |
| 7 content | category / post / page / menu / synced pattern / redirect via WP-CLI, idempotent | [`references/demo-content.md`](skills/tracy-wordpress-theme/references/demo-content.md) |
| 7b i18n | Polylang free: languages, secondary-locale pages are top-level translations, per-language menus (theme), `seed.mjs --i18n polylang` | [`references/i18n-polylang.md`](skills/tracy-wordpress-theme/references/i18n-polylang.md) |
| 8 verify | light + dark parity for each view according to `reference.kind` | [`references/verify-recipes.md`](skills/tracy-wordpress-theme/references/verify-recipes.md) |
| 8b review | editability · coverage · dark · package; soft Theme Check | [`references/review.md`](skills/tracy-wordpress-theme/references/review.md) · [`editability-standards.md`](skills/tracy-wordpress-theme/references/editability-standards.md) |
| 9 package | **docs shipped inside the theme** (`AGENTS.md`, `README.md`, `docs/`, `generate-docs.mjs --check`), then zip one `tracy-base/` folder, install-smoke on a clean stand, Theme Check, make-pot — `package.mjs` 4/4 | [`references/package-docs.md`](skills/tracy-wordpress-theme/references/package-docs.md) · [`references/packaging.md`](skills/tracy-wordpress-theme/references/packaging.md) |
| 10 quickstart | prune → `webroot.tar.gz` + `database.sql.gz` + `manifest.json` → restore onto a clean stand → verify-parity across the two stands → `release/` | [`references/quickstart.md`](skills/tracy-wordpress-theme/references/quickstart.md) |

Across phases: [`lessons.md`](skills/tracy-wordpress-theme/references/lessons.md) (`lessons.mjs scan` at the start of a port and before Phase 8 and 9 — only the past defects whose trap is in the port's inputs) · [`gotchas.md`](skills/tracy-wordpress-theme/references/gotchas.md) · [`build-subagents.md`](skills/tracy-wordpress-theme/references/build-subagents.md) ·
[`wordpress-anatomy.md`](skills/tracy-wordpress-theme/references/wordpress-anatomy.md) (WordPress 7.1, one URL per line).

## Docs that ship with the theme — generated in Phase 9, BEFORE the zip, and carried by the zip

A theme that leaves this skill carries more than code: it carries **a doc set for the next maintainer
and for agents** — `AGENTS.md`, `README.md`, `readme.txt` (WordPress standard) and a `docs/` folder,
all **inside the theme folder**, so they go into `dist/<slug>.zip` and into the quickstart's webroot.
A recipient who only has the installed site still finds them in `wp-content/themes/<slug>/`.

They are filled/generated in **Phase 9**, before `package.mjs`: `generate-docs.mjs --check` is one
of that command's four gates, so a theme that still has a `DOCS_REQUIRED:` marker or a stale inventory
**cannot be zipped**. This order is not a preference — Phase 10 captures the webroot as it is, so the docs
must be finished before packing; changing the theme afterwards means rerunning `generate-docs.mjs` and packing again.

The real tree of `tracy-base` (14/09/2026):

```
overlays/tracy-base/          ← hand source (the overlay is copied as-is into src/tracy-base/ and into the zip)
  AGENTS.md          60 lines  HANDWRITTEN: what this site is · where to edit text · what not to edit · how to add a section
                               · dark mode · what to check and restore with
  README.md          22 lines  for people: what this theme is, the second build target, how to build/check
  readme.txt                   Theme Review standard: header, copyright, "not intended for wordpress.org"
  docs/
    architecture.md   107      HANDWRITTEN  overlay + generator, one language, REST is core
    install.md         76      HANDWRITTEN  install the zip, activate, dependent plugins (Contact Form 7), compose stand
    content-model.md   69      HANDWRITTEN  page/post/category/wp_navigation/wp_block/option — what lives where, which slug
    content-rules.md   55      HANDWRITTEN  what the source provides, named gaps, what is demo
    design-system.md   84      HANDWRITTEN  apple + airbnb look, token → preset, two pinned body layers
    checks-and-recovery.md 62  HANDWRITTEN  the skill's commands for checking (parity, scanner, editability), `wp db export`, restore
    generated/
      inventory.json  GENERATED  94 hashed files, 20 templates, 2 parts, 37 patterns (+ count of role:content blocks), 2 variations,
      inventory.md    GENERATED  presets, 1 block, 11 assets, 7 options, 22 hooks; spec routes + counts at seed time
```

**The six handwritten files** start from the **skeleton** `assets/package-docs/` (copied into the overlay at scaffold, each
file carrying a `DOCS_REQUIRED:` marker where a site-specific fact goes) and are filled in earlier phases:
`design-system` in Phase 4/6, `content-model`/`content-rules` in Phase 2/7, `checks-and-recovery`
when the stand is built — Phase 9 only **reviews** them and runs `--check`. **The two GENERATED files** open with the banner
"Generated by generate-docs.mjs … Edit sources, not this file" — generated from **files**, never
from the live DB; seed counts are labelled *"at seed time, not live"*. Full contract:
[`references/package-docs.md`](skills/tracy-wordpress-theme/references/package-docs.md).

Compared with the two sibling skills, all three have the tooling; they differ in **when** and **from what**: EmDash generates in
P8 with `generate-docs.mjs` from files; Joomla generates in Phase 10 Q1b with `scripts/quickstart/gen-docs.sh`
(PHP inside the site's runtime, reading `#__extensions`/`#__modules`/menus — the live DB, because the Joomla tree does not
describe modules and menus in files; packet `references/agent-docs.md`, since `2691a82aa` 14/09). Here the
generator reads **files** so two runs produce identical bytes, and `--check` is the zip's gate
(`scripts/test/generate-docs.test.mjs`, 5 cases).

## In this folder

```
SKILL.md              router: invariants, phase table, reference + script index
README.md AGENTS.md INSTALL.md NOTICE.md
references/           29 packet — inputs/ (8) · per phase (13, including i18n-polylang, package-docs, visual-qa) · cross-phase (7, including lessons.md + lessons.jsonl, measurement-protocol, tools.md) · wordpress-anatomy.md
examples/             content-contract.json · content-plan.json · design-contract.json (format, not defaults)
scripts/
  ingest/             spec-pack.mjs (gate) · from-joomla.mjs · from-html.mjs · from-url.mjs
  lib/                joomla-inventory.mjs · html-to-blocks.mjs · html-bundle.mjs · block-fill.mjs
  review/             runtime.mjs + leak/contrast/border/seam/hover/probe/toggle-test/mega-hover
  checkpoint.mjs content-contract.mjs design-contract.mjs design-probe.mjs make-design-spec.mjs
  parse-html-bundle.mjs port-checks.mjs (one line per recorded gate) shoot.mjs theme-tokens.mjs verify-render.mjs lessons.mjs (scan/show the lessons store)
  test/               node --test, fixtures joomla-min · bundle-min · raw-min · theme-tokens
```

## Install and try

[`INSTALL.md`](INSTALL.md): use it as a repo skill (`public-skills.txt` + `pnpm skills:sync`) or as a standalone
folder; Node ≥ 22.19 / 24; `npm install` + `npx playwright install chromium`; Docker; and a smoke test
on the bundled fixture. Agents that do not read Claude's skill format: [`AGENTS.md`](AGENTS.md).

## Five principles held throughout

1. **The source is the visual spec; the content contract holds the business facts.** Match, do not "improve".
   Parity by live render, not by memory.
2. **Measure before concluding, measure again after fixing.** Computed values, not images.
3. **Tokens, not CSS dumps.** No hex outside the palette; dark is a preset restatement.
4. **Editable in the admin** — the number-one reason a build is rejected.
5. **Cover the whole matrix** — including 404, search, login, and the three-state toggle.
