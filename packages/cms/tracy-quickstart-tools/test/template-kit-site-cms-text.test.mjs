// Template kit, site part: the sentences a CMS prints from its language files (fixed text and the site name line),
// the override that hides one, and the write path that may only touch the override folder. Made-up studio data.
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { siteWriter, writable } from '../template-kit/lib/site/adapters/site-writer.mjs'
import { siteSource } from '../template-kit/lib/site/adapters/source.mjs'
import {
  matchCmsStrings,
  parseIni,
  shownText,
  siteCmsTexts,
  stringPattern,
  withNameSource
} from '../template-kit/lib/site/cms-strings.mjs'
import { judgeHide, withEmptyOverride } from '../template-kit/lib/site/hide-cms-text.mjs'

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
  assert.equal(judgeHide({ textBefore: `x ${text}`, textAfter: 'x', text, change: 0.3 }).canHide, true)
  assert.equal(judgeHide({ textBefore: text, textAfter: text, text, change: 0.3 }).canHide, false)
  assert.equal(judgeHide({ textBefore: text, textAfter: '', text, change: 0 }).canHide, null)
  assert.equal(judgeHide({ textBefore: '', textAfter: '', text, change: 0.5 }).canHide, null)
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
