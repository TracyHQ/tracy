import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'
import { withRealDb } from './_invitations-real.mjs'
import { contentCampaign, contentZip } from './_invitations-real-content.mjs'
import { sweepExpired } from '../src/cron.js'
import { readRealRecipient } from '../src/invitations/real-import.js'
import { FOOTER_STYLE } from '../src/invitations/real-render.js'
import {
  generateRealDrafts,
  previewRealTemplate,
  saveRealDraft,
  saveRealTemplate
} from '../src/invitations/real-content.js'
const opts = { skip: !process.env.TEST_DATABASE_URL }
const FOOTER = 'Unsubscribe will be available when sending is enabled.'

test('the hourly sweep names a campaign whose key is held, every pass, by id and code only', opts, async () =>
  withRealDb(async ({ pool, keys, root }) => {
    const c = await contentCampaign({ pool, keys })
    await writeFile(
      join(root, `${c.campaignId}.lock`),
      JSON.stringify({ v: 1, host: 'another-host', pid: 1, boot: 'x', at: new Date().toISOString() }),
      { mode: 0o600 }
    )
    const first = await sweepExpired(pool, { invitationsRealKeys: keys })
    assert.deepEqual(first.realKeyErrors, [
      { campaignId: c.campaignId, code: 'REAL_KEY_BUSY', expired: false }
    ])
    assert.equal(first.realSweepError, null)
    const again = await sweepExpired(pool, { invitationsRealKeys: keys })
    assert.equal(again.realKeyErrors.length, 1, 'reported again until someone clears it')
    assert.ok(!JSON.stringify(first).includes('@'))
  })
)

test(
  'the system footer is a muted line inside the email and stays single when a draft is saved again',
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
      c.revision = (
        await generateRealDrafts({ ...c, group: 'group_1', limit: 100, replaceExisting: false })
      ).revision
      const rid = (await pool.query('select recipient_id from invitations_real_draft limit 1')).rows[0]
        .recipient_id
      let detail = await readRealRecipient({ ...c, recipientId: rid })
      assert.ok(detail.draft.html.includes(`<p style="${FOOTER_STYLE}">${FOOTER}</p>`))
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
      detail = await readRealRecipient({ ...c, recipientId: rid })
      assert.equal(detail.draft.html.split(FOOTER).length - 1, 1)
      assert.ok(detail.draft.html.includes(FOOTER_STYLE))
    })
)
