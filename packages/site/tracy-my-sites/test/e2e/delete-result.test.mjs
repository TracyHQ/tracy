#!/usr/bin/env node
/**
 * Deleting a site from My Sites, in a real browser, against a door that answers what each case
 * injects (#801).
 *
 * `DELETE /api/sites/:key` takes the site's row off the book and reports beside it what else went:
 * `{ removed, host, hostReason?, repo, sessions, sessionsReason?, seats }`. The client read only
 * `res.ok`, so a teardown that left the host stack or the repository behind closed the dialog like
 * a clean delete, and with the row gone nothing was left to ask again from.
 *
 * Fixture: `../fixtures/delete-result-entry.tsx` (the real `MySitesTab`, the plugin's real
 * stylesheet). Nothing reaches a server: `/api/sites`, `/api/team`, `/auth/me`, the DELETE and the
 * leave are answered at the network by `page.route`, one deterministic answer per case. What this
 * does NOT exercise: a real host teardown, GitHub, or dsh forgetting a workspace (the unmount is
 * triggered by hand, `window.__unmountTab()`).
 *
 * Harness rules as in `table-fits-panel.test.mjs`: a missing dependency or browser FAILS.
 */
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

import { openHarness } from '../fixtures/open-harness.mjs'

const ALPHA = 'alpha.tracy.test'
const BETA = 'beta.tracy.test'
const CLEAN = { removed: true, host: true, repo: true, sessions: true, seats: true }
const RESULT = '[data-tracy-delete-result]'
const WAIT = { timeout: 5000 }

let h

before(async () => {
  h = await openHarness('tms-delete-result-', 'delete-result-entry.tsx')
})

after(async () => {
  await h?.close()
})

const row = (siteKey) => ({
  siteKey,
  platform: 'wordpress',
  role: 'owner',
  status: 'accepted',
  createdAt: '2026-09-30T08:00:00.000Z',
  agent: '/',
  copyUrl: `https://${siteKey}`
})

const json = (route, status, body) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

/**
 * A page standing in `here` (a site key, or '' for no site), with a seat book holding `sites`.
 * `onDelete(route, book)` answers the DELETE; `book` is the live state: `sites` (what `/api/sites`
 * lists next), `deletes` and `leaves` (every such request seen), `navigations` (main-frame loads
 * after the first).
 */
async function open({ here = ALPHA, sites = [ALPHA, BETA], onDelete, viewport, dark = false }) {
  const page = await h.browser.newPage({ viewport: viewport ?? { width: 1280, height: 800 } })
  const book = { sites: [...sites], deletes: [], leaves: [], navigations: 0, errors: [] }
  page.on('pageerror', (e) => book.errors.push(e.message))
  await page.route(
    (url) => url.pathname.startsWith('/api/') || url.pathname === '/auth/me',
    async (route) => {
      const request = route.request()
      const { pathname } = new URL(request.url())
      if (pathname === '/auth/me') return json(route, 200, { email: 'owner@example.test' })
      if (pathname === '/api/team') return json(route, 200, { sites: [] })
      if (pathname === '/api/sites' && request.method() === 'GET')
        return json(route, 200, { sites: book.sites.map(row) })
      const leave = /^\/api\/sites\/([^/]+)\/leave$/.exec(pathname)
      if (leave && request.method() === 'POST') {
        const key = decodeURIComponent(leave[1])
        book.leaves.push(key)
        book.sites = book.sites.filter((s) => s !== key)
        return json(route, 200, { left: true })
      }
      const one = /^\/api\/sites\/([^/]+)$/.exec(pathname)
      if (one && request.method() === 'DELETE') {
        book.deletes.push(decodeURIComponent(one[1]))
        return onDelete(route, book)
      }
      return json(route, 404, { code: 'NOT_FOUND' })
    }
  )
  await page.goto(`${h.base}/${here === '' ? '' : `${here}/`}${dark ? '?dark=1' : ''}`)
  await page.waitForSelector('tbody tr', WAIT)
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) book.navigations++
  })
  return { page, book }
}

