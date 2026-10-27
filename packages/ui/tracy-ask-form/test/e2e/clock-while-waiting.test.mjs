/**
 * dsh's running clock is not drawn while a question waits in the conversation (Akemi, 21/10/2026).
 *
 * Measured on dev: with a question waiting, "Thinking for 1m 33s" kept counting under dsh's "Waiting
 * for your action" and above this plugin's pointer card, three lines saying one thing while Tracy did
 * nothing. Pinned here, in a real browser, with this plugin's real stylesheet (Tailwind run on
 * ask-form.css as the build runs it): in a conversation that shows the pointer card the clock is not
 * displayed; in one without it, or once the card goes, the clock is back.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.join(here, '..', '..')
const repoRoot = path.resolve(pkgRoot, '..', '..', '..')
const hostPkg = path.join(repoRoot, 'apps/tracy-host')
const require = createRequire(import.meta.url)
const playwright = await import(pathToFileURL(require.resolve('playwright', { paths: [hostPkg] })).href)
const chromium = playwright.chromium ?? playwright.default?.chromium

let outDir = ''
let sheet = ''
let browser

before(async () => {
  outDir = mkdtempSync(path.join(tmpdir(), 'tracy-ask-clock-'))
  const css = path.join(outDir, 'ask-form.css')
  execFileSync(
    process.execPath,
    [
      path.join(pkgRoot, 'node_modules/@tailwindcss/cli/dist/index.mjs'),
      '--input',
      path.join(pkgRoot, 'src/client/ask-form.css'),
      '--output',
      css
    ],
    { cwd: pkgRoot, stdio: ['ignore', 'ignore', 'inherit'] }
  )
  sheet = readFileSync(css, 'utf8')
  // System Chrome on a dev machine; the bundled Chromium on CI runners, which have no Chrome.
  browser = await chromium
    .launch({ channel: 'chrome', args: ['--disable-features=MacAppCodeSignClone'] })
    .catch(() => chromium.launch({ args: ['--disable-features=MacAppCodeSignClone'] }))
})

after(async () => {
  await browser?.close()
  if (outDir) rmSync(outDir, { recursive: true, force: true })
})

/** dsh's conversation body: transcript with the running clock, and the composer seat. */
const conversation = (id, pointer) => `
  <div data-conversation-scroll id="${id}">
    <div data-slot="conversation.view"><div data-chat-running>Thinking for 1m 33s</div></div>
    <div data-composer-seat>${pointer ? '<div class="tracy-ask-form"><div data-tracy-ask-pointer>One question is waiting</div></div>' : ''}</div>
  </div>`

test('the clock hides in the conversation whose question waits, and comes back when it goes', async () => {
  const page = await browser.newPage()
  try {
    await page.setContent(`<!doctype html><html><head><style>${sheet}</style></head><body>
      ${conversation('waiting', true)}${conversation('working', false)}</body></html>`)
    const shown = () =>
      page.evaluate(() =>
        Object.fromEntries(
          [...document.querySelectorAll('[data-conversation-scroll]')].map((c) => [
            c.id,
            getComputedStyle(c.querySelector('[data-chat-running]')).display !== 'none'
          ])
        )
      )
    assert.deepEqual(await shown(), { waiting: false, working: true })
    // Answered: the pointer card goes and the clock is drawn again.
    await page.evaluate(() =>
      document.querySelector('[data-tracy-ask-pointer]').closest('.tracy-ask-form').remove()
    )
    assert.deepEqual(await shown(), { waiting: true, working: true })
  } finally {
    await page.close()
  }
})
