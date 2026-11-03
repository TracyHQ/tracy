// Starting and cancelling a picture bench run (#340). A start checks everything a run needs before it is queued (the
// plan's and the brief's shape, the kit, the owner photos of a brief file) and stores what the run will use, so a
// refused start leaves nothing behind and an accepted one says exactly what it ran: plan, brief as used, where its
// owner photos come from, kit, prompt hashes and checker version, and, when the plan has a frame for the picker (#342),
// the picker door's snapshot (never the key) and the harness settings, and the drawer door's (#344, `door.drawer`): a
// frame the picker cannot fill is drawn, so such a run does not start without the drawer. Always the looker door's
// snapshot (#343, `door.looker`): a run does not start without the looker. The worker (bench-worker.js) does the rest.
import { briefShapeProblems } from '../lib/bench-brief-shape.js'
import { benchHarnessFor } from '../lib/bench-harness.js'
import { briefOfRevision, UUID } from '../lib/bench-sql.js'
import { readableKits } from '../lib/template-kit-source.js'
import { planShapeProblems } from '../site-writer/bench-control.js'
import {
  activeRun,
  createRun,
  readRun,
  requestCancel,
  SITE_PICTURES_RUN_ACTIVE,
  sha256Of
} from './bench-store.js'
import { fileStore, sha256Hex } from './file-store.js'
import { openKitWithMap } from './kit-with-map.js'
import { picturePickerDoor } from './door.js'
import { pictureDrawerDoor } from './drawer-door.js'
import { pictureLookerDoor } from './looker-door.js'
import { altsOfCopy } from './alt-notes.js'
import { briefImages } from './owner-photos.js'
import { CHECKER_VERSION } from './picture-check/check-pictures.js'
import { indexInputs } from './picture-check/inputs-index.js'
import { needsPicker } from './picker-input.js'
import { picturePrompts } from './picture-prompts.js'

export { briefOfRevision }

const refuse = (code, reason, extra = {}) => ({ ok: false, code, reason, ...extra })

/**
 * Queue one run, or refuse it with a reason and nothing written.
 * @param {{ pool: import('pg').Pool, secret?: string, plan: unknown, planSource: object, brief: unknown, briefSource: object,
 *   kitRef: string, startedBy: string, photos?: { name: string, files: Map<string, Buffer> } | null,
 *   storeDir?: string, index?: Map<string, object> }} input `photos`: for a brief file, the folder of owner photos the
 *   CLI read (its name and its files by file name, each named by its sha256); a revision's photos are read by the
 *   worker from the revision's media; `copy`: a writer copy file (site-copy/1) and its source, whose alts the run
 *   compares with what the looker saw (#343); only its alts, its hash and its source are stored
 */
