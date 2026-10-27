/**
 * Admin attention's wording (`src/attention/strings.ts` → dictionary `attention`): the server
 * answers codes, that file maps them to keys. Pinned here because a code with no sentence draws an
 * empty reason line, and in every interface language, through the real dictionaries.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { INTERFACE_LANGUAGES } from '../../../core/tracy-core/src/interface-languages/index.mjs'
import {
  AREAS,
  analysisText,
  areaBlurb,
  areaLabel,
  feedsText,
  fixOf,
  RAIL_KEY,
  roleName,
  severityLabel,
  titleOf,
  whyOf
} from '../src/attention/strings.ts'
import { translate } from '../src/i18n/translator.ts'
import { en } from '../src/i18n/ns/attention.ts'

const LANGS = INTERFACE_LANGUAGES.filter((l) => l.shown).map((l) => l.id)
const tableOf = (lang) =>
  lang === 'en'
    ? {}
    : JSON.parse(readFileSync(new URL(`../src/i18n/locales/${lang}/attention.json`, import.meta.url), 'utf8'))
/** A `t` that also records any key with no text, so a code mapped to a missing key fails. */
function tFor(lang) {
  const table = tableOf(lang)
  const t = (key, params) => {
    const text = translate(lang, table, en, key, params)
    assert.notEqual(text, key, `${lang}: no text for ${key}`)
    if (lang !== 'en')
      assert.ok(Object.hasOwn(table, key) || Object.hasOwn(table, `${key}_other`), `${lang}: ${key}`)
    return text
  }
  return t
}
const vi = tFor('vi')
const english = tFor('en')

const subject = {
  key: 'quickstart/ja-impact/j6',
  kind: 'quickstart',
  label: 'JA Impact',
  platform: 'joomla',
  version: '1.0.0',
  demo: null,
  worst: 'missing',
  items: []
}
const CHECK_CODES = [
  'demo-failed',
  'not-on-inspiration',
  'inspiration-incomplete',
  'demo-orphan',
  'unreadable',
  'no-demo',
  'no-contract',
  'no-design-system',
  'standard-questions',
  'demo-behind',
  'no-card'
]
const item = (check, params = {}, severity = 'missing') => ({ check, severity, params })

test('every check an area lists has a title, and every area and severity has words, in every language', () => {
  for (const lang of LANGS) {
    const t = tFor(lang)
    for (const area of AREAS) {
      assert.ok(areaLabel(area.id, t))
      assert.ok(areaBlurb(area.id, t))
      for (const check of area.checks ?? []) assert.notEqual(titleOf(check, t), check, `${lang} ${check}`)
    }
    for (const check of CHECK_CODES) assert.notEqual(titleOf(check, t), check, `${lang} ${check}`)
    for (const severity of ['broken', 'missing', 'hint']) assert.ok(severityLabel(severity, t))
    assert.ok(t(RAIL_KEY))
  }
})

test('an unknown check shows its code, and is fixed on its Quickstart', () => {
  assert.equal(titleOf('brand-new-check', english), 'brand-new-check')
  assert.equal(fixOf('brand-new-check'), 'quickstart')
  assert.equal(fixOf('demo-failed'), 'demo')
})

test('the approved Vietnamese wording is what Vietnamese shows', () => {
  assert.equal(vi(RAIL_KEY), 'Cần xử lý')
  assert.equal(titleOf('demo-failed', vi), 'Dựng Demo thất bại')
  assert.equal(severityLabel('broken', vi), 'Hỏng')
  assert.equal(areaLabel('questions', vi), 'Bảng hỏi')
  assert.equal(
    vi('attention.checkedAt', { count: 3 }),
    'Vừa kiểm tra · 3 Quickstart có thể dùng để dựng site'
  )
  assert.equal(
    english('attention.checkedAt', { count: 1 }),
    'Just checked · 1 Quickstart can be used to build sites'
  )
})

