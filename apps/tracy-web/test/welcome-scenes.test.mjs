// The Welcome popup's scenes door (`src/welcome/route.js`): signed-in only, its own files and the
// library's design system cards, nothing else, framable by Tracy's own pages only.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { mintSession } from '../src/lib/session.js'
import { sceneFile, WELCOME_SCENES_PATH, welcomeSceneRoutes } from '../src/welcome/route.js'

const config = { sessionSecret: 's'.repeat(32) }
const app = welcomeSceneRoutes({ config })
const THUMBS = new URL('../../../packages/design/tracy-ds-slot/refero-thumbs/', import.meta.url)

async function get(path, { signedIn = true } = {}) {
  const headers = signedIn
    ? { cookie: `tracy_sess=${await mintSession('a@tracy.test', config.sessionSecret)}` }
    : {}
  return app.fetch(new Request(`http://tracy.test${path}`, { headers }))
}

test('the scenes are for a signed-in account only', async () => {
  const res = await get(`${WELCOME_SCENES_PATH}engine.html`, { signedIn: false })
  assert.equal(res.status, 401)
  assert.equal((await res.json()).code, 'NOT_SIGNED_IN')
})

test('a scene page answers with its own type and a policy only Tracy pages may frame', async () => {
  for (const [file, type] of [
    ['engine.html', 'text/html'],
    ['addsite/index.html', 'text/html'],
    ['js/hero-showcase.js', 'text/javascript'],
    ['css/hero-showcase.css', 'text/css'],
    ['sites/fernway/fonts/inter-variable.woff2', 'font/woff2']
  ]) {
    const res = await get(`${WELCOME_SCENES_PATH}${file}`)
    assert.equal(res.status, 200, file)
    assert.ok(res.headers.get('content-type').startsWith(type), file)
    assert.match(res.headers.get('content-security-policy'), /frame-ancestors 'self'/)
    assert.match(res.headers.get('content-security-policy'), /script-src 'self'(;|$)/)
    assert.equal(res.headers.get('cache-control'), 'private, max-age=3600')
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff')
  }
})

test('every file the two scene pages name is served', async () => {
  for (const page of ['engine.html', 'addsite/index.html']) {
    const html = readFileSync(new URL(`../src/welcome/scenes/${page}`, import.meta.url), 'utf8')
    const base = page.includes('/') ? 'addsite/' : ''
    for (const [, ref] of html.matchAll(/(?:src|href)="([^"#:]+)"/g)) {
      const target = new URL(ref, `http://x/${base}`).pathname.slice(1)
      const res = await get(`${WELCOME_SCENES_PATH}${target}`)
      assert.equal(res.status, 200, `${page} names ${ref}`)
    }
  }
})

test("a design system card is the library's own thumbnail, not a second copy", async () => {
  const uuid = readdirSync(THUMBS)
    .find((name) => name.endsWith('.webp'))
    .replace('.webp', '')
  const res = await get(`${WELCOME_SCENES_PATH}addsite/img/systems/${uuid}.webp`)
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('content-type'), 'image/webp')
  assert.deepEqual(Buffer.from(await res.arrayBuffer()), readFileSync(new URL(`${uuid}.webp`, THUMBS)))
  const unknown = await get(
    `${WELCOME_SCENES_PATH}addsite/img/systems/00000000-0000-0000-0000-000000000000.webp`
  )
  assert.equal(unknown.status, 404)
})

test('nothing outside the scenes, no hidden file and no other type is served', async () => {
  for (const path of [
    '../route.js',
    '%2e%2e/route.js',
    'addsite/../../route.js',
    '.hidden.js',
    'sites/fernway/fonts/LICENSES.txt',
    'route.js.map',
    'missing.html',
    'bad%E0%A4%A.js'
  ]) {
    const res = await get(`${WELCOME_SCENES_PATH}${path}`)
    assert.equal(res.status, 404, path)
  }
  assert.equal(await sceneFile('../route.js'), null)
  assert.equal(await sceneFile('a//b.js'), null)
})
