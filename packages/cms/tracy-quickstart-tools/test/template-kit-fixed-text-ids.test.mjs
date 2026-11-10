// Fixed text a planner can name: every CMS string a page prints is found (a short one inside a longer one, or one
// that equals a content sample elsewhere, is still found and measured), and every fixedText entry has a stable id
// in the shape the planner reads ({id, text, canHide}). Fabricated data only.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { fixedTextChecks, fixedTextId, mergeSite } from '../template-kit/lib/kit-site.mjs'
import { matchCmsStrings } from '../template-kit/lib/site/cms-strings.mjs'
import { languageFileRank } from '../template-kit/lib/site/adapters/joomla.mjs'
import { judgeHide } from '../template-kit/lib/site/hide-cms-text.mjs'
import { retainFixedTexts } from '../template-kit/site-cli.mjs'

const INI =
  'JPREV="Prev"\nJNEXT="Next"\nJPREVIOUS_TITLE="Previous article: %s"\nFOOT_LINE2="Example CMS is free software."\n'

test('a short CMS word printed beside a longer one, or equal to a content sample elsewhere, is still a candidate', () => {
  const lines = [
    { block: 'body-a', text: 'Previous article: Warm Up Drills' },
    { block: 'body-a', text: 'Prev' },
    { block: 'body-a', text: 'Next' }
  ]
  const { fixedTexts } = matchCmsStrings({
    lines,
    files: [{ file: 'cms.ini', text: INI }],
    slotTexts: ['Next']
  })
  assert.deepEqual(
    fixedTexts.map((f) => [f.text, f.source.constant]),
    [
      ['Previous article: Warm Up Drills', 'JPREVIOUS_TITLE'],
      ['Prev', 'JPREV'],
      ['Next', 'JNEXT']
    ]
  )
  // A long sentence equal to a content sample stays content.
  const long = matchCmsStrings({
    lines: [{ block: 'b', text: 'Example CMS is free software.' }],
    files: [{ file: 'cms.ini', text: INI }],
    slotTexts: ['Example CMS is free software.']
  })
  assert.equal(long.fixedTexts.length, 0)
})

test('a word left the page when its whole-word count drops, not when a longer word still holds its letters', () => {
  const text = 'Prev'
  const before = 'Previous article: Warm Up Drills Prev'
  const after = 'Previous article: Warm Up Drills'
  assert.equal(judgeHide({ textBefore: before, textAfter: after, text, changed: true }).canHide, true)
  assert.equal(judgeHide({ textBefore: before, textAfter: before, text, changed: true }).canHide, false)
  assert.equal(judgeHide({ textBefore: 'Previous', textAfter: '', text, changed: true }).canHide, null)
})

test('every fixedText entry gets a stable id in the planner shape, kept when other entries come and go', () => {
  const MAP = { entities: [], slots: [], pages: [] }
  const site = (extra) => ({
    site: {
      fixedTexts: [
        ...extra,
        {
          block: 'block-3',
          text: 'Example CMS is free software.',
          source: { file: 'cms.ini', constant: 'FOOT_LINE2' },
          canHide: true
        }
      ]
    },
    mainHeadings: [],
    errors: []
  })
  const kitOf = () => ({
    pages: [],
    errors: [],
    blocks: [{ id: 'block-3', lists: [], links: [], frames: [], fixedText: [{ text: 'Members only' }] }]
  })
  const one = mergeSite(kitOf(), site([]), MAP).blocks[0].fixedText
  const prev = {
    block: 'block-3',
    text: 'Prev',
    source: { file: 'cms.ini', constant: 'JPREV', short: true, constants: ['JPREV'] },
    canHide: true
  }
  const two = mergeSite(kitOf(), site([prev]), MAP).blocks[0].fixedText
  for (const t of [...one, ...two]) {
    assert.match(t.id, /^block-3\.fixed-[a-z0-9-]+$/)
    assert.ok('text' in t && 'canHide' in t)
  }
  const idOf = (list, text) => list.find((t) => t.text === text).id
  assert.equal(idOf(one, 'Members only'), idOf(two, 'Members only'))
  assert.equal(idOf(one, 'Example CMS is free software.'), idOf(two, 'Example CMS is free software.'))
  assert.equal(new Set(two.map((t) => t.id)).size, two.length)
  // A CMS line keyed by its constant keeps its id when the printed title around the placeholder changes.
  assert.equal(
    fixedTextId('body-a', { text: 'Previous article: A', source: { constant: 'JPREVIOUS_TITLE' } }),
    fixedTextId('body-a', { text: 'Previous article: B', source: { constant: 'JPREVIOUS_TITLE' } })
  )
})

