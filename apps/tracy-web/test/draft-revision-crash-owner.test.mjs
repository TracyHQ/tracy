// An owner edit made between a crash and the resume (#599): the process dies before a door call of a revision, the
// owner then edits the very place that call was about to write (a record column, a value inside its JSON, a module's
// pages, a contract slot, the site identity), and the run resumes from its saved record. Every case stops
// (`site_changed_outside`, the place named, or an operation that cannot read the owner's value) and the owner's value
// is still on the site. On a plain site and on a site
// that stores JSON its own way.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/draft-revision-crash-owner.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { revisedBy } from './draft-revision-edits.mjs'
import { blankSite } from './draft-revision-fixtures.mjs'
import { firstBuild, revisionRun } from './draft-revision-run.mjs'
import { blankFormSite } from './draft-revision-site-forms.mjs'
import { durable, FIRST } from './draft-revision-sweep.mjs'

const SITES = { plain: (script) => blankSite(script), formed: (script) => blankFormSite('all', script) }
const OWNER = 'Owner words'

/** A site whose doors keep the last writing call they were asked (`site.last`), before it reaches the memory. */
function recording(memory) {
  const site = Object.create(memory)
  const doors = memory.doors
  site.doors = { ...doors }
  for (const name of ['update', 'contract', 'identity', 'upload'])
    site.doors[name] = (call) => {
      site.last = { name, call }
      return doors[name](call)
    }
  return site
}

/** The owner's edit of the place a call was about to write, and how to read it back; null for a call with no place. */
function ownerEdit(memory, { name, call }) {
  const site = memory.site
  if (name === 'update' && call.kind === 'moduleAssignment') {
    site.assignments.set(Number(call.id), [999])
    return () => JSON.stringify(site.assignments.get(Number(call.id))) === '[999]'
  }
  if (name === 'update' && Number(call.id) !== 0) {
    const table = site.records[call.kind]
    const row = table.get(Number(call.id))
    const column = Object.keys(call.fields)[0]
    let value = OWNER
    try {
      const json = JSON.parse(row[column])
      if (json && typeof json === 'object' && !Array.isArray(json) && Object.keys(json).length)
        value = JSON.stringify({ ...json, [Object.keys(json).at(-1)]: OWNER })
    } catch {}
    table.set(Number(call.id), { ...row, [column]: value })
    return () => table.get(Number(call.id))[column] === value
  }
  if (name === 'contract') {
    const key = Object.keys(call.changes ?? {})[0]
    if (!key) return null
    site.slots.get(key).current = OWNER
    return () => site.slots.get(key).current === OWNER
  }
  if (name === 'identity') {
    const field = Object.keys(call.fields)[0]
    site.identity[field] = OWNER
    return () => site.identity[field] === OWNER
  }
  return null
}

for (const [kind, blank] of Object.entries(SITES))
  test(`${kind} site: an owner edit between a crash and the resume always stops the resume and stays on the site`, async () => {
    const counts = {}
    for (const name of ['rename a service', 'change the phone', 'change the site name', 'add a service']) {
      const writes = (await revisionRun(await firstBuild({ memory: blank() }), revisedBy(name))).writes
      for (let n = 1; n <= writes; n++) {
        const memory = recording(blank({ crash: { at: FIRST + n, before: true } }))
        const first = await firstBuild({ memory })
        const store = durable()
        assert.equal(
          (await revisionRun(first, revisedBy(name), { record: store.record })).error?.code,
          'crash'
        )
        const kept = ownerEdit(memory, memory.last)
        if (!kept) {
          counts.noPlace = (counts.noPlace ?? 0) + 1
          continue
        }
        const resumed = await revisionRun(first, revisedBy(name), { record: store.revive() })
        const at = `${name} call ${n} (${memory.last.name})`
        assert.ok(resumed.error, `${at}: done, the owner edit was not seen`)
        assert.ok(kept(), `${at}: the owner value was written over`)
        counts[resumed.error.code] = (counts[resumed.error.code] ?? 0) + 1
      }
    }
    console.log(`${kind}: ${JSON.stringify(counts)}`)
    assert.ok(counts.site_changed_outside > 0)
  })
