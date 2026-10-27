# tracy-joomla-template — skill `joomlart-t4`

Turns **any design source** into **a customer's Joomla website, built on a JoomlArt T4
quickstart**.

Give it a Pencil `.pen` file, a Figma file, the URL of a live website, an HTML
folder, or just a written description. It picks and installs a suitable quickstart from the JoomlArt
Products catalogue, then adapts that quickstart's template and content to match the design — **light and dark**, every
standard Joomla view, **editable in the admin** — checks it against real renders, sweeps for
recurring platform defects, then packages it as an installable zip plus an Akeeba quickstart
that has been checked to match.

> Licence: the skill's own files are MIT (`LICENSE`); the bundled T4 Framework, `t4_bs5_blank` and the
> shared layer are GPL-2.0-or-later (`COPYING`), released by JoomlArt on 26/10/2026. See
> [`NOTICE.md`](NOTICE.md).

> 📍 **The skill's home changed on 14/09/2026.** Before that it was a fork of
> `JoomlArt-26/joomlart-template-plugin`, Tracy's version numbered `-tracy.N`. From now on this repo is
> where the skill is developed, no longer anyone's derivative — so the version drops the fork suffix and
> restarts at **`1.1.0`**. The old repo stays as it is and takes nothing more.

## Which design sources it accepts

| You have | Adapter | What it is checked against later |
|---|---|---|
| A Pencil `.pen` design | `from-pen` (pencil MCP) | Each frame's image **plus** hex/px/weight values read straight from the design tool |
| A Figma file | `from-figma` (Figma MCP) | As above — frame images plus exact values from variables/styles |
| The URL of a live website | `from-url` (Playwright crawl) | Computed style measured on the real DOM |
| A multi-page HTML folder | `from-html` | Computed style, DOM against DOM — the strictest |
| Only a topic or a description | `from-brief` (you design it yourself) | No external target: replaced by a self-consistency gate |

Every adapter produces **the same** thing — a *spec-pack* — so the site-building pipeline never has to
learn five source formats. Contract: `skills/joomlart-t4-template/references/inputs/spec-pack.md`.

## Three contracts — what decides quality, and the newest part

Since 12–13/09/2026 the skill no longer works directly with "design" and "content" as two separate
piles of data. Phase 2 settles **three contracts**, and every later phase reads exactly those three files:

| Contract | What it is | Who reads it |
|---|---|---|
| **spec-pack** | The normalised design source: which pages, which images, what `reference.kind` is | Phase 2 → 8 |
| **content contract** (`content-contract.json`) | The site's business facts: name, figures, services, the text of each block. Phase 7 writes **all** text from it; Phase 8b reviews the meaning | Every agent, including agents doing newsletters / emails / slides |
| **design contract** (`design-contract.json`) | The approved style guide, pinned as measurements | Phase 6 paints, Phase 8/8b demand the full render matrix |

Every agent gets **the same path and the same hash** of the contract, so two agents cannot read
the same number differently.

## Install

```bash
# 1. clone — the repo is private, so you need an SSH key on the JoomlArt-Products org or `gh auth login`
#    (Permission denied / repository not found → INSTALL.md §1 "If the clone fails")
git clone git@github.com:JoomlArt-Products/tracy-joomla-template.git
cd tracy-joomla-template

# 2. node dependencies for the ingest, verify, review scripts
cd skills/joomlart-t4-template && npm ci && npx playwright install chromium && npm test
cd ../..
```

Then in Claude Code:

```
/plugin marketplace add JoomlArt-Products/tracy-joomla-template
/plugin install joomlart-t4@joomlart-t4
```

And say what you want:

- *"build a T4 template for Joomla 6 from designs/acme.pen"*
- *"turn this HTML folder into a JoomlArt T4 template"*
- *"make me a T4 template for an artisan bakery, dark background preferred"*

Other install paths (bare skill folder, Codex, Cursor): [`INSTALL.md`](INSTALL.md).

⚠ **Invoke the skill without a source and it asks one question, and only one** — do you have an HTML folder or a reference
URL. Before the answer it does **not** run commands, probe the machine, or suggest switching to another
platform. Loading the skill is a request-intake turn, not a server-diagnosis turn.

