#!/usr/bin/env node
/**
 * Push Website Opportunities places from this deployment to a receiving master's ingest door
 * (tasks/plan-wo-shared-places.md §6, slice 1; `website-opportunities/src/place-export.js`). One POST per
 * place; the destination fills only places that have no snapshot there yet.
 *
 *   WO_PLACES_PUSH_SECRET=… docker exec -e WO_PLACES_PUSH_SECRET <web> node scripts/push-wo-places.mjs \
 *     --to https://cowork.tracy.site --origin studio-wopf --place <place uuid> [--place <uuid> …]
 *
 * `--origin` is this deployment's self-declared name, written into the destination's audit row. The
 * secret is read from WO_PLACES_PUSH_SECRET (the destination's WO_PLACES_INGEST_SECRET) and never
 * printed. Prints one audit line per place: `<time> origin=… place=… outcome=… media=…`. Exit 1 when
 * any place was not imported or skipped as already present.
 */
import { createPool } from '../src/db/index.js'
import { pushPlaces } from 'website-opportunities/src/place-export.js'

const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(name)
  return i === -1 ? undefined : args[i + 1]
}
const placeIds = args.flatMap((a, i) => (args[i - 1] === '--place' ? [a] : []))
const to = flag('--to')
const origin = flag('--origin')
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
if (
  !to ||
  !/^https?:\/\//.test(to) ||
  !origin ||
  placeIds.length === 0 ||
  !placeIds.every((p) => UUID.test(p))
) {
  process.stderr.write(
    'usage: push-wo-places.mjs --to <origin url> --origin <name> --place <uuid> [--place <uuid> …]\n'
  )
  process.exit(2)
}
const secret = process.env.WO_PLACES_PUSH_SECRET
if (!secret || !process.env.DATABASE_URL) {
  process.stderr.write('DATABASE_URL and WO_PLACES_PUSH_SECRET are required\n')
  process.exit(1)
}

const pool = createPool(process.env.DATABASE_URL)
try {
  const results = await pushPlaces({ pool, placeIds, to, secret, origin })
  for (const r of results) process.stdout.write(`${r.line}\n`)
  if (results.some((r) => !['imported', 'skipped_existing'].includes(r.outcome))) process.exitCode = 1
} finally {
  await pool.end()
}
