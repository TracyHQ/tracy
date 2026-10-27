# `vendor/joomla/html/` — HTML design folders (input to the template-building skills)

Each subfolder here is a **design export**: static HTML or a Claude Design canvas export,
with images, fonts, PDFs and a style guide — drawn by Tracy or supplied by a customer. This is **not third-party code** like the
other vendor trees (no subtree, no submodule, no `-tracy.N` version) — it is the **immutable
input** of the template-building skills: `tracy-emdash-template` (EmDash) and `tracy-wordpress-theme` read it,
nobody edits it.

## Rules

1. **Do not edit the source.** The skill hashes every file into `qa.contract.json` (`source.files[].sha256`) and the
   acceptance gate re-checks them with `--source`; one changed byte breaks the contract, and that is intended. Gaps or
   contradictions in the source go into `content-gaps.md`, not patched in here.
2. **This tree travels with git.** Before 15/09/2026 it lived outside git, so `qa-contract.mjs --source` could only
   run on a machine that already had the folder. Now every file in the contract is in the repo — except machine
   junk (`.DS_Store`, `.teamshare/`), which has been removed from the tree **and** from the inventory (Business
   revision 16). Whoever adds a new source: delete those two **before** generating the contract.
3. **Ask the package's `PROVENANCE.md` about release rights; do not guess here.** A design folder can be
   a customer's property (must not leave the private repo) **or** Tracy's. `tracy_business` belongs to
   Tracy — the "Northgate Industrial" demo content written for the product, and it was decided on 14/09/2026 to release
   it with the package under **GPL-3.0-or-later** (`tasks/emdash-northgate/DECISIONS.md` D1). Later folders
   are not that way by default: with no line in `PROVENANCE.md`, treat it as not released.

## Present

| Folder | Customer / product | Read by |
|---|---|---|
| `tracy_business/` | Northgate Industrial — Claude Design canvas, EN + `RU/`, 95 files, 18 pages | `packages/cms/tracy-emdash-theme-business` (Tracy Business, EmDash) · `packages/cms/tracy-wordpress-theme/src/wp-tracy-business` (WordPress version) |
| `tracy_base/` | Tracy Base — a snapshot (`kind: url`) of the Joomla site `tracy-base-cleanup` (port 8216, 15/09/2026): `pages/` 83 HTML, `data/` JSON exported from the DB (menu/category/article/module/contact/tag/user + `content-contract.json`), `images/`, `media/tracy-marketing/`, `templates/tracy/css` tokens, `SNAPSHOT.json` hashes | `packages/cms/tracy-emdash-theme-base` (Tracy Base, EmDash) |
| `ja_kinetic/` | JA Kinetic (JoomlArt) — a same-origin crawl of 60 URLs of the Joomla 6 quickstart `ja-kinetic-j6-quickstart-1.0.0` running locally (15/09/2026): `index.html` + `crawl.json` (URL → file), `images/`, `media/`, `templates/`, `plugins/`; Helix observability demo content | `packages/cms/tracy-emdash-theme-saas` (Tracy SaaS, EmDash) |

Renamed 15/09/2026: `vendor/joomla/company_website` → `vendor/joomla/html/tracy_business` (the name says
the product built from it, and `html/` makes room for customers' design folders later).

`tracy_base/` was captured on 15/09/2026 with the build session's `scripts` (`tasks/emdash-tracy-base/`): the real source is the DB + webroot of the Docker cluster `tracy-base-cleanup`; the snapshot is what the QA contract hashes, and what later agents read once that cluster is no longer running.

`ja_kinetic/` was brought in on 29/09/2026 from the build machine (`~/TracyHQ/emdash-builds/ja-kinetic/source-crawl`, not a byte changed, `.DS_Store` dropped) in the same pass that brought the `tracy-emdash-theme-saas` package into the repo. Release rights for JA Kinetic: JoomlArt (the copyright owner) granted **GPL-2.0-or-later** on 26/10/2026 for the design, demo content, images and every file in `ja_kinetic/` (before that the layout said "Copyrighted Commercial Software" and `templateDetails.xml` said GPLv3). Full table: `docs/licensing.md`.

## `tracy_base/data/` — nine files that never made it into git (recorded 11/10/2026, TCH #1180)

The `data/` line in the root `.gitignore` (meant for local runtime data) swallowed `tracy_base/data/*.json` from the 15/09 capture: rule 2 above says "every file in the contract is in the repo", but these nine DB export files never were. The machine that captured them is gone and no copy could be found (searched by name and by hash on another developer's machine), so the Tracy Base `contracts` gate was red on every machine and the 0.5.0 release stopped there. Done: `.gitignore` re-opens `vendor/joomla/html/*/data/`; the `qa.contract.json` of `tracy-emdash-theme-base` drops the nine files from the inventory (revision 21), the remaining 254 files are still hashed as before. Whoever recovers exactly the bytes below: put them in `tracy_base/data/`, commit, then return them to the inventory (a new revision).

| File | SHA-256 |
|---|---|
| `data/articles.json` | `7a71cedd84d14d19e4756720071c1ccec6129bec23c0a9baa5fbd1215559a393` |
| `data/categories.json` | `245e4662302b1be8ebd885e4a87d0810051f2a90fd7926fb30a719f40a0aa51c` |
| `data/contacts.json` | `66fd478c8048ed45b20cb881a3ab8a10945ce4db459a63ec69963c9ec19e06c5` |
| `data/content-contract.json` | `d8c8782b3dd2fb90aeb038c2d3aa52f50193685cb0c08996ea260982b3364d3a` |
| `data/menu.json` | `9197bd02146e75719cc6ca07a20bdfdbce189bbafa815b36b5234a69d3261ce5` |
| `data/modules.json` | `db48ab73dfed127d72b87dd4ff13ba996d9ffb0292e11b38c6bda71964de39bd` |
| `data/tagmap.json` | `49df719a341a128011d560d844217512bef9953c6ac44149033b7d9bdaceffdf` |
| `data/tags.json` | `ae8b82884316634eb86164361518f60cdfb2a3a3a88ff1dfc1aaca8f262c90e0` |
| `data/users.json` | `f57ea67777c1234ed4f155e0a6ba401cc598189e2858566c67ff9c7791941bfe` |
