// The escapes declaration of the mapping file (`ai-quickstart-escapes.mjs`), on the invented fixture: every place
// the build writes takes exactly one entry, every entry is taken, each entry says how its places print, and the
// build reads a place's entry with escapeOf. The last case reads the JA Boxing kit.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { checkAiQuickstartContract } from '../domain/ai-quickstart-contract.mjs'
import { escapeOf, escapesProblems, MIXED_UNSAFE } from '../domain/ai-quickstart-escapes.mjs'
import { placeOf, writtenPlacesOf } from '../domain/ai-quickstart-escapes-places.mjs'

const read = (name) =>
  JSON.parse(readFileSync(new URL(`./fixtures/ai-quickstart/${name}`, import.meta.url), 'utf8'))
const VALID = {
  blockStore: read('block-store.json'),
  pageRecipes: read('page-recipes.json'),
  mapping: read('mapping.json')
}
const valid = () => structuredClone(VALID)
const problemsOf = (set) => checkAiQuickstartContract(set).problems.map((p) => `${p.at}: ${p.message}`)
const escapeProblemsOf = (mapping) => {
  const out = []
  escapesProblems(mapping, (at, message) => out.push(`${at}: ${message}`))
  return out
}
const entryOf = (mapping, match) =>
  mapping.escapes.places.find((e) => JSON.stringify(e.match) === JSON.stringify(match))

test('the invented fixture declares every place it writes, and passes', () => {
  const set = valid()
  assert.deepEqual(escapeProblemsOf(set.mapping), [])
  assert.deepEqual(problemsOf(set), [])
})

test('a mapping file without escapes fails', () => {
  const set = valid()
  delete set.mapping.escapes
  assert.deepEqual(problemsOf(set), [
    'escapes: declare how every place the build writes is escaped where it prints: escapes'
  ])
})

test('a place no entry matches fails at the location that writes it', () => {
  const set = valid()
  set.mapping.escapes.places = set.mapping.escapes.places.filter((e) => e.match.kind !== 'languageString')
  assert.deepEqual(escapeProblemsOf(set.mapping), [
    'overrides.language[0]: no escapes entry matches the place {"kind":"languageString","column":"value","key":"TPL_EXAMPLE_READ_MORE"}: declare how it prints'
  ])
})

test('an entry no place takes fails, and so do two entries that match one place alike', () => {
  const set = valid()
  set.mapping.escapes.places.push({
    match: { kind: 'contact', column: 'address' },
    escaped: false,
    source: 'measured',
    why: 'invented'
  })
  assert.deepEqual(escapeProblemsOf(set.mapping), [
    `escapes.places[${set.mapping.escapes.places.length - 1}]: no place the build writes takes this entry`
  ])
  set.mapping.escapes.places.pop()
  set.mapping.escapes.places.push({
    match: { kind: 'module', column: 'params', key: 'sticky' },
    escaped: 'not-text',
    source: 'decision',
    why: 'invented: a second entry'
  })
  const problems = escapeProblemsOf(set.mapping).join('\n')
  assert.match(problems, /two entries match the same places/)
  assert.match(problems, /blocks\[header-main\]\.fields\.sticky: escapes entries \d+ and \d+ match/)
})

test('an entry says how its places print: escaped, unsafe, source and why', () => {
  const set = valid()
  const sitename = entryOf(set.mapping, { kind: 'globalConfiguration', column: 'sitename' })
  sitename.unsafe = ['"', '<']
  const metadesc = entryOf(set.mapping, { kind: 'globalConfiguration', column: 'MetaDesc' })
  delete metadesc.unsafe
  const strings = entryOf(set.mapping, { kind: 'languageString', column: 'value' })
  strings.unsafe = ['&']
  strings.source = 'guessed'
  const content = entryOf(set.mapping, { kind: 'module', column: 'content' })
  content.escaped = 'maybe'
  content.why = ''
  content.match.where = 'footer'
  const problems = escapeProblemsOf(set.mapping)
  for (const m of MIXED_UNSAFE.filter((m) => !sitename.unsafe.includes(m)))
    assert.ok(
      problems.includes(
        `escapes.places[0].unsafe: a mixed place cannot show ${m} as written both raw and escaped: list it`
      )
    )
  const joined = problems.join('\n')
  assert.match(
    joined,
    /escapes\.places\[1\]\.unsafe: an escaped or mixed place lists what it does not show as written/
  )
  assert.match(
    joined,
    /escapes\.places\[3\]\.unsafe: a place printed raw shows every character once the build escapes it/
  )
  assert.match(joined, /escapes\.places\[3\]\.source: source is one of measured, template-source, decision/)
  assert.match(joined, /escapes\.places\[\d+\]\.escaped: escaped is one of true, false, "mixed"/)
  assert.match(joined, /escapes\.places\[\d+\]\.match\.where: a match key is one of kind, column/)
  assert.match(joined, /escapes\.places\[\d+\]\.why: say why/)
})

test('the legacy reference rule and the why of the declaration are required', () => {
  const set = valid()
  delete set.mapping.escapes.legacyReferences
  set.mapping.escapes.why = ''
  assert.deepEqual(escapeProblemsOf(set.mapping), [
    'escapes.why: say how the escaping was measured',
    'escapes.legacyReferences: declare the rule for a legacy reference without its semicolon: {rule, why}'
  ])
})

test('escapeOf gives the entry with the most matching keys, or null', () => {
  const { mapping } = valid()
  const sticky = { entity: 'module-11', column: 'params', jsonPath: ['sticky'] }
  const label = { entity: 'module-11', column: 'params', jsonPath: ['button-text'] }
  assert.equal(escapeOf(mapping, placeOf(mapping, sticky)).escaped, 'not-text')
  assert.equal(escapeOf(mapping, placeOf(mapping, label)).escaped, false)
  assert.equal(escapeOf(mapping, { kind: 'contact', column: 'address' }), null)
})

test('a place takes the last name of its JSON path, never a list index', () => {
  const { mapping } = valid()
  const loc = {
    entity: 'module-11',
    column: 'params',
    nestedJson: 'config',
    jsonPath: ['intro', 'intro[phone]', 0]
  }
  assert.deepEqual(placeOf(mapping, loc), {
    kind: 'module',
    column: 'params',
    nestedJson: 'config',
    key: 'intro[phone]',
    block: 'header-main'
  })
})

test('JA Boxing: every place the kit writes takes one entry, and the template escaped keys are found', () => {
  const kit = new URL(
    '../../../cms/tracy-joomla-quickstart/ai-quickstarts/ja-boxing/j6/1.0.11/mapping.json',
    import.meta.url
  )
  const mapping = JSON.parse(readFileSync(kit, 'utf8'))
  assert.deepEqual(escapeProblemsOf(mapping), [])
  assert.ok(writtenPlacesOf(mapping).length > 100)
  const phone = mapping.facts.phone.find((l) => l.entity === 'module-177')
  const entry = escapeOf(mapping, placeOf(mapping, phone))
  assert.equal(entry.escaped, true)
  assert.deepEqual(entry.unsafe, ['(('])
  const attribs = {
    entity: mapping.blocks['class-detail'].fields['heading-2'].entity,
    column: 'attribs',
    jsonPath: ['ft-title']
  }
  assert.equal(escapeOf(mapping, placeOf(mapping, attribs)).escaped, false)
})
