// The move of a done build chat to the new site (#611), through the build chat plugin's REAL registration path
// (`apply` of `@tracy/dsh-build-chat`, the same stand in for dsh as `build-chat-plugin.test.mjs`):
//
// - a build session whose run is done asks the hand off door once, with the conversation as it was said, and the page
//   moves to the address it answers with no click: the site's workspace, on the chat made ahead, Browser tab open;
// - a stopped or cancelled run asks nothing and the page stays;
// - the site chat's first message, as tracy-web writes it (`apps/tracy-web/src/build-draft/handoff.js`), draws every
//   earlier message and the living plan card, its raw block folded into one chip; the owner's next message follows.
//
// No model key: recorded shapes with invented data. Screenshots go to $HANDOFF_SHOTS when it is set.
//
//   node --test --test-concurrency=1 packages/core/tracy-core/test/e2e/build-chat-handoff.test.mjs
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { handoffMessageOf } from '../../../../../apps/tracy-web/src/build-draft/handoff.js'
import { STAGES, stageDocuments } from '../fixtures/build-chat/stages.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../../../../..')
const require = createRequire(import.meta.url)
const fromAskForm = { paths: [path.join(root, 'packages/ui/tracy-ask-form')] }
const playwright = await import(
  pathToFileURL(require.resolve('playwright', { paths: [path.join(root, 'apps/tracy-host')] })).href
)
const chromium = playwright.chromium ?? playwright.default?.chromium

const BUILD = 'session-build-0f1e2d3c-4b5a-4968-8778-695a4b3c2d1e'
const SITE_CHAT = 'session-5c4b3a29-1807-4f6e-9d5c-4b3a29180706'
const SITE = 'sunrise-tennis.localhost'
const NEXT = `/${SITE}/s/${SITE_CHAT}?open=browser&page=%2F`
const stage = (name) => stageDocuments(STAGES.find((s) => s.name === name)).scenario
const PLAN = stage('plan').plan
const NAME = 'Sunrise Tennis Club'
const SHOTS = process.env.HANDOFF_SHOTS ?? null

const CONVERSATION = [
  { role: 'user', text: 'Build a website for my tennis club. https://sunrise-tennis.example' },
  { role: 'assistant', text: 'I found 4 services, 38 photos and 6 reviews. Two quick questions.' },
  { role: 'user', text: 'Make the tagline shorter.' },
  { role: 'assistant', text: 'Here is the plan. Click any value to change it, then approve.' }
]

let seq = 0
const turnStart = (turn) => ({ type: 'turn/start', seq: ++seq, data: { turn } })
const turnEnd = (turn) => ({ type: 'turn/end', seq: ++seq, data: { turn, reason: 'completed' } })
const user = (text) => ({
  type: 'user/message',
  seq: ++seq,
  surfaceOp: 'append',
  data: { role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text }] }
})
const assistant = (turn, text) => ({
  type: 'assistant/message',
  seq: ++seq,
  surfaceOp: 'append',
  data: { turn, step: 0, message: { role: 'assistant', content: [{ type: 'text', text }] } }
})

/** The build session: two turns of owner and agent messages; the build ran after the last one. */
function buildSession() {
  return [
    turnStart(0),
    user(CONVERSATION[0].text),
    assistant(0, CONVERSATION[1].text),
    turnEnd(0),
    turnStart(1),
    user(CONVERSATION[2].text),
    assistant(1, CONVERSATION[3].text),
    turnEnd(1)
  ]
}

/** The site session tracy-web opened ahead: its first message carries the hand off; the owner then asks a change. */
function siteSession() {
  return [
    turnStart(0),
    user(handoffMessageOf({ conversation: CONVERSATION, plan: PLAN, siteKey: SITE, name: NAME })),
    assistant(0, 'Your site is ready. The Browser tab shows it. Ask me here for any change.'),
    turnEnd(0),
    turnStart(1),
    user('Make the header blue.'),
    assistant(1, 'Done. The header is blue now.'),
    turnEnd(1)
  ]
}

const bundled = await build({
  stdin: {
    contents: readFileSync(path.join(here, 'fixtures/build-chat-plugin.tsx'), 'utf8'),
    resolveDir: path.join(here, 'fixtures'),
    loader: 'tsx'
  },
  bundle: true,
  format: 'iife',
  write: false,
  outdir: path.join(here, 'out'),
  jsx: 'automatic',
  logLevel: 'silent',
  loader: { '.css': 'empty', '.module.css': 'local-css' },
  alias: {
    react: path.dirname(require.resolve('react/package.json', fromAskForm)),
    'react-dom': path.dirname(require.resolve('react-dom/package.json', fromAskForm))
  }
})
const bundle = bundled.outputFiles.find((f) => f.path.endsWith('.js'))?.text
const styleDir = mkdtempSync(path.join(tmpdir(), 'build-chat-handoff-'))
after(() => rmSync(styleDir, { recursive: true, force: true }))
// The plugin's own styles, so a screenshot shows the look (the bundle drops CSS files; this is a string).
const { CSS } = await import(
  pathToFileURL(
    (await build({
      entryPoints: [path.join(root, 'packages/ui/tracy-build-chat/src/client/styles.ts')],
      bundle: true,
      format: 'esm',
      write: true,
      outfile: path.join(styleDir, 'build-chat-styles.mjs'),
      logLevel: 'silent'
    }),
    path.join(styleDir, 'build-chat-styles.mjs'))
  ).href
)
const TOKENS = readFileSync(path.join(root, 'packages/ui/tracy-ui/src/tokens.css'), 'utf8')

