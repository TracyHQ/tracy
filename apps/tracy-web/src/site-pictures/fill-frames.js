// The code half of the picture step (#340, ADR 0043 section 3): every picture frame of the plan decided by code alone,
// with no model. Owner photos are cut for any-real frames (the shortlist's order: same offering, unused first; never
// drawn) and for person frames that have a confirmed portrait; other person frames get initials drawn by code in the
// template accent (recolourable); a frame with no fitting photo is hidden where the kit allows, else returned to the
// planner; frames the kit marks not writable are returned, except a picture painted behind blocks, which goes into
// siteSettings; twins copy their source. Specific, icon and cut-out frames are left as pending entries for the steps
// that come later (the picker, the icons, the cut-outs): never a demo picture. No owner photo is shown twice on a page.
import { initialsOf } from 'website-opportunities/domain/person-avatar.mjs'
import { initialsAvatar } from '../lib/initials-avatar.js'
import { cutPhoto, outputSizeFor } from './cut-photo.js'
import { addTwins, hiddenEntry, pendingEntry, placedEntry } from './frame-entries.js'
import { indexInputs } from './picture-check/inputs-index.js'
import { portraitsOf, rankForFrame, sameService, usablePhotos } from './photo-shortlist.js'

/** What each later step fills; a pending entry names it. */
export const WAITS_FOR = Object.freeze({ picker: 'picker', icons: 'icons', cutout: 'cut-out' })

const area = (f) => (Number(f.width) || 0) * (Number(f.height) || 0)