/** The door's success: the row comes off the book, and `body` is what it reports. */
const removes = (body) => (route, book) => {
  book.sites = book.sites.filter((s) => s !== book.deletes.at(-1))
  return json(route, 200, body)
}

/** Open the delete dialog of `siteKey` and type the word; the Delete button is returned, unpressed. */
async function armDelete(page, siteKey) {
  await page.locator('tbody tr', { hasText: siteKey }).getByRole('button', { name: 'More' }).click()
  await page.getByRole('menuitem', { name: 'Delete site…' }).click()
  const confirm = page.getByRole('button', { name: 'Delete', exact: true })
  await confirm.waitFor(WAIT)
  // The gate: nothing is sent until the word is typed.
  assert.equal(await confirm.isDisabled(), true, 'Delete is disabled before the word is typed')
  await page.locator('#tracy-delete-name').fill('delete')
  return confirm
}

async function pressDelete(page, siteKey) {
  await (await armDelete(page, siteKey)).click()
}

/** The result notice: which kind, its whole text, and the buttons it offers besides its Close. */
async function result(page) {
  const box = page.locator(RESULT)
  await box.waitFor(WAIT)
  return {
    kind: await box.getAttribute('data-tracy-delete-result'),
    text: (await box.innerText()).replace(/\s+/g, ' '),
    // The X is another way to acknowledge; every other button would be an action.
    buttons: await box.locator('button:not([data-slot="dialog-close"])').allInnerTexts()
  }
}

const acknowledge = (page) => page.locator(RESULT).getByRole('button', { name: 'Got it' }).click()

const siteNames = (page) => page.locator('tbody tr .tracy-mysites-site-name').allInnerTexts()

test('host teardown failed: the delete says so, names the reason and the next step, and offers no second delete', async () => {
  const { page, book } = await open({
    onDelete: removes({ ...CLEAN, host: false, hostReason: 'TEARDOWN_FAILED: volume in use' })
  })
  await pressDelete(page, BETA)
  const shown = await result(page)
  assert.equal(shown.kind, 'partial')
  assert.match(shown.text, new RegExp(`${BETA} was deleted, but the cleanup is not complete`))
  assert.match(shown.text, /files and database on the server/)
  assert.match(shown.text, /Removal not confirmed/)
  assert.match(shown.text, /Reason: TEARDOWN_FAILED: volume in use/)
  assert.match(shown.text, new RegExp(`Site key: ${BETA}`))
  assert.match(shown.text, /Contact Tracy support/)
  // The parts that did go are not listed.
  assert.doesNotMatch(shown.text, /repository|sessions|seats at the agent/i)
  assert.deepEqual(
    shown.buttons.map((b) => b.trim()).filter(Boolean),
    ['Got it'],
    'the only action is to acknowledge'
  )
  // The page stays (another site was deleted), the delete dialog is gone, the row left the list.
  assert.equal(await page.locator('#tracy-delete-name').count(), 0)
  await page.waitForFunction((key) => !document.querySelector('tbody')?.innerText.includes(key), BETA, WAIT)
  assert.equal(book.navigations, 0)
  await acknowledge(page)
  await page.waitForFunction((sel) => !document.querySelector(sel), RESULT, WAIT)
  assert.equal(await page.locator('.tms-delete-result-host').count(), 0, 'the notice leaves nothing behind')
  assert.deepEqual(book.deletes, [BETA], 'one DELETE, and none after the notice')
  assert.deepEqual(book.errors, [])
  await page.close()
})

test('repository not confirmed by GitHub: the delete says so and invents no reason', async () => {
  const { page, book } = await open({ onDelete: removes({ ...CLEAN, repo: 'failed' }) })
  await pressDelete(page, BETA)
  const shown = await result(page)
  assert.equal(shown.kind, 'partial')
  assert.match(shown.text, /GitHub repository/)
  assert.match(shown.text, /Removal not confirmed/)
  assert.match(shown.text, /Reason: not reported/)
  assert.doesNotMatch(shown.text, /files and database on the server/)
  assert.deepEqual(book.deletes, [BETA])
  await page.close()
})

