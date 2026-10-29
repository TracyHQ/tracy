import assert from 'node:assert/strict'
import { test } from 'node:test'
import { validateContractWrite } from './_joomla-plugin-validator.mjs'

const slot = { key: 'module-40.0', type: 'text', sample: 'Demo heading', maxCharacters: 100 }

test('the real Joomla validator refuses removing occupied content', () => {
  const errors = validateContractWrite({ slots: [slot], params: { changes: { [slot.key]: '' } } })
  assert.equal(errors[0].code, 'SLOT_EMPTY_STATE')
  assert.equal(errors[0].message, 'Content cannot remove an occupied slot: module-40.0')
})

for (const [name, patch, value, code, message] of [
  [
    'activate an empty slot',
    { sample: '' },
    'Bakery',
    'SLOT_EMPTY_STATE',
    'Content cannot activate an empty slot'
  ],
  [
    'require customer evidence',
    { requiresEvidence: true },
    'New heading',
    'SLOT_EVIDENCE_REQUIRED',
    'Customer evidence required'
  ],
  ['refuse markup', {}, '<b>Bakery</b>', 'SLOT_NOT_CONTENT', 'Markup and control characters are not content'],
  [
    'refuse directives',
    {},
    '{loadmodule 10}',
    'SLOT_NOT_CONTENT',
    'Joomla plugin directives are not content'
  ],
  ['limit Unicode characters', { maxCharacters: 2 }, '🍞🍞🍞', 'SLOT_TOO_LONG', 'Content too long'],
  [
    'hold measured text length',
    { fit: { measured: true, maxCharacters: 3 } },
    'Bakery',
    'SLOT_TOO_LONG',
    'Content too long for its box'
  ],
  [
    'hold measured text lines',
    { fit: { measured: true, lines: { desktop: 1 } } },
    'Bakery\nBread',
    'SLOT_TOO_LONG',
    'Content has more lines than its box holds'
  ],
  [
    'refuse unsafe links',
    { type: 'url', sample: '/home' },
    '//example.test',
    'SLOT_LINK_UNSUPPORTED',
    'Unsupported CTA URL'
  ],
  [
    'require library files',
    { type: 'image', sample: 'images/demo.jpg' },
    'images/missing.jpg',
    'SLOT_IMAGE_INVALID',
    'Image must already exist in the site media library'
  ],
  [
    'protect kept pictures',
    { type: 'image', sample: 'images/icon.png', fit: { replace: 'keep', kind: 'icon' } },
    'images/new.png',
    'SLOT_PICTURE_KEPT',
    'This picture is a icon the template keeps'
  ]
]) {
  test(`the real Joomla validator can ${name}`, () => {
    const [error] = validateContractWrite({
      slots: [{ ...slot, ...patch }],
      params: { changes: { [slot.key]: value } }
    })
    assert.equal(error.code, code)
    assert.ok(error.message.startsWith(message), error.message)
  })
}

test('valid owner text, identity occupancy, explicit evidence and demo text restoration pass', () => {
  for (const [patch, value, params] of [
    [{}, 'Copperleaf Bakery', {}],
    [{ maxCharacters: 1 }, '🍞', {}],
    [{ siteIdentity: true }, '', {}],
    [{ siteIdentity: true, sample: '' }, 'Copperleaf Bakery', {}],
    [
      { requiresEvidence: true },
      'New heading',
      { evidence: { [slot.key]: 'The owner asked for this heading' } }
    ],
    [{ fit: { measured: true, maxCharacters: 1 } }, slot.sample, {}]
  ])
    assert.deepEqual(
      validateContractWrite({
        slots: [{ ...slot, ...patch }],
        params: { ...params, changes: { [slot.key]: value } }
      }),
      []
    )
})

test('missing and ambiguous HTML paths use the plugin refusal, including paths removed earlier in a write', () => {
  for (const [body, changes] of [
    ['<p>Bread</p>', [{ xpath: '/html/body/div/h1', value: 'Bakery' }]],
    ['<p>Bread</p><p>Cake</p>', [{ xpath: '/html/body/div/p', value: 'Bakery' }]],
    [
      '<h1>Bread <span>daily</span></h1>',
      [
        { xpath: '/html/body/div/h1', value: 'Bakery' },
        { xpath: '/html/body/div/h1/span/text()', value: 'Fresh' }
      ]
    ]
  ]) {
    const [error] = validateContractWrite({ slots: [], params: {}, html: [{ body, changes }] })
    assert.equal(error.code, 'CONTRACT_FAILED')
    assert.equal(error.message, 'HTML slot is missing or ambiguous')
  }
})

test('actual media bytes enforce aspect, width, opacity and kept-picture permission', async () => {
  const { default: sharp } = await import('sharp')
  const image = async (width, height, alpha = false) =>
    (
      await sharp({
        create: { width, height, channels: alpha ? 4 : 3, background: alpha ? '#00000000' : '#ffffff' }
      })
        .png()
        .toBuffer()
    ).toString('base64')
  const files = {
    'images/demo.png': await image(20, 10),
    'images/new.png': await image(10, 10),
    'images/clear.png': await image(10, 10, true),
    'images/bad.png': Buffer.from('not a picture').toString('base64')
  }
  const picture = {
    ...slot,
    type: 'image',
    sample: 'images/demo.png#joomlaImage://local-images/demo.png?width=20&height=10'
  }
  const check = (patch = {}, value = 'images/new.png', params = {}) =>
    validateContractWrite({
      slots: [{ ...picture, ...patch }],
      params: { ...params, changes: { [slot.key]: value } },
      files
    })
  assert.equal(check()[0].code, 'SLOT_IMAGE_INVALID', 'legacy demo aspect reads the Joomla suffix correctly')
  assert.equal(check({ fit: { measured: true, aspect: 2 } })[0].code, 'SLOT_IMAGE_INVALID')
  assert.equal(check({ fit: { measured: true, aspect: 1, minWidth: 11 } })[0].code, 'SLOT_IMAGE_TOO_SMALL')
  assert.equal(check({ fit: { measured: true, aspect: 1, transparent: true } })[0].code, 'SLOT_IMAGE_OPAQUE')
  assert.deepEqual(check({ fit: { measured: true, aspect: 1, transparent: true } }, 'images/clear.png'), [])
  assert.equal(check({}, 'images/bad.png')[0].code, 'SLOT_IMAGE_INVALID')
  const fit = { measured: true, aspect: 1, replace: 'keep', kind: 'icon' }
  assert.equal(
    check({ fit }, 'images/new.png', { replace_kept: { [slot.key]: ' ' } })[0].code,
    'SLOT_PICTURE_KEPT'
  )
  assert.deepEqual(
    check({ fit }, 'images/new.png', { replace_kept: { [slot.key]: 'Replace this icon with mine' } }),
    []
  )
  assert.deepEqual(
    check({ fit: { ...fit, aspect: 2 } }, 'images/demo.png'),
    [],
    'restoring the demo bypasses the kept-picture rule'
  )
})
