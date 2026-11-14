/**
 * The inline markup of a RELEASED contract lives beside its sealed content map (ADR 0044): `resample.mjs --sidecar`
 * writes the markup samples into content-coverage.json and never the map, and the kit takes a slot's sample from the
 * map first and from that sidecar second, so `cli.mjs samples` lists the marks and `inlineMarkupLost` counts only the
 * slots neither carries. Fabricated gym, fabricated dump.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { readContractSamples, withInlineMarkup } from '../template-kit/lib/contract-read.mjs'
import { slotShapeChecks } from '../template-kit/lib/slot-shape-checks.mjs'
import { settleSamples } from '../template-kit/lib/slot-samples.mjs'

const RESAMPLE = fileURLToPath(new URL('../content-coverage/resample.mjs', import.meta.url))
const needsPhp = {
  skip:
    spawnSync('php', ['-v']).status === 0
      ? false
      : process.env.CI
        ? assert.fail('unit-markup.php runs under `php`, and this CI host has none on PATH')
        : 'unit-markup.php runs under `php`, and this host has none on PATH'
}

const sqlString = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`
const params = (o) => sqlString(JSON.stringify(o))
// The reader finds the table prefix by the content table, so the dump has one row there.
const DUMP = `CREATE TABLE \`#__content\` (
  \`id\` int NOT NULL,
  \`introtext\` text NOT NULL
);
CREATE TABLE \`#__modules\` (
  \`id\` int NOT NULL,
  \`title\` varchar(100) NOT NULL,
  \`params\` text NOT NULL
);
INSERT INTO \`#__content\` VALUES (1,'<p>Open daily</p>');
INSERT INTO \`#__modules\` VALUES (40,'Coaches',${params({ 'main-section': 'Meet<br><span>Coaches</span>' })}),(41,'Plans',${params({ 'main-section': 'Our Plans' })});
`

const slot = (id, sample) => ({
  key: `module-${id}.0`,
  entity: `module-${id}`,
  column: 'params',
  type: 'text',
  sample,
  jsonPath: ['main-section'],
  xpath: '/html/body/div',
  role: 'editorial.heading'
})
const MAP = {
  entities: [
    { key: 'module-40', kind: 'module', sourceId: 40 },
    { key: 'module-41', kind: 'module', sourceId: 41 }
  ],
  slots: [slot(40, 'Meet Coaches'), slot(41, 'Our Plans')]
}
const MARKED = 'Meet((br/)) ((span))Coaches((/span))'

test('a sidecar sample is taken only when the map marks nothing and both read as the same words', () => {
  const coverage = {
    inlineMarkup: {
      samples: {
        'module-40.0': MARKED,
        'module-41.0': 'Our ((span))Prices((/span))'
      }
    }
  }
  const read = withInlineMarkup(MAP, coverage)
  assert.equal(read.slots[0].sample, MARKED, 'the sealed map lost the markup: the sidecar gives it')
  assert.equal(read.slots[1].sample, 'Our Plans', 'other words are another value, never taken')
  assert.equal(MAP.slots[0].sample, 'Meet Coaches', 'the map object is not changed')

  const marked = structuredClone(MAP)
  marked.slots[0].sample = 'Meet((br/))((span))Coaches((/span))'
  assert.equal(
    withInlineMarkup(marked, coverage).slots[0].sample,
    'Meet((br/))((span))Coaches((/span))',
    'the map first: a sample that marks words keeps its own markup'
  )
  assert.equal(withInlineMarkup(MAP, { inlineMarkup: { lost: 0 } }), MAP, 'no sidecar, the map as it is')
  assert.equal(withInlineMarkup(MAP, null), MAP)
})

test(
  'resample.mjs --sidecar keeps the sealed map byte for byte and carries the markup in the coverage file',
  needsPhp,
  () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'inline-sidecar-'))
    const dump = path.join(dir, 'custom.sql')
    writeFileSync(dump, DUMP)
    const mapText = `${JSON.stringify(MAP, null, 2)}\n`
    writeFileSync(path.join(dir, 'content-map.json'), mapText)
    writeFileSync(
      path.join(dir, 'content-coverage.json'),
      JSON.stringify({ contract: { contentMapSha256: 'x' } })
    )
    const run = spawnSync(
      process.execPath,
      [RESAMPLE, '--contract', dir, '--db-dump', dump, '--write', '--sidecar'],
      { encoding: 'utf8' }
    )
    assert.equal(run.status, 0, run.stderr)
    const out = JSON.parse(run.stdout)
    assert.deepEqual([out.inlineMarkupLostBefore, out.inlineMarkupLost], [1, 0])
    assert.equal(readFileSync(path.join(dir, 'content-map.json'), 'utf8'), mapText, 'the map is not written')
    const doc = JSON.parse(readFileSync(path.join(dir, 'content-coverage.json'), 'utf8'))
    assert.equal(doc.contract.contentMapSha256, 'x', 'nothing is restamped: the map did not change')
    assert.equal(doc.inlineMarkup.lost, 0)
    assert.deepEqual(Object.keys(doc.inlineMarkup.samples), ['module-40.0'])
    assert.match(doc.inlineMarkup.samples['module-40.0'], /\(\(br\/\)\).*\(\(span\)\)Coaches\(\(\/span\)\)/)
  }
)

test('cli samples reads the sidecar: the kit slot lists the marks, inlineMarkupLost counts what neither carries', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'inline-sidecar-kit-'))
  writeFileSync(path.join(dir, 'content-map.json'), JSON.stringify(MAP))
  const coverage = { inlineMarkup: { lost: 0, lostSlots: [], samples: { 'module-40.0': MARKED } } }
  writeFileSync(path.join(dir, 'content-coverage.json'), JSON.stringify(coverage))
  const kit = {
    blocks: [
      {
        id: 'block-40',
        slots: [{ id: 'block-40.0', type: 'text', role: 'editorial.heading', sample: 'Meet Coaches' }]
      }
    ]
  }
  const map = readContractSamples(dir)
  settleSamples(kit, { map })
  const s = kit.blocks[0].slots[0]
  assert.equal(s.sample, 'Meet Coaches', 'a kit sample is the plain demo text; its marks go to inline')
  assert.deepEqual(
    s.inline.map((m) => m.tag),
    ['br', 'span']
  )
  const counts = slotShapeChecks(kit, { map, contentCoverage: coverage })
  assert.deepEqual([counts.inlineMarkupLost, counts.inlineEmphasisMissing, counts.samplesCut], [0, 0, 0])
})

test('literal PRE: kit samples and format preserve one literal scalar without inline marks', async () => {
  const { sampleOf, formatOf, formatTextSlots } = await import('../template-kit/lib/text-format.mjs')
  const { demoLength } = await import('../template-kit/lib/slot-limits.mjs')
  const literal = '  SELECT <Widget>\n\tA &amp; B ((strong))Case((/strong))  '
  const source = {
    key: 'article-2.0',
    type: 'text',
    sample: literal,
    xpath: '/html/body/div/pre/code/text()',
    maxCharacters: 200
  }
  const wanted = {
    sample: literal,
    demoChars: { total: [...literal].length, lead: null, bullets: [] },
    inline: []
  }
  assert.deepEqual(sampleOf(literal, source), wanted)
  assert.deepEqual(formatOf(literal, {}, source), {
    paragraphs: 1,
    bullets: 0,
    formatFrom: 'content map',
    ...wanted
  })
  assert.equal(demoLength(literal, source), [...literal].length)
  const kit = { blocks: [{ id: 'body', slots: [{ id: 'article-2.0', type: 'text' }] }] }
  settleSamples(kit, { map: { slots: [source] } })
  assert.equal(kit.blocks[0].slots[0].sample, literal)
  formatTextSlots({ blocks: kit.blocks, slotOf: () => source, detailsOf: () => ({}) })
  assert.equal(kit.blocks[0].slots[0].paragraphs, 1)
  assert.equal(kit.blocks[0].slots[0].bullets, 0)
  assert.equal(kit.blocks[0].slots[0].demoChars.total, [...literal].length)
  assert.equal(sampleOf('<b>Ordinary</b>   prose').sample, 'Ordinary prose')
})

test('literal PRE: sidecar cannot replace literal text through prose equivalence', () => {
  const source = {
    key: 'article-2.0',
    type: 'text',
    sample: '  CASE &amp; value\n\t',
    xpath: '/html/body/div/pre/code/text()'
  }
  const map = { slots: [source] }
  const coverage = { inlineMarkup: { samples: { 'article-2.0': '((span))case((/span)) &amp; value' } } }
  assert.equal(withInlineMarkup(map, coverage).slots[0].sample, source.sample)
})
