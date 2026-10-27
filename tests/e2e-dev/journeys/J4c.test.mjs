// J4c — Backup → one file change and one database change → Restore → BOTH are back at the backup.
//
// The database change goes straight through the Apply door (the tagline, no prompt spent); the
// file change needs the agent, since no door of tracy-web writes a webroot file for a person, so
// it costs one prompt. Restore is `POST /restore {mode: 'everything', version}`, which puts back
// the files and the database of that backup.

import { test } from 'node:test'
import { launch, roleContext } from '../lib/browser.mjs'
import { chatTurn, openWorkspace } from '../lib/chat-turn.mjs'
import { Blocked, check, journey, runContext } from '../lib/journey.mjs'
import {
  readSiteFile,
  readTagline,
  runAccount,
  sharedSite,
  wordpressTheme,
  writeTagline
} from '../lib/run-site.mjs'

test('J4c backup, change a file and the database, restore', async (t) => {
  const run = runContext()
  const { runId, runDir, cms } = run
  const platform = cms.includes('wordpress') ? 'wordpress' : cms[0]
  await journey(t, { id: 'J4c', cms: platform, retries: 1 }, async ({ attempt, details }) => {
    if (platform !== 'wordpress')
      throw new Blocked(`J4c knows its file and field only on WordPress (asked for ${platform})`, 'coverage')
    const owner = await runAccount(run)
    const site = await sharedSite(run, owner, platform)
    details.site = { siteKey: site.siteKey, created: site.created }
    const key = encodeURIComponent(site.siteKey)

    // ── the mark: what the site holds at the backup ───────────────────────────────────────────
    const { slug } = await wordpressTheme(site.origin, owner)
    check(slug, 'the home page names no theme under wp-content/themes/')
    const path = `wp-content/themes/${slug}/style.css`
    const file0 = await readSiteFile(site.origin, path, owner)
    const tag0 = await readTagline(owner, site.siteKey)
    check(file0.status === 200, `${path} answered ${file0.status}`)
    check(tag0.status === 200 && tag0.value !== null, `content.get blogdescription answered ${tag0.status}`)
    details.mark = { path, fileBytes: file0.text.length, tagline: tag0.value }

    const backup = await owner.post(
      `/api/sites/${key}/backup`,
      { title: `E2E ${runId} j4c${attempt}` },
      { timeoutMs: 180_000 }
    )
    details.backup = {
      status: backup.status,
      code: backup.json?.code ?? null,
      version: backup.json?.version ?? null,
      sha: backup.json?.sha ?? null,
      database: backup.json?.database?.state ?? null
    }
    check(
      backup.status === 200 && backup.json?.ok === true,
      `backup answered ${backup.status} ${backup.json?.code ?? ''}`
    )
    check(Number.isInteger(backup.json?.version), 'backup answered no version')
    check(
      backup.json?.database?.state === 'full',
      `the backup's database is ${backup.json?.database?.state}, not full`
    )
    const listed = await owner.get(`/api/sites/${key}/backups`)
    const row = (listed.json?.rows ?? []).find(
      (r) => r.kind === 'backup' && r.version === backup.json.version
    )
    details.backupListed = { status: listed.status, found: !!row, may: listed.json?.may ?? null }
    check(row, `/backups does not list version ${backup.json.version}`)

    // ── change the database (Apply door) ──────────────────────────────────────────────────────
    const dbValue = `E2E ${runId} j4c${attempt} db`
    const write = await writeTagline(owner, site.siteKey, dbValue)
    details.dbWrite = { status: write.status, ok: write.ok, code: write.code }
    check(
      write.status === 200 && write.ok !== false,
      `content.update answered ${write.status} ${write.code ?? JSON.stringify(write.body).slice(0, 200)}`
    )
    const tag1 = await readTagline(owner, site.siteKey)
    check(tag1.value === dbValue, `the tagline reads ${JSON.stringify(tag1.value)} after the write`)

    // ── change a file (one prompt) ────────────────────────────────────────────────────────────
    const marker = `e2e-${runId}-j4c${attempt}`
    const browser = await launch()
    try {
      const ctx = await roleContext(browser, { name: 'owner', token: owner.token })
      const page = await ctx.newPage()
      details.workspace = await openWorkspace(page, site.siteKey)
      const text = `Append this exact line at the very end of the file ${path} in the site's files: /* ${marker} */ — change nothing else, and do not change any content in the database.`
      const turn = await chatTurn({
        runDir,
        journey: 'J4c',
        page,
        client: owner,
        siteKey: site.siteKey,
        text,
        match: marker
      })
      details.turn = { id: turn.row.id, closedMs: turn.closedMs, files: turn.row.effects?.files ?? null }
    } finally {
      await browser.close()
    }
    const file1 = await readSiteFile(site.origin, path, owner)
    if (!file1.text.includes(marker))
      throw new Blocked(`the agent did not write the marker into ${path}`, 'model')
    const tag1b = await readTagline(owner, site.siteKey)
    details.taglineAfterChat = tag1b.value

    // ── Restore → both at the mark ────────────────────────────────────────────────────────────
    const restore = await owner.post(
      `/api/sites/${key}/restore`,
      {
        mode: 'everything',
        version: backup.json.version,
        confirm: 'restore',
        idemKey: `e2e-${runId}-j4c-${attempt}`
      },
      { timeoutMs: 180_000 }
    )
    details.restore = {
      status: restore.status,
      code: restore.json?.code ?? null,
      opStatus: restore.json?.status ?? null,
      files: restore.json?.files ?? null
    }
    check(
      restore.status === 200 && restore.json?.ok === true,
      `restore answered ${restore.status} ${restore.json?.code ?? ''} ${restore.json?.reason ?? ''}`
    )
    const file2 = await readSiteFile(site.origin, path, owner)
    const tag2 = await readTagline(owner, site.siteKey)
    details.after = {
      fileBytes: file2.text.length,
      fileHasMarker: file2.text.includes(marker),
      tagline: tag2.value
    }
    check(
      !file2.text.includes(marker) && file2.text === file0.text,
      `the file is not back at the backup (${file2.text.length} vs ${file0.text.length} bytes)`
    )
    check(
      tag2.value === tag0.value,
      `the tagline reads ${JSON.stringify(tag2.value)} after Restore, expected ${JSON.stringify(tag0.value)}`
    )
  })
})
