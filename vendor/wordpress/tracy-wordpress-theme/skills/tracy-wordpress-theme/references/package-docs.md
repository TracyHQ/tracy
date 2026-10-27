> **Packet Phase 9 and 10.** Read when the theme is about to be zipped and when the quickstart is about to be captured. The installed package must stand on its own for a maintenance agent that receives only **the installed site** — no this skill, no worktree, no Lee.

# Docs shipped with the product

Two layers of docs, two owners, and the `generate-docs.mjs --check` gate holds the boundary.

## Why it is needed

This skill turns a source into a site. Whoever receives the site (the customer, or an agent on the fleet opening
that site six months later) has nothing but the running WordPress and the theme folder. Everything they need to know
— where text lives, what may be edited, which files are generated, how dark mode works, what to check the site with,
how to restore it — must **live in the theme**, in English, and be true for that exact site. Tracy's generic
docs cannot replace it: they do not know what this site's menus are called.

## Two layers

| Layer | Where | Who writes it | Language |
|---|---|---|---|
| **Skeleton** | `assets/package-docs/AGENTS.md` + `assets/package-docs/docs/{architecture,install,content-model,content-rules,design-system,checks-and-recovery}.md` | the skill, once | English |
| **Filled copy** for one theme | `overlays/<slug>/AGENTS.md` + `overlays/<slug>/docs/*.md` (same names) — the overlay is copied into `src/<slug>/` and into the zip | the agent building the theme, each run | English |
| **Generated** | `overlays/<slug>/docs/generated/inventory.{json,md}` | `scripts/generate-docs.mjs`, never edited by hand | — |

The skeleton carries a `DOCS_REQUIRED:` marker at each spot that is a site-specific fact (menu slugs, synced
pattern names, dependent plugins, known limits). The filled copy must **replace every marker with a measured fact**;
when a fact is missing, write "none" with the reason, do not invent. Tracy Base run 14/09: the seed created no
`wp_block`, so `content-model.md` says "no synced patterns at seed time" and names the contract that will
create them later — that is the right way.

Compared with the EmDash skeleton (`tracy-emdash-template/assets/package-docs/`): drops `content-api.md` (REST is
WordPress core, documented separately) and `languages.md` (single-language source); `architecture.md` says
so in one line.

## What the filled copy must contain

`AGENTS.md` is the entry point, ≤ 60 lines, answering six questions: what this site is · where to edit text (page/post
content, `wp_navigation` by slug, site identity options, the redirect option) · **what must not be edited** (every
generated file: `theme.json`, `styles/*.json`, `inspirations.json`, fixture/artifact CSS — edits are wiped by the next
build) · how to add a section (insert a `tracy-base/section-*` pattern, the `metadata.name`
convention) · how dark mode works (cookie `tracy_theme`, `html[data-theme]`, absent = auto) ·
what to check and restore with (the skill's commands, `wp db export`).

The six `docs/` files go deeper into each question. Every claim about WordPress behaviour carries a URL from
[`wordpress-anatomy.md`](wordpress-anatomy.md); every claim about the site carries how to check it (`wp post
list --post_type=wp_navigation`), because the docs are a snapshot while the site is live.

## `generate-docs.mjs`

```
node scripts/generate-docs.mjs --theme <overlay or src dir> [--spec <spec-pack>] [--seed-report <json>] --out <docs/generated>
node scripts/generate-docs.mjs … --check
```

Reads **files** only, never the live DB: templates, parts, patterns (slug, category, number of
`role: content` blocks), variations, `customTemplates`, colour/font/spacing presets, registered blocks, enqueued
assets, options and hooks that the PHP reads; plus the spec-pack's routes and the seed report's counts when
given, labelled *"at seed time, not live"*. Sorts every list, hashes every theme file, no timestamp of its
own → two runs produce identical bytes.

`--check` goes red when: a `DOCS_REQUIRED:` marker remains · one of the 7 authored files is missing or empty ·
the inventory is missing or drifts from the theme tree. It does **not** judge whether prose is right — a matching inventory and
an `AGENTS.md` that states a wrong menu slug are still green. That part belongs to the Phase 8b review.

## Order within a run

1. Phase 5 done (templates/patterns settled): copy the skeleton into the overlay if it is not there, fill `AGENTS.md` +
   `docs/` from the real tree and the decisions in the run's `DECISIONS.md`.
2. Phase 7 done: `generate-docs.mjs` with `--spec` and `--seed-report` → `docs/generated/`.
3. Phase 9 (`package.mjs`): `--check` must be green before zipping; the zip carries the docs.
4. Phase 10 (`release.mjs`): the release README points "For the site owner" at `AGENTS.md`/`docs/`
   in the theme.
5. Changing the theme afterwards → rerun step 2, then review the affected prose by eye; a fingerprint does not
   replace a reader.

## Measured on Tracy Base (14/09/2026)

94 fingerprinted files · 20 templates · 2 parts · 37 patterns (21 own with `role: content`, 16 inherited from
`tracy` without) · 2 variations · 1 block · 11 assets · 7 options · 22 hooks; spec 40 routes, 3 menus,
8 redirects; seed run 2: 43 pages, 51 posts, 14 categories, 6 navigations, 0 `wp_block`. `--check` exit
0. Zip +27 KB (inventory.json is most of it). Test: `scripts/test/generate-docs.test.mjs`, 5 cases.
