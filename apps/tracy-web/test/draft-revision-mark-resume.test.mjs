// The site's unfinished run mark (#599, `builds.begin`) on a resumed revision: an attempt that marked the site and
// died before any door write leaves the mark; the resumed attempt that then stops before writing (an up-front check:
// an owner edit on a record it would hide) clears it, so the next revision runs. A first write refused twice, whose
// effect on the site is unknown (the journal saved `touched` before the call), keeps the mark: it is resumed or
// abandoned. Invented data only.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/draft-revision-mark-resume.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { revisedBy } from './draft-revision-edits.mjs'
import { firstBuild, revisionRun } from './draft-revision-run.mjs'

const removePlans = () => {
  const draft = revisedBy('change nothing')
  draft.plan.pages = draft.plan.pages.filter((p) => p.id !== 'plans')
  return draft
}
const through = (memory, doors) => ({
  doors,
  get calls() {
    return memory.calls
  }
})

test('a resumed attempt that stops before any write clears the mark its first attempt left', async () => {
  const first = await firstBuild()
  const ids = first.builds.get(first.ref).write.state.ids
  // The first attempt marked the site and died before its first door write: its record holds no `touched`.
  first.builds.unfinishedRun = { runId: 'run-larkspur-2', from: first.ref }
  const record = { state: undefined }
  await first.memory.doors.update({
    applyId: 'owner-1',
    kind: 'moduleAssignment',
    id: ids['copy:plans.plans-b5'],
    fields: { menuids: JSON.stringify([ids['menuItem:mainmenu:home']]) }
  })
  const again = await revisionRun(first, removePlans(), { record })
  assert.equal(again.error?.code, 'site_changed_outside')
  assert.equal(again.writes, 0)
  assert.equal(first.builds.unfinishedRun ?? null, null)
})

test('another run marked stays marked when this one stops before writing', async () => {
  const first = await firstBuild()
  first.builds.unfinishedRun = { runId: 'run-other', from: first.ref }
  const out = await revisionRun(first, revisedBy('change the phone'))
  assert.equal(out.error?.code, 'previous_run_unfinished')
  assert.equal(first.builds.unfinishedRun.runId, 'run-other')
})

test('a first write refused twice keeps the mark: whether it acted is unknown', async () => {
  const first = await firstBuild()
  const refuse = async () => {
    throw Object.assign(new Error('refused'), { code: 'SITE_REFUSED' })
  }
  const doors = { ...first.memory.doors, update: refuse, contract: refuse }
  const out = await revisionRun(first, revisedBy('change the phone'), {
    memory: through(first.memory, doors)
  })
  assert.equal(out.error?.code, 'redo_failed')
  assert.equal(out.record.state.touched, true)
  assert.equal(first.builds.unfinishedRun?.runId, 'run-larkspur-2')
})
