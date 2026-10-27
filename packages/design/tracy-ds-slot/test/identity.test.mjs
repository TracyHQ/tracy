/** IDENT-1 and MODE-1 verdicts from what the identity probe returns (#1314). */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { identityProbe, identityVerdict, modeMatch, pageModeOf, toggleProbe } from '../src/identity.mjs'

const mark = (over = {}) => ({
  tag: 'img',
  width: 160,
  height: 40,
  content: 'picture:logo.svg',
  color: null,
  ground: [255, 255, 255],
  ...over
})

test('IDENT-1: a mark that keeps its box and holds something passes; an empty or vanished one fails', () => {
  assert.equal(identityVerdict(mark(), mark()), true)
  // Tracy Business WordPress 1.1.8 under a system: the logo slot rendered with no picture
  assert.equal(identityVerdict(mark({ content: '' }), mark()), false)
  assert.equal(identityVerdict(null, mark()), false)
  // shrunk to a sliver
  assert.equal(identityVerdict(mark({ height: 2 }), mark()), false)
  // a swapped picture (the dark logo for the dark side) of about the same size is still the mark
  assert.equal(identityVerdict(mark({ content: 'picture:logo-dark.svg', width: 150 }), mark()), true)
  // a template with no mark on its default page has nothing to keep
  assert.equal(identityVerdict(mark(), null), null)
})

test('IDENT-1: a text mark must read on its ground', () => {
  const words = mark({ tag: 'span', content: 'text:Tracy', color: [20, 20, 20], ground: [255, 255, 255] })
  assert.equal(identityVerdict(words, words), true)
  // Tracy Business EmDash's brand mark under Moxie before #1309: cream on cream
  assert.equal(identityVerdict({ ...words, color: [244, 239, 212], ground: [250, 245, 220] }, words), false)
})

test('IDENT-1: a wordmark set in a wider face is still the mark; one shrunk away is not', () => {
  // JA Social II 1.0.5: "JA Social II" 110 x 25 in Montserrat, 151 x 27 in MotherDuck's mono face
  const words = {
    tag: 'span',
    width: 110,
    height: 25,
    content: 'text:JA Social II',
    color: [255, 255, 255],
    ground: [1, 87, 155],
    onPicture: false
  }
  assert.equal(
    identityVerdict(
      { ...words, width: 151, height: 27, color: [56, 56, 56], ground: [111, 194, 255] },
      words
    ),
    true
  )
  assert.equal(identityVerdict({ ...words, width: 60 }, words), false)
  // a picture mark keeps the old two-way tolerance
  assert.equal(identityVerdict(mark({ width: 300 }), mark()), false)
})

test('MODE-1: the page is the side of light the system is', () => {
  assert.equal(pageModeOf('rgb(0, 0, 0)'), 'dark')
  assert.equal(pageModeOf('rgb(255, 255, 255)'), 'light')
  assert.equal(pageModeOf('#f4efd4'), 'light')
  assert.equal(pageModeOf('rgba(0, 0, 0, 0)'), null, 'a transparent body says nothing')
  // Tracy Business EmDash's cream page under Moxie (dark) before #1309
  assert.equal(modeMatch('rgb(245, 243, 238)', true), false)
  assert.equal(modeMatch('rgb(0, 0, 0)', true), true)
  assert.equal(modeMatch('rgb(255, 255, 255)', false), true)
  assert.equal(modeMatch('rgba(0, 0, 0, 0)', true), null)
})

test('the probes are page scripts that name the contract selector, or the defaults', () => {
  assert.match(identityProbe(undefined), /"header a img"/)
  assert.match(identityProbe('.navbar-brand img'), /\["\.navbar-brand img"\]/)
  assert.equal(toggleProbe(undefined), 'null')
  assert.match(toggleProbe('.ng-theme-toggle'), /querySelectorAll\(".ng-theme-toggle"\)/)
})

// Probe readings recorded on the iMac (measure-1317 and measure-modes, 13/10/2026), the five Joomla rows
// IDENT-1 failed on while their logo was plainly on screen (#1307)
test('IDENT-1: a text mark on a picture (no colour under it) is not judged by the page ground', () => {
  // JA Space and JA Social II: the white logo sits on the hero photo; the probe now says `onPicture`
  const space = mark({
    tag: 'span',
    content: 'text:space.',
    width: 67,
    height: 27,
    color: [255, 255, 255],
    ground: null,
    onPicture: true
  })
  assert.equal(identityVerdict({ ...space, width: 59, height: 26 }, space), true)
  // a system that lays a colour under it is judged on that colour at 3:1 (no template ratio to keep)
  assert.equal(identityVerdict({ ...space, ground: [250, 250, 250], onPicture: false }, space), false)
})

test('IDENT-1: a text mark no less readable than the template draws it passes', () => {
  // JA Resume: white "CV" on its own coral pill (2.9:1 in the template itself), untouched by every system
  const cv = mark({
    tag: 'span',
    content: 'text:CV',
    width: 27,
    height: 20,
    color: [255, 255, 255],
    ground: [252, 97, 93]
  })
  assert.equal(identityVerdict({ ...cv, width: 28 }, cv), true)
  // ... but one a system made less readable than that still fails
  assert.equal(identityVerdict({ ...cv, ground: [255, 200, 200] }, cv), false)
  // and a template that draws its words unreadably sets no bar: under 2:1 fails whatever the default did
  const faint = { ...cv, color: [252, 97, 93] }
  assert.equal(identityVerdict(faint, faint), false)
})

test('IDENT-1: a badge mark is read on its own fill', () => {
  // Tracy Business J6: white "NG" on the badge's own forest fill; the probe reads the fill as the ground
  const ng = mark({
    tag: 'span',
    content: 'text:NG',
    width: 40,
    height: 40,
    color: [255, 255, 255],
    ground: [31, 61, 46]
  })
  assert.equal(identityVerdict({ ...ng, color: [0, 0, 0], ground: [30, 215, 96] }, ng), true)
})

test('the identity probe reads the ground from what is painted under the mark, the mark itself first', () => {
  const p = identityProbe(undefined)
  assert.match(p, /elementsFromPoint/)
  assert.match(p, /onPicture/)
  // the page script parses (a regular expression in the template string once lost its escapes)
  assert.doesNotThrow(() => new Function(`return ${p}`))
  // a site name inside the brand box is found before any span in a header link (JA Essence's social icons)
  const sel = JSON.parse(/const SEL = (\[.*?\])\n/.exec(p)[1])
  assert.ok(sel.indexOf('.navbar-brand .site-name') < sel.indexOf('header a > span'))
})
