// The measures read on both sides of the light and dark switch, on invented reads: words on a band, words on a picture, logos.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runSiteCheck } from '../src/site-check/site-check.js'
import { checkLines } from '../src/site-check/check-lines.js'
import {
  bandContrastGroup,
  judgeBandContrast,
  judgeLogos,
  judgeWordsOverPicture,
  logoReadableGroup,
  wordsOverPictureGroup
} from '../src/site-check/theme-reads.js'
import { contrast } from '../src/site-check/look-reads.js'
import { fakeHost, pagedSite, pageRead, writtenReport } from './_site-check-pages.mjs'

const BAND = [31, 30, 30]
const RED = [244, 65, 65, 1]
const GREEN = [14, 127, 72, 1]
/** An accent darker still: 2.89:1 on the band, under the brand accent bar of 3:1. */
const DIM = [13, 117, 68, 1]
const WHITE = [255, 255, 255, 1]
const entry = (side, read, over = {}) => ({
  path: '/',
  width: 1440,
  look: { sides: { [side]: read } },
  ...over
})
const words = (w) => ({
  fg: GREEN,
  fgOff: RED,
  bg: BAND,
  bgOff: BAND,
  large: false,
  selector: 'a.lead',
  text: 'Call us',
  ...w
})

test('accent words the brand made unreadable on a band are red and name the brand', () => {
  assert.equal(contrast(DIM, BAND).toFixed(2), '2.89')
  const [f, ...rest] = judgeBandContrast([entry('light', { words: [words({ fg: DIM })] })])
  assert.equal(rest.length, 0)
  assert.equal(f.level, undefined, 'a block by default')
  assert.match(f.measured, /reads 2\.89:1, 4\.5:1 before the brand style/)
  assert.match(f.reason, /under 3:1 in the light theme/)
})

test('accent words the brand coloured pass from 3:1, under the 4.5:1 the template words keep', () => {
  assert.equal(contrast(GREEN, BAND).toFixed(2), '3.28')
  assert.deepEqual(judgeBandContrast([entry('light', { words: [words()] })]), [])
  const [own] = judgeBandContrast([entry('dark', { words: [words({ fg: GREEN, fgOff: GREEN })] })])
  assert.deepEqual(
    [own.level, own.causingStep],
    ['warn', 0],
    'the same colour as the template own still warns at 4.5:1'
  )
})

test('the same accent on a ground it reads on, and large words at 3:1, are green', () => {
  assert.deepEqual(
    judgeBandContrast([entry('light', { words: [words({ bg: [255, 255, 255], bgOff: [255, 255, 255] })] })]),
    []
  )
  assert.deepEqual(judgeBandContrast([entry('light', { words: [words({ large: true })] })]), [])
})

test('a colour the brand did not make worse is the template fault, a warning said once per page and side', () => {
  const muted = [108, 117, 125, 1]
  const f = judgeBandContrast([
    entry('dark', {
      words: [
        words({ fg: muted, fgOff: muted }),
        words({ fg: muted, fgOff: muted, bg: [24, 23, 23], bgOff: [24, 23, 23] })
      ]
    })
  ])
  assert.equal(f.length, 1)
  assert.deepEqual([f[0].level, f[0].causingStep], ['warn', 0])
})

test('the same footer words on every page are said once', () => {
  const f = judgeBandContrast([
    entry('light', { words: [words({ fg: DIM })] }),
    entry('light', { words: [words({ fg: DIM })] }, { path: '/about' })
  ])
  assert.equal(f.length, 1)
})

const GREY = [139, 139, 139]
const over = (w) => ({
  fg: GREY,
  fgOff: GREY,
  key: 'k',
  large: false,
  selector: 'p',
  text: 'Lessons every day',
  underSrc: 'http://site.test/images/tracy-content/hero.jpg',
  under: { p15: 0.2, p50: 0.25, p85: 0.28 },
  ...w
})

test('grey words on a placed picture read under the bar: red, and the picture step answers', () => {
  const { failures } = judgeWordsOverPicture([entry('dark', { over: [over()] })], {})
  assert.equal(failures.length, 1)
  assert.equal(failures[0].level, undefined)
  assert.equal(failures[0].causingStep, undefined, "the group's own step, pictures")
  assert.match(failures[0].reason, /picture makes these words/)
})

test('the same words on a dark enough region are green, and large words pass at 3:1', () => {
  const dark = { p15: 0.002, p50: 0.005, p85: 0.01 }
  assert.deepEqual(judgeWordsOverPicture([entry('dark', { over: [over({ under: dark })] })], {}).failures, [])
  const middling = { p15: 0.1, p50: 0.12, p85: 0.05 }
  assert.deepEqual(
    judgeWordsOverPicture([entry('dark', { over: [over({ under: middling, large: true })] })], {}).failures,
    []
  )
})

