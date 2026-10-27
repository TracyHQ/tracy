/**
 * Design registry gate: the table deciding which template a new Joomla site is built from.
 *
 * WHY IT MUST BE A MACHINE. This table is the ONLY thing that answers "the customer picked Airbnb, what
 * site comes out", and it is read in **three places on three different runtimes**: `apps/tracy-web` (Node,
 * decides and shows the customer before Submit), `scripts/provision/design-plan.py` (Python, decides again
 * on the fleet host), and the Claude Cowork PHP plugin (keeps the profile the site is bound to). No runtime
 * can import another's, so the canonical copy sits next to the provision script — where it is ENFORCED —
 * and `apps/tracy-web/src/design-templates.json` is a mirror so the image and a checkout read the same path.
 *
 * One byte of drift between the two is two answers to one question, and **both report green**: the form
 * shows "this site uses Airbnb", provision builds Apple, nothing turns red. `revision` is the sha256 of the
 * file itself — two drifted copies mean two drifted revisions, and every site creation dies in
 * `design-plan.py` with a message about the registry, not the template. That is the loudest failure
 * possible, but it happens ON A CUSTOMER'S MACHINE. This gate catches it here.
 *
 * Four more things the human eye does not catch:
 *
 * 1. `library.ids` is GENERATED DATA from `vendor/tracy/od-design-system/catalog.json`. It separates
 *    "a real design not yet served" (→ fallback with a notice) from "an unknown id" (→ refused). A missing
 *    id turns a real design into invalid input; an extra id opens the fallback door for a string nobody
 *    checked.
 * 2. `contractFiles` must match the bytes of the profile in `packages/cms/tracy-joomla-quickstart/
 *    contracts/`. A drift means the table promises a profile the repo does not have — and the Claude Cowork
 *    plugin refuses the site AFTER it has been built.
 * 3. `base.quickstart`/`base.version` must match `quickstarts.json`. Every design shares one archive; an
 *    entry pointing at another version is a base nobody downloads.
 * 4. `name` must be the catalog's name. It is the word the customer reads in the fallback sentence, and a
 *    coined name still reads smoothly.
 */
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { contractFor, readContracts } from '../apps/tracy-web/src/lib/contracts.js'
import {
  fetchReleases,
  RELEASES_REPO,
  shownOnInspiration
} from '../apps/tracy-web/src/lib/quickstart-releases.js'
import { COVERAGE_FILE } from '../apps/tracy-web/src/lib/content-coverage/reader.js'
import { SLOT_ROLES_FILE } from '../apps/tracy-web/src/lib/slot-roles.js'
import { MEASUREMENT_FILE } from '../apps/tracy-web/src/lib/template-design-system-readiness/readers/measurement.js'
import { SOURCE_FILE as NAVIGATION_SOURCE_FILE } from '../packages/cms/tracy-wordpress-quickstart/scripts/capture-navigation-source.mjs'
import { contractPairProblems } from '../apps/tracy-web/src/lib/template-profile-contract-pairs.js'
import {
  galleryCoverageProblems,
  profileTableProblems,
  TEMPLATE_PROFILES
} from '../apps/tracy-web/src/lib/template-profiles.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const CANONICAL = path.join(
  ROOT,
  'packages/fleet/tracy-fleet-operation/scripts/provision/design-templates.json'
)
const MIRROR = path.join(ROOT, 'apps/tracy-web/src/design-templates.json')
const QUICKSTARTS = path.join(ROOT, 'packages/fleet/tracy-fleet-operation/scripts/provision/quickstarts.json')
const CATALOG = path.join(ROOT, 'vendor/tracy/od-design-system/catalog.json')
const CONTRACTS = path.join(ROOT, 'packages/cms/tracy-joomla-quickstart/contracts')
const WP_CONTRACTS = path.join(ROOT, 'packages/cms/tracy-wordpress-quickstart/contracts')
/**
 * The three files a published profile has always had. They are the FLOOR, not the list: a profile
 * directory may grow (the multilingual work adds `multilingual-map.json` beside them), and a fixed
 * list would keep passing while an unpinned file shipped to a customer's site inside the Claude Cowork plugin
 * package. So `contractFiles` must name every file in the directory, and this is the floor that
 * says none of the original three may quietly disappear from that naming.
 */
const CONTRACT_FILES = ['manifest.json', 'content-map.json', 'presentation-lock.json']

const problems: string[] = []
const profileOf = (design: { contractProfile?: unknown }) => String(design.contractProfile ?? '')
const digest = (file: string): string => createHash('sha256').update(readFileSync(file)).digest('hex')

