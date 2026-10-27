// The assertions: pure checks on hand-made facts, the in-page collector on HTML fixtures in a real
// browser (or its ENV classification when chromium cannot run), the vocabulary oracle against the
// repository's own gate, and the switch checks.

import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { REPO_ROOT } from '../artifacts.mjs'
import { evaluate } from '../families.mjs'
import {
  COMPOSITE_ROLES,
  activeIndex,
  checkAccessibleNames,
  checkConsoleNetwork,
  checkDialog,
  checkFocusStroke,
  checkOverflow,
  checkRawKeys,
  checkTabReach,
  checkVocabulary,
  collectFacts,
  parseShadows,
  readFocusStyle
} from '../assertions.mjs'
import { loadBanned, dictionaryKeys } from '../oracles.mjs'
import { checkBinding, checkConsumer, checkDoorDown, checkTabPolicy } from '../switches.mjs'
import { assertEnvError, cleanup, tryBrowser } from './helpers.mjs'
import { readTextAsync } from '../../../lib/bounded-reader.mjs'

const control = (over = {}) => ({
  i: 0,
  tag: 'button',
  role: '',
  type: '',
  radioGroup: null,
  named: true,
  name: 'Save',
  nameSource: 'content',
  visible: true,
  disabled: false,
  tabindex: null,
  composite: null,
  path: 'button',
  rect: { x: 0, y: 0, w: 10, h: 10, right: 10 },
  ...over
})
const facts = (controls = [], over = {}) => ({
  controls,
  texts: [],
  attributes: [],
  layout: { scrollWidth: 390, bodyScrollWidth: 390, innerWidth: 390, wide: [] },
  openDialogs: 0,
  ...over
})

test('accessible name: a named control passes, an unnamed one is caught, nothing to judge is vacuous', () => {
  assert.equal(checkAccessibleNames(facts([control()])).ok, true)
  const bad = checkAccessibleNames(facts([control({ name: '', nameSource: 'none', path: 'button[icon]' })]))
  assert.equal(bad.ok, false)
  assert.match(bad.violations[0].message, /no accessible name/)
  assert.equal(checkAccessibleNames(facts([])).vacuous, true)
  assert.equal(
    checkAccessibleNames(facts([control({ visible: false, name: '' })])).vacuous,
    true,
    'a hidden control is out of scope'
  )
})

test('tab reach: reached, roving composite, radio group, tabindex=-1 outside a composite, positive tabindex', () => {
  const a = control({ i: 0 })
  assert.equal(checkTabReach(facts([a]), [0]).ok, true)
  assert.equal(checkTabReach(facts([a]), []).ok, false)
  const tabs = [
    control({ i: 0, role: 'tab', tabindex: 0, composite: 'tablist' }),
    control({ i: 1, role: 'tab', tabindex: -1, composite: 'tablist' })
  ]
  assert.equal(
    checkTabReach(facts(tabs), [0]).ok,
    true,
    'arrow-key members of a roving widget are reached through its tab stop'
  )
  assert.equal(
    checkTabReach(facts([control({ i: 0, tabindex: -1 })]), []).ok,
    false,
    'tabindex=-1 with no composite is unreachable'
  )
  assert.equal(
    checkTabReach(facts([control({ i: 0, tabindex: 3 })]), [0]).ok,
    false,
    'a positive tabindex breaks the order'
  )
  const radios = [
    control({ i: 0, tag: 'input', type: 'radio', radioGroup: 'g' }),
    control({ i: 1, tag: 'input', type: 'radio', radioGroup: 'g' })
  ]
  assert.equal(checkTabReach(facts(radios), [0]).ok, true)
  assert.equal(checkTabReach(facts([control({ disabled: true })]), []).vacuous, true)
})

