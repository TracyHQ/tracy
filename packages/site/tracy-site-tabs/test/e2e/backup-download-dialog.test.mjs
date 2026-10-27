import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

import { openHarness } from '../../../tracy-my-sites/test/fixtures/open-harness.mjs'

let h

before(async () => {
  h = await openHarness('tst-backup-download-', 'backup-download-dialog-entry.tsx', { dshReact: true })
})

after(async () => {
  await h?.close()
})

test('opening the backup download dialog focuses the dialog, not its first button', async () => {
  const page = await h.browser.newPage({ viewport: { width: 1280, height: 800 } })
  await page.goto(h.base)
  await page.waitForSelector('[data-download-backup]', { timeout: 8000 })
  await page.waitForFunction(() =>
    document
      .querySelector('[role=dialog]')
      .getAnimations()
      .every((a) => a.playState !== 'running')
  )
  // Before the change the first footer button took focus on open and showed its focus border.
  assert.equal(
    await page.evaluate(() => document.activeElement === document.querySelector('[data-download-backup]')),
    true
  )
  await page.keyboard.press('Tab')
  assert.equal(await page.evaluate(() => document.activeElement?.tagName), 'BUTTON', 'Tab reaches a control')
  await page.close()
})

test('a second backup download dialog opened while the first is on the page focuses itself', async () => {
  const page = await h.browser.newPage({ viewport: { width: 1280, height: 800 } })
  await page.goto(`${h.base}/?twice=1`)
  await page.waitForFunction(() => document.querySelectorAll('[data-download-backup]').length === 2, null, {
    timeout: 8000
  })
  await page.waitForFunction(() =>
    [...document.querySelectorAll('[role=dialog]')].every((d) =>
      d.getAnimations().every((a) => a.playState !== 'running')
    )
  )
  // Before the change the lookup took the first `[data-download-backup]` on the page: the older one.
  const focus = await page.evaluate(() => {
    const [first, second] = document.querySelectorAll('[data-download-backup]')
    return { first: first === document.activeElement, second: second === document.activeElement }
  })
  assert.deepEqual(focus, { first: false, second: true })
  await page.close()
})

test('a backup download stays complete after the browser receives its link', async () => {
  const page = await h.browser.newPage({ viewport: { width: 360, height: 800 } })
  await page.route('**/api/sites/**', async (route) => {
    const { pathname } = new URL(route.request().url())
    if (pathname.endsWith('/export') && route.request().method() === 'POST')
      return route.fulfill({ status: 202, json: { exportId: 'backup-export-3', state: 'queued' } })
    if (pathname.endsWith('/export/backup-export-3'))
      return route.fulfill({
        json: { exportId: 'backup-export-3', state: 'ready', bytes: 1024, expiresAt: null }
      })
    if (pathname.endsWith('/export/backup-export-3/code'))
      return route.fulfill({ json: { challengeId: 'challenge-3' } })
    if (pathname.endsWith('/export/backup-export-3/download'))
      return route.fulfill({ json: { url: `${new URL(route.request().url()).origin}/download-test` } })
    return route.fulfill({ status: 404, json: { code: 'NOT_FOUND' } })
  })
  await page.route('**/download-test', (route) =>
    route.fulfill({
      body: 'zip',
      headers: { 'content-type': 'application/zip', 'content-disposition': 'attachment; filename=backup.zip' }
    })
  )
  await page.goto(h.base)
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Prepare download' }).click()
  await dialog.getByRole('button', { name: 'Send code' }).waitFor()
  await dialog.getByRole('button', { name: 'Send code' }).click()
  await dialog.getByText('The code expires in 10 minutes.').waitFor()
  const downloadButton = dialog.getByRole('button', { name: 'Download', exact: true })
  assert.equal(await downloadButton.isDisabled(), true)
  await dialog.getByLabel('Enter the code from your email').fill('12a345')
  assert.equal(await downloadButton.isDisabled(), true, 'letters do not enable Download')
  assert.equal(await dialog.getByLabel('Enter the code from your email').inputValue(), '')
  await dialog.getByLabel('Enter the code from your email').fill('123456')
  const download = page.waitForEvent('download')
  await downloadButton.click()
  await download
  await dialog.getByRole('button', { name: 'Downloaded' }).waitFor()
  assert.equal(await dialog.getByRole('button', { name: 'Downloaded' }).isDisabled(), true)
  assert.equal(await dialog.locator('[data-download-code]').count(), 0)
  await page.close()
})

