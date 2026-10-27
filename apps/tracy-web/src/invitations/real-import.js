import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { BASELINE_MAPPING, normalizeBaselineRows, parseCsv } from './csv.js'
import { previewRows } from './import.js'
import { identityKey, open, seal } from './real-crypto.js'
import { getRetention } from './real-retention.js'
import { realAccessTransaction, realClock, realError, realId, realTransaction } from './real-store.js'
import { readRealDraftInTransaction, invalidateRealContent } from './real-content.js'

export const REAL_GROUPS = Object.freeze([
  { key: 'group_1', source: '1 agency dang hoat dong', label: 'Active agencies' },
  { key: 'group_2', source: '2 agency it hoat dong', label: 'Less active agencies' },
  { key: 'group_3', source: '3 doanh nghiep dang hoat dong', label: 'Active businesses' },
  { key: 'group_4', source: '4 doanh nghiep it hoat dong', label: 'Less active businesses' },
  { key: 'group_5', source: '5 ca nhan', label: 'Individuals' }
])
const SLOT_KEYS = REAL_GROUPS.map((g) => g.key)
/** Who a campaign may send to: customers with an active plan (the default), or past customers too. */
export const REAL_AUDIENCES = Object.freeze(['active_plan', 'past_customers'])

/** The groups of one campaign: its own (from a CSV whose group values are not the baseline five,
 * with labels the operator may rename) or the baseline five. Keys are always the five slots. */
export function campaignGroups(payload) {
  return payload?.groups ?? REAL_GROUPS
}
export function campaignAudience(payload) {
  return payload?.audience ?? 'active_plan'
}
export function groupSlot(key) {
  return SLOT_KEYS.indexOf(key)
}
// A CSV whose group column holds one to five values, none of them a baseline source, gets its own
// groups in natural order of those values. A CSV with any baseline value keeps the baseline, so a
// mistyped group in a baseline file still surfaces as `unknown_group` instead of a new group.
function detectGroups(parsed, mapping) {
  const column = parsed.headers.findIndex((h) => mapping[h] === 'group_key')
  if (column < 0) return REAL_GROUPS
  const values = [...new Set(parsed.rows.map((row) => String(row[column] ?? '').trim()))]
  if (values.some((v) => !v) || values.length > SLOT_KEYS.length) return REAL_GROUPS
  if (values.some((v) => REAL_GROUPS.some((g) => g.source === v))) return REAL_GROUPS
  values.sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
  return values.map((v, i) => ({ key: SLOT_KEYS[i], source: v, label: v }))
}
function catalogueOf(groups) {
  if (groups === REAL_GROUPS)
    return { version: 'sarah-baseline-2026-10-07', keys: REAL_GROUPS.map((g) => g.source) }
  // The shared importer wants exactly five distinct keys; unused slots get keys no cell can hold.
  const keys = SLOT_KEYS.map((key, i) => groups[i]?.source ?? `\u0000unused ${key}`)
  return { version: `campaign-groups-v1:${JSON.stringify(groups.map((g) => g.source))}`, keys }
}
const PREVIEW_MS = 30 * 60000
const DAY_MS = 86400000
const BLOCKING = new Set([
  'invalid_email',
  'invalid_member_id',
  'unknown_group',
  'content_conflict',
  'identity_conflict',
  'raw_conflict'
])

export function sealRealJson(key, campaignId, recordId, purpose, version, value) {
  return seal({
    key,
    context: { campaignId, recordId, purpose, version },
    bytes: Buffer.from(JSON.stringify(value))
  })
}
export function openRealJson(key, campaignId, recordId, purpose, version, envelope) {
  try {
    return JSON.parse(
      open({ key, context: { campaignId, recordId, purpose, version }, envelope }).toString('utf8')
    )
  } catch {
    throw realError('REAL_KEY_UNAVAILABLE', 503)
  }
}
export function campaignView(row, payload) {
  return {
    id: row.id,
    name: payload.name,
    revision: Number(row.revision),
    sourceDate: row.source_date,
    firstImportedAt: row.first_imported_at.toISOString(),
    expiresAt: row.expires_at.toISOString(),
    counts: row.counts,
    eligibleNow: null,
    sendingEnabled: false,
    groups: campaignGroups(payload).map(({ key, label }) => ({ key, label })),
    audience: campaignAudience(payload)
  }
}
export function openCampaign(row, key) {
  return openRealJson(key, row.id, row.id, 'campaign', 1, row.payload)
}