test('shadow parsing and the focus rule: a 1px stroke passes, a halo or a thick outline is caught', () => {
  assert.deepEqual(parseShadows('none'), [])
  const [layer] = parseShadows('rgba(59, 130, 246, 0.5) 0px 0px 0px 3px')
  assert.equal(layer.spread, 3)
  assert.equal(layer.alpha, 0.5)
  const plain = {
    boxShadow: 'none',
    outlineStyle: 'none',
    outlineWidth: '0px',
    outlineColor: 'rgb(0, 0, 0)',
    borderColor: 'rgb(0, 0, 0)',
    borderWidth: '0px'
  }
  const stop = (before, after) => [{ i: 0, before: { ...plain, ...before }, after: { ...plain, ...after } }]
  const f = facts([control()])
  const RED = 'rgb(200, 0, 0)'
  const solid1 = { outlineStyle: 'solid', outlineWidth: '1px', outlineColor: RED }
  const resting = { outlineStyle: 'solid', outlineWidth: '1px', outlineColor: 'rgb(0, 0, 0)' }
  const border = (width, color) => ({ borderWidth: width, borderColor: color })
  // [name, before, after, expected ok]
  const table = [
    ['1px ring', {}, { boxShadow: 'rgb(0, 0, 0) 0px 0px 0px 1px' }, true],
    ['3px translucent ring (halo)', {}, { boxShadow: 'rgba(0, 0, 0, 0.2) 0px 0px 0px 3px' }, false],
    ['blur (halo)', {}, { boxShadow: 'rgba(0, 0, 0, 0.2) 0px 0px 8px 0px' }, false],
    ['offset shadow', {}, { boxShadow: 'rgb(0, 0, 0) 2px 2px 0px 1px' }, false],
    ['fractional 1.5px ring', {}, { boxShadow: 'rgb(0, 0, 0) 0px 0px 0px 1.5px' }, false],
    ['transparent 1px ring', {}, { boxShadow: 'rgba(0, 0, 0, 0) 0px 0px 0px 1px' }, false],
    ['nothing drawn', {}, { boxShadow: 'rgba(0, 0, 0, 0) 0px 0px 0px 0px' }, false],
    ['outline 1px, colour changed', {}, solid1, true],
    [
      'outline 1px, colour unchanged (width/style-only)',
      {},
      { outlineStyle: 'solid', outlineWidth: '1px' },
      false
    ],
    ['outline 3px', {}, { ...solid1, outlineWidth: '3px' }, false],
    ['outline 1.5px', {}, { ...solid1, outlineWidth: '1.5px' }, false],
    ['outline identical before and after', resting, resting, false],
    ['outline recoloured at rest width', resting, { ...resting, outlineColor: RED }, true],
    ['outline transparent', {}, { ...solid1, outlineColor: 'rgba(0, 0, 0, 0)' }, false],
    ['outline width change only', resting, { ...resting, outlineWidth: '2px' }, false],
    ['border 1px recoloured', border('1px', 'rgb(0, 0, 0)'), border('1px', RED), true],
    ['border colour only, no width', { borderColor: 'rgb(0, 0, 0)' }, { borderColor: RED }, false],
    ['border width 0 to 1px, same colour', {}, border('1px', 'rgb(0, 0, 0)'), false],
    ['border 2px recoloured', border('1px', 'rgb(0, 0, 0)'), border('2px', RED), false],
    ['border 1.5px recoloured', border('1px', 'rgb(0, 0, 0)'), border('1.5px', RED), false],
    [
      'resting border untouched by focus',
      border('2px', 'rgb(0, 0, 0)'),
      { ...border('2px', 'rgb(0, 0, 0)'), ...solid1 },
      true
    ],
    ['two strokes: outline and ring', {}, { ...solid1, boxShadow: 'rgb(0, 0, 0) 0px 0px 0px 1px' }, false],
    [
      'two strokes: outline and border',
      border('1px', 'rgb(0, 0, 0)'),
      { ...solid1, ...border('1px', RED) },
      false
    ],
    [
      'always-present shadow plus an outline',
      { boxShadow: 'rgba(0, 0, 0, 0.2) 0px 1px 3px 0px' },
      { boxShadow: 'rgba(0, 0, 0, 0.2) 0px 1px 3px 0px', ...solid1 },
      true
    ],
    [
      'invisible placeholder shadow plus an outline',
      {},
      { boxShadow: 'rgba(0, 0, 0, 0) 0px 0px 0px 0px', ...solid1 },
      true
    ],
    [
      'valid outline plus an offset shadow',
      {},
      { ...solid1, boxShadow: 'rgb(0, 0, 0) 2px 0px 0px 1px' },
      false
    ],
    [
      'valid outline plus a 0.5px blurred shadow',
      {},
      { ...solid1, boxShadow: 'rgb(0, 0, 0) 0px 0px 0.5px 0px' },
      false
    ],
    [
      'valid outline plus an offset inset shadow',
      {},
      { ...solid1, boxShadow: 'rgb(0, 0, 0) 2px 0px 0px 0px inset' },
      false
    ],
    [
      'valid outline plus a blurred inset shadow',
      {},
      { ...solid1, boxShadow: 'rgba(0, 0, 0, 0.3) 0px 0px 4px 0px inset' },
      false
    ],
    ['inset 1px ring is one stroke', {}, { boxShadow: 'rgb(0, 0, 0) 0px 0px 0px 1px inset' }, true],
    [
      'two 1px rings',
      {},
      { boxShadow: 'rgb(0, 0, 0) 0px 0px 0px 1px, rgb(255, 0, 0) 0px 0px 0px 1px' },
      false
    ],
    [
      'a 1px ring beside a drop shadow',
      {},
      { boxShadow: 'rgb(0, 0, 0) 0px 0px 0px 1px, rgba(0, 0, 0, 0.3) 0px 4px 8px 0px' },
      false
    ]
  ]
  for (const [name, before, after, expected] of table)
    assert.equal(checkFocusStroke(f, stop(before, after)).ok, expected, name)
  const thick = checkFocusStroke(f, stop(border('1px', 'rgb(0, 0, 0)'), border('2px', RED)))
  assert.match(thick.violations.map((v) => v.message).join('\n'), /border is 2px thick/)
  // a value that cannot be read is "not measured", never a guessed pass
  const unreadable = checkFocusStroke(f, stop({}, { outlineStyle: 'solid', outlineWidth: 'thick' }))
  assert.equal(unreadable.vacuous, true)
  assert.equal(unreadable.ok, false)
  assert.equal(checkFocusStroke(f, []).vacuous, true)
})

