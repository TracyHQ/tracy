// What the host's `photos-match-slots` and `faces-named` checks (#140) are told: the brief's offerings and people, what
// each brief photo shows, and the slot each placed file was imported for, read from the build's import receipts and
// plan rows. The club, its classes, its coach and every file are made up.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { slotPhotoEvidence } from '../src/opportunities-build/slot-photo-evidence.js'

const revision = {
  brief: {
    brand: { logo: 'asset-logo' },
    reading: {
      services: [
        { id: 'svc-tennis', label: 'Tennis' },
        { id: 'svc-padel', label: 'Padel' }
      ],
      team: [
        { id: 'person-wren', label: 'Wren Example' },
        { id: 'person-reviewer', label: 'Ash Reviewer', reviewsOnly: true }
      ]
    },
    assets: [
      {
        id: 'asset-padel',
        depicts: { id: 'svc-padel', evidence: { via: 'alt' } },
        portraitOf: null,
        faceBoxes: [],
        isOwnPhoto: true
      },
      {
        id: 'asset-stranger',
        depicts: { id: 'general', evidence: { via: 'vision' } },
        portraitOf: null,
        faceBoxes: [
          [0.4, 0.1, 0.2, 0.2],
          [0.1, 0.1, 0.2, 0.2]
        ],
        isOwnPhoto: false
      },
      // A portrait linked by its words, with no offering link recorded.
      {
        id: 'asset-wren',
        portraitOf: { id: 'person-wren', evidence: { via: 'alt' } },
        faceBoxes: [[0.3, 0.1, 0.3, 0.3]]
      },
      // Nothing looked at it: no label, so the host treats it as unsure.
      { id: 'asset-unlooked', depicts: { id: 'general', evidence: { via: 'none' } }, portraitOf: null },
      { id: 'asset-logo', depicts: { id: 'general', evidence: { via: 'none' } }, portraitOf: null }
    ]
  }
}

const slot = (key, role, kind) => ({
  key,
  type: 'image',
  current: `images/demo/${key}.jpg`,
  role,
  group: { id: key.replace(/\.image$/, ''), item: 0, kind }
})
const build = {
  content: {
    agentDemo: {
      structure: {
        contract: {
          slots: [
            slot('classes.item.1.image', 'offering.image', 'service'),
            slot('team.item.1.image', 'person.image', 'person')
          ]
        }
      },
      plan: {
        rows: [
          {
            page: '/classes',
            operation: 'replace-image',
            assetIds: ['asset-padel'],
            target: { kind: 'contract', slot: 'classes.item.1.image' }
          },
          {
            page: '/team',
            operation: 'replace-image',
            assetIds: ['asset-stranger'],
            target: { kind: 'contract', slot: 'team.item.1.image' }
          },
          { page: '/', operation: 'replace-image', assetIds: ['asset-unlooked'], target: { kind: 'native' } }
        ]
      },
      imports: {
        a: { state: 'written', assetId: 'asset-padel', path: '/images/tracy-content/aa.jpg', planRow: 0 },
        b: { state: 'written', assetId: 'asset-stranger', path: 'images/tracy-content/bb.jpg', planRow: 1 },
        c: { state: 'written', assetId: 'asset-unlooked', path: 'images/tracy-content/cc.jpg', planRow: 2 },
        d: { state: 'written', assetId: 'asset-logo', path: 'images/tracy-brand/logo.png', planRow: null },
        e: { state: 'unknown', assetId: 'asset-padel', path: 'images/tracy-content/ee.jpg', planRow: 0 }
      }
    }
  }
}

test('each written import names its photo and the contract slot its plan row aimed at', () => {
  const { placedSlots } = slotPhotoEvidence(revision, build)
  assert.deepEqual(placedSlots, {
    'images/tracy-content/aa.jpg': {
      photo: 'asset-padel',
      slot: 'classes.item.1.image',
      role: 'offering.image',
      group: 'service'
    },
    'images/tracy-content/bb.jpg': {
      photo: 'asset-stranger',
      slot: 'team.item.1.image',
      role: 'person.image',
      group: 'person'
    },
    'images/tracy-content/cc.jpg': { photo: 'asset-unlooked' }
  })
})

test("the brief's labelled photos and its closed list travel; a portrait alone travels too; an unlooked photo and a reviewer do not", () => {
  const { photoLinks, briefItems } = slotPhotoEvidence(revision, build)
  assert.deepEqual(photoLinks, {
    'asset-padel': { depicts: 'svc-padel', portraitOf: null, faces: 0, ownPhoto: true },
    'asset-stranger': { depicts: 'general', portraitOf: null, faces: 2, ownPhoto: false },
    'asset-wren': { depicts: null, portraitOf: 'person-wren', faces: 1, ownPhoto: null }
  })
  assert.deepEqual(briefItems, {
    offerings: [
      { id: 'svc-tennis', label: 'Tennis' },
      { id: 'svc-padel', label: 'Padel' }
    ],
    people: [{ id: 'person-wren', label: 'Wren Example' }]
  })
})

test('a build with no imports and a brief with no reading send nothing to judge', () => {
  assert.deepEqual(slotPhotoEvidence({ brief: {} }, { content: {} }), {
    placedSlots: {},
    photoLinks: {},
    briefItems: { offerings: [], people: [] }
  })
})

test('a failed round tells the agent how to repair each, with the page, slot and photo of every finding', async () => {
  const { repairPrompt } = await import('../src/opportunities-build/demo-qa.js')
  const text = repairPrompt({
    round: 1,
    failed: [
      {
        id: 'photos-match-slots',
        expected: 'a photo in an offering slot shows that offering',
        detail: [{ page: '/classes', slot: 'classes.item.1.image', photo: 'asset-padel' }]
      },
      {
        id: 'faces-named',
        expected: 'every face shown belongs to a person the brief names',
        detail: [{ page: '/team', slot: 'team.item.1.image', photo: 'asset-stranger' }]
      }
    ]
  })
  assert.match(text, /card's own offering/)
  assert.match(text, /Put that person's portrait in the frame/)
  assert.match(text, /page: \/classes; slot: classes\.item\.1\.image; photo: asset-padel/)
  assert.match(text, /page: \/team; slot: team\.item\.1\.image; photo: asset-stranger/)
})
