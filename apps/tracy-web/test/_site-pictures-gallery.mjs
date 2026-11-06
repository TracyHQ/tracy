// The invented Harrow Lane Climbing Wall for the gallery tile tests (gallery-tiles.js, ADR 0043 section 4): a kit of
// its own whose galleries are kit lists of picture rows, code generated photos, a fake looker door scripted per frame,
// and the seam where a checked round is finished (ladder-step.js createFinisher). No real model, no database.
import { createHash } from 'node:crypto'
import { after } from 'node:test'
import { fileStore } from '../src/site-pictures/file-store.js'
import { fillFrames } from '../src/site-pictures/fill-frames.js'
import { createFinisher } from '../src/site-pictures/ladder-step.js'
import { createLooker } from '../src/site-pictures/looker-step.js'
import { PICTURES_VERSION } from '../src/site-pictures/manifest-shape.js'
import { usablePhotos } from '../src/site-pictures/photo-shortlist.js'
import { manifestFor } from '../src/site-pictures/picker-picks.js'
import { checkPictures } from '../src/site-pictures/picture-check/check-pictures.js'
import { indexInputs } from '../src/site-pictures/picture-check/inputs-index.js'
import { picturePrompts } from '../src/site-pictures/picture-prompts.js'
import { scene } from './_generated-photos.mjs'
import { LOOKER_MODEL, storeDir } from './_site-pictures-bench.mjs'

const store = storeDir()
after(store.done)
const sha = (b) => createHash('sha256').update(b).digest('hex')

const frame = (id, width, height) => ({
  id,
  kind: 'photo',
  width,
  height,
  shape: { name: 'any', aspect: width / height },
  canHide: true,
  twinOf: null,
  fixed: false,
  picture: `images/demo/${id}.jpg`,
  role: null
})
const slot = (id) => ({
  key: id.replace(/^block-/, 'module-'),
  type: 'image',
  sample: `images/demo/${id}.jpg`,
  fit: { source: { width: 300, height: 300, format: 'jpg' } }
})
export const tiles = (block, n) => Array.from({ length: n }, (_, i) => `${block}.${i + 1}`)
// A gallery list as the kit tool writes it: one row per tile, each with its image slot; no row may drop (min = max).
const galleryList = (block, ids) => ({
  id: `${block}.gallery`,
  rowKind: 'slots',
  min: ids.length,
  max: ids.length,
  rows: ids.map((id, index) => ({ index, slots: [{ id, type: 'image' }] }))
})

/** The default layout: gallery block-t (4 tiles) on page-t, gallery block-u (2) on page-u, a lone frame on page-d. */
export const LAYOUT = [
  ['page-t', 'block-t', 4, true],
  ['page-u', 'block-u', 2, true],
  ['page-d', 'block-d', 1, false]
]

/** The kit of a layout: [page, block, frame count, gallery] rows. */
export function kit(layout = LAYOUT) {
  const blocks = layout.map(([, block, n, gallery]) => [block, tiles(block, n), gallery])
  return {
    kit: 'tracy-template-kit/2',
    contract: 'demo-walls/j6/1.0.0',
    template: { name: 'demo_walls', version: '1.0.0' },
    site: { brandColours: { primary: { value: '#3f6f4f' } } },
    blocks: blocks.map(([id, ids, gallery]) => ({
      id,
      role: 'section',
      frames: ids.map((f) => frame(f, 300, 300)),
      lists: gallery ? [galleryList(id, ids)] : []
    })),
    contentMap: { slots: blocks.flatMap(([, ids]) => ids).map(slot) }
  }
}

// The frame id is in the mood of every wish: the looker is not given the subject words of an any-real frame.
const wish = (f) => ({
  frame: f,
  kind: 'photo',
  match: 'any-real',
  size: 'square, 300 x 300',
  shows: 'the climbing wall',
  mustInclude: [],
  avoid: ['lettering'],
  mood: `lively, ${f}`,
  factIds: []
})
const galleryBlock = (block, ids) => ({
  block,
  seen: 'seen',
  decision: 'keep',
  why: 'fits',
  lists: [
    {
      list: `${block}.gallery`,
      rows: ids.length,
      items: ids.map((f) => ({ about: f, pictures: [wish(f)] }))
    }
  ]
})

/** The plan of a layout: every frame any-real, a gallery as one list, a lone frame as block pictures. */
export function plan(layout = LAYOUT) {
  return {
    version: 'site-plan/3',
    kit: 'tracy-template-kit/2 demo-walls/j6/1.0.0',
    site: { name: 'Harrow Lane Climbing Wall' },
    sharedBlocks: [],
    pages: layout.map(([page, block, n, gallery]) => ({
      id: page,
      decision: 'keep',
      blocks: [
        gallery
          ? galleryBlock(block, tiles(block, n))
          : { block, seen: 's', decision: 'keep', why: 'w', pictures: tiles(block, n).map(wish) }
      ]
    }))
  }
}