test('no repository, or a repository kept on purpose, is a clean delete: no notice', async () => {
  for (const repo of [false, 'kept', true]) {
    const { page, book } = await open({ onDelete: removes({ ...CLEAN, repo }) })
    await pressDelete(page, BETA)
    await page.waitForFunction(() => !document.querySelector('#tracy-delete-name'), null, WAIT)
    await page.waitForFunction((key) => !document.querySelector('tbody')?.innerText.includes(key), BETA, WAIT)
    assert.equal(await page.locator(RESULT).count(), 0, `repo ${JSON.stringify(repo)}: no notice`)
    assert.equal(book.navigations, 0)
    await page.close()
  }
})

test('sessions and seats the agent did not confirm are both disclosed', async () => {
  const { page } = await open({
    onDelete: removes({ ...CLEAN, sessions: false, sessionsReason: 'SESSION_ACTIVE', seats: false })
  })
  await pressDelete(page, BETA)
  const shown = await result(page)
  assert.equal(shown.kind, 'partial')
  assert.match(shown.text, /chat sessions/)
  assert.match(shown.text, /Reason: SESSION_ACTIVE/)
  assert.match(shown.text, /seats at the agent/)
  assert.match(shown.text, /Reason: not reported/)
  await page.close()
})

test('parts the answer leaves out or reports in an undefined shape are shown as not reported, never as done', async () => {
  for (const body of [{ removed: true }, { ...CLEAN, host: 'yes', repo: 'gone', sessions: 1, seats: null }]) {
    const { page } = await open({ onDelete: removes(body) })
    await pressDelete(page, BETA)
    const shown = await result(page)
    assert.equal(shown.kind, 'partial')
    assert.equal(shown.text.match(/No result reported/g)?.length, 4, JSON.stringify(body))
    assert.doesNotMatch(shown.text, /Removal not confirmed/)
    await page.close()
  }
})

test('a success nobody can read is an unknown result: no "Nothing was changed", no clean close', async () => {
  const bodies = {
    empty: (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '' }),
    'not JSON': (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<html>ok</html>' }),
    'an array': (route) => json(route, 200, [CLEAN]),
    null: (route) => json(route, 200, null),
    'removed: false': (route) => json(route, 200, { ...CLEAN, removed: false }),
    'no removed': (route) => json(route, 200, { host: true, repo: true, sessions: true, seats: true })
  }
  for (const [name, onDelete] of Object.entries(bodies)) {
    const { page, book } = await open({ onDelete })
    await pressDelete(page, BETA)
    const shown = await result(page)
    assert.equal(shown.kind, 'unknown', name)
    assert.match(shown.text, new RegExp(`The result of deleting ${BETA} is unknown`), name)
    assert.match(shown.text, /may be deleted, partly deleted or unchanged/, name)
    assert.match(shown.text, new RegExp(`Site key: ${BETA}`), name)
    assert.doesNotMatch(await page.locator('body').innerText(), /Nothing was changed/, name)
    assert.deepEqual(shown.buttons.map((b) => b.trim()).filter(Boolean), ['Got it'], name)
    // The delete dialog does not stay open inviting another press.
    assert.equal(await page.locator('#tracy-delete-name').count(), 0, name)
    await acknowledge(page)
    assert.deepEqual(book.deletes, [BETA], name)
    await page.close()
  }
})

test('a request that never answered, or a server error, is an unknown result and the tab is usable again', async () => {
  const cases = {
    'connection lost': (route) => route.abort('connectionreset'),
    'HTTP 500': (route) => json(route, 500, { code: 'INTERNAL' }),
    'HTTP 502': (route) => route.fulfill({ status: 502, contentType: 'text/html', body: 'Bad Gateway' })
  }
  for (const [name, onDelete] of Object.entries(cases)) {
    const { page, book } = await open({ onDelete })
    await pressDelete(page, BETA)
    const shown = await result(page)
    assert.equal(shown.kind, 'unknown', name)
    assert.doesNotMatch(await page.locator('body').innerText(), /Nothing was changed/, name)
    await acknowledge(page)
    await page.waitForFunction((sel) => !document.querySelector(sel), RESULT, WAIT)
    assert.deepEqual(book.deletes, [BETA], `${name}: no automatic retry`)
    // Busy is released: the row menu opens another dialog whose button is live.
    await page.locator('tbody tr', { hasText: ALPHA }).getByRole('button', { name: 'More' }).click()
    await page.getByRole('menuitem', { name: 'Leave site' }).click()
    const leave = page.getByRole('button', { name: 'Leave the team' })
    await leave.waitFor(WAIT)
    assert.equal(await leave.isDisabled(), false, name)
    await page.close()
  }
})

