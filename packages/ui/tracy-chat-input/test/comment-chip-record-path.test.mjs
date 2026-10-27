// V5S-5 (acceptance v5, send area): the chip for a picked image read `Home › hero.img` — the locate
// level's crumb for the agent (a record name, `›`, a field key), not words a person reads. The fork's
// `plainLabel` now sends plain words (alt → caption → `image`), which match no locate level, so the
// turn picks the innermost level (the field) and its crumb became the head's `name` — and the chip.
// A chip never shows a ` › ` path: it shows the fork's label, else the element's words, else nothing.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildCommentTurn, chipLabel, parseCommentTurn } from '../src/client/comment-turn.mjs'

const LOCATE = {
  status: 'resolved',
  levels: [
    {
      kind: 'field',
      id: 'c12#hero.img',
      contentId: 'c12',
      fieldKey: 'hero.img',
      value: '/wp-content/uploads/2026/09/hero.jpg',
      label: 'Home › hero.img',
      writable: true
    },
    { kind: 'record', id: 'c12', contentId: 'c12', label: 'page "Home"', writable: true }
  ],
  sources: { value: 'exact', mark: 'confirmed' }
}

/** @param {string} label @param {string} alt */
function picked(label, alt) {
  return {
    text: 'Make it brighter',
    element: {
      url: 'https://w.test/',
      selector: 'main section.hero > img',
      label,
      text: '',
      image: { src: 'https://w.test/wp-content/uploads/2026/09/hero.jpg', alt },
      marks: ['post:12:home']
    },
    locate: LOCATE
  }
}

test('an image with an alt: the chip reads the alt the fork sent, never the record path', () => {
  const turn = buildCommentTurn(picked('Team at the site', 'Team at the site'))
  const element = parseCommentTurn(turn)?.element ?? {}
  assert.equal(element.name, 'Home › hero.img', 'the agent still reads the level it was pointed at')
  assert.equal(chipLabel(element), 'Team at the site')
  assert.equal(chipLabel(element, { many: true }), 'Team at the site')
})

test('an image with no alt: the chip reads `image`, never the record path', () => {
  const element = parseCommentTurn(buildCommentTurn(picked('image', '')))?.element ?? {}
  assert.equal(chipLabel(element), 'image')
})

test('a turn written before the fix (no `label` on the head) shows no path either', () => {
  const old =
    'Make it brighter\n\n```tracy-element\n<mentioned-element url="https://w.test/" selector="main section.hero &gt; img" status="resolved" kind="field" name="Home › hero.img">\nimage: hero.jpg · alt "Team at the site"\nlevels:\n- field "Home › hero.img" id=c12#hero.img [picked]\n- record "page "Home"" id=c12\n</mentioned-element>\n```'
  const element = parseCommentTurn(old)?.element
  assert.ok(element, 'the old turn still parses')
  assert.equal(chipLabel(element), '')
  // With words of its own, the old turn's chip quotes them.
  assert.equal(chipLabel({ ...element, text: 'Services' }), '"Services"')
  // A label that is itself a path is not used either.
  assert.equal(chipLabel({ ...element, label: 'Home › hero.img' }), '')
})
