/**
 * A brief build's icons and cut-outs replace pictures the template keeps (Slot fit `replace: "keep"`), and the site takes a
 * kept picture only with the words asking for it (`replace_kept`, Claude Cowork for Joomla). Measured on the local stand
 * (29/10/2026, a brief build on a Joomla T4 template): 24 icons were uploaded and the site refused every one
 * (`SLOT_PICTURE_KEPT`), so every page kept the demo's icons. Fixtures are fictional (a bakery and a dental clinic).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { keptAsks } from '../src/sites/brief-engines/contract-real-pictures.js'
import { writeContract } from '../src/sites/brief-engines/joomla.js'

const keep = { kind: 'icon', replace: 'keep' }
const asked = (label) => `The owner's brief asks for a site of its own: this icon shows "${label}".`

test('the kept pictures a picture write changes go with the words their decor decision carries', () => {
  const shaped = [
    {
      decor: true,
      group: {
        slots: [
          { key: 'module-40.3', asked: asked('Sourdough Bread') },
          { key: 'article-9.5', asked: asked('Sourdough Bread') }
        ]
      }
    },
    { decor: true, group: { slots: [{ key: 'module-41.0', asked: asked('Teeth Whitening') }] } },
    // A photo of the business carries no words: its slot is not a kept one.
    { group: { slots: [{ key: 'module-42.1' }] } }
  ]
  const site = new Map([
    ['module-40.3', { fit: keep }],
    ['article-9.5', { fit: keep }],
    ['module-41.0', { fit: { kind: 'cutout', replace: 'photo' } }],
    ['module-42.1', { fit: { kind: 'photo', replace: 'photo' } }]
  ])
  const changes = {
    'module-40.3': 'images/tracy-content/a.png',
    'module-41.0': 'images/tracy-content/b.png',
    'module-42.1': 'images/tracy-content/c.jpg'
  }
  assert.deepEqual(
    keptAsks(shaped, changes, (key) => site.get(key), { slots: [] }),
    { 'module-40.3': asked('Sourdough Bread') },
    'only a changed slot the site keeps: a figure the template lets go and an unchanged slot need no words'
  )
  // The site's list carries no Slot fit: the content map's says the slot is kept.
  assert.deepEqual(
    keptAsks(shaped, changes, () => null, {
      slots: [{ key: 'module-41.0', fit: { ...keep, kind: 'cutout' } }]
    }),
    { 'module-41.0': asked('Teeth Whitening') }
  )
})

test('a Joomla contract write sends the words of the kept pictures it still writes', async () => {
  const mappings = []
  const applyJoomlaContract = async ({ mapping }) => {
    mappings.push(structuredClone(mapping))
    // The site refuses one picture by name the first time: it goes, and its words with it.
    if (mappings.length === 1)
      throw new Error('Image must already exist in the site media library: module-41.0')
    return { ok: true }
  }
  const refused = await writeContract({
    applyJoomlaContract,
    apply: async () => ({ ok: true }),
    siteKey: 'bakery.test',
    reading: { contract: 'c1', revision: 'r1' },
    changes: { 'module-40.3': 'images/tracy-content/a.png', 'module-41.0': 'images/tracy-content/b.png' },
    evidence: {},
    replaceKept: { 'module-40.3': asked('Sourdough Bread'), 'module-41.0': asked('Teeth Whitening') },
    timed: (job) => job()
  })
  assert.deepEqual(refused, ['module-41.0'])
  assert.deepEqual(Object.keys(mappings[0].replaceKept).sort(), ['module-40.3', 'module-41.0'])
  assert.deepEqual(mappings[1].replaceKept, { 'module-40.3': asked('Sourdough Bread') })
})
