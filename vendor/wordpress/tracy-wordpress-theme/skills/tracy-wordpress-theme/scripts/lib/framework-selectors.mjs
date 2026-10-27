// The selector profile of a source framework (#66): which elements are the page's content regions,
// which are its chrome, what a section is, what identifies a rendered page, and which header controls
// open a menu panel. ONE definition, read by every tool that looks at a source page: the layout lens
// (visual/layout-boxes.mjs), content parity (lib/parity-extract.mjs through http-parity.mjs), the
// open-state axis (visual/menu-open.mjs through visual-qa.mjs), the preflight's layout probe, and the
// design contract's page identity (ingest/from-joomla.mjs).
//
// The framework is never read from the page. It is the quickstart inventory's classifier result
// (ingest/quickstart-inventory.mjs classifyTemplate: T4 | T3 | Gavick | Helix | other | conflict |
// unknown), recorded by the Joomla adapter at provenance.json `source.template.css.framework` and
// carried into visual.contract.json `source.framework`. Class names on a page say nothing about
// which framework drew it; a T3 page styled after a T4 one would pick the wrong list.
//
// Profiles:
//   T4       the lists the tools read before #66, unchanged (a T4 source has `main`, `#t4-main-body`,
//            `.t4-section`, `.t4-masthead`; its chrome is `.t4-header`, `.t4-megamenu`, …).
//   T3       T3 Framework on Bootstrap 3 (JA Morgan, 26/09): no `<main>` — content sits in
//            `.t3-mainbody` and in `div.t3-section` bands; the chrome adds `.t3-topbar` and
//            `.t3-off-canvas`; the header's drawer is `button.off-canvas-toggle[data-nav]` and its
//            burger a Bootstrap 3 `[data-toggle="collapse"][data-target]`.
//   generic  any other classification (Gavick, Helix, other, conflict, unknown) or metadata that is
//            missing or malformed: the HTML landmarks only (`main`, `header`, `nav`, `footer`, the
//            ARIA roles), with a `gap` every caller reports. A region the landmarks do not name is not
//            measured there, and the report says so.
//
// Every profile keeps the WordPress landmarks (`main`, `.tracy-header`, `.wp-block-navigation`, …):
// the site side is the same WordPress theme whatever the source was built on, so the site's own
// regions and chrome are read the same way under any profile.
//
// A caller that names no framework at all (a command line from before #66) gets the T4 profile —
// what it measured before — marked `assumed`, and reports that the framework was not declared.
import { createHash } from 'node:crypto'
import { closeSync, constants as FS, fstatSync, lstatSync, openSync, readFileSync } from 'node:fs'

/** Bump when a profile's lists change: evidence measured under an older list is measured again. */
export const SELECTOR_PROFILE_VERSION = 1
/** What a `--framework` value may be: a classification's name, never a path or a selector. */
export const FRAMEWORK_NAME = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/
/** Frameworks with a profile of their own; every other classification reads the generic landmarks. */
export const PROFILED_FRAMEWORKS = Object.freeze(['T4', 'T3'])

const HEADING_TAGS = ['h1', 'h2', 'h3']
const regionHeadings = (regions) => regions.flatMap((r) => HEADING_TAGS.map((h) => `${r} ${h}`)).concat(['body h1', 'body h2']).join(', ')

// The off-canvas toggles every profile reads (the lists menu-open.mjs knew before #66): js-offcanvas
// (T4 `span.t4-offcanvas-toggle[data-offcanvas-trigger="off-canvas-right-push"]`, a bare id) and
// Bootstrap 4/5 (`[data-bs-toggle="offcanvas"]`, `#id` in data-bs-target, data-target or an `<a>`'s href).
// `refs` are read in order; `form` is what a value may be: `bare-id` (the id itself), `id` (`#id`),
// `id-or-class` (`#id`, or `.class` naming exactly one element).
const BASE_TOGGLES = [
  { selector: '[data-offcanvas-trigger]', refs: ['data-offcanvas-trigger'], form: 'bare-id', drawer: true },
  { selector: '[data-bs-toggle="offcanvas"], [data-toggle="offcanvas"]', refs: ['data-bs-target', 'data-target', 'href'], form: 'id', drawer: true }
]

