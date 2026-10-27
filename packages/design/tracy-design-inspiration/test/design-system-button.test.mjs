// The site browser toolbar's Design system button, Tracy's half, and the tab's door helpers (plan
// tasks/ke-hoach-nut-design-system.md): what the button says and when, what a press opens, which
// library rows are offered, when Apply is pressable and with which reason, and the words for each
// refusal.
//
//   node --test packages/design/tracy-design-inspiration/test/design-system-button.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  DS_TOOLBAR_PRESS_EVENT,
  DS_TOOLBAR_SWITCH,
  watchDesignSystemToolbar
} from '../src/client/design-system-toolbar.mjs'
import {
  applyDesignSystem,
  applyStateOf,
  closesLibrary,
  messageKeyOf,
  previewFromWords,
  readDesignSystem,
  readSiteWords,
  undoDesignSystem,
  unsupportedKeyOf,
  wordsLineKeyOf
} from '../src/client/design-system-door.mjs'
import { planFill } from '../src/client/fill.mjs'
import { en } from '../src/client/strings.ts'
import catalogue from '../../../core/tracy-core/src/ui-switches/catalogue.json' with { type: 'json' }

function wired({ siteKey = 'acme.localhost', shown = true } = {}) {
  const target = new EventTarget()
  const states = []
  target.addEventListener('tracy:design-system-toolbar-state', (e) => states.push(e.detail))
  const opened = []
  const stop = watchDesignSystemToolbar({
    siteKey,
    target,
    isShown: () => shown,
    open: (key, session) => opened.push([key, session])
  })
  const press = (key, sessionId = 's1') =>
    target.dispatchEvent(new CustomEvent(DS_TOOLBAR_PRESS_EVENT, { detail: { siteKey: key, sessionId } }))
  return { states, opened, stop, press }
}

test("a press for the page's site opens its tab; a press for another site opens nothing", () => {
  const w = wired()
  w.press('acme.localhost')
  w.press('other.localhost')
  assert.deepEqual(w.opened, [['acme.localhost', 's1']])
  w.stop()
  w.press('acme.localhost')
  assert.equal(w.opened.length, 1, 'leaving stops listening')
})

test('the toolbar is never told to draw a Design system button (Akemi, 12/10/2026)', () => {
  const w = wired()
  w.press('acme.localhost')
  w.stop()
  assert.deepEqual(w.states, [])
})

test("the operator's switch off: a press opens nothing", () => {
  const w = wired({ shown: false })
  w.press('acme.localhost')
  assert.deepEqual(w.opened, [])
})

test("a page that is not a site's listens to nothing", () => {
  const w = wired({ siteKey: null })
  w.press('acme.localhost')
  assert.deepEqual(w.opened, [])
})

test('the switch is in the catalogue, on by default, and governs the tab type', () => {
  const sw = catalogue.switches.find((s) => s.id === DS_TOOLBAR_SWITCH)
  assert.ok(sw)
  assert.equal(sw.defaultOn, true)
  assert.deepEqual(sw.tabs, ['tracy:design-system'])
  assert.ok(catalogue.groups.some((g) => g.id === sw.group))
})

test('Apply is pressable only for an editor, on a template that can wear it, with a new pick', () => {
  const read = { canApply: true, supported: true, worn: { id: 'stripe' } }
  assert.deepEqual(applyStateOf({ read: null, picked: 'x', busy: false }), {
    enabled: false,
    reasonKey: null
  })
  assert.deepEqual(applyStateOf({ read: { ...read, canApply: false }, picked: 'x', busy: false }), {
    enabled: false,
    reasonKey: 'ds.viewer'
  })
  assert.deepEqual(
    applyStateOf({
      read: { ...read, supported: false, reason: 'TEMPLATE_NOT_READY' },
      picked: 'x',
      busy: false
    }),
    {
      enabled: false,
      reasonKey: 'ds.unsupported.TEMPLATE_NOT_READY'
    }
  )
  assert.deepEqual(applyStateOf({ read, picked: null, busy: false }), {
    enabled: false,
    reasonKey: 'ds.pick'
  })
  assert.deepEqual(applyStateOf({ read, picked: 'stripe', busy: false }), {
    enabled: false,
    reasonKey: 'ds.alreadyWorn'
  })
  assert.deepEqual(applyStateOf({ read, picked: 'linear-app', busy: true }), {
    enabled: false,
    reasonKey: null
  })
  assert.deepEqual(applyStateOf({ read, picked: 'linear-app', busy: false }), {
    enabled: true,
    reasonKey: null
  })
})

