#!/usr/bin/env node
/**
 * One import from start to finish — `packages/site/tracy-add-site/src/host/run.ts`.
 *
 *   npx tsx --test scripts/test/host-run.test.ts
 *
 * FOUR THINGS WORTH PINNING, and three of them are about safety, not features:
 *
 *   1. **The password NEVER leaves through `RunState`.** That object is what the `status` door returns straight to
 *      the browser, every few seconds. One extra field here is the customer's admin password crossing the
 *      network dozens of times per import.
 *   2. **Database first, webroot after.** Not aesthetics: the db takes tens of seconds, the webroot tens
 *      of minutes. In the wrong order, a run failing on a bad code shows up after half an hour instead of half a minute.
 *   3. **A failed sign-in STOPS**, it does not go on with a session it does not have.
 *   4. **A hand-pasted code skips sign-in entirely** — that is the whole reason path (b) exists for sites with
 *      two-factor authentication.
 */

import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, mock, test } from 'node:test'

/**
 * 🔒 `$DSH_HOME` MUST POINT AT A TEMP DIRECTORY, and this is not idle ritual.
 *
 * The host half writes the extension code (`tokens.ts`) and the upload cursor (`resume.ts`) into `$DSH_HOME`. Without
 * that variable they fall back to `process.cwd()`, and the cwd of a `node --test` run is the REPO ROOT — so the suite
 * spawns `tracy-add-site/uploads.json` right in the working tree. It slipped into `git status` once, and
 * the next time the format gate went red over a file nobody wrote.
 *
 * Set at module level, before any `test()`: the first write happens as soon as a run is opened.
 */
process.env.DSH_HOME = mkdtempSync(path.join(tmpdir(), 'tracy-add-site-run-'))

/**
 * 🔒 A FRESH `$DSH_HOME` FOR EACH TEST, and this is what keeps the tests below measuring what they claim.
 *
 * `$DSH_HOME` holds not only the extension code: it also holds the HANDOVER BOOK (`handovers.json`). A finished read
 * sitting in that book is the FIRST thing `execute()` handles — `takeOrSweep()` at `run.ts:172` returns it
 * and the run ends `done` at once, before the sign-in step, before a single fetch. And
 * `heldHandover()` does NOT delete the row while it is fresh, so one written row serves every test after it.
 *
 * Every test here shares one `siteKey`, so the first test that runs to completion writes such a row and
 * turns every later test into "take back the old run" instead of what it meant to check. Measured 04/09: two tests red, while
 * running each one ALONE made both green — the mark of leaked state, not of broken code.
 *
 * `bookPath()` reads `process.env.DSH_HOME` on EVERY call, so resetting the variable between tests is enough; no
 * file cleanup needed. The module-level line above keeps its role: it blocks the write that happens
 * at import, before the first `beforeEach` gets to run.
 */
beforeEach(() => {
  process.env.DSH_HOME = mkdtempSync(path.join(tmpdir(), 'tracy-add-site-run-'))
})

afterEach(() => {
  mock.timers.reset()
})

import { runStatus, startRun } from '../../packages/site/tracy-add-site/src/host/run.ts'

const MANIFEST = {
  version: '0.8.19',
  package: 'https://github.com/TracyHQ/claude-cowork/releases/download/joomla-v0.8.19/pkg.zip',
  url: 'https://github.com/TracyHQ/claude-cowork/releases/tag/joomla-v0.8.19'
}

interface Seen {
  url: string
  action?: string
}

/**
 * The whole outside world, faked: the manifest, `cowork-web`'s artifact door, and the component on the site.
 *
 * There is NO "sign-in fails" switch, and its absence is deliberate: the admin page here ALWAYS reads
 * as "not signed in", so every interactive sign-in fails, while every success path in
 * this file goes around that step with a pre-pasted code. An earlier version had a `failLogin` parameter whose TWO BRANCHES
 * returned exactly the same — a knob wired to nothing, which read as if the failing case had been built separately.
 * Measured 04/09: with the flag off, those two tests stayed green.
 */
