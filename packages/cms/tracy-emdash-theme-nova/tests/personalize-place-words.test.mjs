// The place-word guard at template level (last code review of D-K14, JA Diner D-K17): the demo's place words come from this
// template's fixed demo address, so they are checked here, on the template's real seed and content map, with the tool's own
// derivation (`placeWordConflicts` → `demoPlaceWordsOf`). The check fails when a one-word place is also used as an ordinary
// word in the template's copy: a capitalised word that starts a sentence or a label ("View our menu", a button "View").
// The tool refuses such a word at run time too; this check makes a new template's author change the demo address or the
// copy instead of relying on that. In the kit (no `seed/` beside the scripts) it reads the fixtures that carry a map.
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const FIXTURES = path.join(ROOT, 'tests', 'fixtures')
const seedDirs = existsSync(path.join(ROOT, 'seed', 'seed.json'))
  ? [path.join(ROOT, 'seed')]
  : existsSync(FIXTURES)
    ? readdirSync(FIXTURES)
        .map((d) => path.join(FIXTURES, d, 'seed'))
        .filter((d) => existsSync(path.join(d, 'seed.json')) && existsSync(path.join(d, 'personalize.json')))
    : []

for (const dir of seedDirs) {
  test(`the demo's one-word places are never ordinary words of this template's copy (${path.relative(ROOT, dir)})`, async () => {
    const { placeWordConflicts } = await import('../tools/personalize.mjs')
    const seed = JSON.parse(readFileSync(path.join(dir, 'seed.json'), 'utf8'))
    const map = JSON.parse(readFileSync(path.join(dir, 'personalize.json'), 'utf8'))
    const entries = Object.entries(seed.content ?? {}).flatMap(([collection, rows]) =>
      rows.map((e) => ({ collection, slug: e.slug, locale: e.locale ?? 'en', data: e.data }))
    )
    assert.deepEqual(placeWordConflicts(map, entries), [])
  })
}

test('the template-level place-word check has a seed to read', {
  skip:
    seedDirs.length > 0
      ? false
      : 'no seed with a content map here (the kit has its own fixture case in personalize-demo-street.test.mjs)'
}, () => {
  assert.ok(seedDirs.length > 0)
})
