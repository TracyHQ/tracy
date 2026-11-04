// save_brand_file gate: one focused failing case per rule of the header, the name slots and the owner tasks
// Each case breaks exactly one thing in a passing invented case and expects the field named.
import { test } from 'node:test'
import { assertNames, expectRejected, slotKey } from './_brand-gate-rules.mjs'

const ROWS = [
  [
    'version must stay 10',
    '1-padel',
    ({ brand }) => {
      brand.version = 9
    },
    'version'
  ],
  [
    'kind must be brand-file',
    '1-padel',
    ({ brand }) => {
      brand.kind = 'plan'
    },
    'kind'
  ],
  [
    'kit id must be the kit being used',
    '1-padel',
    ({ brand }) => {
      brand.kit = 'other@1.0.0'
    },
    'kit'
  ],
  [
    'name must be exactly the brief name',
    '1-padel',
    ({ brand }) => {
      brand.name.value = 'Palm Terrace'
    },
    'name.value'
  ],
  [
    'name slot value is recomputed',
    '1-padel',
    ({ brand }) => {
      slotKey(brand, 'cms').value = 'Something Else'
    },
    'name.slots["setting:global configuration sitename"].value'
  ],
  [
    'every kit name slot must be listed',
    '1-padel',
    ({ brand }) => {
      brand.name.slots.pop()
    },
    'name.slots',
    /exactly once/
  ],
  [
    'a slot the kit does not have is refused',
    '1-padel',
    ({ brand }) => {
      brand.name.slots.push({ ...brand.name.slots[0], id: 'slot:not-in-kit' })
    },
    'name.slots',
    /not in the kit/
  ],
  [
    'a hand-off needs a reason',
    '1-padel',
    ({ brand }) => {
      delete slotKey(brand, 'document-title').reason
    },
    'name.slots["printed:document-title:page"].reason'
  ],
  [
    'a held-back name needs confirm-name',
    '3-no-logo',
    ({ brief }) => {
      brief.missing = [{ field: 'brand.name', why: 'two sources disagree' }]
    },
    'ownerTasks',
    /confirm-name/
  ],
  [
    'confirm-name only when the name is held back',
    '1-padel',
    ({ brand }) => {
      brand.ownerTasks.push({ kind: 'confirm-name', say: 'Please confirm the name.' })
    },
    'ownerTasks',
    /only when/
  ],
  [
    'a cut mark needs approve-rebuilt-logo',
    '1-padel',
    ({ brand }) => {
      brand.ownerTasks = []
    },
    'ownerTasks',
    /approve-rebuilt-logo/
  ],
  [
    'an icon in the accent needs replace-temporary-logo',
    '3-no-logo',
    ({ brand }) => {
      brand.ownerTasks = []
    },
    'ownerTasks',
    /replace-temporary-logo/
  ],
  [
    'an owner task has a plain sentence',
    '1-padel',
    ({ brand }) => {
      delete brand.ownerTasks[0].say
    },
    'ownerTasks[0].say'
  ]
]

for (const [title, id, mutate, field, why] of ROWS) {
  test(`gate: ${title}`, async () => {
    assertNames(await expectRejected(id, mutate), field, why)
  })
}
