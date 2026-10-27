import { FOOTER_STYLE } from '../src/invitations/real-render.js'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { withRealDb } from './_invitations-real.mjs'
import { contentCampaign, contentZip } from './_invitations-real-content.mjs'
import { syntheticSnapshot, snapshotCsv } from './_invitations-real.mjs'
import {
  readRealRecipient,
  listRealRecipients,
  previewRealImport,
  commitRealImport
} from '../src/invitations/real-import.js'
import {
  previewRealTemplate,
  saveRealTemplate,
  readRealFields,
  updateRealFields,
  updateRealRecipientValues,
  generateRealDrafts,
  saveRealDraft,
  approveRealDraft
} from '../src/invitations/real-content.js'
const opts = { skip: !process.env.TEST_DATABASE_URL }
test(
  'manual to column and back preserves inactive overrides, raw source and customized drafts',
  opts,
  async () =>
    withRealDb(async ({ pool, keys }) => {
      const c = await contentCampaign({ pool, keys, total: 1 }),
        rid = c.recipients[0].id
      let registry = await readRealFields(c)
      registry.fields.push({
        key: 'custom.opening',
        label: 'Opening',
        source: { kind: 'manual' },
        missing: 'required'
      })
      registry.campaignValues['custom.opening'] = 'Campaign opening'
      registry.groupValues.group_1 = { 'custom.opening': 'Group opening' }
      c.revision = (await updateRealFields({ ...c, registry })).revision
      c.revision = (
        await updateRealRecipientValues({
          ...c,
          recipientId: rid,
          values: { 'custom.opening': 'Recipient opening' }
        })
      ).revision
      const p = await previewRealTemplate({
        ...c,
        group: 'group_1',
        subject: 'Hi',
        zipBytes: await contentZip({ html: '<p>{{custom.opening}}</p>' }),
        requestKey: randomUUID()
      })
      c.revision = (await saveRealTemplate({ ...c, uploadId: p.uploadId, requestKey: randomUUID() })).revision
      c.revision = (
        await generateRealDrafts({ ...c, group: 'group_1', limit: 100, replaceExisting: false })
      ).revision
      let d = await readRealRecipient({ ...c, recipientId: rid })
      c.revision = (
        await saveRealDraft({
          ...c,
          recipientId: rid,
          draftRevision: d.draft.revision,
          subject: 'Custom',
          html: '<p>Keep my text</p>',
          text: 'Keep fallback'
        })
      ).revision
      d = await readRealRecipient({ ...c, recipientId: rid })
      c.revision = (
        await approveRealDraft({ ...c, recipientId: rid, draftRevision: d.draft.revision })
      ).revision
      registry = await readRealFields(c)
      registry.fields.at(-1).source = { kind: 'column', column: 'cong_ty' }
      c.revision = (await updateRealFields({ ...c, registry })).revision
      d = await readRealRecipient({ ...c, recipientId: rid })
      assert.equal(d.draft.contentApproved, false)
      assert.equal(
        d.draft.html,
        `<p>Keep my text</p><p style="${FOOTER_STYLE}">Unsubscribe will be available when sending is enabled.</p>`
      )
      const raw = d.rawSource
      c.revision = (
        await saveRealDraft({
          ...c,
          recipientId: rid,
          draftRevision: d.draft.revision,
          subject: 'Custom',
          html: '<p>Keep my text</p>',
          text: 'Keep fallback'
        })
      ).revision
      d = await readRealRecipient({ ...c, recipientId: rid })
      c.revision = (
        await approveRealDraft({ ...c, recipientId: rid, draftRevision: d.draft.revision })
      ).revision
      await assert.rejects(
        () =>
          updateRealRecipientValues({
            ...c,
            recipientId: rid,
            values: { 'custom.opening': 'New inactive override' }
          }),
        { code: 'REAL_INVALID_FIELD_VALUES' }
      )
      registry = await readRealFields(c)
      registry.fields.at(-1).source = { kind: 'manual' }
      c.revision = (await updateRealFields({ ...c, registry })).revision
      d = await readRealRecipient({ ...c, recipientId: rid })
      assert.deepEqual(d.rawSource, raw)
      assert.equal(d.values['custom.opening'], 'Recipient opening')
      assert.equal(
        d.draft.html,
        `<p>Keep my text</p><p style="${FOOTER_STYLE}">Unsubscribe will be available when sending is enabled.</p>`
      )
      assert.equal(d.draft.contentApproved, false)
    })
)
test(
  'content approval for recheck is not send approval; hidden field changes invalidate while preserving customized text',
  opts,
  async () =>
    withRealDb(async ({ pool, keys }) => {
      const c = await contentCampaign({ pool, keys }),
        rid = c.recipients[0].id
      const registry = await readRealFields(c)
      registry.fields.push({
        key: 'custom.opening_line',
        label: 'Opening',
        source: { kind: 'manual' },
        missing: 'omit'
      })
      c.revision = (await updateRealFields({ ...c, registry })).revision
      const p = await previewRealTemplate({
        ...c,
        group: 'group_1',
        subject: 'Hi',
        zipBytes: await contentZip({
          html: '<p>Hello {{first_name}}</p><p data-if-present="custom.opening_line">{{custom.opening_line}}</p>'
        }),
        requestKey: randomUUID()
      })
      c.revision = (await saveRealTemplate({ ...c, uploadId: p.uploadId, requestKey: randomUUID() })).revision
      c.revision = (
        await generateRealDrafts({ ...c, group: 'group_1', limit: 100, replaceExisting: false })
      ).revision
      let d = await readRealRecipient({ ...c, recipientId: rid })
      assert.equal(d.state, 'recheck')
      c.revision = (
        await saveRealDraft({
          ...c,
          recipientId: rid,
          draftRevision: d.draft.revision,
          subject: 'Custom subject',
          html: '<p>Custom synthetic text</p>',
          text: 'Synthetic fallback'
        })
      ).revision
      d = await readRealRecipient({ ...c, recipientId: rid })
      const approval = await approveRealDraft({ ...c, recipientId: rid, draftRevision: d.draft.revision })
      c.revision = approval.revision
      assert.equal(approval.contentApproved, true)
      assert.equal(approval.sendingEnabled, false)
      const before = await readRealRecipient({ ...c, recipientId: rid })
      assert.equal(before.draft.contentApproved, true)
      c.revision = (
        await updateRealRecipientValues({
          ...c,
          recipientId: rid,
          values: { 'custom.opening_line': 'New synthetic opening' }
        })
      ).revision
      const after = await readRealRecipient({ ...c, recipientId: rid })
      assert.equal(after.draft.contentApproved, false)
      assert.equal(after.draft.html, before.draft.html)
      assert.equal(after.draft.bodyText, before.draft.bodyText)
      assert.equal(after.draft.stale, true)
      await assert.rejects(
        () => approveRealDraft({ ...c, recipientId: rid, draftRevision: d.draft.revision - 1 }),
        { status: 409 }
      )
      const rawBefore = after.rawSource
      await assert.rejects(() =>
        updateRealRecipientValues({
          ...c,
          recipientId: rid,
          values: { company: 'Not a raw column override' }
        })
      )
      assert.deepEqual((await readRealRecipient({ ...c, recipientId: rid })).rawSource, rawBefore)
    })
)
test(
  'unrelated field values do not invalidate effective approval, while relevant defaults and source identity changes do',
  opts,
  async () =>
    withRealDb(async ({ pool, keys }) => {
      const c = await contentCampaign({ pool, keys }),
        rid = c.recipients[0].id
      let registry = await readRealFields(c)
      registry.fields.push({
        key: 'custom.note',
        label: 'Note',
        source: { kind: 'manual' },
        missing: 'default',
        defaultValue: 'Unused'
      })
      c.revision = (await updateRealFields({ ...c, registry })).revision
      const p = await previewRealTemplate({
        ...c,
        group: 'group_1',
        subject: 'Hi',
        zipBytes: await contentZip(),
        requestKey: randomUUID()
      })
      c.revision = (await saveRealTemplate({ ...c, uploadId: p.uploadId, requestKey: randomUUID() })).revision
      c.revision = (
        await generateRealDrafts({ ...c, group: 'group_1', limit: 100, replaceExisting: false })
      ).revision
      const d = await readRealRecipient({ ...c, recipientId: rid })
      c.revision = (
        await approveRealDraft({ ...c, recipientId: rid, draftRevision: d.draft.revision })
      ).revision
      registry = await readRealFields(c)
      registry.campaignValues['custom.note'] = 'Changed unused value'
      c.revision = (await updateRealFields({ ...c, registry })).revision
      assert.equal((await readRealRecipient({ ...c, recipientId: rid })).draft.contentApproved, true)
      registry = await readRealFields(c)
      registry.campaignValues.first_name = 'Confirmed synthetic name'
      c.revision = (await updateRealFields({ ...c, registry })).revision
      assert.equal((await readRealRecipient({ ...c, recipientId: rid })).draft.contentApproved, false)
    })
)
test(
  'source alias update preserves confirmed manual values and invalidates approval without overwriting draft',
  opts,
  async () =>
    withRealDb(async ({ pool, keys }) => {
      const c = await contentCampaign({ pool, keys, total: 1 }),
        rid = c.recipients[0].id
      const p = await previewRealTemplate({
        ...c,
        group: 'group_1',
        subject: 'Hi',
        zipBytes: await contentZip(),
        requestKey: randomUUID()
      })
      c.revision = (await saveRealTemplate({ ...c, uploadId: p.uploadId, requestKey: randomUUID() })).revision
      c.revision = (
        await updateRealRecipientValues({
          ...c,
          recipientId: rid,
          values: { first_name: 'Confirmed synthetic' }
        })
      ).revision
      c.revision = (
        await generateRealDrafts({ ...c, group: 'group_1', limit: 100, replaceExisting: false })
      ).revision
      let d = await readRealRecipient({ ...c, recipientId: rid })
      c.revision = (
        await approveRealDraft({ ...c, recipientId: rid, draftRevision: d.draft.revision })
      ).revision
      const before = await readRealRecipient({ ...c, recipientId: rid })
      assert.equal((await listRealRecipients({ ...c, limit: 100 })).items[0].contentStatus, 'approved')
      const fixture = syntheticSnapshot({ total: 1, offset: 50 })
      fixture.rows[0][0] = '999999'
      const preview = await previewRealImport({
        ...c,
        csvBytes: snapshotCsv(fixture.headers, fixture.rows),
        name: 'Synthetic content',
        sourceDate: '2026-10-07'
      })
      c.revision = (
        await commitRealImport({
          ...c,
          previewId: preview.previewId,
          digest: preview.digest,
          requestKey: randomUUID()
        })
      ).revision
      d = await readRealRecipient({ ...c, recipientId: rid })
      assert.equal(d.values.first_name, 'Confirmed synthetic')
      assert.equal(d.draft.contentApproved, false)
      assert.equal(d.draft.html, before.draft.html)
      assert.equal((await listRealRecipients({ ...c, limit: 100 })).items[0].contentStatus, 'needs_review')
    })
)
test(
  'custom-only required dependencies cannot be approved after their value or definition disappears',
  opts,
  async () =>
    withRealDb(async ({ pool, keys }) => {
      const c = await contentCampaign({ pool, keys }),
        rid = c.recipients[0].id
      let registry = await readRealFields(c)
      registry.fields.push({
        key: 'custom.required_note',
        label: 'Required note',
        source: { kind: 'manual' },
        missing: 'required'
      })
      registry.campaignValues['custom.required_note'] = 'Confirmed synthetic note'
      c.revision = (await updateRealFields({ ...c, registry })).revision
      const p = await previewRealTemplate({
        ...c,
        group: 'group_1',
        subject: 'Hi',
        zipBytes: await contentZip(),
        requestKey: randomUUID()
      })
      c.revision = (await saveRealTemplate({ ...c, uploadId: p.uploadId, requestKey: randomUUID() })).revision
      c.revision = (
        await generateRealDrafts({ ...c, group: 'group_1', limit: 100, replaceExisting: false })
      ).revision
      let d = await readRealRecipient({ ...c, recipientId: rid })
      c.revision = (
        await saveRealDraft({
          ...c,
          recipientId: rid,
          draftRevision: d.draft.revision,
          subject: 'Hi',
          html: '<p>{{custom.required_note}}</p>',
          text: null
        })
      ).revision
      registry = await readRealFields(c)
      delete registry.campaignValues['custom.required_note']
      c.revision = (await updateRealFields({ ...c, registry })).revision
      d = await readRealRecipient({ ...c, recipientId: rid })
      await assert.rejects(
        () => approveRealDraft({ ...c, recipientId: rid, draftRevision: d.draft.revision }),
        { code: 'REAL_MISSING_FIELD' }
      )
      registry = await readRealFields(c)
      registry.fields = registry.fields.filter((f) => f.key !== 'custom.required_note')
      c.revision = (await updateRealFields({ ...c, registry })).revision
      d = await readRealRecipient({ ...c, recipientId: rid })
      await assert.rejects(
        () => approveRealDraft({ ...c, recipientId: rid, draftRevision: d.draft.revision }),
        { code: 'REAL_UNKNOWN_TOKEN' }
      )
    })
)
test(
  'group values and explicit column mapping changes invalidate approval while preserving draft and raw source',
  opts,
  async () =>
    withRealDb(async ({ pool, keys }) => {
      const c = await contentCampaign({ pool, keys }),
        rid = c.recipients[0].id
      let registry = await readRealFields(c)
      registry.fields.push({
        key: 'custom.group_note',
        label: 'Group note',
        source: { kind: 'manual' },
        missing: 'default',
        defaultValue: 'Default note'
      })
      registry.groupValues.group_1 = { 'custom.group_note': 'Group note' }
      c.revision = (await updateRealFields({ ...c, registry })).revision
      const p = await previewRealTemplate({
        ...c,
        group: 'group_1',
        subject: 'Hi',
        zipBytes: await contentZip({ html: '<p>{{company}} {{custom.group_note}}</p>' }),
        requestKey: randomUUID()
      })
      c.revision = (await saveRealTemplate({ ...c, uploadId: p.uploadId, requestKey: randomUUID() })).revision
      c.revision = (
        await generateRealDrafts({ ...c, group: 'group_1', limit: 100, replaceExisting: false })
      ).revision
      for (const change of ['group', 'mapping']) {
        let d = await readRealRecipient({ ...c, recipientId: rid })
        c.revision = (
          await approveRealDraft({ ...c, recipientId: rid, draftRevision: d.draft.revision })
        ).revision
        const before = await readRealRecipient({ ...c, recipientId: rid })
        registry = await readRealFields(c)
        if (change === 'group') registry.groupValues.group_1['custom.group_note'] = 'Changed group note'
        else registry.fields.find((f) => f.key === 'company').source = { kind: 'column', column: 'goi' }
        c.revision = (await updateRealFields({ ...c, registry })).revision
        d = await readRealRecipient({ ...c, recipientId: rid })
        assert.equal(d.draft.contentApproved, false)
        assert.equal(d.draft.html, before.draft.html)
        assert.deepEqual(d.rawSource, before.rawSource)
      }
    })
)

