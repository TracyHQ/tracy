#!/usr/bin/env node
/**
 * Browser smoke test: the REAL add-site wizard renders the two flows whose logic is unit-tested in
 * `build-watch.test.mjs` and `import-watch.test.mjs` (#166, #362).
 *
 * The unit tests pin what the watchers decide; this pins only what they cannot — that the React
 * wiring shows it. Time is Playwright's fake page clock (`page.clock.runFor`), so nothing waits.
 *   - import in a site's workspace: the wizard leaves "Packing up your files" for its completion
 *     screen (#166), "Import another site" starts clean and hands over again, one provision each.
 *   - import in the creation workspace (#1664): the wizard is swapped for the build console, and the
 *     resume pointer is gone — whether the host filed the build, the wizard did, or a manual retry
 *     did — so the next Add site opens on a clean form instead of that build again.
 *   - a build that fails: the checklist keeps the host detail and output inside collapsed technical details, and is no
 *     longer shown as running.
 *
 * Dependencies come from where the repo declares them (esbuild here, playwright in apps/tracy-host,
 * react-dom in tracy-core); a missing dependency or a browser that will not launch FAILS the test —
 * there is no skip.
 */
import assert from 'node:assert/strict'
import { goToStep, submitCreate } from './wizard-navigation.mjs'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.join(here, '..', '..')
const repoRoot = path.resolve(pkgRoot, '..', '..', '..')
const hostPkg = path.join(repoRoot, 'apps/tracy-host')
const corePkg = path.join(repoRoot, 'packages/core/tracy-core')
const require = createRequire(import.meta.url)

const esbuild = require('esbuild')
const playwrightPath = require.resolve('playwright', { paths: [hostPkg] })
const playwright = await import(pathToFileURL(playwrightPath).href)
const chromium = playwright.chromium ?? playwright.default?.chromium

const POLL_MS = 2000

let outDir
let server
let base
let browser

async function bundle(entry) {
  const built = await esbuild.build({
    entryPoints: [path.join(pkgRoot, 'test', 'fixtures', entry)],
    absWorkingDir: pkgRoot,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    target: ['es2020'],
    loader: { '.css': 'empty' },
    nodePaths: [path.join(pkgRoot, 'node_modules'), path.join(corePkg, 'node_modules')],
    write: false,
    logLevel: 'silent'
  })
  return built.outputFiles[0].text
}

const html = ({ script, cookie, baseHref }) =>
  `<!doctype html><html><head><meta charset="utf-8">${baseHref ? `<base href="${baseHref}">` : ''}` +
  `${cookie ? `<script>document.cookie=${JSON.stringify(cookie)}</script>` : ''}</head>` +
  `<body><div id="root"></div><script src="/${script}"></script></body></html>`

