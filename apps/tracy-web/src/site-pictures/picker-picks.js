// The picker's answers (#342, ADR 0043 sections 3 and 4). Pure: every photo the picker may choose was cut before
// its call (picker-input.js), so applying an answer is a lookup.
//
// The picker answers { picks: [{ frame, photo, reason }] }: a photo code from the frame's shortlist, or "none". Its
// answer is read as a change list for the shared run loop (one change per pick), in round 0 as in a fix round, and
// applied onto the previous manifest's picks (applyPicks): a valid pick places its cut photo, and the frame's twins
// follow it; "none" leaves the frame pending for the drawer. A pick that names no frame of the picker, a code outside
// the frame's shortlist, no reason, or a frame twice is rejected on its own and sent back once; every valid pick is
// applied. The manifest is always put together again from the code half and all picks, so twins and usage never
// drift.
//
// A fix round sends back only the failures of frames the picker placed or left unanswered (splitForPicker): failures
// of frames code decided, or that wait for another step (the drawer, icons, cut-outs), are kept on the round's check
// result (`notForPicker`) and never go to the picker. When nothing is left for the picker the run ends.
import { invalidChangesMessage as invalidChangesMessageFor } from '../lib/bench-changes.js'
import { WAITS_FOR } from './fill-frames.js'
import { addTwins, pendingEntry, placedEntry } from './frame-entries.js'
import { ANSWER_FORM, NO_FIT_REASON } from './picker-input.js'
import { failureListText } from './picture-check/check-pictures.js'

/** What a frame waits for once no owner photo is chosen for it: the drawer (#344). */
export const WAITS_FOR_DRAWER = 'drawer'
/** The answer of a frame no photo fits. */
export const NONE = 'none'

const isObject = (x) => Boolean(x) && typeof x === 'object' && !Array.isArray(x)
const isText = (x) => typeof x === 'string' && x.trim() !== ''

/** The picker's answer as a change list, or null when it holds no list of picks. */
export function pickerChanges(value) {
  if (!isObject(value) || !Array.isArray(value.picks)) return null
  return { changes: value.picks.map((p) => (isObject(p) ? { ...p } : { entry: p })) }
}

/**
 * The manifest for a set of picks: the code half's parts, a placed entry for every picked photo, a pending entry for
 * the drawer for every "none" and every frame no photo fits, a pending entry for the picker for every frame not yet
 * answered, then the twins, the usage counts and the picks themselves.
 * @param {{ base: object, parts: object, picker: object, idx: object }} ready `base` the manifest's fixed fields,
 *   `parts` what fillFrames decided, `picker` picker-input.js's input (or null when the run has no picker)
 * @param {Map<string, { photo: string, reason: string }>} picks by frame
 */
export function manifestFor(ready, picks) {
  const { base, parts, picker, idx } = ready
  const entries = new Map()
  for (const list of ['frames', 'siteSettings'])
    for (const entry of parts[list]) entries.set(entry.frame, { list, entry })
  const pending = parts.pending.filter((p) => p.waitsFor !== WAITS_FOR.picker)
  const returns = [...parts.returns]
  const usage = new Map(parts.usage.map((u) => [u.asset, u.frames]))
  const frame = (id) => idx.frames.get(id)
  const waits = (id, reason) =>
    pending.push(pendingEntry(idx.wishes.get(id), frame(id), WAITS_FOR_DRAWER, reason))
  const answered = []
  for (const f of picker?.frames ?? []) {
    const pick = picks.get(f.frame)
    answered.push({
      frame: f.frame,
      photo: pick?.photo ?? null,
      asset: pick && pick.photo !== NONE ? f.candidates.get(pick.photo).asset : null,
      reason: pick?.reason ?? null
    })
    if (!pick) {
      pending.push(
        pendingEntry(f.wish, frame(f.frame), WAITS_FOR.picker, 'a specific picture is chosen by the picker')
      )
      continue
    }
    if (pick.photo === NONE) {
      waits(f.frame, `the picker found no fitting photo: ${pick.reason}`)
      continue
    }
    const cut = f.candidates.get(pick.photo)
    usage.set(cut.asset, (usage.get(cut.asset) ?? 0) + 1)
    entries.set(f.frame, {
      list: f.list,
      entry: placedEntry(f.frame, 'owner-photo', cut, {
        asset: cut.asset,
        reason: `chosen by the picker: ${pick.reason}`,
        ...(f.list === 'siteSettings' ? { writeDoor: 'none' } : {})
      })
    })
  }
  for (const id of picker?.noFit ?? []) waits(id, NO_FIT_REASON)
  // A picker frame the run could not send to a picker (no door) waits for the drawer and says why.
  const handled = new Set([...(picker?.frames ?? []).map((f) => f.frame), ...(picker?.noFit ?? [])])
  for (const p of parts.pending)
    if (p.waitsFor === WAITS_FOR.picker && !handled.has(p.frame) && !isTwinOf(idx, p.frame))
      waits(p.frame, picker?.missing ?? 'the run has no picker')
  addTwins({ idx, entries, returns, pending })
  const of = (list) => [...entries.values()].filter((e) => e.list === list).map((e) => e.entry)
  return {
    ...base,
    frames: of('frames'),
    siteSettings: of('siteSettings'),
    returns,
    pending,
    picks: answered,
    usage: [...usage].map(([asset, frames]) => ({ asset, frames }))
  }
}

const isTwinOf = (idx, id) => Boolean(idx.frames.get(id)?.twinOf) || Boolean(idx.wishes.get(id)?.sameAs)

