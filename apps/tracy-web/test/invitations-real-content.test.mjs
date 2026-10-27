import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { withRealDb, dbClock } from './_invitations-real.mjs'
import { contentCampaign, contentZip } from './_invitations-real-content.mjs'
import { readRealRecipient } from '../src/invitations/real-import.js'
import { extendCampaign, sweepRealCampaigns } from '../src/invitations/real-retention.js'
import {
  previewRealTemplate,
  saveRealTemplate,
  readRealTemplate,
  readRealFields,
  updateRealFields,
  previewRealContent,
  generateRealDrafts,
  saveRealDraft,
  readRealAsset,
  editRealTemplate
} from '../src/invitations/real-content.js'
const opts = { skip: !process.env.TEST_DATABASE_URL }
test(
  'replacement cursor reaches all 230 recipients and only replaces customized text in the confirmed batch',
  opts,
  async () =>
    withRealDb(async ({ pool, keys }) => {
      const c = await contentCampaign({ pool, keys, total: 230, offset: 50 })
      async function publishVersion(subject) {
        const p = await previewRealTemplate({
          ...c,
          group: 'group_1',
          subject,
          zipBytes: await contentZip(),
          requestKey: randomUUID()
        })
        c.revision = (
          await saveRealTemplate({ ...c, uploadId: p.uploadId, requestKey: randomUUID() })
        ).revision
      }
      await publishVersion('Version one')
      let cursor = null,
        created = 0
      do {
        const result = await generateRealDrafts({
          ...c,
          group: 'group_1',
          limit: 100,
          cursor,
          replaceExisting: false
        })
        c.revision = result.revision
        cursor = result.nextCursor
        created += result.created
      } while (cursor)
      assert.equal(created, 230)
      const rid = (
        await pool.query(
          'select id from invitations_real_recipient where campaign_id=$1 order by id desc limit 1',
          [c.campaignId]
        )
      ).rows[0].id
      let d = await readRealRecipient({ ...c, recipientId: rid })
      c.revision = (
        await saveRealDraft({
          ...c,
          recipientId: rid,
          draftRevision: d.draft.revision,
          subject: 'Private custom',
          html: '<p>Keep until confirmed</p>',
          text: 'Keep'
        })
      ).revision
      await publishVersion('Version two')
      for (let batch = 0; batch < 3; batch++) {
        const result = await generateRealDrafts({
          ...c,
          group: 'group_1',
          limit: 100,
          cursor,
          replaceExisting: true
        })
        c.revision = result.revision
        cursor = result.nextCursor
        assert.equal(result.created, batch < 2 ? 100 : 30)
        d = await readRealRecipient({ ...c, recipientId: rid })
        assert.equal(d.draft.subject, batch < 2 ? 'Private custom' : 'Version two')
        assert.equal(d.draft.customized, batch < 2)
      }
      assert.equal(cursor, null)
      assert.deepEqual(
        (
          await pool.query('select name from schema_migration where name like $1 order by name', ['090-%'])
        ).rows.map((r) => r.name),
        [
          '090-auth-link-email-hint.sql',
          '090-invitations-real-campaign.sql',
          '090-quickstart-download-referrer.sql'
        ]
      )
      assert.deepEqual(
        (
          await pool.query('select name from schema_migration where name like $1 order by name', ['091-%'])
        ).rows.map((r) => r.name),
        ['091-auth-challenge.sql', '091-desktop-intent-platform.sql']
      )
    })
)
test(
  'five encrypted template versions are independent, confirmation retry is idempotent and assets are immutable',
  opts,
  async () =>
    withRealDb(async ({ pool, keys }) => {
      const c = await contentCampaign({ pool, keys })
      const zipBytes = await contentZip()
      const assets = []
      for (let i = 1; i <= 5; i++) {
        const group = `group_${i}`,
          requestKey = randomUUID()
        const p = await previewRealTemplate({ ...c, group, subject: `Synthetic ${i}`, zipBytes, requestKey })
        assert.equal(await readRealTemplate({ ...c, group }), null)
        assert.equal(
          (await readRealAsset({ ...c, assetId: p.preview.assets[0].id })).sha256,
          p.preview.assets[0].sha256
        )
        const input = { ...c, uploadId: p.uploadId, requestKey },
          saved = await saveRealTemplate(input)
        assert.deepEqual(await saveRealTemplate(input), saved)
        c.revision = saved.revision
        const t = await readRealTemplate({ ...c, group })
        assert.equal(t.version, 1)
        assert.equal(t.subject, `Synthetic ${i}`)
        assets.push(t.assets[0])
      }
      assert.equal(new Set(assets.map((a) => a.id)).size, 5)
      const old = await readRealAsset({ ...c, assetId: assets[0].id })
      const p = await previewRealTemplate({
        ...c,
        group: 'group_1',
        subject: 'New',
        zipBytes: await contentZip({ color: '#ff0000' }),
        requestKey: randomUUID()
      })
      const saved = await saveRealTemplate({ ...c, uploadId: p.uploadId, requestKey: randomUUID() })
      c.revision = saved.revision
      assert.equal(saved.templateVersion, 2)
      assert.deepEqual((await readRealAsset({ ...c, assetId: assets[0].id })).bytes, old.bytes)
      assert.notEqual((await readRealTemplate({ ...c, group: 'group_1' })).assets[0].sha256, assets[0].sha256)
      const dump = (
        await pool.query(
          'select row_to_json(t)::text as x from invitations_real_template t union all select row_to_json(a)::text from invitations_real_asset a union all select row_to_json(i)::text from invitations_real_import i'
        )
      ).rows
        .map((r) => r.x)
        .join('')
      assert.ok(!dump.includes('Synthetic'))
      assert.ok(!dump.includes('images/logo.png'))
      assert.ok(!dump.includes(old.bytes.toString('base64')))
      assert.equal(
        (
          await pool.query('select expires_at from invitations_real_campaign where id=$1', [c.campaignId])
        ).rows[0].expires_at.toISOString(),
        c.expiresAt
      )
    })
)
test(
  'unknown template tokens require registry configuration; preview does not publish drafts; save failure is atomic',
  opts,
  async () =>
    withRealDb(async ({ pool, keys }) => {
      const c = await contentCampaign({ pool, keys })
      const zipBytes = await contentZip({ html: '<p>{{custom.opening_line}}</p>' })
      const p = await previewRealTemplate({
        ...c,
        group: 'group_1',
        subject: 'Hi',
        zipBytes,
        requestKey: randomUUID()
      })
      assert.deepEqual(p.unknownTokens, ['custom.opening_line'])
      await assert.rejects(() => saveRealTemplate({ ...c, uploadId: p.uploadId, requestKey: randomUUID() }), {
        code: 'REAL_UNKNOWN_TOKEN'
      })
      const registry = await readRealFields(c)
      registry.fields.push({
        key: 'custom.opening_line',
        label: 'Opening',
        source: { kind: 'manual' },
        missing: 'default',
        defaultValue: 'Synthetic opening'
      })
      c.revision = (await updateRealFields({ ...c, registry })).revision
      // A registry change requires a new preview bound to that revision.
      await assert.rejects(() => saveRealTemplate({ ...c, uploadId: p.uploadId, requestKey: randomUUID() }), {
        status: 409
      })
      const fresh = await previewRealTemplate({
        ...c,
        group: 'group_1',
        subject: 'Hi',
        zipBytes,
        requestKey: randomUUID()
      })
      const saved = await saveRealTemplate({ ...c, uploadId: fresh.uploadId, requestKey: randomUUID() })
      c.revision = saved.revision
      const rendered = await previewRealContent({ ...c, group: 'group_1', recipientId: c.recipients[0].id })
      assert.ok(rendered.html.includes('Synthetic opening'))
      assert.equal((await pool.query('select count(*)::int as n from invitations_real_draft')).rows[0].n, 0)
      const bad = await previewRealTemplate({
        ...c,
        group: 'group_2',
        subject: 'Hi',
        zipBytes: await contentZip(),
        requestKey: randomUUID()
      })
      await pool.query(
        "create function fail_asset_insert() returns trigger language plpgsql as $$ begin raise exception 'Synthetic failure'; end $$; create trigger fail_asset before insert on invitations_real_asset for each row execute function fail_asset_insert()"
      )
      await assert.rejects(() => saveRealTemplate({ ...c, uploadId: bad.uploadId, requestKey: randomUUID() }))
      assert.equal(await readRealTemplate({ ...c, group: 'group_2' }), null)
    })
)
test(
  'template confirmation expires, cross-campaign assets refuse and malformed edits cannot bypass sanitizer',
  opts,
  async () =>
    withRealDb(async ({ pool, keys }) => {
      const c = await contentCampaign({ pool, keys }),
        other = await contentCampaign({ pool, keys })
      const p = await previewRealTemplate({
        ...c,
        group: 'group_1',
        subject: 'Hi',
        zipBytes: await contentZip(),
        requestKey: randomUUID()
      })
      await pool.query(
        "update invitations_real_import set expires_at=clock_timestamp()-interval '1 second' where id=$1",
        [p.uploadId]
      )
      await assert.rejects(() => saveRealTemplate({ ...c, uploadId: p.uploadId, requestKey: randomUUID() }), {
        status: 410
      })
      const q = await previewRealTemplate({
        ...c,
        group: 'group_1',
        subject: 'Hi',
        zipBytes: await contentZip(),
        requestKey: randomUUID()
      })
      c.revision = (await saveRealTemplate({ ...c, uploadId: q.uploadId, requestKey: randomUUID() })).revision
      const t = await readRealTemplate({ ...c, group: 'group_1' })
      await assert.rejects(() => readRealAsset({ ...other, assetId: t.assets[0].id }), { status: 404 })
      await assert.rejects(() =>
        editRealTemplate({
          ...other,
          group: 'group_1',
          subject: 'Hi',
          html: '<p>Hi</p>',
          text: null,
          assetIds: [t.assets[0].id],
          requestKey: randomUUID()
        })
      )
      await assert.rejects(() =>
        editRealTemplate({
          ...c,
          group: 'group_1',
          subject: 'Hi',
          html: '<img src="https://example.test/pixel">',
          text: null,
          assetIds: [],
          requestKey: randomUUID()
        })
      )
      await keys.revoke({ campaignId: c.campaignId, now: await dbClock(pool) })
      await assert.rejects(() => readRealAsset({ ...c, assetId: t.assets[0].id }))
    })
)
test(
  'generation is bounded and default regeneration never overwrites customized HTML or old image version',
  opts,
  async () =>
    withRealDb(async ({ pool, keys }) => {
      const c = await contentCampaign({ pool, keys, total: 3 })
      const p = await previewRealTemplate({
        ...c,
        group: 'group_1',
        subject: 'Hi',
        zipBytes: await contentZip(),
        requestKey: randomUUID()
      })
      c.revision = (await saveRealTemplate({ ...c, uploadId: p.uploadId, requestKey: randomUUID() })).revision
      let generated = await generateRealDrafts({ ...c, group: 'group_1', limit: 1, replaceExisting: false })
      c.revision = generated.revision
      assert.equal(generated.created, 1)
      assert.ok(generated.nextCursor)
      const oldCursor = generated.nextCursor
      await assert.rejects(() =>
        generateRealDrafts({ ...c, group: 'group_1', limit: 101, replaceExisting: false })
      )
      const rid = (await pool.query('select recipient_id from invitations_real_draft')).rows[0].recipient_id
      let detail = await readRealRecipient({ ...c, recipientId: rid })
      const oldAssets = detail.draft.assets
      const html = '<p>Customized synthetic</p>'
      c.revision = (
        await saveRealDraft({
          ...c,
          recipientId: rid,
          subject: 'Custom',
          html,
          text: 'Custom fallback',
          draftRevision: detail.draft.revision
        })
      ).revision
      await assert.rejects(
        () =>
          generateRealDrafts({ ...c, group: 'group_1', cursor: oldCursor, limit: 1, replaceExisting: false }),
        { status: 409 }
      )
      detail = await readRealRecipient({ ...c, recipientId: rid })
      c.revision = (
        await saveRealDraft({
          ...c,
          recipientId: rid,
          draftRevision: detail.draft.revision,
          subject: detail.draft.subject,
          html: detail.draft.html,
          text: detail.draft.bodyText
        })
      ).revision
      const resaved = await readRealRecipient({ ...c, recipientId: rid })
      assert.equal(
        resaved.draft.html.split('Unsubscribe will be available when sending is enabled.').length - 1,
        1
      )
      assert.equal(
        resaved.draft.bodyText,
        'Custom fallback\n\nUnsubscribe will be available when sending is enabled.'
      )
      const newer = await previewRealTemplate({
        ...c,
        group: 'group_1',
        subject: 'New',
        zipBytes: await contentZip({ color: '#ff0000' }),
        requestKey: randomUUID()
      })
      c.revision = (
        await saveRealTemplate({ ...c, uploadId: newer.uploadId, requestKey: randomUUID() })
      ).revision
      generated = await generateRealDrafts({ ...c, group: 'group_1', limit: 100, replaceExisting: false })
      c.revision = generated.revision
      detail = await readRealRecipient({ ...c, recipientId: rid })
      assert.equal(detail.draft.html.includes('Customized synthetic'), true)
      assert.equal(
        detail.draft.bodyText,
        'Custom fallback\n\nUnsubscribe will be available when sending is enabled.'
      )
      assert.deepEqual(detail.draft.assets, oldAssets)
      assert.equal(detail.draft.stale, true)
      c.revision = (
        await generateRealDrafts({ ...c, group: 'group_1', limit: 100, replaceExisting: true })
      ).revision
      detail = await readRealRecipient({ ...c, recipientId: rid })
      assert.ok(!detail.draft.html.includes('Customized synthetic'))
      assert.notDeepEqual(detail.draft.assets, oldAssets)
      assert.equal(detail.draft.contentApproved, false)
    })
)
test(
  'editing preserves immutable assets and idempotent result, and cannot take another group version assets',
  opts,
  async () =>
    withRealDb(async ({ pool, keys }) => {
      const c = await contentCampaign({ pool, keys })
      const p = await previewRealTemplate({
        ...c,
        group: 'group_1',
        subject: 'Hi',
        zipBytes: await contentZip(),
        requestKey: randomUUID()
      })
      c.revision = (await saveRealTemplate({ ...c, uploadId: p.uploadId, requestKey: randomUUID() })).revision
      const t = await readRealTemplate({ ...c, group: 'group_1' })
      await assert.rejects(
        () =>
          editRealTemplate({
            ...c,
            group: 'group_2',
            subject: 'Hi',
            html: '<img src="images/logo.png">',
            text: null,
            assetIds: [t.assets[0].id],
            requestKey: randomUUID()
          }),
        { status: 409 }
      )
      const input = {
        ...c,
        group: 'group_1',
        subject: 'Edited',
        html: '<p>Edited synthetic</p><img src="images/logo.png">',
        text: null,
        assetIds: [t.assets[0].id],
        requestKey: randomUUID()
      }
      const result = await editRealTemplate(input)
      assert.deepEqual(await editRealTemplate(input), result)
      c.revision = result.revision
      const next = await readRealTemplate({ ...c, group: 'group_1' })
      assert.equal(next.assets[0].id, t.assets[0].id)
      assert.equal(next.assets[0].sha256, t.assets[0].sha256)
    })
)

