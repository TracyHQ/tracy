#!/usr/bin/env node
/**
 * Measure the brand facts of a restored WordPress quickstart (`src/brand-facts.mjs` says which and how) and
 * write them as `brand-facts.json` into the contract folder of the version, beside its
 * design-system-measurement.json. A step of `release-measure.mjs` (WordPress releases); alone:
 *
 *   node packages/design/tracy-ds-slot/scripts/brand-facts.mjs --site http://127.0.0.1:<port> \
 *     --wp-container <stand>-web --tag quickstart/<slug>/wp7 --version <x.y.z> [--out <file>] [--cdp <port>]
 *
 * The stand's options `site_logo`, `tracy_logo_dark` and `site_icon` are changed through wp-cli to measure,
 * and put back (or deleted when they were absent) whatever happens. Exit 1 when a probe could not run.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { browser } from './cdp.mjs'
import {
  BRAND_FACTS_FILE,
  BRAND_FACTS_SCHEMA,
  brandFactsOf,
  logoProbe,
  stemOf,
  themeFilesHash,
  visibleSpotOf
} from '../src/brand-facts.mjs'

const ROOT = resolve(import.meta.dirname, '../../../..')
const args = process.argv.slice(2)
const opt = (/** @type {string} */ n) => {
  const i = args.indexOf(n)
  return i === -1 ? null : args[i + 1]
}
const SITE = opt('--site')
const WEB = opt('--wp-container')
const TAG = opt('--tag')
const VERSION = opt('--version')
if (!SITE || !WEB || !TAG || !VERSION || !/^quickstart\/[a-z0-9-]+\/wp\d+$/.test(TAG)) {
  console.error(
    'usage: brand-facts.mjs --site <url> --wp-container <name> --tag quickstart/<slug>/wp<n> --version <x.y.z> [--out <file>] [--cdp <port>]'
  )
  process.exit(2)
}
const [, slug, line] = TAG.split('/')
const OUT = resolve(
  opt('--out') ??
    join(ROOT, 'packages/cms/tracy-wordpress-quickstart/contracts', slug, line, VERSION, BRAND_FACTS_FILE)
)
const CDP = Number(opt('--cdp') ?? 9351)

const wp = (/** @type {string[]} */ ...a) =>
  execFileSync('docker', ['exec', '-u', 'www-data', WEB, 'wp', ...a], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  })
// the last line: a theme that prints a notice into every wp-cli run (JA Vega, 12/10/2026) prints it first
const lastLine = (/** @type {string} */ s) => s.trim().split('\n').pop()?.trim() ?? ''
const OPTIONS = /** @type {const} */ (['site_logo', 'tracy_logo_dark', 'site_icon'])
/** @type {Record<string, string | null>} */
const original = {}
for (const o of OPTIONS) {
  try {
    original[o] = lastLine(wp('option', 'get', o))
  } catch {
    original[o] = null
  }
}
const set = (/** @type {Record<string, string>} */ values) => {
  for (const [o, v] of Object.entries(values)) wp('option', 'update', o, v)
  wp('cache', 'flush')
}
const restore = () => {
  for (const o of OPTIONS)
    try {
      if (original[o] === null) wp('option', 'delete', o)
      else wp('option', 'update', o, original[o])
    } catch {
      /* deleting an option that is not there */
    }
  try {
    wp('cache', 'flush')
  } catch {
    /* a stand without an object cache */
  }
}

/** Every image of the release's own library: id, file stem, width, height. */
const library = wp(
  'eval',
  'foreach (get_posts(["post_type"=>"attachment","post_mime_type"=>"image","numberposts"=>-1,"post_status"=>"any"]) as $p) { $m = wp_get_attachment_metadata($p->ID); echo json_encode([$p->ID, basename((string) get_attached_file($p->ID)), (int) ($m["width"] ?? 0), (int) ($m["height"] ?? 0)]), "\\n"; }'
)
  .split('\n')
  .filter((l) => l.startsWith('['))
  .map((l) => {
    const [id, file, width, height] = JSON.parse(l)
    return { id: String(id), stem: stemOf(file), width, height }
  })
  .filter((a) => a.stem && a.width > 0 && a.height > 0)

