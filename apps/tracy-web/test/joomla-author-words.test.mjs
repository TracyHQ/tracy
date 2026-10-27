/**
 * A JA Essence Joomla Apply says the authors' job and bio in the site language on FULL, through the real Apply door, and leaves
 * them as the demo has them on BLANK (LANG-2, TCH #1013; `author-words.js`). Measured 10/10/2026 on dev g60-ess-j-full:
 * "Collaborator & Editor" and the English bio on the author listing and every author block (17 pages). The model translates
 * a batch by giving the English back (disobedient); the step asks each line again, alone.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { essenceModel, essenceSite, runEssence } from './_joomla-essence-site.mjs'

const JOB = 'Collaborator & Editor'
const BIO =
  'It’s remarkable to watch a five-year-old draw, void of any anxiety about what the world will think.'

/** The essence site with two profile fields of one demo author, as plugin 0.24.13 lists them. */
function withAuthors() {
  const site = essenceSite()
  const own = site.apply
  site.apply = async (/** @type {any} */ call) =>
    call.action === 'content.list' && call.params.kind === 'userProfile'
      ? {
          ok: true,
          items: [
            { id: 4200, user_id: 42, name: 'Alfonso Cortez', field: 'aboutme', value: BIO },
            { id: 4201, user_id: 42, name: 'Alfonso Cortez', field: 'user_jobtitle', value: JOB }
          ]
        }
      : own(call)
  return site
}

/** Batches answered in English (kept as they are); a line asked alone is said in Vietnamese. */
const model = () =>
  essenceModel({
    lookup: (/** @type {any} */ input) =>
      !Array.isArray(input) && typeof input?.text === 'string' && typeof input?.limit === 'number'
        ? JSON.stringify({ text: `VI ${input.text}` })
        : null
  })

const authorWrites = (/** @type {any} */ site) =>
  site.records
    .filter((/** @type {any} */ r) => r.kind === 'userProfile')
    .map((/** @type {any} */ r) => [r.id, r.fields.value])

test('FULL vi: the author job and bio are translated and written through the door, the name never', async () => {
  const site = withAuthors()
  const { notes } = await runEssence({ site, model: model() })
  assert.deepEqual(authorWrites(site), [
    [4200, `VI ${BIO}`],
    [4201, `VI ${JOB}`]
  ])
  assert.ok(
    site.records
      .filter((/** @type {any} */ r) => r.kind === 'userProfile')
      .every((/** @type {any} */ r) => String(r.apply_id).startsWith('authors-'))
  )
  assert.ok(
    notes.some((n) => /2 author field\(s\) \(job, bio\) were translated/.test(n)),
    notes.join(' | ')
  )
})

test('BLANK vi: the authors keep the demo’s words (BLANK = demo except the name)', async () => {
  const site = withAuthors()
  await runEssence({ site, model: model(), about: '' })
  assert.deepEqual(authorWrites(site), [])
})
