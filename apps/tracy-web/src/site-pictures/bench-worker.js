// The picture bench worker (ADR 0043, #340, #342): the picture step as one more step of the shared bench run loop
// (lib/bench-run-loop.js), which claims the queued run, plays its rounds, checks them and stores the verdict. This file
// says what is the picture step's own.
//
// Before round 0 the step reads the owner photos (each checked against its hash, owner-photos.js), decides every frame
// it can by code (fill-frames.js), cuts every photo of the picker's shortlists (picker-input.js) and stores every
// picture file on disk by its sha256 with a row per file. Round 0 is then one picker call for the whole site (a writing
// turn of the loop): one user message with the frames that need a specific picture, the plan's words and the photo
// codes of each shortlist, and the owner photos once, as 512 px thumbnails tagged with their codes; never a demo
// picture of the kit. Its picks are applied as a change list onto the code half (picker-picks.js) and the manifest is
// graded with the picture check. The failures of the frames the picker placed or left unanswered go back to the same
// conversation, at most two fix rounds; invalid picks are sent back once, valid ones applied. A frame no photo fits, or
// that the picker answered "none", waits for the drawer (#344). A run whose plan has no such frame calls no model:
// round 0 is the code half alone. Failures the picker cannot fix (frames of code, icons, cut-outs) never go back: the
// round's failure list holds only the picker's (so the loop ends once none is left, and those stand on the run), and
// every other failure is kept on the round's check result as `notForPicker`.
//
// A redeploy mid-run claims the run again: the step repeats the same code work (the same bytes, files written once by
// hash), and stores no file again once round 0 is checked; the loop resumes the conversation from the saved turns, and
// the thumbnails are made again from the owner photos.
//
// Every checked round is then finished (#343, #344, ladder-step.js): the frames waiting for the drawer are drawn or
// extended through the drawer's own door, pictures with text over them are darkened, the looker checks each finished
// picture through its own door, and every rejected frame the picker does not get back climbs the fallback ladder (one
// redraw, the next photo, fewer rows, hidden, returned to the planner). Cut-out frames (#346) are drawn there too, on a
// plain ground that code removes, then looked at; one redraw, then hidden or returned. The looker's rejections join the round's
// failures, so a rejected frame the picker placed goes back in the next fix round with its fault names.

import sharp from 'sharp'
import { BENCH_QUEUE, createBenchQueue } from '../lib/bench-run-loop.js'
import { kitIdOf } from '../lib/kit-id.js'
import { SITE_PICTURES_STORE, saveFile } from './bench-store.js'
import { demoPictureReader } from './demo-pictures.js'
import { picturePickerDoor } from './door.js'
import { runDrawerDoor } from './drawer-door.js'
import { fileStore } from './file-store.js'
import { fillFrames } from './fill-frames.js'
import { joinSurface } from './frame-surface/surface.js'
import { surfaceFor } from './frame-surface/surface-cache.js'
import { iconStepFor } from './icon-step.js'
import { openKitWithMap } from './kit-with-map.js'
import { createDrawing } from './ladder-draw.js'
import { createFinisher } from './ladder-step.js'
import { runLookerDoor } from './looker-door.js'
import { withLooker } from './looker-round.js'
import { createLooker } from './looker-step.js'
import { PICTURES_VERSION } from './manifest-shape.js'
import { ownerPhotoBytes } from './owner-photos.js'
import { usablePhotos } from './photo-shortlist.js'
import { pickerFirstMessage, pickerInput, thumbnailResolver } from './picker-input.js'
import {
  applyPicks,
  CHANGES_INSTRUCTION,
  invalidChangesMessage,
  manifestFor,
  NOT_PICKS_MESSAGE,
  pickerChanges,
  splitForPicker,
  WHOLE_PICKS_MESSAGE
} from './picker-picks.js'
import { CHECKER_VERSION, checkPictures } from './picture-check/check-pictures.js'
import { indexInputs } from './picture-check/inputs-index.js'
import { picturePrompts } from './picture-prompts.js'

export { BENCH_QUEUE }

/** Round 0's answer when no picker was called: the code half (compared by identity, never read from a model). */
const CODE_HALF = Object.freeze({ by: 'code' })

/** Fix rounds after round 0: round 2 is the last manifest scored. */
export const MAX_FIX_ROUNDS = 2

