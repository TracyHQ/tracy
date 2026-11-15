// The delete of a file a revision uploaded (#599, `deleteUpload`), as `media.delete` was measured on plugin 0.24.85: a
// path with no file and a repeated apply id both answer `write_failed`, so whether the file is there is read on its own
// (`media`) and an error is never counted as a delete; a real delete succeeds whoever uses the file, so no path reaches
// it without a readable dry run in the same call; a record this undo takes off (made, or shown again and hidden back)
// that the dry run names does not keep the file. Invented data only.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/draft-revision-media-delete.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { deleteUpload } from '../src/step-chain-draft-media-delete.js'
import { restorePlanOf } from '../src/step-chain-draft-restore-plan.js'
import { revisedBy } from './draft-revision-edits.mjs'
import { firstBuild, restoreOf, revisionRun } from './draft-revision-run.mjs'

const PATH = 'images/tracy/fern-posy.jpg'
const NO_FILE = Object.assign(new Error('could not make and verify the undo copy; nothing was deleted'), {
  code: 'write_failed'
})

/** Doors over one file: `there` says whether it is, `dry` the dry run answer, `real` what the delete does. */
function doorsOf({ there = true, dry = { ok: true, usedIn: [] }, real = 'delete', media = true } = {}) {
  const calls = []
  const site = { there }
  const doors = {
    deleteMedia: async ({ dryRun, path }) => {
      calls.push(dryRun ? 'dry' : 'delete')
      if (!site.there) throw NO_FILE
      if (dryRun) {
        if (dry instanceof Error) throw dry
        return dry
      }
      if (real === 'fails-after-acting') site.there = false
      if (real !== 'delete') throw NO_FILE
      site.there = false
      return { ok: true, deleted: { path, files: [] } }
    },
    ...(media
      ? {
          media: async () => {
            if (media === 'throws') throw Object.assign(new Error('down'), { code: 'FETCH_FAILED' })
            return site.there ? { sha256: 'f00d' } : null
          }
        }
      : {})
  }
  return { doors, calls, site }
}
const run = async (setup, mine = []) => {
  const left = []
  const { doors, calls, site } = doorsOf(setup)
  await deleteUpload({ path: PATH, mine }, doors, 'restore-1:media', left)
  return { left, calls, site }
}

test('a file already gone is done without any delete call; presence unread keeps it', async () => {
  const gone = await run({ there: false })
  assert.deepEqual(gone.calls, [])
  assert.deepEqual(gone.left, [])
  for (const media of [false, 'throws']) {
    const unread = await run({ media })
    assert.deepEqual(unread.calls, [])
    assert.equal(unread.left[0].why, 'presence_unread')
  }
})

test('a write_failed delete is never counted deleted: the file is read again', async () => {
  const stays = await run({ real: 'fails' })
  assert.equal(stays.site.there, true)
  assert.equal(stays.left[0].why, 'write_failed')
  const acted = await run({ real: 'fails-after-acting' })
  assert.equal(acted.site.there, false)
  assert.deepEqual(acted.left, [])
  const dryFails = await run({ dry: NO_FILE })
  assert.deepEqual(dryFails.calls, ['dry'])
  assert.equal(dryFails.left[0].why, 'write_failed')
})

test('no real delete is sent without a readable dry run naming only records this undo takes off', async () => {
  const answers = [
    { ok: true, usedIn: [] },
    { ok: true, usedIn: [{ type: 'articles', id: 7, title: 'Fern posy' }] },
    { ok: true, usedIn: [{ type: 'articles', id: 8, title: 'Moss posy' }] },
    { ok: true, usedIn: [{ type: 'templateStyles', id: 7, title: 'Default' }] },
    { ok: true, usedIn: [{ kind: 'article', id: 7 }] },
    { ok: true },
    null,
    NO_FILE,
    Object.assign(new Error('refused'), { code: 'bad_params' })
  ]
  for (const dry of answers) {
    const out = await run({ dry }, ['article:7'])
    const readable = !(dry instanceof Error) && Array.isArray(dry?.usedIn)
    const onlyMine = readable && dry.usedIn.every((u) => u.type === 'articles' && u.id === 7)
    assert.deepEqual(out.calls, onlyMine ? ['dry', 'delete'] : ['dry'], JSON.stringify(dry))
  }
})

test('on a real restore, every delete follows a readable dry run of the same file in the same call', async () => {
  const first = await firstBuild()
  const out = await revisionRun(first, revisedBy('add a service'))
  assert.equal(out.error, undefined, out.error?.code)
  const real = first.memory.doors
  const seen = []
  const doors = {
    ...real,
    deleteMedia: async (call) => {
      const answer = await real.deleteMedia(call)
      seen.push({ path: call.path, dry: call.dryRun === true, readable: Array.isArray(answer?.usedIn) })
      return answer
    }
  }
  const restored = await restoreOf(first, first.builds.get(out.run.write.build.ref), { doors })
  assert.equal(restored.status, 'done')
  const deletes = seen.filter((s) => !s.dry)
  assert.ok(deletes.length > 0, 'the restore deleted the files the revision uploaded')
  for (const d of deletes) {
    const before = seen[seen.indexOf(d) - 1]
    assert.deepEqual([before.path, before.dry, before.readable], [d.path, true, true])
  }
})

test('a record this undo hides back (shown again by the revision) does not keep a file it names', () => {
  const build = {
    write: {
      state: {
        baseIds: ['article:service-fern-posy'],
        ids: { 'article:service-fern-posy': 7 },
        undo: {
          records: { 'article:7': { kind: 'article', id: 7, fields: { state: 0, title: 'Fern posy' } } },
          assignments: { 1012: [] },
          slots: {},
          removed: [],
          identity: {},
          uploads: [PATH]
        }
      }
    }
  }
  const media = restorePlanOf(build).places.find((p) => p.type === 'media')
  assert.ok(media.mine.includes('article:7'))
  assert.ok(media.mine.includes('module:1012'))
})
