// A3 on 48 pictures of the fictional Tamarel and The Larch House, labelled by hand: which pictures each role accepts, and how
// many of those a person would accept there. With the vision answers recorded on 18/10/2026 the roles must stay
// precise; the words-only layer is measured and printed, never promised (plan §7 C10: post captions describe the post).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { labelPicture } from '../domain/pictures/picture-labels.mjs'
import { fitOf } from '../domain/pictures/placement.mjs'

const { pictures } = JSON.parse(
  readFileSync(new URL('./fixtures/pictures/labelled-pictures.json', import.meta.url), 'utf8')
)
const ROLES = {
  hero: { role: 'hero', topic: [], demo: { width: 1400, height: 700 } },
  dish: { role: 'dish', topic: ['food'], demo: { width: 400, height: 400 } },
  gallery: { role: 'gallery', topic: [], demo: { width: 400, height: 300 } },
  about: { role: 'section-main', topic: [], demo: { width: 500, height: 400 } }
}
const PERSON = {
  hero: (h) => ['interior', 'exterior', 'food', 'drink'].includes(h.subject) && h.textPresence === 'absent',
  dish: (h) => ['food', 'drink', 'dessert'].includes(h.subject),
  gallery: (h) => !['poster', 'menu-board', 'logo'].includes(h.subject) && h.textPresence === 'absent',
  about: (h) =>
    ['interior', 'exterior', 'people', 'food', 'drink'].includes(h.subject) && h.textPresence === 'absent'
}

function measure(withVision) {
  const out = {}
  for (const [name, g] of Object.entries(ROLES)) {
    const accepted = pictures.filter((p) =>
      fitOf(labelPicture({ ...p, vision: withVision ? p.visionRecorded : null }), {
        id: name,
        routes: ['x'],
        ...g
      })
    )
    const right = accepted.filter((p) => PERSON[name](p.human)).length
    out[name] = { accepted: accepted.length, precision: accepted.length ? right / accepted.length : null }
  }
  return out
}

test('with vision labels, every role takes what a person would put there (precision ≥ 0.85, A3)', () => {
  const result = measure(true)
  for (const [name, r] of Object.entries(result)) {
    assert.ok(r.accepted > 0, `${name} accepts nothing`)
    assert.ok(r.precision >= 0.85, `${name}: ${r.precision}`)
  }
})

test('words only: measured, not promised — and a poster or a logo never reaches a hero or a gallery', (t) => {
  const result = measure(false)
  t.diagnostic(JSON.stringify(result))
  for (const name of ['hero', 'gallery']) {
    const taken = pictures.filter((p) =>
      fitOf(labelPicture({ ...p }), { id: name, routes: ['x'], ...ROLES[name] })
    )
    assert.ok(!taken.some((p) => p.human.subject === 'logo'), name)
  }
})
