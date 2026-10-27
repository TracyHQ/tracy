/** Persistent synthetic-only Ops sandbox. No network transports are imported here. */

import { createHash, randomUUID } from 'node:crypto'
import { Hono } from 'hono'
import { json } from '../lib/http.js'
import { BASELINE_MAPPING, parseCsv, previewCsv } from './csv.js'
import { gmailStatus, invitationsGmailRoutes } from './gmail.js'
import { body, writable } from './sandbox-guards.js'
import { invitationsSourceRoutes } from './source-routes.js'
import { sourceTransaction, lockSourceCampaigns } from './source-store.js'
import { projectSourceCampaign, invalidateSourceApprovals, bindSourceApproval } from './source-approval.js'

export const sandboxGroups = Array.from({ length: 5 }, (_, i) => ({
  key: `group_${i + 1}`,
  label: `Sandbox group ${i + 1}`
}))
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const fail = (code, status = 400) => {
  throw Object.assign(new Error(code), { status })
}
const keys = (r) => [`email:${r.email}`, ...r.identities.map((id) => `member:${id.memberId}`)]
const safeText = (value, max = 16000) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail('invalid_text')
  // Free text cannot be proven fictional. Reject contact addresses and live URLs;
  // operators must use fictional text. Names imported from CSV are replaced below.
  if (
    [...value.matchAll(/[\w.!#$%&'*+\-/=?^`{|}~]+@([\w.-]+)/gi)].some(
      (match) => !/\.(?:test|invalid)$/i.test(match[1].replace(/\.$/, ''))
    ) ||
    /https?:\/\/(?!invitations\.invalid(?:[/\s]|$))/i.test(value)
  )
    fail('synthetic_only')
  return value.trim()
}
const safeSubject = (value) => {
  if (typeof value !== 'string' || /[\p{Cc}\u2028\u2029]/u.test(value)) fail('invalid_subject')
  return safeText(value, 200)
}
const requireGroup = (group) => {
  if (!sandboxGroups.some((entry) => entry.key === group)) fail('invalid_group')
  return group
}
function validateTokens(text) {
  const literals = text.replace(/\{\{([^{}]*)\}\}/g, (_, token) => {
    if (!['first_name', 'group'].includes(token)) fail('invalid_template_token')
    return ''
  })
  if (/[{}]/.test(literals)) fail('invalid_template_token')
  return text
}
function renderContent(data, group, recipient) {
  requireGroup(group)
  const firstName = data.sourceCheck ? recipient.readiness.personalization.first_name : recipient.firstName
  const content = data.content?.find((entry) => entry.group === group)
  const template = content?.versions.find((entry) => entry.version === content.activeVersion)
  if (!template) fail('template_required', 409)
  const render = (text) =>
    validateTokens(safeText(text)).replace(/\{\{(first_name|group)\}\}/g, (_, token) =>
      safeText(token === 'first_name' ? firstName : group)
    )
  return {
    subject: safeSubject(render(template.subject)),
    bodyText: safeText(render(template.bodyText)),
    templateVersion: template.version,
    group,
    ...(data.sourceCheck
      ? {
          dependencyFields: [
            ...new Set(
              [...`${template.subject}\n${template.bodyText}`.matchAll(/\{\{(first_name|group)\}\}/g)].map(
                (match) => match[1]
              )
            )
          ]
        }
      : {})
  }
}
const editable = (recipient) => ['ready', 'draft'].includes(recipient.state) && !recipient.attempts.length
function detail(row) {
  return {
    id: row.id,
    name: row.name,
    revision: row.revision,
    ...row.data,
    counts: counts(row.data.recipients)
  }
}
function counts(recipients) {
  return {
    recipients: recipients.length,
    drafts: recipients.filter((r) => r.draft).length,
    approved: recipients.filter((r) => r.draft?.approved).length,
    simulated: recipients.filter((r) => r.attempts.length).length,
    suppressed: recipients.filter((r) => r.state === 'suppressed').length
  }
}
export function invitationsRoutes({ pool, config, admit }) {
  const app = new Hono()
  app.onError((error, c) => {
    if (error.status || error instanceof TypeError)
      return json(c, { code: error.message }, error.status ?? 400)
    console.error('[invitations-sandbox] database operation failed')
    return json(c, { code: 'sandbox_failure' }, 500)
  })
  app.use('*', async (c, next) => {
    const who = await admit(c)
    if (who === 'sign-in') return json(c, { code: 'not_signed_in' }, 401)
    if (!who) return c.body(null, 403)
    if (!config.invitationsSandbox) {
      if (c.req.method === 'GET' && c.req.path.replace(/\/$/, '') === '/api/ops/invitations')
        return json(c, {
          enabled: false,
          mode: 'sandbox',
          writable: false,
          groups: [],
          campaigns: [],
          integrations: { gmail: 'not_connected', amember: 'not_connected', sendy: 'not_connected' }
        })
      return json(c, { code: 'not_found' }, 404)
    }
    c.set('invitationsActor', who)
    if (c.req.method !== 'GET' && !writable(who)) return json(c, { code: 'forbidden' }, 403)
    try {
      await next()
    } catch (error) {
      if (error.status || error instanceof TypeError)
        return json(c, { code: error.message }, error.status ?? 400)
      throw error
    }
  })
  app.route('/gmail', invitationsGmailRoutes({ pool, config }))
  app.route('/', invitationsSourceRoutes({ pool, config, admit }))
  app.get('/', async (c) => {
    const gmail = await gmailStatus(pool, config)
    const rows = await sourceTransaction(
      pool,
      async (db, now) => {
        const stored = (
          await db.query('select * from invitations_sandbox_campaign order by created_at desc limit 100')
        ).rows
        return Promise.all(stored.map((row) => projectSourceCampaign(db, row, now)))
      },
      { readOnly: true }
    )
    return json(c, {
      enabled: true,
      mode: 'sandbox',
      integrations: { gmail: gmail.status, amember: 'not_connected', sendy: 'not_connected' },
      groups: sandboxGroups,
      writable: writable(c.get('invitationsActor')),
      campaigns: rows.map((row) => ({
        id: row.id,
        ...(writable(c.get('invitationsActor')) ? { name: row.name } : {}),
        revision: row.revision,
        counts: counts(row.data.recipients)
      }))
    })
  })
  app.post('/', async (c) => {
    const input = await body(c, config)
    const id = randomUUID()
    const name = safeText(input.name, 120)
    const row = (
      await pool.query('insert into invitations_sandbox_campaign(id,name) values($1,$2) returning *', [
        id,
        name
      ])
    ).rows[0]
    return json(c, detail(row), 201)
  })
  app.get('/:id', async (c) => {
    if (!writable(c.get('invitationsActor'))) return json(c, { code: 'forbidden' }, 403)
    if (!/^[a-f0-9-]{36}$/.test(c.req.param('id'))) fail('not_found', 404)
    const row = await sourceTransaction(
      pool,
      async (db, now) => {
        const stored = (
          await db.query('select * from invitations_sandbox_campaign where id=$1', [c.req.param('id')])
        ).rows[0]
        if (!stored) fail('not_found', 404)
        return projectSourceCampaign(db, stored, now)
      },
      { readOnly: true }
    )
    return json(c, detail(row))
  })
  async function mutate(c, action) {
    const input = await body(c, config)
    const who = c.get('invitationsActor')
    if (!/^[a-f0-9-]{36}$/.test(c.req.param('id'))) fail('not_found', 404)
    const db = await pool.connect()
    try {
      await db.query('begin')
      await db.query(
        "set local statement_timeout='10000'; set local lock_timeout='5000'; set local idle_in_transaction_session_timeout='15000'"
      )
      // Every mutation shares the program lock, including STOP and commits.
      await db.query('select pg_advisory_xact_lock(7243080)')
      const now = (await db.query('select clock_timestamp() as now')).rows[0].now.toISOString()
      const row = (
        await db.query('select * from invitations_sandbox_campaign where id=$1 for update', [
          c.req.param('id')
        ])
      ).rows[0]
      if (!row) fail('not_found', 404)
      if (c.req.path.endsWith('/commit') && /^[a-f0-9-]{36}$/.test(input.previewId ?? '')) {
        const replay = (
          await db.query(
            'select * from invitations_sandbox_preview where id=$1 and campaign_id=$2 and actor=$3',
            [input.previewId, row.id, who.email]
          )
        ).rows[0]
        if (replay?.committed_revision !== null && replay?.committed_result) {
          if (replay.digest !== input.digest || replay.revision !== input.revision)
            fail('invalid_preview', 409)
          const response = row.data.sourceCheck
            ? detail(await projectSourceCampaign(db, row, now))
            : replay.committed_result
          await db.query('commit')
          return json(c, response)
        }
      }
      if (input.revision !== row.revision) fail('stale_revision', 409)
      // Refresh eligibility under the same lock, without overwriting the stored
      // binding: reads can hide approvals, while invalidations remain auditable.
      const projected = await projectSourceCampaign(db, row, now)
      for (const [index, r] of row.data.recipients.entries()) {
        const view = projected.data.recipients[index]
        if (row.data.sourceCheck) {
          r.readiness = view.readiness
          r.approvalStatus = view.approvalStatus
          r.state = view.state
        }
      }
      const result = await action(db, row, input, who, now)
      if (result?.preview) {
        await db.query('commit')
        return json(c, result.preview)
      }
      const scopes = (
        await db.query(
          "select distinct data->'sourceCheck'->>'scopeId' as id from invitations_sandbox_campaign where data ? 'sourceCheck'"
        )
      ).rows
      for (const scope of scopes) {
        const affected = await lockSourceCampaigns(db, scope.id)
        const before = new Map(affected.map((entry) => [entry.id, JSON.stringify(entry.data)]))
        const index = affected.findIndex((entry) => entry.id === row.id)
        if (index >= 0) affected[index] = row
        await invalidateSourceApprovals({ db, scopeId: scope.id, affectedCampaigns: affected, now })
        for (const entry of affected)
          if (entry.id !== row.id && JSON.stringify(entry.data) !== before.get(entry.id)) {
            await db.query(
              'update invitations_sandbox_campaign set data=$2,revision=revision+1 where id=$1',
              [entry.id, entry.data]
            )
          }
      }
      row.revision++
      row.data.audit.push({
        id: randomUUID(),
        action: c.req.path.split('/').at(-1),
        actor: who.email,
        revision: row.revision,
        createdAt: now
      })
      row.data.audit = row.data.audit.slice(-200)
      await db.query('update invitations_sandbox_campaign set revision=$2,data=$3 where id=$1', [
        row.id,
        row.revision,
        row.data
      ])
      const response = detail(await projectSourceCampaign(db, row, now))
      if (c.req.path.endsWith('/commit'))
        await db.query('update invitations_sandbox_preview set committed_result=$2 where id=$1', [
          input.previewId,
          response
        ])
      await db.query('commit')
      return json(c, response)
    } catch (error) {
      await db.query('rollback')
      throw error
    } finally {
      db.release()
    }
  }
  app.post('/:id/preview', (c) =>
    mutate(c, async (db, row, input, who) => {
      if (typeof input.csv !== 'string') fail('invalid_csv')
      const csvBytes = Buffer.from(input.csv)
      const parsed = parseCsv({ csvBytes })
      // Local inspection only: no customer payload, checksum or result is persisted.
      // This branch cannot issue a commit token or authorize a sender.
      if (parsed.headers.includes('user_id') && parsed.headers.includes('nhom_gui')) {
        if (
          config.environment !== 'local' ||
          !config.origin ||
          new URL(config.origin).protocol !== 'http:' ||
          !['localhost', '127.0.0.1', 'tracy.test'].includes(new URL(config.origin).hostname)
        )
          fail('local_inspection_only', 403)
        if (parsed.rows.length > 20) fail('local_inspection_row_limit')
        const mapping = Object.fromEntries(
          Object.entries(BASELINE_MAPPING).filter(([key]) => parsed.headers.includes(key))
        )
        const inspection = previewCsv({
          csvBytes,
          mapping,
          schemaVersion: 'invitations-v1',
          normalizeBaselineFlags: true,
          groupCatalogue: {
            version: 'sarah-baseline-2026-10-07',
            keys: [
              '1 agency dang hoat dong',
              '2 agency it hoat dong',
              '3 doanh nghiep dang hoat dong',
              '4 doanh nghiep it hoat dong',
              '5 ca nhan'
            ]
          }
        })
        c.header('Cache-Control', 'no-store')
        return {
          preview: {
            readOnly: true,
            digest: inspection.previewDigest,
            counts: inspection.counts,
            candidates: inspection.candidates.map((r) => ({
              normalizedEmail: r.normalizedEmail,
              sourceGroup: r.sourceGroup,
              state: r.state
            })),
            issues: inspection.issues,
            mapping,
            ignoredColumns: parsed.headers.filter((h) => !Object.hasOwn(mapping, h)),
            eligibleNow: null
          }
        }
      }
      if (parsed.rows.length > 200) fail('sandbox_row_limit')
      const allowed = [
        'email',
        'source_member_id',
        'group_key',
        'first_name',
        'global_unsubscribed',
        'internal'
      ]
      if (parsed.headers.some((h) => !allowed.includes(h))) fail('invalid_mapping')
      const emailIndex = parsed.headers.indexOf('email')
      const memberIndex = parsed.headers.indexOf('source_member_id')
      if (emailIndex < 0 || memberIndex < 0) fail('invalid_mapping')
      for (const values of parsed.rows) {
        if (
          !/^[a-z0-9.!#$%&'*+\-/=?^_`{|}~]+@[a-z0-9.-]+\.(test|invalid)$/i.test(values[emailIndex].trim()) ||
          !/^sandbox-[a-z0-9_-]{1,80}$/i.test(values[memberIndex].trim())
        )
          fail('synthetic_only')
      }
      // Drop supplied names before helper processing/storage; only fixture names persist.
      for (const values of parsed.rows) {
        for (const [index, header] of parsed.headers.entries()) {
          if (header === 'group_key' && !sandboxGroups.some((g) => g.key === values[index]))
            fail('invalid_group')
          if (['global_unsubscribed', 'internal'].includes(header) && !['0', '1', ''].includes(values[index]))
            fail('invalid_flag')
        }
      }
      const nameIndex = parsed.headers.indexOf('first_name')
      if (nameIndex >= 0) for (const values of parsed.rows) values[nameIndex] = 'Sandbox Friend'
      const sanitizedCsv = [parsed.headers, ...parsed.rows]
        .map((values) => values.map((v) => `"${v.replaceAll('"', '""')}"`).join(','))
        .join('\n')
      const preview = previewCsv({
        csvBytes: Buffer.from(sanitizedCsv),
        mapping: Object.fromEntries(parsed.headers.map((h) => [h, h])),
        schemaVersion: 'invitations-v1',
        groupCatalogue: { version: 'sandbox-v1', keys: sandboxGroups.map((g) => g.key) }
      })
      const id = randomUUID()
      const digest = preview.previewDigest
      await db.query(
        'delete from invitations_sandbox_preview where expires_at < now() and committed_revision is null'
      )
      await db.query(
        "insert into invitations_sandbox_preview(id,campaign_id,actor,revision,digest,payload,expires_at) values($1,$2,$3,$4,$5,$6,now()+interval '30 minutes')",
        [id, row.id, who.email, row.revision, digest, preview]
      )
      return {
        preview: {
          id,
          digest,
          counts: preview.counts,
          candidates: preview.candidates,
          issues: preview.issues
        }
      }
    })
  )
  app.post('/:id/commit', (c) =>
    mutate(c, async (db, row, input, who) => {
      if (!/^[a-f0-9-]{36}$/.test(input.previewId ?? '')) fail('invalid_preview')
      const p = (
        await db.query(
          'select * from invitations_sandbox_preview where id=$1 and campaign_id=$2 and actor=$3 and expires_at>now() for update',
          [input.previewId, row.id, who.email]
        )
      ).rows[0]
      if (!p || p.digest !== input.digest || p.revision !== row.revision || p.committed_revision !== null)
        fail('invalid_preview', 409)
      if (row.data.recipients.length + p.payload.candidates.length > 200) fail('sandbox_row_limit')
      for (const r of p.payload.candidates) {
        if (row.data.recipients.some((old) => old.email === r.normalizedEmail))
          fail('duplicate_recipient', 409)
        const recipient = {
          id: randomUUID(),
          email: r.normalizedEmail,
          identities: r.identities,
          group: r.sourceGroup,
          state: r.state === 'recheck' ? (r.needsReview ? 'review' : 'ready') : r.state,
          firstName: 'Sandbox Friend',
          ...(row.data.sourceCheck
            ? {
                sourceCandidate: {
                  state: r.state,
                  needsReview: r.needsReview,
                  negativeAssertions: r.negativeAssertions
                }
              }
            : {}),
          draft: null,
          messages: [],
          attempts: []
        }
        row.data.recipients.push(recipient)
        for (const identity of recipient.identities)
          await db.query('insert into invitations_sandbox_alias(a,b) values($1,$2) on conflict do nothing', [
            `email:${recipient.email}`,
            `member:${identity.memberId}`
          ])
        if (recipient.state === 'suppressed')
          for (const key of keys(recipient))
            await db.query(
              'insert into invitations_sandbox_suppression(identity) values($1) on conflict do nothing',
              [key]
            )
      }
      await db.query('update invitations_sandbox_preview set committed_revision=$2 where id=$1', [
        p.id,
        row.revision + 1
      ])
    })
  )
  function recipient(row, c) {
    const r = row.data.recipients.find((r) => r.id === c.req.param('rid'))
    if (!r) fail('not_found', 404)
    return r
  }
  function draft(r, subject, bodyText, provenance = r.draft) {
    r.draft = {
      subject,
      bodyText,
      revision: (r.draft?.revision ?? 0) + 1,
      contentHash: hash({ subject, bodyText }),
      approved: false,
      ...(provenance?.templateGroup ? { templateGroup: provenance.templateGroup } : {}),
      ...(provenance?.templateVersion ? { templateVersion: provenance.templateVersion } : {}),
      ...(provenance?.dependencyFields ? { dependencyFields: provenance.dependencyFields } : {}),
      ...(r.draft?.everApproved ? { everApproved: true } : {})
    }
    r.state = 'draft'
  }
  app.post('/:id/content', (c) =>
    mutate(c, async (db, row, input) => {
      const group = requireGroup(input.group)
      const subject = validateTokens(safeSubject(input.subject))
      const bodyText = validateTokens(safeText(input.bodyText))
      row.data.content ??= []
      let content = row.data.content.find((entry) => entry.group === group)
      if (!content) {
        content = { group, versions: [], activeVersion: 0 }
        row.data.content.push(content)
      }
      const version = content.versions.length + 1
      content.versions.push({ version, subject, bodyText, createdAt: new Date().toISOString() })
      content.activeVersion = version
    })
  )
  app.post('/:id/content-preview', (c) =>
    mutate(c, async (db, row, input) => {
      const group = requireGroup(input.group)
      const r = row.data.recipients.find((entry) => entry.id === input.recipientId)
      if (!r) fail('not_found', 404)
      if (r.group !== group) fail('recipient_group_mismatch')
      c.header('Cache-Control', 'no-store')
      return { preview: renderContent(row.data, group, r) }
    })
  )
  app.post('/:id/generate', (c) =>
    mutate(c, async (db, row, input) => {
      if (input.group !== undefined) requireGroup(input.group)
      if (input.replaceExisting !== undefined && typeof input.replaceExisting !== 'boolean')
        fail('invalid_replace_existing')
      // Render the whole selection before changing any draft. Missing content or
      // unsafe personalization cannot leave a partly generated selection.
      const rendered = []
      const stopped = []
      for (const r of row.data.recipients) {
        if (!editable(r) || (input.group && r.group !== input.group)) continue
        // The program-wide suppression may have changed in another campaign.
        // Recheck even when the default operation would preserve an existing draft.
        if (await suppressed(db, r)) stopped.push(r)
        else if (!r.draft || input.replaceExisting)
          rendered.push({
            recipient: r,
            content: renderContent(row.data, r.group, r)
          })
      }
      for (const r of stopped) {
        r.state = 'suppressed'
        if (r.draft) {
          r.draft.approved = false
          delete r.draft.approval
        }
      }
      for (const { recipient, content } of rendered)
        draft(recipient, content.subject, content.bodyText, {
          templateGroup: content.group,
          templateVersion: content.templateVersion,
          ...(content.dependencyFields ? { dependencyFields: content.dependencyFields } : {})
        })
    })
  )
  app.post('/:id/recipients/:rid/draft', (c) =>
    mutate(c, async (db, row, input) => {
      const r = recipient(row, c)
      if (!editable(r) || (await suppressed(db, r))) fail('recipient_blocked', 409)
      draft(r, safeSubject(input.subject), safeText(input.bodyText))
    })
  )
  app.post('/:id/recipients/:rid/approve', (c) =>
    mutate(c, async (db, row, input, who, now) => {
      const r = recipient(row, c)
      if (!editable(r) || (await suppressed(db, r))) fail('recipient_blocked', 409)
      if (!r.draft || r.draft.contentHash !== input.contentHash || r.state !== 'draft')
        fail('stale_draft', 409)
      r.draft.approval = row.data.sourceCheck
        ? bindSourceApproval({
            draft: r.draft,
            readiness: r.readiness,
            destination: r.email,
            actor: who.email,
            now
          })
        : {
            actor: who.email,
            contentHash: input.contentHash,
            revision: r.draft.revision,
            createdAt: now
          }
      r.draft.approved = true
      if (row.data.sourceCheck) {
        r.draft.everApproved = true
        delete r.draft.approvalInvalidation
      }
    })
  )
  async function linkedKeys(db, r) {
    const result = await db.query(
      `with recursive linked(identity) as (
      select unnest($1::text[]) union
      select case when a.a=l.identity then a.b else a.a end
      from linked l join invitations_sandbox_alias a on a.a=l.identity or a.b=l.identity
    ) select identity from linked`,
      [keys(r)]
    )
    return result.rows.map((row) => row.identity)
  }
  async function suppressed(db, r) {
    return (
      (
        await db.query(
          'select 1 from invitations_sandbox_suppression where identity=any($1::text[]) limit 1',
          [await linkedKeys(db, r)]
        )
      ).rowCount > 0
    )
  }
  app.post('/:id/simulate', (c) =>
    mutate(c, async (db, row) => {
      if (row.data.sourceCheck) {
        for (const r of row.data.recipients) {
          if (
            !r.attempts.length &&
            r.draft &&
            (r.draft.everApproved || r.draft.approval || r.draft.approvalInvalidation) &&
            !r.approvalStatus?.effective &&
            // Only an approval the operator can renew stops the run. A recipient the source now
            // blocks (opted out, changed address, not ready) cannot be re-approved; it is left out
            // of this run instead of holding every other recipient back.
            r.readiness?.state === 'ready' &&
            editable(r) &&
            !(await suppressed(db, r))
          )
            fail('source_approval_required', 409)
        }
      }
      for (const r of row.data.recipients) {
        if (
          !r.draft?.approved ||
          (row.data.sourceCheck && !r.approvalStatus?.effective) ||
          r.state !== 'draft' ||
          hash({ subject: r.draft.subject, bodyText: r.draft.bodyText }) !== r.draft.contentHash
        )
          continue
        if (!/^[a-z0-9.!#$%&'*+\-/=?^_`{|}~]+@[a-z0-9.-]+\.(test|invalid)$/i.test(r.email))
          fail('synthetic_only')
        if (await suppressed(db, r)) {
          r.state = 'suppressed'
          continue
        }
        const duplicate = await db.query(
          'select 1 from invitations_sandbox_identity where identity=any($1::text[]) limit 1',
          [await linkedKeys(db, r)]
        )
        if (duplicate.rowCount) {
          r.state = 'duplicate'
          continue
        }
        const id = randomUUID()
        const createdAt = new Date().toISOString()
        const snapshot = structuredClone(r.draft)
        await db.query(
          'insert into invitations_sandbox_attempt(id,campaign_id,recipient_id,email,snapshot) values($1,$2,$3,$4,$5)',
          [id, row.id, r.id, r.email, snapshot]
        )
        for (const key of await linkedKeys(db, r))
          await db.query('insert into invitations_sandbox_identity(identity,attempt_id) values($1,$2)', [
            key,
            id
          ])
        r.attempts.push({ id, state: 'simulated', snapshot, createdAt })
        r.messages.push({
          id: randomUUID(),
          direction: 'outbound',
          subject: snapshot.subject,
          bodyText: snapshot.bodyText,
          createdAt
        })
        r.state = 'simulated'
      }
    })
  )
  app.post('/:id/recipients/:rid/message', (c) =>
    mutate(c, async (db, row, input) => {
      const r = recipient(row, c)
      const bodyText = safeText(input.bodyText)
      if (!['inbound', 'outbound'].includes(input.direction)) fail('invalid_direction')
      if (r.messages.length >= 200) fail('message_limit')
      if (
        input.direction === 'outbound' &&
        (!r.attempts.some((attempt) => attempt.state === 'simulated') ||
          !r.messages.length ||
          (await suppressed(db, r)))
      )
        fail('reply_blocked', 409)
      r.messages.push({
        id: randomUUID(),
        direction: input.direction,
        bodyText,
        createdAt: new Date().toISOString()
      })
      if (input.direction === 'inbound' && /\bstop\b/i.test(bodyText)) {
        for (const key of keys(r))
          await db.query(
            'insert into invitations_sandbox_suppression(identity) values($1) on conflict do nothing',
            [key]
          )
        r.state = 'suppressed'
        if (r.draft) r.draft.approved = false
      }
    })
  )
  return app
}