test('every key the tab can compute has English words', () => {
  for (const code of [
    'SITE_BUSY',
    'DS_CHANGED_SINCE',
    'DS_NOT_LATEST',
    'DS_UNDO_USED',
    'TOOLSET_NOT_GRANTED',
    'NETWORK',
    'WHATEVER'
  ])
    assert.ok(messageKeyOf(code) in en, code)
  for (const reason of [
    'TEMPLATE_HAS_NO_SLOT',
    'TEMPLATE_NOT_READY',
    'NO_TEMPLATE',
    'PLATFORM_HAS_NO_SLOT',
    'SITE_IMPORTED',
    undefined
  ])
    assert.ok(unsupportedKeyOf(reason) in en, String(reason))
  for (const key of ['ds.viewer', 'ds.pick', 'ds.alreadyWorn']) assert.ok(key in en)
})

test('an imported site closes the whole tab with its own line; any other read keeps the library', () => {
  const imported = { supported: false, reason: 'SITE_IMPORTED', imported: true, locked: true, canApply: true }
  assert.equal(closesLibrary(imported), true)
  assert.equal(unsupportedKeyOf(imported.reason), 'ds.unsupported.SITE_IMPORTED')
  assert.equal(applyStateOf({ read: imported, picked: 'x', busy: false }).enabled, false)
  assert.equal(closesLibrary({ supported: false, reason: 'TEMPLATE_NOT_READY', locked: true }), false)
  assert.equal(closesLibrary({ supported: true }), false)
  assert.equal(closesLibrary(null), false)
})

test('the door helpers call tracy-web root-absolute with the cookie, and pass refusals through by code', async () => {
  const calls = []
  const fake = async (url, init) => {
    calls.push([url, init?.method ?? 'GET', init?.credentials, init?.body ?? null])
    if (url.endsWith('/undo'))
      return new Response(JSON.stringify({ code: 'DS_CHANGED_SINCE' }), { status: 409 })
    return new Response(JSON.stringify({ ok: true, worn: null }), { status: 200 })
  }
  assert.deepEqual(await readDesignSystem('a.localhost', fake), { ok: true, body: { ok: true, worn: null } })
  assert.equal((await applyDesignSystem('a.localhost', 'stripe', null, fake)).ok, true)
  // With the template the read answered: the door writes without reading the site first.
  assert.equal((await applyDesignSystem('a.localhost', 'stripe', 'wordpress/tracy-base', fake)).ok, true)
  assert.deepEqual(await undoDesignSystem('a.localhost', 'abcdefabcdef', fake), {
    ok: false,
    code: 'DS_CHANGED_SINCE',
    status: 409
  })
  assert.deepEqual(calls, [
    ['/api/sites/a.localhost/design-system', 'GET', 'same-origin', null],
    ['/api/sites/a.localhost/design-system', 'POST', 'same-origin', '{"id":"stripe"}'],
    [
      '/api/sites/a.localhost/design-system',
      'POST',
      'same-origin',
      '{"id":"stripe","template":"wordpress/tracy-base"}'
    ],
    ['/api/sites/a.localhost/design-system/undo', 'POST', 'same-origin', '{"applyId":"abcdefabcdef"}']
  ])
  assert.deepEqual(
    await readDesignSystem('a', async () => {
      throw new Error('down')
    }),
    { ok: false, code: 'NETWORK', status: 0 }
  )
})