## What it does, phase by phase

| Phase | Output |
|---|---|
| **0 Provision** | Pick and install a T4 quickstart that fits the customer's request; a working site + baseline screenshots |
| **1 Scaffold** | Identify the installed template and style; clone the blank only when building a standalone template |
| **2 Ingest & Map** | Checked spec-pack + **content contract + design contract**; settle the page set and signature blocks |
| **3 Chrome** | Header, nav, footer, off-canvas, megamenu — seeded straight into the DB, where T4 actually reads them |
| **4 Layouts & theme** | Several `etc/layout/*.json`; theme + `palettes.json` carry **both** light and dark; **≥2 styles** |
| **5 Overrides + ACM** | `html/com_*` + `html/mod_*` and ~11 editable ACM blocks |
| **6 CSS tokenize** | `scss/` → `template.css` + `darkmode.css`; every colour goes through T4's tokens |
| **6b Imagery** | Licence-safe images |
| **7 Demo content** | A checked content plan; categories, articles, menus, modules + positions, megamenu seeding |
| **8 Verify** | Light + dark check of each view on the real render, branching on `reference.kind` |
| **8b Review** | Sweep for content consistency / editability / coverage / full dark / platform defects — **no finding left open** |
| **9 Package** | Remove traces of the blank, finish system pages + languages, zip, **test-install on a clean frame** |
| **10 Quickstart** | Akeeba `.jpa` + Kickstart, **checked to match the running build**, with a **Prune** step |

🔒 **The Prune step in Phase 10 is a lesson paid for with one broken package.** A quickstart built on top of
a base template carries the base's stuff: 18 ACM folders, 8 layouts, 6 profiles, 5 overrides, the base template
still installed, the base's css, the XML description copied verbatim, author/copyright/creation date and two wrong
thumbnails. No older gate caught it because it is not junk in the docroot. `scripts/quickstart/prune-audit.mjs`
measures from the DB, compares identities with the base build's `manifest_cache`, and exits 1 while anything is left to remove.

## Documentation shipped with the template — generated in Phase 10 · Q1b, the LAST task before the snapshot

A template that leaves this skill carries more than code and content: it carries **a documentation set for
the next maintainer and for agents** — `AGENTS.md`, the template's `README.md`, and a `docs/` folder.
They are generated/written in **Phase 10, step Q1b "Prepare `<SRC>`"**, right before Akeeba
snapshots the `.jpa` (Q2). That order is not a preference: the backup captures the site **as is**, so generating
the docs and then fixing one more article means the package carries the inventory from before that fix. The rule in the skill:
*"Regenerate the in-template agent docs LAST"* (`references/packaging-quickstart.md` §Q1b).

The real tree of a packaged template (`tracy_business`, 13/09/2026):

```
<webroot>/
  CLAUDE.md                       5-line pointer: "read templates/<tpl>/AGENTS.md first"
  AGENTS.md                       same content — two names because two kinds of agent look for different names
  templates/<tpl>/
    AGENTS.md                     13 rules + "what is where" + template layout — HAND-WRITTEN
    README.md                     for people: where it runs, how to change it, status, handover checklist, licence
    docs/
      .htaccess                   Require all denied — docs are not served on the web
      index.html                  empty, blocks listing on hosts that don't read .htaccess
      inventory.md      GENERATED extensions, modules by position, plugins — from #__extensions / #__modules
      site-map.md       GENERATED every published menu item, both languages, with associations
      blocks.md         GENERATED ACM catalogue: each block, each editable field
      positions.md      GENERATED position × layout × style
      design-system.md  hand-written  tokens, type, spacing of the measured design
      recipes.md        hand-written  "how do I change X" — by kind of task
      checks.md         hand-written  which commands decide a change is done (compile scss, clear cache, render)
      content-rules.md  hand-written  what the source provides, where it conflicts, what is still undecided
      cowork-api.md     hand-written  the com_claudecowork door: URL, where the token is, actions, examples
      languages.md      hand-written  which languages are installed, add/remove with tools/add-language.php
      language-packs.json         data for the two language scripts
```

