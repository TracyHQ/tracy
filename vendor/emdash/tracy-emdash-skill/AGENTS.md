# AGENTS.md — tracy-emdash-template

Entry point for agents that do not read Claude Code's plugin/skill format (Codex, Cursor, and
similar). Everything here is plain files: markdown you read, and scripts that run under `node` and
`bash`.

## What this repository is

A method for turning a **folder of design HTML** — static pages or a Claude Design canvas export,
one or several languages — into a **running EmDash website** (pinned in `references/runtime.md`: emdash 1.1.0 on Astro 7): Astro SSR, Tailwind CSS 4,
shadcn/ui, content editable in the CMS admin, a repeatable importer, a machine-checked acceptance
gate, and a package that rebuilds itself on a clean site.

## Read this first

**`skills/tracy-emdash-template/SKILL.md`** is the router. It holds the input contract, the phase
table (P0 → P8) with the one reference packet to open per phase, the eleven invariants, and the
stop conditions.

**Before the first tool call of a port**, read `skills/tracy-emdash-template/references/execution-rules.md`
(cost, one job per session, foreground fan-out, model per role).

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
node tools/gates.mjs evidence/qa-1                       # one line per gate
node tools/checkpoint.mjs status checkpoint.json         # which phase still holds, which is stale
node tools/release-chain.mjs --pack <new> --target <new> --port <n> --source <design-folder> \
     --reviews evidence/reviews --out evidence/release-1 -- --visual --source-site <source-origin>   # P8 in one command

# from the skill folder: the traps that apply to this template before a phase
node skills/tracy-emdash-template/scripts/lessons.mjs scan <template-dir> --phase P5
```

## The tests are the argument

`npm test` from `skills/tracy-emdash-template/` with its dependencies installed (it checks the counts the docs
quote, `npm run test:docs`, then `scripts/test-kit.mjs` runs `scripts/tests/*.test.mjs` inside a throwaway
template — run in place, four of them go red for reasons that are not the product's), or
`node --test tests/*.test.mjs` from a template that carries the kit. They prove the gate can **fail**:
a mock EmDash API for the importer rules, a mock site for the browser and visual gates, negative
fixtures for every defect class the method claims to catch, and sentinel tests for the destructive
scripts (clean install, restore).

## What this method refuses to do

- Invent design. The source specifies presentation; a gap is recorded, not filled.
- Call a page done from a screenshot alone, or from a computed probe alone.
- Overwrite an editor's work to make an import succeed.
- Pass a gate without evidence, or widen a threshold to turn a finding green.