test(
  'content approval never changes suppression and encrypted drafts and audit do not expose customer content',
  opts,
  async () =>
    withRealDb(async ({ pool, keys }) => {
      const c = await contentCampaign({ pool, keys, total: 1, offset: 0 }),
        rid = c.recipients[0].id
      const p = await previewRealTemplate({
        ...c,
        group: 'group_1',
        subject: 'Private synthetic subject',
        zipBytes: await contentZip(),
        requestKey: randomUUID()
      })
      c.revision = (await saveRealTemplate({ ...c, uploadId: p.uploadId, requestKey: randomUUID() })).revision
      c.revision = (
        await generateRealDrafts({ ...c, group: 'group_1', limit: 100, replaceExisting: false })
      ).revision
      let d = await readRealRecipient({ ...c, recipientId: rid })
      assert.equal(d.state, 'suppressed')
      const originalReasons = d.reasons
      c.revision = (
        await approveRealDraft({ ...c, recipientId: rid, draftRevision: d.draft.revision })
      ).revision
      d = await readRealRecipient({ ...c, recipientId: rid })
      assert.equal(d.draft.contentApproved, true)
      assert.equal(d.draft.sendingEnabled, false)
      assert.equal(d.state, 'suppressed')
      assert.deepEqual(d.reasons, originalReasons)
      const dump = (
        await pool.query(
          'select row_to_json(d)::text as x from invitations_real_draft d union all select row_to_json(a)::text from invitations_real_audit a'
        )
      ).rows
        .map((r) => r.x)
        .join('')
      for (const privateValue of [d.email, d.draft.subject, d.draft.html, d.draft.bodyText])
        assert.ok(!dump.includes(privateValue))
    })
)