test('self-check: a fixedText entry without an id, or two with one id, is an error', () => {
  const errors = []
  const blocks = [
    {
      id: 'b',
      fixedText: [
        { id: 'b.fixed-x', text: 'A', canHide: true },
        { id: 'b.fixed-x', text: 'B', canHide: true }
      ]
    },
    { id: 'c', fixedText: [{ text: 'C', canHide: null }] }
  ]
  assert.equal(fixedTextChecks({ blocks, errors }), 2)
  assert.ok(errors.every((e) => e.kind === 'fixed-text-id'))
})

test('a content line that also fits a short CMS value never hides a real CMS line of that value in its block', () => {
  // Fabricated: a broad short value fits a content line first and the article navigation after it.
  const ini = 'BROAD="%s article: %s"\nJNEXT_TITLE="Next article: %s"\n'
  const lines = [
    { block: 'body-a', text: 'Featured article: Gloves 101' },
    { block: 'body-a', text: 'Next article: Warm Up Drills' }
  ]
  const { fixedTexts } = matchCmsStrings({ lines, files: [{ file: 'cms.ini', text: ini }] })
  assert.deepEqual(
    fixedTexts.map((f) => f.text),
    ['Featured article: Gloves 101', 'Next article: Warm Up Drills']
  )
})

test('two fixed texts of one constant in a block get distinct ids; one alone is named by its constant', () => {
  const MAP = { entities: [], slots: [], pages: [] }
  const entry = (text) => ({
    block: 'block-3',
    text,
    source: { file: 'cms.ini', constant: 'BROAD', short: true, constants: ['BROAD'] },
    canHide: true
  })
  const kitOf = () => ({
    pages: [],
    errors: [],
    blocks: [{ id: 'block-3', lists: [], links: [], frames: [], fixedText: [] }]
  })
  const one = mergeSite(kitOf(), { site: { fixedTexts: [entry('A: 1')] }, mainHeadings: [], errors: [] }, MAP)
  assert.equal(one.blocks[0].fixedText[0].id, 'block-3.fixed-broad')
  const two = mergeSite(
    kitOf(),
    { site: { fixedTexts: [entry('A: 1'), entry('B: 2')] }, mainHeadings: [], errors: [] },
    MAP
  )
  const ids = two.blocks[0].fixedText.map((t) => t.id)
  assert.equal(new Set(ids).size, 2)
  assert.equal(two.checks.fixedTextIdsInvalid, 0)
})

test('one value in several language files: the line is named after the template or the CMS, never a third-party add-on', () => {
  // Fabricated file names in the shape a Joomla site uses: a mailing add-on ships <tag>.com_x.ini.
  const files = [
    {
      file: 'language/en-GB/en-GB.com_mailer.ini',
      text: 'MAILER_NEXT="Next"\nMAILER_LEAD="All you need to know"\n'
    },
    { file: 'language/en-GB/joomla.ini', text: 'JNEXT="Next"\n' },
    { file: 'templates/tpl_x/language/en-GB/en-GB.tpl_x.ini', text: 'TPL_X_LEAD="All you need to know"\n' }
  ]
  const lines = [
    { block: 'body-a', text: 'Next' },
    { block: 'body-a', text: 'All you need to know' }
  ]
  const rankFile = (f) => languageFileRank(f, 'tpl_x')
  const { fixedTexts } = matchCmsStrings({ lines, files, rankFile })
  assert.deepEqual(
    fixedTexts.map((f) => [f.source.constant, f.source.constants]),
    [
      ['JNEXT', ['JNEXT', 'MAILER_NEXT']],
      ['TPL_X_LEAD', ['TPL_X_LEAD', 'MAILER_LEAD']]
    ]
  )
  assert.ok(
    languageFileRank('language/en-GB/com_users.ini', 'tpl_x') <
      languageFileRank('language/en-GB/en-GB.com_mailer.ini', 'tpl_x')
  )
})

