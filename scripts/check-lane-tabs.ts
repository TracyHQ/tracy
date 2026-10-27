/**
 * Gate: a lane WITHOUT seats must not offer tabs that require a seat.
 *
 * WHY. `dsh-better-sidebar` takes `seedTabs` — the tabs opened up front for a new conversation.
 * That is **distribution config**, one YAML line in the bundle's `cordis.patch.yml`. Copying that line
 * by mistake into the guest lane's bundle offers the "Add site" door to **walk-in visitors with no
 * seat** — they click it and meet a closed door at the very end, after believing they could create a site.
 *
 * The native-lane plan (§5.3) named exactly this risk and wrote that it **must be measured, not
 * trusted**. This gate is that measurement, placed where it can run at any time.
 *
 * WHY STATIC INSTEAD OF WAITING FOR `boot-graph`. `check-boot-graph` must boot a real dsh, so it does not
 * run on a clean checkout (profiles not materialised) and is `--skip`ped in CI. A safety fence that can
 * only be measured on a machine with full profiles is a fence that is absent exactly when it is needed
 * most. This gate only reads YAML, so it runs wherever `build:check` runs.
 *
 * SCOPE: one direction only, on purpose. It does NOT judge which tabs a seated lane should have —
 * that is a product decision that changes weekly. It keeps one invariant: seat-only tabs do not land in
 * a seatless lane.
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { load } from 'js-yaml'

const ROOT = resolve(import.meta.dirname, '..')

/**
 * Tabs that only make sense when the user HAS a seat.
 *
 * `tracy:add-site` builds a new site — `POST /api/sites` requires a seat. `tracy:my-sites` lists the sites
 * a person has seats on; for someone without a seat it is a permanently empty list. A new seat-only tab
 * adds its id here, in the same change that writes it.
 *
 * 🔒 THE IDS HERE ARE TAB DESCRIPTOR IDS, NOT PACKAGE NAMES — `tracy-add-site` registers under
 * `tracy:add-site` (the `TAB_ID` constant). Put a package name here and the gate guards something that does not exist.
 */
const SEAT_ONLY_TABS = new Set(['tracy:add-site', 'tracy:my-sites'])

/**
 * Which bundles serve a seated lane.
 *
 * An explicit list, not inferred from names: `guest` reads as "visitor", but a new bundle named
 * `tracy-trial` would also be a seatless lane and no name would say so. A new bundle adds a line — and
 * requires thinking, which is the point.
 */
const SEATED: Record<string, boolean> = {
  'tracy-cowork': true,
  'tracy-native': true,
  'tracy-guest': false
}

/** A parsed cordis row, keeping only what this gate cares about. */
interface Row {
  readonly id?: unknown
  readonly config?: { readonly seedTabs?: unknown }
}

/**
 * Every tab a bundle seeds.
 * @param bundle - folder name under `packages/bundle/`.
 * @returns Tab ids, empty when the bundle seeds nothing.
 */
function seededTabs(bundle: string): string[] {
  const file = join(ROOT, 'packages/bundle', bundle, 'cordis.patch.yml')
  if (!existsSync(file)) return []
  const doc = load(readFileSync(file, 'utf8'))
  if (!Array.isArray(doc)) return []

  const out: string[] = []
  // A `cordis.patch.yml` mixes two shapes: direct patch rows (`- id: …`) and `- insert: […]` blocks.
  // Skipping the second shape skips exactly where a new bundle would seed tabs.
  const rows: unknown[] = []
  for (const entry of doc) {
    rows.push(entry)
    const inserted = (entry as { insert?: unknown }).insert
    if (Array.isArray(inserted)) rows.push(...inserted)
  }

  for (const row of rows) {
    const tabs = (row as Row).config?.seedTabs
    if (Array.isArray(tabs)) out.push(...tabs.filter((t): t is string => typeof t === 'string'))
  }
  return out
}

const problems: string[] = []
let checked = 0

for (const [bundle, seated] of Object.entries(SEATED)) {
  const tabs = seededTabs(bundle)
  checked += tabs.length
  if (seated) continue
  for (const tab of tabs) {
    if (SEAT_ONLY_TABS.has(tab)) {
      problems.push(
        `  packages/bundle/${bundle}: seeds tab "${tab}" for a lane WITHOUT seats.\n` +
          `    A walk-in visitor who clicks it reaches a closed door — after believing they could do it.`
      )
    }
  }
}

const unknown = Object.keys(SEATED).filter(
  (b) => !existsSync(join(ROOT, 'packages/bundle', b, 'cordis.patch.yml'))
)
for (const b of unknown) {
  // A bundle gone from the tree but still named here means the SEATED table drifted from reality, and a
  // drifted table is a gate guarding the wrong place.
  problems.push(`  SEATED lists "${b}" but packages/bundle/${b}/cordis.patch.yml does not exist`)
}

if (problems.length > 0) {
  process.stderr.write(`Lane tab gate: ${String(problems.length)} problem(s)\n\n`)
  for (const line of problems) process.stderr.write(`${line}\n\n`)
  process.stderr.write(
    '  Seat-only tabs: ' +
      [...SEAT_ONLY_TABS].join(', ') +
      '\n  Fix the bundle, or — if that lane now HAS seats — fix the SEATED table in this file.\n'
  )
  process.exit(1)
}

process.stdout.write(
  `Lane tab gate: ${String(Object.keys(SEATED).length)} bundles, ${String(checked)} seeded tabs, clean.\n`
)
