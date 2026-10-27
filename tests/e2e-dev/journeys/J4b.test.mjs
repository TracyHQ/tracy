// J4b — the agent edits CONTENT in the database through chat (the site tagline, which lives in the
// CMS database and never in a git commit) → the home page shows it → `apply.revert` of that write
// → the old value is back, in the database and on the page.
//
// The write's id comes from `GET /api/sites/:key/applies?session=<dsh session>`, the list the chat
// itself reads to offer an undo (#295). Verdicts as in J4a: the agent not changing the tagline is
// BLOCKED(model); a change that cannot be found, reverted or seen reverted is FAIL.

import { test } from 'node:test'
import { launch, roleContext } from '../lib/browser.mjs'
import { chatTurn, openWorkspace } from '../lib/chat-turn.mjs'
import { Blocked, check, journey, runContext, writeEvidence } from '../lib/journey.mjs'
import { readTagline, runAccount, sharedSite } from '../lib/run-site.mjs'

test('J4b chat edits database content, then apply.revert', async (t) => {
  const run = runContext()
  const { runId, runDir, cms } = run
  const platform = cms.includes('wordpress') ? 'wordpress' : cms[0]
  await journey(t, { id: 'J4b', cms: platform, retries: 1 }, async ({ attempt, details, notes }) => {
    if (platform !== 'wordpress')
      throw new Blocked(`J4b knows its content field only on WordPress (asked for ${platform})`, 'coverage')
    const owner = await runAccount(run)
    const site = await sharedSite(run, owner, platform)
    details.site = { siteKey: site.siteKey, created: site.created }
    const key = encodeURIComponent(site.siteKey)

    const before = await readTagline(owner, site.siteKey)
    details.before = { status: before.status, value: before.value }
    if (before.value === null) details.beforeBody = before.body
    check(
      before.status === 200 && before.value !== null,
      `content.get blogdescription answered ${before.status} ${before.body?.code ?? ''}`
    )
    const wanted = `E2E ${runId} j4b${attempt}`

    // ── the chat turn ─────────────────────────────────────────────────────────────────────────
    const browser = await launch()
    let turn
    try {
      const ctx = await roleContext(browser, { name: 'owner', token: owner.token })
      const page = await ctx.newPage()
      details.workspace = await openWorkspace(page, site.siteKey)
      const text = `Change the site tagline to '${wanted}'. Change nothing else.`
      turn = await chatTurn({
        runDir,
        journey: 'J4b',
        page,
        client: owner,
        siteKey: site.siteKey,
        text,
        match: wanted
      })
    } finally {
      await browser.close()
    }
    const row = turn.row
    const sessionId = row.conversation?.sessionId ?? null
    details.turn = {
      id: row.id,
      closedMs: turn.closedMs,
      content: row.effects?.content ?? null,
      settings: row.effects?.settings ?? null,
      files: row.effects?.files ?? null,
      sessionId
    }

    // ── did the agent change it? (model) ──────────────────────────────────────────────────────
    const changed = await readTagline(owner, site.siteKey)
    details.changed = { value: changed.value }
    if (changed.value !== wanted)
      throw new Blocked(`the tagline reads ${JSON.stringify(changed.value)} after the turn`, 'model')
    const home = await owner.get(`${site.origin}/?e2e=${Date.now()}`, {
      headers: { accept: 'text/html' },
      timeoutMs: 90_000
    })
    details.homeShowsNew = home.text.includes(wanted)
    check(home.status === 200, `home page answered ${home.status}`)
    if (!details.homeShowsNew)
      notes.push('the home page of this template does not print the tagline; judged on the database value')

    // ── the write is on record in Activity V2 and in /applies (mechanism) ─────────────────────
    const ops = (row.effects?.content?.operations ?? 0) + (row.effects?.settings?.operations ?? 0)
    check(ops >= 1, `the turn row records ${ops} content/settings operations for a database change`)
    check(typeof sessionId === 'string' && sessionId !== '', 'the turn row names no conversation session')
    const applies = await owner.get(`/api/sites/${key}/applies?session=${encodeURIComponent(sessionId)}`)
    const ids = applies.json?.applyIds ?? []
    details.applies = {
      status: applies.status,
      applyIds: ids,
      actions: (applies.json?.applies ?? []).map((a) => `${a.action}:${a.ok}`)
    }
    check(applies.status === 200, `/applies answered ${applies.status} ${applies.json?.code ?? ''}`)
    check(ids.length >= 1, 'the session lists no write to revert')

    // ── apply.revert, newest first ────────────────────────────────────────────────────────────
    details.reverts = []
    for (const id of [...ids].reverse()) {
      const res = await owner.post(`/api/sites/${key}/apply`, {
        action: 'apply.revert',
        params: { apply_id: id }
      })
      details.reverts.push({ id, status: res.status, ok: res.json?.ok ?? null, code: res.json?.code ?? null })
      check(
        res.status === 200 && res.json?.ok !== false,
        `apply.revert ${id} answered ${res.status} ${res.json?.code ?? res.json?.error ?? ''}`
      )
    }
    const reverted = await readTagline(owner, site.siteKey)
    details.reverted = { value: reverted.value }
    check(
      reverted.value === before.value,
      `the tagline reads ${JSON.stringify(reverted.value)} after apply.revert, expected ${JSON.stringify(before.value)}`
    )
    const home2 = await owner.get(`${site.origin}/?e2e=${Date.now()}r`, {
      headers: { accept: 'text/html' },
      timeoutMs: 90_000
    })
    check(!home2.text.includes(wanted), 'the home page still shows the new tagline after apply.revert')
    writeEvidence(runDir, `J4b-${platform}-turn.json`, row)
  })
})
