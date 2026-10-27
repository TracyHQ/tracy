/**
 * A Joomla Apply with more lines than one contract write takes (`writeContract`, `brief-engines/joomla.js`). Measured
 * 13/10/2026 on the local stand: every Apply on JA Kinetic Joomla that had About to write planned more than 1500 lines, the
 * seeder refused the write whole ("Review at most 1500 scalar slots in one content revision"), and the site kept the
 * template's words. The seeder's write is a double that refuses exactly as the real one does.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { WRITE_ENTITIES, WRITE_SLOTS, writeContract } from '../src/sites/brief-engines/joomla.js'

/**
 * The seeder's write: refuses past 1500 lines and, as the Claude Cowork plugin does (`Engine.php`, "Split the revision into
 * at most 300 entities"), past 300 entities; and refuses by name the keys listed in `refuse`.
 */
function seeder({ refuse = [], copies = 0 } = {}) {
  const writes = []
  const applyJoomlaContract = async ({ apply, mapping }) => {
    const state = await apply({ action: 'content.contract', params: { operation: 'inspect' } })
    const keys = Object.keys(mapping.changes)
    if (keys.length + (mapping.emptyLinks?.length ?? 0) > 1500)
      throw new Error('Review at most 1500 scalar slots in one content revision')
    const entities = new Set(
      [...keys, ...(mapping.emptyLinks ?? [])].map((k) => k.slice(0, k.lastIndexOf('.')))
    )
    // A picture is written to each language copy too: one more entity per copy (`copies`) for each entity with a picture.
    const pictured = new Set(
      keys
        .filter((k) => String(mapping.changes[k]).endsWith('.jpg'))
        .map((k) => k.slice(0, k.lastIndexOf('.')))
    )
    if (entities.size + pictured.size * copies > 300)
      throw new Error('Split the revision into at most 300 entities')
    const named = keys.filter((k) => refuse.includes(k))
    if (named.length) throw new Error(`Content cannot activate an empty slot: ${named.join(', ')}`)
    writes.push({ revision: state.revision, keys, emptyLinks: [...(mapping.emptyLinks ?? [])] })
  }
  return { applyJoomlaContract, writes }
}

/** The site's door: every inspect after a write answers the next revision. */
function site() {
  let revision = 0
  const apply = async (call) => {
    if (call.action === 'content.contract' && call.params?.operation === 'inspect')
      return { ok: true, contract: 'ja-kinetic/j6/1.0.6', revision: `r${++revision}` }
    return { ok: true }
  }
  return { apply }
}

/** `n` lines, `per` of them on each entity (`module-<e>.<i>`, the contract's own key shape). */
const many = (n, per = 10) =>
  Object.fromEntries(
    Array.from({ length: n }, (_, i) => [`module-${Math.floor(i / per)}.${i % per}`, `Dòng ${i}`])
  )
const entitiesOf = (/** @type {string[]} */ keys) => new Set(keys.map((k) => k.slice(0, k.lastIndexOf('.'))))

test('3200 lines are written in three parts of at most 1500, each read again before it is written', async () => {
  const { applyJoomlaContract, writes } = seeder()
  const changes = many(3200)
  const refused = await writeContract({
    applyJoomlaContract,
    apply: site().apply,
    siteKey: 'kin.tracy.test',
    reading: { contract: 'ja-kinetic/j6/1.0.6', revision: 'r0' },
    changes,
    evidence: {},
    emptyLinks: ['module-9.link'],
    timed: (job) => job()
  })
  assert.deepEqual(refused, [])
  assert.equal(writes.length, 3)
  assert.ok(writes.every((w) => w.keys.length + w.emptyLinks.length <= WRITE_SLOTS))
  assert.deepEqual(
    writes.map((w) => w.emptyLinks.length),
    [1, 0, 0],
    'the links taken off go with the first part'
  )
  assert.equal(new Set(writes.flatMap((w) => w.keys)).size, 3200, 'every line is written once')
  assert.equal(new Set(writes.map((w) => w.revision)).size, 3, 'each part is written against a fresh reading')
})

