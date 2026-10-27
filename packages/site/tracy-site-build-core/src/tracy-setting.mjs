/**
 * `tracy_setting.json` — the one file Tracy reads off a GitHub release, and the whole of what a
 * quickstart declares about itself.
 *
 * WHY A FILE OF TRACY'S OWN, next to the publisher's `manifest.json` rather than inside it (Lee,
 * 15/09): the manifest is written by whoever packaged the release and already carries three
 * different shapes across six releases, plus QA receipts nothing installs from. Tracy reads a small
 * file it defines: which CMS, which version, and which files of THIS release a build downloads with
 * which checksum. The publisher keeps their manifest; nobody has to agree on one document.
 *
 * 🔒 EVERY `file` IS CHECKED AGAINST THE RELEASE'S OWN ASSET LIST. A setting that names a file the
 * release does not have is the failure that lands on a fleet host, half way through provisioning a
 * customer's site, as a 404 inside a shell script. Here it is a sentence, before anything is
 * chosen. For the same reason a URL in the file is refused rather than followed: the download
 * address is composed from the tag and the file name, so a setting cannot point a host elsewhere.
 */

export const SETTING_SCHEMA = 'tracy-setting/v1'

export const PLATFORMS = Object.freeze(['joomla', 'wordpress', 'emdash'])

/**
 * The shapes a build of this CMS can install — a list of alternatives, not one list of parts.
 *
 * A PHP CMS arrives in one of TWO shapes, and both are on the shelf today (measured 15/09):
 * a captured site — a webroot tarball plus a database dump, restored the way an import is
 * (`tracy-apple/j6`, `tracy-business/j6`) — or ONE Akeeba bundle that Kickstart restores
 * (`tracy-base/j6`). EmDash has one shape: the packed template plus the SQLite state it was
 * captured with, restored by `emdash/quickstart-restore.sh`.
 *
 * Joomla has a THIRD, and it is the shape 79 older releases already sit in (measured 16/09):
 * `installer` — one zip holding a complete Joomla webroot AND its `installation/` folder, which
 * is Joomla's own installer. No .jpa, no database dump: the site is built on the host by running
 * `php installation/joomla.php install …` against the stack's MariaDB, and the demo content rides
 * in `installation/sql/mysql/custom.sql`, which that CLI does load (`InstallCommand`, step
 * `custom2`). Joomla only, because the installer is Joomla's — a WordPress package carries none.
 *
 * Alternatives rather than optional parts, because "webroot without database" is not a quickstart
 * missing a file — it is neither shape, and a build would get half a site.
 * @param {string} platform
 * @returns {string[][]}
 */
export function installShapesFor(platform) {
  if (platform === 'emdash') return [['source', 'state']]
  const shapes = [['webroot', 'database'], ['bundle']]
  if (platform === 'joomla') shapes.push(['installer'])
  return shapes
}

/**
 * The shape a release actually declares, or null when it is no shape at all.
 * @param {string} platform
 * @param {Record<string, unknown>} install
 */
function shapeOf(platform, install) {
  const optional = /** @type {Record<string, string[]>} */ (OPTIONAL_PARTS)[platform] ?? []
  const named = new Set(Object.keys(install).filter((p) => !optional.includes(p)))
  return installShapesFor(platform).find((s) => s.every((p) => named.has(p))) ?? null
}

/**
 * The parts of the first shape — what a writer composes by default.
 * @param {string} platform
 */
export function installPartsFor(platform) {
  return installShapesFor(platform)[0]
}

/**
 * Releases published before 27/09/2026 name the Claude Cowork plugin part `receiver` (vocabulary-allow), its pre-rename
 * name. A release is published and never rewritten, so every reader takes a setting through here
 * first: the old part is moved to `cowork`, in place. Returns the same object.
 * @template T
 * @param {T} doc
 * @returns {T}
 */
export function normalizeSetting(doc) {
  const install = /** @type {any} */ (doc)?.install
  if (!install || typeof install !== 'object' || Array.isArray(install)) return doc
  const legacy = 'receiver' // vocabulary-allow: pre-rename key in published data
  if (legacy in install && !('cowork' in install)) {
    install.cowork = install[legacy]
    delete install[legacy]
  }
  return doc
}

/** Parts a release may carry alongside a shape — Joomla's Claude Cowork plugin package. */
const OPTIONAL_PARTS = Object.freeze({ joomla: ['cowork'], wordpress: [], emdash: [] })

const VERSION = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/
const SHA256 = /^[a-f0-9]{64}$/

/**
 * Every way a setting can be wrong, as sentences. Empty means valid.
 * @param {unknown} doc
 * @param {{ assets?: string[] }} [opts] `assets`: the file names the release actually carries. Pass
 *   them whenever they are known — without them a file name is taken on trust, which is the one
 *   thing this file exists to avoid.
 * @returns {string[]}
 */
