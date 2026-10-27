# AGENTS.md — tracy-emdash-template

Entry point for agents that do not read Claude Code's plugin/skill format (Codex, Cursor, and
similar). Everything here is plain files: markdown you read, and scripts that run under `node` and
`bash`.

## What this repository is

A method for turning a **folder of design HTML** — static pages or a Claude Design canvas export,
one or several languages — into a **running EmDash 0.37 website**: Astro SSR, Tailwind CSS 4,
shadcn/ui, content editable in the CMS admin, a repeatable importer, a machine-checked acceptance
gate, and a package that rebuilds itself on a clean site.

## Read this first

**`skills/tracy-emdash-template/SKILL.md`** is the router. It holds the input contract, the phase
table (P0 → P8) with the one reference packet to open per phase, the eleven invariants, and the
stop conditions.

**Read one packet at a time.** The references are large; skimming them all up front is how detail
gets missed. Open what the router names for the phase you are on, execute, measure, then move on.

## The shape of the work

```
P0 Archaeology   read the CMS source, pin the stack and the licence position
P1 Inventory     hash every source file, classify every page, resolve every asset, record gaps
P2 Content model collections, taxonomies, menus, a valid seed.json, a media map
P3 Runtime       the site running, admin round-trip proven, a second clean site from source + lockfile
P4 Importer      receipts, adopt, conflicts, drafts, media by content hash, backup/restore
P5 Pages         every route, every locale, real forms, 404 with chrome
P6 Skill         write back what was proven
P7 Acceptance    qa.contract.json → qa.mjs (contract · distribution · browser · routing · visual · receipts)
P8 Package       byte-verified artifact, docs, artifact.json, independent rebuild
```

## Running the tools

The kit lives in `skills/tracy-emdash-template/scripts/tools/`. A template **copies** it into its
own `tools/` and runs it from the template directory, because the scripts resolve `playwright`,
`emdash` and `better-sqlite3` from the template's `node_modules`. `scripts/check-kit-sync.mjs`
compares the two copies so drift is visible.

```bash
# start a new template package from this kit
bash skills/tracy-emdash-template/scripts/new-template.sh <target-dir> @tracy/emdash-theme-<name> tracy-<name>

# from inside the template, the loop of a phase
node tools/inventory.mjs <design-folder> inventory
node tools/seed-apply.mjs status  --site http://127.0.0.1:4360 --token-file data/tracy-agent.token
node tools/visual-qa.mjs --contract qa.contract.json --site http://127.0.0.1:4360 \
     --source-site http://127.0.0.1:4350 --out evidence/visual-1
node tools/qa.mjs --contract qa.contract.json --source <design-folder> --site <origin> \
     --out evidence/qa-1 --browser --visual --source-site <source-origin> --artifact <packed-dir> --reviews evidence/reviews
```

## The tests are the argument

`node --test scripts/tests/*.test.mjs` (run from `skills/tracy-emdash-template/` with its
dependencies installed, or from a template that carries the kit). They prove the gate can **fail**:
a mock EmDash API for the importer rules, a mock site for the browser and visual gates, negative
fixtures for every defect class the method claims to catch, and sentinel tests for the destructive
scripts (clean install, restore).

## What this method refuses to do

- Invent design. The source specifies presentation; a gap is recorded, not filled.
- Call a page done from a screenshot alone, or from a computed probe alone.
- Overwrite an editor's work to make an import succeed.
- Pass a gate without evidence, or widen a threshold to turn a finding green.
