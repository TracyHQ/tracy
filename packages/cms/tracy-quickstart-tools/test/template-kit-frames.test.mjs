// Template kit frames: kind, size, canHide (emptied in the browser and judged), light/dark twins and icon
// classes, on a fabricated gym page served by a local test server; the classifier with a mocked model; the
// pipeline's own planning (which lists to measure, which template fixes to propose).
import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { crc32, deflateSync } from 'node:zlib'

import { chromium } from '@playwright/test'

import { judgeHidden } from '../template-kit/lib/frame-checks.mjs'
import { classifyIcons, mergeClasses } from '../template-kit/lib/icon-classify.mjs'
import { buildFrames, kindOf, twinsOf } from '../template-kit/lib/kit-frames.mjs'
import { measureFrames } from '../template-kit/lib/measure-frames.mjs'
import { minPlan } from '../template-kit/lib/pipeline.mjs'
import { reviewRows } from '../template-kit/lib/review-sheet.mjs'
import { templateFixes } from '../template-kit/lib/template-fixes.mjs'

/** A one-row PNG: one pixel of one RGBA colour, then `more` pixels given as [r, g, b, a]. */
function png(r, g, b, a, ...more) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body))
    return Buffer.concat([len, body, crc])
  }
  const px = [[r, g, b, a], ...more]
  const ihdr = Buffer.from([0, 0, 0, px.length, 0, 0, 0, 1, 8, 6, 0, 0, 0])
  const raw = Buffer.from([0, ...px.flat()])
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ])
}

const card = (n) =>
  `<div class="card" style="width:30%"><img src="/images/coach-${n}.png" style="width:100%;height:200px;display:block"><p>Coach ${n}</p></div>`
const feature = (n) =>
  `<li class="feature" style="width:30%"><span class="icon-wrap"><img class="img-icon" src="/images/icon-dark-${n}.png" width="40" height="40"><img class="img-light-icon" src="/images/icon-light-${n}.png" width="40" height="40" style="display:none"></span><p>Feature ${n}</p></li>`