test('a non-code refusal enters the destructive download-failed state', async () => {
  const page = await h.browser.newPage({ viewport: { width: 360, height: 800 } })
  await page.route('**/api/sites/**', async (route) => {
    const { pathname } = new URL(route.request().url())
    if (pathname.endsWith('/export') && route.request().method() === 'POST')
      return route.fulfill({ status: 202, json: { exportId: 'backup-export-3', state: 'queued' } })
    if (pathname.endsWith('/export/backup-export-3'))
      return route.fulfill({ json: { exportId: 'backup-export-3', state: 'ready', bytes: 1024 } })
    if (pathname.endsWith('/export/backup-export-3/code'))
      return route.fulfill({ json: { challengeId: 'challenge-3' } })
    if (pathname.endsWith('/export/backup-export-3/download'))
      return route.fulfill({ status: 409, json: { code: 'EXPORT_NOT_READY' } })
    return route.fulfill({ status: 404, json: { code: 'NOT_FOUND' } })
  })
  await page.goto(h.base)
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Prepare download' }).click()
  await dialog.getByRole('button', { name: 'Send code' }).waitFor()
  await dialog.getByRole('button', { name: 'Send code' }).click()
  await dialog.getByLabel('Enter the code from your email').fill('123456')
  await dialog.getByRole('button', { name: 'Download', exact: true }).click()
  await dialog.locator('[data-download-failed]').waitFor()
  assert.equal(await dialog.locator('[data-download-code]').count(), 0)
  await dialog.getByRole('button', { name: 'Try again' }).waitFor()
  await dialog.getByRole('button', { name: 'Close', exact: true }).first().waitFor()
  await page.close()
})

test('retrying a failed Send code request reuses the existing export', async () => {
  const page = await h.browser.newPage({ viewport: { width: 360, height: 800 } })
  let exportRequests = 0
  let codeRequests = 0
  await page.route('**/api/sites/**', async (route) => {
    const { pathname } = new URL(route.request().url())
    if (pathname.endsWith('/export') && route.request().method() === 'POST') {
      exportRequests += 1
      return route.fulfill({ status: 202, json: { exportId: 'backup-export-3', state: 'queued' } })
    }
    if (pathname.endsWith('/export/backup-export-3'))
      return route.fulfill({ json: { exportId: 'backup-export-3', state: 'ready', bytes: 1024 } })
    if (pathname.endsWith('/export/backup-export-3/code')) {
      codeRequests += 1
      return codeRequests === 1
        ? route.fulfill({ status: 503, json: { code: 'SERVICE_UNAVAILABLE' } })
        : route.fulfill({ json: { challengeId: 'challenge-3' } })
    }
    return route.fulfill({ status: 404, json: { code: 'NOT_FOUND' } })
  })
  await page.goto(h.base)
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Prepare download' }).click()
  await dialog.getByRole('button', { name: 'Send code' }).waitFor()
  await dialog.getByRole('button', { name: 'Send code' }).click()
  await dialog.getByRole('button', { name: 'Try again' }).waitFor()
  await dialog.getByRole('button', { name: 'Try again' }).click()
  await dialog.getByText('The code expires in 10 minutes.').waitFor()
  assert.equal(codeRequests, 2)
  assert.equal(exportRequests, 1)
  await page.close()
})

test('retrying a failed download checks the existing export before making another one', async () => {
  const page = await h.browser.newPage({ viewport: { width: 360, height: 800 } })
  let exportRequests = 0
  let downloadFailed = false
  let retryStatusReads = 0
  await page.route('**/api/sites/**', async (route) => {
    const { pathname } = new URL(route.request().url())
    if (pathname.endsWith('/export') && route.request().method() === 'POST') {
      exportRequests += 1
      return route.fulfill({ status: 202, json: { exportId: 'backup-export-3', state: 'queued' } })
    }
    if (pathname.endsWith('/export/backup-export-3')) {
      if (downloadFailed) retryStatusReads += 1
      return route.fulfill({ json: { exportId: 'backup-export-3', state: 'ready', bytes: 1024 } })
    }
    if (pathname.endsWith('/export/backup-export-3/code'))
      return route.fulfill({ json: { challengeId: 'challenge-3' } })
    if (pathname.endsWith('/export/backup-export-3/download')) {
      downloadFailed = true
      return route.fulfill({ status: 500, json: { code: 'INTERNAL_ERROR' } })
    }
    return route.fulfill({ status: 404, json: { code: 'NOT_FOUND' } })
  })
  await page.goto(h.base)
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Prepare download' }).click()
  await dialog.getByRole('button', { name: 'Send code' }).waitFor()
  await dialog.getByRole('button', { name: 'Send code' }).click()
  await dialog.getByLabel('Enter the code from your email').fill('123456')
  await dialog.getByRole('button', { name: 'Download', exact: true }).click()
  await dialog.getByRole('button', { name: 'Try again' }).waitFor()
  await dialog.getByRole('button', { name: 'Try again' }).click()
  await dialog.getByRole('button', { name: 'Send code' }).waitFor()
  assert.equal(retryStatusReads, 1)
  assert.equal(exportRequests, 1)
  await page.close()
})
