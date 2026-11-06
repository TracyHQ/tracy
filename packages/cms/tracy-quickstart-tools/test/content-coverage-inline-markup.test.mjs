/**
 * Inline markup of content map samples against a demo database dump (`content-coverage/lib/inline-markup.mjs`,
 * `resample.mjs`): a whole-unit title captured as words only gets its `((br/))` and `((span))` back, nothing else of
 * the slot moves, and `inlineMarkupLost` counts what is still lost. Fabricated studio, fabricated dump.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { buildCoverageFile } from '../content-coverage/lib/coverage-file.mjs'
import { inlineMarkupOf } from '../content-coverage/lib/inline-markup.mjs'
import { normText } from '../content-coverage/lib/normalize.mjs'
import { readDump } from '../content-coverage/lib/sql-dump.mjs'

const RESAMPLE = fileURLToPath(new URL('../content-coverage/resample.mjs', import.meta.url))
// unit-markup.php runs under `php`: fail on CI, skip with the reason on a laptop (as capture-contract.test.mjs does).
const needsPhp = {
  skip:
    spawnSync('php', ['-v']).status === 0
      ? false
      : process.env.CI
        ? assert.fail('unit-markup.php runs under `php`, and this CI host has none on PATH')
        : 'unit-markup.php runs under `php`, and this host has none on PATH'
}

const sqlString = (s) =>
  `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r/g, '\\r').replace(/\n/g, '\\n')}'`
const params = (o) => sqlString(JSON.stringify(o))
const ACM = JSON.stringify({
  ':type': 'tpl:hero',
  hero: { 'hero[title]': ['((span))TOP((/span)) Harbour Yard'] }
})

// Module 31 is rewritten by an UPDATE after its INSERT, as an installer's appended demo fixes do.
const DUMP = `CREATE TABLE \`#__modules\` (
  \`id\` int NOT NULL,
  \`title\` varchar(100) NOT NULL,
  \`params\` text NOT NULL
);
CREATE TABLE \`#__content\` (
  \`id\` int NOT NULL,
  \`introtext\` text NOT NULL
);
INSERT INTO \`#__modules\` VALUES (30,'Classes',${params({ 'main-section': 'Our<br>\r\n<span>Classes</span>' })}),(31,'Gift',${params({ 'main-section': 'Gift card' })}),(32,'Hero',${params({ 'jatools-config': ACM })});
INSERT INTO \`#__content\` VALUES (5,'<h2>Strong <span class="accent">arms</span><br>calm minds</h2><p>Plain words</p>');
UPDATE \`#__modules\` SET \`params\` = ${params({ 'main-section': 'Gift<br><span>card</span>' })} WHERE \`id\` = 31 AND \`title\` = 'Gift';
`

const MAP = {
  entities: [
    { key: 'module-30', kind: 'module', sourceId: 30 },
    { key: 'module-31', kind: 'module', sourceId: 31 },
    { key: 'module-32', kind: 'module', sourceId: 32 },
    { key: 'article-5', kind: 'article', sourceId: 5 }
  ],
  slots: [
    {
      key: 'module-30.0',
      entity: 'module-30',
      column: 'params',
      type: 'text',
      sample: 'Our Classes',
      maxCharacters: 42,
      jsonPath: ['main-section'],
      xpath: '/html/body/div',
      role: 'editorial.heading'
    },
    {
      key: 'module-31.0',
      entity: 'module-31',
      column: 'params',
      type: 'text',
      sample: 'Gift card',
      maxCharacters: 40,
      jsonPath: ['main-section'],
      xpath: '/html/body/div',
      role: 'editorial.heading',
      group: { id: 'module-31.business', item: 0, kind: 'business' }
    },
    {
      key: 'module-32.0',
      entity: 'module-32',
      column: 'params',
      type: 'text',
      sample: '((span))TOP((/span)) Harbour Yard',
      jsonPath: ['hero', 'hero[title]', 0],
      nestedJson: 'jatools-config'
    },
    {
      key: 'article-5.0',
      entity: 'article-5',
      column: 'introtext',
      type: 'text',
      sample: 'Strong arms calm minds',
      xpath: '/html/body/div/h2'
    },
    {
      key: 'article-5.1',
      entity: 'article-5',
      column: 'introtext',
      type: 'text',
      sample: 'Plain words',
      xpath: '/html/body/div/p/text()'
    }
  ]
}

function dumpFile() {
  const dir = mkdtempSync(path.join(tmpdir(), 'inline-markup-'))
  writeFileSync(path.join(dir, 'custom.sql'), DUMP)
  return { dir, file: path.join(dir, 'custom.sql') }
}

test('the dump reader applies the UPDATE and DELETE fixes an installer appends, when asked', () => {
  const { file } = dumpFile()
  const plain = readDump(file)
  const gift = (d) => JSON.parse(d.tables.get('#__modules').find((r) => r.id === '31').params)['main-section']
  assert.equal(gift(plain), 'Gift card', 'without changes the INSERT stands')
  const fixed = readDump(file, { changes: true })
  assert.deepEqual(fixed.changes, { applied: 1, skipped: [] })
  assert.equal(gift(fixed), 'Gift<br><span>card</span>')
})

test('normText reads a ((br/)) as a space, as the template prints a line break', () => {
  assert.equal(normText('Our((br/)) ((span))Classes((/span))'), 'our classes')
  assert.equal(normText('PRIVATE((br/))\nTRAINING'), 'private training')
})

test(
  'a whole-unit sample gets its markup back; the rest of the slot and every other slot stay',
  needsPhp,
  () => {
    const { file } = dumpFile()
    const map = structuredClone(MAP)
    const { tables } = readDump(file, { changes: true })
    const r = inlineMarkupOf({ map, tables, write: true })
    assert.deepEqual(r.lostBefore, ['module-30.0', 'module-31.0', 'article-5.0'])
    assert.deepEqual(r.resampled, ['module-30.0', 'module-31.0', 'article-5.0'])
    assert.deepEqual(r.lost, [])
    assert.deepEqual(r.mismatched, [])
    const sample = (key) => map.slots.find((s) => s.key === key).sample
    assert.equal(sample('module-30.0'), 'Our((br/)) ((span))Classes((/span))')
    assert.equal(sample('module-31.0'), 'Gift((br/))((span))card((/span))')
    assert.equal(sample('article-5.0'), 'Strong ((span class="accent"))arms((/span))((br/))calm minds')
    // Only samples moved: dropping them leaves the map as it was.
    const withoutSamples = (m) => m.slots.map(({ sample: _s, ...rest }) => rest)
    assert.deepEqual(withoutSamples(map), withoutSamples(MAP))
    assert.equal(sample('module-32.0'), MAP.slots[2].sample)
    assert.equal(sample('article-5.1'), 'Plain words')
  }
)

test('a stored value that is not the slot words is named and never written', needsPhp, () => {
  const { file } = dumpFile()
  const map = structuredClone(MAP)
  map.slots[0].sample = 'Our Trainers'
  const r = inlineMarkupOf({ map, tables: readDump(file, { changes: true }).tables, write: true })
  assert.deepEqual(r.mismatched, ['module-30.0'])
  assert.equal(map.slots[0].sample, 'Our Trainers')
  assert.ok(r.lost.includes('module-30.0'), 'still counted as lost')
})

test('resample.mjs --write rewrites samples only and keeps a current coverage file current', needsPhp, () => {
  const { dir, file } = dumpFile()
  const mapText = `${JSON.stringify(MAP, null, 2)}\n`
  writeFileSync(path.join(dir, 'content-map.json'), mapText)
  const sha = (s) => createHash('sha256').update(s).digest('hex')
  const coverage = {
    schemaVersion: 'x',
    contract: { id: 'ja-test/j6/1.0.0', contentMapSha256: sha(mapText) }
  }
  writeFileSync(path.join(dir, 'content-coverage.json'), JSON.stringify(coverage))
  const dry = spawnSync(process.execPath, [RESAMPLE, '--contract', dir, '--db-dump', file], {
    encoding: 'utf8'
  })
  assert.equal(dry.status, 1, 'three slots lose their markup')
  assert.equal(JSON.parse(dry.stdout).inlineMarkupLost, 3)
  assert.equal(readFileSync(path.join(dir, 'content-map.json'), 'utf8'), mapText, 'a dry run writes nothing')
  const run = spawnSync(process.execPath, [RESAMPLE, '--contract', dir, '--db-dump', file, '--write'], {
    encoding: 'utf8'
  })
  assert.equal(run.status, 0, run.stderr)
  assert.deepEqual(
    { resampled: JSON.parse(run.stdout).resampled, lost: JSON.parse(run.stdout).inlineMarkupLost },
    { resampled: 3, lost: 0 }
  )
  const written = readFileSync(path.join(dir, 'content-map.json'), 'utf8')
  const doc = JSON.parse(readFileSync(path.join(dir, 'content-coverage.json'), 'utf8'))
  assert.equal(doc.contract.contentMapSha256, sha(written))
  assert.equal(doc.inlineMarkup.restampedFrom, sha(mapText))
  assert.equal(doc.inlineMarkup.lost, 0)
  assert.equal(doc.inlineMarkup.dump.file, 'custom.sql')
})

test('a new audit carries the inlineMarkup block while the content map is the one it measured', () => {
  const result = { pages: [], failures: [], summary: { pages: 0, mappedPages: 0, unmappedPages: 0 } }
  const contract = {
    manifest: { id: 'ja-test/j6/1.0.0' },
    sha256: { contentMap: 'a'.repeat(64), presentationLock: 'b'.repeat(64) },
    map: { entities: [], slots: [], pages: [] },
    pages: []
  }
  const block = { lost: 0, lostSlots: [] }
  const previous = { contract: { contentMapSha256: 'a'.repeat(64) }, inlineMarkup: block }
  assert.deepEqual(buildCoverageFile({ result, contract, previous }).inlineMarkup, block)
  const other = { ...previous, contract: { contentMapSha256: 'c'.repeat(64) } }
  assert.equal(buildCoverageFile({ result, contract, previous: other }).inlineMarkup, undefined)
  const fresh = { lost: 2, lostSlots: ['x.0', 'y.0'] }
  assert.deepEqual(buildCoverageFile({ result, contract, previous, inlineMarkup: fresh }).inlineMarkup, fresh)
})

test(
  'a slot of a demo-only entity is not measured: the kit leaves its page out, so no customer sees its markup',
  needsPhp,
  () => {
    // A template showcase article (a typography sheet) is marked demoOnly at capture, and the kit excludes its page.
    // Its stored value marks words inline while its sample does not; counting it held the kit for a page no site keeps.
    const { file } = dumpFile()
    const map = structuredClone(MAP)
    map.entities = map.entities.map((e) => (e.key === 'article-5' ? { ...e, demoOnly: true } : e))
    const { tables } = readDump(file, { changes: true })
    const r = inlineMarkupOf({ map, tables })
    assert.equal(r.lost.includes('article-5.0'), false, JSON.stringify(r.lost))
    assert.equal(r.lostBefore.includes('article-5.0'), false)
    assert.equal(r.mismatched.includes('article-5.0'), false)
    assert.ok(r.lost.includes('module-30.0'), 'a slot of a kept entity is still counted')
  }
)