function mac(key, value) {
  return createHmac('sha256', key).update(JSON.stringify(value)).digest('base64url')
}
function equal(a, b) {
  return (
    typeof a === 'string' &&
    typeof b === 'string' &&
    a.length === b.length &&
    timingSafeEqual(Buffer.from(a), Buffer.from(b))
  )
}
function sourceComparable(source, mapping) {
  return JSON.stringify(
    source.headers.map((h, i) =>
      ['email', 'source_member_id'].includes(mapping[h]) ? null : source.values[i]
    )
  )
}
function countsOf(candidates, groups) {
  return {
    total: candidates.length,
    groups: SLOT_KEYS.map(
      (key) => candidates.filter((c) => c.sourceGroup === groups.find((g) => g.key === key)?.source).length
    ),
    suppressed: candidates.filter((c) => c.state === 'suppressed').length,
    recheck: candidates.filter((c) => c.state !== 'suppressed').length
  }
}
// `groups` is the campaign's when importing into one; a new campaign takes them from the CSV.
function prepared(csvBytes, mapping, groups = null) {
  const parsed = parseCsv({ csvBytes })
  if (!parsed.rows.length) throw realError('REAL_EMPTY_IMPORT')
  mapping ??= Object.fromEntries(
    Object.entries(BASELINE_MAPPING).filter(([key]) => parsed.headers.includes(key))
  )
  // Validate the mapping using the shared importer before the baseline flag adapter reads it.
  previewRows({
    ...parsed,
    rows: [],
    mapping,
    schemaVersion: 'invitations-v1',
    groupCatalogue: catalogueOf(REAL_GROUPS)
  })
  groups ??= detectGroups(parsed, mapping)
  const catalogue = catalogueOf(groups)
  previewRows({ ...parsed, rows: [], mapping, schemaVersion: 'invitations-v1', groupCatalogue: catalogue })
  const preview = previewRows({
    ...parsed,
    rows: normalizeBaselineRows({ ...parsed, mapping }),
    mapping,
    schemaVersion: 'invitations-v1',
    groupCatalogue: catalogue
  })
  const issues = preview.issues.map((i) => ({ ...i, blocking: BLOCKING.has(i.code) }))
  const candidates = preview.candidates.map((c) => {
    const rawSources = c.sourceRows.map((row) => ({ headers: parsed.headers, values: parsed.rows[row - 2] }))
    if (new Set(rawSources.map((s) => sourceComparable(s, mapping))).size > 1)
      for (const row of c.sourceRows) issues.push({ row, code: 'raw_conflict', blocking: true })
    return { ...c, rawSource: rawSources[0], rawSources }
  })
  return {
    headers: parsed.headers,
    mapping,
    candidates,
    issues,
    counts: countsOf(candidates, groups),
    // Survives the sealed preview as plain JSON: null means the baseline five.
    groups: groups === REAL_GROUPS ? null : groups,
    sourceChecksum: parsed.sourceChecksum
  }
}
function identityEntries(c, indexKey) {
  return [
    { kind: 'email', identity_key: identityKey({ indexKey, kind: 'email', value: c.normalizedEmail }) },
    ...c.identities.map((i) => ({
      kind: 'member',
      identity_key: identityKey({ indexKey, kind: 'member', value: i.memberId })
    }))
  ]
}
async function existingRecipients(db, state, data) {
  const hashes = data.candidates.flatMap((c) => identityEntries(c, state.indexKey).map((i) => i.identity_key))
  const matched = hashes.length
    ? (
        await db.query(
          `select distinct r.* from invitations_real_identity i join invitations_real_recipient r on r.campaign_id=i.campaign_id and r.id=i.recipient_id where i.campaign_id=$1 and i.identity_key=any($2::text[])`,
          [state.row.id, hashes]
        )
      ).rows
    : []
  const byEmail = new Map(),
    byMember = new Map()
  for (const r of matched) {
    const value = openRealJson(state.key, r.campaign_id, r.id, 'recipient', Number(r.revision), r.payload)
    byEmail.set(value.normalizedEmail, { row: r, value })
    for (const i of value.identities) byMember.set(i.memberId, { row: r, value })
  }
  const issues = []
  for (const c of data.candidates) {
    const old = byEmail.get(c.normalizedEmail)
    const collision = c.identities.some(
      (i) => byMember.has(i.memberId) && byMember.get(i.memberId).value.normalizedEmail !== c.normalizedEmail
    )
    const rawConflict =
      old &&
      (JSON.stringify(old.value.rawSource.headers) !== JSON.stringify(c.rawSource.headers) ||
        sourceComparable(old.value.rawSource, data.mapping) !== sourceComparable(c.rawSource, data.mapping))
    if (collision || rawConflict)
      for (const row of c.sourceRows)
        issues.push({ row, code: collision ? 'identity_conflict' : 'raw_conflict', blocking: true })
  }
  return { byEmail, issues }
}

