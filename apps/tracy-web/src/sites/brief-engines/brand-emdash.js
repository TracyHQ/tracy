/**
 * The EmDash writer behind `setSiteBrand` (`brand.js`; plan T22, D9).
 *
 *   logo      the light (or only) logo → core `settings.logo` `{ mediaId, alt }`
 *   favicon   → core `settings.favicon` `{ mediaId }` (EmDash's head prints `<link rel=icon>` from it)
 *   dark logo → the image field `logo_dark` of the template's chrome entry, as its `seed/personalize.json` `brand.logoDark`
 *             names it (`site/site` on Tracy Business and Tracy Base, `social/footer-brand` on Tracy SaaS); the tool
 *             makes the field on a site whose schema has none
 *   share     the share card (`brand-share-card.js`, TCH #1013 D5) → core `settings.seo.defaultOgImage` `{ mediaId }`:
 *             EmDash's head prints it as og:image on every page that passes no picture of its own (an article, and on
 *             Tracy Business and Tracy Base the pages that share their hero picture, keep theirs)
 *
 * 🔒 THE TEMPLATE'S OWN TOOL WRITES THEM, IN ITS BRAND-ONLY MODE. EmDash has no Apply door for these writes (the plugin
 * actions WordPress and Joomla take do not exist there): the words of an EmDash site are written by the template's
 * `tools/personalize.mjs` with the site's agent token (`emdash.js`), and the pictures go through the same tool, run once
 * more with `--brand-only`, the prepared PNGs as `--logo-file`, `--logo-dark-file` and `--favicon-file`, and the brand
 * step's apply id as `--apply-id`. So the brand step stays the one seam with its own apply id, and the tool keeps the one
 * map of where a template shows what. No model and no picture door are handed over: the pictures need neither.
 * 🔒 THE UNDO IS THE TOOL'S JOURNAL (`--revert <applyId>`): every write is journaled with what it replaced.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { emdashToolFor, runNode } from '../../lib/emdash-tool.js'

/** The longest the tool may take for three uploads and a few writes. */
const BRAND_MS = 60_000
/** What the customer reads when the design will not show what was written. */
const NOT_SHOWN = Object.freeze({
  logo: 'this design does not show a logo yet',
  favicon: 'this design does not show a favicon yet'
})
/** The tool's names for the pictures, as `setSiteBrand` names them. */
const WHERE = Object.freeze({ logo: 'logo', logoDark: 'logo-dark', favicon: 'favicon', share: 'share' })

/**
 * How the writer reaches a site: the engine's door to it (`createEmdashEngine` connects it), and how the tool is run.
 * @type {{ siteAccess: ((siteKey: string) => Promise<{origin: string, token: string}>) | null, run: typeof runNode, workRoot: string }}
 */
const reach = { siteAccess: null, run: runNode, workRoot: tmpdir() }

/**
 * Hand the writer the site's door. Called by `createEmdashEngine`, which is given it by the app; a test hands its own.
 * @param {{ siteAccess: (siteKey: string) => Promise<{origin: string, token: string}>, run?: typeof runNode, workRoot?: string }} deps
 */
export function connectEmdashBrand({ siteAccess, run = runNode, workRoot = tmpdir() }) {
  reach.siteAccess = siteAccess
  reach.run = run
  reach.workRoot = workRoot
}

/**
 * Which file goes as which picture: the light (or only) logo is the site logo; a design whose every logo spot is dark
 * (`logos: "dark"`) takes the dark logo as its one logo; a dark logo given always goes to the dark-background field too;
 * the share card, made only when a logo was given, goes as the share picture.
 * @param {{ logo?: { light?: Uint8Array, dark?: Uint8Array, single?: Uint8Array }, favicon?: Uint8Array, share?: Uint8Array }} prepared
 * @param {any} profile
 * @returns {{ logo?: Uint8Array, logoDark?: Uint8Array, favicon?: Uint8Array, share?: Uint8Array }}
 */
export function emdashPicturesOf(prepared, profile) {
  const logos = prepared.logo ?? {}
  const logo = logos.single ?? logos.light ?? (profile?.logos === 'dark' ? logos.dark : undefined)
  return {
    ...(logo ? { logo } : {}),
    ...(logos.dark ? { logoDark: logos.dark } : {}),
    ...(prepared.favicon ? { favicon: prepared.favicon } : {}),
    ...(prepared.share ? { share: prepared.share } : {})
  }
}

