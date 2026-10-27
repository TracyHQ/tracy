import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { parseFragment, serialize } from 'parse5'
import {
  REAL_GROUPS,
  campaignAudience,
  campaignGroups,
  openCampaign,
  openRealJson,
  sealRealJson
} from './real-import.js'
import { defaultRegistry, resolveFields, validateRegistry } from './real-fields.js'
import { FOOTER_STYLE, inspectTokens, renderRealTemplate } from './real-render.js'
import { sanitizeEmailHtml } from './real-html.js'
import { readTemplateZip } from './real-zip.js'
import { realClock, realError, realId, realTransaction } from './real-store.js'
import { dependencyFingerprint } from './source-approval.js'

const TTL = 30 * 60000
const FOOTER = 'Unsubscribe will be available when sending is enabled.'
function groupId(group) {
  if (!REAL_GROUPS.some((g) => g.key === group)) throw realError('REAL_INVALID_GROUP')
  return group
}
function options(input, write = false) {
  if (write) realId(input.actorId)
  return {
    pool: input.pool,
    keys: input.keys,
    campaignId: input.campaignId,
    expectedRevision: input.revision,
    write
  }
}
function registryOf(state) {
  const campaign = openCampaign(state.row, state.key)
  return campaign.registry ?? defaultRegistry(campaign.headers)
}
function digest(key, value) {
  return createHmac('sha256', key).update(JSON.stringify(value)).digest('base64url')
}
async function audit(db, state, actorId, action, code = null) {
  await db.query(
    'insert into invitations_real_audit(id,campaign_id,actor_id,action,code) values($1,$2,$3,$4,$5)',
    [randomUUID(), state.row.id, actorId, action, code]
  )
}
async function recipient(db, state, id) {
  realId(id)
  const row = (
    await db.query('select * from invitations_real_recipient where campaign_id=$1 and id=$2', [
      state.row.id,
      id
    ])
  ).rows[0]
  if (!row) throw realError('REAL_NOT_FOUND', 404)
  return {
    row,
    value: openRealJson(state.key, state.row.id, row.id, 'recipient', Number(row.revision), row.payload),
    groupLabel: groupLabelOf(state, row.group_key)
  }
}
// The campaign's own name for a group (renamed in its settings), used by the {{group}} field.
function groupLabelOf(state, key) {
  return campaignGroups(openCampaign(state.row, state.key)).find((g) => g.key === key)?.label
}
async function template(db, state, group, version = null) {
  groupId(group)
  const row = (
    await db.query(
      'select * from invitations_real_template where campaign_id=$1 and group_key=$2 and ($3::integer is null or version=$3) order by version desc limit 1',
      [state.row.id, group, version]
    )
  ).rows[0]
  return row ? openRealJson(state.key, state.row.id, row.id, 'template', row.version, row.payload) : null
}
function render(t, r, reg) {
  if (!t) throw realError('REAL_TEMPLATE_MISSING', 409)
  return renderRealTemplate({
    template: t,
    registry: reg,
    rawSource: r.value.rawSource,
    group: r.row.group_key,
    groupLabel: r.groupLabel,
    recipientValues: r.value.manualValues ?? {},
    destination: r.value.normalizedEmail,
    identities: r.value.identities.map((i) => i.memberId)
  })
}
function dependency(reg, r, fields) {
  const resolved = resolveFields({
    registry: reg,
    rawSource: r.value.rawSource,
    group: r.row.group_key,
    groupLabel: r.groupLabel,
    recipientValues: r.value.manualValues ?? {},
    storedValues: true
  })
  return dependencyFingerprint({
    fields,
    personalization: resolved.values,
    destination: r.value.normalizedEmail,
    identities: r.value.identities.map((i) => i.memberId),
    policyVersion: JSON.stringify(fields.map((k) => reg.fields.find((f) => f.key === k) ?? { key: k }))
  })
}
function hashContent(value) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        subject: value.subject,
        html: value.html,
        bodyText: value.bodyText,
        assets: value.assets,
        templateVersion: value.templateVersion,
        dependencyFingerprint: value.dependencyFingerprint
      })
    )
    .digest('hex')
}
async function draftRow(db, state, rid) {
  return (
    (
      await db.query('select * from invitations_real_draft where campaign_id=$1 and recipient_id=$2', [
        state.row.id,
        rid
      ])
    ).rows[0] ?? null
  )
}
async function effective(db, state, r, drow) {
  if (!drow) return null
  const value = openRealJson(state.key, state.row.id, drow.id, 'draft', drow.revision, drow.payload),
    reg = registryOf(state)
  let fp = null
  try {
    fp = dependency(reg, r, value.dependencyFields)
  } catch (error) {
    if (!error.code?.startsWith('REAL_')) throw error
  }
  const latest = await template(db, state, r.row.group_key)
  const stale = value.dependencyFingerprint !== fp || latest?.version !== value.reviewedTemplateVersion
  const approved = Boolean(
    value.contentApproval &&
      !stale &&
      value.contentApproval.draftRevision === drow.revision &&
      value.contentApproval.contentHash === hashContent(value) &&
      value.contentApproval.dependencyFingerprint === fp
  )
  return {
    ...value,
    revision: drow.revision,
    stale,
    contentApproved: approved,
    sendingEnabled: false,
    invalidationReason: stale ? 'CONTENT_DEPENDENCY_CHANGED' : null
  }
}
/** The recipient's current draft with its image bytes, for a send inside the caller's campaign
 * transaction. Approval is reported, not assumed: the sender refuses anything not approved. */