test('a brand colour failing where the template colour passes names the brand, whatever the picture', () => {
  const { failures } = judgeWordsOverPicture(
    [
      entry('dark', {
        over: [
          over({ fg: [14, 127, 72], fgOff: [255, 255, 255], under: { p15: 0.01, p50: 0.02, p85: 0.03 } })
        ]
      })
    ],
    {}
  )
  assert.equal(failures[0].causingStep, 2)
})

test('words that read as badly on the untouched site, or on its own picture, are the template fault and warn', () => {
  const untouched = [
    { page: '/', width: 1440, side: 'dark', key: 'k', fg: GREY, under: { p15: 0.2, p50: 0.25, p85: 0.28 } }
  ]
  const same = judgeWordsOverPicture([entry('dark', { over: [over()] })], { baseline: { over: untouched } })
    .failures[0]
  assert.deepEqual([same.level, same.causingStep], ['warn', 0])
  const stored = judgeWordsOverPicture([entry('dark', { over: [over()] })], {
    baseline: { look: { over: untouched } }
  }).failures[0]
  assert.deepEqual(
    [stored.level, stored.causingStep],
    ['warn', 0],
    'a baseline kept from before still answers'
  )
  const own = judgeWordsOverPicture(
    [entry('dark', { over: [over({ underSrc: 'http://site.test/images/hero.jpg' })] })],
    { baseline: { pictures: { files: ['images/hero.jpg'] } } }
  ).failures[0]
  assert.deepEqual([own.level, own.causingStep], ['warn', 0])
})

test('words the host could not shoot are counted, never read as green', () => {
  const r = judgeWordsOverPicture([entry('dark', { over: [over({ under: undefined })] })], {})
  assert.deepEqual([r.failures.length, r.measured, r.unshot], [0, 0, 1])
})

const logo = (l) => ({
  selector: 'img.logo',
  src: 'http://site.test/images/tracy-brand/logo-footer.png',
  ink: 900,
  share: 0.3,
  under2: 0.6,
  under3: 0.6,
  plate: false,
  faintInk: WHITE.slice(0, 3),
  faintGround: [250, 250, 250],
  ...l
})

test('a logo with white words on a light ground is red, in that theme only, and names the brand for its own file', () => {
  const { failures } = judgeLogos([
    {
      path: '/',
      width: 1440,
      look: { sides: { light: { logos: [logo()] }, dark: { logos: [logo({ under2: 0, under3: 0 })] } } }
    }
  ])
  assert.equal(failures.length, 1)
  assert.deepEqual([failures[0].level, failures[0].causingStep], ['block', 2])
  assert.match(failures[0].reason, /light theme/)
})

test('a logo file the template holds names the template; faint warns; a plate carries its own ground', () => {
  const template = judgeLogos([
    entry('light', { logos: [logo({ src: 'http://site.test/images/joomlart/logo.png' })] })
  ])
  assert.equal(template.failures[0].causingStep, 0)
  const faint = judgeLogos([entry('light', { logos: [logo({ under2: 0.1, under3: 0.4 })] })])
  assert.equal(faint.failures[0].level, 'warn')
  assert.deepEqual(judgeLogos([entry('light', { logos: [logo({ plate: true })] })]).failures, [])
})

test('a logo the host could not shoot is counted as unread, not green', () => {
  const r = judgeLogos([entry('light', { logos: [{ selector: 'img', src: 'x' }] })])
  assert.deepEqual([r.read, r.unread, r.failures.length], [0, 1, 0])
})

test('a host that answers no look read leaves all three groups unmeasured, and a check that holds them is not green', async () => {
  const check = await runSiteCheck({
    door: pagedSite(1).door,
    report: writtenReport(),
    host: fakeHost({ '/': pageRead('/') }, { measures: () => [{ path: '/', width: 1440 }] }).host,
    groups: [bandContrastGroup, wordsOverPictureGroup, logoReadableGroup]
  })
  assert.deepEqual(
    check.groups.map((g) => g.status),
    ['unmeasured', 'unmeasured', 'unmeasured']
  )
  assert.equal(check.status, 'unmeasured')
})

test('through the entry point a finding says its step by name, and a switch nothing knows warns', async () => {
  const measures = () => [
    {
      path: '/',
      width: 1440,
      look: { switchSeen: true, sides: { only: { words: [words({ fg: DIM })], over: [], logos: [] } } }
    }
  ]
  const check = await runSiteCheck({
    door: pagedSite(1).door,
    report: writtenReport(),
    host: fakeHost({ '/': pageRead('/') }, { measures }).host,
    groups: [bandContrastGroup]
  })
  assert.equal(check.status, 'red')
  assert.deepEqual(check.groups[0].themes, ['only'])
  assert.ok(check.groups[0].failures.some((f) => f.level === 'warn' && /switch/.test(f.reason)))
  assert.ok(checkLines(check).some((l) => l.includes('block step 2 (brand)')))
})
