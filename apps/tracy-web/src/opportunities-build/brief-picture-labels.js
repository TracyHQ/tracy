/**
 * What the brief's photographs show, READ when the brief is made (F08), never asked then (item 27): the labels the photo
 * labelling wrote beside the research (`photo-labelling.js`), the label a reader takes (`visionKey`, p6: the content label
 * and its links to the brief's closed list). `POST /revisions` and a build's brief step call no model here.
 *
 * 🔒 THE SAME PHOTOS AS THE LABELLER. `photosToLabel` chooses and orders them for both: the owner's first, the largest
 * first, at most the stored media (300). A photo outside that list says why (`video`, `too_small`, `over_cap`...).
 * 🔒 A LABEL OF THIS LIST ONLY. A label made against another closed list of offerings and people is not read; the
 * labeller links it again (cheap, text only) and the next brief reads it.
 * 🔒 EVERY UNLABELLED PICTURE SAYS WHY (`note.unlabelled`, id to reason): still being looked at (`labelling`), failed
 * after its retry (`vision_failed`), left when the build stopped waiting (`labelling_stalled`), or never shown.
 * 🔒 NEVER IN THE WAY OF THE BRIEF. No model, an unreadable store: nothing is labelled and the note says why. This step
 * never throws; when photos are left to label it starts the labeller (`labelling.start`) and goes on.
 */
import { closedListDigest } from 'website-opportunities/domain/pictures/picture-links.mjs'
import { ASSET_UNLABELLED_REASONS } from 'website-opportunities/domain/pictures/asset-labels.mjs'
import { visionContentKey, visionKey } from '../lib/picture-vision.js'
import { analysisStates } from './media-analysis.js'
import { PHOTO_LABEL_CEILING, photosToLabel } from './photo-labelling.js'

const entryOf = (key, model, labels) => ({ key, model, labels })
/** Reasons the brief may name (`asset-labels.mjs`); a failure kept in another word reads as `vision_failed`. */
const REASONS = new Set(ASSET_UNLABELLED_REASONS)
const isFailure = (r) => r && r !== 'labelling' && r !== 'labelling_stalled'

/** The reason most pictures share (the first of a tie), or `vision_failed`. */
function commonest(reasons) {
  const counts = new Map()
  for (const r of reasons) counts.set(r, (counts.get(r) ?? 0) + 1)
  let best = null
  for (const [r, n] of counts) if (!best || n > counts.get(best)) best = r
  return best ?? 'vision_failed'
}

/**
 * @param {{pool: {query: Function}, visionFor: () => Promise<any>,
 *   labelling?: {start: (who: {accountId: string, opportunityId: string}) => unknown} | null, maxPictures?: number,
 *   log?: {warn?: Function}}} deps - `visionFor`: the vision door (`{url, key, model}`, or `{door}`); `labelling`: the
 *   background labeller, started when photos are left to label
 */
export function createBriefPictureLabels({
  pool,
  visionFor,
  labelling = null,
  maxPictures = PHOTO_LABEL_CEILING,
  log = console
}) {
  /**
   * @param {{media: any[], brand: any, accountId: string | null, opportunityId?: string | null, trade?: string | null,
   *   closedList?: {offerings?: any[], people?: any[]} | null, businessName?: string | null,
   *   waited?: {state: string} | null}} input - `waited`: how the build's wait for the labelling ended (`gate`)
   * @returns {Promise<{labels: Map<string, {key: string, model: string, labels: any}>, note: Record<string, any>}>}
   */
  return async function labelBriefPictures({
    media,
    brand,
    accountId,
    opportunityId = null,
    closedList = null,
    businessName = null,
    waited = null
  }) {
    const labels = new Map()
    const note = { status: 'none', asked: 0, labelled: 0, cached: 0, max: maxPictures }
    /** @type {Record<string, string>} */
    const unlabelled = {}
    const done = (out) => ({ labels, note: Object.keys(unlabelled).length ? { ...out, unlabelled } : out })
    const { wanted, skipped } = photosToLabel(media, { brand, businessName, ceiling: maxPictures })
    for (const [id, reason] of skipped) unlabelled[id] = reason
    try {
      const got = await visionFor()
      const door = got?.door ?? got
      if (!door?.model) {
        for (const m of wanted) unlabelled[m.id] = 'no_vision_model'
        return done({ ...note, status: 'off', reason: 'no_vision_model' })
      }
      if (!wanted.length) return done(note)
      const key = visionKey(door)
      const digest = closedListDigest(closedList)
      const shas = wanted.map((m) => m.sha256)
      const merged = await analysisStates(pool, shas, { door, key })
      const content = await analysisStates(pool, shas, { door, key: visionContentKey(door) })
      const stalled = waited?.state === 'stalled'
      let failed = 0
      for (const m of wanted) {
        const own = m.labels?.vision?.key === key ? m.labels.vision.labels : null
        const shared = merged.get(m.sha256)
        const held = [own, shared?.state === 'done' ? shared.result : null].find(
          (l) => l && typeof l === 'object' && (l.closedList ?? null) === digest
        )
        if (held) {
          labels.set(m.id, entryOf(key, door.model, held))
          continue
        }
        const c = content.get(m.sha256)
        if (c?.state === 'failed') {
          failed += 1
          unlabelled[m.id] = REASONS.has(c.result?.reason) ? c.result.reason : 'vision_failed'
        } else unlabelled[m.id] = stalled ? 'labelling_stalled' : 'labelling'
      }
      note.asked = wanted.length
      note.labelled = labels.size
      note.cached = labels.size
      const left = wanted.length - labels.size
      if (left > failed && labelling && accountId && opportunityId)
        void labelling.start({ accountId, opportunityId })
      if (!left) return done({ ...note, status: 'labelled' })
      const status = stalled ? 'stalled' : left > failed ? 'labelling' : labels.size ? 'partial' : 'failed'
      return done({
        ...note,
        status,
        ...(failed
          ? { failed, reason: commonest(wanted.map((m) => unlabelled[m.id]).filter(isFailure)) }
          : {}),
        ...(left > failed ? { waiting: left - failed } : {})
      })
    } catch (error) {
      log.warn?.(`[brief pictures] the photo labels could not be read (${error?.message ?? error})`)
      for (const m of wanted) unlabelled[m.id] ??= 'vision_failed'
      return done({ ...note, status: 'failed', reason: 'labels_unreadable' })
    }
  }
}
