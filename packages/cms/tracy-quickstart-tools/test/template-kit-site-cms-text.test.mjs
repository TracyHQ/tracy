// Template kit, site part: the sentences a CMS prints from its language files (fixed text and the site name line),
// the override that hides one, and the write path that may only touch the override folder. Made-up studio data.
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { siteWriter, writable } from '../template-kit/lib/site/adapters/site-writer.mjs'
import { siteSource } from '../template-kit/lib/site/adapters/source.mjs'
import {
  shortPattern,
  matchCmsStrings,
  parseIni,
  shownText,
  siteCmsTexts,
  stringPattern,
  withNameSource
} from '../template-kit/lib/site/cms-strings.mjs'
import { judgeHide, wholeWordCount, withEmptyOverride } from '../template-kit/lib/site/hide-cms-text.mjs'

const FOOTER_INI = [
  '; a comment',
  'MOD_FOOT="Foot"',
  'MOD_FOOT_LINE1="Copyright &#169; %date% %sitename%. Every right kept here."',
  'MOD_FOOT_LINE2="<a href=\\"https://cms.example\\">Example CMS</a> is free software under the <a href=\\"https://licence.example\\">Open Licence.</a>"',
  'COM_READ_MORE="Read more"'
].join('\n')

test('parseIni and shownText read a language file as the page shows it', () => {
  const rows = parseIni(FOOTER_INI)
  assert.deepEqual(
    rows.map((r) => r.constant),
    ['MOD_FOOT', 'MOD_FOOT_LINE1', 'MOD_FOOT_LINE2', 'COM_READ_MORE']
  )
  assert.equal(shownText(rows[2].value), 'Example CMS is free software under the Open Licence.')
  assert.equal(stringPattern('Read more'), null, 'short strings are too common to name a source')
  assert.ok(stringPattern(rows[1].value).test('copyright © 2031 bright gym. every right kept here.'))
})

test('matchCmsStrings splits the name line from fixed text and skips content slots', () => {
  const files = [{ file: 'language/xx-XX/mod_foot.ini', text: FOOTER_INI }]
  const lines = [
    {
      block: 'block-9',
      text: 'Copyright © 2031 Bright Gym. Every right kept here.',
      pageId: 'page-home',
      path: '/'
    },
    {
      block: 'block-9',
      text: 'Example CMS is free software under the Open Licence.',
      pageId: 'page-home',
      path: '/'
    },
    {
      block: 'block-9',
      text: 'Example CMS is free software under the Open Licence.',
      pageId: 'page-about',
      path: '/about'
    },
    {
      block: 'block-3',
      text: 'Example CMS is free software under the Open Licence.',
      pageId: 'page-home',
      path: '/'
    }
  ]
  const r = matchCmsStrings({
    lines,
    files,
    slotTexts: ['Example CMS is free software under the Open Licence.']
  })
  assert.equal(r.fixedTexts.length, 0, 'a sentence that is a content slot is content, not fixed text')
  const r2 = matchCmsStrings({ lines, files })
  assert.deepEqual(
    r2.fixedTexts.map((f) => [f.block, f.source.constant, f.pages]),
    [
      ['block-9', 'MOD_FOOT_LINE2', 2],
      ['block-3', 'MOD_FOOT_LINE2', 1]
    ]
  )
  assert.deepEqual(r2.fixedTexts[0].at, { path: '/', raw: 'block-9' })
  assert.equal(r2.nameLines.length, 1)
  assert.deepEqual(r2.nameLines[0].placeholders, ['%date%', '%sitename%'])
})

test('siteCmsTexts gives the name source to the printed name entry, and names a missing web root', () => {
  const reads = [
    {
      pageId: 'page-home',
      path: '/',
      slug: 'home',
      textLines: [{ block: 'module-9', text: 'Copyright © 2031 Bright Gym. Every right kept here.' }]
    }
  ]
  const cms = { files: [{ file: 'language/xx-XX/mod_foot.ini', text: FOOTER_INI }] }
  const r = siteCmsTexts({
    reads,
    idOf: (b) => b.replace('module-', 'block-'),
    cms,
    slotTexts: [],
    nameSetting: 'cms site name'
  })
  assert.equal(r.fixedTexts.length, 0)
  const printed = {
    kind: 'printed',
    where: 'text',
    block: 'block-9',
    sample: 'Copyright © 2031 Bright Gym. Every'
  }
  const named = withNameSource(printed, r.nameLines)
  assert.equal(named.source.setting, 'cms site name')
  assert.equal(named.source.through.constant, 'MOD_FOOT_LINE1')
  assert.equal(withNameSource({ ...printed, block: 'block-2' }, r.nameLines).source, undefined)
  const none = siteCmsTexts({ reads, idOf: (b) => b, cms: null, slotTexts: [], nameSetting: null })
  assert.equal(none.errors[0].field, 'site.fixedTexts')
})