// A mark drawn as a mask by its holder (its <img> kept at opacity 0), with a light twin; a picture covered by a
// plain box (emptying it changes nothing); a picture in a closed tab; the logo link home and the same logo file
// in the footer; an article's intro picture shown only in a listing block.
const EXTRA = `<style>.glyph{display:inline-block;position:relative;width:60px;height:60px}
.glyph img{opacity:0;width:60px;height:60px}
.glyph::after{content:"";position:absolute;inset:0;background:#c00;-webkit-mask-image:url(/images/mask.png);mask-image:url(/images/mask.png)}</style>
<div id="Mod8" class="moduletable"><span class="glyph glyph-dark"><img src="/images/mark-dark.png"></span><span class="glyph glyph-light" style="display:none"><img src="/images/mark-light.png"></span></div>
<div id="Mod9" class="moduletable"><div style="position:relative;width:200px;height:200px"><img src="/images/ghost.png" style="width:200px;height:200px;display:block"><div style="position:absolute;inset:0;background:#08f"></div></div><p>Covered</p></div>
<div id="Mod10" class="moduletable"><button aria-controls="tab-b" onclick="document.getElementById('tab-a').style.display='none';document.getElementById('tab-b').style.display='block'">B</button><div id="tab-a"><p>Tab A text</p></div><div id="tab-b" style="display:none"><img src="/images/tab-pic.png" style="width:300px;height:150px;display:block"><p>Tab B</p></div></div>
<div id="Mod11" class="moduletable"><div class="site-logo"><a href="/"><img src="/images/logo.png" style="width:180px;height:50px"></a></div></div>
<div id="Mod12" class="moduletable"><footer><a href="/about"><img src="/images/logo.png" style="width:180px;height:50px"></a><p>Footer</p></footer></div>
<div id="Mod13" class="moduletable"><p>An article without its intro picture</p></div>
<div id="Mod14" class="moduletable"><div class="blog-item"><img src="/images/intro.png" style="width:320px;height:180px;display:block"><p>Read more</p></div></div>`
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;font:16px sans-serif}</style></head><body>
<div id="Mod5" class="moduletable"><section class="hero" style="position:relative;height:400px;background:url(/images/hero-bg.png) center/cover">
<h1 style="margin:0;padding:40px">Example Gym</h1>
<img class="hero-figure" src="/images/figure.png" style="position:absolute;right:0;top:0;width:300px;height:300px"></section></div>
<div id="Mod6" class="moduletable"><div class="cards" style="display:flex;gap:10px">${[1, 2, 3].map(card).join('')}</div></div>
<div id="Mod7" class="moduletable"><ul class="features" style="display:flex;gap:10px;list-style:none;padding:0">${[1, 2].map(feature).join('')}</ul></div>
${EXTRA}
</body></html>`
const PICS = {
  'hero-bg.png': png(40, 40, 40, 255),
  'figure.png': png(0, 0, 0, 0, [200, 30, 30, 255]),
  'icon-dark-1.png': png(0, 0, 0, 255),
  'icon-dark-2.png': png(0, 0, 0, 255),
  'icon-light-1.png': png(255, 255, 255, 255),
  'icon-light-2.png': png(255, 255, 255, 255),
  'mask.png': png(0, 0, 0, 255),
  'mark-dark.png': png(0, 0, 0, 255),
  'mark-light.png': png(255, 255, 255, 255),
  'ghost.png': png(0, 160, 0, 255),
  'tab-pic.png': png(90, 30, 160, 255),
  'logo.png': png(20, 20, 20, 255),
  'intro.png': png(30, 120, 30, 255)
}
for (const n of [1, 2, 3]) PICS[`coach-${n}.png`] = png(200, 100, 50, 255)

const slot = (key, sample, group) => ({ key, entity: key.split('.')[0], type: 'image', sample, group })
const MAP = {
  entities: [],
  pages: [],
  slots: [
    slot('module-5.0', 'images/hero-bg.png#editor-suffix'),
    slot('module-5.1', 'images/figure.png'),
    ...[1, 2, 3].map((n) =>
      slot(`module-6.${n}`, `images/coach-${n}.png`, { id: 'module-6.person', item: n })
    ),
    slot('module-7.0', 'images/icon-dark-1.png', { id: 'module-7.feature', item: 0 }),
    slot('module-7.1', 'images/icon-light-1.png', { id: 'module-7.feature', item: 0 }),
    slot('module-7.2', 'images/icon-dark-2.png', { id: 'module-7.feature', item: 1 }),
    slot('module-7.3', 'images/icon-light-2.png', { id: 'module-7.feature', item: 1 }),
    slot('module-8.0', 'images/mark-dark.png'),
    slot('module-8.1', 'images/mark-light.png'),
    slot('module-9.0', 'images/ghost.png'),
    slot('module-10.0', 'images/tab-pic.png'),
    slot('module-11.0', 'images/logo.png'),
    slot('module-12.0', 'images/logo.png'),
    slot('module-13.0', 'images/intro.png')
  ]
}
const rec = (n) => ({
  id: `block-${n}`,
  source: `module-${n}`,
  widths: { 1440: { pages: ['home'] }, 390: { pages: ['home'] } }
})
const CAPTURE = {
  widths: [1440, 390],
  pages: [{ slug: 'home', path: '/' }],
  blocks: Object.fromEntries([5, 6, 7, 8, 9, 10, 11, 12, 13].map((n) => [`block-${n}`, rec(n)]))
}

async function serve() {
  const server = http.createServer((req, res) => {
    const name = decodeURIComponent(req.url.split('?')[0]).replace(/^\/images\//, '')
    if (PICS[name]) {
      res.writeHead(200, { 'content-type': 'image/png' })
      return res.end(PICS[name])
    }
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(PAGE)
  })
  await new Promise((r) => server.listen(0, 'localhost', r))
  return { server, site: `http://localhost:${server.address().port}` }
}