export async function previewRealImport({
  pool,
  keys,
  campaignId = null,
  csvBytes,
  name,
  sourceDate,
  mapping,
  actorId
}) {
  realId(actorId)
  if (campaignId !== null) realId(campaignId)
  if (typeof name !== 'string' || !name.trim() || Buffer.byteLength(name) > 240)
    throw realError('REAL_INVALID_NAME')
  if (
    typeof sourceDate !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(sourceDate) ||
    !Number.isFinite(Date.parse(sourceDate)) ||
    new Date(sourceDate).toISOString().slice(0, 10) !== sourceDate
  )
    throw realError('REAL_INVALID_DATE')
  const prepare = (groups) => {
    try {
      return prepared(csvBytes, mapping, groups)
    } catch (error) {
      if (error.code?.startsWith('REAL_')) throw error
      throw realError('REAL_INVALID_CSV')
    }
  }
  let data = campaignId === null ? prepare(null) : null
  const id = randomUUID()
  async function persist(db, state = null) {
    const revision = state?.row.revision ?? 0
    if (state) {
      const campaign = openCampaign(state.row, state.key)
      data = prepare(campaignGroups(campaign))
      if (
        JSON.stringify(campaign.headers) !== JSON.stringify(data.headers) ||
        JSON.stringify(campaign.mapping) !== JSON.stringify(data.mapping)
      )
        throw realError('REAL_SOURCE_SCHEMA_CONFLICT', 409)
      data.issues.push(...(await existingRecipients(db, state, data)).issues)
    }
    const now = await realClock(db)
    const expiresAt = new Date(
      Math.min(
        Date.parse(now) + PREVIEW_MS,
        state ? Math.min(state.row.expires_at.getTime(), Date.parse(state.expiresAt)) : Infinity
      )
    ).toISOString()
    await keys.create({ campaignId: id, now, initialImportedAt: now, expiresAt })
    const { key, indexKey } = await keys.read({ campaignId: id, now })
    const digest = mac(indexKey, [
      id,
      actorId,
      campaignId,
      name,
      sourceDate,
      data.sourceChecksum,
      data.mapping
    ])
    const payload = sealRealJson(key, id, id, 'import', 1, { ...data, name: name.trim(), sourceDate })
    await db.query(
      "insert into invitations_real_import(id,campaign_id,actor_id,kind,status,digest,expected_revision,payload,expires_at) values($1,$2,$3,'recipients','preview',$4,$5,$6,$7)",
      [id, campaignId, actorId, digest, revision, payload, expiresAt]
    )
    return { previewId: id, digest, revision, counts: data.counts, issues: data.issues, expiresAt }
  }
  try {
    return campaignId
      ? await realTransaction({ pool, keys, campaignId }, persist)
      : await realAccessTransaction(pool, persist)
  } catch (error) {
    await keys.revoke({ campaignId: id, now: await realClock(pool) })
    throw error
  }
}

async function checkedPreview(db, keys, input) {
  const row = (
    await db.query("select * from invitations_real_import where id=$1 and kind='recipients' for update", [
      input.previewId
    ])
  ).rows[0]
  if (!row || row.actor_id !== input.actorId) throw realError('REAL_NOT_FOUND', 404)
  if (!equal(row.digest, input.digest)) throw realError('REAL_IMPORT_MISMATCH', 409)
  if (row.status === 'committed') {
    if (row.request_key !== input.requestKey) throw realError('REAL_IMPORT_MISMATCH', 409)
    return { row, receipt: row.result }
  }
  if (Number(row.expected_revision) !== input.revision) throw realError('REAL_STALE_REVISION', 409)
  const now = await realClock(db)
  if (Date.parse(now) >= row.expires_at.getTime()) {
    await keys.revoke({ campaignId: row.id, now })
    throw realError('REAL_EXPIRED', 410)
  }
  const { key } = await keys.read({ campaignId: row.id, now })
  const data = openRealJson(key, row.id, row.id, 'import', 1, row.payload)
  if (data.issues.some((i) => i.blocking)) throw realError('REAL_IMPORT_HAS_ERRORS', 409)
  return { row, data, now }
}