function world(): { seen: Seen[]; restore: () => void } {
  const seen: Seen[] = []
  const real = globalThis.fetch

  globalThis.fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input)
    let action: string | undefined
    if (typeof init.body === 'string' && init.body.startsWith('{')) {
      action = (JSON.parse(init.body) as { action?: string }).action
    }
    seen.push({ url, action })

    if (url.includes('raw.githubusercontent.com')) return Response.json(MANIFEST)

    // `cowork-web`'s artifact door.
    if (url.includes('/artifacts/put'))
      return Response.json({ key: 'sites/x/db.sql.gz', url: 'https://r2/db' })
    if (url.includes('/artifacts/begin')) return Response.json({ key: 'sites/x/webroot.tar', uploadId: 'u1' })
    if (url.includes('/artifacts/part')) return Response.json({ url: 'https://r2/part-1' })
    if (url.includes('/artifacts/finish')) return Response.json({ done: true })

    // The PUT straight to storage.
    if (url.startsWith('https://r2/')) return new Response('', { status: 200, headers: { etag: '"e1"' } })

    // The component on the site.
    if (url.includes('option=com_claudecowork')) {
      if (action === 'db.tables') return Response.json({ ok: true, tables: ['#__content'] })
      if (action === 'db.dump') {
        return Response.json({
          ok: true,
          sql_b64: Buffer.from('INSERT INTO x;').toString('base64'),
          done: true,
          rows: 12,
          total: 12
        })
      }
      if (action === 'files.pack') {
        return Response.json({
          ok: true,
          etag: '"e1"',
          files: 40,
          bytes: 1024,
          next_path: '',
          next_offset: 0,
          done: true
        })
      }
      return Response.json({ ok: true, component: '0.8.19' })
    }

    // The site's admin page — only the sign-in path gets here, and it is always the sign-in page.
    // `adminPageState()` reads it as `out`, so `loginToAdmin` returns `invalid_credential`. The two tests
    // below rely on exactly that; turning this into a signed-in page would make them green while
    // checking nothing.
    return new Response('<html><title>Login</title></html>', { status: 200 })
  }) as unknown as typeof fetch

  return {
    seen,
    restore: () => {
      globalThis.fetch = real
    }
  }
}

/** Wait until the run stops for good (`done` or `error`). */
async function settled(id: string, tries = 200): Promise<ReturnType<typeof runStatus>> {
  for (let attempt = 0; attempt < tries; attempt++) {
    const run = runStatus(id)
    if (run && run.state !== 'running') return run
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  return runStatus(id)
}

/** Advance the mocked pacing timers while waiting for a run to finish. */
async function pacedSettled(id: string, budget = 20_000): Promise<ReturnType<typeof runStatus>> {
  for (let turn = 0; turn < budget; turn++) {
    const run = runStatus(id)
    if (run && run.state !== 'running') return run
    await new Promise((resolve) => setImmediate(resolve))
    mock.timers.runAll()
  }
  throw new Error('run did not settle')
}

test('a hand-pasted code goes straight to the export — not a single call to the admin page', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 })
  const { seen, restore } = world()
  try {
    const started = startRun({
      siteKey: 'tiembanh.com',
      platform: 'joomla',
      token: 'tok-from-customer',
      webRootUrl: 'https://tiembanh.com',
      origin: 'https://cowork.tracy.ai',
      cookie: 'tracy_sess=abc'
    })
    const run = await pacedSettled(started.id)

    assert.equal(run?.state, 'done', `the run must finish, error: ${run?.error ?? 'none'}`)
    assert.deepEqual(run?.result, {
      webrootKey: 'sites/x/webroot.tar',
      dbKey: 'sites/x/db.sql.gz',
      liveSite: 'https://tiembanh.com'
    })
    // Path (b) exists for sites Tracy CANNOT sign in to. If it still visits the admin page, it does
    // not solve the very case it was made to solve.
    assert.equal(
      seen.filter((one) => one.url.includes('/administrator')).length,
      0,
      'must not touch the admin page when a code is held'
    )
  } finally {
    restore()
  }
})

