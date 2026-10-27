# AGENTS.md — tracy-wordpress-theme

Entry point for agents that **do not read Claude Code's skill format** (Codex, Cursor, and the like). Everything here
is a plain file: markdown to read, scripts run with `node`.

## What this folder is

A method + toolset to turn **one source** — a running Joomla site, an HTML folder, a URL, a brief —
into **one WordPress 7 site on Tracy's block theme**, accepted by a real render against the source, packaged
as a theme zip and a quickstart for the fleet. Drawn from the Tracy Base 1.0.0 / wp7 build (`tasks/tracy-base-wp7/`).

## What to read first

**`SKILL.md` is the router.** It holds the invariants, the facts that must be pinned before writing a selector, and
the phase table that names **exactly one packet** to open for each phase.

**Each phase reads one packet.** `references/` has many files; skimming them all at once is how details get dropped. Open
exactly what the router points to, do the work, measure, and only then move to the next phase.

## Shape of the work

```
Phase 0   provision          Docker stand (wordpress:apache + mariadb:11 + wordpress:cli)
Phase 1   scaffold           build target tracy-base in packages/cms/tracy-wordpress-theme/overlays/
Phase 2   ingest             source → spec-pack through the gate     ← the multi-input step
Phase 3   chrome             header / footer / mega menu / wp_navigation
Phase 4   theme-json         theme.json generated from rootVariation, theme.overlay.json
Phase 5   templates-patterns 16 templates, 21 section-* patterns, metadata.name
Phase 6   css-dark           16 presets restated, tracy_theme cookie, three-state toggle
Phase 6b  imagery            licence-clean images
Phase 7   content            WP-CLI, look up the slug first, a rerun is an update
Phase 8   verify             light + dark parity according to reference.kind
Phase 8b  review             editability · coverage · dark · package
Phase 9   package            zip one tracy-base/ folder, clean install
Phase 10  quickstart         webroot.tar.gz + database.sql.gz + manifest.json (planned)
```

## One idea that makes multi-input work

Each source format has a **thin adapter** that emits the same set of artifacts — the **spec-pack**:

```
page-map.json · design-spec.md · design-contract.json · content-contract.json · reference/ · reference.json · provenance.json
```

From Phase 3 on, nothing looks back at the source. `reference.json` declares what the built page is compared against (`html` · `url` ·
`image` · `none`) and Phase 8 branches on exactly that field. Start at
`references/inputs/spec-pack.md`, then read **one** `from-*.md` that matches the source.

**Gate:** nothing downstream may read a spec-pack that has not passed

```bash
node scripts/ingest/spec-pack.mjs --validate <spec-pack-dir> [--page-floor N]
```

## Install

```bash
cd skills/tracy-wordpress-theme
npm install && npx playwright install chromium && npm test
```

Plus Docker (Phase 0, 7–10) with the images `wordpress:apache`, `mariadb:11`, `wordpress:cli`. Details and the
smoke test on the fixture: [`INSTALL.md`](INSTALL.md).

## Non-negotiable rules

- **The source is the visual spec.** Business facts come from `content-contract.json`; match the presentation, do not
  "improve" it. Parity is proven by a live render, never asserted from memory.
- **Everything the site owner can edit must be editable in the admin** — `post_content` with `role: content`, synced
  patterns, `wp_navigation`, site identity. Text baked into a template/part, `core/html` for text, hand-typed menu `<a>`
  are defects. `references/editability-standards.md`.
- **Do not invent.** An empty source field stays empty and goes into `content-gaps.md`; a number the source does not declare is written as
  "not declared in the source". Inventing is worse than leaving empty because every later phase trusts it.
- **Do not patch a check to make it pass.** Do not loosen a tolerance, do not shrink coverage, do not edit the verify stand, do not
  edit tests. A mismatch → fix the implementation, or settle a deliberate change with Lee and record it in `DECISIONS.md`.
- **No `--force`.** The seeder looks up the slug and then updates; no delete-and-recreate; no DB writes outside WP-CLI.
- **Edit the theme in `overlays/tracy-base/`**, then `node scripts/build.mjs --target tracy-base` (in
  `packages/cms/tracy-wordpress-theme/`). The `src/tracy-base/` tree is generated; the vendored `od-design-system`
  is not edited.
- **No hex outside the palette.** Colour goes through `--wp--preset--color--*`; dark is a preset restatement under
  `html[data-theme="dark"]`. A missing `data-theme` means `auto`, not a broken hook.
- **Docker: always `-p <project>`**; check the host disk before a heavy run — Docker dies silently when the disk is full.
- **Do not commit secrets**: `private-login.json`, `.env`, Cowork tokens stay out of the repo and out of the tar.

## Subagents

There are no predefined agent files. `references/build-subagents.md` says which work stays on the spine (the build spine
— shares live state) and which runs in parallel (verify, review — read-heavy, independent), with dispatch
prompts to use verbatim.