async function activePreview(db, keys, id, expiresAt) {
  const now = await realClock(db)
  const stored = (await db.query('select expires_at from invitations_real_import where id=$1', [id])).rows[0]
  if (!stored || Date.parse(now) >= Math.min(stored.expires_at.getTime(), expiresAt.getTime())) {
    await keys.revoke({ campaignId: id, now })
    throw realError('REAL_EXPIRED', 410)
  }
  await keys.read({ campaignId: id, now })
}
async function requestLock(db, input) {
  await db.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [
    `invitations-real:${input.actorId}:${input.requestKey}`
  ])
  const other = (
    await db.query(
      "select id from invitations_real_import where actor_id=$1 and kind='recipients' and request_key=$2",
      [input.actorId, input.requestKey]
    )
  ).rows[0]
  if (other && other.id !== input.previewId) throw realError('REAL_IMPORT_MISMATCH', 409)
}
async function insertRecipients(db, state, data) {
  const groups = campaignGroups(openCampaign(state.row, state.key))
  const existing = await existingRecipients(db, state, data)
  if (existing.issues.length) throw realError('REAL_IMPORT_CONFLICT', 409)
  const inserts = [],
    identities = []
  for (const c of data.candidates) {
    const old = existing.byEmail.get(c.normalizedEmail)
    const id = old?.row.id ?? randomUUID(),
      revision = old ? Number(old.row.revision) + 1 : 1
    const value = {
      ...c,
      provenance: {
        sourceRows: c.sourceRows,
        sourceDate: data.sourceDate,
        sourceChecksums: [data.sourceChecksum]
      }
    }
    if (old) {
      value.manualValues = old.value.manualValues ?? {}
      value.identities = [
        ...new Map([...old.value.identities, ...c.identities].map((i) => [i.memberId, i])).values()
      ]
      value.rawSources = [...old.value.rawSources, ...c.rawSources]
      value.provenance.sourceChecksums = [
        ...new Set([...old.value.provenance.sourceChecksums, data.sourceChecksum])
      ]
      const payload = sealRealJson(state.key, state.row.id, id, 'recipient', revision, value)
      await db.query(
        'update invitations_real_recipient set payload=$3,revision=$4 where campaign_id=$1 and id=$2',
        [state.row.id, id, payload, revision]
      )
    } else
      inserts.push({
        id,
        campaign_id: state.row.id,
        group_key: groups.find((g) => g.source === c.sourceGroup).key,
        state: c.state === 'suppressed' ? 'suppressed' : 'recheck',
        revision,
        payload: sealRealJson(state.key, state.row.id, id, 'recipient', revision, value)
      })
    for (const i of identityEntries(c, state.indexKey))
      identities.push({ ...i, campaign_id: state.row.id, recipient_id: id })
  }
  for (let i = 0; i < inserts.length; i += 1000)
    await db.query(
      `insert into invitations_real_recipient(id,campaign_id,group_key,state,revision,payload)
    select id,campaign_id,group_key,state,revision,payload from jsonb_to_recordset($1::jsonb) as x(id uuid,campaign_id uuid,group_key text,state text,revision bigint,payload jsonb)`,
      [JSON.stringify(inserts.slice(i, i + 1000))]
    )
  for (let i = 0; i < identities.length; i += 1000)
    await db.query(
      `insert into invitations_real_identity(campaign_id,recipient_id,kind,identity_key)
    select campaign_id,recipient_id,kind,identity_key from jsonb_to_recordset($1::jsonb) as x(campaign_id uuid,recipient_id uuid,kind text,identity_key text) on conflict do nothing`,
      [JSON.stringify(identities.slice(i, i + 1000))]
    )
  const rows = (
    await db.query(
      'select group_key,state,count(*)::int as n from invitations_real_recipient where campaign_id=$1 group by group_key,state',
      [state.row.id]
    )
  ).rows
  const counts = { total: 0, groups: [0, 0, 0, 0, 0], suppressed: 0, recheck: 0 }
  for (const r of rows) {
    counts.total += r.n
    counts.groups[groupSlot(r.group_key)] += r.n
    counts[r.state] += r.n
  }
  await db.query('update invitations_real_campaign set counts=$2 where id=$1', [state.row.id, counts])
  return counts
}
async function receipt(db, input, view) {
  await db.query(
    "update invitations_real_import set campaign_id=$2,status='committed',request_key=$3,payload=null,result=$4,expires_at=$5 where id=$1",
    [input.previewId, view.id, input.requestKey, { ...view, name: undefined }, view.expiresAt]
  )
  // A receipt stores only non-PII. Names are decrypted from the campaign on retry.
  await db.query(
    "insert into invitations_real_audit(id,campaign_id,actor_id,action) values($1,$2,$3,'recipients_imported')",
    [randomUUID(), view.id, input.actorId]
  )
}
async function readReceipt(pool, keys, input) {
  const r = (
    await pool.query(
      "select * from invitations_real_import where actor_id=$1 and kind='recipients' and request_key=$2",
      [input.actorId, input.requestKey]
    )
  ).rows[0]
  if (!r) return null
  if (
    r.id !== input.previewId ||
    !equal(r.digest, input.digest) ||
    Number(r.expected_revision) !== input.revision
  )
    throw realError('REAL_IMPORT_MISMATCH', 409)
  return realTransaction({ pool, keys, campaignId: r.campaign_id }, (_db, { row, key }) => ({
    ...r.result,
    name: openCampaign(row, key).name
  }))
}

