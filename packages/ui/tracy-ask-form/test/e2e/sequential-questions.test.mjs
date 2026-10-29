// Real AskTab and dsh answer channels: a new call must never inherit a settled form's busy lock.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../../../../..')
const require = createRequire(import.meta.url)
const playwright = await import(
  pathToFileURL(require.resolve('playwright', { paths: [path.join(root, 'apps/tracy-host')] })).href
)
const chromium = playwright.chromium ?? playwright.default?.chromium

test('sequential questions: a different question and an identical new call each render and deliver a fresh answer', async () => {
  const result = await build({
    stdin: {
      contents: readFileSync(path.join(here, 'fixtures/sequential-questions.tsx'), 'utf8'),
      resolveDir: path.join(here, 'fixtures'),
      loader: 'tsx'
    },
    bundle: true,
    format: 'iife',
    write: false,
    jsx: 'automatic',
    loader: { '.css': 'empty' },
    alias: {
      react: path.dirname(require.resolve('react/package.json')),
      'react-dom': path.dirname(require.resolve('react-dom/package.json'))
    }
  })
  const browser = await chromium
    .launch({ channel: 'chrome', args: ['--disable-features=MacAppCodeSignClone'] })
    .catch(() => chromium.launch({ args: ['--disable-features=MacAppCodeSignClone'] }))
  try {
    const page = await browser.newPage()
    page.setDefaultTimeout(5000)
    await page.setContent('<div id="root"></div>')
    await page.addScriptTag({ content: result.outputFiles[0].text })
    const ids = ['confirm-37aa26ee1f', 'confirm-83873a0c51', 'confirm-83873a0c51']
    for (const [i, id] of ids.entries()) {
      await page.evaluate((id) => window.probe.ask(id), id)
      const submit = page.getByRole('button', { name: 'Send answer', exact: true })
      await page.waitForFunction(
        () =>
          document.querySelector('[data-slot="radio-group-item"]')?.getAttribute('aria-checked') === 'false'
      )
      assert.equal(await submit.isDisabled(), true, 'no consent is carried from the preceding call')
      await page.getByText('Yes, go ahead', { exact: true }).click()
      await submit.click()
      await page.waitForFunction((n) => window.probe.get().results.length === n, i + 1)
      const state = await page.evaluate(() => window.probe.get())
      assert.equal(state.opened, i + 1)
      assert.deepEqual(state.results[i], { answers: [{ id, selected: ['Yes, go ahead'] }] })
    }
    // The browser settled locally, but its reply never reached the host. The same call is delivered again.
    await page.evaluate(() => window.probe.redeliver())
    const submit = page.getByRole('button', { name: 'Send answer', exact: true })
    await page.getByText('No, keep it', { exact: true }).click()
    await page.waitForFunction(
      () => ![...document.querySelectorAll('button')].find((b) => b.textContent === 'Send answer')?.disabled
    )
    await submit.click()
    await page.waitForFunction(() => window.probe.get().results.length === 4)
    const state = await page.evaluate(() => window.probe.get())
    assert.deepEqual(state.results[3], { answers: [{ id: ids[2], selected: ['No, keep it'] }] })
  } finally {
    await browser.close()
  }
})