test('a refusal stays a refusal in the dialog: the door’s words, no notice, the site untouched', async () => {
  const cases = [
    // The door's own 403s, each with its own sentence and a next step (#796).
    [
      403,
      { code: 'NOT_SITE_OWNER' },
      'Your role on this site does not allow this. Ask an Owner of the site to do it, or to change your role.'
    ],
    [
      403,
      { code: 'SEAT_NOT_AUTHORIZED' },
      'You no longer have a seat on this site. Reload the page to see your current sites, or ask an Owner or an Editor of that site to invite you again.'
    ],
    [
      403,
      { code: 'NOT_REPO_OWNER' },
      'That site’s repository is your own, so Tracy cannot delete it for you.'
    ],
    [429, { code: 'RATE_LIMITED' }, 'Too many changes this hour. Try again shortly.'],
    // A 403 with no code of the door's names no reason: the screen does not guess one.
    [
      403,
      'not json at all',
      'Tracy did not do that, and nothing was changed. Reload the page to see what is current, then try again.'
    ],
    // A refusal that happens to carry the success shape is still a refusal.
    [
      403,
      { removed: true, host: false },
      'Tracy did not do that, and nothing was changed. Reload the page to see what is current, then try again.'
    ],
    // Reworded by #796 (no internal name, a next step); still a refusal that changed nothing (#801).
    [
      404,
      { code: 'SITE_UNKNOWN' },
      'Tracy did not do that, and nothing was changed. Reload the page to see what is current, then try again.'
    ]
  ]
  for (const [status, body, words] of cases) {
    const { page, book } = await open({
      onDelete: (route) =>
        typeof body === 'string'
          ? route.fulfill({ status, contentType: 'text/plain', body })
          : json(route, status, body)
    })
    await pressDelete(page, BETA)
    const alert = page.locator('[role=dialog] [role=alert]')
    await alert.waitFor(WAIT)
    assert.equal((await alert.innerText()).trim(), words, `${status} ${JSON.stringify(body)}`)
    assert.equal(await page.locator(RESULT).count(), 0)
    assert.equal(await page.locator('#tracy-delete-name').count(), 1, 'the delete dialog stays open')
    assert.ok((await siteNames(page)).includes(BETA), 'the row is still listed')
    assert.equal(book.navigations, 0)
    await page.close()
  }
})

test('deleting the site this page stands in, the tab already unmounted: the notice shows, and the page leaves only after it is acknowledged', async () => {
  let release
  const held = new Promise((resolve) => {
    release = resolve
  })
  const { page, book } = await open({
    here: ALPHA,
    onDelete: async (route, b) => {
      await held
      return removes({ ...CLEAN, host: false, hostReason: 'TEARDOWN_NOT_CONFIRMED' })(route, b)
    }
  })
  await pressDelete(page, ALPHA)
  await page.waitForSelector('.tms-deleting-cover', WAIT)
  // dsh forgets the workspace while the request runs: the tab and its dialog are gone.
  await page.evaluate(() => window.__unmountTab())
  assert.equal(await page.locator('#tracy-delete-name').count(), 0)
  release()
  const shown = await result(page)
  assert.equal(shown.kind, 'partial')
  assert.match(shown.text, new RegExp(`${ALPHA} was deleted, but the cleanup is not complete`))
  assert.match(shown.text, /Reason: TEARDOWN_NOT_CONFIRMED/)
  // Readable and pressable: the button is the top element at its own centre, the waiting cover is not.
  const onTop = await page.evaluate((sel) => {
    const button = [...document.querySelectorAll(`${sel} button`)].find(
      (b) => b.innerText.trim() === 'Got it'
    )
    const box = button.getBoundingClientRect()
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
    return button.contains(hit)
  }, RESULT)
  assert.equal(onTop, true, 'nothing covers the acknowledge button')
  assert.equal(
    await page.locator('.tms-deleting-cover').count(),
    0,
    'the "taking you on" cover is not left up behind a notice'
  )
  // It waits: no navigation until the person has read it.
  await page.waitForTimeout(600)
  assert.equal(book.navigations, 0)
  assert.equal(new URL(page.url()).pathname, `/${ALPHA}/`)
  await acknowledge(page)
  await page.waitForURL(`${h.base}/`, WAIT)
  await page.waitForSelector('tbody tr', WAIT)
  assert.equal(book.navigations, 1, 'one navigation, after the acknowledgment')
  assert.deepEqual(await siteNames(page), [BETA])
  assert.deepEqual(book.deletes, [ALPHA])
  await page.close()
})

