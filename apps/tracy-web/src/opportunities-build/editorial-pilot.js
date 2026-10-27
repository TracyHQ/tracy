/**
 * Explicit local pilot, not a background worker or a second public create door.
 * Run inside the localhost web runtime with --runtime-root, --revision, --email and --out.
 * `plan` makes at most one model call; `apply` requires a ready, owned WO test site and exact identity.
 * It uses the existing EmDash content writer, receipts, write lease and Site changes audit.
 */

import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  editorialHash,
  editorialInput,
  editorialMarkdown,
  editorialPins,
  emdashEditorialTemplate,
  placeDossier,
  validateEditorialPlan
} from './editorial.js'
import { askEditorialModel } from './editorial-model.js'

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')

export async function runEditorialPilot({ mode, runtimeRoot, revisionId, email, outDir, siteKey = null }) {
  if (
    !['prepare', 'plan', 'apply', 'inspect', 'resume'].includes(mode) ||
    !runtimeRoot ||
    !revisionId ||
    !email?.endsWith('@example.test') ||
    !outDir
  )
    throw new Error(
      'Use prepare|plan|apply|inspect|resume with --runtime-root, --revision, --email <test account> and --out'
    )
  const load = (name) => import(pathToFileURL(path.join(runtimeRoot, name)).href)
  const { readConfig } = await load('config.js')
  const config = readConfig(process.env)
  const publicOrigin = config.publicOrigin ?? config.origin
  // This pilot is authorized for one local stand, not any deployment where a secret can be read.
  const origin = process.env.PUBLIC_ORIGIN ?? process.env.TRACY_PUBLIC_ORIGIN ?? publicOrigin
  if (new URL(origin).hostname !== 'tracy.test') throw new Error('EDITORIAL_PILOT_LOCAL_ONLY')
  const { createPool } = await load('db/index.js')
  const pool = createPool(config.databaseUrl)
  const { emdashToolFor } = await load('lib/emdash-tool.js')
  const { emdashSlotRoles, writeWoCopy } = await load('sites/brief-engines/emdash-wo-copy.js')
  const { createSiteContent } = await load('opportunities-build/site-content.js')
  const { siteByKey, takeWriteLease, releaseWriteLease, auditSiteWrite } = await load('sites/store.js')
  const { grantFor } = await load('seats/store.js')
  const { siteTarget } = await load('sites/resolver.js')
  const { hostCall } = await load('host/client.js')
  const { siteApi } = await load('sites/brief-engines/emdash-menus.js')
  const { lookupDoor } = await load('lib/llm-store.js')
  const { readCapabilities } = await load('lib/quickstart-capabilities.js')
  mkdirSync(outDir, { recursive: true, mode: 0o700 })
  const save = (name, data) =>
    writeFileSync(path.join(outDir, name), typeof data === 'string' ? data : JSON.stringify(data, null, 2), {
      mode: 0o600
    })
  try {
    const account = (await pool.query('select id from account where email=$1', [email])).rows[0]
    if (!account) throw new Error('EDITORIAL_ACCOUNT_NOT_FOUND')
    const revision = (
      await pool.query('select * from wo_revision where id=$1 and account_id=$2', [revisionId, account.id])
    ).rows[0]
    // A quality-v1 brief keeps its one build's view (`brief.cms`, `brief.template`); no other brief names a template.
    if (!revision || revision.brief?.cms !== 'emdash') throw new Error('EDITORIAL_REVISION_NOT_FOUND')
    const release = (
      await pool.query('select * from quickstart_releases where tag=$1', [revision.brief.template.quickstart])
    ).rows[0]
    if (!release?.setting || release.setting.version !== revision.brief.template.version)
      throw new Error('EDITORIAL_RELEASE_CHANGED')
    const tool = emdashToolFor(revision.brief.template.quickstart)
    const map = tool && emdashSlotRoles(tool.templateId)
    if (!map) throw new Error('EDITORIAL_TEMPLATE_UNSUPPORTED')
    const seedBytes = readFileSync(path.join(tool.seedDir, 'seed.json'))
    const seed = JSON.parse(seedBytes)
    const seedSha256 = digest(seedBytes)
    if (map.checked?.seedSha256 !== seedSha256) throw new Error('EDITORIAL_UNVERIFIED_SEED')
    const install = release.setting.install
    const archive = install?.state
    if (!archive?.sha256) throw new Error('EDITORIAL_ARCHIVE_MISSING')
    const { readAt: _readAt, ...capabilities } = readCapabilities({
      release: { ...release, platform: 'emdash' }
    })
    const template = emdashEditorialTemplate({
      release: release.tag,
      version: release.setting.version,
      archiveSha256: archive.sha256,
      seed,
      seedSha256,
      map,
      capabilities
    })
    const website = (
      await pool.query(
        "select collected from wo_place_snapshot_source where snapshot_id=$1 and source='website' and status in ('complete','partial')",
        [revision.place_snapshot_id]
      )
    ).rows[0]
    const input = editorialInput({
      place: placeDossier({ revision, accountId: account.id, websitePages: website?.collected?.pages ?? [] }),
      template
    })
    const inputFile = path.join(outDir, 'input.json')
    if (existsSync(inputFile) && JSON.parse(readFileSync(inputFile)).inputHash !== input.inputHash)
      throw new Error('EDITORIAL_PILOT_INPUT_CHANGED')
    save('input.json', input)
    if (mode === 'prepare')
      return {
        inputHash: input.inputHash,
        sources: input.place.sources.length,
        passages: input.passages.length
      }
    const planFile = path.join(outDir, 'accepted.json')
    if (mode === 'plan') {
      if (existsSync(planFile)) return { reused: true, inputHash: input.inputHash }
      // A lost response may have been billed. Refuse to spend again without a distinct evidence directory.
      if (existsSync(path.join(outDir, 'attempt.json'))) throw new Error('EDITORIAL_ATTEMPT_ALREADY_STARTED')
      const door = await lookupDoor(pool, 'seedText', config.sessionSecret)
      if (door.state !== 'ok') throw new Error('EDITORIAL_MODEL_UNCONFIGURED')
      const model = {
        apiKey: door.credential.apiKey,
        baseUrl: door.credential.baseUrl,
        words: door.credential.model
      }
      save('attempt.json', {
        state: 'started',
        at: new Date().toISOString(),
        inputHash: input.inputHash,
        model: model.words,
        endpointHost: new URL(model.baseUrl).host,
        maxCalls: 1,
        maxCompletionTokens: 12000,
        cost: 'not yet reconciled; pilot does not claim a monetary hard cap'
      })
      const answer = await askEditorialModel({ model, input })
      save('answer.json', answer)
      const checked = validateEditorialPlan(answer.plan, input)
      save('validation.json', checked)
      if (!checked.ok) throw new Error(`EDITORIAL_VALIDATION_FAILED:${checked.errors.join(',')}`)
      save('accepted.json', checked.plan)
      save('handoff.md', editorialMarkdown(checked.plan))
      save('attempt.json', {
        state: 'completed',
        inputHash: input.inputHash,
        at: new Date().toISOString(),
        ...answer.receipt
      })
      return {
        inputHash: input.inputHash,
        selected: checked.plan.selections.map((s) => ({ role: s.role, state: s.state, source: s.sourceId })),
        receipt: answer.receipt
      }
    }
    if (!siteKey || !/^wo-editorial-[a-z0-9-]+\.tracy\.test$/.test(siteKey))
      throw new Error('EDITORIAL_PILOT_SITE_REQUIRED')
    const site = await siteByKey(pool, siteKey)
    const grant = await grantFor(pool, account.id, siteKey)
    if (!site || grant?.role !== 'owner' || site.platform !== 'emdash')
      throw new Error('EDITORIAL_PILOT_SITE_NOT_OWNED')
    if (site.host !== config.hostName) throw new Error('EDITORIAL_PILOT_HOST_MISMATCH')
    if (
      site.quickstart_tag !== template.release ||
      site.quickstart_version !== template.version ||
      site.quickstart_sha256 !== template.archiveSha256
    )
      throw new Error('EDITORIAL_INSTALLED_TEMPLATE_MISMATCH')
    const content = createSiteContent({ pool })
    const copy = await content.copyFor({ siteKey, email, lang: template.locale })
    const build = (
      await pool.query('select id,revision_id,state from wo_build where id=$1 and account_id=$2', [
        copy?.buildId,
        account.id
      ])
    ).rows[0]
    if (build?.revision_id !== revisionId) throw new Error('EDITORIAL_BUILD_REVISION_MISMATCH')
    if (build.state !== 'done') throw new Error('EDITORIAL_PILOT_BUILD_NOT_DONE')
    if (mode === 'apply') {
      const brief = (
        await pool.query('select state from site_brief where site_key=$1 and account_id=$2', [
          siteKey,
          account.id
        ])
      ).rows[0]
      if (brief?.state !== 'applied') throw new Error('EDITORIAL_PILOT_BASELINE_NOT_APPLIED')
    }
    if (mode === 'inspect') {
      const token = await hostCall(config, site.host, '/agent-token', { label: site.label })
      if (!token.ok || typeof token.body?.token !== 'string')
        throw new Error('EDITORIAL_PILOT_SITE_UNREACHABLE')
      const api = siteApi(siteTarget(site, config).origin, token.body.token)
      const entries = []
      for (const collection of seed.collections) {
        const listed = await api(
          'GET',
          `/_emdash/api/content/${encodeURIComponent(collection.slug)}?locale=${encodeURIComponent(seed.defaultLocale)}&limit=100`
        )
        if (!Array.isArray(listed.items) || listed.total > listed.items.length)
          throw new Error(`EDITORIAL_INSPECTION_INCOMPLETE:${collection.slug}`)
        for (const live of listed.items) {
          if ((live.locale ?? seed.defaultLocale) !== seed.defaultLocale) continue
          const original = (seed.content[collection.slug] ?? []).find(
            (entry) => entry.slug === live.slug && (entry.locale ?? seed.defaultLocale) === seed.defaultLocale
          )
          const route = `/_emdash/api/content/${encodeURIComponent(collection.slug)}/${encodeURIComponent(live.slug)}?locale=${encodeURIComponent(seed.defaultLocale)}`
          try {
            const result = await api('GET', route)
            const item = result?.item ?? result
            const data = item?.liveData ?? item?.data ?? {}
            const unchanged = Object.keys(data).filter(
              (field) =>
                original && editorialHash(data[field]) === editorialHash(original.data[field] ?? null)
            )
            entries.push({
              collection: collection.slug,
              slug: live.slug,
              locale: seed.defaultLocale,
              status: item?.status,
              data,
              unchangedFields: unchanged
            })
          } catch (error) {
            entries.push({
              collection: collection.slug,
              slug: live.slug,
              error: error.status ?? 'read-failed'
            })
          }
        }
      }
      const inspection = {
        siteKey,
        template: {
          release: template.release,
          version: template.version,
          archiveSha256: template.archiveSha256
        },
        at: new Date().toISOString(),
        entries,
        note: 'Unchanged fields are review candidates, not proof of bad copy; public render and navigation must be checked separately.'
      }
      save('inspection.json', inspection)
      return {
        siteKey,
        entries: entries.length,
        errors: entries.filter((e) => e.error).length,
        published: entries.filter((e) => e.status === 'published').length
      }
    }
    const runId = randomUUID()
    const sessionId = `wo-editorial-${runId}`
    const lease = await takeWriteLease(pool, { siteKey, sessionId, actor: email })
    if (!lease.ok) throw new Error('EDITORIAL_PILOT_SITE_BUSY')
    try {
      // Recheck the seat and source identity after acquiring the site's existing write lease.
      if ((await grantFor(pool, account.id, siteKey))?.role !== 'owner')
        throw new Error('EDITORIAL_PILOT_SEAT_REVOKED')
      const token = await hostCall(config, site.host, '/agent-token', { label: site.label })
      if (!token.ok || typeof token.body?.token !== 'string')
        throw new Error('EDITORIAL_PILOT_SITE_UNREACHABLE')
      if (mode === 'resume') {
        // A shared stand can be redeployed during a pilot. Resume its existing failed brief with
        // the normal engine and original normalization; never create a second site or another model call.
        const row = (
          await pool.query('select * from site_brief where site_key=$1 and account_id=$2', [
            siteKey,
            account.id
          ])
        ).rows[0]
        if (row?.state !== 'failed' || !row.normalized) throw new Error('EDITORIAL_PILOT_BRIEF_NOT_RESUMABLE')
        const job = (
          await pool.query(
            "select id from job where site_key=$1 and kind='provision' and state='done' order by created_at desc limit 1",
            [siteKey]
          )
        ).rows[0]
        if (!job) throw new Error('EDITORIAL_PILOT_PROVISION_NOT_DONE')
        const { createBriefBuilds } = await load('sites/brief-build.js')
        const { createEmdashEngine } = await load('sites/brief-engines/emdash.js')
        const access = { origin: siteTarget(site, config).origin, token: token.body.token }
        const engine = createEmdashEngine({
          models: async () => ({}),
          siteAccess: async (key) => {
            if (key !== siteKey) throw new Error('EDITORIAL_PILOT_SITE_MISMATCH')
            return access
          },
          woContent: content,
          displayLocale: async (key, locales) => {
            if (key !== siteKey) throw new Error('EDITORIAL_PILOT_SITE_MISMATCH')
            const response = await hostCall(config, site.host, '/display-locale', {
              label: site.label,
              locales
            })
            if (!response.ok) throw new Error('EDITORIAL_PILOT_LOCALE_FAILED')
          }
        })
        const runner = createBriefBuilds({
          pool,
          engines: { emdash: engine },
          normalize: async () => row.normalized,
          recoverOnStart: false,
          hostJob: async () => ({ state: 'done' })
        })
        const started = await runner.start({
          siteKey,
          accountId: account.id,
          email,
          label: site.label,
          platform: 'emdash',
          quickstart: template.release,
          contract: null,
          brief: row.brief,
          jobId: job.id,
          host: site.host
        })
        if (!started.started) throw new Error('EDITORIAL_PILOT_RESUME_REFUSED')
        let ending
        do {
          await new Promise((resolve) => setTimeout(resolve, 1000))
          ending = (
            await pool.query('select state,error,timings from site_brief where site_key=$1', [siteKey])
          ).rows[0]
        } while (['queued', 'preparing', 'ready', 'applying'].includes(ending?.state))
        save('resume.json', {
          siteKey,
          runId,
          result: ending,
          note: 'Existing EmDash brief engine; reused normalization. Brand step was not rerun.'
        })
        if (ending?.state !== 'applied') throw new Error('EDITORIAL_PILOT_RESUME_FAILED')
        return { siteKey, result: ending }
      }
      const accepted = JSON.parse(readFileSync(planFile))
      const pinned = editorialPins({ accepted, input, pinned: copy.pinned })
      // Apply only the chosen roles. Re-running does not rewrite unrelated identity, CTA or card fields.
      const chosen = Object.fromEntries(
        Object.entries(pinned).filter(([role]) =>
          accepted.selections.some((s) => s.role === role && s.state === 'selected')
        )
      )
      const notes = []
      const receipt = await writeWoCopy({
        api: siteApi(siteTarget(site, config).origin, token.body.token),
        copy: { ...copy, pinned: chosen },
        map,
        seed,
        woContent: content,
        note: (note) => notes.push(note)
      })
      save('apply.json', {
        siteKey,
        runId,
        inputHash: input.inputHash,
        receipt,
        notes,
        at: new Date().toISOString()
      })
      await content.recordWrite(copy.buildId, `editorial:${input.inputHash}`, {
        state: receipt.failed || receipt.conflict ? 'failed' : 'written',
        plan: accepted,
        receipt,
        runId
      })
      await auditSiteWrite(pool, {
        actor: email,
        action: 'content.update',
        siteKey,
        detail: { ok: !receipt.failed && !receipt.conflict, editorial: input.inputHash, runId, receipt },
        write: {
          outcome: receipt.failed || receipt.conflict ? 'unknown' : 'ok',
          via: 'emdash-mcp',
          origin: { kind: 'setup', ref: runId },
          target: { kind: 'editorial', id: input.inputHash, roles: Object.keys(chosen) }
        }
      })
      if (receipt.failed || receipt.conflict || receipt.written === 0)
        throw new Error('EDITORIAL_PILOT_APPLY_FAILED')
      return { siteKey, inputHash: input.inputHash, receipt, notes }
    } finally {
      await releaseWriteLease(pool, { siteKey, sessionId, actor: email })
    }
  } finally {
    await pool.end()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const options = Object.fromEntries(
    process.argv.slice(3).map((arg) => {
      const at = arg.indexOf('=')
      return [arg.slice(2, at), arg.slice(at + 1)]
    })
  )
  runEditorialPilot({
    mode: process.argv[2],
    runtimeRoot: options['runtime-root'],
    revisionId: options.revision,
    email: options.email,
    outDir: options.out,
    siteKey: options.site
  })
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error) => {
      console.error(error.message)
      process.exitCode = 1
    })
}