test('overflow: at the viewport passes, wider is caught with the widest elements named', () => {
  assert.equal(
    checkOverflow(
      facts([], { layout: { scrollWidth: 390, bodyScrollWidth: 390, innerWidth: 390, wide: [] } }),
      390
    ).ok,
    true
  )
  assert.equal(
    checkOverflow(
      facts([], { layout: { scrollWidth: 391, bodyScrollWidth: 380, innerWidth: 390, wide: [] } }),
      390
    ).ok,
    true,
    'one pixel of rounding is tolerated'
  )
  const bad = checkOverflow(
    facts([], {
      layout: {
        scrollWidth: 700,
        bodyScrollWidth: 700,
        innerWidth: 390,
        wide: [{ path: 'div', right: 700, w: 700 }]
      }
    }),
    390
  )
  assert.equal(bad.ok, false)
  assert.equal(bad.violations[0].evidence.wide.length, 1)
})

test('console and network: errors, exceptions and HTTP failures are caught, harness noise is not', () => {
  assert.equal(checkConsoleNetwork([]).ok, true)
  assert.equal(
    checkConsoleNetwork([
      { type: 'response', status: 404, url: 'http://x/vite-inject-mocker-entry.js', text: 'Not Found' }
    ]).ok,
    true
  )
  assert.equal(checkConsoleNetwork([{ type: 'console', text: 'boom', url: '' }]).ok, false)
  assert.equal(checkConsoleNetwork([{ type: 'pageerror', text: 'TypeError' }]).ok, false)
  assert.equal(
    checkConsoleNetwork([{ type: 'response', status: 500, url: 'http://x/api/y', text: '' }]).ok,
    false
  )
  assert.equal(
    checkConsoleNetwork([{ type: 'requestfailed', url: 'http://x/z', text: 'net::ERR' }]).ok,
    false
  )
})