test('deleting the site this page stands in with an unknown result also waits for the acknowledgment', async () => {
  const { page, book } = await open({ here: ALPHA, onDelete: (route) => route.abort('connectionreset') })
  await pressDelete(page, ALPHA)
  const shown = await result(page)
  assert.equal(shown.kind, 'unknown')
  await page.waitForTimeout(400)
  assert.equal(book.navigations, 0)
  await acknowledge(page)
  // The root decides where a signed-in person lands, whether the site still exists or not.
  await page.waitForURL(`${h.base}/`, WAIT)
  assert.equal(book.navigations, 1)
  assert.deepEqual(book.deletes, [ALPHA])
  await page.close()
})

test('deleting the site this page stands in, everything confirmed: straight on to the next site, no notice', async () => {
  const { page, book } = await open({ here: ALPHA, onDelete: removes(CLEAN) })
  await pressDelete(page, ALPHA)
  await page.waitForURL(`${h.base}/`, WAIT)
  await page.waitForSelector('tbody tr', WAIT)
  assert.equal(await page.locator(RESULT).count(), 0)
  assert.equal(book.navigations, 1)
  await page.close()
})

test('deleting the last site listed: the list empties and the notice is still there to read', async () => {
  const { page, book } = await open({
    here: '',
    sites: [BETA],
    onDelete: removes({ ...CLEAN, repo: 'failed' })
  })
  await pressDelete(page, BETA)
  const shown = await result(page)
  assert.equal(shown.kind, 'partial')
  await page.waitForFunction(
    () => document.getElementById('panel').innerText.includes('You do not hold a seat on any site yet.'),
    null,
    WAIT
  )
  assert.equal(await page.locator(RESULT).count(), 1, 'the notice outlives the table')
  assert.match((await result(page)).text, /GitHub repository/)
  await acknowledge(page)
  await page.waitForFunction((sel) => !document.querySelector(sel), RESULT, WAIT)
  assert.equal(book.navigations, 0)
  assert.deepEqual(book.deletes, [BETA])
  await page.close()
})

test('two presses in one tick send one DELETE and show one notice', async () => {
  let release
  const held = new Promise((resolve) => {
    release = resolve
  })
  const { page, book } = await open({
    onDelete: async (route, b) => {
      await held
      return removes({ ...CLEAN, host: false })(route, b)
    }
  })
  await armDelete(page, BETA)
  await page.evaluate(() => {
    const confirm = [...document.querySelectorAll('[role=dialog] button')].find(
      (b) => b.innerText.trim() === 'Delete'
    )
    confirm.click()
    confirm.click()
  })
  await page.waitForTimeout(300)
  release()
  await result(page)
  await page.waitForTimeout(300)
  assert.deepEqual(book.deletes, [BETA])
  assert.equal(await page.locator(RESULT).count(), 1)
  await acknowledge(page)
  await page.waitForFunction((sel) => !document.querySelector(sel), RESULT, WAIT)
  assert.deepEqual(book.deletes, [BETA])
  await page.close()
})