const title = lastLine(wp('option', 'get', 'blogname'))

/**
 * The theme the stand serves, as `themeFilesHash` of its files (the paths a presentation lock uses), read before any
 * option is changed: what ties these facts to one build of the theme.
 */
function themeOnStand() {
  const stylesheet = lastLine(wp('option', 'get', 'stylesheet'))
  if (!/^[a-z0-9._-]+$/i.test(stylesheet)) throw new Error(`stylesheet ${stylesheet}`)
  const out = execFileSync(
    'docker',
    [
      'exec',
      WEB,
      'sh',
      '-c',
      `cd /var/www/html && find wp-content/themes/${stylesheet} -type f -print0 | xargs -0 sha256sum`
    ],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  )
  /** @type {Record<string, string>} */
  const files = {}
  for (const line of out.split('\n')) {
    const m = /^([0-9a-f]{64})\s+(.+)$/.exec(line.trim())
    if (m) files[m[2]] = m[1]
  }
  if (!Object.keys(files).length) throw new Error(`no file under wp-content/themes/${stylesheet}`)
  return themeFilesHash(files)
}
const THEME = themeOnStand()
const b = await browser(CDP)
const read = async (/** @type {any} */ input) => {
  await b.open(`${SITE}/`, 1440, { scheme: 'light' })
  return b.evaluate(logoProbe(input))
}
let code = 0
try {
  const demo = await read({ marks: [], title })
  const used = new Set(demo.logos.map((/** @type {any} */ l) => stemOf(l.src)))
  for (const o of OPTIONS) if (original[o]) used.add(library.find((a) => a.id === original[o])?.stem ?? '')
  // three images the page does not show yet, each with a stem no other has: the marks
  const stems = library.map((a) => a.stem)
  const free = library.filter((a) => !used.has(a.stem) && stems.filter((s) => s === a.stem).length === 1)
  if (free.length < 3) throw new Error(`the release's library has ${free.length} unused images, 3 needed`)
  const [light, dark, icon] = free
  const marks = { site_logo: light.stem, tracy_logo_dark: dark.stem, site_icon: icon.stem }
  set({ site_logo: light.id, tracy_logo_dark: dark.id, site_icon: icon.id })
  const marked = await read({ marks: Object.values(marks), title })
  const partial = brandFactsOf({
    demo,
    marked,
    marks,
    cleared: { texts: {} },
    reshaped: null,
    reshapedMark: null
  })
  set({ site_logo: '0', tracy_logo_dark: '0', site_icon: original.site_icon ?? '0' })
  const cleared = await read({ marks: [], title, wrappers: partial.spots.map((s) => s.where) })
  // the visible spot's option on an image of another shape than the demo logo: does the template hold the height?
  let reshaped = null
  let reshapedMark = null
  const spot = visibleSpotOf(partial, marked)
  if (partial.frame && spot) {
    const ratio = partial.frame.width / partial.frame.height
    const other = free.find((a) => Math.abs(a.width / a.height - ratio) / ratio > 0.25)
    if (other) {
      restore()
      set({ [spot.option]: other.id })
      reshapedMark = other.stem
      reshaped = await read({ marks: [other.stem], title })
    }
  }
  const facts = brandFactsOf({ demo, marked, marks, cleared, reshaped, reshapedMark })
  const doc = {
    schemaVersion: BRAND_FACTS_SCHEMA,
    tag: TAG,
    version: VERSION,
    themeFiles: THEME,
    measuredAt: new Date().toISOString(),
    measuredBy: 'tdsr brand-facts.mjs (home page, 1440 px, light scheme)',
    facts
  }
  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, JSON.stringify(doc, null, 2) + '\n')
  console.log(JSON.stringify({ out: OUT, facts }))
} catch (e) {
  console.error(`brand facts: ${String(/** @type {any} */ (e)?.message ?? e)}`)
  code = 1
} finally {
  restore()
  b.close()
}
process.exit(code)
