// What the build store keeps of a held person after a hold revision (#599): the new build's profile is read without
// what it holds (the held quote and its author gone), the builds before it, reachable only through a restore that is
// now refused, are forgotten (`builds.forget`: the ref and the reason only), and the hold list itself is the one place
// left that names the person (it enforces the hold). Every form of the name is searched in the whole store.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/draft-revision-held-store.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { textsNamedIn, withShortForms } from 'website-opportunities/domain/revision-text-forms.mjs'
import { HELD_PERSON, revisedBy } from './draft-revision-edits.mjs'
import { firstBuild, restoreOf, revisionRun } from './draft-revision-run.mjs'

/** Every path of a value whose leaf or key names one of `forms`. */
function namedAt(value, forms, path = '', out = []) {
  if (typeof value === 'string') {
    if (textsNamedIn(value, forms).length) out.push(path)
  } else if (Array.isArray(value)) value.forEach((v, i) => namedAt(v, forms, `${path}[${i}]`, out))
  else if (value && typeof value === 'object')
    for (const [k, v] of Object.entries(value)) {
      if (textsNamedIn(k, forms).length) out.push(`${path}{key}`)
      namedAt(v, forms, `${path}.${k}`, out)
    }
  return out
}

test('after a hold revision only the hold list names the held person in the build store', async () => {
  const first = await firstBuild()
  const forms = withShortForms([HELD_PERSON])
  assert.ok(namedAt([...first.builds.values()], forms).length > 0, 'the first build names her')
  const rev = await revisionRun(first, revisedBy('hold a reviewer'))
  assert.equal(rev.error, undefined, rev.error?.code)
  const ref = rev.run.write.build.ref
  assert.deepEqual([...first.builds.forgotten], [[first.ref, 'restore_shows_held_text']])
  assert.deepEqual([...first.builds.keys()], [ref])
  assert.deepEqual(namedAt(Object.fromEntries(first.builds), forms), [`.${ref}.profile.withheld.people[0]`])
  // The kept build still enforces the hold: its restore stays refused, and a later revision runs from it.
  const restore = await restoreOf(first, first.builds.get(ref)).catch((e) => e)
  assert.equal(restore.code, 'restore_shows_held_text')
  const next = await revisionRun(first, revisedBy('change the phone'), { runId: 'run-larkspur-3', from: ref })
  assert.equal(next.error, undefined, next.error?.code)
})
