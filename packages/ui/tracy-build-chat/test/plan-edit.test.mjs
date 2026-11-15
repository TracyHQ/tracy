// The plan card's edits (#607, `src/client/save-plan-edit.ts`, `src/client/sources.ts`): a refused edit is said in
// the card's own translated words, never in a server sentence; a plan that moved meanwhile reads the draft again;
// and a draft read that was out while an edit answered never writes the older plan back. Every value is invented.
//
//   node --test --test-concurrency=1 packages/ui/tracy-build-chat/test/plan-edit.test.mjs
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const out = mkdtempSync(path.join(tmpdir(), 'plan-edit-'))
after(() => rmSync(out, { recursive: true, force: true }))
const file = path.join(out, 'plan-edit.mjs')
await build({
  stdin: {
    contents: `
      export { savePlanEdit, undoPlanEdit, refusalOf } from './save-plan-edit'
      export { createDraftSource } from './sources'
      export { en } from './strings'`,
    resolveDir: path.join(root, 'src', 'client'),
    loader: 'ts'
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: file,
  logLevel: 'silent'
})
const lib = await import(pathToFileURL(file).href)

const answering = (status, body) => async () => new Response(JSON.stringify(body), { status })
const EDIT = {
  schema: 'tracy-build-plan-edit/v1',
  id: 'edit-1',
  plan: { id: 'plan-1', revision: 2 },
  changes: []
}

async function refused(status, body) {
  try {
    await lib.savePlanEdit(EDIT, answering(status, body))
  } catch (error) {
    return error
  }
  assert.fail('the edit was not refused')
}

test('a refused edit is said in the card words: a build in progress, a plan that moved, anything else', async () => {
  const locked = await refused(409, {
    code: 'BUILD_RUNNING',
    next: 'The plan is locked while the build runs.'
  })
  assert.deepEqual(lib.refusalOf(locked), { key: 'plan.locked', reload: false })
  assert.equal(locked.say, undefined, 'the server sentence is never shown')
  assert.deepEqual(lib.refusalOf(await refused(409, { code: 'STALE_EDIT' })), {
    key: 'plan.stale',
    reload: true
  })
  assert.deepEqual(lib.refusalOf(await refused(422, { code: 'INVALID_EDIT', problems: ['x'] })), {
    key: 'plan.saveFailed',
    reload: false
  })
  assert.deepEqual(lib.refusalOf(new TypeError('fetch failed')), { key: 'plan.saveFailed', reload: false })
  for (const key of ['plan.locked', 'plan.stale']) assert.equal(typeof lib.en[key], 'string', key)
})

test('a plan a step still works on, or a change too large to read, is said in the card words, the plan kept', async () => {
  const busy = await refused(409, {
    code: 'ENGINE_BUSY',
    next: 'Wait for the step to end.',
    say: 'I am still working on your plan, so it cannot change right now.'
  })
  assert.deepEqual(lib.refusalOf(busy), { key: 'plan.busy', reload: false })
  assert.equal(busy.say, undefined, 'the server sentence is never shown')
  // The undo door answers the same refusal the same way.
  let undone
  try {
    await lib.undoPlanEdit(answering(409, { code: 'ENGINE_BUSY', say: 'x' }))
  } catch (error) {
    undone = error
  }
  assert.deepEqual(lib.refusalOf(undone), { key: 'plan.busy', reload: false })
  assert.deepEqual(lib.refusalOf(await refused(413, { code: 'BODY_TOO_LARGE' })), {
    key: 'plan.tooLarge',
    reload: false
  })
  for (const key of ['plan.busy', 'plan.tooLarge']) assert.equal(typeof lib.en[key], 'string', key)
})

test('a draft read that was out while an edit answered never writes the older plan back', async () => {
  let release
  const fetchImpl = () =>
    new Promise((resolve) => {
      release = () =>
        resolve(new Response(JSON.stringify({ draft: { plan: { id: 'plan-1', revision: 2 } } })))
    })
  const drafts = lib.createDraftSource(fetchImpl)
  const reading = drafts.load()
  drafts.put({ plan: { id: 'plan-1', revision: 3 } })
  release()
  await reading
  assert.equal(drafts.read().plan.revision, 3, 'the edited plan stays')
})