export async function commitRealImport(input) {
  const { pool, keys, previewId, actorId, requestKey } = input
  for (const id of [previewId, actorId, requestKey]) realId(id)
  if (!Number.isSafeInteger(input.revision) || input.revision < 0) throw realError('REAL_INVALID_REVISION')
  const prior = await readReceipt(pool, keys, input)
  if (prior) return prior
  const meta = (
    await pool.query('select campaign_id,status from invitations_real_import where id=$1', [previewId])
  ).rows[0]
  if (!meta) throw realError('REAL_NOT_FOUND', 404)
  if (meta.status === 'committed') {
    const retried = await readReceipt(pool, keys, input)
    if (retried) return retried
    throw realError('REAL_IMPORT_MISMATCH', 409)
  }
  let view,
    newId,
    db,
    committed = false
  try {
    if (meta.campaign_id) {
      view = await realTransaction(
        { pool, keys, campaignId: meta.campaign_id, expectedRevision: input.revision, write: true },
        async (client, state) => {
          await requestLock(client, input)
          const { data, receipt: prior, row: preview } = await checkedPreview(client, keys, input)
          if (prior) throw realError('REAL_STALE_REVISION', 409)
          const payload = openCampaign(state.row, state.key)
          if (
            JSON.stringify(payload.headers) !== JSON.stringify(data.headers) ||
            JSON.stringify(payload.mapping) !== JSON.stringify(data.mapping)
          )
            throw realError('REAL_SOURCE_SCHEMA_CONFLICT', 409)
          const counts = await insertRecipients(client, state, data)
          await invalidateRealContent(client, state, actorId)
          const result = campaignView({ ...state.row, counts, revision: state.row.revision + 1 }, payload)
          await activePreview(client, keys, previewId, preview.expires_at)
          await receipt(client, input, result)
          await activePreview(client, keys, previewId, preview.expires_at)
          return result
        }
      )
    } else {
      db = await pool.connect()
      await db.query('begin')
      await db.query("set local statement_timeout='10000';set local lock_timeout='5000'")
      await requestLock(db, input)
      await pool.realAuthorize?.(db)
      const { data, receipt: prior, row: preview } = await checkedPreview(db, keys, input)
      if (prior) {
        await db.query('rollback')
        db.release()
        db = null
        return readReceipt(pool, keys, input)
      }
      const now = await realClock(db),
        days = await getRetention({ db })
      newId = randomUUID()
      const expiresAt = new Date(Date.parse(now) + days * DAY_MS).toISOString()
      await keys.create({ campaignId: newId, now, initialImportedAt: now, expiresAt })
      const material = await keys.read({ campaignId: newId, now })
      const payload = { name: data.name, headers: data.headers, mapping: data.mapping, registry: null }
      if (data.groups) payload.groups = data.groups
      const row = (
        await db.query(
          'insert into invitations_real_campaign(id,source_date,first_imported_at,expires_at,payload) values($1,$2,$3,$4,$5) returning *,source_date::text',
          [
            newId,
            data.sourceDate,
            now,
            expiresAt,
            sealRealJson(material.key, newId, newId, 'campaign', 1, payload)
          ]
        )
      ).rows[0]
      row.revision = Number(row.revision)
      const counts = await insertRecipients(db, { row, ...material }, data)
      view = campaignView({ ...row, counts }, payload)
      await activePreview(db, keys, previewId, preview.expires_at)
      await receipt(db, input, view)
      const finalNow = await realClock(db)
      if (
        Date.parse(finalNow) >= preview.expires_at.getTime() ||
        Date.parse(finalNow) >= Date.parse(expiresAt)
      )
        throw realError('REAL_EXPIRED', 410)
      await keys.read({ campaignId: previewId, now: finalNow })
      await keys.read({ campaignId: newId, now: finalNow })
      await db.query('commit')
      committed = true
    }
  } catch (error) {
    if (db) await db.query('rollback').catch(() => {})
    if (newId && !committed) await keys.revoke({ campaignId: newId, now: await realClock(pool) })
    const retried = await readReceipt(pool, keys, input)
    if (retried) return retried
    if (error.code?.startsWith('REAL_')) throw error
    throw realError('REAL_IMPORT_FAILED', 409)
  } finally {
    if (db) db.release()
  }
  await keys.revoke({ campaignId: previewId, now: await realClock(pool) })
  return view
}