const canonicalBytes = readFileSync(CANONICAL)
let mirrorBytes: Buffer | null = null
try {
  mirrorBytes = readFileSync(MIRROR)
} catch {
  problems.push(
    `apps/tracy-web/src/design-templates.json is missing — the image would read a file that does not exist`
  )
}
if (mirrorBytes && !canonicalBytes.equals(mirrorBytes))
  problems.push(
    'the tracy-web registry mirror drifted from the canonical copy; copy it again: cp packages/fleet/tracy-fleet-operation/scripts/provision/design-templates.json apps/tracy-web/src/design-templates.json'
  )

// The quickstart catalog has a mirror in tracy-web for the same reason (`apps/tracy-web/src/sites/
// quickstarts.js`): the create door accepts a (platform, id) pair from it, provision.sh gates on it.
const QUICKSTARTS_MIRROR = path.join(ROOT, 'apps/tracy-web/src/quickstarts.json')
try {
  if (!readFileSync(QUICKSTARTS).equals(readFileSync(QUICKSTARTS_MIRROR)))
    problems.push(
      'the tracy-web quickstarts.json mirror drifted from the canonical copy; copy it again: cp packages/fleet/tracy-fleet-operation/scripts/provision/quickstarts.json apps/tracy-web/src/quickstarts.json'
    )
} catch {
  problems.push(
    'apps/tracy-web/src/quickstarts.json is missing — the create-site door would read a file that does not exist'
  )
}

const registry = JSON.parse(canonicalBytes.toString('utf8'))
const catalog = JSON.parse(readFileSync(CATALOG, 'utf8'))
const quickstarts = JSON.parse(readFileSync(QUICKSTARTS, 'utf8'))

const catalogIds: string[] = catalog.systems.map((s: { id: string }) => s.id).sort()
const catalogNames = new Map<string, string>(
  catalog.systems.map((s: { id: string; name: string }) => [s.id, s.name])
)
const declared: string[] = Array.isArray(registry.library?.ids) ? [...registry.library.ids] : []
if (JSON.stringify(declared) !== JSON.stringify(catalogIds))
  problems.push(
    `library.ids drifted from the vendor catalog (${declared.length} declared / ${catalogIds.length} real) — this is GENERATED data, copy it again from vendor/tracy/od-design-system/catalog.json`
  )
if (registry.library?.count !== catalogIds.length)
  problems.push(`library.count is ${registry.library?.count}, the catalog has ${catalogIds.length}`)

for (const [id, design] of Object.entries<Record<string, unknown>>(registry.designs ?? {})) {
  const where = `designs.${id}`
  if (design.name !== catalogNames.get(id))
    problems.push(`${where}.name is "${String(design.name)}", the catalog calls it "${catalogNames.get(id)}"`)

  const base = design.base as { quickstart?: string; version?: string } | undefined
  const entry = base?.quickstart ? quickstarts[base.quickstart] : undefined
  if (!entry) problems.push(`${where}.base.quickstart "${base?.quickstart}" is not in quickstarts.json`)
  else if (entry.version !== base?.version)
    problems.push(`${where}.base.version is ${base?.version}, quickstarts.json pins ${entry.version}`)
  // 4. The Claude Cowork plugin quickstarts.json pins must NOT be older than the design's `coworkMinVersion`.
  //    Measured 13/09/2026 on the integration branch: the registry demanded 0.16.0 for both designs (profiles
  //    1.2.0/1.1.0 exist only in that plugin) while the catalog still pinned 0.15.0 — a site provisioned that
  //    day installed 0.15.0 and died at bind because the plugin did not carry the profile. Correct, but late;
  //    `design-plan.py` copies the floor into the plan and nobody reads it back. This gate does.
  const pinned = String(entry?.cowork?.version ?? '')
  const floor = String(design.coworkMinVersion ?? '')
  const semver = (v: string) => v.split('.').map((n) => Number.parseInt(n, 10) || 0)
  const older = (a: string, b: string) => {
    const [x, y] = [semver(a), semver(b)]
    for (let i = 0; i < 3; i += 1) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) < (y[i] ?? 0)
    return false
  }
  if (entry && floor && (!pinned || older(pinned, floor)))
    problems.push(
      `${where}.coworkMinVersion requires ${floor}, but quickstarts.json pins Claude Cowork plugin ${pinned || '(none)'} — a site provisioned from here installs a plugin that lacks profile ${profileOf(design)} and dies at bind`
    )

  const profile = String(design.contractProfile ?? '')
  const files = (design.contractFiles ?? {}) as Record<string, string>
  const dir = path.join(CONTRACTS, profile)
  let onDisk: string[] = []
  try {
    // content-coverage.json and slot-roles.json are read by /ops and WO from the tree; they ship in no
    // Claude Cowork plugin package, so contractFiles never lists them.
    onDisk = readdirSync(dir)
      .filter((name) => name.endsWith('.json') && name !== COVERAGE_FILE && name !== SLOT_ROLES_FILE)
      .sort()
  } catch {
    problems.push(`${where}: no profile folder ${profile}`)
    continue
  }
  for (const name of CONTRACT_FILES) {
    if (!onDisk.includes(name))
      problems.push(`${where}: profile ${profile} lacks ${name} — these three files are a profile's FLOOR`)
  }
  // Every file in the directory must be named, and every name must be a file: `contractFiles` is
  // the complete manifest of what a Claude Cowork plugin package carries for this design, not a sample of it.
  for (const name of onDisk) {
    if (!(name in files)) {
      problems.push(
        `${where}.contractFiles does not list ${name} — this file goes into the Claude Cowork plugin package with nobody pinning its bytes`
      )
      continue
    }
    if (files[name] !== digest(path.join(dir, name)))
      problems.push(`${where}.contractFiles["${name}"] does not match the real file of ${profile}`)
  }
  for (const name of Object.keys(files))
    if (!onDisk.includes(name))
      problems.push(`${where}.contractFiles lists ${name}, but ${profile} has no such file`)
}

