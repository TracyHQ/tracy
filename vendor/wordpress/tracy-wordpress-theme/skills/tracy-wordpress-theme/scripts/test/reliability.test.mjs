// Ported from joomlart-t4-template@1.0.0-tracy.5 scripts/test/reliability.test.mjs — WordPress changes: the Joomla-only cases (clear-cache, Sass, reconcile, preflight, setup-demo-content) are gone; the checkpoint case walks the WordPress phase list; the hook names are data-theme and a custom attribute rather than data-bs-theme.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { diffSnapshots } from '../verify-render.mjs'
import { checkpoint, PHASES, PHASE_NAMES } from '../checkpoint.mjs'
import { resultStatus, validateConfig } from '../review/runtime.mjs'
const dir = mkdtempSync(join(tmpdir(), 'wp-reliability-'))
test.after(() => rmSync(dir, { recursive: true, force: true }))
test('render gate rejects empty, malformed and missing required measurements', () => {
  for (const v of [{}, null, [], { body: {} }, { body: null }, { body: { color: undefined } }])
    assert.throws(() => diffSnapshots(v, v))
  assert.throws(() =>
    diffSnapshots(
      { body: { color: '#fff' } },
      { body: { color: '#fff' } },
      { required: { body: ['fontSize'] } }
    )
  )
  assert.equal(
    diffSnapshots({ body: { color: 'rgba(0, 0, 0, 0)' } }, { body: { color: 'rgba(0, 0, 0, 1)' } }).mismatches
      .length,
    1
  )
  assert.throws(() =>
    diffSnapshots({ body: { color: '#fff' } }, { body: { color: '#fff' } }, { hexTolerance: NaN })
  )
})
test('checkpoint detects changed evidence and invalidates downstream completion', () => {
  const file = join(dir, 'state.json'),
    evidence = join(dir, 'input.txt')
  writeFileSync(evidence, 'first')
  checkpoint(file, 'init', ['edit', 'brief', 'test-only-target'])
  assert.throws(() => checkpoint(file, 'complete', ['6', evidence]), /earlier/)
  checkpoint(file, 'complete', ['1', evidence])
  assert.equal(checkpoint(file, 'status', []).next, '2')
  writeFileSync(evidence, 'changed')
  assert.equal(checkpoint(file, 'status', []).next, '1')
  assert.throws(() => checkpoint(file, 'init', ['edit', 'brief', 'target']), /exists/)
})
test('checkpoint phases are the WordPress build, in order, each with a name', () => {
  assert.deepEqual(PHASES, ['0', '1', '2', '3', '4', '5', '6', '6b', '7', '7b', '8', '8b', '9', '10'])
  assert.equal(PHASE_NAMES['7b'], 'i18n')
  assert.equal(PHASE_NAMES['4'], 'theme-json')
  assert.equal(PHASE_NAMES['5'], 'templates-patterns')
  assert.equal(PHASE_NAMES['10'], 'quickstart')
  const file = join(dir, 'template.json')
  const state = checkpoint(file, 'init', ['template', 'brief', 'target'])
  assert.deepEqual(
    state.phases.map((p) => p.phase),
    PHASES
  )
  assert.equal(state.phases[0].name, 'provision')
  assert.equal(state.next, '0')
  assert.throws(
    () => checkpoint(join(dir, 'bad.json'), 'init', ['website', 'brief', 'target', '2,1,8,8b']),
    /ordered/
  )
  assert.throws(
    () => checkpoint(join(dir, 'bad2.json'), 'init', ['edit', 'brief', 'target', '1,2,intake,8,8b']),
    /ordered/
  )
})
test('review distinguishes failure, unresolved findings and verified pass', () => {
  assert.equal(resultStatus({ examined: 0 }), 'fail')
  assert.equal(resultStatus({ examined: 20, findings: ['border'] }), 'needs-review')
  assert.equal(resultStatus({ examined: 20, verified: false }), 'needs-review')
  assert.equal(resultStatus({ examined: 20 }), 'pass')
  for (const name of ['data-theme', 'data-mode'])
    validateConfig({
      hook: { type: 'attribute', name },
      toggle: '.toggle',
      persistence: { type: 'cookie', key: 'theme' },
      expectedSelectors: ['main']
    })
  validateConfig({
    hook: { type: 'class', name: 'is-dark' },
    toggle: '.toggle',
    persistence: { type: 'localStorage', key: 'theme' },
    expectedSelectors: ['main']
  })
  assert.throws(
    () =>
      validateConfig({
        hook: { type: 'media', name: 'dark' },
        toggle: '.toggle',
        persistence: { type: 'cookie', key: 'theme' },
        expectedSelectors: ['main']
      }),
    /class\|attribute/
  )
})