test('frames are measured on the page: kind, size, emptied and judged, light/dark twins, icon classes', async (t) => {
  let browser
  try {
    browser = await chromium.launch()
    await browser.close()
  } catch {
    return t.skip('no Chromium available')
  }
  const { server, site } = await serve()
  const out = mkdtempSync(join(tmpdir(), 'kit-frames-'))
  try {
    const evidence = await measureFrames({ chromium, siteUrl: site, capture: CAPTURE, map: MAP, out })
    const at = (id) => evidence[id].widths[1440]
    assert.equal(kindOf(at('block-5.0')), 'photo')
    assert.equal(at('block-5.0').asBackground, true)
    assert.equal(kindOf(at('block-5.1')), 'cutout', 'a clear picture over the hero background')
    assert.equal(kindOf(at('block-6.1')), 'photo')
    assert.equal(kindOf(at('block-7.0')), 'icon')
    assert.equal(at('block-7.1').shown, false)
    assert.equal(at('block-5.0').hidden.check.ok, true, 'the hero holds without its background')
    assert.equal(at('block-5.1').hidden.check.ok, true)
    assert.equal(at('block-6.1').hidden.measuredAs, 'row-slot', 'a list row frame is emptied in every row')
    assert.equal(at('block-6.1').hidden.check.ok, true, 'every card without its picture still matches')
    assert.deepEqual(
      at('block-6.3').hidden.check,
      at('block-6.1').hidden.check,
      'one measurement for the slot'
    )
    assert.ok(at('block-6.1').hidden.evidence.blockBefore.height > 0, 'the DOM numbers are the evidence')
    assert.deepEqual(readdirSync(out), ['frame-evidence.json'], 'nothing is shot')
    assert.equal(at('block-8.0').shown, true, 'a mask painted over an invisible img is what shows')
    assert.equal(at('block-8.0').paintedBy.how, 'after')
    assert.deepEqual([at('block-8.0').box.width, at('block-8.0').box.height], [60, 60])
    assert.match(at('block-8.0').hidden.emptied, /painters/, 'the mask is emptied, not only the img')
    assert.notEqual(at('block-8.0').hidden.check.ok, null)
    assert.equal(at('block-9.0').hidden.check.ok, null, 'a picture under a solid block: not a pass')
    assert.equal(at('block-9.0').hidden.evidence.covered, true)
    assert.equal(at('block-9.0').hidden.check.reason, 'no visible change, measurement invalid')
    assert.equal(at('block-10.0').shown, true)
    assert.equal(at('block-10.0').revealed, 'control of #tab-b')
    assert.ok(at('block-10.0').hidden?.check, 'a revealed frame is emptied and judged too')
    assert.equal(at('block-13.0').measuredIn, 'module-14', 'found in the listing block that shows it')
    assert.equal(kindOf(at('block-13.0')), 'photo')
    assert.equal(at('block-7.0').crop, undefined, 'no crop is shot: icons are classified from their files')
    const errors = []
    const slots = MAP.slots.map((s) => ({ ...s, role: 'item.icon' }))
    const classes = {
      'block-7.0': { class: 'demo', reason: 'a kettlebell', by: 'human' },
      'block-6.1': { class: 'demo-faces', reason: 'a coach portrait', by: 'human' },
      'block-6.2': { class: 'illustration', reason: 'a coach seen from behind', by: 'human' }
    }
    const review = { 'block-5.1': { canHide: false, reason: 'the hero looks empty' } }
    const { frames, demoIcons } = buildFrames({
      blockId: 'block-x',
      slots,
      evidence,
      classes,
      review,
      widths: ['1440', '390'],
      errors,
      logoIds: new Set(['block-11.0', 'block-12.0'])
    })
    const by = Object.fromEntries(frames.map((f) => [f.id, f]))
    assert.deepEqual(Object.keys(by['block-5.0']).slice(0, 8), [
      'id',
      'shape',
      'width',
      'height',
      'kind',
      'canHide',
      'twinOf',
      'fixed'
    ])
    assert.equal(by['block-5.0'].canHide, true)
    assert.equal(by['block-5.1'].canHide, false, "a person's verdict wins")
    assert.equal(by['block-6.1'].hideEvidence.measuredAs, 'row-slot')
    assert.equal(by['block-8.1'].twinOf, 'block-8.0', 'twins paired through the mask that shows')
    assert.equal(by['block-9.0'].canHide, null)
    assert.ok(errors.some((e) => e.field.endsWith('[block-9.0].canHide') && /invalid/.test(e.reason)))
    assert.equal(by['block-12.0'].kind, 'logo', 'the site part names the logo frames')
    assert.equal(by['block-10.0'].kind, 'photo')
    assert.equal(by['block-11.0'].fixed, null, 'the brand step owns the logo')
    assert.ok(!errors.some((e) => e.field.endsWith('[block-11.0].fixed')))
    const rows = reviewRows({ widths: [1440, 390], images: [], blocks: [{ images: {}, frames }] })
    assert.ok(
      rows.some(
        (r) => r.title.startsWith('block-9.0') && r.note.includes('no visible change, measurement invalid')
      )
    )
    assert.equal(
      rows.filter((r) => r.section.startsWith('Frames emptied') && r.title.startsWith('block-6.')).length,
      2,
      'one row slot measurement per width'
    )
    assert.equal(by['block-7.1'].twinOf, 'block-7.0')
    assert.equal(by['block-7.3'].twinOf, 'block-7.2')
    assert.equal(by['block-7.1'].fixed, false, 'a twin follows its main frame')
    assert.deepEqual(demoIcons.map((d) => d.id).sort(), ['block-6.1', 'block-7.0', 'block-7.1'])
    assert.equal(demoIcons.find((d) => d.id === 'block-6.1').class, 'demo-faces')
    assert.deepEqual(
      [by['block-6.1'].faces, by['block-6.1'].fixed, by['block-6.2'].faces, by['block-6.3'].faces],
      [true, false, false, null],
      'faces by looking; a picture nobody looked at is unknown'
    )
    assert.equal(by['block-6.1'].canHide, by['block-6.2'].canHide, 'canHide is measured like any frame')
    assert.ok(
      errors.some((e) => e.field === 'blocks[block-x].frames[block-7.2].fixed'),
      'an unclassified icon is an error'
    )
    assert.deepEqual(
      [by['block-6.1'].width, by['block-6.1'].height, by['block-6.1'].shape.name],
      [432, 200, 'wide']
    )
  } finally {
    server.close()
    rmSync(out, { recursive: true, force: true })
  }
})