export function validateSetting(doc, { assets } = {}) {
  const problems = []
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return ['not an object']
  normalizeSetting(doc)
  const d = /** @type {Record<string, any>} */ (doc)
  if (d.schemaVersion !== SETTING_SCHEMA)
    problems.push(`schemaVersion must be ${SETTING_SCHEMA}, got ${JSON.stringify(d.schemaVersion)}`)
  if (!PLATFORMS.includes(d.platform)) problems.push(`platform must be one of ${PLATFORMS.join(', ')}`)
  if (typeof d.label !== 'string' || d.label.trim() === '')
    problems.push('label must say what a person sees on the screen')
  if (typeof d.version !== 'string' || !VERSION.test(d.version))
    problems.push('version must be a version like 1.0.0')
  if (typeof d.cms !== 'string' || d.cms.trim() === '')
    problems.push('cms must name the CMS version this quickstart builds')
  if (d.template !== undefined && (typeof d.template !== 'string' || d.template.trim() === ''))
    problems.push('template must name the template a new site is dressed in')
  if (d.languages !== undefined && !Array.isArray(d.languages))
    problems.push('languages must be a list of language tags')

  if (!d.install || typeof d.install !== 'object' || Array.isArray(d.install)) {
    problems.push('install must name the files a build downloads')
    return problems
  }
  if (!PLATFORMS.includes(d.platform)) return problems
  const shapes = installShapesFor(d.platform)
  const optionalHere = /** @type {Record<string, string[]>} */ (OPTIONAL_PARTS)[d.platform] ?? []
  const allowed = new Set([...shapes.flat(), ...optionalHere])
  for (const part of Object.keys(d.install))
    if (!allowed.has(part))
      problems.push(
        `install.${part} is not a part an ${d.platform} quickstart installs (${[...allowed].join(', ')})`
      )
  // A CMS with one shape names the part it is missing; a CMS with two says which shapes exist,
  // because "database is missing" would be wrong advice for a release that meant to ship a bundle.
  const shape = shapeOf(d.platform, d.install) ?? (shapes.length === 1 ? shapes[0] : null)
  if (shape === null) {
    problems.push(`install must be ${shapes.map((alt) => alt.join(' + ')).join(', or ')}`)
    return problems
  }
  for (const part of shape) {
    const at = `install.${part}`
    const p = d.install[part]
    if (p === undefined) {
      problems.push(`${at} is missing`)
      continue
    }
    if (!p || typeof p !== 'object' || Array.isArray(p)) {
      problems.push(`${at} must name a file and its sha256`)
      continue
    }
    if (typeof p.file !== 'string' || p.file === '') problems.push(`${at}.file must name a file`)
    else if (assets && !assets.includes(p.file))
      problems.push(`${at}.file ${JSON.stringify(p.file)} is not an asset of this release`)
    if (typeof p.sha256 !== 'string' || !SHA256.test(p.sha256))
      problems.push(`${at}.sha256 must be 64 hex characters`)
    if (p.url !== undefined)
      problems.push(`${at}.url is not read — the file is fetched from this release by name`)
  }
  return problems
}

/**
 * `tracy_design_inspiration.json` — the card a release puts on Design inspiration.
 *
 * WHY A SECOND FILE RATHER THAN A `card` BLOCK IN THE SETTING (Lee, 16/09). The two answer to
 * different owners. `tracy_setting.json` is install truth — which CMS, which archives, which
 * checksums — written once when a release is cut and never right to edit afterwards. The card is
 * presentation: a blurb, a category, which shot is the thumbnail. An administrator changes those
 * from the operations page, and making them change install truth would mean re-cutting a release
 * to reword a sentence.
 *
 * 🔒 NO `demo` IN THIS FILE. A card's preview is the demo of the environment SERVING the card —
 * `*.tracy.ai` on production, `*.tracy.site` on dev — read when the card is served. A demo address
 * written into the file is a pin to one environment that every other environment then shows wrong,
 * and it is the pin the `demo.version == version` gate exists to keep honest. So it is refused
 * here rather than ignored: ignoring it would let a release carry an address nobody reads and
 * everybody believes.
 */
export const DESIGN_INSPIRATION_SCHEMA = 'tracy-design-inspiration/v1'

/** Providers a card may name today. `check-templates` pins the same two. */
const PROVIDERS = Object.freeze(['Tracy', 'JoomlArt'])
/** The filter buttons Design inspiration offers — a closed list, because the filter is one. */
const NAVS = Object.freeze(['top-left', 'top-centered', 'brand-centered', 'overlay', 'sidebar'])
const HEROES = Object.freeze(['split', 'centered', 'cover', 'stack'])

/** A picture is a file NAME, never a path: the server composes the address it is served from. */
const PICTURE = /^[a-z0-9][a-z0-9-]*\.(?:png|jpg|jpeg|webp)$/
const SLUG = /^[a-z0-9][a-z0-9-]*$/

/**
 * Every way a design inspiration card can be wrong, as sentences. Empty means valid.
 *
 * The same shape `validateSetting` returns, and for the same reason: a screen shows the list, and
 * a release that is wrong in four ways says all four at once rather than one per upload.
 * @param {unknown} doc
 * @returns {string[]}
 */