/** The picture step as a bench step (lib/bench-run-loop.js). */
export const SITE_PICTURES_STEP = Object.freeze({
  name: 'site-pictures',
  codePrefix: 'SITE_PICTURES',
  store: SITE_PICTURES_STORE,
  maxFixRounds: MAX_FIX_ROUNDS,
  prompt: picturePrompts,
  checker: Object.freeze({
    version: CHECKER_VERSION,
    // The whole result is stored on the round; the loop's failure list is only what the picker can fix.
    check: ({ doc, row, ready }) =>
      splitForPicker(
        checkPictures({
          pictures: doc,
          plan: row.plan,
          kit: ready.kit.doc,
          brief: row.brief,
          files: ready.files
        }),
        doc
      ),
    failureListText: (result) => result.forPicker
  }),
  changes: Object.freeze({
    applyValidChanges: applyPicks,
    // A pick replaces one frame's photo; there is no large replacement to refuse.
    oversized: () => [],
    smallEditsMessage: () => '',
    invalidChangesMessage
  }),
  messages: Object.freeze({
    changesInstruction: CHANGES_INSTRUCTION,
    wholeDoc: WHOLE_PICKS_MESSAGE,
    notADoc: NOT_PICKS_MESSAGE
  }),
  // Round 0 is one picker call, or none when no frame waits for the picker: then the loop reads the code half.
  nextTurn: ({ ready, answers }) => (answers.length === 0 && ready.firstUser ? ready.firstUser : null),
  mergeTurns: (answers) => answers[0] ?? CODE_HALF,
  // An answer with no list of picks is an empty change list: the loop asks once for every pick.
  readAnswer: (value, { ready }) =>
    value === CODE_HALF ? ready.manifest : (pickerChanges(value) ?? { changes: [] }),
  prepare,
  agentRequest: ({ ready }) => ({
    firstUser: ready.firstUser,
    tools: [],
    resolveImage: ready.picker ? thumbnailResolver(ready.picker) : undefined
  })
})

/**
 * @param {{ pool: import('pg').Pool, secret?: string, objects?: { get: Function } | null, storeDir?: string,
 *   webroot?: (release: string) => Promise<object>,
 *   fetchImpl?: typeof fetch, balanceFetch?: typeof fetch, index?: Map<string, object>, log?: Console,
 *   now?: () => number, retry?: object }} deps `secret` opens the picker door's key; `objects`: the media store a
 *   revision's photos are read from; `storeDir`: the bench's file store; `index`: the contracts to find kits in
 *   (tests); `retry` replaces the run's retry policy (tests); `webroot` downloads a release's webroot tar.gz, where
 *   the kit's demo icons are read (icon-step.js releaseWebroot); `quickstart` downloads a release asset by name, the
 *   quickstart installer the frame surface reads (frame-surface/surface-cache.js)
 */
export function createSitePicturesQueue({ log = console, now, ...deps }) {
  return createBenchQueue(withLooker(SITE_PICTURES_STEP), { ...deps, log, now })
}

// The run's picker door when it was started with one (bench-control.js): the same provider, model and endpoint, or a
// refusal. A run started with no door (its plan has no frame for the picker) gets none.
async function doorOf({ pool, secret }, row) {
  if (!row.door?.door) return { ok: true, door: null }
  const door = await picturePickerDoor({ pool, secret })
  if (!door.ok) return door
  const same = ['providerId', 'model', 'endpointHost'].every((k) => door.snapshot[k] === row.door?.[k])
  if (!same)
    return {
      ok: false,
      code: 'SITE_PICTURES_DOOR_CHANGED',
      reason: `the door now uses ${door.snapshot.providerId} ${door.snapshot.model}, the run was started on ${row.door?.providerId} ${row.door?.model}`
    }
  return door
}

