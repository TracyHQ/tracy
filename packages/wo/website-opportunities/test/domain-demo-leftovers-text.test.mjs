// Spec TracyHQ/tracy#189 (C09 sharpened): the demo's own words in any text slot a label rule never read (a step, a module
// paragraph, a heading), and a demo sentence with only the company name swapped in, are reported; the owner's own words and
// interface words are not. Templates and businesses are made up.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkDemoLeftovers } from '../domain/demo-leftovers.mjs'

const page = (path, body) => ({ path, html: `<html><body>${body}</body></html>` })
const slot = (key, role, sample) => ({ key, entity: key.split('.')[0], type: 'text', role, sample })
const c09 = (pages, contentMap, brief) =>
  checkDemoLeftovers({ pages, contentMap, brief })
    .findings.filter((f) => f.kind === 'C09')
    .map((f) => f.place)

const story =
  'We opened Studio Ironfist in 2008, with a method that celebrates every benefit of kickboxing in a super motivating room, for everyone.'
const fitness = {
  entities: [],
  pages: [],
  slots: [
    slot(
      'module-1.0',
      'step.description',
      '((p))Begin each training session with a dynamic warm-up and rope drills.((/p))'
    ),
    slot('module-2.0', 'editorial.heading', 'Heavy bag workout combinations'),
    slot('module-2.1', 'editorial.paragraph', 'About us'),
    slot('article-3.2', 'offering.description', story)
  ]
}
const swim = {
  business: { name: 'Harbourline Swim School' },
  reading: { about: 'Swimming lessons in Port Arden.' }
}

test('a step, a heading and a renamed demo sentence still on the page are C09', () => {
  const pages = [
    page(
      '/',
      '<p>Begin each training session with a dynamic warm-up and rope drills.</p><h3>Heavy bag workout combinations</h3><a>About us</a>'
    ),
    page('/classes/one', `<p>${story.replace('Studio Ironfist', 'Harbourline Swim School')}</p>`)
  ]
  assert.deepEqual(c09(pages, fitness, swim).sort(), ['article-3.2', 'module-1.0', 'module-2.0'])
})

test('the owner’s words, an interface word and a sample page report no C09', () => {
  const pages = [
    page(
      '/',
      '<p>Warm up in the shallow end with your teacher.</p><h3>Your first lesson</h3><a>About us</a>'
    ),
    page('/classes/one', '<p>Swimming lessons in Port Arden.</p>'),
    page('/pages/typography', '<h3>Heavy bag workout combinations</h3>')
  ]
  assert.deepEqual(c09(pages, fitness, swim), [])
})

test('a bakery template under a dental clinic: the same rule, other words', () => {
  const bakery = {
    entities: [],
    pages: [],
    slots: [slot('module-9.0', 'claim.heading', 'Stone oven sourdough since the old mill days')]
  }
  const clinic = { business: { name: 'Praxis Lindenhof' }, reading: { about: 'Dental care in Talheim.' } }
  assert.deepEqual(
    c09([page('/', '<h2>Stone oven sourdough since the old mill days</h2>')], bakery, clinic),
    ['module-9.0']
  )
  assert.deepEqual(c09([page('/', '<h2>Dental care in Talheim</h2>')], bakery, clinic), [])
})

test('#189 a label naming a page the site serves, or a one-word sample met only in running text, is no C09', () => {
  const studio = {
    entities: [],
    pages: [],
    slots: [
      slot('menuItem-7.0', 'editorial.menu_label', 'Class'),
      slot('menuItem-8.0', 'editorial.menu_label', 'Plans'),
      slot('module-3.0', 'editorial.button_label', 'Light'),
      slot('module-3.1', 'editorial.button_label', 'Sparring')
    ]
  }
  const pages = [
    page(
      '/classes',
      '<a href="/classes">Class</a><a href="/plans">Plans</a><p>Light snacks after every lesson.</p>'
    ),
    page('/plans', '<a href="/contact">Sparring</a>')
  ]
  assert.deepEqual(c09(pages, studio, swim), ['module-3.1'])
  // A bakery's "Light" rye on a page with no such link is not a demo button either; a demo button shown as one is.
  const bakery = {
    entities: [],
    pages: [],
    slots: [slot('module-4.0', 'editorial.button_label', 'Proofing')]
  }
  const loaves = { business: { name: 'Crumb and Crust' }, reading: { about: 'Rye loaves.' } }
  assert.deepEqual(c09([page('/', '<p>Proofing takes a night.</p>')], bakery, loaves), [])
  assert.deepEqual(c09([page('/', '<a href="/">Proofing</a>')], bakery, loaves), ['module-4.0'])
})
