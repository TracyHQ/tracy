#!/usr/bin/env node
/**
 * Copy this deployment's old Website Opportunities place pictures (`places/<uuid>/<sha>.<ext>` in the
 * artifact store) into the shared bucket under content-addressed keys, then re-key their rows
 * (tasks/plan-wo-shared-places.md §7; rules in `website-opportunities/src/place-media-move.js`).
 *
 * Copy, never delete: every source object stays. Resumable: a rerun skips rows already moved. A row
 * whose source is missing or does not hash to the row is skipped and listed by id, never "fixed".
 * Rollback, one statement (old keys are kept in `wo_place_media_rekey`):
 *   update wo_place_media m set object_key = r.old_key
 *   from wo_place_media_rekey r where r.media_id = m.id and m.object_key = r.new_key;
 *
 * Run where tracy-web runs (it reads DATABASE_URL, ARTIFACT_S3_* and, to move, PLACE_MEDIA_S3_*):
 *   docker exec <web> node scripts/copy-place-media-to-shared-bucket.mjs --dry-run [--deployment NAME]
 *   docker exec <web> node scripts/copy-place-media-to-shared-bucket.mjs --move [--batch 50]
 *
 * Prints counts and totals only, never an object URL (presigned URLs carry signatures).
 */
import { storeObjects } from '../src/app.js'
import { readArtifactStore, readPlaceMediaStore } from '../src/config.js'
import { createPool } from '../src/db/index.js'
import { movePlaceMedia, surveyPlaceMedia } from 'website-opportunities/src/place-media-move.js'

const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(name)
  return i === -1 ? undefined : args[i + 1]
}
const dryRun = args.includes('--dry-run')
const move = args.includes('--move')
const batch = Number(flag('--batch') ?? 50)
const deployment = flag('--deployment') ?? process.env.HOST_NAME ?? 'this-deployment'
if (dryRun === move || !Number.isInteger(batch) || batch < 1 || batch > 500) {
  process.stderr.write(
    'usage: copy-place-media-to-shared-bucket.mjs (--dry-run | --move) [--batch 1-500] [--deployment NAME]\n'
  )
  process.exit(2)
}
if (!process.env.DATABASE_URL) {
  process.stderr.write('DATABASE_URL is required\n')
  process.exit(1)
}
const artifactStore = readArtifactStore(process.env)
if (!artifactStore) {
  process.stderr.write('ARTIFACT_S3_ENDPOINT/BUCKET/ACCESS_KEY/SECRET_KEY are required (the source store)\n')
  process.exit(1)
}
const local = storeObjects(artifactStore, fetch)
const pool = createPool(process.env.DATABASE_URL)
const print = (value) => process.stdout.write(`${JSON.stringify({ deployment, ...value })}\n`)

try {
  if (dryRun) {
    print({ mode: 'dry-run', ...(await surveyPlaceMedia({ pool, local })) })
  } else {
    const placeMediaStore = readPlaceMediaStore(process.env)
    if (!placeMediaStore) {
      process.stderr.write('PLACE_MEDIA_S3_ENDPOINT/BUCKET/ACCESS_KEY/SECRET_KEY are required to move\n')
      process.exit(1)
    }
    const shared = storeObjects(placeMediaStore, fetch)
    const result = await movePlaceMedia({
      pool,
      local,
      shared,
      batch,
      onBatch: (counts) => print({ mode: 'move', progress: counts })
    })
    print({
      mode: 'move',
      done: true,
      moved: result.moved,
      movedBytes: result.movedBytes,
      skipped: result.skipped
    })
  }
} finally {
  await pool.end()
}