test('a reason is shown as the text it is: markup in it is not rendered, a non-text reason is not reported', async () => {
  const markup = '<img src=x onerror="window.__xss=1"><b>bold</b>'
  const { page } = await open({
    onDelete: removes({
      ...CLEAN,
      host: false,
      hostReason: markup,
      sessions: false,
      sessionsReason: { a: 1 }
    })
  })
  await pressDelete(page, BETA)
  const shown = await result(page)
  assert.ok(shown.text.includes(`Reason: ${markup}`), shown.text)
  assert.match(shown.text, /Reason: not reported/)
  assert.doesNotMatch(shown.text, /\[object Object\]/)
  assert.equal(await page.locator(`${RESULT} img, ${RESULT} b`).count(), 0)
  assert.equal(await page.evaluate(() => window.__xss), undefined)
  await page.close()
})

for (const dark of [false, true]) {
  test(`at 360px${dark ? ', dark' : ''}: a notice with every part and a long reason stays inside the viewport, its button reachable`, async () => {
    const { page, book } = await open({
      viewport: { width: 360, height: 640 },
      dark,
      onDelete: removes({
        removed: true,
        host: false,
        hostReason: `TEARDOWN_FAILED: ${'unbroken-container-name-'.repeat(60)}`,
        repo: 'failed',
        sessions: false,
        sessionsReason: 'x'.repeat(5000),
        seats: false
      })
    })
    await pressDelete(page, BETA)
    await result(page)
    await page.waitForFunction(
      (sel) =>
        document
          .querySelector(sel)
          .getAnimations()
          .every((a) => a.playState !== 'running'),
      RESULT,
      WAIT
    )
    const geo = await page.evaluate((sel) => {
      const d = document.querySelector(sel)
      const box = (el) => {
        const b = el.getBoundingClientRect()
        return { left: b.left, right: b.right, top: b.top, bottom: b.bottom }
      }
      return {
        vw: document.documentElement.clientWidth,
        vh: window.innerHeight,
        scroll: document.documentElement.scrollWidth,
        inner: d.scrollWidth - d.clientWidth,
        dialog: box(d),
        close: box(d.querySelector('[data-slot="dialog-close"]'))
      }
    }, RESULT)
    assert.equal(geo.scroll, geo.vw, 'the page does not scroll sideways')
    assert.ok(geo.inner <= 0, `the notice does not scroll sideways (${geo.inner}px)`)
    for (const [part, b] of Object.entries({ dialog: geo.dialog, close: geo.close })) {
      assert.ok(
        b.left >= 0 && b.right <= geo.vw && b.top >= 0 && b.bottom <= geo.vh,
        `${part} inside the viewport ${JSON.stringify(b)}`
      )
    }
    assert.ok(geo.dialog.left >= 15.5 && geo.vw - geo.dialog.right >= 15.5, 'the 16px gutter survives')
    // The acknowledge button can be brought into view and pressed, however long the reasons run.
    const button = page.locator(RESULT).getByRole('button', { name: 'Got it' })
    await button.scrollIntoViewIfNeeded()
    const b = await button.boundingBox()
    assert.ok(b.x >= 0 && b.x + b.width <= geo.vw && b.y >= 0 && b.y + b.height <= geo.vh, JSON.stringify(b))
    await button.click()
    await page.waitForFunction((sel) => !document.querySelector(sel), RESULT, WAIT)
    assert.deepEqual(book.errors, [])
    await page.close()
  })
}

test('leaving a site still works the way it did', async () => {
  const { page, book } = await open({ onDelete: removes(CLEAN) })
  await page.locator('tbody tr', { hasText: BETA }).getByRole('button', { name: 'More' }).click()
  await page.getByRole('menuitem', { name: 'Leave site' }).click()
  await page.getByRole('button', { name: 'Leave the team' }).click()
  await page.waitForFunction((key) => !document.querySelector('tbody')?.innerText.includes(key), BETA, WAIT)
  assert.deepEqual(book.leaves, [BETA])
  assert.deepEqual(book.deletes, [])
  assert.equal(await page.locator(RESULT).count(), 0)
  assert.equal(book.navigations, 0)
  await page.close()
})