**The four GENERATED files** open with a `GENERATED by … Do not edit; regenerate` banner — an agent hand-editing
a generated file edits something the next run overwrites. **The six hand-written files** are written in earlier phases
(design-system in Phase 2/6, content-rules in Phase 2/7, cowork-api and checks while building the environment)
and are only **reviewed** in Q1b, not written anew.

Also in Q1b, **after** the docs are generated and parity is done with: delete/rotate the Cowork door's token in
`#__extensions.params` and the build run's admin account — `scripts/quickstart/secret-scan.sh` (Q3)
goes red if any is left.

The full description — what each file is for, which phase writes which hand-written file, what Q1b reviews, and the five
checks before the snapshot — is in **`skills/joomlart-t4-template/references/agent-docs.md`**. The four generated
files are created by **`scripts/quickstart/gen-docs.sh`**, run in the site's PHP runtime (`--container`
for Docker, `--ddev` for DDEV), parameterised by template name — measured 14/09 on `tracy_business`:
the same 78 menu items · 86 articles · 165 modules · 50 blocks · 56 positions as the output of the workspace's old
script, `positions.md` byte-identical.

## What is in the repo

```
.claude-plugin/     plugin.json + marketplace.json  (v1.1.0)
agents/             10 reusable subagents (verify · audit · build · parity)
skills/
  joomlart-t4-template/
    SKILL.md        the router: principles, phase table, index of references + scripts
    references/     44 documentation packs — one per phase, plus inputs/ and darkmode/
    scripts/        ingest/ · review/ · quickstart/ · build + check tools · test/
assets/
  t4/               prepackaged Joomla 6.1.1 + T4 2.5.6 (61.8 MB)
  akeeba/           Akeeba Backup Core + kickstart.php, for Phase 10
```

**Nine scanners in `scripts/review/`** run in Phase 8b: `border-scan` · `contrast-audit` ·
`hover-scan` · `leak-scan` · `mega-hover` · `probe` · `runtime` · `seam-scan` · `toggle-test`.
`mega-hover` is the newest (13/09): it catches **the gap between the megamenu trigger and its panel** — moving the mouse
down closes the panel halfway, and no other gate sees it because the DOM is entirely valid.

**Operational tools**: `preflight.mjs` (probes capabilities once before a run), `checkpoint.mjs`
(records milestones with entry/exit evidence), `design-probe.mjs`, `reconcile-content.mjs` (reconciles against the installed
data instead of SQL with hard-pinned IDs).

## What it needs to run

- **DDEV** + a Docker provider if taking the DDEV path, or an existing Joomla target you are authorised to use
- **Node ≥ 18** — the ingest, verify, review scripts (`jsdom` + `playwright`). `package.json`
  declares no `engines`; measured 14/09/2026: **156/156 tests green on Node 24.11.1**
- **Sass** pinned in the skill's lockfile, installed by `npm ci`
- **A Playwright MCP** — drives the Joomla installer, runs the comparison renders, builds T4's megamenu
- **pencil MCP** only when the source is `.pen`; **Figma MCP** only when the source is Figma

No JoomlArt membership account needed: T4 already sits in `assets/t4/`.

## Five invariant principles

1. **The design is the visual specification; the content contract owns the business facts.** Match the
   presentation, don't "improve" it. Pixel and structure match are proven by real renders.
2. **Probe before concluding, check after fixing.** Always clear T4's optimize cache and render again.
3. **Tokenize, don't dump CSS.** Both palettes run on the same token set.
4. **Editable in the admin** — the number one reason JoomlArt sends a build back.
5. **Cover the whole agreed matrix** — including 404, offline, search, and the login / registration /
   profile flows.

## Running and regression checks

`SKILL.md` points to `references/execution.md` for the three run scopes (website / template / edit),
the preflight step, checkpoints and scanner configuration. `references/content-reconciliation.md` replaces SQL
with hard-pinned IDs with reconciliation against the installed data.

In the skill folder: `npm ci`, `npx playwright install chromium`, `npm test`. Browser tests
serve a one-time loopback fixture — they do **not** connect to any customer's site or database.
Changes to the runtime part are checked with the ingest test suite.