const LABEL_BYTES = 120
/** Campaign settings: who it sends to (`audience`) and the operator's names for its groups.
 * Renaming a group changes the {{group}} field, so drafts that use it need review again. */
export async function updateRealCampaignSettings({
  pool,
  keys,
  campaignId,
  actorId,
  revision,
  audience,
  groupLabels
}) {
  realId(actorId)
  if (!REAL_AUDIENCES.includes(audience)) throw realError('REAL_INVALID_AUDIENCE')
  if (!groupLabels || typeof groupLabels !== 'object' || Array.isArray(groupLabels))
    throw realError('REAL_INVALID_GROUP_LABELS')
  return realTransaction(
    { pool, keys, campaignId, expectedRevision: revision, write: true },
    async (db, state) => {
      const payload = openCampaign(state.row, state.key)
      const groups = campaignGroups(payload)
      for (const [key, label] of Object.entries(groupLabels))
        if (
          !groups.some((g) => g.key === key) ||
          typeof label !== 'string' ||
          !label.trim() ||
          Buffer.byteLength(label.trim()) > LABEL_BYTES ||
          /[\p{Cc}\u2028\u2029]/u.test(label)
        )
          throw realError('REAL_INVALID_GROUP_LABELS')
      const next = groups.map((g) => ({ ...g, label: groupLabels[g.key]?.trim() ?? g.label }))
      const renamed = next.some((g, i) => g.label !== groups[i].label)
      if (renamed) payload.groups = next
      const changed = renamed || campaignAudience(payload) !== audience
      payload.audience = audience
      const envelope = sealRealJson(state.key, state.row.id, state.row.id, 'campaign', 1, payload)
      await db.query('update invitations_real_campaign set payload=$2 where id=$1', [state.row.id, envelope])
      state.row.payload = envelope
      if (renamed) await invalidateRealContent(db, state, actorId)
      if (changed)
        await db.query(
          "insert into invitations_real_audit(id,campaign_id,actor_id,action) values($1,$2,$3,'campaign_settings_changed')",
          [randomUUID(), state.row.id, actorId]
        )
      return campaignView({ ...state.row, revision: state.row.revision + 1 }, payload)
    }
  )
}