// The kit, the door, the owner photos, every frame code decides, the picker's input and every file stored; or a
// refusal. Once round 0 is checked, the files are already stored and recorded, so none is recorded again.
async function prepare(deps, row) {
  let kit = openKitWithMap(row.kit?.ref, deps.index ? { index: deps.index } : {})
  if (!kit)
    return { ok: false, code: 'SITE_PICTURES_KIT_GONE', reason: `the kit ${row.kit?.ref} cannot be read` }
  const door = await doorOf(deps, row)
  if (!door.ok) return door
  const lookerDoor = await runLookerDoor({ ...deps, picker: door.door ?? null }, row.door?.looker)
  if (!lookerDoor.ok) return lookerDoor
  const drawerDoor = await runDrawerDoor(deps, row.door?.drawer)
  if (!drawerDoor.ok) return drawerDoor
  const rounds = await SITE_PICTURES_STORE.roundsOf(deps.pool, row.id)
  const recorded = rounds.some((r) => r.state === 'checked')
  const store = fileStore(deps.storeDir)
  // The frame surface (ADR 0043 section 3e): text over each picture and the template's own overlay over it, read once
  // per kit version and quickstart and joined into the kit's frames; it never changes the kit itself.
  const surface = await surfaceFor({
    dir: store.dir,
    kit,
    kitId: kitIdOf(kit.doc, row.kit?.ref),
    fetchAsset: deps.quickstart ?? null
  })
  kit = { ...kit, doc: joinSurface(kit.doc, surface.surface) }
  const started = Date.now()
  const photoBytes = await ownerPhotoBytes({ ...deps, store }, row)
  // The icon step (#345): library icons ranked by a text model, styled like the kit's demo icons.
  const iconStep = await iconStepFor({
    pool: deps.pool,
    secret: deps.secret,
    fetchImpl: deps.fetchImpl,
    storeDir: store.dir,
    runId: row.id,
    webroot: deps.webroot ?? null,
    kit,
    business: typeof row.plan?.site?.name === 'string' ? row.plan.site.name : null
  })
  const filled = await fillFrames({
    plan: row.plan,
    brief: row.brief,
    kit: kit.doc,
    photoBytes,
    icons: iconStep.icons
  })
  const iconsDone = iconStep.report()
  const { files: made, refused, ...parts } = filled
  const idx = indexInputs({ plan: row.plan, kit: kit.doc, brief: row.brief, files: {} })
  const { usable } = usablePhotos(row.brief, photoBytes)
  let picker = null
  if (door.door) picker = await pickerInput({ idx, manifest: parts, usable, photoBytes })
  const files = {}
  for (const [file, cut] of [...made, ...(picker?.files ?? [])]) {
    if (files[file]) continue
    const name = await store.putPicture(cut.bytes, cut.ext)
    // Measured again from the stored bytes, so the check grades what is on disk.
    const stored = await store.readPicture(name)
    if (!stored)
      return { ok: false, code: 'SITE_PICTURES_STORE', reason: `the file ${name} could not be stored` }
    const meta = await sharp(stored).metadata()
    files[file] = { sha256: cut.sha256, width: meta.width, height: meta.height }
    if (!recorded)
      await saveFile(deps.pool, {
        runId: row.id,
        sha256: cut.sha256,
        path: name,
        bytes: stored.length,
        width: meta.width,
        height: meta.height
      })
  }
  const base = {
    version: PICTURES_VERSION,
    fingerprint: {
      kit: kitIdOf(kit.doc, row.kit?.ref),
      planSha256: row.plan_sha256,
      briefSha256: row.brief_sha256,
      prompts: row.prompts
    },
    altNotes: [],
    refusedPhotos: refused,
    // The picker's cost is the cost of the run's turns (one row per call), and its balance is read around the run.
    cost: { code: 0, iconRanking: iconsDone.cost },
    timing: { code: Date.now() - started - iconsDone.timing, iconRanking: iconsDone.timing },
    iconRanking: iconsDone.ranking,
    frameSurface: { quickstart: surface.surface.quickstart, note: surface.note }
  }
  const looker = createLooker({
    door: lookerDoor.door,
    snapshot: lookerDoor.snapshot,
    prompt: { text: picturePrompts().looker, sha256: picturePrompts().roles.looker },
    storeDir: store.dir,
    runId: row.id,
    idx,
    alts: row.copy?.alts ?? null,
    fetchImpl: deps.fetchImpl
  })
  const prompts = picturePrompts()
  // The demo pictures of the cut-out frames, sent to the drawer as a style reference only (ladder-draw.js).
  const cutoutDemos =
    drawerDoor.door && (deps.quickstart || deps.webroot)
      ? await demoPictureReader({
          dir: store.dir,
          quickstart: deps.quickstart ?? null,
          webroot: deps.webroot ?? null
        }).forKit(kit)
      : null
  const finisher = createFinisher({
    idx,
    plan: row.plan,
    kit: kit.doc,
    usable,
    photoBytes,
    store,
    looker,
    drawing: drawerDoor.door
      ? createDrawing({
          door: drawerDoor.door,
          prompt: { parts: prompts.drawing, sha256: prompts.roles.drawing },
          storeDir: store.dir,
          runId: row.id,
          photoBytes,
          readDemo: cutoutDemos?.readDemo ?? null,
          accent: kit.doc?.site?.brandColours?.primary?.value ?? null,
          fetchImpl: deps.fetchImpl
        })
      : null,
    drawer: {
      model: drawerDoor.door?.model ?? null,
      snapshot: drawerDoor.snapshot ?? null,
      promptSha256: prompts.roles.drawing
    }
  })
  const ready = {
    ok: true,
    kit,
    door: door.door ?? undefined,
    files,
    idx,
    base,
    parts,
    picker,
    looker,
    finisher,
    store
  }
  ready.manifest = manifestFor(ready, new Map())
  ready.firstUser = picker?.frames.length ? pickerFirstMessage(picker) : null
  return ready
}