test('filtered CMS candidates cannot shift measurement errors onto another fixed text', () => {
  const fixedTexts = [
    { text: 'Template words', notPrintedByCms: true },
    { text: 'Unreadable CMS sentence', canHide: null, evidence: { reason: 'unreadable' } },
    { text: 'Another template guess', notPrintedByCms: true },
    { text: 'Invalid CMS measurement', canHide: null },
    { text: 'Kept CMS sentence', canHide: true }
  ]
  const unrelated = { kind: 'missing', field: 'site.forms[0]', reason: 'unrelated' }
  const errors = [
    { kind: 'missing', field: 'site.fixedTexts[0].canHide', reason: 'filtered candidate' },
    { kind: 'missing', field: 'site.fixedTexts[1].canHide', reason: 'unreadable' },
    { kind: 'missing', field: 'site.fixedTexts[2].canHide', reason: 'other filtered candidate' },
    { kind: 'missing', field: 'site.fixedTexts[3].canHide', reason: 'nothing changed' },
    unrelated
  ]
  const before = structuredClone({ fixedTexts, errors })
  const result = retainFixedTexts(fixedTexts, errors)
  assert.deepEqual(result.fixedTexts, [fixedTexts[1], fixedTexts[3], fixedTexts[4]])
  assert.deepEqual(result.errors, [
    { ...errors[1], field: 'site.fixedTexts[0].canHide' },
    { ...errors[3], field: 'site.fixedTexts[1].canHide' },
    unrelated
  ])
  for (const error of result.errors.slice(0, 2)) {
    const index = Number(/\[(\d+)\]/.exec(error.field)[1])
    assert.equal(result.fixedTexts[index].canHide, null)
  }
  assert.strictEqual(result.fixedTexts[0], fixedTexts[1])
  assert.strictEqual(result.errors[2], unrelated)
  assert.deepEqual({ fixedTexts, errors }, before)
})

test('unfiltered fixed texts preserve null and skipped-measurement errors without hiding invalid paths', () => {
  const fixedTexts = [
    { text: 'CMS words', canHide: null },
    { text: 'More CMS words', canHide: false }
  ]
  const errors = [
    { kind: 'missing', field: 'site.fixedTexts[0].canHide', reason: 'measurement invalid' },
    { kind: 'missing', field: 'site.fixedTexts[1].canHide', reason: 'not measured (--no-hide-measure)' },
    { kind: 'missing', field: 'site.fixedTexts[20].canHide', reason: 'invalid original index' }
  ]
  assert.deepEqual(retainFixedTexts(fixedTexts, errors), { fixedTexts, errors })
  assert.deepEqual(retainFixedTexts([], []), { fixedTexts: [], errors: [] })
})

test('dynamic CMS merge keeps one source-bound counter instead of stale unbound template words', () => {
  const MAP = { entities: [], slots: [], pages: [] }
  const make = () => ({
    pages: [],
    errors: [],
    blocks: [
      {
        id: 'body-a',
        lists: [],
        links: [],
        frames: [],
        fixedText: [{ text: 'Hits: 24' }, { text: 'Other Hits: 24' }, { text: 'Prev' }]
      }
    ]
  })
  const cms = matchCmsStrings({
    lines: [{ block: 'body-a', text: 'Hits: 25' }],
    files: [{ file: 'cms.ini', text: 'HITS="Hits: %d"\n' }]
  }).fixedTexts[0]
  cms.canHide = null
  const sourceError = {
    kind: 'missing',
    field: 'site.fixedTexts[0].canHide',
    reason: 'actual observation still required'
  }
  const doc = { site: { fixedTexts: [cms] }, mainHeadings: [], errors: [sourceError] }
  const kit = mergeSite(make(), doc, MAP)
  assert.deepEqual(
    kit.blocks[0].fixedText.map((f) => f.text),
    ['Other Hits: 24', 'Prev', 'Hits: 25']
  )
  assert.equal(kit.blocks[0].fixedText.at(-1).source.constant, 'HITS')
  assert.equal(kit.blocks[0].fixedText.at(-1).canHide, null)
  assert.ok(kit.errors.includes(sourceError), 'the real source-bound error survives merge')
  assert.ok(!kit.errors.some((e) => e.field.includes('fixedText[Hits: 24]')))
  const ambiguous = structuredClone(doc)
  ambiguous.site.fixedTexts[0].source.formats.push({ file: 'cms.ini', constant: 'OTHER', value: 'Hits: 2%s' })
  assert.ok(
    mergeSite(make(), ambiguous, MAP).blocks[0].fixedText.some((f) => f.text === 'Hits: 24'),
    'ambiguous source never absorbs stale template words'
  )
  const otherBlock = structuredClone(doc)
  otherBlock.site.fixedTexts[0].block = 'body-b'
  assert.ok(
    mergeSite(make(), otherBlock, MAP).blocks[0].fixedText.some((f) => f.text === 'Hits: 24'),
    'format binding is block-local'
  )
})
