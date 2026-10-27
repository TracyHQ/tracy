// J4a — the agent edits a FILE through chat → Site changes (Activity V2) has the turn with its
// file → the diff opens → Undo puts the file back.
//
// The file is known in advance: the active theme's `style.css`, which every WordPress theme has
// and which the site serves as a static file, so its content is read before and after over HTTP
// with no shell on the dev host. The prompt asks for one line carrying the run id.
//
// Verdicts per step (plan §2 D4): the agent not writing the line is BLOCKED(model) for what depends
// on it; a line that landed on disk without an Activity row, a diff or a working Undo is FAIL.

import { test } from 'node:test'
import { launch, roleContext } from '../lib/browser.mjs'
import { activityV2, chatTurn, openWorkspace } from '../lib/chat-turn.mjs'
import { triage } from '../lib/errors.mjs'
import { Blocked, check, journey, runContext, writeEvidence } from '../lib/journey.mjs'
import { readSiteFile, runAccount, sharedSite, wordpressTheme } from '../lib/run-site.mjs'

test('J4a chat edits a file, then undo', async (t) => {
  const run = runContext()
  const { runId, runDir, cms } = run
  const platform = cms.includes('wordpress') ? 'wordpress' : cms[0]
  await journey(t, { id: 'J4a', cms: platform, retries: 1 }, async ({ attempt, details, notes }) => {
    if (platform !== 'wordpress')
      throw new Blocked(`J4a knows its file only on WordPress (asked for ${platform})`, 'coverage')
    const owner = await runAccount(run)
    const site = await sharedSite(run, owner, platform)
    details.site = { siteKey: site.siteKey, created: site.created, readyMs: site.readyMs }
    const key = encodeURIComponent(site.siteKey)

    // ── the file before ───────────────────────────────────────────────────────────────────────
    const { slug } = await wordpressTheme(site.origin, owner)
    check(slug, 'the home page names no theme under wp-content/themes/')
    const path = `wp-content/themes/${slug}/style.css`
    const before = await readSiteFile(site.origin, path, owner)
    check(before.status === 200, `${path} answered ${before.status} before the chat`)
    const marker = `e2e-${runId}-j4a${attempt}`
    check(!before.text.includes(marker), 'the marker is already in the file')
    details.file = { path, beforeBytes: before.text.length }

    // ── the chat turn ─────────────────────────────────────────────────────────────────────────
    const browser = await launch()
    let turn
    try {
      const ctx = await roleContext(browser, { name: 'owner', token: owner.token })
      const page = await ctx.newPage()
      ctx.step('workspace')
      const opened = await openWorkspace(page, site.siteKey)
      details.workspace = opened
      ctx.step('chat')
      const text = `Append this exact line at the very end of the file ${path} in the site's files: /* ${marker} */ — change nothing else, and do not change any content in the database.`
      turn = await chatTurn({
        runDir,
        journey: 'J4a',
        page,
        client: owner,
        siteKey: site.siteKey,
        text,
        match: marker
      })
      const { fails, notes: errNotes } = triage(ctx.eventsOf('chat'), { siteLabels: [site.label] })
      details.chatErrors = fails.slice(0, 5).map((e) => ({ owner: e.owner, message: e.message, url: e.url }))
      for (const n of errNotes.slice(0, 5)) notes.push(`${n.owner}: ${n.message ?? ''} ${n.url ?? ''}`.trim())
      check(
        fails.length === 0,
        `${fails.length} Tracy browser error(s) during the chat: ${fails
          .map((e) => e.message)
          .join(' | ')
          .slice(0, 300)}`
      )
    } finally {
      await browser.close()
    }
    const row = turn.row
    details.turn = {
      id: row.id,
      kind: row.kind,
      firstRowMs: turn.firstRowMs,
      closedMs: turn.closedMs,
      files: row.effects?.files ?? null,
      content: row.effects?.content?.operations ?? null,
      capabilities: row.capabilities ?? null,
      commitSha: row.evidence?.commitSha ?? null
    }

    // ── did the agent write the line? (model) ─────────────────────────────────────────────────
    const after = await readSiteFile(site.origin, path, owner)
    details.file.afterBytes = after.text.length
    if (!after.text.includes(marker)) {
      if ((row.effects?.files?.count ?? 0) > 0)
        notes.push(`the turn changed ${row.effects.files.count} file(s), but not with the marker in ${path}`)
      throw new Blocked(`the agent did not write the marker into ${path}`, 'model')
    }

    // ── Site changes: the turn row with its file (mechanism) ──────────────────────────────────
    check(row.kind === 'turn', `the prompt's Activity V2 row is kind ${row.kind}, not turn`)
    check(
      (row.effects?.files?.count ?? 0) >= 1,
      `the turn row records ${row.effects?.files?.count ?? 0} changed files (state ${row.effects?.files?.state})`
    )
    const sha = row.evidence?.commitSha ?? row.effects?.files?.sha
    check(typeof sha === 'string' && sha.length >= 7, 'the turn row names no commit')
    check(
      row.capabilities?.canDiff === true,
      `canDiff is ${row.capabilities?.canDiff} (${(row.capabilities?.reasons ?? []).join(', ')})`
    )
    check(
      row.capabilities?.canUndoFiles === true,
      `canUndoFiles is ${row.capabilities?.canUndoFiles} (${(row.capabilities?.reasons ?? []).join(', ')})`
    )

    // ── the diff opens ────────────────────────────────────────────────────────────────────────
    const files = await owner.get(`/api/sites/${key}/moments/${sha}/files`)
    const listed = (files.json?.files ?? []).map((f) => `${f.status} ${f.path}`)
    details.momentFiles = { status: files.status, files: listed.slice(0, 20) }
    check(files.status === 200, `/moments/${sha}/files answered ${files.status} ${files.json?.code ?? ''}`)
    const entry = (files.json?.files ?? []).find(
      (f) => String(f.path).endsWith(path) || path.endsWith(String(f.path))
    )
    check(entry, `the moment's files do not list ${path}: ${listed.join(', ')}`)
    const diff = await owner.get(
      `/api/sites/${key}/file-diff?path=${encodeURIComponent(entry.path)}&sha=${sha}`
    )
    details.diff = {
      status: diff.status,
      truncated: diff.json?.truncated ?? null,
      hasMarker: String(diff.json?.diff ?? '').includes(marker)
    }
    check(diff.status === 200, `/file-diff answered ${diff.status} ${diff.json?.code ?? ''}`)
    check(details.diff.hasMarker, 'the diff does not show the added line')

    // ── Undo → the file is as before ──────────────────────────────────────────────────────────
    const undo = await owner.post(
      `/api/sites/${key}/restore`,
      { mode: 'undo', sha, idemKey: `e2e-${runId}-j4a-${attempt}` },
      { timeoutMs: 180_000 }
    )
    details.undo = {
      status: undo.status,
      code: undo.json?.code ?? null,
      files: undo.json?.files ?? null,
      opStatus: undo.json?.status ?? null
    }
    check(
      undo.status === 200 && undo.json?.ok === true,
      `undo answered ${undo.status} ${undo.json?.code ?? ''} ${JSON.stringify(undo.json?.files ?? '')}`
    )
    const restored = await readSiteFile(site.origin, path, owner)
    details.file.restoredBytes = restored.text.length
    check(!restored.text.includes(marker), 'the marker is still in the file after Undo')
    check(
      restored.text === before.text,
      `the file after Undo differs from before (${restored.text.length} vs ${before.text.length} bytes)`
    )

    // The undo is itself a row, and the turn says it was undone.
    const rows = await activityV2(owner, site.siteKey)
    const again = rows.find((r) => r.id === row.id)
    details.afterUndo = {
      reversal: again?.reversal?.state ?? null,
      operationRow: rows.some(
        (r) => r.kind === 'operation' && (r.evidence?.targetSha === sha || r.evidence?.commitSha)
      )
    }
    check(
      again?.reversal?.state === 'undone',
      `the turn's reversal reads ${again?.reversal?.state ?? 'nothing'} after Undo`
    )
    writeEvidence(runDir, `J4a-${platform}-turn.json`, row)
  })
})