test('a line one part refuses is set aside by name; the other parts are still written', async () => {
  const { applyJoomlaContract, writes } = seeder({ refuse: ['module-200.0'] })
  const changes = many(2000 + 1)
  const refused = await writeContract({
    applyJoomlaContract,
    apply: site().apply,
    siteKey: 'kin.tracy.test',
    reading: { contract: 'ja-kinetic/j6/1.0.6', revision: 'r0' },
    changes,
    evidence: {},
    timed: (job) => job()
  })
  assert.deepEqual(refused, ['module-200.0'])
  assert.equal(changes['module-200.0'], undefined, 'changes is left holding what was written')
  assert.equal(writes.flatMap((w) => w.keys).length, 2000)
})

test('a plan within one write is written once, as before', async () => {
  const { applyJoomlaContract, writes } = seeder()
  await writeContract({
    applyJoomlaContract,
    apply: site().apply,
    siteKey: 'kin.tracy.test',
    reading: { contract: 'c', revision: 'r0' },
    changes: many(1500),
    evidence: {},
    timed: (job) => job()
  })
  assert.equal(writes.length, 1)
})

// 🔒 A WRITE IS BOUNDED BY ENTITIES TOO (TCH #1013, 14/10/2026). Measured on the local stand (run j2): JA Voyara Joomla's
// FULL Apply planned 1,833 lines on 348 entities; the line bound kept them in two parts, but the plugin refuses a revision
// past 300 entities, so the brief failed whole and the site kept the template's words.
test('1000 lines on 500 entities are written in parts of at most 300 entities, one entity never split across two', async () => {
  const { applyJoomlaContract, writes } = seeder()
  const refused = await writeContract({
    applyJoomlaContract,
    apply: site().apply,
    siteKey: 'voy.tracy.test',
    reading: { contract: 'ja-voyara/j6/1.0.7', revision: 'r0' },
    changes: many(1000, 2),
    evidence: {},
    emptyLinks: ['module-9999.link'],
    timed: (job) => job()
  })
  assert.deepEqual(refused, [])
  assert.equal(writes.length, 2)
  for (const w of writes) {
    assert.ok(entitiesOf([...w.keys, ...w.emptyLinks]).size <= WRITE_ENTITIES)
    assert.ok(w.keys.length + w.emptyLinks.length <= WRITE_SLOTS)
  }
  const seen = writes.map((w) => entitiesOf(w.keys))
  assert.equal([...seen[0]].filter((e) => seen[1].has(e)).length, 0, 'no entity is written in two parts')
  assert.equal(
    writes.reduce((n, w) => n + w.keys.length, 0),
    1000,
    'every line is written'
  )
})

test('a part the language copies of its pictures take past 300 entities is written as two halves, never again whole', async () => {
  const { applyJoomlaContract, writes } = seeder({ copies: 1 })
  // 280 entities, each with a picture: 280 own + 280 copies > 300, though 280 alone fits
  const changes = Object.fromEntries(
    Array.from({ length: 280 }, (_, i) => [
      [`module-${i}.0`, `images/new-${i}.jpg`],
      [`module-${i}.1`, `Dòng ${i}`]
    ]).flat()
  )
  const refused = await writeContract({
    applyJoomlaContract,
    apply: site().apply,
    siteKey: 'voy.tracy.test',
    reading: { contract: 'ja-voyara/j6/1.0.7', revision: 'r0' },
    changes,
    evidence: {},
    timed: (job) => job()
  })
  assert.deepEqual(refused, [])
  assert.ok(writes.length >= 2)
  assert.equal(
    writes.reduce((n, w) => n + w.keys.length, 0),
    560,
    'every line is written once'
  )
  assert.equal(new Set(writes.flatMap((w) => w.keys)).size, 560, 'no line is written twice')
})
