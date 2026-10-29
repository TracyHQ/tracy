import { freezeDemoResearchInput } from './revisions.js'
import { AGENT_DEMO } from './agent-demo.js'
import { BRIEF_BUILD } from './brief-build-path.js'
/**
 * Accept build actions and reserve their daily budget in one transaction. The action's request id
 * deduplicates a press; build_request_id is the separate, stable identity the create door retries.
 * The action row is also the durable queue: no in-memory continuation owns accepted work.
 */
import { createHash, randomUUID } from 'node:crypto'
import { autoTemplate, chooseTemplate, templateRanking } from '../lib/wo-revision-choice.js'
import { failedQaHash } from './demo-qa.js'
import { BUILD_LIVE } from './build-store.js'

const DAY_MS = 86_400_000

export function demoUsageAt(used, limit, at = Date.now()) {
  return { used, limit, resetsAt: new Date(Math.floor(at / DAY_MS) * DAY_MS + DAY_MS).toISOString() }
}

/** `kind`: `demo` (Website Opportunities) or `own-site` (Build from my business), each its own daily count. */
export async function readDemoUsage(pool, accountId, limit, at = Date.now(), kind = 'demo') {
  const { rows } = await pool.query(
    'select used from wo_demo_usage where account_id = $1 and day = $2::date and kind = $3',
    [accountId, new Date(at).toISOString().slice(0, 10), kind]
  )
  return demoUsageAt(rows[0]?.used ?? 0, limit, at)
}

/**
 * The template Tracy suggests for one opportunity (`autoTemplate`): from its kind or trade, the account's Default
 * CMS and its id. `ownSite` says the opportunity is a customer's own business (`own-site.js`). `ranking` is how the
 * template picker groups the cards for its trade (`templateRanking`), null when the trade is unknown.
 * @returns {Promise<{ template: any, ownSite: boolean, ranking: { trade: string, recommended: string[], generic: string[] } | null }>}
 */
export async function recommendTemplate(db, { accountId, opportunityId, templates }) {
  const place = (
    await db.query('select candidate from wo_opportunity where account_id = $1 and id = $2', [
      accountId,
      opportunityId
    ])
  ).rows[0]
  const pref = (await db.query('select cms from wo_preference where account_id = $1', [accountId])).rows[0]
  return {
    template: autoTemplate(templates ?? { error: 'TEMPLATES_UNREADABLE' }, {
      kind: place?.candidate?.kind ?? null,
      trade: place?.candidate?.trade ?? null,
      preferredCms: pref?.cms ?? null,
      seed: opportunityId
    }),
    ownSite: Boolean(place?.candidate?.ownSite),
    ranking: templateRanking(templates, place?.candidate?.trade ?? null)
  }
}

/**
 * How the template picker groups the cards when Website Opportunities builds these opportunities
 * (`templateRanking`): by their one trade, or null when they are not all this account's, or not all of one known
 * trade (a bulk build of a bakery and a gym has no single business to recommend for).
 * @param {{ query: Function }} db
 * @param {{ accountId: string, opportunityIds: string[], templates: { cards: any[] } | { error: string } | null }} want
 */
export async function templateRankingOf(db, { accountId, opportunityIds, templates }) {
  if (!accountId || opportunityIds.length === 0) return null
  const { rows } = await db.query(
    `select candidate->>'trade' as trade from wo_opportunity where account_id = $1 and id = any($2::uuid[])`,
    [accountId, opportunityIds]
  )
  const trades = new Set(rows.map((r) => r.trade ?? 'other'))
  if (rows.length !== opportunityIds.length || trades.size !== 1) return null
  return templateRanking(templates ?? { error: 'TEMPLATES_UNREADABLE' }, [...trades][0])
}

/**
 * All-or-nothing batch acceptance. Entries are validated, account-owned opportunities/revisions.
 * A replay is matched before consulting today's counter, including across midnight. Payload drift
 * under the same id is refused. The account lock also serialises requests that straddle midnight.
 */
