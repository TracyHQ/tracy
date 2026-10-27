import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'
import { withRealDb } from './_invitations-real.mjs'
import { contentCampaign, contentZip } from './_invitations-real-content.mjs'
import { realOps } from './_invitations-real-ops.mjs'
import { defaultRegistry } from '../src/invitations/real-fields.js'
import { sanitizeEmailHtml } from '../src/invitations/real-html.js'
import { listRealRecipients } from '../src/invitations/real-import.js'
import {
  generateRealDrafts,
  previewRealTemplate,
  readRealDraftProgress,
  saveRealTemplate
} from '../src/invitations/real-content.js'
const opts = { skip: !process.env.TEST_DATABASE_URL }
const registry = defaultRegistry(['cong_ty'])

test('a CSS string whose escapes decode to markup cannot reopen the raw <style> text', () => {
  const r = sanitizeEmailHtml({
    html: '<style>p{font-family:"\\3c/style\\3e<script>alert(1)\\3c/script\\3e<img src=https://example.test/p><style>";color:red}</style><p>Hi</p>',
    imagePaths: [],
    registry
  })
  assert.ok(!/<script|<img|example\.test/i.test(r.html))
  assert.ok(r.html.includes('color:red'))
  assert.ok(r.removed.some((x) => x.item === 'CSS value of font-family'))
})

test('removed content is named by kind and counted, never by its text', () => {
  const r = sanitizeEmailHtml({
    html: '<!doctype html><html><head><meta name="viewport" content="width=device-width"><style>p{color:red!important;behavior:url(x)}</style></head><body><!-- private note --><p onclick="x()">Hi</p><p onclick="y()">Again</p></body></html>',
    imagePaths: [],
    registry
  })
  const removed = Object.fromEntries(r.removed.map((x) => [x.item, x.count]))
  assert.equal(removed['<meta> element'], 1)
  assert.equal(removed['onclick attribute'], 2)
  assert.equal(removed['CSS !important'], 1)
  assert.equal(removed['CSS property behavior'], 1)
  assert.equal(removed['HTML comment'], 1)
  assert.ok(!JSON.stringify(r.removed).includes('private note'))
  assert.deepEqual(r.warnings, ['HTML_CONTENT_REMOVED'])
})

test(
  'generating missing drafts reads only recipients without a draft, so every page makes progress',
  opts,
  async () =>
    withRealDb(async ({ pool, keys }) => {
      const c = await contentCampaign({ pool, keys, total: 25 })
      const before = await readRealDraftProgress(c)
      const g1 = before.groups.find((g) => g.key === 'group_1')
      assert.ok(g1.total >= 3, 'fixture has several group_1 recipients')
      assert.equal(g1.drafted, 0)
      await assert.rejects(
        async () =>
          previewRealTemplate({
            ...c,
            group: 'group_1',
            subject: '  ',
            zipBytes: await contentZip(),
            requestKey: randomUUID()
          }),
        { code: 'REAL_SUBJECT_REQUIRED' }
      )
      const p = await previewRealTemplate({
        ...c,
        group: 'group_1',
        subject: 'Hi',
        zipBytes: await contentZip(),
        requestKey: randomUUID()
      })
      c.revision = (await saveRealTemplate({ ...c, uploadId: p.uploadId, requestKey: randomUUID() })).revision
      let r = await generateRealDrafts({ ...c, group: 'group_1', limit: 1, replaceExisting: false })
      c.revision = r.revision
      assert.deepEqual([r.created, r.kept, r.groupDrafted, r.groupTotal], [1, 0, 1, g1.total])
      // A fresh press without the cursor (as after leaving the tab) still creates a new draft.
      r = await generateRealDrafts({ ...c, group: 'group_1', limit: 1, replaceExisting: false })
      c.revision = r.revision
      assert.deepEqual([r.created, r.kept, r.groupDrafted], [1, 0, 2])
      let cursor = null
      do {
        r = await generateRealDrafts({ ...c, group: 'group_1', cursor, limit: 100, replaceExisting: false })
        c.revision = r.revision
        cursor = r.nextCursor
      } while (cursor)
      assert.equal(r.groupDrafted, g1.total)
      assert.equal((await readRealDraftProgress(c)).groups.find((g) => g.key === 'group_1').drafted, g1.total)
      const drafted = await listRealRecipients({ ...c, group: 'group_1', content: 'draft', limit: 100 })
      assert.equal(drafted.total, g1.total)
      assert.ok(drafted.items.every((i) => i.contentStatus === 'draft'))
      const missing = await listRealRecipients({ ...c, content: 'not_created', limit: 100 })
      assert.ok(missing.items.every((i) => i.group !== 'group_1' && i.contentStatus === 'not_created'))
      await assert.rejects(() => listRealRecipients({ ...c, content: 'sent', limit: 1 }), {
        code: 'REAL_INVALID_FILTER'
      })
    })
)

test(
  'one campaign that cannot be opened is listed with its code and does not hide the others',
  opts,
  async () =>
    withRealDb(async (deps) => {
      const h = await realOps(deps)
      const good = await contentCampaign(deps)
      const broken = await contentCampaign(deps)
      await unlink(join(deps.root, broken.campaignId, 'key.json'))
      const response = await h.request('')
      assert.equal(response.status, 200)
      const body = await response.json()
      const byId = Object.fromEntries(body.campaigns.map((x) => [x.id, x]))
      assert.ok(byId[good.campaignId].name, 'the readable campaign keeps its private view')
      assert.equal(byId[good.campaignId].unavailable, undefined)
      assert.match(byId[broken.campaignId].unavailable, /^REAL_/)
      assert.equal(byId[broken.campaignId].name, undefined)
    })
)
