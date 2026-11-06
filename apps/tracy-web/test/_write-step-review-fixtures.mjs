// Made-up data for the review page tests: an invented pilates studio, its plan, copy, pictures and a write report.
import { createHash } from 'node:crypto'

/** A 1 by 1 PNG. */
export const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)
export const SHA_A = createHash('sha256').update(PNG).digest('hex')
export const SHA_B = createHash('sha256').update('second').digest('hex')
export const SHA_C = createHash('sha256').update('third').digest('hex')
const path = (sha) => `images/tracy-content/${sha}.png`

export const plan = {
  pages: [
    {
      id: 'page-home',
      slug: '',
      decision: 'keep',
      blocks: [
        {
          block: 'block-10',
          copy: [{ slot: 'block-10.1' }, { slot: 'block-10.2' }],
          pictures: [
            {
              frame: 'block-10.3',
              kind: 'photo',
              shows: 'a class on mats in soft light',
              mood: 'calm',
              size: 'wide',
              avoid: ['crowds'],
              mustInclude: ['mats']
            }
          ]
        }
      ]
    },
    {
      id: 'page-studio',
      slug: 'studio',
      decision: 'keep',
      blocks: [
        {
          block: 'block-20',
          copy: [{ slot: 'block-20.1' }],
          pictures: [{ frame: 'block-20.2', kind: 'photo', shows: 'the reformer room' }]
        }
      ]
    },
    { id: 'page-old', decision: 'drop' }
  ],
  sharedBlocks: [{ block: 'header', copy: [{ slot: 'menuItem-1.0' }] }]
}

export const copy = {
  slots: [
    { slot: 'block-10.1', text: 'Pilates for every body' },
    { slot: 'block-10.2', text: 'Small classes, warm studio' },
    { slot: 'block-10.9', text: 'Far away line' },
    { slot: 'block-20.1', text: 'The reformer room' }
  ]
}

export const pictures = {
  frames: [
    { frame: 'block-10.3', source: 'drawn', file: 'files/a.png', sha256: SHA_A, asset: 'asset-1' },
    { frame: 'block-20.2', source: 'owner-photo', file: 'files/b.png', sha256: SHA_B },
    { frame: 'block-20.4', source: 'drawn', file: 'files/c.png', sha256: SHA_C }
  ]
}
export const brief = { assets: [{ id: 'asset-1', sha256: SHA_C }] }

const line = (slot, status, extra = {}) => ({
  key: slot,
  slot,
  owner: 'writer',
  reason: null,
  status,
  readBack: status === 'written' ? 'match' : null,
  ...extra
})
export const report = {
  version: 'site-write-report/1',
  kit: 'invented/kit/1.0.0',
  site: 'studio-bench.example.test',
  status: 'done',
  slots: [
    line('block-10.1', 'written', { ordered: 'Pilates for every body' }),
    line('block-10.2', 'failed', {
      ordered: 'Small classes, warm studio',
      reason: 'SLOT_TOO_LONG: at most 20 characters'
    }),
    line('block-20.1', 'written', { ordered: 'The reformer room', readBack: null }),
    line('block-10.3', 'written', { part: 'picture', owner: 'picture', ordered: path(SHA_A) }),
    line('block-20.2', 'failed', {
      part: 'picture',
      owner: 'picture',
      ordered: path(SHA_B),
      reason: 'SLOT_IMAGE_TOO_SMALL: 491 wide'
    }),
    line('block-20.4', 'skipped', { part: 'picture-painted', owner: 'picture', reason: 'painted later' }),
    line('menuItem-1.0', 'written', { owner: 'plan-label', ordered: 'Home' }),
    line('page-home:title', 'written', { part: 'page-title', ordered: 'Harbour Pilates' }),
    line('header.link-1', 'skipped', { owner: 'plan', reason: 'link targets are not written yet' }),
    line('x.unowned', 'skipped', { owner: null }),
    line('accent', 'written', { part: 'brand-accent', owner: 'brand' })
  ],
  siteCheck: { status: 'red' }
}
