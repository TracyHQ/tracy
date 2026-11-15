// The `sheets` door of a draft write on a real site (#597, `step-chain-draft-sheets.js`): an invented template served by a
// fake fetch, read through the app's wiring (`siteWriteOf`, `draftTemplateSheets`) and the release gate's reader
// (`originReader`), into the accent the write builds (`accentHtmlOf`). Its plain page opens dark, as a measured template
// does; each theme links a sheet of its own. Bounds and failures are typed stops.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/step-chain-draft-sheets.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  draftTemplateSheets,
  originReader,
  SHEETS_UNREADABLE,
  templateSheetsDoor
} from '../src/step-chain-draft-sheets.js'
import { siteWriteOf } from '../src/step-chain-draft-site.js'
import { accentHtmlOf, templateAccentOf } from '../src/step-chain-draft-write-accent.js'

const BASE = 'https://harbor-kiln.example/'
const ACCENT = '#2b6cb0'
const VARS = ['--kiln-accent', '--kiln-link']
const SHEETS = {
  '/templates/kiln/css/template.css': `:root{--kiln-accent:${ACCENT};--kiln-link:${ACCENT};--kiln-ground:#fdfaf5}
a{color:var(--kiln-link)}.btn{background:var(--kiln-accent);color:#fff}
:has(> body.dark-active) a{color:#90cdf4}`,
  '/templates/kiln/css/light.css': `.hero .btn{border-color:${ACCENT}}`,
  '/templates/kiln/css/dark.css': ':has(> body.dark-active) .hero{background:#0f1720}',
  '/templates/kiln/css/workshop.css': `.workshop .tag{color:${ACCENT}}`
}
const link = (href) => `<link rel="stylesheet" href="${href}">`
/** The invented template's pages: a page with no theme opens dark. */
function page(url) {
  const theme = url.searchParams.get('theme') ?? 'dark'
  const sheet = theme === 'dark' ? 'dark.css' : 'light.css'
  const extra = url.pathname === '/index.php/workshop' ? link('/templates/kiln/css/workshop.css') : ''
  return `<html><head>${link('/templates/kiln/css/template.css?v=3')}${link(`/templates/kiln/css/${sheet}`)}${extra}
${link('https://cdn.elsewhere.example/font.css')}</head><body class="${theme === 'dark' ? 'dark-active' : ''}"></body></html>`
}

/** A fake fetch over the invented site; `asked` keeps every URL asked. */
function fakeFetch({ asked = [], big = null } = {}) {
  return async (url) => {
    const u = new URL(url)
    asked.push(u.href)
    if (u.origin !== new URL(BASE).origin) return new Response('', { status: 404 })
    if (big && u.pathname === big) return new Response('a{}'.repeat(2_000), { status: 200 })
    if (SHEETS[u.pathname]) return new Response(SHEETS[u.pathname], { status: 200 })
    if (u.pathname === '/index.php' || u.pathname === '/' || u.pathname === '/index.php/workshop')
      return new Response(page(u), { status: 200 })
    return new Response('', { status: 404 })
  }
}
const INSPECT = { ok: true, revision: 'r1', pages: [{ route: 'home' }, { route: 'workshop' }] }
const op = {
  key: 'accent',
  variables: VARS,
  tones: { light: '#a0522d', dark: '#e0a37a' },
  sides: { opensOn: 'dark', darkHook: ':has(> body.dark-active)' }
}
const stopOf = (promise) =>
  promise.then(
    () => null,
    (e) => e
  )