// The default profile is also the profile the Claude Cowork plugin pins in quickstarts.json: the same bytes must
// go into both the plugin package and this table, otherwise the site binds but the table describes another version.
// The design-system measurement sits in the profile folder (so the design names it), but /ops reads it
// from the tree only: no Claude Cowork plugin package carries it, so the pin never records it.
// The showcase-navigation map (`build-joomla-showcase-nav.mjs`) is carried since Claude Cowork plugin
// 0.24.57, so the pin records it; the WordPress navigation source it is computed from is not.
const fallbackDesign = registry.designs?.[registry.defaultDesign]
const coworkFiles = quickstarts[fallbackDesign?.base?.quickstart]?.cowork?.contractFiles
const fallbackCarried = Object.fromEntries(
  Object.entries((fallbackDesign?.contractFiles ?? {}) as Record<string, string>).filter(
    ([name]) => name !== MEASUREMENT_FILE && name !== NAVIGATION_SOURCE_FILE && name !== SLOT_ROLES_FILE
  )
)
if (coworkFiles && JSON.stringify(coworkFiles) !== JSON.stringify(fallbackCarried))
  problems.push(
    "the default design's contractFiles drifted from cowork.contractFiles in quickstarts.json — the Claude Cowork plugin package and this table describe two profile versions"
  )

// ── Claude Cowork plugin pins of every quickstart must match the profile bytes on disk ──────────────────────
//
// The loop above walks DESIGNS; a quickstart's own profile (`tracy-base/j6/1.0.0`) is pinned only
// under `quickstarts.json[..].cowork.contractFiles`, and until 15/09/2026 nothing in Tracy CI read
// that pin against the files. `packages/cms/tracy-seeder/scripts/build.mjs` does — but it runs in
// `build-dsh-image`, AFTER the merge. Measured 15/09: an editor reformat of
// `contracts/tracy-base/j6/1.0.0/content-map.json` (12155f98, same JSON, different bytes) passed
// every PR gate, then broke every dsh image build on `develop` for a day. The bytes are the
// contract (sha256 of the file that ships in the Claude Cowork plugin ZIP), so a formatter is a breaking change;
// this is the gate that says so before the merge.
// 🔒 THE PROFILE SAYS WHICH CONTRACT, NOT THE CATALOG (16/09/2026). The `contract` field was
// removed from `quickstarts.json`; the binding is now the index `apps/tracy-web/src/lib/contracts.js`
// builds from every profile's own `manifest.json`. Reading `entry.contract` here would find
// `undefined` and `continue` — the gate would pass by checking nothing, which is the one outcome
// this file exists to prevent.
const contractIndex = readContracts()
const contractById = new Map([...contractIndex.values()].map((c) => [c.id, c]))
for (const [id, entry] of Object.entries(quickstarts as Record<string, any>)) {
  const files = entry?.cowork?.contractFiles as Record<string, string> | undefined
  if (!files) continue
  // An entry that names its `contract` pins THAT profile's bytes: it is the profile the seeder build holds the pin to
  // (`packages/cms/tracy-seeder/scripts/build.mjs`, "Seeder/cowork contract mismatch" in build-dsh-image). Tracy Business
  // j6 names 1.2.1 while `version` still says the released 1.2.0 archive (08/10/2026); reading the profile sealed by
  // `version` instead made this gate and the image build demand two different sets of hashes for one pin.
  const sealed =
    (typeof entry?.contract === 'string' ? contractById.get(entry.contract) : undefined) ??
    contractFor(contractIndex, entry?.release ?? id, entry?.version)
  if (!sealed) {
    problems.push(
      `quickstarts.json["${id}"].cowork.contractFiles pins ${Object.keys(files).length} files, but no profile declares this quickstart (${entry?.release ?? id}@${entry?.version}) — the contract index cannot find it, so nobody checks those pins`
    )
    continue
  }
  // A WordPress quickstart's profile lives in the WordPress tree (since 25/09/2026 wp7 pins one too).
  const dir = path.join(sealed.platform === 'wordpress' ? WP_CONTRACTS : CONTRACTS, sealed.id)
  for (const [name, pinned] of Object.entries(files)) {
    const file = path.join(dir, name)
    if (!existsSync(file)) {
      problems.push(
        `quickstarts.json["${id}"].cowork.contractFiles lists ${name}, but ${sealed.id} has no such file`
      )
      continue
    }
    if (pinned !== digest(file))
      problems.push(
        `quickstarts.json["${id}"].cowork.contractFiles["${name}"] does not match the bytes of ${sealed.id}/${name} — the file changed (even just reformatted) after pinning; build-dsh-image will die at "Seeder/cowork contract mismatch"`
      )
  }
}

