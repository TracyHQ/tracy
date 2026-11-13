// The build chat's scenario runner (#604): every stage of `../fixtures/build-chat/stages.mjs` is fed to dsh's real
// chat components (fixture `fixtures/build-chat-conversation.tsx`, a stub runtime kit, no dsh host), and its checks
// read the visible text and the actions on offer, at a phone width and a desktop width, with the light and the dark
// theme set.
//
// LIMIT: like the other plugin e2e tests, the bundle drops CSS, so this proves content and actions, not the look.
// The look is checked on a real local stack by a separate pass.
//
// Adding a stage (#605 to #608): add it to `STAGES` in `stages.mjs`, then one entry `'<name>': async (chat) => {...}`
// in `CHECKS` below. A stage without checks fails, so no stage is drawn unchecked.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { RESEARCH, SCENARIOS, STAGES } from '../fixtures/build-chat/stages.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../../../../..')
const require = createRequire(import.meta.url)
const fromAskForm = { paths: [path.join(root, 'packages/ui/tracy-ask-form')] }
const playwright = await import(
  pathToFileURL(require.resolve('playwright', { paths: [path.join(root, 'apps/tracy-host')] })).href
)
const chromium = playwright.chromium ?? playwright.default?.chromium

const VIEWPORTS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 800 }
]
const THEMES = ['light', 'dark']

/** What the chat has received at one stage, as the fixture reads it. */
function stageView(stage) {
  const scenario = SCENARIOS[stage.from]
  const asked = stage.take.questions === true || stage.take.plan === true
  return {
    name: stage.name,
    research: RESEARCH,
    questions: asked ? scenario.questions : [],
    answers: stage.take.plan === true ? scenario.answers : []
  }
}

/** Helpers each check gets: the page, and readers of what the owner sees and can press. */
function chatOf(page) {
  return {
    page,
    text: () => page.locator('#root').innerText(),
    button: (name) => page.getByRole('button', { name, exact: true }),
    sent: () => page.evaluate(() => window.probe.get().sent)
  }
}

/** The research line collapsed: one row, its title and summary, nothing it read yet. */
async function researchCollapsed(chat) {
  const text = await chat.text()
  assert.match(text, /Read 3 sources/)
  assert.match(text, /4 services, 38 photos, 6 reviews/)
  assert.doesNotMatch(text, /Google Maps/, 'the sources stay folded until asked for')
}

/** The answers given stay in the conversation as one reply. */
async function answersKept(chat) {
  const text = await chat.text()
  assert.match(text, /Book a court, 04 000 0000/)
  assert.equal(await chat.button('Submit').count(), 0, 'no question is asked again')
}

const CHECKS = {
  research: async (chat) => {
    await researchCollapsed(chat)
    const row = chat.page.getByRole('button', { name: /Read 3 sources/ })
    await row.click()
    const open = await chat.text()
    for (const source of ['Website', 'Instagram', 'Google Maps']) assert.match(open, new RegExp(source))
    assert.match(open, /Address: 12 Court Lane, Harbour District/)
    await row.click()
    await researchCollapsed(chat)
  },
  questions: async (chat) => {
    await researchCollapsed(chat)
    const text = await chat.text()
    assert.match(text, /What should visitors do first on your site\?/)
    assert.doesNotMatch(text, /Which is correct\?/, 'one question at a time')
    for (const label of ['Book a court', 'Call', 'WhatsApp', 'Send a form'])
      assert.match(text, new RegExp(label))
    assert.equal(await chat.page.locator('textarea').count(), 1, 'a free text answer is offered')
    assert.match(text, /1 \/ 2/)
    await chat.page.getByText('Book a court', { exact: true }).click()
    // dsh's card moves to the next question once a single choice is picked.
    await chat.page.waitForFunction(() => /2 \/ 2/.test(document.body.innerText))
    const second = await chat.text()
    assert.match(second, /Two sources show different phone numbers\. Which is correct\?/)
    assert.doesNotMatch(second, /What should visitors do first/)
    await chat.page.locator('textarea').fill('04 000 0001')
    await chat.button('Submit').click()
    await chat.page.waitForFunction(() => window.probe.get().sent.length === 2)
    assert.deepEqual(await chat.sent(), [
      { schema: 'tracy-build-answer/v1', question: 'main-button', choice: 'book' },
      { schema: 'tracy-build-answer/v1', question: 'phone', text: '04 000 0001' }
    ])
    await chat.page.waitForFunction(() => /Book a court, 04 000 0001/.test(document.body.innerText))
    assert.equal(await chat.button('Submit').count(), 0, 'the card is gone, the answer stays')
  },
  'template-choice': answersKept,
  'plan-edit-undo': answersKept,
  building: answersKept,
  done: answersKept,
  'could-not-finish': async (chat) => {
    await researchCollapsed(chat)
    assert.equal(await chat.button('Submit').count(), 0)
  },
  rebuild: answersKept
}

test('every stage has its checks', () => {
  assert.deepEqual(
    STAGES.map((s) => s.name).filter((name) => CHECKS[name] === undefined),
    []
  )
})

test('build chat stages: visible result and actions at phone and desktop width, light and dark', async (t) => {
  const result = await build({
    stdin: {
      contents: readFileSync(path.join(here, 'fixtures/build-chat-conversation.tsx'), 'utf8'),
      resolveDir: path.join(here, 'fixtures'),
      loader: 'tsx'
    },
    bundle: true,
    format: 'iife',
    write: false,
    // CSS modules need an output path to name their classes; nothing is written (`write: false`) and the CSS is
    // not loaded into the page.
    outdir: path.join(here, 'out'),
    jsx: 'automatic',
    logLevel: 'silent',
    loader: { '.css': 'empty', '.module.css': 'local-css' },
    alias: {
      react: path.dirname(require.resolve('react/package.json', fromAskForm)),
      'react-dom': path.dirname(require.resolve('react-dom/package.json', fromAskForm))
    }
  })
  const bundle = result.outputFiles.find((f) => f.path.endsWith('.js'))?.text
  const browser = await chromium
    .launch({ channel: 'chrome', args: ['--disable-features=MacAppCodeSignClone'] })
    .catch(() => chromium.launch({ args: ['--disable-features=MacAppCodeSignClone'] }))
  try {
    for (const viewport of VIEWPORTS) {
      for (const theme of THEMES) {
        const page = await browser.newPage({ viewport })
        page.setDefaultTimeout(5000)
        const errors = []
        page.on('pageerror', (e) => errors.push(e.message))
        const dark = theme === 'dark' ? ' class="dark" data-ds-dark-theme=""' : ''
        // A served origin, not about:blank: dsh's question drafts read localStorage.
        const html = `<!doctype html><html data-theme="${theme}"${dark}><body><div id="root"></div></body></html>`
        await page.route('http://build-chat.test/**', (route) =>
          route.fulfill({ status: 200, contentType: 'text/html', body: html })
        )
        await page.goto('http://build-chat.test/')
        await page.addScriptTag({ content: bundle })
        for (const stage of STAGES) {
          await t.test(`${stage.name} at ${viewport.name} width, ${theme}`, async () => {
            errors.length = 0
            await page.evaluate((view) => window.probe.mount(view), stageView(stage))
            await page.waitForSelector(`[data-stage="${stage.name}"]`).catch((error) => {
              throw new Error(`${stage.name} did not draw: ${errors.join(' | ') || error.message}`)
            })
            await CHECKS[stage.name](chatOf(page))
            assert.deepEqual(errors, [])
          })
        }
        await page.close()
      }
    }
  } finally {
    await browser.close()
  }
})