/**
 * The tool's arguments for the brand pictures alone.
 * @param {{ tool: string, seedDir: string }} tool
 * @param {{ site: string, dir: string, applyId: string, name?: string, files: Record<string, string> }} input
 */
export function brandArgs(tool, { site, dir, applyId, name, files }) {
  return [
    tool.tool,
    '--brand-only',
    '--answers-json',
    JSON.stringify(name ? { name } : {}),
    '--site',
    site,
    '--token-file',
    path.join(dir, 'token'),
    '--seed',
    tool.seedDir,
    '--receipts',
    path.join(dir, 'receipts.json'),
    '--apply-id',
    applyId,
    ...(files.logo ? ['--logo-file', files.logo] : []),
    ...(files.logoDark ? ['--logo-dark-file', files.logoDark] : []),
    ...(files.favicon ? ['--favicon-file', files.favicon] : []),
    ...(files.share ? ['--share-file', files.share] : []),
    '--json'
  ]
}

/**
 * The picture a line of the tool's brand report is about: `settings.logo`, `settings.favicon`,
 * `settings.seo.defaultOgImage`, `<entry>.logo_dark`, or the picture's own name in a skip.
 * @returns {keyof typeof WHERE | null}
 */
function roleOf(/** @type {unknown} */ line) {
  const where = String(line ?? '')
  if (where === 'settings.logo' || where === 'logo') return 'logo'
  if (where === 'settings.favicon' || where === 'favicon') return 'favicon'
  if (where === 'settings.seo.defaultOgImage' || where === 'share') return 'share'
  if (where === 'logoDark' || where.endsWith('.logo_dark')) return 'logoDark'
  return null
}

/** The report the tool prints on stdout, or null. */
function reportOf(/** @type {string} */ stdout) {
  try {
    const report = JSON.parse(stdout)
    return report && typeof report === 'object' ? report : null
  } catch {
    return null
  }
}

/** @param {import('./brand.js').BrandWriterInput} input */
export async function writeEmdashBrand({ siteKey, prepared, profile, tag, applyId, skip, wrote }) {
  const pictures = emdashPicturesOf(prepared, profile)
  const roles = /** @type {Array<keyof typeof WHERE>} */ (Object.keys(pictures))
  if (roles.length === 0) return
  const skipAll = (/** @type {string} */ reason) => {
    for (const role of roles) skip(WHERE[role], reason)
  }
  const tool = emdashToolFor(tag)
  if (!tool) return skipAll('this design ships no tool to write it with')
  if (!reach.siteAccess || !siteKey) return skipAll('the site could not be reached')
  let access
  try {
    access = await reach.siteAccess(siteKey)
  } catch (error) {
    return skipAll(`the site could not be reached (${error instanceof Error ? error.message : error})`)
  }
  const dir = mkdtempSync(path.join(reach.workRoot, 'tracy-emdash-brand-'))
  try {
    writeFileSync(path.join(dir, 'token'), `${access.token}\n`, { mode: 0o600 })
    /** @type {Record<string, string>} */
    const files = {}
    for (const role of roles) {
      files[role] = path.join(dir, `${WHERE[role]}.png`)
      writeFileSync(files[role], /** @type {Uint8Array} */ (pictures[role]))
    }
    const result = await reach.run({
      args: brandArgs(tool, { site: access.origin, dir, applyId, name: prepared.name, files }),
      env: { PATH: process.env.PATH ?? '', LANG: 'C.UTF-8' },
      cwd: dir,
      timeoutMs: BRAND_MS
    })
    const report = reportOf(result.stdout)
    if (result.killed) return skipAll('writing the pictures took too long')
    if (!report?.brand)
      return skipAll(
        `the tool gave no report (exit ${result.code}): ${result.stderr.trim().split('\n').at(-1) ?? 'no reason'}`
      )
    const done = new Set((report.brand.written ?? []).map(roleOf))
    for (const role of roles) if (done.has(role)) wrote(WHERE[role])
    /** @type {Set<string | null>} */
    const said = new Set()
    for (const s of report.brand.skipped ?? []) {
      const role = roleOf(s?.where)
      if (!role || said.has(role) || done.has(role)) continue
      said.add(role)
      skip(WHERE[role], String(s.why ?? 'not written'))
    }
    for (const role of roles)
      if (!done.has(role) && !said.has(role)) skip(WHERE[role], 'the site did not take it')
    if (done.has('logo') && profile?.brandReady === false) skip('logo', NOT_SHOWN.logo)
    if (done.has('favicon') && profile?.faviconReady === false) skip('favicon', NOT_SHOWN.favicon)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
