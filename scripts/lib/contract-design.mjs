/**
 * The design rule of the contracts gate (`check-contracts.ts`), kept pure so it can be tested away
 * from the trees.
 *
 * Since 29/09/2026 a profile's `<version>.design.json`, beside its sealed directory, is the ONE
 * place that names the design system its quickstart wears: `design: { id, source: 'catalog' } | null`,
 * or — for a quickstart that wears its OWN look (Tracy Business) — `{ id: <quickstart>, source: 'quickstart',
 * name, tokensFrom }` beside `tokens`, the file's 56 tokens resolved (`scripts/build-quickstart-design.mjs`). tracy-web joins it into every
 * template card (`templateCards`) and the build writes it into the site folder, so a half-written
 * value reaches a customer's site as "wears none" with nothing red on the way. The gate is where it
 * goes red: the key must be present (null is an answer, absence is not), the shape must be whole,
 * and the id must be one the catalogue (`vendor/tracy/od-design-system/catalog.json`) lists.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const DESIGN_ID = /^[a-z0-9][a-z0-9-]{0,60}$/

/**
 * The ids `catalog.json` lists — the only ids a profile may wear.
 * @param {string} file path to `catalog.json`
 * @returns {Set<string>}
 */
export function catalogIds(file) {
  const catalog = JSON.parse(readFileSync(file, 'utf8'))
  const systems = Array.isArray(catalog?.systems) ? catalog.systems : []
  return new Set(systems.map((/** @type {any} */ s) => s?.id).filter((id) => typeof id === 'string'))
}

/**
 * The file beside a profile DIRECTORY that names its design: `<version>.design.json`. Not inside
 * the directory — that is a sealed package (`manifest.json` hashed by the pinned Claude Cowork
 * plugin, every `.json` of a served profile pinned in `design-templates.json`).
 * @param {string} dir the profile's directory
 */
export const designFileOf = (dir) => `${dir}.design.json`

/**
 * The parsed design file of a profile directory, or undefined when there is none.
 * @param {string} dir the profile's directory
 * @returns {Record<string, unknown> | undefined}
 */
export function readDesignFile(dir) {
  const file = designFileOf(dir)
  if (!existsSync(file)) return undefined
  return JSON.parse(readFileSync(file, 'utf8'))
}

/**
 * The custom properties a CSS file declares, first declaration wins, comments stripped — the same
 * reading `tokensOf` does in `design-record.mjs`.
 * @param {string} css
 * @returns {Record<string, string>}
 */
function declared(css) {
  /** @type {Record<string, string>} */
  const out = {}
  for (const m of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(--[A-Za-z0-9][\w-]*)\s*:\s*([^;{}]+);/g))
    if (!(m[1] in out)) out[m[1]] = m[2].trim()
  return out
}

/**
 * The named tokens of a quickstart's OWN token file, with every `var(--x[, fallback])` resolved
 * inside that file. A quickstart like Tracy Business declares its 56 tokens over primitives of its
 * own (`--bg: var(--tb-paper)`); a check measuring a page needs the colours, not the names.
 * Throws on a named token the file does not declare, or a reference that loops.
 * @param {string} file absolute path of the token file
 * @param {readonly string[]} names the tokens to keep (the 56 `TOKEN_NAMES`)
 * @returns {Record<string, string>}
 */
export function quickstartTokens(file, names) {
  const all = declared(readFileSync(file, 'utf8'))
  /** @param {string} value @param {string[]} seen */
  const resolve = (value, seen) =>
    value.replace(
      /var\(\s*(--[A-Za-z0-9][\w-]*)\s*(?:,\s*([^()]*(?:\([^()]*\))?[^()]*))?\)/g,
      (_, name, fallback) => {
        if (seen.includes(name))
          throw new Error(`${path.basename(file)}: ${seen.concat(name).join(' → ')} refers to itself`)
        if (name in all) return resolve(all[name], seen.concat(name))
        if (fallback !== undefined) return resolve(fallback.trim(), seen)
        throw new Error(`${path.basename(file)}: var(${name}) is not declared`)
      }
    )
  /** @type {Record<string, string>} */
  const out = {}
  for (const name of names) {
    if (!(name in all)) throw new Error(`${path.basename(file)} does not declare ${name}`)
    out[name] = resolve(all[name], [name])
  }
  return out
}

/**
 * @param {Record<string, unknown> | undefined} doc
 * @param {{ root: string, release: string, names: readonly string[] } | undefined} ctx
 * @returns {string | null}
 */
function quickstartProblem(doc, ctx) {
  const design = /** @type {Record<string, unknown>} */ (doc?.design)
  if (!ctx) return 'design.source "quickstart" needs the quickstart and the token list to check against'
  const slug = ctx.release.split('/')[0].replace(/^quickstart$/, ctx.release.split('/')[1] ?? '')
  if (design.id !== slug)
    return `design.id is ${JSON.stringify(design.id)} — a quickstart that wears its own system must carry that quickstart's name ("${slug}")`
  if (typeof design.name !== 'string' || design.name === '')
    return 'design.name must be a readable name (e.g. "Tracy Business")'
  const from = design.tokensFrom
  if (typeof from !== 'string' || from === '' || !existsSync(path.join(ctx.root, from)))
    return `design.tokensFrom ${JSON.stringify(from ?? null)} is not a file in the repository`
  let want
  try {
    want = quickstartTokens(path.join(ctx.root, from), ctx.names)
  } catch (error) {
    return `design.tokensFrom: ${/** @type {Error} */ (error).message}`
  }
  const have = /** @type {Record<string, unknown>} */ (doc?.tokens ?? {})
  const off = ctx.names.filter((n) => have[n] !== want[n])
  if (off.length > 0)
    return `tokens differ from ${from} at ${off.slice(0, 5).join(', ')}${off.length > 5 ? '…' : ''} — run node scripts/build-quickstart-design.mjs`
  return null
}

/**
 * Why this profile's design file is unacceptable, or null when it is fine.
 * @param {Record<string, unknown> | undefined} doc the parsed `design.json`, undefined when absent
 * @param {Set<string>} ids from `catalogIds`
 * @param {{ root: string, release: string, names: readonly string[] }} [ctx] needed only for a
 *   `quickstart` design: the repository root, the profile's release, and the token names to compare
 * @returns {string | null}
 */
export function designProblem(doc, ids, ctx) {
  if (doc === undefined)
    return 'no <version>.design.json beside the profile directory — "wears none" must be written as {"design": null}, never left out'
  if (!doc || typeof doc !== 'object' || !Object.hasOwn(doc, 'design'))
    return 'the .design.json file has no design key'
  const design = doc.design
  if (design === null) return null
  if (!design || typeof design !== 'object' || Array.isArray(design))
    return `design is ${JSON.stringify(design)} — must be {id, source: "catalog"} or null`
  const { id, source } = /** @type {Record<string, unknown>} */ (design)
  if (source === 'quickstart') return quickstartProblem(doc, ctx)
  if (source !== 'catalog')
    return `design.source is ${JSON.stringify(source ?? null)} — only "catalog" or "quickstart" is accepted`
  if (typeof id !== 'string' || !DESIGN_ID.test(id))
    return `design.id is ${JSON.stringify(id ?? null)} — not a valid catalogue id`
  if (!ids.has(id)) return `design.id "${id}" is not in catalog.json`
  return null
}
