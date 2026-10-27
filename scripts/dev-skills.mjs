#!/usr/bin/env node
/**
 * Build the skill library + design systems for THE AGENT RUNNING ON THIS MACHINE.
 *
 * WHY. On the fleet, `dsh/Dockerfile` bakes the enabled OpenDesign skills, the enabled Matt Pocock
 * skills and Tracy's own skills into `/opt/tracy/skills`, links one folder per preset from it
 * (`/opt/tracy/skill-sets/<role>-<platform>`, `skill-sets.json`), and each preset points
 * `customSkillDirs` (rank 300) at its own folder. A dev machine reads them all from here. A dev machine has NO `/opt/tracy` — that is the image's path — so an agent
 * here sees rank 300 empty. That is why asking the agent "is there a brand skill?" got a "no"
 * while `brandkit` sat in the enabled list.
 *
 * `$DSH_HOME/skills`, NOT `/opt`. Two reasons, and the second is the real one:
 *   1. `/opt` needs sudo; a dev script that asks for sudo is a script people skip.
 *   2. `skill-filesystem` scans `$DSH_HOME/skills` BY DEFAULT (rank 400; `dshHome` defaults to
 *      `$DSH_HOME` or `~/.dsh`). So the dev copy needs no config line at all — no dev-only cordis
 *      row, no machine path leaking into anything shipped. Config that dev and production share
 *      is config that cannot drift.
 *
 * RANKS MATTER: 100 `<workspace>/.dsh/skills` → 300 `/opt/tracy/skills` (image) → 400
 * `$DSH_HOME/skills` (this). On the fleet both 300 and 400 may exist; 300 wins, as intended — the
 * image copy is canonical, the dev copy only fills the gap where there is no image.
 *
 * SAME SEMANTICS AS THE DOCKERFILE, deliberately: the same `tracy-enabled.txt`, the same
 * `matt-enabled.txt`, the same two OpenDesign source folders, the same Tracy skills added last,
 * and the same `design-systems`, `design-catalog.json` and `craft` links. Drift here means dev and fleet see two different libraries —
 * the kind of wrong that only shows when a customer hits it.
 *
 *   node scripts/dev-skills.mjs           rebuild
 *   node scripts/dev-skills.mjs --check   report only, write nothing
 *
 * 🔒 `tch/skills`, `tch/design-systems`, `tch/design-catalog.json` and `tch/craft` are gitignored. They are
 * GENERATED from `vendor/`; committing copies would duplicate a library the repo already holds.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  unlinkSync
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OD = join(ROOT, 'vendor/tracy/od-skill')
/** mattpocock/skills keeps its skills in four group folders; a name is looked up in each. */
const MATT = join(ROOT, 'vendor/tracy/mattpocock-skills/skills')
const MATT_GROUPS = ['engineering', 'productivity', 'misc', 'in-progress'].map((g) => join(MATT, g))
const TRACY = join(ROOT, 'packages/design/tracy-design-skill')
const SYSTEMS = join(ROOT, 'vendor/tracy/od-design-system/systems')
const CATALOG = join(ROOT, 'vendor/tracy/od-design-system/catalog.json')
const CRAFT = join(OD, 'craft')

/** This repo's `$DSH_HOME` — `run.sh` sets exactly this value. */
const DSH_HOME = join(ROOT, 'tch')
const DEST = join(DSH_HOME, 'skills')
const SYSTEMS_LINK = join(DSH_HOME, 'design-systems')
const CATALOG_LINK = join(DSH_HOME, 'design-catalog.json')
const CRAFT_LINK = join(DSH_HOME, 'craft')

const check = process.argv.includes('--check')

/**
 * Names listed in an enabled-list file, blank lines and `#` comments dropped.
 * @param {string} file - path of the list.
 * @returns {string[]} the names, in file order.
 */