const WP_CHROME_HEAD = ['header', 'nav', 'footer', '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]', '.tracy-header', '.tracy-footer']
const WP_CHROME_TAIL = ['.breadcrumb', '.wp-block-navigation', '.tracy-mega']

const DEFS = {
  T4: {
    regions: ['main', '#t4-main-body', '.t4-section', '.t4-masthead'],
    chrome: [...WP_CHROME_HEAD, '.t4-header', '.t4-footer', '#t4-header', '#t4-footer', '.t4-megamenu', '.t4-offcanvas', '.t4-off-canvas', '[class*="footnav"]', '[class*="mega-"]', '.t4-navbar', '.t4-section-footer', ...WP_CHROME_TAIL],
    section: 'section',
    panelStop: 'section, main',
    identity: 'main',
    toggles: BASE_TOGGLES
  },
  T3: {
    regions: ['main', '.t3-mainbody', '.t3-section', '.t3-sl', '.t3-masthead', '.t3-hero', '.t3-slideshow'],
    chrome: [
      ...WP_CHROME_HEAD,
      '.t3-header',
      '#t3-header',
      '.t3-mainnav',
      '.t3-megamenu',
      '.t3-navbar',
      '.t3-navbar-collapse',
      '.t3-topbar',
      '.t3-off-canvas',
      '#t3-off-canvas',
      '.t3-footer',
      '#t3-footer',
      '.t3-footnav',
      '.t3-copyright',
      '[class*="footnav"]',
      '[class*="mega-"]',
      ...WP_CHROME_TAIL
    ],
    section: 'section, .t3-section, .t3-sl, .t3-masthead, .t3-hero, .t3-slideshow',
    panelStop: 'section, main, .t3-section, .t3-sl, .t3-masthead, .t3-hero, .t3-slideshow',
    // A T3 page has no `<main>`: its content is `.t3-mainbody` on an article or a list, and only
    // `div.t3-section` bands (with a hero or a slideshow) on a home page built of sections.
    identity: 'main, .t3-mainbody, .t3-section, .t3-sl, .t3-masthead, .t3-hero, .t3-slideshow',
    toggles: [
      ...BASE_TOGGLES,
      // T3's own off-canvas: `button.off-canvas-toggle[data-nav="#t3-off-canvas"]`; the panel is moved to
      // the body by the framework's script.
      { selector: 'button.off-canvas-toggle[data-nav]', refs: ['data-nav'], form: 'id', drawer: true },
      // Bootstrap 3's collapse (T3's burger `.navbar-toggle[data-target=".t3-navbar-collapse"]`): its
      // target is any selector; an id, or a single class that names exactly one element, is read.
      { selector: '[data-toggle="collapse"]', refs: ['data-target', 'href'], form: 'id-or-class', drawer: false }
    ]
  },
  generic: {
    regions: ['main', '[role="main"]'],
    chrome: [...WP_CHROME_HEAD, ...WP_CHROME_TAIL],
    section: 'section',
    panelStop: 'section, main',
    identity: 'main, [role="main"]',
    toggles: BASE_TOGGLES
  }
}

const freeze = (x) => {
  if (x && typeof x === 'object') {
    for (const v of Object.values(x)) freeze(v)
    Object.freeze(x)
  }
  return x
}

function build(id) {
  const d = DEFS[id]
  const lists = {
    id,
    version: SELECTOR_PROFILE_VERSION,
    headings: regionHeadings(d.regions),
    chrome: d.chrome.join(', '),
    section: d.section,
    panelStop: d.panelStop,
    identity: d.identity,
    menu: { toggles: d.toggles.map((t) => ({ ...t, refs: [...t.refs] })) }
  }
  const key = `${id}/${SELECTOR_PROFILE_VERSION}/${createHash('sha256').update(JSON.stringify(lists)).digest('hex').slice(0, 16)}`
  return { ...lists, key }
}

/** The profiles, built once: `{ id, version, key, headings, chrome, section, panelStop, identity, menu }`. */
export const PROFILES = freeze(Object.fromEntries(Object.keys(DEFS).map((id) => [id, build(id)])))

