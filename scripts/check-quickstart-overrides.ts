/**
 * Gate: the template overrides `prepare-template.py` generates must MATCH what the profile locks.
 *
 * 🔒 WHY IT MUST BE A MACHINE. The failure this gate guards is one **nobody sees**:
 *
 *   - `prepare-template.py` writes `html/layouts/t4/element/megamenu.php` (and other hooks) into the
 *     template while packaging the archive;
 *   - each profile's `presentation-lock.json` **pins the sha256 of that very file** once it sits in the site;
 *   - the Claude Cowork plugin compares bytes at `inspect` and **refuses** on a mismatch.
 *
 * So changing the source **without** rebuilding the archive and recapturing the profile is a pushable
 * state, green on every test, and wrong two ways at once: customer sites still run the OLD override (the
 * fix never reaches them), and anyone patching a site by hand is blocked by the lock with a cryptic message.
 * No other gate sees it — `check-design-templates` compares `contractFiles` with the bytes of the profile in
 * the repo, and both are **equally stale**, so they match perfectly.
 *
 * Measured 12/09/2026, and the reason this gate exists: a T4 mega menu fix (the route had translated away the
 * mega layer, HTTP 200, nav still rendering — a silent failure) was committed to `prepare-template.py`. It
 * could not reach customers until the archive was rebuilt and **both** profiles recaptured, because that file
 * is hash-locked among Apple's 3900 files and Airbnb's 4170. Nothing said so.
 *
 * This gate turns "remember to recapture the profile" into a red line naming the exact file and profile.
 */
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const QUICKSTART = path.join(ROOT, 'packages/cms/tracy-joomla-quickstart')
const CONTRACTS = path.join(QUICKSTART, 'contracts')
const REGISTRY = path.join(
  ROOT,
  'packages/fleet/tracy-fleet-operation/scripts/provision/design-templates.json'
)

const problems: string[] = []
const sha = (text: string) => createHash('sha256').update(text).digest('hex')

/**
 * Files `prepare-template.py` writes **in full** (write_text with a literal), so their content can be
 * computed here without running the script or building the archive.
 *
 * The script's other hooks *insert into* existing files (`s.replace(marker, …)`), so the final bytes depend
 * on the source file and CANNOT be checked statically — they stay outside this gate on purpose.
 */
const WHOLE_FILE_OVERRIDES = [{ relative: 'html/layouts/t4/element/megamenu.php', what: 'mega menu' }]

const script = readFileSync(path.join(QUICKSTART, 'prepare-template.py'), 'utf8')

/** The literal content the script writes for a path, unescaped exactly as Python does. */
function writtenBy(relative: string): string | null {
  const escaped = relative.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const found = new RegExp(`\\(root/'${escaped}'\\)\\.write_text\\('''([\\s\\S]*?)'''\\)`).exec(script)
  if (!found) return null
  const literal = found[1]!
  // A Python `'''…'''` literal with `\\` in the source is one `\` in the written file.
  return literal.includes('\\\\') ? literal.replace(/\\\\/g, '\\') : literal
}

const registry = JSON.parse(readFileSync(REGISTRY, 'utf8')) as {
  designs: Record<
    string,
    {
      state?: string
      contractProfile?: string
      template?: { element?: string }
      preparedTemplate?: boolean
    }
  >
}

/**
 * 🔒 A TEMPLATE TRACY DID NOT BUILD HAS NO OVERRIDE TO PIN, AND SAYING SO IS THE REGISTRY'S JOB.
 *
 * `prepare-template.py` writes the mega-menu override into Tracy's own templates while it packages
 * the archive. A JoomlArt quickstart ships its template already built (`ja_voyara`, `ja_kinetic`),
 * Tracy never opens it, and the profile locks exactly the bytes JoomlArt shipped — so demanding the
 * override there would be demanding a file that has no reason to exist.
 *
 * It is a DECLARED exemption, not a guess from the id or the element name: a design says
 * `preparedTemplate: false`, and this prints how many it skipped. A design that says nothing is
 * still checked, so a new Tracy template cannot slip past by omission.
 */
const skipped: string[] = []