export function validateDesignInspiration(doc) {
  const problems = []
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return ['not an object']
  const d = /** @type {Record<string, any>} */ (doc)
  if (d.schemaVersion !== DESIGN_INSPIRATION_SCHEMA)
    return [`schemaVersion must be ${DESIGN_INSPIRATION_SCHEMA}, got ${JSON.stringify(d.schemaVersion)}`]

  if (typeof d.template !== 'string' || !SLUG.test(d.template))
    problems.push('template must be a template id like tracy-business')
  if (!PROVIDERS.includes(d.provider)) problems.push(`provider must be one of ${PROVIDERS.join(', ')}`)
  if (typeof d.category !== 'string' || d.category.trim() === '')
    problems.push('category must name a category of Design templates')
  if (typeof d.blurb !== 'string') problems.push('blurb must be the sentence a reader sees on the card')
  if (typeof d.image !== 'string' || !PICTURE.test(d.image))
    problems.push('image must be a picture file name like home-1440.png')

  if (d.demo !== undefined)
    problems.push(
      "demo is the server's, not the file's — the live demo of the environment serving this card is read when it is served"
    )

  if (
    d.languages !== undefined &&
    (!Array.isArray(d.languages) || d.languages.some((l) => typeof l !== 'string'))
  )
    problems.push('languages must be a list of language tags')
  if (d.nav !== undefined && !NAVS.includes(d.nav)) problems.push(`nav must be one of ${NAVS.join(', ')}`)
  if (d.hero !== undefined && !HEROES.includes(d.hero))
    problems.push(`hero must be one of ${HEROES.join(', ')}`)
  // `dark` is the only boolean trait left. A card published while `vi` was one still validates:
  // an unknown key is ignored here, and `TYPED` drops it on the next write.
  if (d.dark !== undefined && typeof d.dark !== 'boolean') problems.push('dark must be true or false')

  if (!Array.isArray(d.layouts) || d.layouts.length === 0) {
    problems.push('layouts must list at least one layout — a card with no layout has nothing to show')
    return problems
  }
  const keys = new Set()
  for (const [i, layout] of d.layouts.entries()) {
    const at = `layouts[${i}]`
    if (!layout || typeof layout !== 'object' || Array.isArray(layout)) {
      problems.push(`${at} must be a layout: key, label, path, shots`)
      continue
    }
    if (typeof layout.key !== 'string' || !SLUG.test(layout.key))
      problems.push(`${at}.key must be a key like home`)
    else if (keys.has(layout.key))
      problems.push(`${at}.key ${JSON.stringify(layout.key)} is already a layout of this card`)
    else keys.add(layout.key)
    if (typeof layout.label !== 'string' || layout.label.trim() === '')
      problems.push(`${at}.label must say what a person sees on the tab`)
    if (typeof layout.path !== 'string' || !layout.path.startsWith('/'))
      problems.push(`${at}.path must be a path on the demo, starting with /`)
    // OPTIONAL, AND ONLY WHEN THE TWO ARE NOT THE SAME STRING. `path` is which page this is — it
    // names the layout, it is what a person reads, and it is deduplicated on. `address` is where
    // that page answers, which on a Joomla demo running SEF without rewriting is
    // `/index.php/our-services` while the path is `/our-services`. One value cannot be both: used
    // as an address, the stripped path is Apache's 404, and the capture photographs it (measured
    // 17/09 on ja_vital and on dev's ja-kidscorner).
    if (
      layout.address !== undefined &&
      (typeof layout.address !== 'string' || !layout.address.startsWith('/'))
    )
      problems.push(`${at}.address must be the path the page answers at, starting with /`)
    if (layout.count !== undefined && (!Number.isInteger(layout.count) || layout.count < 1))
      problems.push(`${at}.count must be a whole number of pages, 1 or more`)
    const shots = layout.shots
    if (
      !shots ||
      typeof shots !== 'object' ||
      Array.isArray(shots) ||
      typeof shots.desktop !== 'string' ||
      !PICTURE.test(shots.desktop)
    )
      problems.push(`${at}.shots.desktop must be a picture file name like home-1440.png`)
    if (
      shots &&
      typeof shots === 'object' &&
      shots.mobile !== undefined &&
      (typeof shots.mobile !== 'string' || !PICTURE.test(shots.mobile))
    )
      problems.push(`${at}.shots.mobile must be a picture file name like home-390.png`)
  }
  return problems
}

/**
 * Parse and validate a setting, throwing with every problem at once.
 * @param {string} raw
 * @param {{ assets?: string[], where?: string }} [opts]
 */
export function parseSetting(raw, { assets, where = 'tracy_setting.json' } = {}) {
  let doc
  try {
    doc = JSON.parse(raw)
  } catch (e) {
    throw new Error(`${where} is not JSON: ${e instanceof Error ? e.message : String(e)}`)
  }
  const problems = validateSetting(doc, { assets })
  if (problems.length > 0) throw new Error(`${where}:\n  - ${problems.join('\n  - ')}`)
  return doc
}
