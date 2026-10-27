// J11 — rights and isolation, on the run's shared WordPress site W (owner A) and a second site B of
// the same run held by another run account (owner B):
//   1. An editor of W calls the doors only an owner/admin may use — delete the site, promote
//      themselves, publish, invite an admin — and every one refuses; nothing changed afterwards.
//   2. Owner A, who holds no seat on B, is refused by B's doors (state, delete, seats, the site's
//      own `/__tracy/errors`).
//   3. CSRF: a write to the workspace origin carrying A's cookie but coming from a customer site's
//      origin (`Origin: https://<label>.tracy.site`, `Sec-Fetch-Site: same-site`) is refused, from
//      a script and from a real page on that site; the same write from Tracy's own origin passes.
//      The write is `POST /state {plan}` (rewriting the plan W already has); the page also fires
//      `POST /go-live {op: live}`, so a CSRF hole would publish W.
//   4. The file-tool fence (`FS_TOOL_ARGS`, `packages/tools/tracy-subprocess-docker/src/route.mjs`)
//      is a `tools/pre-execute` listener inside dsh: it judges tool calls the agent loop dispatches
//      for a MODEL's answer (`vendor/tracy/deepseek-harness/packages/core/agent-loop/src/agent.ts`,
//      `executeToolCalls`, the one dispatcher), and no door lets a client call `read`/`glob`/`grep`
//      itself. This suite does not chat in J11 and may not exec inside the dsh container (plan §2
//      D9), so after 1–3 the journey ends BLOCKED('no-door') for that part, and a bait file in B is
//      not written (writing one needs the same exec).

import { test } from 'node:test'
import { launch, roleContext } from '../lib/browser.mjs'
import { ENV, addressLabel, runEmail, runLabel } from '../lib/env.mjs'
import { Blocked, check, journey, runContext } from '../lib/journey.mjs'
import { goLive, noteChild, runAccount, sharedSite } from '../lib/run-site.mjs'
import { createSite, deleteSite, waitForJob } from '../lib/sites.mjs'