// ── Chrome slots: every key the seeder resolves without a model must exist in that profile ─────
//
// 🔒 The seeder fills the footer colophon and legal line itself (`chrome-slots.mjs`) because they
// are the base archive's branding, not customer content — that is what stops an Airbnb site from
// rendering the word "apple". If a profile is recaptured and one of those slot keys moves or
// disappears, the resolver silently stops resolving it, the planner hands it back to the model,
// the model marks it pending, and the leak returns wearing a stalled build as a disguise. None of
// that raises an error anywhere. So the link is checked here, where a break is loud.
const CHROME_SLOTS = JSON.parse(
  readFileSync(path.join(ROOT, 'packages/cms/tracy-seeder/src/chrome-slots.json'), 'utf8')
).profiles as Record<string, Record<string, unknown>>
for (const [contract, table] of Object.entries(CHROME_SLOTS)) {
  const design = Object.entries(registry.designs).find(
    ([, d]: [string, any]) => d.contractProfile === contract
  )
  // A profile that seals a quickstart release is served without any design in the registry: the
  // build restores the release and the site's seal names the profile (`contracts` gate). Its footer
  // carries the archive's own brand all the same (`tracy-business/j6`: "NORTHGATE").
  let sealsQuickstart = false
  try {
    const manifest = JSON.parse(
      readFileSync(path.join(CONTRACTS, ...contract.split('/'), 'manifest.json'), 'utf8')
    )
    sealsQuickstart = typeof manifest?.quickstart?.release === 'string'
  } catch {}
  if (!design && !sealsQuickstart) {
    problems.push(
      `chrome-slots.json lists ${contract}, but no design in the registry uses that profile, and it seals no quickstart either`
    )
    continue
  }
  const [id, entry] = (design ?? [null, null]) as [string | null, any]
  const whose = id === null ? 'quickstart' : `design ${id}`
  const mapPath = path.join(CONTRACTS, ...contract.split('/'), 'content-map.json')
  if (!existsSync(mapPath)) {
    problems.push(`chrome-slots.json lists ${contract}, but ${mapPath} does not exist`)
    continue
  }
  const slots = new Map((JSON.parse(readFileSync(mapPath, 'utf8')).slots ?? []).map((s: any) => [s.key, s]))
  for (const key of Object.keys(table)) {
    const slot = slots.get(key) as any
    if (!slot) {
      problems.push(
        `chrome-slots.json resolves ${key} for ${contract} (${whose}), but that profile's content-map has no such slot — the seeder will hand the slot back to the model and the base archive's text returns`
      )
      continue
    }
    if (typeof slot.maxCharacters !== 'number' || slot.maxCharacters <= 0)
      problems.push(`${contract}.${key} declares no usable maxCharacters`)
  }
  void entry
}
// And the other direction: a served design whose profile has the footer but no chrome entry is a
// design that will ship the base archive's branding. Silence there is exactly the bug.
for (const [id, design] of Object.entries(registry.designs) as [string, any][]) {
  if (design.state !== 'served') continue
  const mapPath = path.join(CONTRACTS, ...String(design.contractProfile).split('/'), 'content-map.json')
  if (!existsSync(mapPath)) continue
  const keys = new Set(
    (JSON.parse(readFileSync(mapPath, 'utf8')).slots ?? []).map((s: any) => s.key as string)
  )
  const table = CHROME_SLOTS[design.contractProfile] ?? {}
  for (const key of ['module-174.0', 'module-174.1', 'module-174.2', 'module-175.0'])
    if (keys.has(key) && !(key in table))
      problems.push(
        `design ${id} (${design.contractProfile}) has footer slot ${key} but chrome-slots.json does not resolve it — the site will carry the base archive's branding`
      )
}

