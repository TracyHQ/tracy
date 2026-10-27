/** Import preflight regressions exercise the customer's first pass through the real wizard. */
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import http from 'node:http'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const repoRoot = path.resolve(pkgRoot, '../../..')
const playwrightPath = require.resolve('playwright', { paths: [path.join(repoRoot, 'apps/tracy-host')] })
const playwright = await import(pathToFileURL(playwrightPath).href)
const chromium = playwright.chromium ?? playwright.default?.chromium
let scratch, browser, server, base

before(async () => {
  scratch = mkdtempSync(path.join(tmpdir(), 'import-preflight-e2e-'))
  await require('esbuild').build({
    entryPoints: [path.join(pkgRoot, 'test/fixtures/import-preflight-entry.tsx')],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    loader: { '.css': 'empty' },
    nodePaths: [path.join(repoRoot, 'packages/core/tracy-core/node_modules')],
    outfile: path.join(scratch, 'client.js'),
    logLevel: 'silent'
  })
  server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': req.url === '/client.js' ? 'text/javascript' : 'text/html' })
    res.end(
      req.url === '/client.js'
        ? readFileSync(path.join(scratch, 'client.js'))
        : '<!doctype html><html><body><div id="root"></div><script src="/client.js"></script></body></html>'
    )
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${server.address().port}`
  browser = await chromium
    .launch({ channel: 'chrome', args: ['--disable-features=MacAppCodeSignClone'] })
    .catch(() => chromium.launch({ args: ['--disable-features=MacAppCodeSignClone'] }))
})
after(async () => {
  await browser?.close()
  await new Promise((resolve) => (server ? server.close(resolve) : resolve()))
  if (scratch) rmSync(scratch, { recursive: true, force: true })
})

const online = (platform = 'joomla') => ({ reachable: true, secure: true, blocked: false, platform })

async function withPage(run) {
  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.clock.install()
    await page.route('**/api/config', (route) => route.fulfill({ json: { siteDomain: 'tracy.site' } }))
    await page.route('**/api/sites/import-address?*', (route) =>
      route.fulfill({ json: { ownership: 'available' } })
    )
    await page.route('**/api/tracy-add-site/extension*', (route) =>
      route.fulfill({ json: { version: '1.0.0', packageUrl: 'https://example.test/plugin.zip' } })
    )
    await run(page)
    assert.deepEqual(errors, [], 'the actual component has no uncaught errors')
  } finally {
    await context.close()
  }
}

async function settleRows(page) {
  await page.clock.runFor(1200)
}

async function confirmPlatform(page, address) {
  await page.getByRole('textbox', { name: 'Site address', exact: true }).fill(address)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByRole('heading', { name: 'Confirm the platform', exact: true }).waitFor()
}

async function openDetails(page, address) {
  await confirmPlatform(page, address)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByRole('heading', { name: 'How can Tracy read this site?', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByLabel('Username', { exact: true }).waitFor()
}

async function startFromReview(page) {
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByRole('heading', { name: 'Check and start the import', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Start import', exact: true }).click()
}

test('a delayed detection cannot skip the address check or the explicit platform confirmation', async () => {
  await withPage(async (page) => {
    let release
    let received
    const requested = new Promise((resolve) => {
      received = resolve
    })
    await page.route('**/api/tracy-add-site/detect', async (route) => {
      received()
      await new Promise((resolve) => {
        release = resolve
      })
      await route.fulfill({ json: online('wordpress') })
    })
    await page.goto(base)
    await page.getByRole('textbox', { name: 'Site address', exact: true }).fill('https://wordpress.org')
    const next = page.getByRole('button', { name: 'Continue', exact: true })
    await next.click()
    await requested
    assert.equal(await next.isDisabled(), true, 'Continue stays disabled while detection is pending')
    assert.equal(await page.getByLabel('Username').count(), 0, 'pending checks cannot reveal credentials')
    release()
    await page.getByRole('heading', { name: 'Confirm the platform', exact: true }).waitFor()
    assert.equal(await page.getByRole('button', { name: /WordPress/ }).getAttribute('aria-pressed'), 'true')
    assert.equal(await page.getByLabel('Username').count(), 0, 'detection cannot skip platform confirmation')
    await page.getByRole('button', { name: 'Joomla', exact: true }).click()
    await page.getByText('This looks like a WordPress site, not Joomla.', { exact: true }).waitFor()
    await next.click()
    await page.getByRole('heading', { name: 'How can Tracy read this site?', exact: true }).waitFor()
    await next.click()
    await page.getByLabel('Username').waitFor()
    assert.equal(await page.getByLabel('Admin address').inputValue(), 'https://wordpress.org/administrator')
  })
})

test('changing the address invalidates in-flight checks and a stale response cannot advance', async () => {
  await withPage(async (page) => {
    const pending = []
    let receive = () => {}
    const requestStarted = () =>
      new Promise((resolve) => {
        receive = resolve
      })
    await page.route(
      '**/api/tracy-add-site/detect',
      (route) =>
        new Promise((resolve) => {
          pending.push(async () => {
            await route.fulfill({ json: online() })
            resolve()
          })
          receive()
        })
    )
    await page.goto(base)
    const address = page.getByRole('textbox', { name: 'Site address', exact: true })
    const next = page.getByRole('button', { name: 'Continue', exact: true })
    await address.fill('first.example')
    const first = requestStarted()
    await next.click()
    await first
    await address.fill('second.example')
    await pending.shift()()
    await next.waitFor({ state: 'visible' })
    await page.waitForFunction(() => !document.querySelector('[data-wizard-continue]').disabled)
    assert.equal(
      await page.getByRole('heading', { name: 'Confirm the platform' }).count(),
      0,
      'first result cannot advance second input'
    )
    const second = requestStarted()
    await next.click()
    await second
    await address.fill('third.example')
    await pending.shift()()
    await page.waitForFunction(() => !document.querySelector('[data-wizard-continue]').disabled)
    assert.equal(
      await page.getByRole('heading', { name: 'Confirm the platform' }).count(),
      0,
      'second result cannot advance third input'
    )
    const third = requestStarted()
    await next.click()
    await third
    await address.fill('https://third.example/')
    await pending.shift()()
    await page.getByRole('heading', { name: 'Confirm the platform', exact: true }).waitFor()
    assert.equal(
      await page.getByRole('button', { name: /Joomla/ }).getAttribute('aria-pressed'),
      'true',
      'equivalent normalized input retains its result'
    )
  })
})

test('unreachable admin guidance displays and links the exact address currently entered', async () => {
  await withPage(async (page) => {
    await page.route('**/api/tracy-add-site/detect', (route) => {
      const body = route.request().postDataJSON()
      return route.fulfill({
        json: body.adminUrl?.includes('.invalid')
          ? { reachable: false, error: 'ENOTFOUND' }
          : { ...online(), admin: { signInFound: true, locked: false, basicAuthRequired: false } }
      })
    })
    await page.goto(base)
    await openDetails(page, 'https://wordpress.org')
    const admin = page.getByLabel('Admin address')
    for (const typed of [
      'https://no-such-import.invalid/administrator/',
      'https://another-admin.invalid/private/login.php?secret=word#signin'
    ]) {
      await admin.fill(typed)
      const result = page.waitForResponse(
        (response) =>
          response.url().endsWith('/api/tracy-add-site/detect') &&
          response.request().postDataJSON().adminUrl === typed
      )
      await admin.blur()
      await result
      await settleRows(page)
      const link = page.locator('[data-import-problem="pf2.unreachable"] a')
      assert.equal(
        await link.getAttribute('href'),
        typed,
        'href retains the typed host, path, query, and hash'
      )
      assert.equal(
        await link.innerText(),
        typed,
        'the label must match the current admin address, not the site domain'
      )
      assert.equal(await link.getAttribute('target'), '_blank')
      assert.equal(await link.getAttribute('rel'), 'noopener')
    }
  })
})

test('removing Basic Auth clears required server credentials and leaves the checkbox reversible', async () => {
  await withPage(async (page) => {
    let gated = true
    await page.route('**/api/tracy-add-site/detect', (route) =>
      route.fulfill({
        json: route.request().postDataJSON().adminUrl
          ? { ...online(), admin: { signInFound: !gated, locked: false, basicAuthRequired: gated } }
          : online()
      })
    )
    await page.goto(base)
    await openDetails(page, 'https://source.example')
    await page.getByLabel('Server username').waitFor()
    await settleRows(page)
    await page.getByLabel('Username', { exact: true }).fill('source-owner')
    await page.getByLabel('Password', { exact: true }).fill('source-password')
    const start = page.getByRole('button', { name: 'Continue', exact: true })
    assert.equal(await start.isDisabled(), true, 'a detected Basic Auth gate requires its credentials')

    gated = false
    const admin = page.getByLabel('Admin address')
    const result = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/tracy-add-site/detect') && !!response.request().postDataJSON().adminUrl
    )
    await admin.focus()
    await admin.blur()
    await result
    await settleRows(page)
    assert.equal(
      await page.getByLabel('Server username').count(),
      0,
      'removed gate no longer demands server fields'
    )
    assert.equal(await start.isEnabled(), true, 'CMS credentials suffice after Basic Auth is removed')
    const basic = page.getByRole('checkbox')
    assert.equal(await basic.count(), 1, 'the customer can still toggle optional server credentials')
    await basic.focus()
    await basic.press('Space')
    assert.equal(await page.getByLabel('Server username').count(), 1)
    await basic.press('Space')
    assert.equal(
      await page.getByLabel('Server username').count(),
      0,
      'the checkbox can be unticked after a passed preflight'
    )
    assert.equal(await start.isEnabled(), true)
  })
})

test('a WordPress account without installation rights offers Use another account', async () => {
  await withPage(async (page) => {
    await page.route('**/api/tracy-add-site/detect', (route) =>
      route.fulfill({
        json: {
          ...online('wordpress'),
          admin: { signInFound: true, locked: false, basicAuthRequired: false }
        }
      })
    )
    await page.route('**/api/sites', (route) =>
      route.fulfill({ status: 201, json: { siteKey: 'source.example' } })
    )
    let started = false
    const run = {
      id: 'account-refused',
      siteKey: 'source.example',
      platform: 'wordpress',
      state: 'error',
      step: 'signing_in',
      error: 'no_backend_access',
      detail: { platform: 'wordpress' }
    }
    await page.route('**/api/tracy-add-site/status', (route) =>
      route.fulfill(started ? { json: run } : { status: 404, json: { code: 'RUN_UNKNOWN' } })
    )
    await page.route('**/api/tracy-add-site/start', (route) => {
      started = true
      return route.fulfill({ status: 202, json: { runId: run.id } })
    })
    await page.goto(base)
    await openDetails(page, 'https://source.example')
    await page.getByLabel('Username', { exact: true }).fill('limited-editor')
    await page.getByLabel('Password', { exact: true }).fill('source-password')
    await settleRows(page)
    await startFromReview(page)
    await page.clock.runFor(6000)
    const problem = page.locator('[data-import-problem="p23"]')
    await problem.waitFor()
    const another = problem.getByRole('button', { name: 'Use another account', exact: true })
    assert.equal(await another.count(), 1, 'the approved recovery action is present')
    await another.click()
    assert.equal(await page.getByLabel('Username', { exact: true }).inputValue(), '')
    assert.equal(await page.getByLabel('Password', { exact: true }).inputValue(), '')
    assert.equal(await page.getByLabel('Admin address').inputValue(), 'https://source.example/wp-login.php')
    assert.equal(
      await page
        .getByLabel('Username', { exact: true })
        .evaluate((element) => document.activeElement === element),
      true
    )
  })
})

test('Cloudflare and unknown platform warnings show both instructions in the same resolution', async () => {
  await withPage(async (page) => {
    await page.route('**/api/tracy-add-site/detect', (route) =>
      route.fulfill({ json: { ...online(null), firewall: 'cloudflare' } })
    )
    await page.goto(base)
    await confirmPlatform(page, 'https://source.example')
    await page.getByRole('button', { name: 'Back', exact: true }).click()
    await settleRows(page)
    const problem = page.locator('[data-import-problem="pf1.cloudflare"]')
    await problem.getByRole('button', { name: 'How to resolve' }).click()
    assert.match(await problem.innerText(), /If it blocks the import/)
    assert.match(await problem.innerText(), /Check that Joomla is the right choice above, then continue/)
    assert.equal(await page.getByRole('button', { name: 'Continue', exact: true }).isEnabled(), true)
  })
})

test('missing Joomla admin form points to the platform sign-in path instead of the public root', async () => {
  await withPage(async (page) => {
    await page.route('**/api/tracy-add-site/detect', (route) =>
      route.fulfill({
        json: { ...online(), admin: { signInFound: false, locked: false, basicAuthRequired: false } }
      })
    )
    await page.goto(base)
    await openDetails(page, 'https://source.example')
    const admin = page.getByLabel('Admin address')
    await admin.fill('https://source.example/')
    const checked = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/tracy-add-site/detect') &&
        response.request().postDataJSON().adminUrl === 'https://source.example/'
    )
    await admin.blur()
    await checked
    await settleRows(page)
    const link = page.locator('[data-import-problem="pf2.noform"] a')
    assert.equal(await link.getAttribute('href'), 'https://source.example/administrator')
    assert.equal(await link.innerText(), 'https://source.example/administrator')
    assert.equal(await link.getAttribute('target'), '_blank')
  })
})
