# tracy-emdash-template

Turn a folder of design HTML into a **running EmDash 0.37 website** — Astro SSR, Tailwind CSS 4,
shadcn/ui — where every word, picture, menu and figure is editable in the CMS admin, the import is
repeatable, the acceptance gate is measured by machine, and the package rebuilds itself on a clean
site.

The skill is a **method plus a toolkit**, not one template. It was extracted from the first build
(Northgate Industrial, EN/RU, 24 routes, 14 collections) and is written to be run again on a
different design, in different languages, with different collections.

> Licence: MIT (`LICENSE`). The worked example cites Tracy's own demo content (Tracy Business /
> Northgate Industrial), released under GPL-3.0-or-later. See [`NOTICE.md`](NOTICE.md).

## What a run produces

| Phase | Output |
|---|---|
| P0 Archaeology | pinned stack, licence position, runtime decisions (`DECISIONS.md`) |
| P1 Inventory | every source file hashed, every page classified, every asset resolved, content gaps recorded |
| P2 Content model | collections, taxonomies, menus, a **valid** `seed.json`, a media map |
| P3 Runtime | the site running locally, admin round-trip proven, a second clean site from source + lockfile |
| P4 Importer | receipts, resume, conflict rules, backup/restore — an editor's work is never overwritten |
| P5 Pages | every route of the design, every locale, real forms, 404 with chrome |
| P6 Skill | what was proven, written back into this repository |
| P7 Acceptance | `qa.contract.json` → `qa.mjs`: contract, distribution, browser matrix, routing audit, **visual pass**, plus signed receipts |
| P8 Package | a byte-verified artifact, docs, `artifact.json`, and an independent rebuild |

## The parts

```
skills/tracy-emdash-template/
  SKILL.md                    the router: phases, gates, the eleven invariants, stop conditions
  references/                 one packet per phase — read one at a time, not all at once
    runtime.md                EmDash 0.37 measured facts, pinned versions, project shape
    source-inventory.md       hashing, page classification, asset resolution
    content-model.md          collections, i18n (row per locale), plugins
    frontend-stack.md         Astro + Tailwind + shadcn, the storefront/admin CSS boundary
    seed-and-recovery.md      the importer: receipts, adopt, conflicts, drafts, media identity
    qa-contract.md            qa.contract.json, the gate runner, receipts
    visual-review-method.md   four axes, screenshot + interaction + computed px, defect classes
    qa-and-packaging.md       the acceptance matrix and what ships
    package-docs.md           the eight documents a shipped package carries
    release-regressions.md    the failures a release must still be able to detect
  scripts/tools/              the kit a template copies into its own tools/
  scripts/tests/              regression tests: the gate must be able to FAIL
  scripts/new-template.sh     start a new template package from this kit
  examples/northgate.md       the first build, with its measurements and its costs
```

## The idea it is built on

A green crawl is not acceptance. Every claim in this method is a measurement with a name:

- **Content lives in the CMS, not in code.** Text, pictures, links and menus are fields; layout is the template.
- **A write through the admin API is a draft** — only `publish` reaches the public page.
- **The importer never overwrites an editor.** Untracked entries are adopted only when the live data already equals the seed; a changed seed plus a changed entry is a conflict, and conflicts stop the run.
- **Media identity is the content hash**, never a filename and a size.
- **Visual review is screenshot + interaction + computed pixels, on four axes** (light desktop, dark desktop, responsive light, responsive dark). A green computed probe over a visually broken render is a failure.
- **Pictures are counted against the rendered source**, so a picture the design promises and the site loses is a finding, not a silence.
- **The gate must be able to fail.** Every check has a negative fixture that proves it.
- **Nothing passes without evidence.** Human-judged gates pass through receipts that quote the contract hash, the artifact hash and the origin they were signed against.

## The documents a template ships with — written from P2, finished at P8, the LAST step before packing

A template that leaves this skill carries more than code and content: it carries **the documents
its next maintainer and their agent will read** — `AGENTS.md`, the template's `README.md` and a
`docs/` folder. The recipient may hold only the installed package, never this skill, so the package
must explain itself. Packet: [`references/package-docs.md`](skills/tracy-emdash-template/references/package-docs.md).

Two layers, two owners:

| Layer | Who writes it | When |
|---|---|---|
| **Authored** — `AGENTS.md` + eight `docs/*.md` | the template agent, from the scaffold in `assets/package-docs/` that `new-template.sh` copies over | starts at **P2** when the content model settles (content-model, content-rules, design-system), grows through P3–P5 (install, architecture, content-api, languages, checks-and-recovery), **final review at P8** before `distribution.mjs pack` |
| **Generated** — `docs/generated/inventory.{json,md}` | `tools/generate-docs.mjs`, reading `package.json`, the lockfile, `astro.config.mjs`, `template.config.json`, the seed and the routes — never a database, `.env` or token | at **P8**, after every seed/config change and **before** `artifact.mjs`; `--check` is the gate: red on a missing authored file, an unfilled `DOCS_REQUIRED:` marker, or a stale inventory |

The real tree of a packed template (`@tracy/emdash-theme-business`, 2026-09-14):

```
<package>/
  AGENTS.md                      rules for agents: an Astro + EmDash app, not a CMS template folder;
                                 product identity; API writes are drafts; customer content is not edited — AUTHORED
  README.md                      for people: install, run, bootstrap, backup/restore, env, known limits
  docs/
    architecture.md    authored  the single-file router, views, islands, the storefront/admin CSS boundary
    install.md         authored  pnpm → build → start → bootstrap; a clean site from the package; Mailpit
    content-model.md   authored  which collection holds what, one row per locale, singletons
    content-api.md     authored  the admin API: PAT, PUT = draft, publish, discard, media
    design-system.md   authored  light/dark tokens, type scale, spacing — measured from the source
    languages.md       authored  which locales exist, how to add/remove one, hreflang/canonical
    content-rules.md   authored  what the source supplied, where it contradicts itself, recorded gaps, open decisions
    checks-and-recovery.md  authored  the commands that decide "done": qa.mjs, visual-qa, audit, recovery-check, restore
    generated/
      inventory.json   GENERATED collections + recursive fields, baseline counts, menus, taxonomies, form bindings, pins, routes, source fingerprints
      inventory.md     GENERATED the readable form of the above
  artifact.json                  generated after the docs: templateId, pins, per-file checksums
```

**The order at P8 is not a preference**: authored docs reviewed → `generate-docs.mjs` → `artifact.mjs`
→ `distribution.mjs pack`. Generate the inventory and then edit one more field, and the package
carries the inventory of the tree before that edit; `generate-docs.mjs --check` catches exactly this
(it compares source fingerprints), and `qa.mjs` computes `artifactHash` from the tree's real bytes,
so a package packed from a drifted tree shows too.

**Two limits, stated so nobody guesses:** the inventory is a snapshot of the **source**, not of the
running site — a dependency in the lockfile does not prove a plugin is enabled, a catch-all route
does not prove every URL it serves; runtime evidence lives in the P7 audit and receipts. And an
automatic fingerprint says "the source changed", never "the prose is still right" — after any source
change the agent still re-reads the guidance it touches.

## Install

See [`INSTALL.md`](INSTALL.md) — Claude Code plugin, a plain skill folder, or `AGENTS.md` for
agents that read neither.

## Requirements

Node ≥ 22.19 (24.x used), pnpm 11, Playwright with system Chrome for the visual pass, Docker only
if you want a local mailbox for form tests.
