/** Protected real campaign review. Senders (`real-send.js`): the test send to the server-held list,
 * and in `pilot` mode one approved invitation to its own customer; no live source transport. */
import { Hono } from 'hono'
import { json } from '../lib/http.js'
import { body, writable } from './sandbox-guards.js'
import { realRecord } from './real-fields.js'
import { realAccessTransaction, realClock, realError, realId, realTransaction } from './real-store.js'
import {
  listCampaignSends,
  listRecipientSends,
  readSendingStatus,
  reconcileRealSend,
  sendRealInvitation,
  sendRealTest
} from './real-send.js'
import { getRetention, setRetention, extendCampaign } from './real-retention.js'
import { MAIL_FORMAT_DEFAULT, getMailFormat, setMailFormat } from './real-mail-format.js'
import { pauseRealQueue, readRealQueue, resumeRealQueue, startRealQueue } from './real-queue.js'
import { checkRealEligibility, readRealEligibility } from './real-eligibility.js'
import {
  REAL_GROUPS,
  previewRealImport,
  commitRealImport,
  listRealRecipients,
  readRealRecipient,
  campaignView,
  openCampaign,
  updateRealCampaignSettings
} from './real-import.js'
import {
  previewRealTemplate,
  saveRealTemplate,
  editRealTemplate,
  readRealTemplate,
  readRealDraftProgress,
  readRealFields,
  updateRealFields,
  updateRealRecipientValues,
  previewRealContent,
  generateRealDrafts,
  saveRealDraft,
  approveRealDraft,
  approveRealGroup,
  readRealAsset
} from './real-content.js'

