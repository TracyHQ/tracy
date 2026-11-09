/**
 * The card's own research gates what Details shows and when a Content brief can be made (#524): the brief button is
 * locked with a short reason until research is done, a running brief job shows its step, a failed one its reason with
 * Try again, and source rows say when their data was collected. The business is made up.
 *
 *   node --test packages/site/tracy-website-opportunities/test/client-research-gate.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  briefControlView,
  briefLineKey,
  collectedLine,
  researchOf
} from '../src/client/research-gate-model.ts'
import { en } from '../src/client/strings.ts'

const t = (key, params = {}) => {
  const text = en[key]
  if (text === undefined) throw new Error(`missing string ${key}`)
  return text.replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? `{${name}}`))
}

test('research reads the card state, and an old server without it reads as done', () => {
  assert.deepEqual(researchOf({ research: { state: 'not_started', researchedAt: null } }), {
    state: 'not_started',
    researchedAt: null,
    done: false
  })
  assert.equal(
    researchOf({ research: { state: 'running', researchedAt: '2026-11-09T11:22:00Z' } }).done,
    true
  )
  assert.equal(researchOf({}).done, true, 'a host not rebuilt yet keeps today’s behaviour')
})

test('the brief button is locked with a plain reason until research is done', () => {
  for (const state of ['not_started', 'running', 'failed']) {
    const view = briefControlView({ research: { state, researchedAt: null }, brief: null, briefJob: null })
    assert.equal(view.mode, 'locked', state)
    assert.equal(t(view.reasonKey), 'Available after research finishes.')
  }
  const open = briefControlView({
    research: { state: 'done', researchedAt: '2026-11-09T11:22:00Z' },
    brief: null
  })
  assert.equal(open.mode, 'make')
  assert.equal(t(open.labelKey), 'Make content brief')
})

test('a current brief needs no button; a stale one offers Refresh', () => {
  const research = { state: 'done', researchedAt: '2026-11-09T11:22:00Z' }
  assert.equal(briefControlView({ research, brief: { id: 'b', n: 2, current: true } }).mode, 'none')
  const stale = briefControlView({ research, brief: { id: 'b', n: 2, current: false } })
  assert.equal(stale.mode, 'make')
  assert.equal(t(stale.labelKey), 'Refresh')
})

test('a brief of an older reading points to Research again, and offers Refresh only when the research moved on', () => {
  const research = { state: 'done', researchedAt: '2026-11-09T11:22:00Z' }
  const note =
    'This brief was made from an older reading of the business. Research again to read the business with the latest rules.'
  const same = briefControlView({
    research,
    brief: { id: 'b', n: 2, current: false, readingOld: true, sameResearch: true }
  })
  assert.equal(same.mode, 'note', 'a new brief of the same reading would be the same brief')
  assert.equal(same.labelKey, null)
  assert.equal(t(same.noteKey), note)
  const older = briefControlView({ research, brief: { id: 'b', n: 2, current: false, readingOld: true } })
  assert.equal(older.mode, 'note', 'a host that does not say sameResearch gets no Refresh for this case')
  const moved = briefControlView({
    research,
    brief: { id: 'b', n: 2, current: false, readingOld: true, sameResearch: false }
  })
  assert.equal(moved.mode, 'make')
  assert.equal(t(moved.labelKey), 'Refresh')
  assert.equal(t(moved.noteKey), note)
})

test('a running brief job shows its step; a failed one its plain reason with Try again', () => {
  const research = { state: 'done', researchedAt: '2026-11-09T11:22:00Z' }
  const running = briefControlView({
    research,
    brief: null,
    briefJob: { id: 'j', state: 'running', step: 'labelling' }
  })
  assert.equal(running.mode, 'running')
  assert.deepEqual(
    running.steps.map((s) => [t(s.labelKey), s.state]),
    [
      ['Reading the business', 'done'],
      ['Labelling photos', 'running'],
      ['Writing the brief', 'waiting']
    ]
  )
  const failed = briefControlView({
    research,
    brief: null,
    briefJob: { id: 'j', state: 'failed', error: { code: 'BRIEF_INTERRUPTED' } }
  })
  assert.equal(failed.mode, 'failed')
  assert.equal(t(failed.errorKey), 'The brief stopped before it was finished. Try again.')
  assert.equal(t(failed.labelKey), 'Try again')
  const done = briefControlView({
    research,
    brief: { id: 'b', n: 1, current: true },
    briefJob: { state: 'done' }
  })
  assert.equal(done.mode, 'none', 'a settled job leaves the brief line to the brief')
})

test('a source row says when its data was collected, never when the job ended', () => {
  assert.equal(collectedLine(t, { collectedAt: '2026-10-26T09:00:00Z' }, 'en'), 'Collected Oct 26')
  assert.equal(collectedLine(t, { collectedAt: '2026-10-26T09:00:00Z' }, 'en-GB'), 'Collected 26 Oct')
  assert.equal(collectedLine(t, { collectedAt: null }, 'en'), null)
  assert.equal(collectedLine(t, {}, 'en'), null)
})

test('a Profile edit newer than the brief says so, and Refresh is offered even for an older reading', () => {
  const brief = {
    id: 'b',
    n: 3,
    createdAt: '2026-11-09T14:00:00Z',
    current: false,
    readingOld: true,
    sameResearch: false
  }
  assert.equal(briefLineKey(brief, '2026-11-09T15:00:00Z'), 'brief.staleEdits')
  assert.equal(briefLineKey(brief, '2026-11-09T13:00:00Z'), 'brief.stale')
  assert.equal(briefLineKey({ ...brief, current: true }, '2026-11-09T15:00:00Z'), 'brief.current')
  const view = briefControlView({
    research: { state: 'done' },
    brief,
    profileEditedAt: '2026-11-09T15:00:00Z'
  })
  assert.equal(view.mode, 'make')
  assert.equal(view.labelKey, 'brief.refresh')
  assert.equal(view.noteKey, null, 'no line about an older reading when the edit is the news')
  assert.match(en['brief.staleEdits'], /Profile edits are newer/)
})

test('a failed brief job names the step that stopped, never its raw code', () => {
  const view = briefControlView({
    research: { state: 'done' },
    brief: null,
    briefJob: { state: 'failed', step: 'writing', error: { code: 'SOME_PROVIDER_KEY_MISSING' } }
  })
  assert.equal(view.errorKey, 'brief.job.error.at.writing')
  assert.deepEqual(
    view.steps.map((s) => s.state),
    ['done', 'done', 'failed']
  )
  assert.doesNotMatch(en[view.errorKey], /[A-Z]{3,}_/)
})
