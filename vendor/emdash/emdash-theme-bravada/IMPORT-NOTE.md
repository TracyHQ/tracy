# Import into TCH — Tracy WILL modify this tree, and it carries a copyleft licence

`vhscom/emdash-theme-bravada` at tag **`v0.10.0`**, commit
`f39df8784712bf97545675d4d9e2e25492b41529`, imported 10/09/2026 with `git subtree add --squash`.
**545 files, 33.75 MB.** Author: vhs (`vhsdev@tutanota.com`), the Astro/EmDash port of the WordPress
theme *Bravada* (Cryout Creations).

## Why this tree, and not an official template

Decided 10/09/2026: **import bravada and plug Tracy's customization on top**, following the precedent of
`vendor/dsh-passwords` — other people's code that Tracy really modifies, not read-only.

Measured across four trial-built templates: bravada is the **only one outside the official repo** that both has a home page
made of CONTENT (16 `bravada.*` block types, 9 saved sections, 4 widget areas) and carries a **hand-written EmDash
plugin** (`src/plugins/bravada-theme/`) that builds a settings page with Block Kit and stores it in the plugin's
KV. A scan of 33 routes at evaluation time: **33/33 returned 200**, no errors — whereas the two Lexington themes
gave 13 "variable does not exist" errors.

## 🔒 GPL-3.0-or-later — consequences, not an idle warning

`LICENSE` in this tree is GPLv3. Tracy **distributes** the template to customers' sites, so:

- Tracy's version derived from this tree **is a derivative work** and must carry GPL-3.0-or-later.
- Recipients (customers) have the right to ask for the source. Here that burden is unusually light: the template is an
  Astro app **already sitting on their site** as source code — they already have what the licence requires us to give.
- ⚠ **The part that needs care is what Tracy mixes INTO it.** `@tracy/cms-sections` currently declares `UNLICENSED`.
  Pouring those 13 sections into this tree and releasing it to customers is releasing a combination that GPL requires to be opened
  in full. That is a **licensing decision for the owner**, not a technical detail, and it must be settled before the
  first section is built in here. The detour if the sections should stay closed: keep them as **data**
  read at run time (JSON/HTML seeded into the CMS) rather than jointly compiled code — but that boundary
  is thin; ask a lawyer before relying on it.

## 33.75 MB, and 94% of it is images

| Part | Files | Size |
|---|---|---|
| **`public/images/`** (demo images + prebuilt AVIF/WebP variants) | 429 | **31.89 MB** |
| Code, seed, docs | 116 | ~1.9 MB |

Imported **with the images**, deliberately. Reason and precedent: `vendor/joomlart-t4-skill` once left out `assets/` and
had to bring it back, and the commit that brought it back (`e0e4c350`) records the exact lesson — *"that argument is right but missing a
measurement"*. Here the measurement is: the repo's `.git` was already ~1.1 GB, so 33 MB is **+3%**; and a template missing
429 images breaks every demo page on the very first `astro dev`, so it cannot be evaluated.

The images are **real CC0 / CC BY**, not placeholders — the full attribution table is in `CREDITS.md` in this
tree. Do not delete that table when customizing.

🔒 `git subtree --squash` collapses HISTORY, not SIZE. These 33 MB are in every `git
clone` by everyone, forever. Deleting the folder in a later commit does **not** get it back.

## How to change it correctly here

This is an exception to RULE #5 in the `dsh-passwords` direction: **Tracy really edits it, in place.** That comes with
two obligations, and both have precedent in that package:

1. **Bump the version with a `-tracy.N` suffix** in `package.json` on every change (`dsh-passwords` is at
   `2.6.6-tracy.30`). It goes to no registry — it is the number that answers *"how far does the running copy drift from
   upstream"*.
2. **Bring this tree within reach of the gates.** `vendor/` stands outside every gate: `check-language` only scans
   `['packages', 'workers', 'vendor/dsh-passwords/src']`; `check-self-contained` skips all of
   `ROOT/vendor`; oxlint has `"vendor/**"`; biome has `"!vendor/**"`. Code running on a customer's site that no
   gate looks at is exactly the fail-open shape this repo refuses everywhere else — so this tree's `src/`
   must go into `SCAN_DIRS` the way `dsh-passwords` did on 30/08.

## Raising the version

```bash
git subtree pull --prefix vendor/emdash-theme-bravada \
  https://github.com/vhscom/emdash-theme-bravada.git v<version> --squash
```

Conflicts will land exactly on the files Tracy has changed — that is the price of a deep fork, and the reason the
customization should live in **new files** whenever possible, rather than scattered across upstream's files.

Upstream pins `emdash ^0.35.0`; `vendor/emdash` in this repo pins `0.37.0`. Those two numbers must
meet before this tree runs on the fleet's image.

## EmDash 1.0.1 — 29/09/2026 (`0.10.0-tracy.1`)

`emdash ^1.0.1`, `@emdash-cms/plugin-audit-log ^0.2.3`; the three agent skills under `.agents/skills/`
(`building-emdash-site`, `creating-plugins`, `emdash-cli`) replaced by upstream's `emdash@1.0.1` copies
(`vendor/emdash/emdash/skills/`), which drop the CLI commands 1.0 removed (`emdash dev`, `emdash plugin`)
and `Comments`/`CommentForm` from `emdash/ui`. No code change was needed: no removed subpath, no reference
field. Measured: build on v1.0.1, vitest 62/62; a fresh site seeded through `POST /_emdash/api/setup` (3
passes, `seedComplete:true`) serves 79 pages 200 plus the intended `/404-demo` — the same as 0.35.0 through the
same route. ⚠ Seeding with the CLI (`emdash seed`) instead leaves 19 routes 404 on 1.0.1; use the setup route
for this template (`tasks/todo-emdash-1-0.md`).

## EmDash 1.1.0 — 04/10/2026 (`0.10.0-tracy.2`)

`emdash ^1.1.0`; no code change. Measured: `pnpm install --frozen-lockfile=false` installs `emdash 1.1.0`, `astro check` 0 errors,
build completes, vitest 62/62. Not seeded/run as a site (not part of step 6 of `tasks/todo-emdash-1-1.md`). This tree is not
released as a quickstart.
