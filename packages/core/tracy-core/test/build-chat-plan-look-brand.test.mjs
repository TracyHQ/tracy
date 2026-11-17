// The plan card's look carries what the card needs to SHOW the business's look (#575, P9 of the brand audit): the
// logo pictures the brand step made for a light and a dark ground, the site icon, and the accent with where it came
// from and the sentence that says so. Read from the draft's `lookSources` (`GET /api/build-draft`) beside the plan; a
// card read without them is the card it was. Data only: the card's drawing is not changed here.
//
//   node --test --test-concurrency=1 packages/core/tracy-core/test/build-chat-plan-look-brand.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { planCardOf } from '../src/build-chat/index.mjs'
import { STAGES, stageDocuments } from './fixtures/build-chat/stages.mjs'

const plan = () => {
  const p = structuredClone(stageDocuments(STAGES.find((s) => s.name === 'plan')).scenario.plan)
  p.assumptions = [
    ...(p.assumptions ?? []).filter((a) => a.field !== 'look.accent'),
    {
      id: 'accent',
      field: 'look.accent',
      said: 'Your green was made lighter, same hue, so buttons stand out.',
      code: 'accent_logo_moved',
      params: { direction: 'lighter' }
    }
  ]
  return p
}
const lookSources = {
  accent: { from: 'logo', name: 'Your logo' },
  logo: { from: 'drawn-from-logo', name: 'Drawn by Tracy from your logo', reason: 'symbol-cut-from-logo' },
  pictures: {
    logoLight: { picture: 'pic-light', mime: 'image/png' },
    logoDark: { picture: 'pic-dark', mime: 'image/png' },
    favicon: { picture: 'pic-icon', mime: 'image/x-icon' }
  }
}

test('without look sources the card look is what it was: no brand part', () => {
  assert.equal(planCardOf(plan()).look.brand, undefined)
})

test('with look sources the look carries the logo on each ground, the icon and the accent with its origin', () => {
  const { brand } = planCardOf(plan(), { lookSources }).look
  assert.deepEqual(brand.logo, {
    light: { picture: 'pic-light', mime: 'image/png' },
    dark: { picture: 'pic-dark', mime: 'image/png' },
    from: 'drawn-from-logo',
    name: 'Drawn by Tracy from your logo'
  })
  assert.deepEqual(brand.favicon, { picture: 'pic-icon', mime: 'image/x-icon' })
  assert.deepEqual(brand.accent, {
    from: 'logo',
    name: 'Your logo',
    said: 'Your green was made lighter, same hue, so buttons stand out.',
    code: 'accent_logo_moved',
    params: { direction: 'lighter' }
  })
})

test('a draft without kept pictures carries no picture, never an invented one', () => {
  const { brand } = planCardOf(plan(), { lookSources: { accent: lookSources.accent } }).look
  assert.deepEqual(brand.logo, { light: null, dark: null, from: null, name: null })
  assert.equal(brand.favicon, null)
  assert.equal(brand.accent.from, 'logo')
})

test('a picture reference that is not a plain id is dropped', () => {
  const odd = {
    pictures: { logoLight: { picture: 'https://elsewhere.example/logo.png' }, favicon: { picture: '' } }
  }
  const { brand } = planCardOf(plan(), { lookSources: odd }).look
  assert.equal(brand.logo.light, null)
  assert.equal(brand.favicon, null)
})
