import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { snapshotCsv, syntheticSnapshot, withRealDb } from './_invitations-real.mjs'
import {
  commitRealImport,
  listRealRecipients,
  previewRealImport,
  updateRealCampaignSettings
} from '../src/invitations/real-import.js'
const opts = { skip: !process.env.TEST_DATABASE_URL }

/** A snapshot whose group column holds the operator's own values instead of the baseline five. */
function ownGroups(values) {
  const f = syntheticSnapshot({ total: values.length })
  f.rows.forEach((row, i) => {
    row[2] = values[i]
  })
  return snapshotCsv(f.headers, f.rows)
}
async function importCsv({ pool, keys, csvBytes, campaignId = null, revision }) {
  const actorId = randomUUID()
  const p = await previewRealImport({
    pool,
    keys,
    campaignId,
    csvBytes,
    name: 'Synthetic win-back',
    sourceDate: '2026-10-20',
    actorId
  })
  if (p.issues.some((i) => i.blocking)) return { preview: p }
  const c = await commitRealImport({
    pool,
    keys,
    previewId: p.previewId,
    digest: p.digest,
    revision: revision ?? p.revision,
    requestKey: randomUUID(),
    actorId
  })
  return { preview: p, campaign: c, actorId }
}

test('a CSV with its own group values makes the campaign groups, in natural order', opts, async () =>
  withRealDb(async ({ pool, keys }) => {
    const { campaign } = await importCsv({
      pool,
      keys,
      csvBytes: ownGroups(['Group C', 'Group A', 'Group B', 'Group A', 'Group C', 'Group C'])
    })
    assert.deepEqual(campaign.groups, [
      { key: 'group_1', label: 'Group A' },
      { key: 'group_2', label: 'Group B' },
      { key: 'group_3', label: 'Group C' }
    ])
    assert.deepEqual(campaign.counts.groups, [2, 1, 3, 0, 0])
    assert.equal(campaign.audience, 'active_plan')
    const page = await listRealRecipients({ pool, keys, campaignId: campaign.id, group: 'group_3' })
    assert.equal(page.total, 3)
    assert.ok(page.items.every((r) => r.groupLabel === 'Group C'))
    // A later import into the campaign maps by the campaign's groups; an unknown value blocks it.
    const more = await importCsv({
      pool,
      keys,
      campaignId: campaign.id,
      revision: campaign.revision,
      csvBytes: ownGroups(['Group B', 'Group D'])
    })
    assert.ok(more.preview.issues.some((i) => i.code === 'unknown_group' && i.blocking))
  })
)

test('a baseline CSV keeps the five baseline groups, and a mistyped value still blocks', opts, async () =>
  withRealDb(async ({ pool, keys }) => {
    const { campaign } = await importCsv({ pool, keys, csvBytes: syntheticSnapshot({ total: 3 }).csvBytes })
    assert.equal(campaign.groups.length, 5)
    assert.equal(campaign.groups[0].label, 'Active agencies')
    const typo = await importCsv({
      pool,
      keys,
      csvBytes: ownGroups(['1 agency dang hoat dong', '1 agency dang hoat dongg'])
    })
    assert.ok(typo.preview.issues.some((i) => i.code === 'unknown_group' && i.blocking))
  })
)

test('settings set the audience and rename groups, and refuse anything else', opts, async () =>
  withRealDb(async ({ pool, keys }) => {
    const { campaign, actorId } = await importCsv({
      pool,
      keys,
      csvBytes: ownGroups(['A', 'B', 'C'])
    })
    const base = { pool, keys, campaignId: campaign.id, actorId }
    const next = await updateRealCampaignSettings({
      ...base,
      revision: campaign.revision,
      audience: 'past_customers',
      groupLabels: { group_1: '  Expired since 2025 ' }
    })
    assert.equal(next.revision, campaign.revision + 1)
    assert.equal(next.audience, 'past_customers')
    assert.deepEqual(
      next.groups.map((g) => g.label),
      ['Expired since 2025', 'B', 'C']
    )
    const page = await listRealRecipients({ pool, keys, campaignId: campaign.id, group: 'group_1' })
    assert.equal(page.items[0].groupLabel, 'Expired since 2025')
    const audit = await pool.query(
      "select count(*)::int n from invitations_real_audit where campaign_id=$1 and action='campaign_settings_changed'",
      [campaign.id]
    )
    assert.equal(audit.rows[0].n, 1)
    for (const [over, code] of [
      [{ audience: 'everyone' }, 'REAL_INVALID_AUDIENCE'],
      [{ groupLabels: { group_4: 'Not a group of this campaign' } }, 'REAL_INVALID_GROUP_LABELS'],
      [{ groupLabels: { group_1: '   ' } }, 'REAL_INVALID_GROUP_LABELS'],
      [{ groupLabels: { group_1: 'x'.repeat(121) } }, 'REAL_INVALID_GROUP_LABELS'],
      [{ groupLabels: { group_1: 'Line\nbreak' } }, 'REAL_INVALID_GROUP_LABELS'],
      [{ groupLabels: [] }, 'REAL_INVALID_GROUP_LABELS'],
      [{ revision: campaign.revision }, 'REAL_STALE_REVISION']
    ])
      await assert.rejects(
        updateRealCampaignSettings({
          ...base,
          revision: next.revision,
          audience: 'active_plan',
          groupLabels: {},
          ...over
        }),
        { code }
      )
  })
)