test('the real wiring gives the write a sheets door, and its answer builds the accent end to end', async () => {
  const asked = []
  const reader = async () => originReader({ base: BASE, fetchImpl: fakeFetch({ asked }) })
  const sent = []
  const site = {
    siteDoors: async ({ send }) => ({
      inspect: async () => ({ revision: (await send('inspect')).revision })
    }),
    templateSheets: draftTemplateSheets({ siteReader: reader })
  }
  const apply = async (call) => {
    sent.push(call)
    return { ok: true, ...INSPECT }
  }
  const wiring = siteWriteOf(
    { site },
    { siteKey: 'site-kiln-1', runId: 'r' },
    { door: { apply } },
    {},
    new Map()
  )
  const doors = await wiring.doors({ siteKey: 'site-kiln-1', runId: 'r' })
  assert.equal(typeof doors.sheets, 'function')
  const sheets = await doors.sheets({ variables: VARS })
  // Every theme's and every listed page's sheet, each once; nothing off the site's origin.
  assert.deepEqual(new Set(sheets), new Set(Object.values(SHEETS)))
  assert.equal(sheets.length, 4)
  assert.ok(!asked.some((u) => u.includes('elsewhere')))
  assert.ok(asked.some((u) => u.endsWith('theme=light')) && asked.some((u) => u.endsWith('theme=dark')))
  assert.ok(sent.some((c) => c.action === 'content.contract' && c.params?.operation === 'inspect'))
  assert.equal(templateAccentOf(sheets, VARS), ACCENT)
  const html = await accentHtmlOf(op, { doors })
  assert.match(html, /--tracy-accent:#a0522d/)
  assert.ok(html.includes(':root:has(> body.dark-active){--tracy-accent:#e0a37a'), html.slice(0, 400))
})

test('a template whose plain page opens dark still gives its light sheet: each theme is asked by name', async () => {
  const door = templateSheetsDoor({ reader: originReader({ base: BASE, fetchImpl: fakeFetch() }) })
  const sheets = await door({ variables: VARS })
  assert.ok(sheets.includes(SHEETS['/templates/kiln/css/light.css']))
  assert.ok(sheets.includes(SHEETS['/templates/kiln/css/dark.css']))
  assert.equal(templateAccentOf(sheets, VARS), ACCENT)
})

test('bounds: pages read, one answer, all answers and the deadline stop typed', async () => {
  const asked = []
  const pages = async () => ({ pages: Array.from({ length: 30 }, (_, i) => ({ route: `p${i}` })) })
  await templateSheetsDoor({ reader: originReader({ base: BASE, fetchImpl: fakeFetch({ asked }) }), pages })()
  const pageAsks = asked.filter((u) => !u.endsWith('.css') && !u.includes('.css?'))
  assert.equal(pageAsks.length, 12)

  const big = templateSheetsDoor({
    reader: originReader({ base: BASE, fetchImpl: fakeFetch({ big: '/templates/kiln/css/dark.css' }) }),
    limits: { answerBytes: 5_000 }
  })
  const e1 = await stopOf(big())
  assert.equal(e1.code, SHEETS_UNREADABLE)
  assert.equal(e1.details.reason, 'answer_too_large')
  assert.equal(e1.noRerun, true)

  const all = templateSheetsDoor({
    reader: originReader({ base: BASE, fetchImpl: fakeFetch() }),
    limits: { totalBytes: 300 }
  })
  assert.equal((await stopOf(all())).details.reason, 'sheets_too_large')

  let t = 0
  const slow = templateSheetsDoor({
    reader: originReader({ base: BASE, fetchImpl: fakeFetch() }),
    limits: { deadlineMs: 2 },
    now: () => t++
  })
  assert.equal((await stopOf(slow())).details.reason, 'deadline')
})

test('a site that does not answer, links no sheet, or gives no page list stops typed, never an empty answer', async () => {
  const down = templateSheetsDoor({
    reader: originReader({ base: BASE, fetchImpl: async () => new Response('', { status: 503 }) })
  })
  const e = await stopOf(down())
  assert.equal(e.code, SHEETS_UNREADABLE)
  assert.equal(e.details.reason, 'no_page')
  assert.equal(e.details.door, 'sheets')

  const bare = templateSheetsDoor({
    reader: originReader({
      base: BASE,
      fetchImpl: async () => new Response('<html></html>', { status: 200 })
    })
  })
  assert.equal((await stopOf(bare())).details.reason, 'no_sheet')

  const noList = templateSheetsDoor({
    reader: originReader({ base: BASE, fetchImpl: fakeFetch() }),
    pages: async () => {
      throw Object.assign(new Error('refused'), { code: 'FORBIDDEN' })
    }
  })
  assert.equal((await stopOf(noList())).details.reason, 'page_list')

  const noSite = draftTemplateSheets({ siteReader: async () => null })
  assert.equal((await stopOf(noSite('site-missing', {}))).details.reason, 'no_page')
})

test('the gate reader asks only its own origin and follows no redirect', async () => {
  const calls = []
  const reader = originReader({
    base: BASE,
    fetchImpl: async (url, init) => {
      calls.push(init.redirect)
      return new Response('', { status: 302, headers: { location: 'http://internal.example/' } })
    }
  })
  await assert.rejects(reader.text('https://other.example/x.css'), /not the site's address/)
  await assert.rejects(reader.text(`${BASE}index.php`), /answered/)
  assert.deepEqual(calls, ['manual'])
})