export async function startPictureRun({
  pool,
  secret,
  plan,
  planSource,
  brief,
  briefSource,
  kitRef,
  startedBy,
  photos = null,
  copy = null,
  storeDir,
  index
}) {
  const where = index ? { index } : {}
  const kits = readableKits(where)
  if (!kits.some((k) => k.ref === kitRef))
    return refuse(
      'SITE_PICTURES_KIT_UNKNOWN',
      `No readable kit "${kitRef}". Readable kits: ${kits.map((k) => k.ref).join(', ') || 'none'}.`
    )
  const planProblems = planShapeProblems(plan, kitRef)
  if (planProblems.length)
    return refuse('SITE_PICTURES_PLAN_SHAPE', `The plan cannot run: ${planProblems.join('; ')}`, {
      problems: planProblems
    })
  const problems = briefShapeProblems(brief)
  if (problems.length)
    return refuse('SITE_PICTURES_BRIEF_SHAPE', `The brief cannot run: ${problems.join('; ')}`, { problems })
  let copyRow = null
  if (copy) {
    const read = altsOfCopy(copy.value)
    if (read.problem)
      return refuse('SITE_PICTURES_COPY_SHAPE', `The copy file cannot be used: ${read.problem}.`)
    copyRow = { source: copy.source, sha256: sha256Of(copy.value), alts: read.alts }
  }
  const kit = openKitWithMap(kitRef, where)
  if (!kit) return refuse('SITE_PICTURES_KIT_UNKNOWN', `The kit ${kitRef} cannot be read.`)
  // A plan with a frame for the picker needs the picker door; one without calls no model and stores no door.
  let door = null
  const specific = needsPicker(indexInputs({ plan, kit: kit.doc, brief, files: {} }))
  if (specific) {
    door = await picturePickerDoor({ pool, secret })
    if (!door.ok) return refuse(door.code, door.reason)
  }
  // Every run needs the looker (#343): it checks every finished picture.
  const looker = await pictureLookerDoor({ pool, secret, picker: door?.door ?? null })
  if (!looker.ok) return refuse(looker.code, looker.reason)
  // The picker's frames may need a drawing (no owner photo fits, or the picker answers "none"): the drawer door too.
  let drawer = null
  if (specific) {
    drawer = await pictureDrawerDoor({ pool, secret })
    if (!drawer.ok) return refuse(drawer.code, drawer.reason)
  }
  let photoSource
  if (briefSource?.kind === 'revision') photoSource = { kind: 'revision', revisionId: briefSource.revisionId }
  else {
    const read = await storePhotos(brief, photos, storeDir)
    if (!read.ok) return read
    photoSource = read.source
  }
  const active = await activeRun(pool)
  if (active) return activeRefusal(active)
  const created = await createRun(pool, {
    startedBy,
    plan,
    planSource,
    brief,
    briefSource,
    photoSource,
    copy: copyRow,
    kit: { ref: kit.ref, release: kit.release, version: kit.version },
    prompts: picturePrompts(),
    checkerVersion: CHECKER_VERSION,
    door: {
      ...(door ? door.snapshot : {}),
      looker: looker.snapshot,
      ...(drawer ? { drawer: drawer.snapshot } : {})
    },
    harness: door ? benchHarnessFor(door.snapshot.model, door.snapshot.providerId) : {}
  })
  if (created.error === SITE_PICTURES_RUN_ACTIVE) return activeRefusal(created.active)
  return { ok: true, run: created.run }
}

// A brief file's owner photos: every file in the folder is named by the sha256 of its bytes (an extension is allowed)
// and its bytes have that hash; the ones the brief lists as still images go into the bench's file store. Only the
// folder's name and the counts are stored on the run.
async function storePhotos(brief, photos, storeDir) {
  if (!photos) return { ok: true, source: { kind: 'folder', name: null, files: 0, used: 0 } }
  const wanted = new Set(briefImages(brief).map((a) => a.sha256))
  const store = fileStore(storeDir)
  let used = 0
  for (const [name, bytes] of photos.files) {
    const stem = name.split('.')[0]
    const sha = sha256Hex(bytes)
    if (stem !== sha)
      return refuse(
        'SITE_PICTURES_PHOTO_HASH',
        `The photo ${name} is not named by the sha256 of its bytes (${sha}); name every owner photo by its hash.`
      )
    if (!wanted.has(sha)) continue
    await store.putPhoto(bytes)
    used += 1
  }
  return { ok: true, source: { kind: 'folder', name: photos.name, files: photos.files.size, used } }
}

function activeRefusal(active) {
  const who = active
    ? `run ${active.id} (started by ${active.startedBy}, step ${active.step})`
    : 'another run'
  return refuse(SITE_PICTURES_RUN_ACTIVE, `Only one picture run at a time: ${who} is still active.`, {
    active
  })
}

/** Cancel a run: one no worker holds ends at once; one a worker holds is asked to stop between two steps. */
export async function cancelPictureRun(pool, runId) {
  if (!UUID.test(String(runId))) return refuse('SITE_PICTURES_RUN_NOT_FOUND', `No run ${runId}.`)
  const { rows } = await pool.query(
    `update site_picture_run set status = 'cancelled', step = 'done', cancel_requested_at = coalesce(cancel_requested_at, now()),
       finished_at = now(), updated_at = now(), lease_token = lease_token + 1
     where id = $1 and status = 'queued' and (lease_until is null or lease_until < now())
     returning id`,
    [runId]
  )
  if (rows.length) {
    await pool.query(
      `update site_picture_round set state = 'cancelled', finished_at = now() where run_id = $1 and state = 'planning'`,
      [runId]
    )
    return { ok: true, run: await readRun(pool, runId) }
  }
  const asked = await requestCancel(pool, runId)
  if (asked) return { ok: true, run: asked }
  const run = await readRun(pool, runId)
  if (!run) return refuse('SITE_PICTURES_RUN_NOT_FOUND', `No run ${runId}.`)
  return refuse('SITE_PICTURES_RUN_NOT_ACTIVE', `Run ${runId} has already ended (${run.status}).`)
}