test('twins need different theme markers and exactly one shown', () => {
  const ev = (shown, theme) => ({
    widths: { 1440: { found: true, shown, theme, box: { width: 40, height: 40 } } }
  })
  const frames = [
    { id: 'a', row: 'r0' },
    { id: 'b', row: 'r0' },
    { id: 'c', row: 'r1' }
  ]
  assert.deepEqual(
    [...twinsOf(frames, { a: ev(true, null), b: ev(false, 'light'), c: ev(true, null) })],
    [['b', 'a']]
  )
  assert.equal(twinsOf(frames, { a: ev(true, 'dark'), b: ev(false, 'dark') }).size, 0)
  const two = [
    { id: 'p', row: null },
    { id: 'd', row: null },
    { id: 'l', row: null }
  ]
  assert.deepEqual(
    [...twinsOf(two, { p: ev(true, null), d: ev(true, 'dark'), l: ev(false, 'light') })],
    [['l', 'd']],
    'the frame with the other theme marker wins over an unmarked one'
  )
})

test('the automatic canHide check: empty boxes, shrunk cards, rewrapped rows', () => {
  const row = (left, top, height = 100) => ({ left, top, width: 100, height })
  const before = { block: { height: 300 }, sets: [{ shape: 'DIV.card', rows: [row(0, 0), row(110, 0)] }] }
  assert.equal(judgeHidden({ before, after: before }).ok, true)
  assert.match(
    judgeHidden({ before, after: before, empty: { width: 100, height: 80 } }).reason,
    /empty 100x80 box/
  )
  const shrunk = { block: { height: 300 }, sets: [{ shape: 'DIV.card', rows: [row(0, 0, 40), row(110, 0)] }] }
  assert.match(judgeHidden({ before, after: shrunk }).reason, /shrank/)
  const wrapped = { block: { height: 300 }, sets: [{ shape: 'DIV.card', rows: [row(0, 0), row(0, 110)] }] }
  assert.match(judgeHidden({ before, after: wrapped }).reason, /wrap differently/)
})

test('icons are classified by the model through the vision door; a person always wins; no door, no guess', async () => {
  const challenge = { image: 'data:image/png;base64,AA==', code: '7' }
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push(JSON.parse(init.body))
    const answer = {
      imageCode: '7',
      icons: [
        { id: 'i1', class: 'demo', reason: 'a dumbbell' },
        { id: 'i2', class: 'fixed', reason: 'an arrow' },
        { id: 'zz', class: 'demo' }
      ]
    }
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(answer) } }] }) }
  }
  const common = {
    challengeFor: async () => challenge,
    codeMatches: (a, c) => a.imageCode === c.code,
    instruction: 'code',
    fetchImpl
  }
  const icons = [
    { id: 'i1', bytes: new Uint8Array([1]) },
    { id: 'i2', bytes: new Uint8Array([2]) }
  ]
  const door = { url: 'https://vision.example/chat', key: 'test-key', model: 'test-model' }
  const r = await classifyIcons({ door, icons, trade: 'a gym', ...common })
  assert.deepEqual(Object.keys(r.classes), ['i1', 'i2'])
  assert.equal(r.classes.i1.by, 'model')
  assert.match(calls[0].messages[0].content[0].text, /a gym/)
  const merged = mergeClasses({ i1: { class: 'fixed', reason: 'checked', by: 'human' } }, r.classes)
  assert.equal(merged.i1.by, 'human')
  assert.equal(merged.i2.by, 'model')
  const wrongCode = await classifyIcons({ door, icons, ...common, codeMatches: () => false })
  assert.deepEqual(wrongCode.unanswered, ['i1', 'i2'])
  const noDoor = await classifyIcons({ door: null, icons, ...common })
  assert.deepEqual([Object.keys(noDoor.classes).length, noDoor.unanswered.length], [0, 2])
  const facesFetch = async (url, init) => {
    calls.push(JSON.parse(init.body))
    const answer = {
      imageCode: '7',
      icons: [
        { id: 'i1', class: 'demo-faces', reason: 'four customer faces' },
        { id: 'i2', class: 'demo', reason: 'not an answer to this question' }
      ]
    }
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(answer) } }] }) }
  }
  const faces = await classifyIcons({ door, icons, question: 'faces', ...common, fetchImpl: facesFetch })
  assert.match(calls.at(-1).messages[0].content[0].text, /faces/)
  assert.deepEqual(faces.classes.i1.class, 'demo-faces')
  assert.equal(faces.classes.i1.prompt, 'f1')
  assert.deepEqual(faces.unanswered, ['i2'], 'an answer outside the question is no answer')
})

