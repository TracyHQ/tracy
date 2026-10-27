/**
 * Content contract gate: every profile must say which quickstart it seals, and say it CORRECTLY.
 *
 * WHY IT MUST BE A MACHINE. A site without a contract is a site where the Claude Cowork plugin **allows
 * structural writes** — adding modules, changing layouts, unpublishing. Since 15/09 "which contract seals
 * this quickstart" is no longer a hand-copied field in `quickstarts.json`: `apps/tracy-web/src/lib/
 * contracts.js` indexes it from the profiles themselves, by the `quickstart.release` + `quickstart.version`
 * each `manifest.json` declares. That removed one hand-copied layer but created three new failures that
 * **make no noise** — all three land on the same result: "no contract found", i.e. the permissive state.
 *
 * 1. **A profile that does not declare `quickstart.release`/`version`.** It vanishes from the index. Sites
 *    built from that quickstart are born unsealed, and every screen stays green.
 * 2. **Two profiles claiming the same (release, version).** Which one wins depends on folder read order
 *    — i.e. which contract binds a site depends on folder names on disk.
 * 3. **A profile `id` that differs from the path holding it.** The `id` goes to the fleet and is written to
 *    `.content-contracts/<label>.json`; the seeder finds a profile by PATH
 *    (`data/quickstart-contracts/<id>/content-map.json`). A mismatch means the fleet seals the site with a
 *    name the seeder cannot open — and that error lands on a customer's machine, mid-build.
 *
 * This gate also keeps the two contract trees (`tracy-joomla-quickstart`, `tracy-wordpress-quickstart`)
 * mergeable: they are copied on top of each other into ONE folder in both places that use them — the
 * seeder (`tracy-seeder/scripts/build.mjs`) and the tracy-web image (Dockerfile) — so two profiles with
 * the same path in the two trees means one silently overwrites the other.
 */
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { contractCopyProblems, emdashCopyProblems } from '../apps/tracy-web/src/lib/contract-copy.js'
import { ungatedFactSlots } from '../apps/tracy-web/src/lib/fact-fields.js'
import { defaultEntries } from '../apps/tracy-web/src/lib/template-customization-question-readiness/readers/emdash-personalize-coverage.js'
import { TOKEN_NAMES } from '../packages/cms/tracy-wordpress-theme/lib/variation.mjs'
import { catalogIds, designProblem, readDesignFile } from './lib/contract-design.mjs'
import { patchEvidenceProblems } from './lib/patch-evidence.mjs'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const TREES = [
  'packages/cms/tracy-joomla-quickstart/contracts',
  'packages/cms/tracy-wordpress-quickstart/contracts'
]
/** Which CMS a tree is allowed to hold profiles for. */
const PLATFORM_OF: Record<string, string> = {
  'packages/cms/tracy-joomla-quickstart/contracts': 'joomla',
  'packages/cms/tracy-wordpress-quickstart/contracts': 'wordpress'
}

const problems: string[] = []
/** The ids a profile may wear (`design.id`): whatever the vendored catalogue lists, nothing else. */
const DESIGN_IDS = catalogIds(path.join(ROOT, 'vendor/tracy/od-design-system/catalog.json'))
/**
 * 🔒 A FACT FIELD LEFT OPEN IN A PROFILE IS A PLANNER'S TO INVENT (TCH #1326). The capture gated `requiresEvidence` by
 * module title only, so a hero's `stat-value`, a Branches `city` and a "Home - Stats" `value` shipped open, and dev
 * sites built from Tracy Business and JA Voyara showed "0", trade words and the customer's industry in them
 * (13/10/2026). Every Joomla profile is held to `apps/tracy-web/src/lib/fact-fields.json` here — except the ones
 * captured before the rule and already carried byte for byte by a shipped Claude Cowork plugin, listed in
 * `scripts/lib/evidence-sealed-profiles.json`: those cannot be regated in place (the plugin pins their bytes), and
 * the planner gates them at run time instead. The list only shrinks.
 */