test('withEmptyOverride and judgeHide', () => {
  assert.equal(withEmptyOverride(null, 'MOD_FOOT_LINE2'), 'MOD_FOOT_LINE2=""\n')
  assert.equal(withEmptyOverride('A="b"\n\n', 'C'), 'A="b"\nC=""\n')
  const text = 'Example CMS is free software'
  assert.equal(judgeHide({ textBefore: `x ${text}`, textAfter: 'x', text, changed: true }).canHide, true)
  assert.equal(judgeHide({ textBefore: text, textAfter: text, text, changed: true }).canHide, false)
  assert.equal(judgeHide({ textBefore: text, textAfter: '', text, changed: false }).canHide, null)
  assert.equal(judgeHide({ textBefore: '', textAfter: '', text, changed: true }).canHide, null)
})

test('the writer only touches the override folder, and the source reads many files in one go', () => {
  const root = mkdtempSync(join(tmpdir(), 'kit-cms-text-'))
  try {
    mkdirSync(join(root, 'language/xx-XX'), { recursive: true })
    writeFileSync(join(root, 'language/xx-XX/mod_foot.ini'), FOOTER_INI)
    assert.equal(writable('language/overrides/xx-XX.override.ini', ['language/overrides']), true)
    assert.equal(writable('language/overrides/../../configuration.php', ['language/overrides']), false)
    const w = siteWriter({ webroot: root })
    assert.throws(() => w.writeFile('configuration.php', 'x'), /refused/)
    w.writeFile('language/overrides/xx-XX.override.ini', 'K=""\n')
    assert.equal(readFileSync(join(root, 'language/overrides/xx-XX.override.ini'), 'utf8'), 'K=""\n')
    const s = siteSource({ webroot: root })
    assert.deepEqual(s.listDir('language/xx-XX'), ['mod_foot.ini'])
    const many = s.readMany(['language/xx-XX/mod_foot.ini', 'language/overrides/xx-XX.override.ini'])
    assert.equal(many[1].text, 'K=""\n')
    w.removeFile('language/overrides/xx-XX.override.ini')
    assert.equal(existsSync(join(root, 'language/overrides/xx-XX.override.ini')), false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('whole words: a sentence ending in punctuation counts against the control set beside it', () => {
  assert.equal(wholeWordCount('SORT BY\nNAME\n MANUFACTURER:SELECT MANUFACTURER', 'MANUFACTURER:'), 1)
  assert.equal(wholeWordCount('Previous page', 'Prev'), 0)
  assert.equal(wholeWordCount('Start Prev 1 2 Next End', 'End'), 1)
})

test('dynamic CMS producer retains actual matched language formats and refuses competing identities', () => {
  const files = [{ file: 'cms.ini', text: 'HITS="Hits: %d"\nCOUNT="Hits: %s"\nSTATIC="Prev"\n' }]
  const { fixedTexts } = matchCmsStrings({
    lines: [
      { block: 'body-a', text: 'Hits: 24' },
      { block: 'body-a', text: 'Prev' }
    ],
    files
  })
  const hits = fixedTexts[0]
  assert.deepEqual(hits.source.formats, [
    { file: 'cms.ini', constant: 'HITS', value: 'Hits: %d' },
    { file: 'cms.ini', constant: 'COUNT', value: 'Hits: %s' }
  ])
  assert.deepEqual(hits.source.constants, ['HITS', 'COUNT'])
  assert.ok(shortPattern(hits.source.formats[0].value).test('hits: 25'))
  assert.equal(fixedTexts[1].source.formats, undefined, 'literal static records keep their existing shape')
  const competing = matchCmsStrings({
    lines: [{ block: 'body-a', text: 'Hits: 24' }],
    files: [{ file: 'cms.ini', text: files[0].text + 'OTHER="Hits: 2%s"\n' }]
  }).fixedTexts[0]
  assert.equal(competing.source.formats.length, 3)
  assert.equal(
    judgeHide({
      text: competing.text,
      source: competing.source,
      textBefore: 'Hits: 24',
      textAfter: '',
      changed: true
    }).canHide,
    null,
    'different matching formats are ambiguous, not a broader wildcard'
  )
  for (const formats of [
    [],
    [{ file: 'cms.ini', constant: 'HITS' }],
    [{ file: 'cms.ini', constant: 'HITS', value: '%s' }]
  ])
    assert.equal(
      judgeHide({
        text: 'Hits: 24',
        source: { file: 'cms.ini', constant: 'HITS', formats },
        textBefore: 'Hits: 24',
        textAfter: '',
        changed: true
      }).canHide,
      null
    )
})

test('dynamic CMS hiding counts current format occurrences, never the captured counter value', () => {
  const { fixedTexts } = matchCmsStrings({
    lines: [{ block: 'body-a', text: 'Hits: 12' }],
    files: [{ file: 'cms.ini', text: 'HITS="Hits: %d"\n' }]
  })
  const f = fixedTexts[0]
  const judge = (textBefore, textAfter, changed = true, source = f.source) =>
    judgeHide({ text: f.text, source, textBefore, textAfter, changed })
  assert.equal(judge('Title\nHits: 24', 'Title\nHits: 25').canHide, false)
  assert.equal(
    judge('Title\nHits: 12', 'Title\nHits: 25').canHide,
    false,
    'a changing counter is no removed sentence'
  )
  assert.equal(
    judge('Hits: 24\nHits: 25', 'Hits: 26').canHide,
    false,
    'a remaining format-bound occurrence is still shown'
  )
  assert.equal(judge('Title\nHits: 24', 'Title').canHide, true)
  assert.equal(judge('Title\nHits: 24', 'Title', false).canHide, null)
  assert.equal(judge('Title', 'Title').canHide, null, 'absent before stays unknown')
  assert.equal(judge('Other Hits: 24', '').canHide, null, 'only a whole source-format line matches')
  assert.equal(judge(undefined, '').canHide, null)
  assert.equal(judge('Hits: 24', undefined).canHide, null)
  assert.equal(judge('Hits: 12', '', true, { ...f.source, formats: [] }).canHide, null)
  const formats = [...f.source.formats, { file: 'cms.ini', constant: 'OTHER', value: 'Hits: 1%s' }]
  assert.equal(judge('Hits: 12', '', true, { ...f.source, formats }).canHide, null)
  assert.equal(
    judgeHide({ text: 'Prev', textBefore: 'Previous Prev', textAfter: 'Previous', changed: true }).canHide,
    true
  )
  assert.equal(
    judgeHide({ text: 'Prev', textBefore: 'Prev', textAfter: 'Prev', changed: true }).canHide,
    false
  )
})

test('dynamic CMS reflow cannot turn a remaining counter into a successful hide', () => {
  const f = matchCmsStrings({
    lines: [{ block: 'body-a', text: 'Hits: 24' }],
    files: [{ file: 'cms.ini', text: 'HITS="Hits: %d"\n' }]
  }).fixedTexts[0]
  const judge = (textBefore, textAfter) =>
    judgeHide({ text: f.text, source: f.source, textBefore, textAfter, changed: true })
  for (const after of ['Title Hits: 25', 'Title\nOther Hits: 25', 'Title\nHits:\n25']) {
    const result = judge('Title\nHits: 24', after)
    assert.equal(result.canHide, null, `possible joined or reflowed counter stays unknown: ${after}`)
    assert.match(result.reason, /joined|reflowed/)
  }
  assert.equal(
    judge('Other Hits: 24', 'Other Hits: 25').canHide,
    null,
    'embedded before is no positive source identification'
  )
  assert.equal(judge('Title\nHits: 24', 'Title').canHide, true, 'actual removal still passes')
  assert.equal(
    judge('Title\nHits: 24', 'Title\nHits: 25').canHide,
    false,
    'anchored current occurrence still shows'
  )
  assert.equal(
    judgeHide({ text: 'Prev', textBefore: 'Title Prev', textAfter: 'Title', changed: true }).canHide,
    true,
    'static literal semantics are unchanged'
  )
})
