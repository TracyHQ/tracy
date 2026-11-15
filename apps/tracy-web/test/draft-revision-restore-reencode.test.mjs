// The restore reads a record column back in the site's own form (`columnHolds`, #599): a site that stores the same
// JSON another way on every save (`alternatingSite`) is restored, never stopped as if the owner had edited it. A
// restore that compared the stored text with the text it wrote exactly would fail here. Invented data only.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/draft-revision-restore-reencode.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { canonicalOf, revisedBy } from './draft-revision-edits.mjs'
import { blankSite } from './draft-revision-fixtures.mjs'
import { firstBuild, restoreOf, revisionRun } from './draft-revision-run.mjs'
import { alternatingSite } from './draft-revision-site-forms.mjs'

/** A site's records with every JSON column read as data, so two encodings of one value read the same. */
function recordsAsData(memory) {
  const parsed = (v) => {
    if (typeof v !== 'string' || !/^\s*\{/.test(v)) return v
    try {
      return JSON.parse(v)
    } catch {
      return v
    }
  }
  const { records } = canonicalOf(memory)
  return JSON.stringify(records, (_, v) => parsed(v))
}

test('a site that re-encodes JSON on every save: the revision and its restore both finish', async () => {
  for (const name of ['change the site name', 'rename a service']) {
    const first = await firstBuild({ memory: alternatingSite(blankSite()) })
    const before = recordsAsData(first.memory)
    const rev = await revisionRun(first, revisedBy(name))
    assert.equal(rev.error, undefined, `${name}: ${rev.error?.code} ${rev.error?.details?.place}`)
    const done = await restoreOf(first, first.builds.get(rev.run.write.build.ref))
    assert.equal(done.status, 'done', name)
    assert.equal(recordsAsData(first.memory), before, `${name}: the records hold the values before again`)
  }
})