function enabledNames(file) {
  return readFileSync(file, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
}

/**
 * Point `link` at `target`, replacing whatever was there. A missing target is left alone:
 * the image does the same (`ln -sfn` on a path that exists at build time).
 * @param {string} link - symlink to (re)create.
 * @param {string} target - what it should point at.
 */
function relink(link, target) {
  if (!existsSync(target)) return
  try {
    unlinkSync(link)
  } catch {
    // Nothing there yet.
  }
  symlinkSync(target, link)
}

/**
 * Copy every enabled skill into DEST, looking for `<name>` under each source folder in turn.
 * OpenDesign keeps page workflows under `design-templates/`, not `skills/`, with the same
 * SKILL.md shape — one list, two folders, same as the Dockerfile loop.
 * @param {string[]} names - enabled names.
 * @param {string[]} sources - directories that may hold the skill folder.
 * @returns {{ copied: number, missing: string[] }} what landed, and names with no folder anywhere.
 */
function copyEnabled(names, sources) {
  const missing = []
  let copied = 0
  for (const name of names) {
    const from = sources.map((s) => join(s, name)).find((p) => existsSync(p))
    if (from === undefined) {
      missing.push(name)
      continue
    }
    cpSync(from, join(DEST, name), { recursive: true })
    copied += 1
  }
  return { copied, missing }
}

function main() {
  const odNames = enabledNames(join(OD, 'tracy-enabled.txt'))
  const mattNames = enabledNames(join(TRACY, 'matt-enabled.txt'))
  const tracySkills = existsSync(join(TRACY, 'skills')) ? readdirSync(join(TRACY, 'skills')) : []
  const odSources = [join(OD, 'skills'), join(OD, 'design-templates')]
  const expected =
    odNames.filter((n) => odSources.some((s) => existsSync(join(s, n)))).length +
    mattNames.filter((n) => MATT_GROUPS.some((s) => existsSync(join(s, n)))).length +
    tracySkills.length

  if (check) {
    const have = existsSync(DEST) ? readdirSync(DEST).length : 0
    process.stdout.write(`dev-skills: ${String(have)} skills in tch/skills (expected ${String(expected)})\n`)
    process.exit(have === expected ? 0 : 1)
  }

  // Rebuild from scratch: a skill removed from an enabled list must DISAPPEAR from here, not
  // linger because an earlier run copied it. Same reason the image builds a fresh directory.
  rmSync(DEST, { recursive: true, force: true })
  mkdirSync(DEST, { recursive: true })

  const od = copyEnabled(odNames, odSources)
  const matt = copyEnabled(mattNames, MATT_GROUPS)

  // Tracy's skills go LAST, in Dockerfile order. OpenDesign's `brand-extract` is out by its name
  // being absent from `tracy-enabled.txt`; since 06/09 nothing replaces it as a skill — reading a
  // brand is the `tracy_brand` tool of `@tracy/dsh-brand-engine`.
  for (const name of tracySkills) {
    cpSync(join(TRACY, 'skills', name), join(DEST, name), { recursive: true })
  }

  relink(SYSTEMS_LINK, SYSTEMS)
  relink(CATALOG_LINK, CATALOG)
  relink(CRAFT_LINK, CRAFT)

  process.stdout.write(
    `dev-skills: ${String(od.copied)} OpenDesign + ${String(matt.copied)} Matt + ${String(tracySkills.length)} Tracy skills → tch/skills\n`
  )
  for (const [list, missing] of [
    ['tracy-enabled.txt', od.missing],
    ['matt-enabled.txt', matt.missing]
  ]) {
    if (missing.length > 0) {
      process.stdout.write(
        `dev-skills: ${String(missing.length)} name(s) in ${list} have no folder: ${missing.join(', ')}\n`
      )
    }
  }
  process.stdout.write(
    `dev-skills: tch/design-systems → ${String(existsSync(SYSTEMS) ? readdirSync(SYSTEMS).length : 0)} design systems, tch/design-catalog.json → ${existsSync(CATALOG) ? 'catalog.json' : 'MISSING'}, tch/craft → ${String(existsSync(CRAFT) ? readdirSync(CRAFT).length : 0)} files\n`
  )
  process.stdout.write(
    'dev-skills: NO config change needed — skill-filesystem already scans $DSH_HOME/skills at rank 400.\n'
  )
}

main()