// Why one pick cannot be applied, or null.
function pickProblem(change, frames) {
  if (Object.hasOwn(change, 'entry')) return 'a pick must be an object { frame, photo, reason }'
  if (!isText(change.frame)) return 'a pick must name its frame'
  const f = frames.get(change.frame)
  if (!f) return `frame ${change.frame} is not one of the frames you were asked to pick for`
  if (!isText(change.photo)) return `frame ${change.frame}: photo must be a code from its list, or "none"`
  if (change.photo !== NONE && !f.candidates.has(change.photo))
    return `frame ${change.frame}: ${change.photo} is not in its photos list (${[...f.candidates.keys()].join(', ')}), answer one of them or "none"`
  if (!isText(change.reason)) return `frame ${change.frame}: give a reason, one sentence`
  return null
}

/**
 * The previous manifest with every valid pick applied (the shared loop's applyValidChanges): `{ ok: true, doc,
 * replacements: [], applied, rejected: [{ index, reason, change }], validChanges }`, or `{ ok: false, reason }` when
 * there is no list of picks. Round 0 has no previous manifest: its picks go onto the code half's.
 */
export function applyPicks(previous, changeList, { ready }) {
  const changes = changeList?.changes
  if (!Array.isArray(changes) || !changes.length) return { ok: false, reason: 'the answer holds no pick' }
  const frames = new Map((ready.picker?.frames ?? []).map((f) => [f.frame, f]))
  const picks = new Map()
  // A pick is kept only while its code is still on the frame's shortlist (a resumed run cuts the shortlist again).
  for (const p of (previous ?? ready.manifest)?.picks ?? [])
    if (p.photo === NONE || frames.get(p.frame)?.candidates.has(p.photo))
      picks.set(p.frame, { photo: p.photo, reason: p.reason })
  const rejected = []
  const validChanges = []
  const seen = new Set()
  for (const [n, change] of changes.entries()) {
    const problem = !isObject(change)
      ? 'it is not an object'
      : (pickProblem(change, frames) ??
        (seen.has(change.frame) ? `frame ${change.frame} is named twice in this answer` : null))
    if (problem) {
      rejected.push({ index: n, reason: problem, change })
      continue
    }
    seen.add(change.frame)
    picks.set(change.frame, { photo: change.photo, reason: change.reason.trim() })
    validChanges.push(change)
  }
  const doc = manifestFor(ready, picks)
  if (previous?.readabilityRetries?.length) {
    doc.readabilityRetries = [...previous.readabilityRetries]
    // A fix round rebuilds cuts from the original owner photos. Reselecting the same candidate keeps its recorded
    // transformed bytes; the finisher still checks those bytes through the independent looker's durable cache.
    for (const list of ['frames', 'siteSettings']) {
      const prior = new Map((previous[list] ?? []).map((entry) => [entry.frame, entry]))
      doc[list] = doc[list].map((entry) => {
        const held = prior.get(entry.frame)
        const sameRetry = previous.readabilityRetries.some(
          (retry) =>
            retry.frame === entry.frame &&
            retry.sourceSha256 === entry.sha256 &&
            retry.sha256 === held?.sha256
        )
        return sameRetry
          ? {
              ...entry,
              file: held.file,
              sha256: held.sha256,
              sitePath: held.sitePath,
              width: held.width,
              height: held.height,
              darkened: true,
              overlay: held.overlay
            }
          : entry
      })
    }
  }
  return {
    ok: true,
    doc,
    replacements: [],
    applied: validChanges.length,
    rejected,
    validChanges
  }
}

/**
 * A picture check result split for the shared run loop: `forPicker` the failure lines of the frames the picker placed
 * or has not answered (what a fix round sends back, and the round's failure list), `notForPicker` every other failure
 * line (frames code decided, frames waiting for the drawer, icons or cut-outs), which never goes to the picker and is
 * kept on the round's check result. When `forPicker` is empty the loop ends the run, so a run with no picker frame
 * calls no model.
 * @param {object} result checkPictures's result
 * @param {object} manifest the manifest it graded
 */
export function splitForPicker(result, manifest) {
  const ours = new Set((manifest?.picks ?? []).filter((p) => p.photo !== NONE).map((p) => p.frame))
  const mine = (where) => ours.has(String(where).replace(/^siteSettings /, ''))
  const part = (keep) =>
    failureListText({
      rules: (result.rules ?? []).map((r) => ({ ...r, failures: (r.failures ?? []).filter(keep) }))
    })
  return {
    ...result,
    forPicker: part((f) => mine(f.where)),
    notForPicker: part((f) => !mine(f.where))
  }
}

/** Appended after the failure list of a fix round. */
export const CHANGES_INSTRUCTION = [
  '',
  'The frames above failed the picture check. Answer for these frames only: choose another photo from the frame\'s list, or "none" when no photo in it fits, as one JSON object with nothing before or after it:',
  ANSWER_FORM,
  ''
].join('\n')

/** Sent once in a round when some picks could not be applied: only those come back. */
export const invalidChangesMessage = (rejected, applied) =>
  invalidChangesMessageFor(rejected, applied, { noun: 'picks' }).replace(
    /Answer with only the corrected edits[^\n]*/,
    `Answer with only these picks, corrected, as one JSON object ${ANSWER_FORM} with nothing before or after it. Do not resend the picks that were applied.`
  )

/** Sent once when the picks could not be applied at all. */
export const WHOLE_PICKS_MESSAGE = `Your answer could not be applied. Answer with a pick for every frame you were asked about, as one JSON object ${ANSWER_FORM} with nothing before or after it.\n`

/** What a round whose answer is not one JSON object sends back, as its failure list. */
export const NOT_PICKS_MESSAGE = `Your answer is not a list of picks. Answer with one JSON object ${ANSWER_FORM} with nothing before or after it.\n`
