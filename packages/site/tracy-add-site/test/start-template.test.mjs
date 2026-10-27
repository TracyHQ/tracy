#!/usr/bin/env node
/**
 * The template a new site starts from: which card, whether to name it, which picture to show.
 * Shape measured 21/09 on https://cowork.tracy.site/api/templates.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  appliesTo,
  buildsOn,
  designFor,
  previewOf,
  START_TEMPLATE,
  startTemplateFrom
} from '../src/client/start-template.mjs'

const card = {
  id: 'tracy-business',
  label: 'Tracy Business',
  card: {
    image: 'https://x/api/templates/tracy-business/shots/tracy-business-home-390.png?v=1',
    layouts: [
      { key: 'careers', shots: { desktop: 'https://x/careers-1440.png' } },
      { key: 'home', shots: { mobile: 'https://x/home-390.png', desktop: 'https://x/home-1440.png' } }
    ]
  },
  platforms: [
    { platform: 'wordpress', tag: 'tracy-business/wp7' },
    { platform: 'joomla', tag: 'tracy-business/j6' }
  ]
}

test('the start template is tracy-business', () => {
  assert.equal(START_TEMPLATE, 'tracy-business')
})

test('startTemplateFrom picks the card by id, and answers null for anything else', () => {
  assert.equal(startTemplateFrom({ templates: [{ id: 'ja-trip' }, card] }), card)
  assert.equal(startTemplateFrom({ templates: [{ id: 'ja-trip' }] }), null)
  assert.equal(startTemplateFrom({}), null)
  assert.equal(startTemplateFrom(null), null)
  assert.equal(startTemplateFrom({ templates: 'nope' }), null)
})

test('startTemplateFrom takes the template the customer chose, not the default', () => {
  // The gallery is a step inside this wizard now (24/09/2026), and `?design=` is how the pick
  // arrives. A press on Tracy SaaS that quietly built Tracy Business would be the whole change
  // failing silently — the customer chose a look and would be handed another one.
  const saas = { id: 'tracy-saas', platforms: [{ platform: 'emdash' }] }
  assert.equal(startTemplateFrom({ templates: [card, saas] }, 'tracy-saas'), saas)
  assert.equal(startTemplateFrom({ templates: [card, saas] }, 'tracy-business'), card)
})

test('a chosen template that is not in the catalogue answers null, never the default', () => {
  // Falling back to `tracy-business` here would BUILD THE WRONG LOOK without a word. Answering
  // null leaves the wizard with no card, so it creates the site the way it did before templates
  // were named — the outcome a customer can at least see.
  assert.equal(startTemplateFrom({ templates: [card] }, 'ja-voyara'), null)
})

test('no choice at all still starts from the default', () => {
  // Every Add site press that did not come through the gallery — the tab opened from the `+`
  // menu, a reload that lost the address — must keep working exactly as before.
  assert.equal(startTemplateFrom({ templates: [card] }), card)
  assert.equal(startTemplateFrom({ templates: [card] }, ''), card)
  assert.equal(startTemplateFrom({ templates: [card] }, undefined), card)
})

test('designFor names the template only for a platform the card builds', () => {
  assert.equal(designFor(card, 'joomla'), 'tracy-business')
  assert.equal(designFor(card, 'wordpress'), 'tracy-business')
  assert.equal(designFor(card, 'emdash'), undefined)
  assert.equal(designFor(null, 'joomla'), undefined)
})

test('buildsOn filters the platform gallery with the same build rule as the create payload', () => {
  assert.equal(buildsOn(card, 'joomla'), true)
  assert.equal(buildsOn(card, 'wordpress'), true)
  assert.equal(buildsOn(card, 'emdash'), false)
  assert.equal(buildsOn(null, 'joomla'), false)
  assert.equal(buildsOn({ id: 'invalid', platforms: 'joomla' }, 'joomla'), false)
  assert.equal(buildsOn({ id: 'invalid', platforms: [{ platform: 'joomla-6' }] }, 'joomla'), false)
})

test('previewOf prefers the home desktop shot, falls back to card.image, refuses a bare file name', () => {
  assert.deepEqual(previewOf(card), {
    name: 'Tracy Business',
    image: 'https://x/home-1440.png',
    design: null
  })
  const noLayouts = { ...card, card: { image: card.card.image } }
  assert.equal(previewOf(noLayouts).image, card.card.image)
  assert.equal(previewOf(null), null)
})

test('previewOf still names a card whose pictures the page cannot load', () => {
  // The local stand's `ja_kinetic (local)` card carries bare file names for its shots. The form
  // used to show nothing at all for it, so the customer could not see which template Create site
  // would use (26/09). The name is shown; only the picture is left out.
  const bare = {
    ...card,
    id: 'local-ja-kinetic',
    label: 'ja_kinetic (local)',
    card: {
      image: 'ja-kinetic-home-1440.png',
      layouts: [{ key: 'home', shots: { desktop: 'ja-kinetic-home-1440.png' } }]
    }
  }
  assert.deepEqual(previewOf(bare), { name: 'ja_kinetic (local)', image: null, design: null })
  assert.deepEqual(previewOf({ id: 'ja-vega' }), { name: 'ja-vega', image: null, design: null })
})

test('previewOf names the design system the card wears, so the form can say which look the site gets', () => {
  const wearing = { ...card, design: { id: 'apple', source: 'catalog' } }
  assert.deepEqual(previewOf(wearing).design, { id: 'apple', source: 'catalog' })
  // A card that says nothing about its design is null here — never a guess from its name or picture.
  assert.equal(previewOf({ ...card, design: undefined }).design, null)
})

test('appliesTo: the popup is offered unless the server says Apply cannot write this build', () => {
  const sealed = {
    platforms: [
      { platform: 'joomla', apply: true },
      { platform: 'wordpress', apply: false }
    ]
  }
  assert.equal(appliesTo(sealed, 'joomla'), true)
  assert.equal(appliesTo(sealed, 'wordpress'), false, 'a build no content contract seals keeps its own words')
  // A card that says nothing (an older server, a card not read yet, a platform the card lacks) never withholds the popup.
  assert.equal(appliesTo(card, 'joomla'), true)
  assert.equal(appliesTo(null, 'joomla'), true)
  assert.equal(appliesTo(sealed, 'emdash'), true)
  assert.equal(appliesTo({ platforms: 'nope' }, 'joomla'), true)
})