// ── Template profiles: how each released template takes a customer's brand (plan T01, #1013) ──
//
// `apps/tracy-web/src/lib/template-profiles.json` answers "how many logos, does the template already
// show one, where do the writers put it" per release and version. A row with an unknown `logos`, a
// missing readiness flag or a footer slot the sealing contract does not have would send the Logo
// question and the brand writers the wrong way with nothing red anywhere, so the table is held here.
problems.push(...profileTableProblems(TEMPLATE_PROFILES, { contracts: contractIndex }))

// The newest contract of a Joomla/WordPress release needs its exact profile row, and the newest row its
// contract: a half-done cut is what dev /ops showed for tracy-business/wp7 1.3.7 (15/10/2026). The owed list
// names the pairs that were already missing when the rule came in; it only shrinks.
const OWED_PAIRS = JSON.parse(
  readFileSync(path.join(ROOT, 'scripts/lib/profile-rows-owed.json'), 'utf8')
).owed
problems.push(...contractPairProblems(TEMPLATE_PROFILES, contractIndex, { owed: OWED_PAIRS }))

/**
 * The releases on Design inspiration, read off GitHub (the same reading and the same predicate the
 * server uses: `fetchReleases`, `shownOnInspiration`), and what this gate says about them:
 *   - RED: a gallery release with no EXACT row in the profile table. The runtime falls back to the
 *     nearest lower row; the gate does not, so a re-release is profiled on purpose.
 *   - RED: a gallery release with no `tracy_site_pages.json`, or one the validator refused (every
 *     gallery release carries one since 07/10/2026, plan T34b-d; the Pages question offers that list).
 * The gallery lives on a private repository, so this needs `TRACY_RELEASES_GITHUB_TOKEN`; without
 * it the check is SKIPPED BY NAME, never silently green (the `templates` gate does the same).
 */
async function probeGallery(): Promise<{ warnings: string[]; skipped: string[] }> {
  const token = process.env.TRACY_RELEASES_GITHUB_TOKEN ?? null
  if (token === null)
    return {
      warnings: [],
      skipped: [
        `template-profiles.json and tracy_site_pages.json against the gallery: no TRACY_RELEASES_GITHUB_TOKEN — ${RELEASES_REPO} is private, not compared`
      ]
    }
  let readings: { reading: any }[]
  try {
    readings = await fetchReleases({ token })
  } catch (e) {
    return { warnings: [], skipped: [`gallery: GitHub did not answer (${(e as Error).message})`] }
  }
  const gallery = readings.map((r) => r.reading).filter((r) => shownOnInspiration(r))
  problems.push(
    ...galleryCoverageProblems(
      TEMPLATE_PROFILES,
      gallery.map((r) => ({ tag: r.tag, version: r.setting.version }))
    )
  )
  const warnings: string[] = []
  for (const r of gallery) {
    if (Array.isArray(r.pages)) continue
    const refused = typeof r.reason === 'string' && r.reason.includes('tracy_site_pages.json')
    problems.push(
      refused
        ? `${r.tag}@${r.setting.version}: tracy_site_pages.json was refused — ${r.reason}`
        : `${r.tag}@${r.setting.version}: carries no tracy_site_pages.json (the Pages question has no pages to offer)`
    )
  }
  console.log(
    `Gallery: ${gallery.length} releases on Design templates, compared with template-profiles.json.`
  )
  return { warnings, skipped: [] }
}

function finish({ warnings, skipped }: { warnings: string[]; skipped: string[] }): void {
  for (const line of warnings) console.log(`  ⚠ warning — ${line}`)
  for (const line of skipped) console.log(`  · skipped — ${line}`)
  if (problems.length) {
    console.error(`Design registry gate: ${problems.length} problem(s)\n`)
    for (const line of problems) console.error(`  ${line}`)
    process.exit(1)
  }
  console.log(
    `Design registry gate: ${Object.keys(registry.designs).length} designs over ${catalogIds.length} inspirations, canonical copy and mirror match.`
  )
}

void probeGallery().then(finish)