test('raw keys: a key as a whole text node, a placeholder, an artefact; real copy passes', () => {
  const keys = new Set(['action.submit', 'empty.title'])
  const t = (...texts) => facts([], { texts })
  assert.equal(checkRawKeys(t('Send answer', 'No questions are waiting'), keys).ok, true)
  assert.equal(checkRawKeys(t('action.submit'), keys).ok, false)
  assert.equal(checkRawKeys(t('Hello {name}'), keys).ok, false)
  assert.equal(checkRawKeys(t('{{count}} sites'), keys).ok, false)
  assert.equal(checkRawKeys(t('Welcome undefined'), keys).ok, false)
  assert.equal(checkRawKeys(t('joomlart.com'), keys).ok, true, 'a domain is not a key')
  assert.equal(
    checkRawKeys(facts([], { attributes: [{ attribute: 'aria-label', value: 'empty.title' }] }), keys).ok,
    false
  )
  assert.equal(checkRawKeys(t(), keys).vacuous, true)
})

test('vocabulary: every banned phrase is caught, the replacements pass', async () => {
  const banned = await loadBanned()
  const t = (...texts) => facts([], { texts })
  for (const phrase of [
    'Creator mode',
    'Session log',
    'Workspace Write',
    'Agent presets',
    'Agent preset',
    'Design direction',
    'Design directions'
  ]) {
    assert.equal(checkVocabulary(t(`Open ${phrase} now`), banned).ok, false, `${phrase} must be caught`)
  }
  for (const phrase of [
    'Permission mode',
    'History',
    'toolset permissions',
    'Provider presets',
    'Design inspiration',
    'direction'
  ]) {
    assert.equal(checkVocabulary(t(phrase), banned).ok, true, `${phrase} must pass`)
  }
})