function exact(input, allowed) {
  if (!realRecord(input) || Object.keys(input).some((key) => !allowed.includes(key)))
    throw realError('REAL_INVALID_INPUT')
  return input
}
function sameOrigin(c, config) {
  let origin
  try {
    origin = new URL(c.req.header('origin')).origin
  } catch {
    throw realError('REAL_SAME_ORIGIN_REQUIRED', 403)
  }
  if (origin !== new URL(config.origin).origin) throw realError('REAL_SAME_ORIGIN_REQUIRED', 403)
}
async function upload(c, allowed) {
  const raw = c.req.header('x-invitations-input')
  if (!raw) throw realError('REAL_UPLOAD_METADATA_REQUIRED')
  if (Buffer.byteLength(raw) > 4096) throw realError('REAL_METADATA_LIMIT', 413)
  let metadata
  try {
    metadata = JSON.parse(/^%7b/i.test(raw) ? decodeURIComponent(raw) : raw)
  } catch {
    throw realError('REAL_INVALID_METADATA')
  }
  exact(metadata, allowed)
  const contentType = (c.req.header('content-type') ?? '').split(';')[0].trim().toLowerCase()
  if (!['application/octet-stream', 'text/csv', 'application/zip'].includes(contentType))
    throw realError('REAL_BINARY_REQUIRED', 415)
  const reader = c.req.raw.body?.getReader()
  if (!reader) throw realError('REAL_UPLOAD_REQUIRED')
  const chunks = []
  let total = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      total += value.length
      if (total > 10 * 1024 * 1024) {
        await reader.cancel()
        throw realError('REAL_UPLOAD_LIMIT', 413)
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  return { metadata, bytes: Buffer.concat(chunks, total) }
}
export function invitationsRealRoutes({ pool, config, admit, keys, fetcher = fetch }) {
  const app = new Hono()
  app.onError((error, c) => {
    const known = typeof error.code === 'string' && /^REAL_[A-Z0-9_]+$/.test(error.code)
    if (known) {
      const status =
        error.code === 'REAL_KEY_UNAVAILABLE'
          ? 503
          : error.code === 'REAL_EXPIRED'
            ? 410
            : (error.status ?? 400)
      return json(c, { code: error.code }, status)
    }
    if (error.status || error instanceof TypeError)
      return json(c, { code: 'REAL_INVALID_REQUEST' }, error.status ?? 400)
    console.error('[invitations-real] request failed')
    return json(c, { code: 'REAL_UNAVAILABLE' }, 503)
  })
  app.use('*', async (c, next) => {
    c.header('cache-control', 'no-store')
    c.header('x-content-type-options', 'nosniff')
    const who = await admit(c)
    if (who === 'sign-in') return json(c, { code: 'REAL_NOT_SIGNED_IN' }, 401)
    if (!who) return c.body(null, 403)
    const isRoot = c.req.path.replace(/\/$/, '') === '/api/ops/invitations/real'
    if (!config.invitationsReal?.enabled || !keys) {
      if (isRoot && c.req.method === 'GET')
        return json(c, {
          enabled: false,
          mode: 'real',
          writable: false,
          sendingEnabled: false,
          campaigns: [],
          groups: REAL_GROUPS
        })
      return json(c, { code: 'REAL_NOT_FOUND' }, 404)
    }
    if (!writable(who) && !(isRoot && c.req.method === 'GET')) return c.body(null, 403)
    if (c.req.method !== 'GET') sameOrigin(c, config)
    const actor = (await pool.query('select id from account where email=$1', [who.email])).rows[0]
    if (!actor) return c.body(null, 403)
    c.set('realActorId', actor.id)
    c.set('realWritable', writable(who))
    c.set('realPool', {
      query: pool.query.bind(pool),
      connect: pool.connect.bind(pool),
      async realAuthorize(db) {
        const current = (
          await db.query(
            `select sw.role from seat_workspace sw
          join workspace w on w.id=sw.workspace_id join account a on a.id=sw.account_id
          where a.id=$1 and a.email=$2 and w.kind='tracy_admin' and sw.revoked_at is null
          and sw.declined_at is null and sw.accepted_at is not null
          limit 1 for share of sw,a,w`,
            [actor.id, who.email]
          )
        ).rows[0]
        if (!current || (writable(who) && !writable(current))) throw realError('REAL_ACCESS_REVOKED', 403)
      }
    })
    await next()
    // Do not release a buffered PII response if access changed after its service transaction.
    await realAccessTransaction(c.get('realPool'), async () => {})
  })
  const common = (c) => ({
    pool: c.get('realPool'),
    keys,
    campaignId: c.req.param('id'),
    actorId: c.get('realActorId')
  })
  async function input(c, allowed) {
    return exact(await body(c, config), allowed)
  }
  async function view(id, pool) {
    return realTransaction({ pool, keys, campaignId: id }, (_db, state) =>
      campaignView(state.row, openCampaign(state.row, state.key))
    )
  }
  app.get('/', async (c) => {
    const now = await realClock(pool)
    const rows = (
      await pool.query(
        'select id,revision,source_date::text,first_imported_at,expires_at,tombstoned_at,counts from invitations_real_campaign order by first_imported_at desc,id limit 100'
      )
    ).rows
    const campaigns = []
    for (const row of rows) {
      const expired = Boolean(row.tombstoned_at || Date.parse(now) >= row.expires_at.getTime())
      const aggregate = {
        id: row.id,
        revision: Number(row.revision),
        sourceDate: row.source_date,
        firstImportedAt: row.first_imported_at.toISOString(),
        expiresAt: row.expires_at.toISOString(),
        expired,
        counts: row.counts,
        eligibleNow: null,
        sendingEnabled: false
      }
      if (!c.get('realWritable') || expired) {
        campaigns.push(aggregate)
        continue
      }
      // One campaign that cannot be opened (missing or busy key, expired mid-read) must not hide the
      // others: it is listed with its aggregate and the error code only.
      try {
        campaigns.push({ ...aggregate, ...(await view(row.id, c.get('realPool'))) })
      } catch (error) {
        campaigns.push({
          ...aggregate,
          unavailable: error.code?.startsWith('REAL_') ? error.code : 'REAL_UNAVAILABLE'
        })
      }
    }
    return json(c, {
      enabled: true,
      mode: 'real',
      writable: c.get('realWritable'),
      sendingEnabled: false,
      groups: REAL_GROUPS,
      campaigns
    })
  })
  app.get('/settings', async (c) => json(c, { days: await getRetention({ db: pool }) }))
  app.post('/settings', async (c) => {
    const value = await input(c, ['days'])
    return json(c, {
      days: await realAccessTransaction(c.get('realPool'), (db) =>
        setRetention({ db, days: value.days, actorId: c.get('realActorId') })
      )
    })
  })
  // Setup › Email format (`real-mail-format.js`): how every real send is packaged.
  app.get('/mail-format', async (c) => json(c, await getMailFormat({ db: pool })))
  app.post('/mail-format', async (c) => {
    // Every field the format has, read from the format itself so a new switch cannot be left out here.
    const value = await input(c, Object.keys(MAIL_FORMAT_DEFAULT))
    return json(
      c,
      await realAccessTransaction(c.get('realPool'), (db) =>
        setMailFormat({ db, value, actorId: c.get('realActorId') })
      )
    )
  })
  app.post('/imports/preview', async (c) => {
    const { metadata, bytes } = await upload(c, ['campaignId', 'name', 'sourceDate', 'mapping'])
    return json(
      c,
      await previewRealImport({
        ...metadata,
        pool: c.get('realPool'),
        keys,
        actorId: c.get('realActorId'),
        csvBytes: bytes
      })
    )
  })
  app.post('/imports/commit', async (c) =>
    json(
      c,
      await commitRealImport({
        ...(await input(c, ['previewId', 'digest', 'revision', 'requestKey'])),
        pool: c.get('realPool'),
        keys,
        actorId: c.get('realActorId')
      }),
      201
    )
  )
  app.get('/campaigns/:id', async (c) => json(c, await view(realId(c.req.param('id')), c.get('realPool'))))
  app.post('/campaigns/:id/recipients/query', async (c) =>
    json(
      c,
      await listRealRecipients({
        ...(await input(c, ['group', 'state', 'search', 'content', 'cursor', 'limit'])),
        ...common(c)
      })
    )
  )
  app.get('/campaigns/:id/recipients/:rid', async (c) =>
    json(c, await readRealRecipient({ ...common(c), recipientId: c.req.param('rid') }))
  )
  // Campaign settings (`real-import.js`): who it sends to and the names of its groups.
  app.post('/campaigns/:id/settings', async (c) =>
    json(
      c,
      await updateRealCampaignSettings({
        ...(await input(c, ['revision', 'audience', 'groupLabels'])),
        ...common(c)
      })
    )
  )
  app.post('/campaigns/:id/extend', async (c) => {
    const value = await input(c, ['revision', 'expiresAt', 'confirm'])
    if (value.confirm !== true) throw realError('REAL_CONFIRMATION_REQUIRED')
    return json(c, await extendCampaign({ ...value, ...common(c) }))
  })
  app.get('/campaigns/:id/fields', async (c) => json(c, await readRealFields(common(c))))
  app.post('/campaigns/:id/fields', async (c) =>
    json(c, await updateRealFields({ ...(await input(c, ['revision', 'registry'])), ...common(c) }))
  )
  app.post('/campaigns/:id/recipients/:rid/fields', async (c) =>
    json(
      c,
      await updateRealRecipientValues({
        ...(await input(c, ['revision', 'values'])),
        ...common(c),
        recipientId: c.req.param('rid')
      })
    )
  )
  app.get('/campaigns/:id/drafts/progress', async (c) => json(c, await readRealDraftProgress(common(c))))
  app.get('/campaigns/:id/templates/:group', async (c) =>
    json(c, await readRealTemplate({ ...common(c), group: c.req.param('group') }))
  )
  app.post('/campaigns/:id/templates/preview', async (c) => {
    const { metadata, bytes } = await upload(c, ['group', 'subject', 'revision', 'requestKey'])
    return json(c, await previewRealTemplate({ ...metadata, ...common(c), zipBytes: bytes }))
  })
  const writes = [
    ['/templates/commit', saveRealTemplate, ['uploadId', 'revision', 'requestKey']],
    [
      '/templates/edit',
      editRealTemplate,
      ['group', 'subject', 'html', 'text', 'assetIds', 'revision', 'requestKey']
    ],
    ['/content-preview', previewRealContent, ['group', 'recipientId', 'revision']],
    ['/generate', generateRealDrafts, ['group', 'cursor', 'limit', 'replaceExisting', 'revision']],
    ['/approve-group', approveRealGroup, ['group', 'cursor', 'revision']]
  ]
  for (const [path, service, allowed] of writes)
    app.post(`/campaigns/:id${path}`, async (c) =>
      json(c, await service({ ...(await input(c, allowed)), ...common(c) }))
    )
  for (const [path, service, allowed] of [
    ['draft', saveRealDraft, ['subject', 'html', 'text', 'revision', 'draftRevision']],
    ['approve', approveRealDraft, ['revision', 'draftRevision']]
  ])
    app.post(`/campaigns/:id/recipients/:rid/${path}`, async (c) =>
      json(c, await service({ ...(await input(c, allowed)), ...common(c), recipientId: c.req.param('rid') }))
    )
  app.get('/campaigns/:id/assets/:assetId', async (c) => {
    const image = await readRealAsset({ ...common(c), assetId: c.req.param('assetId') })
    c.header('content-type', image.mediaType)
    c.header('content-disposition', 'inline')
    return c.body(image.bytes)
  })
  // Sends (`real-send.js`): a test to one address of the server-held list, or (pilot) the invitation
  // to the recipient's own address, which is never taken from the request.
  app.get('/sending', async (c) =>
    json(
      c,
      await readSendingStatus({
        pool: c.get('realPool'),
        config,
        campaignId: c.req.query('campaign') ?? null
      })
    )
  )
  // Check eligibility (`real-eligibility.js`): one page of live aMember answers per press.
  app.get('/campaigns/:id/eligibility', async (c) => json(c, await readRealEligibility(common(c))))
  app.post('/campaigns/:id/eligibility/check', async (c) => {
    const value = await input(c, ['cursor', 'limit'])
    return json(c, await checkRealEligibility({ ...value, ...common(c), config, fetcher }))
  })
  // Send queue (`real-queue.js`): the cron sends one approved email at a time under the same checks.
  app.get('/campaigns/:id/queue', async (c) => json(c, await readRealQueue(common(c))))
  app.post('/campaigns/:id/queue/start', async (c) => {
    const value = await input(c, ['groups'])
    return json(c, await startRealQueue({ ...value, ...common(c), config }))
  })
  app.post('/campaigns/:id/queue/pause', async (c) => {
    await input(c, [])
    return json(c, await pauseRealQueue(common(c)))
  })
  app.post('/campaigns/:id/queue/resume', async (c) => {
    await input(c, [])
    return json(c, await resumeRealQueue(common(c)))
  })
  app.get('/campaigns/:id/sends', async (c) => json(c, await listCampaignSends(common(c))))
  app.get('/campaigns/:id/recipients/:rid/sends', async (c) =>
    json(c, await listRecipientSends({ ...common(c), recipientId: c.req.param('rid') }))
  )
  app.post('/campaigns/:id/recipients/:rid/send-test', async (c) => {
    const value = await input(c, ['to', 'requestKey', 'draftRevision'])
    return json(
      c,
      await sendRealTest({ ...value, ...common(c), config, fetcher, recipientId: c.req.param('rid') })
    )
  })
  app.post('/campaigns/:id/recipients/:rid/send-invitation', async (c) => {
    const value = await input(c, ['requestKey', 'draftRevision'])
    return json(
      c,
      await sendRealInvitation({ ...value, ...common(c), config, fetcher, recipientId: c.req.param('rid') })
    )
  })
  app.post('/campaigns/:id/sends/:sendId/reconcile', async (c) =>
    json(c, await reconcileRealSend({ ...common(c), config, fetcher, sendId: c.req.param('sendId') }))
  )
  // Own the prefix, including unknown send/simulate paths; never fall through to sandbox.
  app.all('*', (c) => json(c, { code: 'REAL_NOT_FOUND' }, 404))
  return app
}