test(
  'explicit extension keeps committed confirmation receipts but does not extend staged uploads',
  opts,
  async () =>
    withRealDb(async ({ pool, keys }) => {
      const c = await contentCampaign({ pool, keys })
      const p = await previewRealTemplate({
        ...c,
        group: 'group_1',
        subject: 'Hi',
        zipBytes: await contentZip(),
        requestKey: randomUUID()
      })
      const input = { ...c, uploadId: p.uploadId, requestKey: randomUUID() }
      const saved = await saveRealTemplate(input)
      c.revision = saved.revision
      const staged = await previewRealTemplate({
        ...c,
        group: 'group_2',
        subject: 'Hi',
        zipBytes: await contentZip(),
        requestKey: randomUUID()
      })
      const extendedExpiry = new Date(Date.parse(c.expiresAt) + 86400000).toISOString()
      c.revision = (await extendCampaign({ ...c, expiresAt: extendedExpiry })).revision
      const receipts = (
        await pool.query('select status,expires_at from invitations_real_import where campaign_id=$1', [
          c.campaignId
        ])
      ).rows
      for (const receipt of receipts.filter((r) => r.status === 'committed'))
        assert.equal(receipt.expires_at.toISOString(), extendedExpiry)
      assert.equal(receipts.find((r) => r.status === 'preview').expires_at.toISOString(), staged.expiresAt)
      await sweepRealCampaigns({ pool, keys })
      assert.deepEqual(await saveRealTemplate(input), saved)
    })
)