test('the banned list is the repository gate list: same regexes as scripts/check-language.ts', async () => {
  const gate = await readTextAsync(path.join(REPO_ROOT, 'scripts/check-language.ts'))
  const block = gate.slice(gate.indexOf('const BANNED_VOCABULARY'), gate.indexOf(']\n\nfunction sourceFiles'))
  const fromGate = [...block.matchAll(/\[\/(.+?)\/i,/g)].map((m) => m[1])
  const banned = await loadBanned()
  assert.ok(fromGate.length >= 5)
  assert.deepEqual(banned.map((b) => b.pattern).sort(), fromGate.sort())
})

test('dialog: unnamed, escaping focus, not closing and lost focus are each caught', () => {
  const open = { open: true, role: 'dialog', name: 'Invite', modal: true, focusInside: true }
  const closed = { open: false }
  const good = {
    before: open,
    afterTab: [open, open],
    afterEscape: closed,
    trigger: 'button',
    focusRestored: true
  }
  assert.equal(checkDialog(good).ok, true)
  assert.equal(checkDialog({ ...good, before: { ...open, name: '' } }).ok, false)
  assert.equal(checkDialog({ ...good, afterTab: [{ ...open, focusInside: false }] }).ok, false)
  assert.equal(checkDialog({ ...good, afterEscape: open }).ok, false)
  assert.equal(checkDialog({ ...good, focusRestored: false }).ok, false)
  assert.equal(
    checkDialog({ ...good, trigger: null, focusRestored: null }).ok,
    true,
    'an already-open dialog has no trigger to return to'
  )
  assert.equal(checkDialog({ before: closed, afterTab: [], afterEscape: null, trigger: null }).vacuous, true)
})

test('dictionary keys are read from strings.ts without guessing at spreads', () => {
  const r = dictionaryKeys(
    'x/strings.ts',
    `export const NS = 'x'\nexport const en = { 'a.b': 'A', plain: 'P', ...other }`
  )
  assert.deepEqual(r.keys, ['a.b', 'plain'])
  assert.equal(r.unresolved.length, 1)
})

// ---- switches ----------------------------------------------------------------------------------

const switches = [
  { id: 'model-picker', defaultOn: true },
  { id: 'tab-git', defaultOn: true, tabs: ['git'] },
  { id: 'launch-git', defaultOn: true, tabs: ['git'] },
  { id: 'locked-one', defaultOn: false, locked: 'plugin off' }
]
const reading = (over = {}) => ({
  attribute: 'locked-one model-picker',
  shown: { 'model-picker': false, 'tab-git': true, 'launch-git': true, 'locked-one': false },
  allowed: { git: true },
  listed: { git: true },
  ...over
})

test('switch binding: the listed id rides on <html>, a locked one keeps its default, a broken binding is caught', () => {
  assert.equal(checkBinding('model-picker', switches, reading()).ok, true)
  assert.equal(
    checkBinding('model-picker', switches, reading({ attribute: 'locked-one' })).ok,
    false,
    'attribute lacks the hidden id'
  )
  assert.equal(
    checkBinding('model-picker', switches, reading({ shown: { ...reading().shown, 'model-picker': true } }))
      .ok,
    false
  )
  assert.equal(
    checkBinding('model-picker', switches, reading({ shown: { ...reading().shown, 'locked-one': true } })).ok,
    false,
    'a locked switch must not follow the door'
  )
  assert.equal(checkBinding('model-picker', switches, undefined).vacuous, true)
})

test('switch door failure keeps defaults; a hide-everything fallback is caught', () => {
  const ok = {
    status500: reading({
      attribute: 'locked-one',
      shown: { 'model-picker': true, 'tab-git': true, 'launch-git': true, 'locked-one': false }
    })
  }
  assert.equal(checkDoorDown('model-picker', switches, ok).ok, true)
  const allHidden = {
    status500: reading({
      attribute: 'model-picker tab-git',
      shown: { 'model-picker': false, 'tab-git': false, 'launch-git': false, 'locked-one': false }
    })
  }
  assert.equal(checkDoorDown('model-picker', switches, allHidden).ok, false)
})

test('tab policy: a tab-* switch turns the tab off, a launch-* switch delists it', () => {
  const tab = switches[1]
  const launch = switches[2]
  assert.equal(checkTabPolicy(tab, reading({ allowed: { git: false }, listed: { git: true } })).ok, true)
  assert.equal(checkTabPolicy(tab, reading({ allowed: { git: true } })).ok, false)
  assert.equal(checkTabPolicy(launch, reading({ allowed: { git: true }, listed: { git: false } })).ok, true)
  assert.equal(checkTabPolicy(launch, reading({ listed: { git: true } })).ok, false)
  assert.equal(checkTabPolicy(switches[0], reading()).vacuous, true)
})

test('switch consumer: found in product text passes, stripped text is caught', () => {
  const sw = { id: 'model-picker', tabs: [] }
  assert.equal(
    checkConsumer(sw, [{ file: 'a.ts', text: ':root[data-tracy-hide~="model-picker"] x { display:none }' }])
      .ok,
    true
  )
  assert.equal(checkConsumer(sw, [{ file: 'a.ts', text: 'nothing here' }]).ok, false)
  assert.equal(
    checkConsumer({ id: 'tab-git', tabs: ['git'] }, [
      { file: 'b.ts', text: 'switches.followTabPolicy(sidebar)' }
    ]).ok,
    true
  )
})

// ---- the in-page collector, in a real browser ----------------------------------------------------

async function measure(page, html) {
  await page.setContent(`<!doctype html><html><body>${html}</body></html>`)
  return page.evaluate(collectFacts, { composite: [...COMPOSITE_ROLES] })
}

test('collector: names from aria-label, label, content, sr-only text, labelledby and svg title; missing names are exposed', async () => {
  const b = await tryBrowser()
  try {
    if (b.error) return assertEnvError(assert, b.error)
    const page = await b.browser.newPage()
    const f = await measure(
      page,
      `<button id="a" aria-label="Add site"><svg width="10" height="10"></svg></button>
       <button id="b"><svg width="10" height="10"></svg></button>
       <label for="e">Email</label><input id="e">
       <input id="p" placeholder="Name">
       <button id="c"><span style="position:absolute;clip:rect(0 0 0 0)">Close</span><svg width="5" height="5" aria-hidden="true"></svg></button>
       <span id="lbl">Search</span><button id="d" aria-labelledby="lbl"></button>
       <button id="g"><svg width="8" height="8"><title>Gear</title></svg></button>
       <button id="h" style="display:none">hidden</button>
       <code>{notAPlaceholder}</code><p>Visible copy</p>`
    )
    const byPath = Object.fromEntries(f.controls.map((c) => [c.path.split(' > ').pop(), c]))
    assert.equal(byPath['button#a'].name, 'Add site')
    assert.equal(byPath['button#b'].name, '')
    assert.equal(byPath['input#e'].name, 'Email')
    assert.equal(byPath['input#p'].nameSource, 'placeholder')
    assert.equal(byPath['button#c'].name, 'Close')
    assert.equal(byPath['button#d'].name, 'Search')
    assert.equal(byPath['button#g'].name, 'Gear')
    assert.equal(byPath['button#h'].visible, false)
    assert.ok(f.texts.includes('Visible copy'))
    assert.ok(!f.texts.some((x) => x.includes('notAPlaceholder')), 'code samples are not copy')
    const verdict = checkAccessibleNames(f)
    assert.equal(verdict.ok, false)
    assert.equal(verdict.violations.length, 1)
    assert.match(verdict.violations[0].evidence.path, /button#b/)
  } finally {
    if (b.browser) await b.browser.close()
    await cleanup(b.dir)
  }
})

test('collector + Tab walk: a keyboard-trapped control and a halo are measured, a roving tablist is not blamed', async () => {
  const b = await tryBrowser()
  try {
    if (b.error) return assertEnvError(assert, b.error)
    const page = await b.browser.newPage({ viewport: { width: 400, height: 300 } })
    const f = await measure(
      page,
      `<style>#halo:focus-visible{outline:none;box-shadow:0 0 0 4px rgba(0,0,255,.3)} #ok:focus-visible{outline:none;border-color:red} #ok{border:1px solid #ccc}</style>
       <button id="ok">Fine</button><button id="halo">Halo</button><button id="skip" tabindex="-1">Skipped</button>
       <div role="tablist"><button role="tab" tabindex="0">One</button><button role="tab" tabindex="-1">Two</button></div>`
    )
    await page.evaluate(() => document.activeElement?.blur?.())
    const order = []
    const stops = []
    const before = new Map()
    for (const c of f.controls) before.set(c.i, await page.evaluate(readFocusStyle, c.i))
    for (let n = 0; n < 8; n++) {
      await page.keyboard.press('Tab')
      const i = await page.evaluate(activeIndex)
      if (i < 0 || order.includes(i)) break
      order.push(i)
      stops.push({ i, before: before.get(i), after: await page.evaluate(readFocusStyle, i) })
    }
    const reach = checkTabReach(f, order)
    assert.equal(reach.ok, false)
    assert.equal(reach.violations.length, 1, 'only the tabindex=-1 button outside the tablist is a violation')
    assert.match(reach.violations[0].message, /Skipped|button/)
    const focus = checkFocusStroke(f, stops)
    assert.equal(focus.ok, false)
    assert.equal(focus.violations.length, 1)
    assert.match(focus.violations[0].message, /halo/)
  } finally {
    if (b.browser) await b.browser.close()
    await cleanup(b.dir)
  }
})

test('collector: horizontal overflow at 390 is measured on a real layout', async () => {
  const b = await tryBrowser()
  try {
    if (b.error) return assertEnvError(assert, b.error)
    const page = await b.browser.newPage({ viewport: { width: 390, height: 600 } })
    const wide = await measure(page, '<div style="width:700px;height:20px">wide</div>')
    assert.equal(checkOverflow(wide, 390).ok, false)
    const fine = await measure(page, '<div style="max-width:100%">fits</div>')
    assert.equal(checkOverflow(fine, 390).ok, true)
  } finally {
    if (b.browser) await b.browser.close()
    await cleanup(b.dir)
  }
})

test('keyboard reach: an unnamed control is still subject to the Tab check', () => {
  const unnamed = control({ name: '', nameSource: 'none' })
  const result = checkTabReach(facts([unnamed]), [])
  assert.equal(result.ok, false)
  assert.equal(result.vacuous, false)
})

test('a bundle failure is told from a console error the story raises itself', () => {
  const bench = 'http://x'
  const visit = (events, benchOrigin = bench) => ({
    visits: { 1440: { state: 'ok', events, eventsAfter: events, facts: null, benchOrigin } }
  })
  const quote = { type: 'console', text: 'Cannot find module foo', url: '' }
  const own = evaluate('console-network', '1440', visit([quote]), {})
  assert.equal(own.kind, 'checked', 'product console.error quoting a bundle phrase is a product signal')
  assert.equal(own.result.ok, false)
  const vite = {
    type: 'console',
    text: '[vite] Internal server error: Failed to resolve import "x"',
    url: 'http://x/@vite/client'
  }
  assert.equal(evaluate('console-network', '1440', visit([vite]), {}).kind, 'harness')
  const storyVite = { ...vite, url: 'http://x/src/story.tsx' }
  assert.equal(
    evaluate('console-network', '1440', visit([storyVite]), {}).kind,
    'checked',
    'a story logging a "[vite]" line is not the Vite client'
  )
  assert.equal(
    evaluate('console-network', '1440', visit([vite], null), {}).kind,
    'checked',
    'no bench origin, no proof'
  )
  const dyn = { type: 'pageerror', text: 'Failed to fetch dynamically imported module: http://x/y.js' }
  const vite500 = { type: 'response', status: 500, url: 'http://x/y.js?t=1', text: 'Internal Server Error' }
  assert.equal(
    evaluate('console-network', '1440', visit([vite500, dyn]), {}).kind,
    'harness',
    'a dynamic import Vite answered with a 5xx is the bench failing to build'
  )
  const alone = evaluate('console-network', '1440', visit([dyn]), {})
  assert.equal(
    alone.kind,
    'checked',
    'the same message with no failed module request is the story’s own error'
  )
  assert.equal(alone.result.ok, false)
  const missing = { type: 'response', status: 404, url: 'http://x/y.js', text: 'Not Found' }
  assert.equal(
    evaluate('console-network', '1440', visit([missing, dyn]), {}).kind,
    'checked',
    'a story importing a module that does not exist is a product signal'
  )
  const otherModule = { type: 'response', status: 500, url: 'http://x/z.js', text: 'Internal Server Error' }
  assert.equal(evaluate('console-network', '1440', visit([otherModule, dyn]), {}).kind, 'checked')
  const cdnDyn = {
    type: 'pageerror',
    text: 'Failed to fetch dynamically imported module: https://cdn.example/sdk.js'
  }
  const cdn503 = {
    type: 'response',
    status: 503,
    url: 'https://cdn.example/sdk.js',
    text: 'Service Unavailable'
  }
  assert.equal(
    evaluate('console-network', '1440', visit([cdn503, cdnDyn]), {}).kind,
    'checked',
    'a module from another origin failing is a product signal, not the bench'
  )
})

test('a render error the story throws is a product FAIL, even when it quotes a bundle phrase', () => {
  const crashed = (events) => ({
    visits: { 1440: { state: 'error', errorText: "Error: Cannot find module 'x'\n    at Story", events } }
  })
  const own = evaluate('console-network', '1440', crashed([]), {})
  assert.equal(own.kind, 'checked')
  assert.equal(own.result.ok, false)
  assert.match(own.result.violations[0].message, /story failed to render/)
  assert.match(
    evaluate('overflow', '390', { visits: { 390: crashed([]).visits[1440] } }, {}).reason,
    /^STORY_RENDER_ERROR/
  )
  const fiveHundred = {
    type: 'response',
    status: 500,
    url: 'http://x/src/a.tsx',
    text: 'Internal Server Error'
  }
  const named = {
    visits: {
      1440: {
        state: 'error',
        errorText: 'Failed to load url /src/a.tsx (resolved id: /src/a.tsx)',
        events: [fiveHundred],
        benchOrigin: 'http://x'
      }
    }
  }
  assert.match(evaluate('console-network', '1440', named, {}).reason, /^BUNDLE_FAILURE/)
  const unrelated = { visits: { 1440: { ...crashed([fiveHundred]).visits[1440], benchOrigin: 'http://x' } } }
  assert.equal(
    evaluate('console-network', '1440', unrelated, {}).kind,
    'checked',
    'a 5xx module the render error does not name is not proof the bench failed'
  )
})
