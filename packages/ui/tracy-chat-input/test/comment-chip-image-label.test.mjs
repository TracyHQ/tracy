/**
 * The chip a comment turn shows in a CHAT message names an image the way the Comments tab row and the
 * thread card do (Akemi 01/10/2026, option a; the row since f0511b16b): `Image · "<alt>"`, else
 * `Image · <file name>`. Until now the chat chip still read the alt alone (`"Ship faster"` for the
 * wp-ja-kinetic hero panel, the words of the heading it repeats), so it looked like a heading comment.
 * Any other anchor keeps its words.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildCommentTurn, commentTurnFold, registerCommentFold } from '../src/client/comment-turn.mjs'
import { imageAnchor } from '../src/client/comment-view.mjs'

const HOME = 'https://kinetic.example/'

/** The fork's element for a picked `<img>` (`sendElementOf`): label = its alt (`plainLabel`). */
const img = (alt, src = 'https://kinetic.example/wp-content/uploads/hero-panel.png?ver=2') => ({
  url: HOME,
  selector: 'main > section:nth-of-type(1) img',
  label: alt === '' ? 'image' : alt,
  text: '',
  tag: 'img',
  image: { src, alt },
  marks: []
})
const heading = {
  url: HOME,
  selector: 'main > section:nth-of-type(1) h1',
  label: '"Ship faster"',
  text: 'Ship faster',
  tag: 'h1',
  image: null,
  marks: []
}

/** The chip label the chat draws for a one-comment turn about `element`. */
function chip(element, word) {
  const turn = buildCommentTurn({ text: 'Make it brighter', element, locate: null })
  const at = turn.indexOf('```tracy-element')
  const end = turn.indexOf('```', turn.indexOf('</mentioned-element>')) + 3
  return commentTurnFold(turn.slice(at, end), turn.slice(end), word)?.label
}

test('an image with alt: Image · "<alt>", as the Comments tab row names it', () => {
  assert.equal(chip(img('Ship faster')), 'Image · "Ship faster"')
  assert.equal(imageAnchor(img('Ship faster')), '"Ship faster"')
})

test('an image with no alt: Image · <file name>', () => {
  assert.equal(chip(img('')), 'Image · hero-panel.png')
  assert.equal(imageAnchor(img('')), 'hero-panel.png')
})

test('a long alt is cut like the row', () => {
  const alt = 'A terminal window showing a deploy log scrolling past several green lines'
  assert.equal(chip(img(alt)), `Image · ${imageAnchor(img(alt))}`)
})

test('a heading keeps its words', () => {
  assert.equal(chip(heading), '"Ship faster"')
})

test('the word "Image" follows the language the registration hands it', () => {
  /** @type {any[]} */
  const regs = []
  registerCommentFold({ register: (r) => (regs.push(r), () => {}) }, () => null, { image: () => 'Ảnh' })
  const turn = buildCommentTurn({ text: 'x', element: img('Ship faster'), locate: null })
  const at = turn.indexOf('```tracy-element')
  const end = turn.indexOf('```', turn.indexOf('</mentioned-element>')) + 3
  const element = regs.find((r) => r.fence === 'tracy-element')
  assert.equal(element.fold(turn.slice(at, end), turn.slice(end)).label, 'Ảnh · "Ship faster"')
})
