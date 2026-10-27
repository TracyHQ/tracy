/**
 * Generates `catalog.json` from the library's 152 `manifest.json` files, plus two layout fields from `archetypes.json`.
 *
 * WHY THIS FILE EXISTS. The agent picks a design system by reading descriptions, and reading 152 `DESIGN.md`
 * (~4 KB each) pours ~600 KB into the context just to answer "which styles are there".
 * This index gathers `id`, `name`, `category`, `description` — enough to choose, and only then open the one
 * `DESIGN.md` of the chosen system.
 *
 * GENERATED, NOT HAND-WRITTEN. `systems/` is third-party data and will be updated from upstream; a
 * hand-typed index would drift at the very first sync without anyone noticing.
 *
 * THE TWO FIELDS `nav` / `hero` (since 05/09/2026, spec §4d). Tokens carry colour, type, radius, spacing —
 * never SHAPE. The shape of the header and of the top-of-page area exists only in the `DESIGN.md` prose,
 * so it is CLASSIFIED ONCE (the agent reads, Tracy reviews) into `archetypes.json`, then merged here.
 * Tracy's hero band picks its layout variant from those two fields — deterministic at run time, paid for once.
 *   - A value must be in the closed set declared in `_meta`; outside it is an ERROR, not a warning, because
 *     the hero band would silently fall back to the default.
 *   - A system not yet in `archetypes.json` (upstream added a new one) → defaults to `top-left` + `split`,
 *     and the NUMBER of unclassified systems is printed so the next classification pass knows its work.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const systemsDir = join(root, 'systems')
const archetypesFile = join(root, 'archetypes.json')

const DEFAULT_NAV = 'top-left'
const DEFAULT_HERO = 'split'

/** @type {{ _meta?: { nav?: string[], hero?: string[] } } & Record<string, { nav?: string, hero?: string }>} */
const archetypes = existsSync(archetypesFile) ? JSON.parse(readFileSync(archetypesFile, 'utf8')) : {}
const NAV = new Set(archetypes._meta?.nav ?? [DEFAULT_NAV])
const HERO = new Set(archetypes._meta?.hero ?? [DEFAULT_HERO])

let unclassified = 0
const bad = []

/**
 * The languages a system's design documentation has been translated into, read from the file names themselves.
 *
 * WHY NOT A `vi` FLAG. This field used to be `vi: existsSync('DESIGN-vi.md')` — a test of exactly
 * one file, which reads as "this system works in Vietnamese". Measured 16/09/2026: the library has 17
 * languages and the SAME set of 23 systems is translated into all 17, so `vi` was only a probe for "does this
 * system have translated docs yet" — `fr` or `ko` gives the identical result. A name that answers a different
 * question from the one it is asked is something no one can fix by reading, so it declares exactly what it knows: the list.
 *
 * @param {string} id
 * @returns {string[]} sorted language codes; empty when the system has no translation yet.
 */
function docLanguagesOf(id) {
  return readdirSync(join(systemsDir, id))
    .map((f) => /^DESIGN-([a-z]{2}(?:-[a-z]{2})?)\.md$/.exec(f)?.[1])
    .filter((code) => code !== undefined)
    .sort()
}

/**
 * A system's two layout fields, checked against the closed set.
 * @param {string} id
 * @returns {{ nav: string, hero: string }}
 */
function shapeOf(id) {
  const a = archetypes[id]
  if (!a) {
    unclassified += 1
    return { nav: DEFAULT_NAV, hero: DEFAULT_HERO }
  }
  if (!NAV.has(a.nav)) bad.push(`${id}: nav "${String(a.nav)}"`)
  if (!HERO.has(a.hero)) bad.push(`${id}: hero "${String(a.hero)}"`)
  return { nav: a.nav, hero: a.hero }
}

const systems = readdirSync(systemsDir)
  .filter((id) => !id.startsWith('_'))
  .sort()
  .map((id) => {
    const manifest = join(systemsDir, id, 'manifest.json')
    if (!existsSync(manifest)) return null
    try {
      const m = JSON.parse(readFileSync(manifest, 'utf8'))
      return {
        id,
        name: m.name ?? id,
        category: m.category ?? 'Uncategorised',
        description: m.description ?? '',
        // Which languages a translation exists in — the agent opens the one matching the language it
        // answers the customer in, instead of guessing and stat-ing 152 folders.
        docLanguages: docLanguagesOf(id),
        ...shapeOf(id),
      }
    } catch {
      // A broken manifest is broken upstream data, not a reason for the whole index to fail.
      return { id, name: id, category: 'Uncategorised', description: '', docLanguages: [], ...shapeOf(id), malformed: true }
    }
  })
  .filter(Boolean)

if (bad.length > 0) {
  process.stderr.write(`catalog: ${String(bad.length)} archetype value(s) outside the closed sets:\n  ${bad.join('\n  ')}\n`)
  process.exit(1)
}

writeFileSync(
  join(root, 'catalog.json'),
  `${JSON.stringify({ schemaVersion: 'tracy-od-catalog/v2', count: systems.length, systems }, null, 2)}\n`,
)

const malformed = systems.filter((s) => s.malformed).length
process.stdout.write(
  `catalog: ${String(systems.length)} design systems` +
    (malformed > 0 ? `, ${String(malformed)} malformed manifest(s)` : '') +
    `, ${String(systems.filter((s) => s.docLanguages.length > 0).length)} with translated design docs` +
    `, ${String(unclassified)} without an archetype (defaulted to ${DEFAULT_NAV}/${DEFAULT_HERO})\n`,
)
