#!/usr/bin/env node
/**
 * Put the card pictures that live in this repository into a deployment's own store.
 *
 *   DATABASE_URL=postgres://… node scripts/template-shots-import.mjs [--only <template id>]
 *                                                                   [--templates <dir>] [--dry-run]
 *
 * WHY THIS SCRIPT EXISTS. From 16/09 a Design inspiration card's pictures are served by tracy-web
 * out of `template_shots` (`apps/tracy-web/src/lib/template-shots.js`), so publishing a card is a
 * press rather than a commit and an image build. The pictures of the cards published BEFORE that
 * are still only in `packages/fleet/tracy-fleet-operation/scripts/provision/templates/<id>/`, which
 * reaches a customer solely inside the dsh image. This carries them across, once per deployment —
 * that is the whole of the migration, and it needs no release and no image.
 *
 * 🔒 IDEMPOTENT, AND IT SAYS WHAT IT DID. Every picture is written to the row it already owns, and
 * the count says which ones came out the same bytes (`unchanged`) — so the same run twice in a row
 * is the same database, and the second run's numbers say so out loud. A name the store would refuse
 * is REPORTED, never dropped: a card drawn with three of its four pictures is the failure this
 * store was built to end, and a quiet skip reads as a successful run.
 */
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createPool } from '../apps/tracy-web/src/db/index.js'
import { listShots, putShot, shotProblem } from '../apps/tracy-web/src/lib/template-shots.js'

const TEMPLATES_DIR = fileURLToPath(
  new URL('../packages/fleet/tracy-fleet-operation/scripts/provision/templates/', import.meta.url)
)

/**
 * Which pictures of a read directory tree this import takes, and which it refuses and why.
 *
 * Pure, and the refusal reason comes from the STORE's own rule rather than a second copy of it:
 * two spellings of "what may be stored" is how one of them silently becomes wrong.
 * @param {{ id: string, files: string[] }[]} tree one entry per folder under `templates/`
 * @param {{ only?: string | null }} [filter]
 * @returns {{ take: { templateId: string, file: string }[], skip: { templateId: string, file: string, why: string }[] }}
 */
export function shotsFrom(tree, { only = null } = {}) {
  /** @type {{ templateId: string, file: string }[]} */
  const take = []
  /** @type {{ templateId: string, file: string, why: string }[]} */
  const skip = []
  for (const entry of tree) {
    if (only && entry.id !== only) continue
    for (const file of [...entry.files].sort()) {
      const why = shotProblem({ templateId: entry.id, file })
      if (why) skip.push({ templateId: entry.id, file, why })
      else take.push({ templateId: entry.id, file })
    }
  }
  return { take, skip }
}

/** The folders under `templates/`, each with the names it holds. */
async function readTree(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const tree = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    // eslint-disable-next-line no-await-in-loop -- a handful of folders, read once.
    const files = (await readdir(path.join(dir, entry.name), { withFileTypes: true }))
      .filter((f) => f.isFile())
      .map((f) => f.name)
    tree.push({ id: entry.name, files })
  }
  return tree
}

function flag(name, fallback = null) {
  const at = process.argv.indexOf(`--${name}`)
  return at === -1 ? fallback : (process.argv[at + 1] ?? fallback)
}

async function main() {
  const dir = flag('templates', TEMPLATES_DIR)
  const only = flag('only')
  const dryRun = process.argv.includes('--dry-run')
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl && !dryRun) {
    console.error('Set DATABASE_URL to the deployment whose store these pictures go into.')
    process.exitCode = 1
    return
  }

  const { take, skip } = shotsFrom(await readTree(dir), { only })
  for (const s of skip) console.warn(`skipped ${s.templateId}/${s.file}: ${s.why}`)
  if (dryRun) {
    console.log(`${take.length} to store, ${skip.length} refused (dry run, nothing written)`)
    return
  }

  const pool = createPool(databaseUrl)
  const counts = { added: 0, replaced: 0, unchanged: 0, skipped: skip.length }
  try {
    /** @type {Map<string, Map<string, string>>} */
    const before = new Map()
    for (const templateId of new Set(take.map((t) => t.templateId))) {
      // eslint-disable-next-line no-await-in-loop -- one query per template, not per picture.
      const shots = await listShots(pool, templateId)
      before.set(templateId, new Map(shots.map((s) => [s.file, s.sha256])))
    }
    for (const { templateId, file } of take) {
      // eslint-disable-next-line no-await-in-loop -- each picture is read and written in turn.
      const bytes = await readFile(path.join(dir, templateId, file))
      const had = before.get(templateId)?.get(file) ?? null
      // eslint-disable-next-line no-await-in-loop -- same.
      const { sha256 } = await putShot(pool, { templateId, file, bytes })
      if (had === null) counts.added += 1
      else if (had === sha256) counts.unchanged += 1
      else counts.replaced += 1
    }
  } finally {
    await pool.end()
  }
  console.log(
    `${counts.added} added, ${counts.replaced} replaced, ${counts.unchanged} unchanged, ${counts.skipped} refused`
  )
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