before(async () => {
  outDir = mkdtempSync(path.join(tmpdir(), 'tas-e2e-'))
  writeFileSync(path.join(outDir, 'handover.js'), await bundle('handover-entry.tsx'))
  writeFileSync(path.join(outDir, 'build.js'), await bundle('build-poll-entry.tsx'))
  writeFileSync(
    path.join(outDir, 'existing.html'),
    html({ script: 'handover.js', cookie: 'tracy_site=host.example' })
  )
  writeFileSync(path.join(outDir, 'creation.html'), html({ script: 'handover.js', baseHref: '/new/' }))
  writeFileSync(path.join(outDir, 'building.html'), html({ script: 'build.js', baseHref: '/new/' }))
  writeFileSync(
    path.join(outDir, 'building-in-site.html'),
    html({ script: 'build.js', baseHref: '/host.example/', cookie: 'tracy_site=host.example' })
  )
  server = http.createServer((req, res) => {
    const pathname = req.url.split('?')[0]
    const name = pathname === '/host.example/' ? 'building-in-site.html' : pathname.replace(/^\//, '')
    try {
      const bytes = readFileSync(path.join(outDir, name))
      res.writeHead(200, { 'content-type': name.endsWith('.js') ? 'text/javascript' : 'text/html' })
      res.end(bytes)
    } catch {
      res.writeHead(404).end('not found')
    }
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${server.address().port}`
  // Same order as scripts/check-tests.ts: the installed Chrome first, then the bundled Chromium.
  browser = await chromium
    .launch({ channel: 'chrome', args: ['--disable-features=MacAppCodeSignClone'] })
    .catch(() => chromium.launch({ args: ['--disable-features=MacAppCodeSignClone'] }))
})

after(async () => {
  await browser?.close()
  await new Promise((resolve) => (server ? server.close(resolve) : resolve()))
  if (outDir) rmSync(outDir, { recursive: true, force: true })
})

async function withPage(run) {
  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    const pageErrors = []
    page.on('pageerror', (e) => pageErrors.push(e.message))
    await page.clock.install()
    await run(page)
    assert.deepEqual(pageErrors, [], 'no uncaught errors in the page')
  } finally {
    await context.close()
  }
}

async function openImportDetails(page, address) {
  await page.getByPlaceholder('yoursite.com').fill(address)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByRole('heading', { name: 'Confirm the platform' }).waitFor()
  assert.equal(await page.getByRole('button', { name: /Joomla/ }).getAttribute('aria-pressed'), 'true')
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByRole('heading', { name: 'How can Tracy read this site?' }).waitFor()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByRole('heading', { name: 'Sign in details' }).waitFor()
}

async function reviewAndStart(page) {
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByRole('heading', { name: 'Check and start the import' }).waitFor()
  await page.getByRole('button', { name: 'Start import', exact: true }).click()
}

async function importSite(page, address) {
  await openImportDetails(page, address)
  await page.getByLabel('Username').fill('admin')
  await page.getByLabel('Password', { exact: true }).fill('secret')
  await reviewAndStart(page)
  // First poll: still reading. Second: done, so the handover fires.
  await page.getByText('Packing up your files').waitFor()
  await page.clock.runFor(POLL_MS)
  await page.clock.runFor(POLL_MS)
}

test('import pages validate detection, method selection, Back and Review edits', async () => {
  await withPage(async (page) => {
    await page.goto(`${base}/existing.html`)
    await page.getByText('Import existing site').click()
    await page.getByRole('heading', { name: 'Which site are you bringing over?' }).waitFor()
    assert.equal(await page.getByRole('button', { name: 'Continue', exact: true }).isDisabled(), true)
    assert.equal(await page.getByRole('button', { name: /Joomla/ }).count(), 0)
    await openImportDetails(page, 'reviewsite.example')
    await page.getByRole('button', { name: 'Back', exact: true }).click()
    await page.getByText('I will install it myself', { exact: true }).click()
    assert.equal(
      await page.getByRole('heading', { name: 'How can Tracy read this site?' }).count(),
      1,
      'choosing a method does not advance'
    )
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await page.getByLabel('Access token from your site').fill('site-code')
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await page.getByRole('heading', { name: 'Check and start the import' }).waitFor()
    await page
      .locator('[data-wizard-review-row="platform"]')
      .getByRole('button', { name: /Change/ })
      .click()
    await page.getByRole('button', { name: 'WordPress', exact: true }).click()
    await page.getByText('This looks like a Joomla site, not WordPress.').waitFor()
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await page.getByRole('heading', { name: 'Check and start the import' }).waitFor()
    assert.equal(
      await page
        .locator('[data-wizard-review-row="platform"]')
        .innerText()
        .then((text) => text.includes('WordPress')),
      true
    )
    assert.equal(
      await page.locator('[data-wizard-review-row="source"]').count(),
      0,
      'Review has no Adding row'
    )
    await page
      .locator('[data-wizard-review-row="details"]')
      .getByRole('button', { name: /Change/ })
      .click()
    assert.equal(
      await page.getByLabel('Access token from your site').inputValue(),
      'site-code',
      'returning through Change retains the import draft'
    )
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await page.getByRole('heading', { name: 'Check and start the import' }).waitFor()
  })
})

test('failed import detection leaves every platform unselected', async () => {
  await withPage(async (page) => {
    await page.goto(`${base}/existing.html?detection-failed=1`)
    await page.getByText('Import existing site').click()
    await page.getByPlaceholder('yoursite.com').fill('unknown.example')
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await page.getByRole('heading', { name: 'Confirm the platform' }).waitFor()
    assert.equal(
      await page.getByRole('button', { name: 'Joomla', exact: true }).getAttribute('aria-pressed'),
      'false'
    )
    assert.equal(
      await page.getByRole('button', { name: 'WordPress', exact: true }).getAttribute('aria-pressed'),
      'false'
    )
    assert.equal(await page.getByRole('button', { name: 'Continue', exact: true }).isDisabled(), true)
  })
})

test('wizard renders an import handover and a failed build', async () => {
  await withPage(async (page) => {
    await page.goto(`${base}/existing.html`)
    await page.getByText('Import existing site').click()
    await importSite(page, 'firstsite.example')
    await page.getByText('firstsite.example is on its way into Tracy').waitFor()
    assert.equal(await page.getByText('Packing up your files').count(), 0, 'the stale spinner is gone')

    // The next import starts clean (no inherited credentials) and hands over again.
    await page.getByRole('button', { name: 'Import another site' }).click()
    await openImportDetails(page, 'secondsite.example')
    assert.equal(await page.getByLabel('Username').inputValue(), '', 'username did not carry over')
    await page.getByLabel('Username').fill('admin')
    await page.getByLabel('Password', { exact: true }).fill('secret')
    await reviewAndStart(page)
    await page.clock.runFor(POLL_MS)
    await page.getByText('secondsite.example is on its way into Tracy').waitFor()

    const h = await page.evaluate(() => window.__harness)
    assert.deepEqual(h.provisionSiteKeys, ['firstsite.example', 'secondsite.example'])
  })

  await withPage(async (page) => {
    await page.goto(`${base}/building.html?scenario=fail-after-running&seed=1`)
    await page.getByRole('heading', { name: 'Creating your site' }).waitFor()
    await page.clock.runFor(POLL_MS)
    await page.clock.runFor(POLL_MS)
    await page.getByRole('button', { name: 'Review site details' }).waitFor()
    assert.equal(await page.locator('[data-wizard-goto="create"]').getAttribute('data-step-state'), 'failed')
    const diagnosis = page.locator('[data-diagnosis="1"]')
    assert.equal(await diagnosis.isVisible(), false, 'raw support output starts collapsed')
    await page.getByText('Technical details', { exact: true }).click()
    assert.match(await diagnosis.innerText(), /see \/var\/log\/tracy\/provision-dead\.log/)
    assert.match(await diagnosis.innerText(), /!! no tracy\/emdash image/)
    assert.equal(
      await page.getByText('Tracy could not finish setting up your site.', { exact: true }).count(),
      1
    )
    assert.equal(await page.getByText('How to resolve', { exact: true }).count(), 0)
    assert.equal(await page.locator('.tas-create-notice[role="alert"] .tas-create-guidance').count(), 1)
    assert.equal(await page.locator('.tas-create-actions + .tas-create-technical').count(), 1)
    assert.equal(await page.locator('[data-stage="building"]').count(), 0, 'no longer shown as running')
    await page.getByRole('button', { name: 'Review site details' }).click()
    await page.getByRole('heading', { name: 'Ready to create your site', exact: true }).waitFor()
    assert.equal(
      await page.locator('[data-wizard-goto="review"]').getAttribute('aria-current'),
      'step',
      'a restored failure opens Review even without a saved form draft'
    )
    assert.equal(await page.locator('[data-create-step="1"]').count(), 0, 'review returns to the form')
    assert.equal(
      await page.evaluate(() => window.__harness.provisionSiteKeys?.length ?? 0),
      0,
      'review does not start another build'
    )
    assert.equal(await page.locator('[data-stage="building"]').count(), 0, 'no longer shown as running')
    assert.equal(await page.evaluate(() => window.__harness.jobPolls), 2, 'running, then failed')
  })
})

const RESUME_KEY = 'tracy.import.active'

/** Reopen Add site in the same browser: what the Import card shows comes from the stored pointer. */
async function reopenImport(page, url) {
  // The build console's own pointer (`resume.mjs`) rightly reopens a build still going; drop it so
  // only the import pointer decides what the Import card shows.
  await page.evaluate((keep) => {
    for (const key of Object.keys(localStorage)) if (key !== keep) localStorage.removeItem(key)
  }, RESUME_KEY)
  await page.goto(url)
  await page.getByText('Import existing site').click()
  await page.getByPlaceholder('yoursite.com').waitFor()
  await page.clock.runFor(POLL_MS)
  assert.equal(await page.locator('[data-stage="building"]').count(), 0, 'no build console on reopen')
  assert.equal(await page.evaluate(() => window.__harness.statusPolls), 0, 'no finished run is followed')
}

for (const [name, query] of [
  ['the wizard filed the build', ''],
  ['the host filed the build', '?host-filed']
]) {
  test(`creation workspace: a handover clears the resume pointer (${name}, #1664)`, async () => {
    await withPage(async (page) => {
      await page.goto(`${base}/creation.html${query}`)
      await page.getByText('Import existing site').click()
      await importSite(page, 'swapped.example')
      await page.locator('[data-stage="building"]').waitFor()
      assert.equal(await page.evaluate((key) => localStorage.getItem(key), RESUME_KEY), null)
      const h = await page.evaluate(() => window.__harness)
      assert.equal(h.provisionCount, query ? 0 : 1, 'the host-filed job is followed, never filed again')
      await reopenImport(page, `${base}/creation.html${query}`)
    })
  })
}

test('creation workspace: a manual handover retry clears the resume pointer (#1664)', async () => {
  await withPage(async (page) => {
    await page.addInitScript(() => {
      window.__failFirstProvision = 1
    })
    await page.goto(`${base}/creation.html`)
    await page.getByText('Import existing site').click()
    await importSite(page, 'retried.example')
    await page.getByRole('button', { name: 'Set it up again' }).click()
    await page.locator('[data-stage="building"]').waitFor()
    assert.equal(await page.evaluate((key) => localStorage.getItem(key), RESUME_KEY), null)
    assert.equal(await page.evaluate(() => window.__harness.provisionCount), 2)
    await reopenImport(page, `${base}/creation.html`)
  })
})

test('a read still going when the tab closed is followed again on reopen (C3)', async () => {
  await withPage(async (page) => {
    await page.goto(`${base}/creation.html`)
    await page.getByText('Import existing site').click()
    await openImportDetails(page, 'closed.example')
    await page.getByLabel('Username').fill('admin')
    await page.getByLabel('Password', { exact: true }).fill('secret')
    await reviewAndStart(page)
    await page.getByText('Packing up your files').waitFor()
    // The tab goes away mid-read; the pointer names the run.
    assert.equal(
      JSON.parse(await page.evaluate((key) => localStorage.getItem(key), RESUME_KEY)).siteKey,
      'closed.example'
    )
    await page.goto(`${base}/creation.html`)
    await page.getByText('Import existing site').click()
    // The stub's run starts over at "reading": the reopened tab offers to follow it, then hands it over.
    await page.getByRole('button', { name: 'Follow it' }).click()
    await page.getByText('Packing up your files').waitFor()
    await page.clock.runFor(POLL_MS)
    await page.clock.runFor(POLL_MS)
    await page.locator('[data-stage="building"]').waitFor()
    assert.equal(await page.evaluate((key) => localStorage.getItem(key), RESUME_KEY), null)
  })
})

test('creating from an existing site keeps the ready screen until the new workspace is opened', async () => {
  await withPage(async (page) => {
    await page.goto(`${base}/host.example/?scenario=done-slow-agent`)
    await goToStep(page, 'platform')
    await page.getByRole('button', { name: 'WordPress', exact: true }).click()
    await submitCreate(page, 'deadsite')
    await page.getByRole('heading', { name: 'Creating your site' }).waitFor()
    await page.clock.runFor(POLL_MS)
    await page.clock.runFor(POLL_MS)
    await page.waitForFunction(() => window.__harness.agentStarts > 0)
    await page.evaluate(() => {
      window.__harness.agentUp = true
    })
    await page.clock.runFor(POLL_MS)

    const openWorkspace = page.getByRole('button', { name: 'Start editing' })
    await openWorkspace.waitFor()
    assert.equal(await page.locator('[data-wizard-goto="create"]').getAttribute('data-step-state'), 'done')
    assert.equal(await page.getByRole('heading', { name: 'Your site is ready', exact: true }).count(), 1)
    assert.equal(await page.getByText('You can start editing it with Tracy now.', { exact: true }).count(), 1)
    assert.match(page.url(), /\/host\.example\//, 'completion stays in the current site workspace')

    await openWorkspace.click()
    await page.waitForURL(/\/deadsite\.tracy\.ai\//)
  })
})

test('Customize answers that did not all go in: the console said it was writing them, and the ready screen stays to say so', async () => {
  // 16/10/2026: the console spun "Recording a starting point" while the answers were written, and a run that
  // failed landed on the site as if they had all gone in.
  await withPage(async (page) => {
    const start = `${base}/building.html?scenario=brief-failed`
    await page.goto(start)
    await goToStep(page, 'platform')
    await page.getByRole('button', { name: 'WordPress', exact: true }).click()
    await submitCreate(page, 'deadsite')
    await page.getByRole('heading', { name: 'Creating your site' }).waitFor()
    await page.clock.runFor(POLL_MS)
    await page.getByText('Preparing your text and pictures').waitFor()
    for (let i = 0; i < 4; i += 1) await page.clock.runFor(POLL_MS)
    const said = page.getByText('Some of your text or pictures may be missing.', {
      exact: true
    })
    await said.waitFor()
    assert.match(await said.innerText(), /Some of your text or pictures may be missing/)
    const shots = process.env.TRACY_E2E_SHOTS
    if (shots) await page.screenshot({ path: path.join(shots, 'add-site-brief-failed.png') })
    await page.clock.runFor(POLL_MS)
    assert.equal(
      page.url(),
      start,
      'the ready screen stays: no landing on the site as if the answers went in'
    )
    await page.getByRole('button', { name: 'Start editing' }).waitFor()
  })
})

test('Copy details works without the Clipboard API and after a denied write, restoring focus', async () => {
  for (const denied of [false, true]) {
    await withPage(async (page) => {
      const errors = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(`${base}/building.html?scenario=failed&seed=1`)
      await page.clock.runFor(POLL_MS)
      await page.getByText('Technical details', { exact: true }).click()
      await page.evaluate((rejectClipboard) => {
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: rejectClipboard
            ? {
                writeText: async () => {
                  throw new Error('Clipboard denied')
                }
              }
            : undefined
        })
        document.execCommand = (command) => {
          if (command !== 'copy') return false
          window.__copiedDetails = document.activeElement.value
          return true
        }
      }, denied)
      const copy = page.getByRole('button', { name: 'Copy details', exact: true })
      await copy.click()
      const copied = await page.evaluate(() => window.__copiedDetails)
      assert.match(copied ?? '', /provision-dead\.log/)
      assert.match(copied ?? '', /no tracy\/emdash image/)
      assert.equal(await copy.evaluate((button) => button === document.activeElement), true)
      assert.equal(await page.locator('textarea[readonly]').count(), 0)
      assert.deepEqual(errors, [])
    })
  }
})