function summary(row, value, groups = REAL_GROUPS) {
  return {
    id: row.id,
    email: value.normalizedEmail,
    firstName: value.manualValues?.first_name || 'there',
    group: row.group_key,
    groupLabel: groups.find((g) => g.key === row.group_key)?.label ?? row.group_key,
    state: row.state,
    contentStatus: 'not_created',
    reasons: [
      ...(value.negativeAssertions.globalUnsubscribed ? ['GLOBAL_UNSUBSCRIBED'] : []),
      ...(value.negativeAssertions.internal ? ['INTERNAL'] : []),
      ...(value.needsReview ? ['SOURCE_ASSERTIONS_UNKNOWN'] : [])
    ]
  }
}
export async function readRealRecipient({ pool, keys, campaignId, recipientId }) {
  realId(recipientId)
  return realTransaction({ pool, keys, campaignId }, async (db, state) => {
    const { row, key } = state
    const r = (
      await db.query('select * from invitations_real_recipient where campaign_id=$1 and id=$2', [
        row.id,
        recipientId
      ])
    ).rows[0]
    if (!r) throw realError('REAL_NOT_FOUND', 404)
    const value = openRealJson(key, campaignId, r.id, 'recipient', Number(r.revision), r.payload)
    const draft = await readRealDraftInTransaction(db, state, r, value)
    return {
      ...summary(r, value, campaignGroups(openCampaign(row, key))),
      contentStatus: !draft
        ? 'not_created'
        : draft.contentApproved
          ? 'approved'
          : draft.stale
            ? 'needs_review'
            : 'draft',
      rawSource: value.rawSource,
      provenance: { ...value.provenance, identities: value.identities, rawSources: value.rawSources },
      values: value.manualValues ?? {},
      sourceFacts: { negativeAssertions: value.negativeAssertions, needsReview: value.needsReview },
      draft
    }
  })
}
export async function listRealRecipients({
  pool,
  keys,
  campaignId,
  group = null,
  state = null,
  search = '',
  content = null,
  cursor = null,
  limit = 100
}) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw realError('REAL_INVALID_LIMIT')
  if (
    (group !== null && !REAL_GROUPS.some((g) => g.key === group)) ||
    (state !== null && !['suppressed', 'recheck'].includes(state)) ||
    (content !== null && !['not_created', 'draft', 'needs_review', 'approved'].includes(content)) ||
    typeof search !== 'string' ||
    Buffer.byteLength(search) > 1024
  )
    throw realError('REAL_INVALID_FILTER')
  const needle = search.trim().toLowerCase()
  return realTransaction({ pool, keys, campaignId }, async (db, { row, key, indexKey }) => {
    const groups = campaignGroups(openCampaign(row, key))
    const filter = mac(indexKey, [group, state, needle, content])
    let after = null
    if (cursor !== null) {
      try {
        if (typeof cursor !== 'string' || cursor.length > 1024) throw Error()
        const [bytes, signature] = cursor.split('.')
        if (!equal(mac(indexKey, bytes), signature)) throw Error()
        const decoded = JSON.parse(Buffer.from(bytes, 'base64url').toString())
        if (decoded.campaign !== campaignId || decoded.filter !== filter) throw Error()
        if (decoded.revision !== row.revision) throw realError('REAL_STALE_REVISION', 409)
        after = realId(decoded.after)
      } catch (error) {
        if (error.code === 'REAL_STALE_REVISION') throw error
        throw realError('REAL_INVALID_CURSOR', 409)
      }
    }
    const items = []
    let total = 0,
      scan = null,
      more = false
    while (true) {
      const batch = (
        await db.query(
          `select * from invitations_real_recipient where campaign_id=$1 and ($2::text is null or group_key=$2) and ($3::text is null or state=$3) and ($4::uuid is null or id>$4) order by id limit 100`,
          [campaignId, group, state, scan]
        )
      ).rows
      for (const r of batch) {
        const value = openRealJson(key, campaignId, r.id, 'recipient', Number(r.revision), r.payload)
        const found =
          !needle ||
          [
            value.normalizedEmail,
            value.personalization.first_name,
            value.personalization.company,
            ...value.identities.map((i) => i.memberId)
          ].some((v) => v?.toLowerCase().includes(needle))
        if (!found) continue
        const status = async () => {
          const draft = await readRealDraftInTransaction(db, { row, key, indexKey }, r, value)
          return !draft
            ? 'not_created'
            : draft.contentApproved
              ? 'approved'
              : draft.stale
                ? 'needs_review'
                : 'draft'
        }
        // The content filter needs each match's draft state; without it, only listed rows read drafts.
        const known = content === null ? null : await status()
        if (content !== null && known !== content) continue
        total++
        if (after && r.id <= after) continue
        if (items.length < limit)
          items.push({ ...summary(r, value, groups), contentStatus: known ?? (await status()) })
        else more = true
      }
      if (batch.length < 100) break
      scan = batch.at(-1).id
    }
    const bytes = Buffer.from(
      JSON.stringify({ campaign: campaignId, revision: row.revision, filter, after: items.at(-1)?.id })
    ).toString('base64url')
    return {
      items,
      total,
      revision: row.revision,
      nextCursor: more ? `${bytes}.${mac(indexKey, bytes)}` : null
    }
  })
}
