/**
 * REG-057: an invite-only viewer lands on /new/ with the normal first screen and the Inbox open
 * beside it; the invite card's body is inert, Accept goes into the site.
 *
 * Writes: one invitation of a fresh address C to seat a's site KEY, taken off the book at the end
 * (the seat row is deleted whatever happened before, and that deletion is itself an expectation).
 */
import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { api, expect, ORIGIN, seatContext, siteKey, test } from './stand.mjs'

const ROOT = resolve(fileURLToPath(import.meta.url), '../../../..')
const KEY = siteKey('wp')

test('REG-057 invite-only viewer lands on the Inbox', async ({ browser }) => {
  // Unit seams: exit 0 with '# fail 0'.
  const inboxTests = readdirSync(join(ROOT, 'packages/site/tracy-inbox/test'))
    .filter((f) => f.endsWith('.test.mjs'))
    .map((f) => `packages/site/tracy-inbox/test/${f}`)
  const unit = spawnSync(
    process.execPath,
    [
      '--test',
      '--test-reporter=tap',
      ...inboxTests,
      'apps/tracy-web/test/notification-mail.test.mjs',
      'apps/tracy-web/test/email-off.test.mjs'
    ],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  )
  const tail = (unit.stdout ?? '').split('\n').filter((l) => /^# (tests|pass|fail)/.test(l))
  console.log(`unit seams (${inboxTests.length + 2} files): exit ${unit.status}; ${tail.join('; ')}`)
  expect.soft(unit.status, 'unit seams exit 0').toBe(0)
  expect.soft(unit.stdout, "unit seams report '# fail 0'").toMatch(/^# fail 0$/m)

  const C = `reg057-${Math.floor(Date.now() / 1000)}@example.test`
  try {
    // Invite C as editor on KEY.
    const invite = await api('a', 'POST', '/api/team/invite', {
      role: 'editor',
      emails: [C],
      siteKeys: [KEY]
    })
    const NOTIFIED = invite.json?.results?.[0]?.notified
    console.log(`invite: HTTP ${invite.status}, NOTIFIED = ${String(NOTIFIED)}`)
    expect.soft(NOTIFIED, 'NOTIFIED === true').toBe(true)

    // Root door as C, not followed.
    const root = await api(C, 'GET', '/', undefined, { accept: 'text/html', redirect: 'manual' })
    const ROOT_ANSWER = `${root.status} ${root.location ?? ''}`
    console.log(`ROOT = '${ROOT_ANSWER}'`)
    expect.soft(ROOT_ANSWER, 'ROOT').toBe('302 /new/?tab=tracy:inbox')

    // Browser as C.
    const context = await seatContext(browser, C, {
      locale: 'en-US',
      viewport: { width: 1400, height: 900 }
    })
    const page = await context.newPage()
    await page.goto(`${ORIGIN}/`)
    const card = page.locator('.tracy-inbox .tracy-inbox-row.is-card').filter({ hasText: KEY })
    await card.first().waitFor({ timeout: 90_000 })
    const URL0 = page.url()
    const seen = await page.evaluate(() => ({
      greeting: document.querySelectorAll('.tv-start-title').length,
      whoami: document.querySelectorAll('.tracy-inbox-whoami').length,
      attr: document.documentElement.hasAttribute('data-tracy-pending-invites')
    }))
    const CARD_ROLE = await card.first().getAttribute('role')
    console.log(
      `URL0 = ${URL0}; GREETING = ${seen.greeting}; WHOAMI = ${seen.whoami}; ATTR = ${seen.attr}; CARD_ROLE = ${String(CARD_ROLE)}`
    )
    const u0 = new URL(URL0)
    expect.soft(u0.pathname.startsWith('/new/'), `URL0 path ${u0.pathname} starts with /new/`).toBe(true)
    expect.soft(u0.searchParams.get('tab'), 'URL0 query tab').toBe('tracy:inbox')
    expect.soft(seen.greeting, 'GREETING').toBe(1)
    expect.soft(seen.whoami, 'WHOAMI').toBe(0)
    expect.soft(seen.attr, 'ATTR').toBe(false)
    expect.soft(CARD_ROLE, 'CARD_ROLE').toBeNull()

    // The card's body is inert.
    await card.first().locator('.tracy-inbox-name').click()
    await page.waitForTimeout(1_500)
    const URL1 = page.url()
    console.log(`URL1 = ${URL1}`)
    expect.soft(URL1, 'URL1 === URL0').toBe(URL0)

    // Accept lands in the site.
    await card.first().getByRole('button', { name: 'Accept', exact: true }).click()
    await page.waitForURL((u) => u.href.includes(`/${KEY}/`), { timeout: 60_000 })
    const URL2 = page.url()
    console.log(`URL2 = ${URL2}`)
    expect(new URL(URL2).pathname.startsWith(`/${KEY}/`), `URL2 path starts with /${KEY}/`).toBe(true)
  } finally {
    // Clean up: take C's row off KEY's book.
    const team = await api('a', 'GET', '/api/team')
    const row = team.json?.sites?.find((s) => s.siteKey === KEY)?.seats?.find((s) => s.email === C)
    const CLEANUP = row ? (await api('a', 'DELETE', `/api/sites/${KEY}/seats/${row.id}`)).status : null
    console.log(`CLEANUP = ${String(CLEANUP)}${row ? '' : ' (no seat row for C)'}`)
    expect(CLEANUP, 'CLEANUP === 200').toBe(200)
  }
})