test('the pipeline measures every list it can find rows for, and groups template fixes by row element', () => {
  const repeats = [
    { path: [0, 1], shape: 'DIV.card', count: 4, firstLine: 4 },
    { path: [0, 2], shape: 'DIV.slide', count: 3, inSlider: true }
  ]
  const capture = {
    pages: [{ slug: 'home', path: '/' }],
    blocks: { 'block-1': { source: 'module-1', widths: { 1440: { pages: ['home'], details: { repeats } } } } }
  }
  const kit = {
    widths: [1440, 390],
    blocks: [
      {
        id: 'block-1',
        lists: [
          { id: 'block-1.card', rowKind: 'slots', max: 4 },
          { id: 'block-1.slide', rowKind: 'slots', max: 3 },
          { id: 'block-1.one', rowKind: 'slots', max: 1 },
          { id: 'block-1.fixed', rowKind: 'slots', max: 4, minSource: 'content map' }
        ]
      }
    ]
  }
  assert.deepEqual(
    minPlan(kit, capture).map((j) => [j.listId, j.max, j.repeat.shape]),
    [['block-1.card', 4, 'DIV.card']]
  )
  assert.equal(
    minPlan(kit, capture, { 'block-1.card': { min: 2, by: 'person' } }).length,
    0,
    "a person's measurement stays"
  )
  const fix = {
    selector: 'div.cards div.row',
    display: 'flex',
    rule: 'justify-content: center',
    verified: true
  }
  const { fixes, skipped } = templateFixes({
    'block-1.card': {
      rowKind: 'slots',
      min: 4,
      minIfCentered: 1,
      fix,
      centered: {
        3: { 1440: { ok: true, reason: 'the last line is centered', gap: { left: 0, right: 300 } } }
      }
    },
    'block-2.card': {
      rowKind: 'slots',
      min: 2,
      minIfCentered: 1,
      fix: { ...fix, verified: false },
      centered: {}
    },
    'block-3.card': { min: 1 },
    'body-blog.items': {
      rowKind: 'items',
      min: 2,
      minIfCentered: 1,
      fix: { ...fix, selector: 'div.blog div.row' }
    },
    'article-1.list': {
      rowKind: 'slots',
      min: null,
      minIfCentered: 1,
      fix: { ...fix, selector: 'nav ul.pagination' }
    },
    'block-4.card': {
      rowKind: 'slots',
      min: 1,
      minIfCentered: 1,
      fix: { ...fix, selector: 'div.team div.row' }
    }
  })
  assert.deepEqual(
    skipped.map((x) => [x.list, x.reason.split(':')[0].split(' (')[0]]),
    [
      ['body-blog.items', 'rowKind items'],
      ['article-1.list', 'pagination control'],
      ['block-4.card', 'centering would not lower the minimum']
    ]
  )
  assert.equal(fixes.length, 1)
  assert.deepEqual(fixes[0].lists, ['block-1.card', 'block-2.card'])
  assert.equal(fixes[0].verified, false, 'one list the fix does not cure leaves it unverified')
  assert.deepEqual(fixes[0].evidence[0], {
    list: 'block-1.card',
    count: 3,
    width: '1440',
    gap: { left: 0, right: 300 },
    ok: true,
    reason: 'the last line is centered'
  })
})
