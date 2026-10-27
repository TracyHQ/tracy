/**
 * The authors' job and bio said in the site's language on FULL (LANG-2, TCH #1013; `author-words.js`). Measured 10/10/2026 on dev
 * g60-ess-wp-full and g60-ess-j-full (JA Essence, a bakery, vi): "Collaborator & Editor" and "It's remarkable to watch a
 * five-year-old draw…" stayed English on the author listing and every author block (17 pages): user meta and user profile
 * fields that no contract slot and no step reached. Calls go through the Apply door's own allowlist (`throughDoor`); the model
 * is disobedient: its batch answers give the English back, drop a line, and the first line-by-line answer repeats the English.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { translateAuthorWords } from '../src/sites/brief-engines/author-words.js'
import { throughDoor } from './_apply-door.mjs'

const BIO =
  'It’s remarkable to watch a five-year-old draw, void of any anxiety about what the world will think. We all start our lives creatively confident.'
const JOB = 'Collaborator & Editor'
const toVi = (/** @type {string} */ text) => `VI ${text}`

/** A model that never answers a batch usably, and answers each line alone with the English once before translating it. */
function disobedient() {
  const asked = []
  const alone = new Map()
  return {
    asked,
    chat: async (/** @type {any} */ { messages }) => {
      const input = JSON.parse(messages[1].content)
      if (Array.isArray(input)) {
        // The batch: the English back, one line short.
        asked.push(...input.map((/** @type {any} */ x) => x.text))
        return JSON.stringify(input.slice(1).map(({ i, text }) => ({ i, text })))
      }
      const seen = alone.get(input.text) ?? 0
      alone.set(input.text, seen + 1)
      return JSON.stringify({ text: seen === 0 ? input.text : toVi(input.text) })
    }
  }
}

/** A WordPress site with two demo authors, their name never in a field the step writes. */
function wordpressSite({ listed = true } = {}) {
  const writes = []
  return {
    writes,
    apply: async (/** @type {any} */ { action, params }) => {
      if (action === 'content.list') {
        if (!listed)
          return {
            ok: false,
            code: 'bad_params',
            message: 'content.list serves kinds "post", "templatePart" and "template"'
          }
        assert.equal(params.kind, 'usermeta')
        return {
          ok: true,
          kind: 'usermeta',
          items: [
            { id: 2, name: 'Alfonso Cortez', meta: { description: BIO, job_title: JOB } },
            { id: 3, name: 'Trevor Patrick', meta: { job_title: JOB } }
          ]
        }
      }
      if (action === 'content.update') {
        writes.push(params)
        return { ok: true }
      }
      return { ok: false, code: 'unexpected', message: action }
    }
  }
}

const run = (/** @type {any} */ site, /** @type {Record<string, unknown>} */ over = {}) => {
  const notes = []
  const model = disobedient()
  return translateAuthorWords({
    platform: 'wordpress',
    apply: throughDoor(site.apply),
    siteKey: 's',
    locale: 'vi',
    source: 'en',
    described: true,
    model,
    note: (/** @type {string} */ n) => notes.push(n),
    ...over
  }).then((out) => ({ out, notes, model }))
}

test('FULL vi WordPress: every author job and bio is translated and written, under one apply id; no name is written', async () => {
  const site = wordpressSite()
  const { out, notes } = await run(site)
  assert.deepEqual(out, { found: 3, written: 3 })
  assert.deepEqual(
    site.writes.map((w) => [w.kind, w.id, w.key, w.fields.value]),
    [
      ['usermeta', 2, 'description', toVi(BIO)],
      ['usermeta', 2, 'job_title', toVi(JOB)],
      ['usermeta', 3, 'job_title', toVi(JOB)]
    ]
  )
  assert.equal(new Set(site.writes.map((w) => w.apply_id)).size, 1)
  assert.match(site.writes[0].apply_id, /^authors-/)
  assert.ok(!JSON.stringify(site.writes).includes('Alfonso'), 'the author name is never written')
  assert.ok(
    notes.some((n) => /3 author field\(s\) \(job, bio\) were translated/.test(n)),
    notes.join(' | ')
  )
})

test('BLANK and a site in the template language write nothing (BLANK = demo except the name)', async () => {
  for (const over of [{ described: false }, { locale: 'en-us' }]) {
    const site = wordpressSite()
    const { out, model } = await run(site, over)
    assert.deepEqual(out, { found: 0, written: 0 })
    assert.equal(site.writes.length, 0)
    assert.equal(model.asked.length, 0)
  }
})

test('an older plugin that cannot list authors is said, and nothing breaks', async () => {
  const site = wordpressSite({ listed: false })
  const { out, notes } = await run(site)
  assert.deepEqual(out, { found: 0, written: 0 })
  assert.ok(
    notes.some((n) => /cannot list them \(bad_params/.test(n)),
    notes.join(' | ')
  )
})

test('Joomla: the profile fields are written by their packed id, through the same door', async () => {
  const writes = []
  const apply = throughDoor(async (/** @type {any} */ { action, params }) => {
    if (action === 'content.list') {
      assert.equal(params.kind, 'userProfile')
      return {
        ok: true,
        items: [
          { id: 4201, user_id: 42, name: 'Alfonso Cortez', field: 'user_jobtitle', value: JOB },
          { id: 4200, user_id: 42, name: 'Alfonso Cortez', field: 'aboutme', value: BIO }
        ]
      }
    }
    writes.push(params)
    return { ok: true }
  })
  const out = await translateAuthorWords({
    platform: 'joomla',
    apply,
    siteKey: 's',
    locale: 'vi-VN',
    source: 'en-GB',
    described: true,
    model: disobedient(),
    note: () => {}
  })
  assert.deepEqual(out, { found: 2, written: 2 })
  assert.deepEqual(
    writes.map((w) => [w.kind, w.id, w.fields.value]),
    [
      ['userProfile', 4201, toVi(JOB)],
      ['userProfile', 4200, toVi(BIO)]
    ]
  )
})