test('DATABASE first, WEBROOT after — the cheap one fails before the expensive one', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 })
  const { seen, restore } = world()
  try {
    const started = startRun({
      siteKey: 'tiembanh.com',
      platform: 'joomla',
      token: 'tok',
      webRootUrl: 'https://tiembanh.com',
      origin: 'https://cowork.tracy.ai',
      cookie: 'tracy_sess=abc'
    })
    await pacedSettled(started.id)

    const dbAt = seen.findIndex((one) => one.action === 'db.tables')
    const filesAt = seen.findIndex((one) => one.action === 'files.pack')
    assert.ok(dbAt >= 0 && filesAt >= 0, 'both parts must run')
    assert.ok(dbAt < filesAt, 'the database must go before the webroot')
  } finally {
    restore()
  }
})

test('NO password in what the status door returns', async () => {
  const { restore } = world()
  try {
    const started = startRun({
      siteKey: 'tiembanh.com',
      platform: 'joomla',
      adminUrl: 'https://tiembanh.com/administrator',
      username: 'admin',
      password: 'sup3r-s3cret-pw',
      origin: 'https://cowork.tracy.ai',
      cookie: 'tracy_sess=abc'
    })
    const run = await settled(started.id)
    // The whole object, as text: a password field slipping in anywhere in it gets caught.
    const asText = JSON.stringify(run)
    assert.ok(!asText.includes('sup3r-s3cret-pw'), 'the password must not appear in RunState')
    assert.ok(!asText.includes('tracy_sess'), 'nor the session cookie')
  } finally {
    restore()
  }
})

test('a failed sign-in stops there, not going on with a session it does not have', async () => {
  const { seen, restore } = world()
  try {
    const started = startRun({
      siteKey: 'tiembanh.com',
      platform: 'joomla',
      adminUrl: 'https://tiembanh.com/administrator',
      username: 'admin',
      password: 'wrong',
      origin: 'https://cowork.tracy.ai',
      cookie: 'tracy_sess=abc'
    })
    const run = await settled(started.id)

    assert.equal(run?.state, 'error')
    // A code, not a sentence — the surface owns the words, and four refusals are four.
    assert.ok(
      ['unreachable', 'invalid_credential', 'admin_form_not_found'].includes(run?.error ?? ''),
      run?.error
    )
    assert.equal(seen.filter((one) => one.action === 'db.tables').length, 0, 'must export nothing')
    assert.equal(seen.filter((one) => one.url.includes('/artifacts/')).length, 0, 'must not touch storage')
  } finally {
    restore()
  }
})

test('neither an account nor a held code → say so, do not quietly carry on', async () => {
  const { restore } = world()
  try {
    const started = startRun({
      siteKey: 'chua-tung-thay.com',
      platform: 'wordpress',
      origin: 'https://cowork.tracy.ai',
      cookie: 'tracy_sess=abc'
    })
    const run = await settled(started.id)
    assert.equal(run?.state, 'error')
    assert.equal(run?.error, 'credentials_required')
  } finally {
    restore()
  }
})

test('the installed version is read from `info.component` — the wrong level reinstalls over the customer site every run', async () => {
  // 🔒 THIS SHAPE WAS MEASURED ON A REAL SITE, not inferred. `tracy.ai`, 31/08/2026:
  //
  //     {"ok":true,"info":{"php":"8.3.33","wordpress":"7.0.2","component":"0.8.0"}}
  //
  // The first version of `readSiteInfo` read `result.plugin ?? result.version` at the OUTER LEVEL, so it always
  // got `undefined` — and `needsInstall` reads `undefined` as "older". The result: every
  // import reinstalled the extension over the customer's site even though it was already the latest. It really happened, on the very
  // first real run, on a production site.
  //
  // This test pins that shape. If someone reads the wrong level again, the install runs and `seen` has
  // a call to `plugin-install.php` — which the assertion below catches.
  const { seen, restore } = world()
  try {
    const started = startRun({
      siteKey: 'tiembanh.com',
      platform: 'joomla',
      token: 'tok',
      webRootUrl: 'https://tiembanh.com',
      origin: 'https://cowork.tracy.ai',
      cookie: 'tracy_sess=abc'
    })
    await settled(started.id)
    assert.equal(
      seen.filter((one) => one.url.includes('plugin-install') || one.url.includes('com_installer')).length,
      0,
      'an extension already at the right version must NOT be reinstalled'
    )
  } finally {
    restore()
  }
})
