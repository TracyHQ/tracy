// The picture bench worker (ADR 0043, #340): the picture step as one more step of the shared bench run loop
// (lib/bench-run-loop.js), which claims the queued run, plays its round, checks it and stores the verdict. This file
// says what is the picture step's own.
//
// The first runs are code only: no model is called. Before round 0 the step reads the owner photos (each checked
// against its hash, owner-photos.js), decides every frame by code (fill-frames.js), stores every picture file on disk
// by its sha256 with a row per file, and puts the site-pictures/1 manifest together; round 0 has no writing turn, so
// the loop reads that manifest as the round's answer and grades it with the picture check. Specific, icon and cut-out
// frames are pending entries the picture check counts as unfilled (P01); with no model to send failures back to there
// is no fix round, and what still fails is stored on the run. A redeploy mid-run claims the run again: the step
// repeats the same code work (the same bytes, files written once by hash, file rows kept), unless round 0 was already
// checked, in which case nothing is redone and the run just ends.
import { BENCH_QUEUE, createBenchQueue } from '../lib/bench-run-loop.js'
import { kitIdOf } from '../site-writer/bench-worker.js'
import { SITE_PICTURES_STORE, saveFile } from './bench-store.js'
import { fileStore } from './file-store.js'
import { fillFrames } from './fill-frames.js'
import { openKitWithMap } from './kit-with-map.js'
import { PICTURES_VERSION } from './manifest-shape.js'
import { ownerPhotoBytes } from './owner-photos.js'
import { CHECKER_VERSION, checkPictures, failureListText } from './picture-check/check-pictures.js'
import { picturePrompts } from './picture-prompts.js'
import sharp from 'sharp'

export { BENCH_QUEUE }

/** No fix round in a code only run: nothing could answer one. The picker brings them (#342). */
export const MAX_FIX_ROUNDS = 0

const CODE_ONLY = 'a code only picture run sends nothing to a model'

/** The picture step as a bench step (lib/bench-run-loop.js). */
export const SITE_PICTURES_STEP = Object.freeze({
  name: 'site-pictures',
  codePrefix: 'SITE_PICTURES',
  store: SITE_PICTURES_STORE,
  maxFixRounds: MAX_FIX_ROUNDS,
  prompt: picturePrompts,
  checker: Object.freeze({
    version: CHECKER_VERSION,
    check: ({ doc, row, ready }) =>
      checkPictures({
        pictures: doc,
        plan: row.plan,
        kit: ready.kit.doc,
        brief: row.brief,
        files: ready.files
      }),
    failureListText
  }),
  changes: Object.freeze({
    applyValidChanges: () => ({ ok: false, reason: CODE_ONLY }),
    oversized: () => [],
    smallEditsMessage: () => '',
    invalidChangesMessage: () => ''
  }),
  messages: Object.freeze({ changesInstruction: '', wholeDoc: '', notADoc: CODE_ONLY }),
  // Round 0 has no writing turn: the loop merges none and reads the manifest code made before the round.
  nextTurn: () => null,
  mergeTurns: () => ({ by: 'code' }),
  readAnswer: (_value, { ready }) => ready.manifest,
  prepare,
  agentRequest: () => {
    throw new Error(CODE_ONLY)
  }
})

/**
 * @param {{ pool: import('pg').Pool, objects?: { get: Function } | null, storeDir?: string,
 *   index?: Map<string, object>, log?: Console, now?: () => number }} deps `objects`: the media store a revision's
 *   photos are read from; `storeDir`: the bench's file store; `index`: the contracts to find kits in (tests)
 */
export function createSitePicturesQueue({ log = console, now, ...deps }) {
  return createBenchQueue(SITE_PICTURES_STEP, { ...deps, log, now })
}

// The kit, the owner photos, every frame decided and every file stored; or a refusal. A run whose round 0 is already
// checked needs none of the code work again.
async function prepare(deps, row) {
  const kit = openKitWithMap(row.kit?.ref, deps.index ? { index: deps.index } : {})
  if (!kit)
    return { ok: false, code: 'SITE_PICTURES_KIT_GONE', reason: `the kit ${row.kit?.ref} cannot be read` }
  const rounds = await SITE_PICTURES_STORE.roundsOf(deps.pool, row.id)
  if (rounds.some((r) => r.state === 'checked')) return { ok: true, kit }
  const store = fileStore(deps.storeDir)
  const started = Date.now()
  const photoBytes = await ownerPhotoBytes({ ...deps, store }, row)
  const filled = await fillFrames({ plan: row.plan, brief: row.brief, kit: kit.doc, photoBytes })
  const files = {}
  for (const [file, made] of filled.files) {
    const name = await store.putPicture(made.bytes, made.ext)
    // Measured again from the stored bytes, so the check grades what is on disk.
    const stored = await store.readPicture(name)
    if (!stored)
      return { ok: false, code: 'SITE_PICTURES_STORE', reason: `the file ${name} could not be stored` }
    const meta = await sharp(stored).metadata()
    files[file] = { sha256: made.sha256, width: meta.width, height: meta.height }
    await saveFile(deps.pool, {
      runId: row.id,
      sha256: made.sha256,
      path: name,
      bytes: stored.length,
      width: meta.width,
      height: meta.height
    })
  }
  const { files: _made, refused, ...parts } = filled
  const manifest = {
    version: PICTURES_VERSION,
    fingerprint: {
      kit: kitIdOf(kit.doc, row.kit?.ref),
      planSha256: row.plan_sha256,
      briefSha256: row.brief_sha256,
      prompts: row.prompts
    },
    ...parts,
    altNotes: [],
    refusedPhotos: refused,
    cost: { code: 0 },
    timing: { code: Date.now() - started }
  }
  return { ok: true, kit, manifest, files }
}
