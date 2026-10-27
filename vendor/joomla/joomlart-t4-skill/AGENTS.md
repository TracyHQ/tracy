# AGENTS.md — joomlart-t4

Entry point for agents that do not read Claude Code's plugin/skill format (Codex, Cursor, and
similar). Everything here is plain files: markdown you read, and scripts that run under `node` and
`bash`.

## What this repository is

A complete method for turning **any design input** — a Pencil `.pen`, a Figma file, a live website
URL, a folder of HTML, or a written brief — into a **customer Joomla website based on a selected JoomlArt T4 quickstart**, verified
against the source and packaged for shipping.

## Read this first

**`skills/joomlart-t4-template/SKILL.md`** is the router. It holds the five invariant principles, the
three structural facts to pin before writing any selector, and a phase table that names exactly which
reference packet to open for each phase.

**Read one phase packet at a time.** The references total well over 300 KB; skimming them all up
front is how detail gets missed. Open only what the router names for the phase you are on, execute,
verify, then move on.

## The shape of the work

```
Phase 0   Provision   select + install a compatible T4 product quickstart (provision-quickstart.md)
Phase 1   Scaffold    identify the installed template; clone the blank only for standalone template builds
Phase 2   Ingest      the design → a validated spec-pack   ← the multi-input step
Phase 3   Chrome      header / nav / footer / off-canvas / megamenu
Phase 4   Layouts     etc/layout/*.json, theme + palettes (light AND dark), ≥2 styles
Phase 5   Overrides   html/com_* + html/mod_* overrides, ~11 ACM section blocks
Phase 6   CSS         scss/ → template.css + darkmode.css, everything through tokens
Phase 6b  Imagery     licence-safe images
Phase 7   Demo        categories, articles, menus, modules, megamenu seed
Phase 8   Verify      live light+dark parity against the spec-pack's reference
Phase 8b  Review      editability · coverage · dark completeness · platform defects
Phase 9   Package     de-blanked installable zip, smoke-tested clean
Phase 10  Quickstart  Akeeba .jpa + Kickstart, proven identical to the live build
```

## The one idea that makes multi-input work

Every input format has a thin **adapter** that emits the same artifacts — a **spec-pack**:

```
page-map.json · design-spec.md · design-contract.json · content-contract.json · reference/ · reference.json · provenance.json
```

From Phase 3 onward nothing looks at the original source again. `reference.json` declares what kind
of thing to compare the built pages against (`html` · `url` · `image` · `none`), and Phase 8 branches
on that one field.

Start at `skills/joomlart-t4-template/references/inputs/spec-pack.md`, then read the single
`from-*.md` matching your input.

**The gate:** nothing downstream may read a spec-pack that has not passed

```bash
node skills/joomlart-t4-template/scripts/ingest/spec-pack.mjs --validate <spec-pack-dir>
```

## Setup

Private repository — cloning needs an SSH key on the `JoomlArt-Products` org or `gh auth login`:

```bash
git clone git@github.com:JoomlArt-Products/tracy-joomla-template.git
cd tracy-joomla-template/skills/joomlart-t4-template
npm install && npx playwright install chromium && npm test
```

Also required: **DDEV** + Docker (Phase 0), **dart-sass** (Phase 6), and a **Playwright MCP** (the
Joomla installer, the megamenu builder, and every live verify render). A **pencil MCP** is required
only for `.pen` input, a **Figma MCP** only for Figma input.

For Codex, add Playwright to `~/.codex/config.toml`:

```toml
[mcp_servers.playwright]
command = "npx"
args = ["@playwright/mcp@latest"]
```

## Rules that are not negotiable

- **The design is the visual spec.** Business facts come from the site content contract
  (`references/content-contract.md`); match the presentation; do not "improve" it. Parity is proven by live render, never
  asserted from memory.
- **Clear the T4 optimize cache before every verify render** (`scripts/clear-cache.sh`). T4 bundles
  CSS/JS into `media/t4/optimize/<hash>`; without clearing it you are looking at stale output. This
  is the single biggest time-waster in the whole build.
- **The megamenu renders from the database, not from files.** It is driven by
  `#__template_styles.params['navigation_mega_settings']`. Shipping `etc/navigation/*.json` alone
  does nothing on the frontend.
- **Everything the site owner should edit must be editable in the admin** — ACM blocks, native
  modules, Joomla views. Content baked into template PHP is the #1 reason real JoomlArt reviews
  reject a build. See `references/editability-standards.md`.
- **Edit only inside `templates/<TPL>/` and the demo database.** Joomla core, the T4 plugin and
  extension code stay stock.
- **Never hardcode absolute paths or credentials** into scripts or references. The Joomla admin
  password is generated per run.
- **Never commit or echo secrets.** If T4 must be fetched from the member area (the fallback path),
  read the credentials from the environment and never print them.

## Subagents

`agents/*.md` are Claude Code agent definitions. Other tools cannot auto-register them, but each one
is a readable brief describing a role — verify a page group, audit editability, audit coverage, audit
dark mode, pre-check packaging, review one unit against the design, build the chrome cluster, build
one ACM block, build one override, compare quickstart parity. Use them as prompts, or run the phases
inline.

`references/build-subagents.md` explains which work belongs inline (the build spine — it shares live
state) and which parallelizes (verify and review — read-heavy and independent).

## Licence

`assets/t4/t4-framework-for-joomla-6.zip` is JoomlArt commercial software. **Keep this repository
private** — it lives at `JoomlArt-Products/tracy-joomla-template` and must never be made public. See
`NOTICE.md`.