test('reasons are worded from codes; third-party text is kept verbatim', () => {
  for (const lang of LANGS) {
    const t = tFor(lang)
    assert.equal(
      whyOf(
        item('demo-failed', { reason: 'Usage: php installation/joomla.php install [options]' }, 'broken'),
        subject,
        t
      ),
      'Usage: php installation/joomla.php install [options]'
    )
    assert.match(
      whyOf(item('no-design-system', { contract: 'ja-impact/j6/1.0.0' }), subject, t),
      /ja-impact\/j6\/1\.0\.0 .*1\.0\.0\.design\.json/
    )
    assert.match(
      whyOf(
        item(
          'inspiration-incomplete',
          { code: 'pictures-missing', missing: 4, total: 8, files: ['a', 'b', 'c', 'd'] },
          'broken'
        ),
        subject,
        t
      ),
      /4\/8.*a, b, c, …/
    )
    assert.match(
      whyOf(item('unreadable', { reason: 'Unexpected token }' }), subject, t),
      /tracy_setting\.json.*Unexpected token \}/
    )
    for (const code of [
      'unpublished',
      'no-template',
      'layouts-without-shots',
      'no-demo',
      'no-category',
      'no-thumbnail',
      'no-blurb'
    ])
      assert.ok(whyOf(item('inspiration-incomplete', { code, layouts: 2 }), subject, t), `${lang} ${code}`)
    assert.ok(whyOf(item('not-on-inspiration'), subject, t))
    assert.match(
      whyOf(item('demo-orphan', { demo: 'd-1', tag: 'quickstart/x/j6/2.0.0' }), subject, t),
      /d-1.*quickstart\/x\/j6\/2\.0\.0/
    )
    assert.match(
      whyOf(item('no-contract', { version: '1.2.3' }), subject, t),
      /quickstart\/ja-impact\/j6.*1\.2\.3/
    )
    assert.match(
      whyOf(item('demo-behind', { demoVersion: '1.0.0', version: '1.1.0' }), subject, t),
      /1\.0\.0.*1\.1\.0/
    )
    assert.equal(whyOf(item('no-demo'), subject, t), null)
    assert.equal(whyOf(item('inspiration-incomplete', { code: 'never-seen' }), subject, t), null)
  }
})

const covered = {
  setName: 'Standard joomla',
  asked: [
    { id: 'name', label: 'A', works: true, feeds: ['site.name'], dead: null },
    {
      id: 'pages',
      label: 'Trang',
      works: false,
      feeds: [],
      dead: { consumer: 'seed.pages', code: 'sealed-pages' }
    }
  ],
  parts: [
    { role: 'hero', blocks: 1, pages: 0, examples: [], covered: true },
    { role: 'contact', blocks: 2, pages: 0, examples: [], covered: false },
    { role: 'news', blocks: 0, pages: 3, examples: [], covered: false }
  ],
  limited: null
}

test('the analysis names every uncovered part and every question that does nothing', () => {
  for (const lang of LANGS) {
    const words = analysisText(covered, subject.key, tFor(lang))
    assert.equal(words.limited, null)
    assert.equal(words.problems.length, 3, lang)
    assert.match(words.problems[0], /ja-impact/)
    assert.match(words.problems[2], /Trang/)
    assert.equal(words.suggestions.length, 3, lang)
  }
  const words = analysisText(covered, subject.key, vi)
  assert.match(words.problems[0], /ja-impact ở 2 khối và 3 trang tin tức/)
  assert.match(
    analysisText(covered, subject.key, english).problems[0],
    /ja-impact in 2 blocks and 3 news pages/
  )
})

test('both limited modes have their own sentence', () => {
  const base = { setName: 'S', asked: [], parts: [] }
  for (const lang of LANGS) {
    const t = tFor(lang)
    const noContract = analysisText({ ...base, limited: 'no-contract' }, subject.key, t)
    const identity = analysisText({ ...base, limited: 'identity-only' }, subject.key, t)
    assert.ok(noContract.limited)
    assert.ok(identity.limited)
    assert.notEqual(noContract.limited, identity.limited)
  }
})

test('every role, feed and dead-answer code has words; unknown ones show as themselves', () => {
  for (const lang of LANGS) {
    const t = tFor(lang)
    for (const role of [
      'services',
      'pricing',
      'team',
      'testimonials',
      'projects',
      'contact',
      'gallery',
      'faq',
      'news',
      'events',
      'hero',
      'about',
      'cta'
    ])
      assert.notEqual(roleName(role, t), role)
    assert.equal(roleName('mystery', t), 'mystery')
    assert.doesNotMatch(
      feedsText(['site.name', 'copy.about', 'copy.tone', 'site.languages', 'seed.pages', 'template'], t),
      /\.|^template/
    )
    assert.equal(feedsText(['agent', 'x.y'], t), 'x.y')
    for (const code of [
      'sealed-pages',
      'unsealed-languages',
      'emdash-no-copy',
      'no-page-list',
      'emdash-no-seed',
      'no-personalize',
      'no-personalize-map',
      'no-feeds',
      'unknown-consumer',
      'unavailable',
      'never-seen'
    ]) {
      const dead = analysisText(
        {
          setName: 'S',
          asked: [{ id: 'q', label: 'Q', works: false, feeds: [], dead: { consumer: null, code } }],
          parts: [],
          limited: null
        },
        subject.key,
        t
      )
      assert.equal(dead.problems.length, 1)
      assert.match(dead.problems[0], /Q/)
    }
  }
})