test(
  'Approve all approves a group page by page, skipping suppressed, hand-edited and no-plan customers',
  opts,
  async () =>
    withRealDb(async ({ pool, keys }) => {
      const { approveRealGroup, saveRealDraft } = await import('../src/invitations/real-content.js')
      const c = await contentCampaign({ pool, keys, total: 5 })
      const p = await previewRealTemplate({
        ...c,
        group: 'group_1',
        subject: 'Hi {{first_name}}',
        zipBytes: await contentZip(),
        requestKey: randomUUID()
      })
      c.revision = (await saveRealTemplate({ ...c, uploadId: p.uploadId, requestKey: randomUUID() })).revision
      c.revision = (
        await generateRealDrafts({ ...c, group: 'group_1', limit: 100, replaceExisting: false })
      ).revision
      const ids = (
        await pool.query("select id from invitations_real_recipient where group_key='group_1' order by id")
      ).rows.map((r) => r.id)
      assert.ok(ids.length >= 4)
      // One suppressed, one hand-edited, one with no plan at the last check.
      await pool.query("update invitations_real_recipient set state='suppressed' where id=$1", [ids[0]])
      const edited = await readRealRecipient({ ...c, recipientId: ids[1] })
      c.revision = (
        await saveRealDraft({
          ...c,
          recipientId: ids[1],
          subject: edited.draft.subject,
          html: edited.draft.html.replace('Hi', 'Hello'),
          text: edited.draft.bodyText,
          draftRevision: edited.draft.revision
        })
      ).revision
      await pool.query(
        "insert into invitations_real_member_check(campaign_id,recipient_id,status) values($1,$2,'none')",
        [c.campaignId, ids[2]]
      )
      const r = await approveRealGroup({ ...c, group: 'group_1', cursor: null })
      c.revision = r.revision
      assert.equal(r.nextCursor, null)
      assert.equal(r.approved, ids.length - 3)
      assert.deepEqual(r.skipped, { SUPPRESSED: 1, CUSTOMIZED: 1, NO_ACTIVE_PLAN: 1 })
      for (const id of ids.slice(3))
        assert.equal((await readRealRecipient({ ...c, recipientId: id })).draft.contentApproved, true)
      assert.equal((await readRealRecipient({ ...c, recipientId: ids[1] })).draft.contentApproved, false)
      // Again: nothing new, already approved counted.
      const again = await approveRealGroup({ ...c, group: 'group_1', cursor: null })
      assert.equal(again.approved, 0)
      assert.equal(again.already, ids.length - 3)
      await assert.rejects(approveRealGroup({ ...c, revision: c.revision, group: 'group_9', cursor: null }))
    })
)