export async function acceptDemoActions(
  pool,
  {
    accountId,
    entries,
    limit = 20,
    now = Date.now,
    protocol = 'legacy',
    allowConcurrent = null,
    requireSelection = false,
    templates = null,
    pins = null,
    usageKind: countedAs = null
  }
) {
  if (!['legacy', 'quality-v1'].includes(protocol)) throw new Error('QUALITY_PROTOCOL_INVALID')
  // A customer's own site counts against its own cap, never against the demos (`164-wo-demo-usage-kind.sql`).
  // `/v1/demos` counts its builds apart (`external`, `public-demos.js`): its cap is live sites, not builds a day.
  const usageKind =
    countedAs ?? (entries.length > 0 && entries.every((e) => e.ownSite === true) ? 'own-site' : 'demo')
  const client = await pool.connect()
  const at = now()
  const day = new Date(at).toISOString().slice(0, 10)
  try {
    await client.query('begin')
    await client.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [`wo-demo:${accountId}`])
    const actions = []
    const fresh = []
    for (const e of entries) {
      if (
        e.chatMode !== undefined &&
        (e.chatMode !== 'client-send/1' || e.workflow !== AGENT_DEMO || e.retryOf)
      ) {
        await client.query('rollback')
        return refusal(
          400,
          'DEMO_CHAT_MODE_INVALID',
          'Choose a supported chat mode; Retry keeps its original mode.'
        )
      }
      // A brief build (the Build button's default, #191) or the agent demo; none is the quickstart-first workflow.
      if (e.workflow !== undefined && e.workflow !== AGENT_DEMO && e.workflow !== BRIEF_BUILD) {
        await client.query('rollback')
        return refusal(400, 'DEMO_WORKFLOW_INVALID', 'Choose a supported demo workflow.')
      }
      if (e.retryOf && e.workflow !== undefined) {
        await client.query('rollback')
        return refusal(400, 'RETRY_WORKFLOW_FROZEN', 'Retry keeps the original workflow.')
      }
      const fingerprint = createHash('sha256')
        .update(
          JSON.stringify([
            e.opportunityId,
            e.revisionId ?? null,
            e.retryOf ?? null,
            e.label ?? '',
            e.buildRequestId ?? null,
            e.automatic !== false,
            ...(e.selection
              ? e.selection.auto === true
                ? ['auto']
                : [e.selection.cms, e.selection.design, e.selection.quickstart]
              : []),
            ...(e.workflow ? [e.workflow] : []),
            ...(e.chatMode ? [e.chatMode] : []),
            ...(e.ownSite === true ? ['own-site'] : [])
          ])
        )
        .digest('hex')
      const old = (
        await client.query('select * from wo_demo_action where account_id = $1 and request_id = $2', [
          accountId,
          e.requestId
        ])
      ).rows[0]
      if (old) {
        if (old.fingerprint !== fingerprint) {
          await client.query('rollback')
          return refusal(409, 'REQUEST_ID_REUSED', 'Use a new requestId for a different build action.')
        }
        actions.push(old)
        continue
      }
      let selection = null
      if (!e.retryOf && !e.revisionId && e.selection?.auto === true && e.ownSite === true) {
        // Only Build from my business leaves the template to Tracy; every other build names it (below).
        const place = (
          await client.query('select candidate from wo_opportunity where account_id = $1 and id = $2', [
            accountId,
            e.opportunityId
          ])
        ).rows[0]
        const pref = (await client.query('select cms from wo_preference where account_id = $1', [accountId]))
          .rows[0]
        // A customer's own site is only for the business they saved as theirs (`own-site.js`).
        if (e.ownSite === true && !place?.candidate?.ownSite) {
          await client.query('rollback')
          return refusal(409, 'OWN_SITE_UNKNOWN', 'Start again from Build from my business.')
        }
        const chosen = autoTemplate(templates ?? { error: 'TEMPLATES_UNREADABLE' }, {
          kind: place?.candidate?.kind ?? null,
          trade: place?.candidate?.trade ?? null,
          preferredCms: pref?.cms ?? null,
          seed: e.opportunityId
        })
        if (chosen.status) {
          await client.query('rollback')
          return refusal(503, 'NO_TEMPLATE_OFFERED', 'No quickstart is offered right now. Try again later.')
        }
        selection = {
          ...(e.workflow ? { workflow: e.workflow } : {}),
          ...(e.chatMode ? { chatMode: e.chatMode } : {}),
          cms: chosen.platform,
          design: chosen.design,
          quickstart: chosen.quickstart,
          version: chosen.version,
          ...(chosen.release ? { release: chosen.release } : {}),
          auto: { reason: chosen.reason },
          ...(e.ownSite === true ? { ownSite: true } : {})
        }
      } else if (!e.retryOf && !e.revisionId && (requireSelection || e.selection)) {
        if (!e.selection || !['wordpress', 'joomla', 'emdash'].includes(e.selection.cms)) {
          await client.query('rollback')
          return refusal(
            400,
            'DEMO_TEMPLATE_REQUIRED',
            'Choose a CMS and a quickstart before building a demo.'
          )
        }
        // A CMS named without a template takes that CMS's pin on /ops/wo.
        const named = e.selection.design !== undefined || e.selection.quickstart !== undefined
        const chosen = chooseTemplate(
          templates ?? { error: 'TEMPLATES_UNREADABLE' },
          e.selection.cms,
          named ? e.selection : undefined,
          named ? null : (pins?.[e.selection.cms] ?? null)
        )
        if (chosen.refusal === 'TEMPLATE_PIN_UNAVAILABLE') {
          await client.query('rollback')
          const pin = pins?.[e.selection.cms]?.tag ?? null
          return refusal(
            409,
            'TEMPLATE_PIN_UNAVAILABLE',
            'The template pinned on /ops/wo for this CMS is not offered: pin another, or name a template.',
            { pin, cms: e.selection.cms }
          )
        }
        if (chosen.status || chosen.refusal) {
          await client.query('rollback')
          return refusal(400, 'INVALID_TEMPLATE', 'Choose an available quickstart for this CMS.')
        }
        // Build from my business with the person's own choice (`own-site.js` `POST …/:id/build`): only for the
        // business they saved as theirs, with what Tracy suggested and whether they kept it.
        let own = null
        if (e.ownSite === true) {
          const tip = await recommendTemplate(client, {
            accountId,
            opportunityId: e.opportunityId,
            templates
          })
          if (!tip.ownSite) {
            await client.query('rollback')
            return refusal(409, 'OWN_SITE_UNKNOWN', 'Start again from Build from my business.')
          }
          own = tip.template.status
            ? { ownSite: true }
            : {
                ownSite: true,
                suggested: {
                  cms: tip.template.platform,
                  design: tip.template.design,
                  quickstart: tip.template.quickstart,
                  reason: tip.template.reason,
                  taken: tip.template.platform === e.selection.cms && tip.template.design === chosen.design
                }
              }
        }
        selection = {
          ...(e.workflow ? { workflow: e.workflow } : {}),
          ...(e.chatMode ? { chatMode: e.chatMode } : {}),
          cms: e.selection.cms,
          design: chosen.design,
          quickstart: chosen.quickstart,
          version: chosen.version,
          ...(chosen.release ? { release: chosen.release } : {}),
          // Why this template (`pinned`, `pin-missing:…`, `requested`): the build keeps it with its choice.
          reason: chosen.reason,
          ...own
        }
      }
      // A deleted demo built again (`/:id/demo/rebuild`): the server passes the old build's own choice.
      if (e.revisionId && e.selection) selection = e.selection
      if (e.retryOf && e.selection) {
        await client.query('rollback')
        return refusal(400, 'RETRY_TEMPLATE_FROZEN', 'Retry keeps the original CMS and quickstart.')
      }
      const opp = (
        await client.query('select id from wo_opportunity where account_id = $1 and id = $2', [
          accountId,
          e.opportunityId
        ])
      ).rows[0]
      if (!opp) {
        await client.query('rollback')
        return refusal(404, 'NOT_FOUND', 'Reload: this opportunity is gone or is not yours.')
      }
      // One live demo per (brief, choice) (24/10/2026): the same CMS and template again while a demo of them
      // lives is refused here, before the day's charge; remove the old demo first.
      if (selection && !e.retryOf && !e.revisionId) {
        const live = (
          await client.query(
            `select b.* from wo_build b join wo_revision r on r.id = b.revision_id
             where r.opportunity_id = $1 and b.account_id = $2 and b.state = any($3::text[]) and b.demo_deleted_at is null
               and b.choice->>'cms' = $4 and b.choice->'template'->>'quickstart' = $5
               and b.choice->'template'->>'design' = $6
             order by b.created_at desc limit 1`,
            [e.opportunityId, accountId, BUILD_LIVE, selection.cms, selection.quickstart, selection.design]
          )
        ).rows[0]
        if (live) {
          await client.query('rollback')
          return refusal(409, 'BUILD_EXISTS', 'This place already has a demo with this CMS and template.', {
            build: { id: live.id, siteKey: live.site_key, state: live.state }
          })
        }
      }
      if (selection?.workflow === AGENT_DEMO) {
        selection.researchInput = await freezeDemoResearchInput(client, e.opportunityId, accountId, {
          demoRequest: e.demoRequest
        })
        selection.snapshotAt = new Date(at).toISOString()
      }
      const retry = e.retryOf
        ? (
            await client.query(
              `select a.* from wo_demo_action a
           where a.id=$1 and a.account_id=$2 and a.opportunity_id=$3
             and a.status in ('failed','quality-failed-v1','completed','quality-completed-v1')`,
              [e.retryOf, accountId, e.opportunityId]
            )
          ).rows[0]
        : null
      // The account lock serializes acceptance, not QA workers. Lock the exact build before
      // deriving a new Retry's authority from its terminal QA generation.
      const retryBuild = retry
        ? (
            await client.query(`select * from wo_build where account_id=$1 and request_id=$2 for update`, [
              accountId,
              retry.build_request_id
            ])
          ).rows[0]
        : null
      if (retry) retry.qa_failed = retryBuild?.qa?.state === 'failed'
      if (
        e.retryOf &&
        (!retry || (!['failed', 'quality-failed-v1'].includes(retry.status) && !retry.qa_failed))
      ) {
        await client.query('rollback')
        return refusal(
          409,
          'ACTION_NOT_FAILED',
          'Retry an action that has stopped, or wait for the current action.'
        )
      }
      if (retryBuild?.state === 'deleted' || retryBuild?.demo_deleted_at) {
        await client.query('rollback')
        return refusal(409, 'DEMO_DELETED', 'This demo was deleted: press Rebuild to make it again.')
      }
      const active = (
        await client.query(
          "select * from wo_demo_action where opportunity_id = $1 and account_id=$2 and status in ('queued','quality-queued-v1') order by accepted_at,id",
          [e.opportunityId, accountId]
        )
      ).rows
      let concurrent = false
      if (active.length && typeof allowConcurrent === 'function') {
        try {
          concurrent =
            (await allowConcurrent({
              client,
              accountId,
              entry: e,
              entryCount: entries.length,
              activeActions: active,
              protocol
            })) === true
        } catch {
          concurrent = false
        }
      }
      if (active.length && !concurrent) {
        await client.query('rollback')
        return refusal(409, 'DEMO_BUILD_ACTIVE', 'Wait for this place’s current demo build.', {
          actionId: active[0].id
        })
      }
      fresh.push({ ...e, selection, fingerprint, retry, retryBuild })
    }
    await client.query(
      'insert into wo_demo_usage (account_id, day, kind) values ($1, $2::date, $3) on conflict do nothing',
      [accountId, day, usageKind]
    )
    const used = (
      await client.query(
        'select used from wo_demo_usage where account_id = $1 and day = $2::date and kind = $3 for update',
        [accountId, day, usageKind]
      )
    ).rows[0].used
    if (limit > 0 && used + fresh.length > limit) {
      await client.query('rollback')
      return refusal(429, 'DEMO_BUILD_DAILY_LIMIT', 'Wait until 00:00 UTC, or select fewer places.', {
        usage: demoUsageAt(used, limit, at),
        remaining: Math.max(0, limit - used)
      })
    }
    for (const e of fresh) {
      const id = randomUUID()
      if (
        e.retry?.qa_failed &&
        e.retry.selection?.chatMode !== 'client-send/1' &&
        (e.retry.protocol ?? protocol) === 'legacy'
      ) {
        const acceptedRetry = {
          schemaVersion: 'tracy-wo-qa-retry/v1',
          acceptedActionId: id,
          buildId: e.retryBuild.id,
          failedQaGeneration: String(e.retryBuild.qa_lease_token),
          failedQaHash: failedQaHash(e.retryBuild.qa)
        }
        const held = await client.query(
          `update wo_build set qa=jsonb_set(qa,'{acceptedRetry}',$2::jsonb), updated_at=now()
           where id=$1 and account_id=$6 and qa->>'state'='failed' and qa_lease_token=$3
             and qa=$4::jsonb and (qa_lease_until is null or qa_lease_until<$5)
             and not exists(select 1 from wo_demo_action where opportunity_id=$7
               and status in ('queued','quality-queued-v1')) returning id`,
          [
            e.retryBuild.id,
            JSON.stringify(acceptedRetry),
            e.retryBuild.qa_lease_token,
            JSON.stringify(e.retryBuild.qa),
            new Date(at),
            accountId,
            e.opportunityId
          ]
        )
        if (!held.rowCount) {
          await client.query('rollback')
          return refusal(409, 'ACTION_NOT_FAILED', 'Wait for the current site check, then use a new Retry.')
        }
      }
      const { rows } = await client.query(
        `insert into wo_demo_action (id, account_id, opportunity_id, request_id, fingerprint, accepted_at,
           revision_id, build_request_id, session_id, automatic, label, queued_at, step, retry_of,protocol,status,selection)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$6,$12,$13,$14,$15,$16::jsonb) returning *`,
        [
          id,
          accountId,
          e.opportunityId,
          e.requestId,
          e.fingerprint,
          new Date(at),
          e.retry?.revision_id ?? e.revisionId ?? randomUUID(),
          e.retry?.build_request_id ?? e.buildRequestId ?? e.requestId,
          e.retry?.session_id ?? `wo-demo-${id}`,
          e.retry?.qa_failed ? true : (e.retry?.automatic ?? e.automatic !== false),
          e.retry?.label ?? e.label ?? '',
          e.retry?.step ?? (e.revisionId ? 'build' : 'brief'),
          e.retry?.id ?? null,
          e.retry?.protocol ?? protocol,
          (e.retry?.protocol ?? protocol) === 'quality-v1' ? 'quality-queued-v1' : 'queued',
          JSON.stringify(e.retry?.selection ?? e.selection ?? null)
        ]
      )
      actions.push(rows[0])
    }
    if (fresh.length)
      await client.query(
        'update wo_demo_usage set used = used + $3 where account_id = $1 and day = $2::date and kind = $4',
        [accountId, day, fresh.length, usageKind]
      )
    await client.query('commit')
    return {
      status: 202,
      body: { actions: actions.map(demoActionShape), usage: demoUsageAt(used + fresh.length, limit, at) }
    }
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

export function demoActionShape(a) {
  const agentDemo = a.selection?.workflow === AGENT_DEMO
  const chat =
    agentDemo && a.chat_site_key && a.chat_session_id
      ? {
          siteKey: a.chat_site_key,
          sessionId: a.chat_session_id,
          href: `/${encodeURIComponent(a.chat_site_key)}/s/${encodeURIComponent(a.chat_session_id)}`
        }
      : null
  return {
    id: a.id,
    opportunityId: a.opportunity_id,
    revisionId: a.revision_id,
    state:
      { 'quality-queued-v1': 'queued', 'quality-failed-v1': 'failed', 'quality-completed-v1': 'completed' }[
        a.status
      ] ?? a.status,
    ...(a.protocol === 'quality-v1' ? { protocol: a.protocol } : {}),
    ...(agentDemo
      ? { workflow: AGENT_DEMO, chat, ...(a.selection?.chatMode ? { chatMode: a.selection.chatMode } : {}) }
      : {}),
    step: a.step,
    // While the build waits for the photo labelling (item 27): how many photos were looked at so far, for
    // "Looking at photos 180/300".
    ...(a.status === 'queued' && a.selection?.photoLabelling?.state === 'running'
      ? {
          photos: {
            looked: a.selection.photoLabelling.looked ?? 0,
            total: a.selection.photoLabelling.total ?? 0
          }
        }
      : {}),
    error: a.error ?? null,
    acceptedAt: a.accepted_at,
    updatedAt: a.updated_at
  }
}

// Only a receipted, server-created session is a navigation destination. The accepted action's
// reserved session ID alone does not prove its site workspace or chat exists yet.
const ACTION_WITH_CHAT = `select a.*, b.site_key as chat_site_key,
  case when b.demo_deleted_at is null then coalesce(b.content#>>'{agentDemo,clientChat,sessionId}', b.handoff->>'sessionId') end as chat_session_id
  from wo_demo_action a left join wo_build b
    on b.account_id=a.account_id and b.request_id=a.build_request_id`

export async function demoActionOf(pool, accountId, actionId) {
  const { rows } = await pool.query(`${ACTION_WITH_CHAT} where a.account_id=$1 and a.id=$2`, [
    accountId,
    actionId
  ])
  return rows[0] ? demoActionShape(rows[0]) : null
}

export async function demoActionsOf(pool, accountId, opportunityIds) {
  if (!opportunityIds.length) return {}
  const { rows } = await pool.query(
    `${ACTION_WITH_CHAT.replace('select a.*', 'select distinct on (a.opportunity_id) a.*')}
     where a.account_id = $1 and a.opportunity_id = any($2::uuid[])
     order by a.opportunity_id, a.accepted_at desc, a.id desc`,
    [accountId, opportunityIds]
  )
  return Object.fromEntries(rows.map((a) => [a.opportunity_id, demoActionShape(a)]))
}

function refusal(status, code, next, extra = {}) {
  return { status, body: { code, next, ...extra } }
}

/** Receipted work only: a missing report is unknown, not zero and never an invented page count. */
export function demoProgress(build) {
  if (!build) return null
  const writes = build.content?.writes
  const pictures = build.pictures?.receipts
  const qa = build.qa
  return {
    writes: writes ? Object.values(writes).filter((receipt) => receipt?.state === 'written').length : null,
    photos: pictures
      ? Object.values(pictures).filter((receipt) => receipt?.state === 'verified').length
      : null,
    qa: qa
      ? {
          state: qa.state,
          rounds: (qa.rounds ?? []).length,
          issues: qa.rounds?.at(-1)?.failed?.length ?? null
        }
      : null
  }
}