export async function draftForSend(db, state, recipientId) {
  const r = await recipient(db, state, recipientId)
  const draft = await effective(db, state, r, await draftRow(db, state, r.row.id))
  if (!draft) throw realError('REAL_NOT_FOUND', 404)
  const images = []
  for (const ref of draft.assets) images.push({ ...(await asset(db, state, ref.id)), path: ref.path })
  return { recipient: r, draft, images }
}
export async function readRealDraftInTransaction(db, state, rrow, rvalue) {
  return effective(
    db,
    state,
    { row: rrow, value: rvalue, groupLabel: groupLabelOf(state, rrow.group_key) },
    await draftRow(db, state, rrow.id)
  )
}
async function storeDraft(db, state, r, row, value) {
  const id = row?.id ?? randomUUID(),
    revision = row ? row.revision + 1 : 1
  const payload = sealRealJson(state.key, state.row.id, id, 'draft', revision, value)
  await db.query(
    'insert into invitations_real_draft(id,campaign_id,recipient_id,revision,payload) values($1,$2,$3,$4,$5) on conflict(campaign_id,recipient_id) do update set revision=excluded.revision,payload=excluded.payload',
    [id, state.row.id, r.row.id, revision, payload]
  )
  return revision
}
export async function invalidateRealContent(db, state, actorId) {
  let after = null
  while (true) {
    const rows = (
      await db.query(
        'select * from invitations_real_draft where campaign_id=$1 and ($2::uuid is null or id>$2) order by id limit 100',
        [state.row.id, after]
      )
    ).rows
    for (const row of rows) {
      const r = await recipient(db, state, row.recipient_id),
        value = await effective(db, state, r, row)
      if (value.stale && value.contentApproval) {
        delete value.revision
        delete value.stale
        delete value.contentApproved
        delete value.sendingEnabled
        value.contentApproval = null
        value.invalidationReason = 'CONTENT_DEPENDENCY_CHANGED'
        await storeDraft(db, state, r, row, value)
      }
    }
    if (rows.length < 100) break
    after = rows.at(-1).id
  }
  await audit(db, state, actorId, 'content_dependencies_changed')
}
export async function readRealFields(input) {
  return realTransaction(options(input), (_db, state) => registryOf(state))
}
export async function updateRealFields(input) {
  return realTransaction(options(input, true), async (db, state) => {
    const payload = openCampaign(state.row, state.key),
      old = registryOf(state)
    if (input.registry?.revision !== old.revision) throw realError('REAL_STALE_REGISTRY', 409)
    const next = validateRegistry({ registry: input.registry, headers: payload.headers, storedValues: true })
    for (const [values, previous] of [
      [next.campaignValues, old.campaignValues],
      ...Object.entries(next.groupValues).map(([g, v]) => [v, old.groupValues[g] ?? {}])
    ])
      for (const [key, value] of Object.entries(values))
        if (next.fields.find((f) => f.key === key)?.source.kind !== 'manual' && previous[key] !== value)
          throw realError('REAL_INVALID_FIELD_VALUES')
    payload.registry = next
    payload.registry.revision = old.revision + 1
    const envelope = sealRealJson(state.key, state.row.id, state.row.id, 'campaign', 1, payload)
    await db.query('update invitations_real_campaign set payload=$2 where id=$1', [state.row.id, envelope])
    state.row.payload = envelope
    await invalidateRealContent(db, state, input.actorId)
    return { revision: state.row.revision + 1, registryRevision: payload.registry.revision }
  })
}
export async function updateRealRecipientValues(input) {
  return realTransaction(options(input, true), async (db, state) => {
    const r = await recipient(db, state, input.recipientId),
      reg = registryOf(state)
    resolveFields({
      registry: reg,
      rawSource: r.value.rawSource,
      group: r.row.group_key,
      recipientValues: input.values
    })
    r.value.manualValues = structuredClone(input.values)
    const revision = Number(r.row.revision) + 1
    await db.query(
      'update invitations_real_recipient set revision=$3,payload=$4 where campaign_id=$1 and id=$2',
      [
        state.row.id,
        r.row.id,
        revision,
        sealRealJson(state.key, state.row.id, r.row.id, 'recipient', revision, r.value)
      ]
    )
    await invalidateRealContent(db, state, input.actorId)
    return { revision: state.row.revision + 1 }
  })
}
export async function readRealTemplate(input) {
  return realTransaction(options(input), (db, state) => template(db, state, input.group))
}
// Counts only, per source group: how many recipients exist and how many already have a draft.
export async function readRealDraftProgress(input) {
  return realTransaction(options(input), async (db, state) => {
    const rows = (
      await db.query(
        'select r.group_key, count(*)::int as total, count(d.id)::int as drafted from invitations_real_recipient r left join invitations_real_draft d on d.campaign_id=r.campaign_id and d.recipient_id=r.id where r.campaign_id=$1 group by r.group_key',
        [state.row.id]
      )
    ).rows
    return {
      groups: REAL_GROUPS.map((g) => {
        const row = rows.find((r) => r.group_key === g.key)
        return { key: g.key, total: row?.total ?? 0, drafted: row?.drafted ?? 0 }
      })
    }
  })
}
function checkTemplate(t, reg, allowUnknown = false) {
  const inspection = inspectTokens({ ...t, registry: reg })
  if (!allowUnknown && inspection.unknown.length) throw realError('REAL_UNKNOWN_TOKEN', 409)
  if (/[\p{Cc}\u2028\u2029]/u.test(t.subject)) throw realError('REAL_SUBJECT_LIMIT')
  if (!t.subject.trim()) throw realError('REAL_SUBJECT_REQUIRED')
  return inspection
}
export async function previewRealTemplate(input) {
  realId(input.actorId)
  realId(input.requestKey)
  groupId(input.group)
  const reg = await readRealFields(input),
    archive = await readTemplateZip({ bytes: input.zipBytes, registry: reg })
  const inspected = checkTemplate({ ...archive, subject: input.subject }, reg, true)
  const uploadId = randomUUID()
  try {
    return await realTransaction(options(input), async (db, state) => {
      const now = await realClock(db),
        expiresAt = new Date(Math.min(Date.parse(now) + TTL, state.row.expires_at.getTime())).toISOString()
      await input.keys.create({ campaignId: uploadId, now, initialImportedAt: now, expiresAt })
      const material = await input.keys.read({ campaignId: uploadId, now })
      const images = archive.images.map((i) => ({
        ...i,
        id: randomUUID(),
        bytes: i.bytes.toString('base64')
      }))
      const staged = {
        subject: input.subject,
        html: archive.html,
        text: archive.text,
        images,
        warnings: archive.warnings,
        group: input.group
      }
      await db.query(
        "insert into invitations_real_import(id,campaign_id,actor_id,kind,status,digest,expected_revision,group_key,payload,expires_at,result) values($1,$2,$3,'template','preview',$4,$5,$6,$7,$8,$9)",
        [
          uploadId,
          state.row.id,
          input.actorId,
          digest(material.indexKey, staged),
          state.row.revision,
          input.group,
          sealRealJson(material.key, uploadId, uploadId, 'template_preview', 1, staged),
          expiresAt,
          { assetIds: images.map((i) => i.id) }
        ]
      )
      return {
        uploadId,
        warnings: archive.warnings,
        removed: archive.removed ?? [],
        unknownTokens: inspected.unknown,
        preview: {
          html: archive.html,
          text: archive.text,
          assets: images.map(({ bytes: _bytes, ...i }) => i)
        },
        expiresAt
      }
    })
  } catch (error) {
    await input.keys.revoke({ campaignId: uploadId, now: await realClock(input.pool) })
    throw error
  }
}
async function receipt(input, edit = false) {
  realId(input.requestKey)
  realId(input.actorId)
  const row = (
    await input.pool.query(
      "select * from invitations_real_import where actor_id=$1 and kind='template' and request_key=$2",
      [input.actorId, input.requestKey]
    )
  ).rows[0]
  if (!row) return null
  if (
    row.campaign_id !== input.campaignId ||
    (!edit && row.id !== input.uploadId) ||
    Number(row.expected_revision) !== input.revision ||
    row.status !== 'committed'
  )
    throw realError('REAL_IMPORT_MISMATCH', 409)
  return realTransaction({ ...options(input), expectedRevision: undefined }, (_db, state) => {
    if (
      edit &&
      row.digest !==
        digest(state.indexKey, [input.group, input.subject, input.html, input.text, input.assetIds])
    )
      throw realError('REAL_IMPORT_MISMATCH', 409)
    return row.result
  })
}
async function publish(db, state, t, images, actorId, reuse = false) {
  const previous = await template(db, state, t.group),
    version = (previous?.version ?? 0) + 1,
    id = randomUUID()
  const assets = []
  for (const image of images) {
    const { bytes, ...ref } = image
    assets.push(ref)
    if (!reuse)
      await db.query(
        'insert into invitations_real_asset(id,campaign_id,version,payload) values($1,$2,$3,$4)',
        [
          image.id,
          state.row.id,
          version,
          sealRealJson(state.key, state.row.id, image.id, 'asset', version, { ...ref, bytes })
        ]
      )
  }
  const value = { version, subject: t.subject, html: t.html, text: t.text, assets }
  await db.query(
    'insert into invitations_real_template(id,campaign_id,group_key,version,payload) values($1,$2,$3,$4,$5)',
    [
      id,
      state.row.id,
      t.group,
      version,
      sealRealJson(state.key, state.row.id, id, 'template', version, value)
    ]
  )
  await invalidateRealContent(db, state, actorId)
  await audit(db, state, actorId, 'template_saved')
  return { revision: state.row.revision + 1, templateVersion: version }
}
export async function saveRealTemplate(input) {
  realId(input.uploadId)
  const prior = await receipt(input)
  if (prior) return prior
  try {
    return await realTransaction(options(input, true), async (db, state) => {
      const row = (
        await db.query(
          "select * from invitations_real_import where id=$1 and campaign_id=$2 and kind='template' for update",
          [input.uploadId, state.row.id]
        )
      ).rows[0]
      if (!row) throw realError('REAL_NOT_FOUND', 404)
      if (
        row.actor_id !== input.actorId ||
        Number(row.expected_revision) !== input.revision ||
        row.status !== 'preview'
      )
        throw realError('REAL_IMPORT_MISMATCH', 409)
      const now = await realClock(db)
      if (Date.parse(now) >= row.expires_at.getTime()) throw realError('REAL_EXPIRED', 410)
      const material = await input.keys.read({ campaignId: row.id, now }),
        value = openRealJson(material.key, row.id, row.id, 'template_preview', 1, row.payload)
      checkTemplate(value, registryOf(state))
      const result = await publish(db, state, value, value.images, input.actorId)
      const finalNow = await realClock(db)
      if (Date.parse(finalNow) >= row.expires_at.getTime()) throw realError('REAL_EXPIRED', 410)
      await input.keys.read({ campaignId: row.id, now: finalNow })
      await db.query(
        "update invitations_real_import set status='committed',request_key=$2,payload=null,result=$3,expires_at=$4 where id=$1",
        [row.id, input.requestKey, result, state.row.expires_at]
      )
      return result
    })
  } catch (error) {
    const prior = await receipt(input)
    if (prior) return prior
    throw error
  }
}
async function asset(db, state, id) {
  realId(id)
  const row = (
    await db.query('select * from invitations_real_asset where campaign_id=$1 and id=$2', [state.row.id, id])
  ).rows[0]
  if (!row) throw realError('REAL_NOT_FOUND', 404)
  const value = openRealJson(state.key, state.row.id, row.id, 'asset', row.version, row.payload),
    bytes = Buffer.from(value.bytes, 'base64')
  if (createHash('sha256').update(bytes).digest('hex') !== value.sha256)
    throw realError('REAL_KEY_UNAVAILABLE', 503)
  return { ...value, bytes }
}
export async function readRealAsset(input) {
  realId(input.assetId)
  return realTransaction(options(input), async (db, state) => {
    try {
      return await asset(db, state, input.assetId)
    } catch (error) {
      if (error.code !== 'REAL_NOT_FOUND') throw error
    }
    const row = (
      await db.query(
        "select * from invitations_real_import where campaign_id=$1 and kind='template' and status='preview' and result @> $2::jsonb limit 1",
        [state.row.id, JSON.stringify({ assetIds: [input.assetId] })]
      )
    ).rows[0]
    if (!row) throw realError('REAL_NOT_FOUND', 404)
    let now = await realClock(db)
    if (Date.parse(now) >= row.expires_at.getTime()) throw realError('REAL_EXPIRED', 410)
    const material = await input.keys.read({ campaignId: row.id, now }),
      staged = openRealJson(material.key, row.id, row.id, 'template_preview', 1, row.payload)
    const image = staged.images.find((i) => i.id === input.assetId)
    if (!image) throw realError('REAL_NOT_FOUND', 404)
    const bytes = Buffer.from(image.bytes, 'base64')
    if (createHash('sha256').update(bytes).digest('hex') !== image.sha256)
      throw realError('REAL_KEY_UNAVAILABLE', 503)
    now = await realClock(db)
    if (Date.parse(now) >= row.expires_at.getTime()) throw realError('REAL_EXPIRED', 410)
    await input.keys.read({ campaignId: row.id, now })
    return { ...image, bytes }
  })
}
export async function editRealTemplate(input) {
  groupId(input.group)
  if (
    !Array.isArray(input.assetIds) ||
    input.assetIds.length > 50 ||
    new Set(input.assetIds).size !== input.assetIds.length
  )
    throw realError('REAL_IMAGE_REFERENCE')
  const prior = await receipt(input, true)
  if (prior) return prior
  return realTransaction(options(input, true), async (db, state) => {
    const current = await template(db, state, input.group)
    if (input.assetIds.some((id) => !current?.assets.some((a) => a.id === id)))
      throw realError('REAL_IMAGE_REFERENCE', 409)
    const images = []
    for (const id of input.assetIds) {
      const a = await asset(db, state, id)
      images.push({ ...a, bytes: a.bytes.toString('base64') })
    }
    if (new Set(images.map((i) => i.path)).size !== images.length) throw realError('REAL_IMAGE_REFERENCE')
    const clean = sanitizeEmailHtml({
      html: input.html,
      imagePaths: images.map((a) => a.path),
      registry: registryOf(state)
    })
    const value = { group: input.group, subject: input.subject, html: clean.html, text: input.text ?? null }
    checkTemplate(value, registryOf(state))
    const result = {
      ...(await publish(db, state, value, images, input.actorId, true)),
      warnings: clean.warnings,
      removed: clean.removed
    }
    await db.query(
      "insert into invitations_real_import(id,campaign_id,actor_id,kind,status,digest,request_key,expected_revision,result,expires_at) values($1,$2,$3,'template','committed',$4,$5,$6,$7,$8)",
      [
        randomUUID(),
        state.row.id,
        input.actorId,
        digest(state.indexKey, [input.group, input.subject, input.html, input.text, input.assetIds]),
        input.requestKey,
        input.revision,
        result,
        state.row.expires_at
      ]
    )
    return result
  })
}
export async function previewRealContent(input) {
  return realTransaction(options(input), async (db, state) => {
    const r = await recipient(db, state, input.recipientId)
    if (r.row.group_key !== groupId(input.group)) throw realError('REAL_INVALID_GROUP')
    return render(await template(db, state, input.group), r, registryOf(state))
  })
}
function cursorFor(state, group, after) {
  const data = Buffer.from(
    JSON.stringify({ campaignId: state.row.id, revision: state.row.revision + 1, group, after })
  ).toString('base64url')
  return `${data}.${digest(state.indexKey, data)}`
}
function cursorAfter(state, group, cursor) {
  if (cursor === null || cursor === undefined) return null
  try {
    if (typeof cursor !== 'string' || cursor.length > 1024) throw Error()
    const [data, signature, ...rest] = cursor.split('.'),
      expected = digest(state.indexKey, data)
    if (
      rest.length ||
      signature?.length !== expected.length ||
      !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    )
      throw Error()
    const c = JSON.parse(Buffer.from(data, 'base64url').toString())
    if (c.campaignId !== state.row.id || c.group !== group || c.revision !== state.row.revision) throw Error()
    return realId(c.after)
  } catch {
    throw realError('REAL_INVALID_CURSOR', 409)
  }
}
export async function generateRealDrafts(input) {
  groupId(input.group)
  if (
    !Number.isSafeInteger(input.limit) ||
    input.limit < 1 ||
    input.limit > 100 ||
    typeof input.replaceExisting !== 'boolean'
  )
    throw realError('REAL_INVALID_LIMIT')
  return realTransaction(options(input, true), async (db, state) => {
    const after = cursorAfter(state, input.group, input.cursor),
      // Without replaceExisting only recipients that still lack a draft are read, so every press
      // makes progress instead of walking batches that are already complete.
      rows = (
        await db.query(
          `select r.* from invitations_real_recipient r where r.campaign_id=$1 and r.group_key=$2 and ($3::uuid is null or r.id>$3)${
            input.replaceExisting
              ? ''
              : ' and not exists (select 1 from invitations_real_draft d where d.campaign_id=r.campaign_id and d.recipient_id=r.id)'
          } order by r.id limit $4`,
          [state.row.id, input.group, after, input.limit + 1]
        )
      ).rows
    let created = 0,
      kept = 0
    const reg = registryOf(state),
      t = await template(db, state, input.group)
    for (const row of rows.slice(0, input.limit)) {
      const previous = await draftRow(db, state, row.id)
      if (previous && !input.replaceExisting) {
        kept++
        continue
      }
      const r = {
          row,
          value: openRealJson(state.key, state.row.id, row.id, 'recipient', Number(row.revision), row.payload)
        },
        rendered = render(t, r, reg)
      rendered.dependencyFingerprint = dependency(reg, r, rendered.dependencyFields)
      const value = {
        ...rendered,
        templateVersion: t.version,
        reviewedTemplateVersion: t.version,
        registryRevision: reg.revision,
        customized: false,
        contentApproval: null,
        invalidationReason: null
      }
      value.contentHash = hashContent(value)
      await storeDraft(db, state, r, previous, value)
      created++
    }
    await audit(db, state, input.actorId, 'drafts_generated')
    const last = rows.slice(0, input.limit).at(-1)
    const progress = (
      await db.query(
        'select count(*)::int as total, count(d.id)::int as drafted from invitations_real_recipient r left join invitations_real_draft d on d.campaign_id=r.campaign_id and d.recipient_id=r.id where r.campaign_id=$1 and r.group_key=$2',
        [state.row.id, input.group]
      )
    ).rows[0]
    return {
      revision: state.row.revision + 1,
      created,
      kept,
      groupTotal: progress.total,
      groupDrafted: progress.drafted,
      nextCursor: rows.length > input.limit ? cursorFor(state, input.group, last.id) : null
    }
  })
}
export async function saveRealDraft(input) {
  return realTransaction(options(input, true), async (db, state) => {
    const r = await recipient(db, state, input.recipientId),
      row = await draftRow(db, state, r.row.id)
    if (!row) throw realError('REAL_NOT_FOUND', 404)
    if (row.revision !== input.draftRevision) throw realError('REAL_STALE_DRAFT', 409)
    const old = openRealJson(state.key, state.row.id, row.id, 'draft', row.revision, row.payload),
      reg = registryOf(state)
    const clean = sanitizeEmailHtml({
      html: input.html,
      imagePaths: old.assets.map((a) => a.path),
      registry: reg
    })
    const custom = {
      version: old.templateVersion,
      subject: input.subject,
      html: withoutGeneratedFooter(clean.html),
      text:
        typeof input.text === 'string' && input.text.endsWith(`\n\n${FOOTER}`)
          ? input.text.slice(0, -FOOTER.length - 2)
          : (input.text ?? null),
      assets: old.assets
    }
    const rendered = render(custom, r, reg),
      latest = await template(db, state, r.row.group_key)
    const value = {
      ...old,
      ...rendered,
      customized: true,
      contentApproval: null,
      reviewedTemplateVersion: latest.version,
      registryRevision: reg.revision
    }
    value.dependencyFields = [...new Set([...old.dependencyFields, ...rendered.dependencyFields])].sort()
    value.dependencyFingerprint = dependency(reg, r, value.dependencyFields)
    value.contentHash = hashContent(value)
    const draftRevision = await storeDraft(db, state, r, row, value)
    await audit(db, state, input.actorId, 'draft_saved')
    return {
      revision: state.row.revision + 1,
      draftRevision,
      warnings: clean.warnings,
      removed: clean.removed
    }
  })
}
function withoutGeneratedFooter(html) {
  const tree = parseFragment(html)
  const last = tree.childNodes.at(-1)
  // Drafts made before the footer was styled carry a bare <p>; both are the generated footer.
  if (
    last?.tagName === 'p' &&
    (last.attrs.length === 0 ||
      (last.attrs.length === 1 && last.attrs[0].name === 'style' && last.attrs[0].value === FOOTER_STYLE)) &&
    last.childNodes.length === 1 &&
    last.childNodes[0].nodeName === '#text' &&
    last.childNodes[0].value === FOOTER
  )
    tree.childNodes.pop()
  return serialize(tree)
}
export async function approveRealDraft(input) {
  return realTransaction(options(input, true), async (db, state) => {
    const r = await recipient(db, state, input.recipientId),
      row = await draftRow(db, state, r.row.id)
    if (!row) throw realError('REAL_NOT_FOUND', 404)
    if (row.revision !== input.draftRevision) throw realError('REAL_STALE_DRAFT', 409)
    await approveInTransaction(db, state, r, row, input.actorId)
    return { revision: state.row.revision + 1, contentApproved: true, sendingEnabled: false }
  })
}
/** Record the approval of one draft exactly as reviewed, inside the caller's campaign transaction. */
async function approveInTransaction(db, state, r, row, actorId) {
  {
    const value = openRealJson(state.key, state.row.id, row.id, 'draft', row.revision, row.payload),
      reg = registryOf(state),
      latest = await template(db, state, r.row.group_key)
    // Approval records reviewed content, never recomputes or replaces customized text.
    const original = await template(db, state, r.row.group_key, value.templateVersion)
    render(original, r, reg)
    const resolved = resolveFields({
      registry: reg,
      rawSource: r.value.rawSource,
      group: r.row.group_key,
      groupLabel: r.groupLabel,
      recipientValues: r.value.manualValues ?? {},
      storedValues: true
    })
    for (const key of value.dependencyFields) {
      if (key === 'invitation_url') continue
      const field = reg.fields.find((f) => f.key === key)
      if (!field) throw realError('REAL_UNKNOWN_TOKEN')
      if (field.missing === 'required' && !resolved.presence[key]) throw realError('REAL_MISSING_FIELD')
    }
    for (const ref of value.assets) {
      const stored = await asset(db, state, ref.id)
      if (stored.sha256 !== ref.sha256) throw realError('REAL_IMAGE_REFERENCE')
    }
    if (!value.bodyText.endsWith(FOOTER) || !value.html.includes(FOOTER))
      throw realError('REAL_SYSTEM_FOOTER')
    value.dependencyFingerprint = dependency(reg, r, value.dependencyFields)
    value.reviewedTemplateVersion = latest.version
    value.contentHash = hashContent(value)
    value.invalidationReason = null
    value.contentApproval = {
      draftRevision: row.revision + 1,
      contentHash: value.contentHash,
      dependencyFingerprint: value.dependencyFingerprint,
      registryRevision: reg.revision,
      templateVersion: value.templateVersion,
      assetHashes: value.assets.map((a) => a.sha256),
      actorId,
      at: await realClock(db)
    }
    await storeDraft(db, state, r, row, value)
    await audit(db, state, actorId, 'content_approved')
  }
}