/** One page with the plugin applied; `run` is what the build door answers, `refuseHandoff` how often it refuses. */
async function open(browser, { viewport, theme = 'light', run = null, refuseHandoff = 0 }) {
  const page = await browser.newPage({ viewport })
  page.setDefaultTimeout(8000)
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  const dark = theme === 'dark' ? ' class="dark" data-ds-dark-theme=""' : ''
  const html = `<!doctype html><html data-theme="${theme}"${dark}><head><style>${TOKENS}</style></head><body style="background:var(--background);color:var(--foreground);font-family:system-ui;padding:16px"><div id="root"></div></body></html>`
  const asked = []
  let refusals = refuseHandoff
  await page.route('http://build-chat.test/**', (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const json = (value, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) })
    if (url.pathname === '/api/ui') return json({ hidden: [] })
    if (url.pathname === '/api/build-draft')
      return json({ draft: { id: 'draft-1', plan: PLAN, lastEdit: null, canUndo: false } })
    if (url.pathname === '/api/build-draft/build') return json({ build: null, run })
    if (url.pathname === '/api/build-draft/build/handoff') {
      asked.push(request.postDataJSON())
      if (refusals > 0) {
        refusals -= 1
        return json({ code: 'HANDOFF_SESSION_FAILED' }, 503)
      }
      return json({ next: NEXT })
    }
    return route.fulfill({ status: 200, contentType: 'text/html', body: html })
  })
  await page.goto('http://build-chat.test/new/s/' + BUILD)
  await page.addStyleTag({ content: CSS })
  await page.addScriptTag({ content: bundle })
  return { page, errors, asked }
}

const launch = () =>
  chromium
    .launch({ channel: 'chrome', args: ['--disable-features=MacAppCodeSignClone'] })
    .catch(() => chromium.launch({ args: ['--disable-features=MacAppCodeSignClone'] }))

const runOf = (name) => {
  const run = stage(name).runs.at(-1)
  return { events: run.events, outcome: run.outcome }
}

test('a done build moves the screen to the new site by itself, carrying the whole conversation', async () => {
  const browser = await launch()
  try {
    const done = runOf('done')
    assert.equal(done.outcome.result, 'done')
    // The first ask is refused (the site chat was not ready): asked again, then moved.
    const { page, errors, asked } = await open(browser, {
      viewport: { width: 1280, height: 800 },
      run: done,
      refuseHandoff: 1
    })
    const moved = page.waitForURL((url) => url.pathname === `/${SITE}/s/${SITE_CHAT}`, { timeout: 15000 })
    await page.evaluate(([id, events]) => window.probe.load(id, events), [BUILD, buildSession()])
    await moved
    const url = new URL(page.url())
    assert.equal(url.searchParams.get('open'), 'browser', 'the Browser tab opens on the live site')
    assert.equal(url.searchParams.get('page'), '/')
    assert.equal(asked.length, 2)
    assert.deepEqual(asked[1], { conversation: CONVERSATION }, 'every earlier message, in order')
    assert.deepEqual(errors, [])
  } finally {
    await browser.close()
  }
})

test('a stopped or cancelled build moves nothing and asks nothing', async () => {
  const browser = await launch()
  try {
    for (const name of ['could-not-finish', 'cancelled']) {
      const run = runOf(name)
      assert.notEqual(run.outcome.result, 'done')
      const { page, asked } = await open(browser, { viewport: { width: 1280, height: 800 }, run })
      await page.evaluate(([id, events]) => window.probe.load(id, events), [BUILD, buildSession()])
      await page.locator('[data-turn="1"]').waitFor()
      await page.waitForTimeout(800)
      await page.waitForTimeout(500)
      assert.equal(new URL(page.url()).pathname, `/new/s/${BUILD}`, name)
      assert.deepEqual(asked, [], name)
      await page.close()
    }
  } finally {
    await browser.close()
  }
})

test('the site chat shows every earlier message and the plan, the raw block as one chip, then the next change', async (t) => {
  const browser = await launch()
  try {
    for (const [viewport, theme] of [
      [{ name: 'desktop', width: 1280, height: 900 }, 'light'],
      [{ name: 'phone', width: 390, height: 844 }, 'dark']
    ])
      await t.test(`${viewport.name}, ${theme}`, async () => {
        const { page, errors } = await open(browser, { viewport, theme })
        await page.evaluate(([id, events]) => window.probe.load(id, events), [SITE_CHAT, siteSession()])
        const earlier = page.getByRole('region', { name: 'Earlier conversation' })
        await earlier.waitFor()
        const said = await earlier
          .locator('[data-role]')
          .evaluateAll((els) =>
            els.map((el) => ({ role: el.getAttribute('data-role'), text: el.textContent }))
          )
        assert.deepEqual(said, CONVERSATION)
        // The plan the build ran, as the one living plan card, inside the earlier conversation.
        assert.equal(await earlier.getByRole('article', { name: `${NAME} site plan` }).count(), 1)
        // The first message reads as one chip; no JSON reaches the screen.
        const first = page.locator('[data-turn="0"] [data-user-message]')
        assert.equal(await first.innerText(), 'Earlier conversation')
        const all = await page.locator('#root').innerText()
        assert.doesNotMatch(all, /tracy-build-handoff|"schema"|[{}]/)
        // The owner keeps typing in the same chat, and the agent answers there.
        assert.match(
          await page.locator('[data-turn="1"]').innerText(),
          /Make the header blue\.[\s\S]*header is blue/
        )
        assert.equal(await page.getByRole('region', { name: 'Earlier conversation' }).count(), 1)
        assert.deepEqual(errors, [])
        if (SHOTS) {
          mkdirSync(SHOTS, { recursive: true })
          await page.screenshot({
            path: path.join(SHOTS, `site-chat-${viewport.name}-${theme}.png`),
            fullPage: true
          })
        }
        await page.close()
      })
  } finally {
    await browser.close()
  }
})