// Two tall owner photos: a square cut of one leaves room above and below for a second, clearly different cut.
export const TALL = new Map([
  ['p-a', await scene('bakery', 1000, 2000, 5)],
  ['p-b', await scene('dental', 1000, 2000, 7)]
])
// Three square owner photos: a square cut takes the whole photo, so no second cut keeps clear of the first.
export const SQUARE = new Map([
  ['p-a', await scene('bakery', 1000, 1000, 5)],
  ['p-b', await scene('dental', 1000, 1000, 7)],
  ['p-c', await scene('bakery', 1000, 1000, 11)]
])
function brief(photos) {
  return {
    language: 'en',
    facts: [{ id: 'f-name', field: 'name', value: 'Harrow Lane Climbing Wall', source: 'stated' }],
    assets: [...photos].map(([id, bytes]) => ({
      id,
      kind: 'image',
      category: 'other',
      sha256: sha(bytes),
      width: 1000,
      height: SQUARE.get(id) === bytes ? 1000 : 2000,
      quality: 'high',
      isBlurry: false,
      hasTextOrWatermark: false,
      showsOtherBusiness: false,
      isOwnPhoto: true,
      portraitOf: null,
      // No labelled subject: a reused cut then has to cover most of the photo (reuse-crop.js NO_SUBJECT_COVER), which a
      // square of a 1:2 photo just does; two clear cuts cannot both hold one small subject box.
      subjectBox: null,
      faceBoxes: []
    }))
  }
}

const frameOf = (text) => /block-[a-z]\.\d/.exec(text)?.[0] ?? null

/**
 * A fake looker door: rejects every look of the frames in `reject`, and the first look of the frames in `once`, for a
 * thing to avoid.
 */
function fakeLooker(reject, once = new Set()) {
  const looks = []
  const first = new Set(once)
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body)
    const f = frameOf(body.messages[1].content[0].text)
    looks.push(f)
    const no = reject.has(f) || first.delete(f)
    const said = no
      ? { verdict: 'fail', faults: ['forbidden item'], seen: 'A sign over a door.' }
      : { verdict: 'pass', faults: [], seen: 'People climbing an indoor wall.' }
    return new Response(
      JSON.stringify({
        model: LOOKER_MODEL,
        choices: [{ message: { role: 'assistant', content: JSON.stringify(said) } }],
        usage: { prompt_tokens: 900, completion_tokens: 40, cost: 0.0002 }
      }),
      { headers: { 'content-type': 'application/json' } }
    )
  }
  return { looks, fetchImpl }
}

/**
 * Code's round 0 and the finished round, on a layout and a photo set.
 * @param {Set<string>} reject frames the looker always rejects
 * @param {string} runId
 * @param {{ layout?: any[], photos?: Map<string, Buffer>, once?: Set<string> }} [opts]
 */
export async function finished(reject, runId, { layout = LAYOUT, photos = TALL, once } = {}) {
  const PHOTOS = photos
  const k = kit(layout)
  const p = plan(layout)
  const b = brief(photos)
  const fs = fileStore(store.dir)
  const idx = indexInputs({ plan: p, kit: k, brief: b, files: {} })
  const {
    files: made,
    refused,
    ...parts
  } = await fillFrames({ plan: p, brief: b, kit: k, photoBytes: PHOTOS })
  const measured = {}
  for (const [file, cut] of made) {
    await fs.putPicture(cut.bytes, cut.ext)
    measured[file] = { sha256: cut.sha256, width: cut.width, height: cut.height }
  }
  const hex = (c) => c.repeat(64)
  const base = {
    version: PICTURES_VERSION,
    fingerprint: { kit: 'k', planSha256: hex('a'), briefSha256: hex('b'), prompts: picturePrompts().roles },
    altNotes: [],
    refusedPhotos: refused,
    cost: { code: 0 },
    timing: { code: 0 }
  }
  const doc = manifestFor({ base, parts, picker: null, idx }, new Map())
  const prompts = picturePrompts()
  const looker = fakeLooker(reject, once)
  const finisher = createFinisher({
    idx,
    plan: p,
    kit: k,
    usable: usablePhotos(b, PHOTOS).usable,
    photoBytes: PHOTOS,
    store: fs,
    looker: createLooker({
      door: {
        providerId: 'openrouter',
        baseUrl: 'https://openrouter.test/api/v1',
        apiKey: 'k',
        model: LOOKER_MODEL
      },
      prompt: { text: prompts.looker, sha256: prompts.roles.looker },
      storeDir: store.dir,
      runId,
      idx,
      alts: null,
      fetchImpl: looker.fetchImpl
    }),
    drawing: null,
    drawer: { model: null, snapshot: null, promptSha256: prompts.roles.drawing }
  })
  const out = await finisher.finish(doc, { lastRound: true })
  const files = { ...measured }
  for (const f of out.files) files[f.file] = { sha256: f.sha256, width: f.width, height: f.height }
  const check = (pictures, onPlan = p) => checkPictures({ pictures, plan: onPlan, kit: k, brief: b, files })
  return { parts, out, m: out.doc, check, looker }
}

export const byFrame = (doc) => new Map(doc.frames.map((e) => [e.frame, e]))
export const rungs = (doc, f) =>
  doc.ladder.find((l) => l.frame === f)?.steps.map((s) => [s.rung, s.outcome]) ?? []
export const rule = (result, id) => result.rules.find((r) => r.id === id)
export const p06 = (result) => rule(result, 'P06')
