/**
 * Vision labelling v2 (#48): the prompt carries the brief's offerings and team as a closed list, and the answer is held to
 * it. A stubbed model that names an item outside the list, or a free-text name, leaves the photo general. Boxes replace
 * the focus word, which is still derived for the readers that take it. Fixtures are fictional.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'

import { held, labelWithVision, pictureLabelSystem, visionKey } from '../src/lib/picture-vision.js'
import { closedListDigest } from 'website-opportunities/domain/pictures/picture-links.mjs'

const challengeFor = async () => ({ expectedCode: 'ABC12345', image: 'data:image/png;base64,eA==' })
const jpeg = () =>
  sharp({ create: { width: 900, height: 600, channels: 3, background: '#336699' } })
    .jpeg()
    .toBuffer()
const LIST = {
  offerings: [
    { id: 'se_tennis', label: 'Tennis class' },
    { id: 'se_padel', label: 'Padel class' }
  ],
  people: [{ id: 'te_mara', label: 'Mara Okonkwo' }]
}

test('the prompt lists the brief offerings and people by id and asks for boxes, not a focus word', () => {
  const prompt = pictureLabelSystem('fitness', LIST)
  for (const item of [...LIST.offerings, ...LIST.people]) {
    assert.ok(prompt.includes(item.id), item.id)
    assert.ok(prompt.includes(item.label), item.label)
  }
  for (const field of [
    'depicts',
    'portraitOf',
    'subjectBox',
    'faceBoxes',
    'peopleCount',
    'isGraphic',
    'isOwnPhoto',
    'role'
  ])
    assert.match(prompt, new RegExp(field))
  assert.match(prompt, /general/)
  assert.doesNotMatch(prompt, /"focus"/)
  // Without a list the model is told there is none, so every photo is general.
  assert.match(pictureLabelSystem('fitness'), /no offerings or people/i)
})

test('a stubbed model can only return offerings and people of the closed list; anything else is general', async () => {
  let sent = ''
  const fetchImpl = async (_url, init) => {
    sent = JSON.parse(init.body).messages[0].content[0].text
    const pictures = [
      {
        id: 'padel',
        subject: 'service-in-action',
        content: 'people-in-action',
        depicts: 'se_padel',
        depictsEvidence: 'a padel court with glass walls',
        portraitOf: 'te_mara',
        role: 'offering.image',
        subjectBox: [0.1, 0.1, 0.4, 0.8],
        faceBoxes: [[0.2, 0.15, 0.08, 0.1]],
        peopleCount: 2,
        isGraphic: false,
        isOwnPhoto: true
      },
      // A free-text offering and a person the list does not hold.
      {
        id: 'squash',
        subject: 'service-in-action',
        depicts: 'Squash lessons',
        portraitOf: 'Ana Visitor',
        role: 'person.image'
      },
      {
        id: 'flyer',
        subject: 'poster',
        content: 'text-graphic',
        isGraphic: true,
        role: 'business.hero_image'
      }
    ]
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ pictures, imageCode: 'ABC12345' }) } }]
      })
    )
  }
  const pictures = await Promise.all(
    ['padel', 'squash', 'flyer'].map(async (id) => ({ id, bytes: await jpeg() }))
  )
  const { labels } = await labelWithVision({
    challengeFor,
    door: { url: 'https://v.test/chat', key: 'k', model: 'm' },
    pictures,
    closedList: LIST,
    fetchImpl
  })
  assert.ok(sent.includes('se_padel'))
  const padel = labels.get('padel')
  assert.equal(padel.depicts, 'se_padel')
  assert.equal(padel.portraitOf, 'te_mara')
  assert.equal(padel.role, 'offering.image')
  assert.deepEqual(padel.subjectBox, [0.1, 0.1, 0.4, 0.8])
  assert.deepEqual(padel.faceBoxes, [[0.2, 0.15, 0.08, 0.1]])
  assert.equal(padel.peopleCount, 2)
  // The old readers still get a focus word, from the box.
  assert.equal(padel.focus, 'left')
  assert.equal(padel.closedList, closedListDigest(LIST))
  const squash = labels.get('squash')
  assert.equal(squash.depicts, 'general')
  assert.equal(squash.portraitOf, undefined)
  assert.equal(squash.role, 'business.gallery_image')
  const flyer = labels.get('flyer')
  assert.equal(flyer.isGraphic, true)
  assert.equal(flyer.role, null)
})

test('a label held without a list links nothing and carries no list digest', () => {
  const one = held({ id: 'a', subject: 'food', depicts: 'se_tennis', subjectBox: [0.4, 0.4, 0.2, 0.2] })
  assert.equal(one.labels.depicts, 'general')
  assert.equal(one.labels.focus, 'center')
  assert.equal('closedList' in one.labels, false)
})

test('the cache key moves with the new prompt and schema', () => {
  assert.equal(visionKey({ model: 'deepseek-chat' }), 'deepseek-chat|p5|s2|512q70')
})