for (const [id, design] of Object.entries(registry.designs)) {
  if (design.state !== 'served') continue
  if (design.preparedTemplate === false) {
    skipped.push(id)
    continue
  }
  const profile = String(design.contractProfile ?? '')
  const lockPath = path.join(CONTRACTS, ...profile.split('/'), 'presentation-lock.json')
  if (!existsSync(lockPath)) {
    problems.push(`design ${id}: no presentation-lock for ${profile}`)
    continue
  }
  const lock = JSON.parse(readFileSync(lockPath, 'utf8')) as Record<string, unknown>
  const files = (lock.files ?? lock) as Record<string, string>

  for (const { relative, what } of WHOLE_FILE_OVERRIDES) {
    const content = writtenBy(relative)
    if (content === null) {
      problems.push(
        `prepare-template.py no longer writes ${relative} as a literal — this gate cannot read it any more, and it must NOT be skipped silently`
      )
      continue
    }
    const want = sha(content)
    // The override sits under the folder of EACH template the profile carries — and ONLY there.
    // ⚠ `plugins/system/t4/themes/base/…/megamenu.php` has the same path tail but is T4's ORIGINAL file,
    // which the override `require`s at the end. Comparing it with our literal compares two different files;
    // the first version of this gate went red for exactly that reason.
    const roots = Object.keys(files).filter(
      (name) => name.startsWith('templates/') && name.endsWith(`/${relative}`)
    )
    if (roots.length === 0) {
      problems.push(`${profile}: presentation-lock pins ${relative} for no template at all`)
      continue
    }
    for (const name of roots) {
      if (files[name] === want) continue
      problems.push(
        `${profile} (design ${id}) pins the ${what} at ${name} = ${String(files[name]).slice(0, 12)}…, ` +
          `but prepare-template.py now generates ${want.slice(0, 12)}… — the profile is STALE against the source: ` +
          `the fix cannot reach customer sites, and a manual patch will be refused by the lock. ` +
          `Rebuild the archive and recapture the profile.`
      )
    }
  }
}

/**
 * 🔒 A WHOLE-FILE TEMPLATE PATCH MUST BE WHAT THE NEWEST PROFILE OF ITS RELEASE PINS.
 *
 * `template-patches/<dir>/` holds files Tracy rewrote inside a quickstart's template, applied over
 * the archive before it is cut (template-patches/README.md). Editing one without cutting the next
 * version and re-pinning its profile is the same silent failure as above: the fix never reaches a
 * customer site, and the lock of the version that does ship calls the patched bytes drift. Checked
 * against the NEWEST version of the release's profiles — older versions pin older bytes on purpose.
 * Added 29/09/2026 with the Tracy Base `?theme` fix (tracy-base/j6 1.0.1).
 */
// Tracy Business joined on 08/10/2026 with its 1.2.1 cut: its dark-logo patch (T31) sat in this tree
// for a day while 1.2.0 was still the newest profile, and nothing said so.
// Tracy Apple joined on 16/10/2026 with its 1.3.1 cut (role variables): its template source changes
// live in `tracy/` now, so a later edit that is not cut into the next version is caught the same way.
const TEMPLATE_PATCHES = [
  { dir: 'tracy-base', template: 'tracy', release: 'tracy-base/j6' },
  { dir: 'tracy', template: 'tracy', release: 'tracy-apple/j6' },
  { dir: 'tracy_business', template: 'tracy_business', release: 'tracy-business/j6' }
]

const newer = (a: string, b: string): number => {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0)
  return 0
}

let patchedFiles = 0
for (const { dir, template, release } of TEMPLATE_PATCHES) {
  const root = path.join(QUICKSTART, 'template-patches', dir)
  const versions = readdirSync(path.join(CONTRACTS, ...release.split('/')), { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^\d+\.\d+\.\d+$/.test(e.name))
    .map((e) => e.name)
    // a version folder may hold only the design system's measurement file (design-system-measurement.json)
    .filter((v) => existsSync(path.join(CONTRACTS, ...release.split('/'), v, 'presentation-lock.json')))
    .sort(newer)
  const profile = `${release}/${versions.at(-1)}`
  const lock = JSON.parse(
    readFileSync(path.join(CONTRACTS, ...profile.split('/'), 'presentation-lock.json'), 'utf8')
  ) as { files: Record<string, string> }
  for (const relative of readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => path.relative(root, path.join(e.parentPath, e.name)).split(path.sep).join('/'))) {
    patchedFiles += 1
    const name = `templates/${template}/${relative}`
    const want = createHash('sha256')
      .update(readFileSync(path.join(root, relative)))
      .digest('hex')
    if (lock.files[name] !== want)
      problems.push(
        `template-patches/${dir}/${relative} = ${want.slice(0, 12)}…, but ${profile} pins ${name} = ` +
          `${String(lock.files[name] ?? 'nothing').slice(0, 12)}… — cut the next ${release} version ` +
          `with this file and capture its profile, or the fix never reaches a customer site.`
      )
  }
}

if (problems.length) {
  console.error(`Quickstart override gate: ${problems.length} problem(s)\n`)
  for (const line of problems) console.error(`  ${line}`)
  process.exit(1)
}
console.log(
  `Quickstart override gate: ${WHOLE_FILE_OVERRIDES.length} override(s) match the bytes in every served profile` +
    (skipped.length
      ? `, skipped ${skipped.length} design(s) declaring preparedTemplate: false (${skipped.join(', ')}).`
      : '.') +
    ` ${patchedFiles} template-patch files match their release's newest profile.`
)