// The name a person fact gives: the text before a comma or bracket ("Mara Quill, owner"), or the value's name.
function personName(brief, factId) {
  const fact = (Array.isArray(brief?.facts) ? brief.facts : []).find((f) => f?.id === factId)
  const v = fact?.value
  if (typeof v === 'string') return v.split(/[,(|]/)[0].trim()
  return typeof v?.name === 'string' ? v.name : ''
}

/**
 * Decide every planned frame by code.
 * @param {{ plan: object, brief: object, kit: object, photoBytes: Map<string, Buffer> }} input `kit` with its content
 *   map under `contentMap`; `photoBytes` the owner photos by brief asset id, their hashes already checked
 * @returns {Promise<{ frames: object[], siteSettings: object[], returns: object[], pending: object[],
 *   usage: object[], refused: object[], files: Map<string, { bytes: Buffer, ext: string, width: number,
 *   height: number, sha256: string }> }>} `files` by their manifest path
 */
export async function fillFrames({ plan, brief, kit, photoBytes }) {
  const idx = indexInputs({ plan, kit, brief, files: {} })
  const { usable, refused } = usablePhotos(brief, photoBytes)
  const usage = new Map(usable.map((a) => [a.id, 0]))
  const onPage = new Set()
  const entries = new Map()
  const returns = []
  const pending = []
  const files = new Map()
  const accent = kit?.site?.brandColours?.primary?.value
  const keep = (made) => files.set(`files/${made.sha256}.${made.ext}`, made)

  const work = []
  for (const [frameId, wish] of idx.wishes) {
    const frame = idx.frames.get(frameId)
    if (!frame) {
      returns.push({ frame: frameId, reason: 'the frame is not in the kit' })
      continue
    }
    if (frame.writable === false && frame.paintedBehind !== true) {
      returns.push({
        frame: frameId,
        reason: `the kit marks this frame not writable: ${frame.writableReason ?? 'no reason given'}`
      })
      continue
    }
    if (frame.twinOf || wish.sameAs) continue
    const list = frame.writable === false ? 'siteSettings' : 'frames'
    if (frame.kind === 'logo')
      returns.push({ frame: frameId, reason: 'a logo frame belongs to the brand step' })
    else if (frame.kind === 'icon')
      pending.push(
        pendingEntry(
          wish,
          frame,
          WAITS_FOR.icons,
          'an icon is matched from the icon library by the icon step'
        )
      )
    else if (frame.kind === 'cutout')
      pending.push(
        pendingEntry(wish, frame, WAITS_FOR.cutout, 'a cut-out needs background removal and the looker')
      )
    else if (wish.match === 'any-real' || wish.match === 'person') work.push({ frameId, wish, frame, list })
    else
      pending.push(pendingEntry(wish, frame, WAITS_FOR.picker, 'a specific picture is chosen by the picker'))
  }
  // Person frames first (their photos are fixed by the brief), then the largest frames take the best photos; a
  // template setting picture (siteSettings, no write door yet) comes after every frame of the site.
  work.sort(
    (x, y) =>
      Number(y.wish.match === 'person') - Number(x.wish.match === 'person') ||
      Number(x.list === 'siteSettings') - Number(y.list === 'siteSettings') ||
      area(y.frame) - area(x.frame) ||
      (x.frameId < y.frameId ? -1 : 1)
  )

  // Try photos in order; the first that is free on every page of the frame and cuts well takes it.
  async function placePhoto({ frameId, wish, frame, list }, candidates, why) {
    const tried = []
    for (const a of candidates) {
      if ([...wish.pages].some((p) => onPage.has(`${p} ${a.id}`))) {
        tried.push(`${a.id} already on the page`)
        continue
      }
      const cut = await cutPhoto(photoBytes.get(a.id), a, frame, idx.demoSize(frameId), {
        matches: wish.match === 'person' || sameService(a, wish)
      })
      if (!cut.ok) {
        tried.push(`${a.id} ${cut.refused}`)
        continue
      }
      const reason = why(a)
      keep(cut)
      for (const p of wish.pages) onPage.add(`${p} ${a.id}`)
      usage.set(a.id, (usage.get(a.id) ?? 0) + 1)
      const extra = list === 'siteSettings' ? { writeDoor: 'none' } : {}
      entries.set(frameId, {
        list,
        entry: placedEntry(frameId, 'owner-photo', cut, { asset: a.id, reason, ...extra })
      })
      return null
    }
    return tried
  }

  for (const job of work) {
    const { frameId, wish, frame, list } = job
    let tried
    if (wish.match === 'person') {
      const portraits = portraitsOf(usable, idx.personIds(String(wish.person ?? '')))
      tried = await placePhoto(
        job,
        portraits,
        (a) => `brief photo ${a.id} is labelled as this person's portrait`
      )
      if (!tried) continue
      const letters = initialsOf(personName(brief, wish.person))
      if (letters) {
        const size = outputSizeFor(idx.demoSize(frameId), frame, frame.width)
        const made = await initialsAvatar({ ...size, initials: letters, colours: accent ? [accent] : [] })
        keep(made)
        entries.set(frameId, {
          list,
          entry: placedEntry(frameId, 'initials', made, {
            letters,
            recolourable: true,
            reason: 'no brief photo is labelled as this person; initials in the template accent'
          })
        })
        continue
      }
      tried = null
    } else {
      const ranked = rankForFrame(usable, wish, frame, usage).map((r) => r.a)
      tried = await placePhoto(
        job,
        ranked,
        (a) =>
          `any real photo: ${sameService(a, wish) ? 'shows this offering' : 'general'}, used ${usage.get(a.id)} times before`
      )
      if (!tried) continue
    }
    const why = !tried
      ? 'no confirmed portrait and no name to draw initials from'
      : `no fitting real photo${tried.length ? ` (tried ${tried.join(', ')})` : ''}`
    if (list === 'frames' && frame.canHide === true)
      entries.set(frameId, { list, entry: hiddenEntry(frameId, why) })
    else returns.push({ frame: frameId, reason: `${why}, and the frame cannot be hidden` })
  }

  addTwins({ idx, entries, returns, pending })
  const of = (list) => [...entries.values()].filter((e) => e.list === list).map((e) => e.entry)
  return {
    frames: of('frames'),
    siteSettings: of('siteSettings'),
    returns,
    pending,
    usage: [...usage].map(([asset, frames]) => ({ asset, frames })),
    refused,
    files
  }
}