const APPROVE_PAGE = 50
/** Approve all, one group at a time and one page per call: every current draft of the group that a
 * press could approve. Skipped, with a code: suppressed recipients, no draft, a draft waiting for
 * review again, a draft edited by hand (CUSTOMIZED, left for a person), and customers aMember said
 * have no active plan at the last eligibility check. Already approved drafts are counted, not
 * touched. Refusals of the press itself (a missing required field…) skip with their code. */
export async function approveRealGroup(input) {
  groupId(input.group)
  if (input.cursor !== null && (typeof input.cursor !== 'string' || !/^[0-9a-f-]{36}$/.test(input.cursor)))
    throw realError('REAL_INVALID_CURSOR')
  return realTransaction(options(input, true), async (db, state) => {
    const ids = (
      await db.query(
        'select id from invitations_real_recipient where campaign_id=$1 and group_key=$2 and ($3::uuid is null or id>$3) order by id limit $4',
        [state.row.id, input.group, input.cursor, APPROVE_PAGE + 1]
      )
    ).rows.map((r) => r.id)
    // A campaign for past customers sends to them whatever their plan, so no plan is no reason to skip.
    const pastCustomers = campaignAudience(openCampaign(state.row, state.key)) === 'past_customers'
    const noPlan = new Set(
      (
        await db.query(
          "select recipient_id from invitations_real_member_check where campaign_id=$1 and status='none' and recipient_id=any($2::uuid[])",
          [state.row.id, ids]
        )
      ).rows.map((r) => r.recipient_id)
    )
    const result = { approved: 0, already: 0, skipped: {} }
    const skip = (code) => {
      result.skipped[code] = (result.skipped[code] ?? 0) + 1
    }
    for (const id of ids.slice(0, APPROVE_PAGE)) {
      const r = await recipient(db, state, id)
      if (r.row.state === 'suppressed') {
        skip('SUPPRESSED')
        continue
      }
      const row = await draftRow(db, state, id)
      const draft = await effective(db, state, r, row)
      if (!draft) skip('NO_DRAFT')
      else if (draft.contentApproved) result.already++
      else if (draft.stale) skip('NEEDS_REVIEW')
      else if (draft.customized) skip('CUSTOMIZED')
      else if (noPlan.has(id) && !pastCustomers) skip('NO_ACTIVE_PLAN')
      else
        try {
          await approveInTransaction(db, state, r, row, input.actorId)
          result.approved++
        } catch (error) {
          if (!error.code?.startsWith('REAL_')) throw error
          skip(error.code.slice(5))
        }
    }
    return {
      ...result,
      revision: state.row.revision + 1,
      nextCursor: ids.length > APPROVE_PAGE ? ids[APPROVE_PAGE - 1] : null
    }
  })
}
