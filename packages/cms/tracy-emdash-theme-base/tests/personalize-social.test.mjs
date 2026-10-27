// The profiles the owner linked replace the demo's own in the two lists this template keeps (the site's and the contact page's),
// each in the shape its field holds; one the field cannot hold is left out. With none linked, the demo's items stay with their
// links emptied (K6, Akemi 10/10/2026): the buttons are the template's, only another company's addresses go.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { factsFrom, planFrom } from '../tools/personalize.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const seed = JSON.parse(readFileSync(path.join(ROOT, 'seed', 'seed.json'), 'utf8'))
const map = JSON.parse(readFileSync(path.join(ROOT, 'seed', 'personalize.json'), 'utf8'))

test("the owner's profiles take the place of the demo's, one list per field, in its own shape", () => {
  const plan = planFrom(
    map,
    seed,
    factsFrom({
      name: 'Golden Crust',
      social: { instagram: 'https://instagram.com/goldencrust', zalo: 'https://zalo.me/0912345678' }
    })
  )
  assert.deepEqual(plan.patches.get('site/site/en').fields.social, [
    { platform: 'instagram', url: 'https://instagram.com/goldencrust' }
  ])
  assert.deepEqual(plan.patches.get('contact/contact/en').fields.social, [
    { label: 'Instagram', url: 'https://instagram.com/goldencrust' },
    { label: 'Zalo', url: 'https://zalo.me/0912345678' }
  ])
})

test("with no profile linked both lists keep the demo's items, none of them linked (K6)", () => {
  for (const answers of [{ name: 'Golden Crust' }, { name: 'Golden Crust', about: 'A family bakery.' }]) {
    const plan = planFrom(map, seed, factsFrom(answers))
    for (const k of ['site/site/en', 'contact/contact/en']) {
      const [collection] = k.split('/')
      const demo = seed.content[collection].find((e) => (e.locale ?? 'en') === 'en').data.social
      const kept = plan.patches.get(k).fields.social
      assert.equal(kept.length, demo.length, `${k}: every demo item stays`)
      assert.ok(
        kept.every((x) => x.url === ''),
        `${k}: no link leads to the demo's profiles`
      )
      assert.deepEqual(
        kept.map((x) => x.platform ?? x.label),
        demo.map((x) => x.platform ?? x.label),
        `${k}: the networks are the demo's`
      )
    }
  }
})
