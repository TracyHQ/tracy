// The release gate's write on a real site has the `sheets` door (#597): an invented template served by a fake fetch,
// read through `gateDoors`, into the template's accent colour.
//
//   node --test --test-concurrency=1 scripts/test/ai-quickstart-gate-sheets-door.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { templateAccentOf } from '../../apps/tracy-web/src/step-chain-draft-write-accent.js'
import { gateDoors } from '../ai-quickstart/gate/site-write.mjs'

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

test('the release gate write on a real site has the sheets door too, over the same read', async () => {
  const sent = []
  const send = async (operation, payload) => {
    sent.push([operation, payload?.operation])
    return INSPECT
  }
  const doors = gateDoors({
    send,
    base: BASE,
    publicFile: async () => null,
    journal: undefined,
    fetchImpl: fakeFetch()
  })
  assert.equal(typeof doors.sheets, 'function')
  const sheets = await doors.sheets({ variables: VARS })
  assert.equal(sheets.length, 4)
  assert.equal(templateAccentOf(sheets, VARS), ACCENT)
  assert.deepEqual(sent, [['content.contract', 'inspect']])
})
