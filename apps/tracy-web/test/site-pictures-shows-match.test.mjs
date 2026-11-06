// The owner photos of a list's tiles go to the tile whose subject they show (card AV): the plan gives each any-real
// gallery tile a subject (`shows`) and the writer's alt follows it, so code pairs each photo's vision description with
// the tiles by word overlap (shows-match.js), not just any photo that fits. The invented Fernhill Racquet and Swim Club,
// code generated photos, no model.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { fillFrames } from '../src/site-pictures/fill-frames.js'
import { bestPairs, photoWords, wishWords } from '../src/site-pictures/shows-match.js'
import { scene } from './_generated-photos.mjs'
import { kit, tiles } from './_site-pictures-gallery.mjs'

const sha = (b) => createHash('sha256').update(b).digest('hex')
const LAYOUT = [['page-h', 'block-h', 4, true]]
const TILES = tiles('block-h', 4)

// What the plan asks each tile to show.
const SHOWS = {
  'block-h.1': 'two players in a padel rally on a glass court',
  'block-h.2': 'a swimming lesson at the edge of the pool',
  'block-h.3': 'children holding tennis rackets waiting for their turn',
  'block-h.4': 'a coach giving a high five to a child at the net'
}
// The owner photos, named so that code's usual order (by id, all else equal) hands each tile the wrong one.
const CAPTIONS = {
  'p-1': 'A coach and a young girl high five across the tennis net.',
  'p-2': 'Two players rally on a padel court with glass walls.',
  'p-3': 'Children splash in the swimming pool during a lesson.',
  'p-4': 'A row of children with tennis rackets wait on the court.'
}
const PHOTOS = new Map(
  await Promise.all(
    Object.keys(CAPTIONS).map(async (id, i) => [id, await scene('bakery', 1200, 1200, 3 + i)])
  )
)

function brief() {
  return {
    language: 'en',
    facts: [{ id: 'f-name', field: 'name', value: 'Fernhill Racquet and Swim Club', source: 'stated' }],
    assets: [...PHOTOS].map(([id, bytes]) => ({
      id,
      kind: 'image',
      category: 'people',
      sha256: sha(bytes),
      width: 1200,
      height: 1200,
      quality: 'high',
      isBlurry: false,
      hasTextOrWatermark: false,
      showsOtherBusiness: false,
      isOwnPhoto: true,
      portraitOf: null,
      caption: CAPTIONS[id],
      subjectBox: null,
      faceBoxes: []
    }))
  }
}

function plan() {
  return {
    version: 'site-plan/3',
    kit: 'tracy-template-kit/2 demo-walls/j6/1.0.0',
    site: { name: 'Fernhill Racquet and Swim Club' },
    sharedBlocks: [],
    pages: [
      {
        id: 'page-h',
        decision: 'keep',
        blocks: [
          {
            block: 'block-h',
            seen: 'seen',
            decision: 'keep',
            why: 'fits',
            lists: [
              {
                list: 'block-h.gallery',
                rows: 4,
                items: TILES.map((f) => ({
                  about: f,
                  pictures: [
                    {
                      frame: f,
                      kind: 'photo',
                      match: 'any-real',
                      size: 'square, 300 x 300',
                      shows: SHOWS[f],
                      mustInclude: [],
                      avoid: ['lettering'],
                      mood: 'lively',
                      factIds: []
                    }
                  ]
                }))
              }
            ]
          }
        ]
      }
    ]
  }
}

test('each gallery tile gets the owner photo whose description matches what the plan asks it to show', async () => {
  const out = await fillFrames({ plan: plan(), brief: brief(), kit: kit(LAYOUT), photoBytes: PHOTOS })
  const asset = new Map(out.frames.map((e) => [e.frame, e.asset]))
  assert.deepEqual(Object.fromEntries(asset), {
    'block-h.1': 'p-2',
    'block-h.2': 'p-3',
    'block-h.3': 'p-4',
    'block-h.4': 'p-1'
  })
  for (const e of out.frames) {
    assert.equal(e.source, 'owner-photo')
    assert.match(e.reason, /matches what the plan asks this tile to show/)
    assert.ok(out.files.has(e.file), `the file of ${e.frame} is kept`)
  }
  // Every file kept is placed: the cuts of the first placement are gone.
  assert.equal(out.files.size, 4)
  assert.deepEqual(
    out.usage.map((u) => u.frames),
    [1, 1, 1, 1]
  )
})

test('best pairs: the most shared words first, each tile and photo once, a tile with no match keeps its own', () => {
  const t = (id, shows, holds) => ({ id, words: wishWords({ shows }), holds })
  const p = (id, caption) => ({ id, words: photoWords({ caption }) })
  const pairs = bestPairs(
    [t('a', 'padel players on a glass court', 'x'), t('b', 'a quiet reception desk', 'y')],
    [p('x', 'A swimming pool lane.'), p('y', 'Padel players behind the glass of the court.')]
  )
  assert.deepEqual(
    pairs.map((q) => [q.tile, q.photo]),
    [['a', 'y']]
  )
})