/**
 * The profile of a classification: `{ framework, from, profile, assumed, gap }`. `framework` is what
 * was declared (null when nothing was), `from` where it was read. A classification without a profile,
 * or a value that is not a classification at all, reads the generic landmarks and says so in `gap`;
 * `declared: false` (a caller that names no framework source) keeps the T4 lists, `assumed`.
 */
export function selectorProfileFor(framework, { from = null, declared = true } = {}) {
  if (!declared) return { framework: null, from: null, profile: PROFILES.T4, assumed: true, gap: 'the source framework was not declared (no provenance, contract source.framework or --framework): the T4 selector profile is assumed' }
  if (typeof framework !== 'string' || !framework.trim()) {
    const what = framework === undefined || framework === null || framework === '' ? 'names no framework' : `names framework ${JSON.stringify(framework)}, not a classification`
    return { framework: null, from, profile: PROFILES.generic, assumed: false, gap: `${from ?? 'the input'} ${what}: generic landmarks (main, header, nav, footer, ARIA roles) are read — framework regions outside them are not measured` }
  }
  if (PROFILED_FRAMEWORKS.includes(framework)) return { framework, from, profile: PROFILES[framework], assumed: false, gap: null }
  return { framework, from, profile: PROFILES.generic, assumed: false, gap: `source framework ${framework}${from ? ` (${from})` : ''} has no selector profile (profiled: ${PROFILED_FRAMEWORKS.join(', ')}): generic landmarks (main, header, nav, footer, ARIA roles) are read — framework regions outside them are not measured` }
}

/** The framework a provenance.json records (`source.template.css.framework`), resolved to a profile. */
export function selectorProfileOfProvenance(prov, where = 'provenance.json') {
  if (!prov || typeof prov !== 'object' || Array.isArray(prov)) throw new Error(`${where} is not a JSON object`)
  const css = prov.source?.template?.css
  return selectorProfileFor(css?.framework, { from: `${where} source.template.css.framework` })
}

/**
 * The profile of a visual contract: `source.framework` (contract.mjs init records it from the
 * spec-pack's provenance.json). A contract written before #66 has none: the T4 lists it was measured
 * with, `assumed`, and a gap.
 */
export function selectorProfileOfContract(contract) {
  const s = contract?.source
  if (!s || !Object.hasOwn(s, 'framework')) return selectorProfileFor(null, { declared: false })
  return selectorProfileFor(s.framework, { from: 'visual contract source.framework' })
}

/**
 * A provenance.json named on a command line or found in a spec-pack, read: a missing file, a symlink
 * (never followed, even to a regular file: opened with O_NOFOLLOW), a directory, a FIFO or other
 * non-regular file (opened non-blocking, refused by its fstat before a byte is read), or bytes that
 * are not a JSON object are an Error naming the file — never a silent generic profile.
 */
export function readProvenanceFile(file) {
  let st
  try {
    st = lstatSync(file)
  } catch (e) {
    throw new Error(e.code === 'ENOENT' ? `${file}: no such file` : `${file}: ${e.message}`)
  }
  if (st.isSymbolicLink()) throw new Error(`${file} is a symlink; provenance is never read through one`)
  let fd
  try {
    fd = openSync(file, FS.O_RDONLY | FS.O_NOFOLLOW | FS.O_NONBLOCK)
  } catch (e) {
    throw new Error(e.code === 'ELOOP' ? `${file} is a symlink; provenance is never read through one` : `${file}: ${e.message}`)
  }
  let text
  try {
    if (!fstatSync(fd).isFile()) throw new Error(`${file} is not a regular file`)
    text = readFileSync(fd, 'utf8')
  } finally {
    closeSync(fd)
  }
  let prov
  try {
    prov = JSON.parse(text)
  } catch (e) {
    throw new Error(`${file}: not readable JSON (${e.message})`)
  }
  return selectorProfileOfProvenance(prov, file)
}

/** What a report records of the profile it measured with. */
export const selectorsRecord = (r) => ({ profile: r.profile.id, key: r.profile.key, framework: r.framework, from: r.from, ...(r.assumed ? { assumed: true } : {}), ...(r.gap ? { gap: r.gap } : {}) })