const SEALED_FILE = 'scripts/lib/evidence-sealed-profiles.json'
/** The brand profile rows a patch's evidence is held to. */
const PROFILES = JSON.parse(
  readFileSync(path.join(ROOT, 'apps/tracy-web/src/lib/template-profiles.json'), 'utf8')
)
const SEALED = new Set<string>(JSON.parse(readFileSync(path.join(ROOT, SEALED_FILE), 'utf8')).profiles)
const sealedSeen = new Set<string>()

/** Every `manifest.json` under `dir`, as a path relative to it. */
function manifestsIn(dir: string): string[] {
  const found: string[] = []
  const walk = (at: string): void => {
    for (const entry of readdirSync(at)) {
      const full = path.join(at, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (entry === 'manifest.json') found.push(path.relative(dir, path.dirname(full)))
    }
  }
  walk(dir)
  return found.sort()
}

/** (release, version) → the profile that claimed it, across BOTH trees. */
const claimed = new Map<string, string>()
/** Relative directory → the tree that put a profile there; two trees, one path, is a silent overwrite. */
const atPath = new Map<string, string>()
let counted = 0

for (const tree of TREES) {
  const dir = path.join(ROOT, tree)
  for (const at of manifestsIn(dir)) {
    counted += 1
    const where = `${tree}/${at}`
    const seenTree = atPath.get(at)
    if (seenTree !== undefined)
      problems.push(`${where}: same path as ${seenTree}/${at} — the later copy overwrites the earlier one`)
    atPath.set(at, tree)

    const manifest = JSON.parse(readFileSync(path.join(dir, at, 'manifest.json'), 'utf8'))
    if (manifest.id !== at)
      problems.push(
        `${where}: id is "${manifest.id}", which does not match its path — the seeder finds profiles by path`
      )
    if (manifest.platform !== PLATFORM_OF[tree])
      problems.push(`${where}: platform "${manifest.platform}" but it sits in the ${PLATFORM_OF[tree]} tree`)
    // Which design system the quickstart wears is read from `design.json` beside this manifest by
    // tracy-web and the build (29/09/2026); a value this rule lets through is a binding — or a
    // silent "none" — on a site. The manifest itself stays sealed (its hash is pinned below).
    const design = designProblem(readDesignFile(path.join(dir, at)), DESIGN_IDS, {
      root: ROOT,
      release: String(manifest.quickstart?.release ?? ''),
      names: TOKEN_NAMES
    })
    if (design !== null) problems.push(`${where}: ${design}`)
    // What the template declares about its demo copy (D6 + D7, #1013) sits beside the directory as
    // `<version>.copy.json`; readiness rules ABOUT-2/ABOUT-3 read it, so an id that names nothing
    // would silently excuse or miss demo text. Absent is allowed: ABOUT-3 then fails the release.
    for (const p of contractCopyProblems(path.join(dir, at), PLATFORM_OF[tree]))
      problems.push(`${where}: ${p}`)
    // A WordPress patch cut by patch-artifacts.mjs: its evidence against the committed manifest, lock, content map,
    // profile row and brand facts; an inherited design-system measurement only with that evidence.
    if (PLATFORM_OF[tree] === 'wordpress')
      for (const p of patchEvidenceProblems(path.join(dir, at), at, PROFILES)) problems.push(`${where}: ${p}`)
    if (PLATFORM_OF[tree] === 'joomla') {
      if (SEALED.has(at)) sealedSeen.add(at)
      else {
        const slots = JSON.parse(readFileSync(path.join(dir, at, 'content-map.json'), 'utf8')).slots ?? []
        const open = ungatedFactSlots(slots)
        if (open.length > 0)
          problems.push(
            `${where}: ${open.length} fact field(s) without requiresEvidence (${open
              .slice(0, 6)
              .map((slot) => `${slot.key} ${slot.field}`)
              .join(
                ', '
              )}${open.length > 6 ? ', …' : ''}) — capture with --evidence-by-field, or run node scripts/regate-contract.mjs ${where} before the plugin that carries it is cut; a profile whose plugin is already cut joins ${SEALED_FILE} (the planner gates it at run time)`
          )
      }
    }

    const named = manifest.quickstart
    if (typeof named?.release !== 'string' || typeof named?.version !== 'string') {
      problems.push(`${where}: declares no quickstart.release/version — it will be missing from the index`)
      continue
    }
    // 🔒 THE NAME ON GITHUB IS LONGER THAN THE NAME ON DISK, ON PURPOSE. 78 JA quickstarts carry the tag
    // `quickstart/ja-kinetic/j6`, while the profile folder is `ja-kinetic/j6/1.0.0` — the seeder copies the
    // contract tree into `data/quickstart-contracts/<id>/`, so an extra `quickstart/` level there is one more
    // folder to walk with no added information. Compare after dropping that prefix; the rest must still
    // match character for character, since that is what says "this profile seals exactly that quickstart".
    if (`${named.release.replace(/^quickstart\//, '')}/${named.version}` !== at)
      problems.push(
        `${where}: declares it seals ${named.release}@${named.version}, which does not match its own path`
      )
    const key = `${named.release}@${named.version}`
    const before = claimed.get(key)
    if (before !== undefined) problems.push(`${key} is claimed twice: ${before} and ${where}`)
    claimed.set(key, where)
  }
}

// A sealed entry that names no profile is a stale exemption: it would excuse a profile re-made under that path.
for (const id of SEALED)
  if (!sealedSeen.has(id)) problems.push(`${SEALED_FILE}: ${id} names no Joomla profile — remove it`)

// A `<version>.copy.json` with no profile directory beside it belongs to no contract: nothing reads it.
for (const tree of TREES) {
  const walk = (at: string): void => {
    for (const entry of readdirSync(at)) {
      const full = path.join(at, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (
        entry.endsWith('.copy.json') &&
        !existsSync(path.join(full.slice(0, -'.copy.json'.length), 'manifest.json'))
      )
        problems.push(`${tree}/${path.relative(path.join(ROOT, tree), full)}: no profile directory beside it`)
    }
  }
  walk(path.join(ROOT, tree))
}

// EmDash declares the same two keys inside each theme's `seed/personalize.json` (it ships in the
// release's source zip); held to the same shape, and `keptText` to the theme's own seed.
for (const theme of readdirSync(path.join(ROOT, 'packages/cms')).filter((d) =>
  d.startsWith('tracy-emdash-theme-')
)) {
  const seedDir = path.join(ROOT, 'packages/cms', theme, 'seed')
  if (!existsSync(path.join(seedDir, 'personalize.json')) || !existsSync(path.join(seedDir, 'seed.json')))
    continue
  const read = (f: string) => JSON.parse(readFileSync(path.join(seedDir, f), 'utf8'))
  for (const p of emdashCopyProblems(read('personalize.json'), read('seed.json'), defaultEntries))
    problems.push(`packages/cms/${theme}/seed/personalize.json: ${p}`)
}

// 🔒 THE CLAUDE COWORK PLUGIN A WORDPRESS QUICKSTART PINS MUST CARRY THIS TREE'S PROFILE, BYTE FOR BYTE (Codex
// review #10). Provision installs the pinned zip and binds the site to the profile INSIDE it; the
// seeder and the build stage plan against the profile HERE. `quickstarts.json` records, per pinned
// Claude Cowork plugin, the sha256 of every profile file that zip carries (`Claude Cowork plugin.contractFiles`, written when
// the pin is made); when a file here is regenerated and the zip is not re-cut, the two profiles
// disagree and every apply is refused with "Content changed; inspect again" — on the customer's
// site, after a green merge. Offline: the zip is not fetched, the recorded hashes are compared.
const olderThan = (a: string, b: string): boolean => {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) < (pb[i] ?? 0)
  return false
}
const QUICKSTARTS = path.join(ROOT, 'packages/fleet/tracy-fleet-operation/scripts/provision/quickstarts.json')
const catalogue = JSON.parse(readFileSync(QUICKSTARTS, 'utf8')) as Record<
  string,
  {
    platform?: string
    contract?: string
    cowork?: {
      version?: string
      contractFiles?: Record<string, string>
      alsoCarries?: Record<string, Record<string, string>>
    }
  }
>
for (const [id, entry] of Object.entries(catalogue)) {
  if (entry.platform !== 'wordpress' || !entry.contract) continue
  const dir = path.join(ROOT, 'packages/cms/tracy-wordpress-quickstart/contracts', entry.contract)
  if (!existsSync(path.join(dir, 'manifest.json'))) {
    problems.push(
      `quickstarts.json ${id}: declares contract ${entry.contract} but the WordPress tree has no such profile`
    )
    continue
  }
  const files = entry.cowork?.contractFiles
  if (!files) continue
  const manifest = JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8'))
  // `manifest.coworkContractVersion` names the FIRST Claude Cowork plugin that carries this profile (tracy-web reads it
  // as the floor); a later patch of the plugin may be pinned as long as it is not older.
  // Profiles published before 27/09/2026 keep the pre-rename key; they are sealed and not rewritten.
  const contractVersion = manifest.coworkContractVersion ?? manifest.receiverVersion // vocabulary-allow: pre-rename key in published data
  if (contractVersion && entry.cowork?.version && olderThan(entry.cowork.version, contractVersion))
    problems.push(
      `quickstarts.json ${id}: pins Claude Cowork plugin ${entry.cowork.version}, OLDER than the coworkContractVersion ${contractVersion} that ${entry.contract}'s manifest.json requires`
    )
  // A Claude Cowork plugin may carry more than one profile (`alsoCarries`: contract id -> file hashes); each is
  // held to the same rule against this tree.
  for (const [otherId, otherFiles] of Object.entries(entry.cowork?.alsoCarries ?? {})) {
    const otherDir = path.join(ROOT, 'packages/cms/tracy-wordpress-quickstart/contracts', otherId)
    for (const [name, sha] of Object.entries(otherFiles as Record<string, string>)) {
      const file = path.join(otherDir, name)
      if (!existsSync(file))
        problems.push(
          `quickstarts.json ${id}: cowork carries ${otherId}/${name}, which this tree does not have`
        )
      else if (createHash('sha256').update(readFileSync(file)).digest('hex') !== sha)
        problems.push(
          `quickstarts.json ${id}: ${otherId}/${name} in Claude Cowork plugin ${entry.cowork?.version} differs from this tree — re-cut the plugin, then pin it`
        )
    }
  }
  for (const name of [
    'manifest.json',
    'content-map.json',
    'presentation-lock.json',
    'demo-trim-map.json',
    'editions.json',
    // The earlier base hashes this profile still accepts (build-wordpress-superseded.mjs): a Claude Cowork plugin
    // cut without it locks every site sealed before an in-place correction (0.13.6/0.13.7).
    'superseded.json'
  ]) {
    const file = path.join(dir, name)
    if (!existsSync(file)) {
      if (files[name])
        problems.push(`quickstarts.json ${id}: cowork carries ${name}, which this tree does not have`)
      continue
    }
    const here = createHash('sha256').update(readFileSync(file)).digest('hex')
    if (!files[name])
      problems.push(
        `quickstarts.json ${id}: cowork ${entry.cowork?.version} does not carry ${name} — re-cut the plugin, then pin it`
      )
    else if (files[name] !== here)
      problems.push(
        `quickstarts.json ${id}: ${name} in Claude Cowork plugin ${entry.cowork?.version} (${files[name].slice(0, 12)}…) differs from this tree (${here.slice(0, 12)}…) — re-cut the plugin, then pin it`
      )
  }
}

if (problems.length > 0) {
  console.error(`Content contract gate: ${problems.length} problem(s)\n`)
  for (const p of problems) console.error(`  ${p}`)
  console.error('\n  A profile missing from the index means sites built from that quickstart are NOT')
  console.error('  sealed — the state in which cowork allows structural writes.')
  process.exit(1)
}

console.log(
  `Content contract gate: ${counted} profiles, sealing ${claimed.size} (quickstart, version) pairs, none claimed twice.`
)