test('a template release outside its contract: Try on off, and nothing said for it (Akemi, 12/10/2026)', async () => {
  const { isVersionReason } = await import('../src/client/design-system-door.mjs')
  for (const reason of ['TEMPLATE_NEEDS_UPDATE', 'TEMPLATE_VERSION_UNCHECKED', 'TEMPLATE_VERSION_UNKNOWN']) {
    const read = { canApply: true, supported: false, reason, worn: null }
    assert.equal(isVersionReason(reason), true, reason)
    assert.deepEqual(
      applyStateOf({ read, picked: 'stripe', busy: false }),
      { enabled: false, reasonKey: null },
      reason
    )
  }
  for (const reason of ['TEMPLATE_HAS_NO_SLOT', 'NO_TEMPLATE', undefined])
    assert.equal(isVersionReason(reason), false, String(reason))
  // A viewer is still told why.
  const viewer = { canApply: false, supported: false, reason: 'TEMPLATE_NEEDS_UPDATE', worn: null }
  assert.equal(applyStateOf({ read: viewer, picked: 'stripe', busy: false }).reasonKey, 'ds.viewer')
  for (const key of [
    'ds.unsupported.TEMPLATE_NEEDS_UPDATE',
    'ds.unsupported.TEMPLATE_VERSION_UNCHECKED',
    'ds.unsupported.TEMPLATE_VERSION_UNKNOWN',
    'ds.version',
    'ds.version.noRelease',
    'ds.version.upTo'
  ])
    assert.equal(key in en, false, key)
})

// ── the cards' words (walkthrough 11/10/2026, bug 7) ──

test("the cards wear the site's own words read off its home page, and say whose words they are", async () => {
  const calls = []
  const words = {
    name: 'Northgate',
    nav: ['About', 'Services', ''],
    eyebrow: null,
    headline: 'Building the groundwork for next-generation plants',
    sub: 'Design–build main contractor.',
    cta: 'Request a quote',
    cta2: null
  }
  const fake = async (url, init) => {
    calls.push([url, init?.credentials])
    return new Response(JSON.stringify({ present: true, source: 'home', site: words }), { status: 200 })
  }
  const read = await readSiteWords('a.localhost', fake)
  assert.deepEqual(calls, [['/api/sites/a.localhost/design-system/words', 'same-origin']])
  const site = previewFromWords(read)
  assert.deepEqual(site, {
    site: {
      name: 'Northgate',
      url: '',
      nav: ['About', 'Services'],
      eyebrow: null,
      headline: 'Building the groundwork for next-generation plants',
      sub: 'Design–build main contractor.',
      cta: 'Request a quote',
      cta2: null,
      image: null
    },
    pages: [{ path: '/', type: 'home', label: 'Home', data: {} }]
  })
  // The fill puts those words in the card's slots; a word the page did not give stays the system's own.
  const fill = planFill(
    [
      { id: 'b', role: 'brand', words: 1 },
      { id: 'h', role: 'headline', words: 8 },
      { id: 'c', role: 'button', words: 3 },
      { id: 'c2', role: 'button', words: 3 },
      { id: 'e', role: 'eyebrow', words: 2 }
    ],
    { ...site, page: site.pages[0] }
  )
  assert.deepEqual(
    fill.map((f) => [f.id, f.text]),
    [
      ['b', 'Northgate'],
      ['h', 'Building the groundwork for next-generation plants'],
      ['c', 'Request a quote']
    ]
  )
  for (const source of ['file', 'page', 'reading', 'sample']) assert.ok(wordsLineKeyOf(source) in en, source)
})

test('nothing read, a refusal or no connection: no words, and the cards keep the sample text', async () => {
  const answer = (status, body) => async () => new Response(JSON.stringify(body), { status })
  assert.equal(await readSiteWords('a', answer(200, { present: false })), null)
  assert.equal(await readSiteWords('a', answer(403, { code: 'FORBIDDEN' })), null)
  assert.equal(
    await readSiteWords('a', async () => {
      throw new Error('down')
    }),
    null
  )
  assert.equal(previewFromWords(null), null)
  assert.equal(previewFromWords({ name: '  ', nav: [], headline: null }), null)
})
