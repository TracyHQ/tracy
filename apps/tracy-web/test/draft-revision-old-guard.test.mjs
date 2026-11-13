// The old value scan of a revision guards the app (#599): a kept page whose words carry an old value its own request
// never carried (a writer that slipped past the copy check, as a double here: its words are put in the stored build)
// is sent to the writer again, so the site no longer says the old value, though nothing in that page's request changed.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/draft-revision-old-guard.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { revisedBy } from './draft-revision-edits.mjs'
import { firstBuild, revisionRun } from './draft-revision-run.mjs'

const OLD_PHONE = '+1 555 0100 214'

test('a kept page quoting an old value its request does not carry is written again', async () => {
  const first = await firstBuild()
  const build = first.builds.get(first.ref)
  const phoneOf = (p) => JSON.stringify(p).includes('555')
  // A page whose request never showed the phone: a writer could only have named it past the copy check.
  const page = build.copy.pages.find((p) => !phoneOf(p) && p.fields.some((f) => f.from === 'writer'))
  const field = page.fields.find((f) => f.from === 'writer')
  field.value = `Call ${OLD_PHONE} to order.`
  const clean = await revisionRun(await firstBuild(), revisedBy('change the phone'))
  assert.equal(clean.model.pages[page.id], undefined, 'without the quote the page keeps its words')
  const rev = await revisionRun(first, revisedBy('change the phone'))
  assert.equal(rev.error, undefined, rev.error?.code)
  assert.equal(rev.model.pages[page.id], 1)
  const block = field.key.split('/')[0]
  const entry = rev.run.plan.revision.impact.blocks.find((b) => b.page === page.id && b.block === block)
  assert.ok(
    entry?.reasons.some((r) => r.startsWith('old_text_in_copy')),
    JSON.stringify(entry)
  )
  const words = rev.run.copy.pages.find((p) => p.id === page.id).fields.find((f) => f.key === field.key).value
  assert.ok(!words.includes('0100 214'), words)
})