test('J11 rights and isolation', async (t) => {
  const run = runContext()
  const { runId, manifest, keep } = run
  await journey(t, { id: 'J11' }, async ({ details }) => {
    const ownerA = await runAccount(run, 'owner')
    const w = await sharedSite(run, ownerA, 'wordpress')
    const wPath = `/api/sites/${encodeURIComponent(w.siteKey)}`
    details.w = { siteKey: w.siteKey, reused: !w.created }

    // ── 1. an editor of W at owner-only doors ───────────────────────────────────────────────────
    const editor = await runAccount(run, 'isoeditor')
    const invite = await ownerA.post('/api/team/invite', {
      emails: [editor.email],
      role: 'editor',
      siteKeys: [w.siteKey]
    })
    noteChild(manifest, w.siteKey, { seat: editor.email, role: 'editor', by: 'J11' })
    const accept = await editor.post(`${wPath}/accept`)
    details.editorSeat = {
      invite: invite.status,
      outcome: invite.json?.results?.[0]?.sites?.[0]?.outcome ?? null,
      accept: accept.status
    }
    check(invite.status === 200, `owner's invite answered ${invite.status} ${invite.json?.code ?? ''}`)
    check(
      accept.status === 200 && accept.json?.accepted === true,
      `editor's accept answered ${accept.status}`
    )

    const team = await ownerA.get('/api/team')
    const book = (team.json?.sites ?? []).find((s) => s.siteKey === w.siteKey)?.seats ?? []
    const editorRow = book.find((s) => s.email === editor.email)
    check(editorRow?.role === 'editor', `the editor's row reads ${JSON.stringify(editorRow?.role)}`)

    const refused = {}
    const del = await editor.delete(wPath)
    refused.deleteSite = { status: del.status, code: del.json?.code ?? null }
    const promote = await editor.request(`${wPath}/seats/${editorRow.id}`, {
      method: 'PATCH',
      json: { role: 'admin' }
    })
    refused.promoteSelf = { status: promote.status, code: promote.json?.code ?? null }
    const publish = await editor.post(`${wPath}/go-live`, { op: 'live' })
    refused.publish = { status: publish.status, code: publish.json?.code ?? null }
    const adminInvite = await editor.post('/api/team/invite', {
      emails: [runEmail(runId, 'nobody')],
      role: 'admin',
      siteKeys: [w.siteKey]
    })
    const inviteOutcome = adminInvite.json?.results?.[0]?.sites?.[0] ?? null
    refused.inviteAdmin = { status: adminInvite.status, outcome: inviteOutcome }
    details.editorRefused = refused
    check(del.status === 403, `editor DELETE site answered ${del.status} ${del.json?.code ?? ''}`)
    check(
      promote.status === 403,
      `editor PATCH own seat to admin answered ${promote.status} ${promote.json?.code ?? ''}`
    )
    check(
      publish.status === 403,
      `editor POST go-live live answered ${publish.status} ${publish.json?.code ?? ''}`
    )
    check(
      inviteOutcome?.outcome === 'refused',
      `editor inviting an admin was not refused: ${JSON.stringify(inviteOutcome)} (HTTP ${adminInvite.status})`
    )
    const stateAfter = await ownerA.get(`${wPath}/state`)
    const teamAfter = await ownerA.get('/api/team')
    const bookAfter = (teamAfter.json?.sites ?? []).find((s) => s.siteKey === w.siteKey)?.seats ?? []
    details.afterEditor = {
      publish: stateAfter.json?.publish ?? null,
      editorRole: bookAfter.find((s) => s.email === editor.email)?.role ?? null,
      seats: bookAfter.length
    }
    check(
      details.afterEditor.publish === 'draft',
      `W reads ${details.afterEditor.publish} after the editor's tries`
    )
    check(
      details.afterEditor.editorRole === 'editor',
      `the editor's role reads ${details.afterEditor.editorRole}`
    )

    // ── 2. site B, held by another account ─────────────────────────────────────────────────────
    const ownerB = await runAccount(run, 'ownerb')
    const labelB = runLabel(runId, 'b')
    let bKey = null
    try {
      const made = await createSite(ownerB, manifest, {
        label: labelB,
        platform: 'wordpress',
        ...ENV.builds.wordpress
      })
      bKey = made.siteKey
      const job = await waitForJob(ownerB, bKey, made.jobId, ENV.readyCapMs)
      details.b = { siteKey: bKey, job: job.state, ms: job.ms }
      check(job.state === 'done', `site B's job ended ${job.state}`)
      const bPath = `/api/sites/${encodeURIComponent(bKey)}`
      const bOrigin = `https://${addressLabel(labelB)}.${ENV.siteDomain}`
      const ownerBRow = await ownerB.get('/api/team')
      const bOwnerId =
        (ownerBRow.json?.sites ?? [])
          .find((s) => s.siteKey === bKey)
          ?.seats?.find((s) => s.email === ownerB.email)?.id ?? null
      const cross = {}
      for (const [who, c] of [
        ['ownerA', ownerA],
        ['editorOfW', editor]
      ]) {
        const state = await c.get(`${bPath}/state`)
        const errors = await c.get(`${bOrigin}/__tracy/errors`)
        const remove = await c.delete(bPath)
        const seat = bOwnerId
          ? await c.request(`${bPath}/seats/${bOwnerId}`, { method: 'PATCH', json: { role: 'editor' } })
          : null
        cross[who] = {
          state: state.status,
          siteErrorsDoor: errors.status,
          deleteSite: remove.status,
          demoteOwner: seat?.status ?? null
        }
        check(state.status === 403, `${who} read B's state: ${state.status}`)
        check(errors.status === 403, `${who} read B's /__tracy/errors: ${errors.status}`)
        check(remove.status === 403, `${who} DELETE B: ${remove.status}`)
        check(seat?.status === 403, `${who} PATCH B's owner seat: ${seat?.status ?? 'no owner id'}`)
      }
      details.crossSite = cross
      const bState = await ownerB.get(`${bPath}/state`)
      check(
        bState.status === 200,
        `B no longer answers its owner (${bState.status}) after the cross-site tries`
      )
    } finally {
      if (bKey && !keep) {
        const gone = await deleteSite(ownerB, bKey, addressLabel(labelB))
        manifest.mark('site', bKey, gone.state, gone.detail)
        details.bDelete = gone.state
      }
    }

    // ── 3. CSRF from a customer site's origin ───────────────────────────────────────────────────
    const foreign = w.origin
    const plan = (await ownerA.get(`${wPath}/state`)).json?.plan ?? 'standard'
    const fromSite = await ownerA.post(`${wPath}/state`, { plan }, { headers: { origin: foreign } })
    const fromSiteFetchMeta = await ownerA.post(
      `${wPath}/state`,
      { plan },
      { headers: { origin: foreign, 'sec-fetch-site': 'same-site' } }
    )
    const fromTracy = await ownerA.post(
      `${wPath}/state`,
      { plan },
      { headers: { origin: ENV.origin, 'sec-fetch-site': 'same-origin' } }
    )
    details.csrf = {
      originHeader: { status: fromSite.status, code: fromSite.json?.code ?? null },
      fetchMetadata: { status: fromSiteFetchMeta.status, code: fromSiteFetchMeta.json?.code ?? null },
      ownOrigin: fromTracy.status
    }
    check(
      fromSite.status === 403 && fromSite.json?.code === 'CSRF_ORIGIN',
      `a write with Origin ${foreign} answered ${fromSite.status} ${fromSite.json?.code ?? ''}`
    )
    check(
      fromSiteFetchMeta.status === 403 && fromSiteFetchMeta.json?.code === 'CSRF_ORIGIN',
      `a same-site write answered ${fromSiteFetchMeta.status} ${fromSiteFetchMeta.json?.code ?? ''}`
    )
    check(fromTracy.status === 200, `the same write from Tracy's own origin answered ${fromTracy.status}`)

    // A real page on the customer site, holding A's cookie, fires the write the way an attacker's
    // script would. The answer is opaque to it (no-cors), so the effect is read back instead.
    const browser = await launch()
    try {
      const ctx = await roleContext(browser, { name: 'owner', token: ownerA.token })
      const page = await ctx.newPage()
      await page.goto(`${foreign}/`, { waitUntil: 'load', timeout: 90_000 })
      const fired = await page.evaluate(
        async ({ url }) => {
          const answers = []
          for (const type of ['text/plain', 'application/json']) {
            try {
              const r = await fetch(url, {
                method: 'POST',
                mode: 'no-cors',
                credentials: 'include',
                headers: { 'content-type': type },
                body: JSON.stringify({ op: 'live' })
              })
              answers.push(`${type}: ${r.type}`)
            } catch (error) {
              answers.push(`${type}: threw ${String(error).slice(0, 80)}`)
            }
          }
          return answers
        },
        { url: `${ENV.origin}${wPath}/go-live` }
      )
      await ctx.close()
      const state = await ownerA.get(`${wPath}/state`)
      details.csrfBrowser = {
        fired,
        publishAfter: state.json?.publish ?? null,
        operationAfter: state.json?.operation ?? null
      }
      check(
        state.json?.publish === 'draft' && !state.json?.operation,
        `a write fired from ${foreign} moved W: ${state.json?.publish}, operation ${JSON.stringify(state.json?.operation)}`
      )
    } finally {
      // Whatever happened above, the shared site goes back to draft for the journeys after this one.
      const now = (await ownerA.get(`${wPath}/state`)).json
      if (now?.publish !== 'draft' || now?.operation) await goLive(ownerA, w.siteKey, 'draft')
      await browser.close()
    }

    // ── 4. the file-tool fence ──────────────────────────────────────────────────────────────────
    throw new Blocked(
      'no-door: the FS_TOOL_ARGS fence judges only tool calls the agent loop dispatches for a model' +
        ' (executeToolCalls); no door lets a client call read/glob/grep under session A, J11 does not chat,' +
        ' and the suite may not exec in tracy-dsh — so "A reads a bait file in B" is not exercised' +
        ' (doors, cross-site and CSRF checks above all passed)',
      'no-door'
    )
  })
})
