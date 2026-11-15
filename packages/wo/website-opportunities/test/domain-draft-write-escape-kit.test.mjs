// The kind of each place of a draft write, read from the kit's own escapes declaration (ticket #597,
// `draft-write-escape-place.mjs`): `mapping.escapes.places` read with `escapeOf(mapping, placeOf(mapping, loc))`. Block
// 177's info keys, escaped by the template, were escaped twice while a key list of the write step matched the last
// step of their JSON path (the item index); now each `escaped` value gives one kind, and a place with no entry takes
// the strict guard. The invented florist on the real JA Boxing kit.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-draft-write-escape-kit.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { safetyAt, safeValue, unsafeAt } from '../domain/draft-write-escape.mjs'
import { kit, plan } from './fixtures/draft-write/guarded.mjs'

const HOSTILE = `Tom's "best" & co`
const mapping = kit.mapping
const kindOf = (match) => {
  for (const op of plan.ops)
    for (const v of op.values ?? []) if (match(op, v)) return safetyAt(op, v.loc, { mapping }).kind
  throw new Error('no value matches')
}

test('each place takes its kind from the kit escapes declaration', () => {
  // escaped false: a JA ACM data key raw, a piece to the DOM, an HTML column as HTML, an article attribs key raw.
  assert.equal(
    kindOf((_, v) => v.loc.nestedJson === 'jatools-config' && !v.loc.xpath),
    'raw'
  )
  assert.equal(
    kindOf((_, v) => Boolean(v.loc.xpath)),
    'piece'
  )
  assert.equal(
    kindOf((op, v) => op.kind === 'contract.apply' && v.loc.column === 'value'),
    'raw'
  )
  assert.equal(
    kindOf((op, v) => op.kind === 'article.create' && v.loc.column === 'attribs' && !v.loc.xpath),
    'raw'
  )
  // A module title is stored as the character, never a reference (measured): written neutral.
  assert.equal(
    kindOf((op, v) => op.kind === 'module.copy' && v.loc.column === 'title'),
    'neutral'
  )
  // escaped true: written as plain words; "mixed": the strict guard.
  assert.equal(
    kindOf((op, v) => op.kind === 'article.create' && v.loc.column === 'metadesc'),
    'plain'
  )
  assert.equal(
    kindOf((op, v) => op.kind === 'contact.create' && v.loc.column === 'name'),
    'plain'
  )
  assert.equal(
    kindOf((op, v) => op.kind === 'article.create' && v.loc.column === 'title'),
    'neutral'
  )
  assert.equal(
    kindOf((op) => op.kind === 'site.identity'),
    'neutral'
  )
  assert.equal(
    kindOf((_, v) => v.loc.jsonPath?.at(-2) === 'social-intro[font-icon]'),
    'token'
  )
  assert.equal(
    safetyAt({ kind: 'article.create' }, { entity: 'article-16', column: 'introtext' }, { mapping }).kind,
    'html'
  )
  // A created category title prints nowhere; a menu item title of the main menu is plain with every mark unsafe.
  const created = (kind, column, fields = {}) =>
    safetyAt({ kind: `${kind}.create`, recordKind: kind, fields }, { column, entity: kind }, { mapping })
  assert.equal(created('category', 'title').kind, 'free')
  const main = created('menuItem', 'title', { menutype: plan.mainMenu })
  assert.equal(main.kind, 'plain')
  assert.deepEqual([...main.marks].sort(), ['"', '&', "'", '<', '>', 'reference'].sort())
  // No declaration, or no entry: the strict guard, never a guess.
  assert.equal(
    safetyAt(
      { kind: 'module.copy' },
      { entity: 'module-1', column: 'params', nestedJson: 'jatools-config', jsonPath: ['x'] }
    ).kind,
    'neutral'
  )
  assert.equal(created('tag', 'title').kind, 'unwritten')
})

test('block 177 info keys: the template escapes them, so the write sends plain words, never escaped twice', () => {
  // The JSON path ends with the item index: the key is the last name of the path, not its last step.
  for (const key of ['info-email-label', 'info-email', 'info-phone-label', 'info-phone', 'info-note']) {
    const loc = {
      entity: 'module-177',
      column: 'params',
      nestedJson: 'jatools-config',
      jsonPath: ['features-intro', `features-intro[${key}]`, 0]
    }
    const how = safetyAt({ kind: 'module.copy' }, loc, { mapping })
    assert.equal(how.kind, 'plain', key)
    assert.deepEqual([...how.marks], ['(('], key)
    assert.equal(safeValue(HOSTILE, how), HOSTILE, key)
    assert.equal(unsafeAt(HOSTILE, how), null, key)
    // A text that reads as a reference is refused: escaped, it would show as written, not as the sign.
    assert.equal(unsafeAt('&copy 2026', how), 'unsafe_mark', key)
  }
})
