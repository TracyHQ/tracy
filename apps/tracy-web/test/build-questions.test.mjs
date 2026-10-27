/**
 * The questionnaire a site is asked: the standard file of its CMS, whatever else is stored (D11) —
 * and the candidates /ops keeps beside it, which are kept but not served this round.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  loadStandardQuestions,
  questionChoices,
  readDefaultSource,
  resolveQuestions,
  STANDARD,
  saveDefaultSource
} from '../src/lib/build-questions.js'
import { candidatesFor, contentHashOf, standardIdFor } from '../src/lib/question-sets.js'

const standard = loadStandardQuestions()

/** The questionnaire a released quickstart carries, as it would arrive from its release. */
const BUSINESS = {
  schemaVersion: 'tracy-questions/v1',
  owner: 'tracy-business/emdash-0.x',
  languages: ['en', 'vi'],
  questions: [
    {
      id: 'name',
      kind: 'text',
      step: 1,
      label: { en: 'Company name', vi: 'Tên công ty' },
      feeds: ['site.name', 'agent']
    },
    {
      id: 'sector',
      kind: 'choice',
      step: 2,
      options: ['construction'],
      optionLabels: { construction: { en: 'Construction', vi: 'Xây dựng' } },
      label: { en: 'Sector', vi: 'Ngành' },
      feeds: ['agent']
    },
    { id: 'contact', kind: 'text', step: 2, label: { en: 'Contact', vi: 'Liên hệ' }, feeds: ['agent'] }
  ]
}

const BUSINESS_FOR = (owner) => ({ ...BUSINESS, owner })
const noRows = { query: async () => ({ rows: [] }) }
test('the image ships a valid default set for every CMS, each asking for the name', () => {
  for (const platform of ['wordpress', 'joomla', 'emdash']) {
    assert.equal(standard[platform].owner, platform)
    assert.ok(
      standard[platform].questions.some((q) => q.id === 'name'),
      `${platform} asks for the name`
    )
  }
})

/**
 * The question ids of the image's standard file for a CMS — what every site of it is asked while brand uploads are
 * off (the resolver's default): every question but the logo and the favicon (D12).
 */
const standardIds = (platform) =>
  standard[platform].questions.filter((q) => q.kind !== 'logo' && q.kind !== 'favicon').map((q) => q.id)

/** A pool that would answer every tier the resolver used to read: own sets, a choice, a CMS default. */
function everyTier({ rows, chosen = null, cmsDefault = null }) {
  const asked = []
  return {
    asked,
    query: async (sql, params = []) => {
      const text = sql.replace(/\s+/g, ' ')
      asked.push(text)
      if (text.includes('from question_set where owner'))
        return {
          rows: (rows[params[0]] ?? []).map((r, i) => ({
            revision: 1,
            id: `${params[0]}#${i}`,
            owner: params[0],
            ...r
          }))
        }
      if (text.includes('from question_choice where owner'))
        return { rows: chosen?.[params[0]] ? [{ set_id: chosen[params[0]], revision: 1 }] : [] }
      if (text.includes('build_questions'))
        return { rows: cmsDefault ? [{ source: cmsDefault, revision: 2, updated_by: 'o@t.test' }] : [] }
      return { rows: [] }
    }
  }
}

const OWNER = 'tracy-business/emdash-0.x'

test('D11: a quickstart shipping its own released set is still asked the standard file of its CMS', async () => {
  const pool = everyTier({
    rows: { [OWNER]: [{ name: 'Released 1.0.0', source: 'released', version: '1.0.0', doc: BUSINESS }] }
  })
  const r = await resolveQuestions({ platform: 'emdash', quickstart: OWNER, lang: 'vi', pool, standard })
  assert.equal(r.source, 'standard')
  assert.equal(r.owner, 'emdash')
  assert.deepEqual(
    r.questions.map((q) => q.id),
    standardIds('emdash')
  )
  assert.equal(r.quickstart, OWNER, 'the quickstart is still named, only its set is not served')
  assert.equal(r.set.id, standardIdFor('emdash'))
  assert.equal(r.set.contentHash, contentHashOf(r.doc), 'the hash is of the fitted set it serves')
  assert.equal(pool.asked.length, 0, 'no stored set, choice or CMS default is even read')
})

test('D11: a quickstart with a chosen generated or custom set is still asked the standard file', async () => {
  for (const source of ['generated', 'custom']) {
    const pool = everyTier({
      rows: {
        [OWNER]: [
          { name: 'Released 1.0.0', source: 'released', version: '1.0.0', doc: BUSINESS },
          { id: 'mine', name: 'Twelve questions', source, doc: BUSINESS }
        ]
      },
      chosen: { [OWNER]: 'mine' }
    })
    const r = await resolveQuestions({ platform: 'emdash', quickstart: OWNER, lang: 'en', pool, standard })
    assert.deepEqual(
      r.questions.map((q) => q.id),
      standardIds('emdash'),
      `a chosen ${source} set is not served`
    )
  }
})

test('D11: a CMS default chosen in /ops is not served; the standard file is', async () => {
  const pool = everyTier({
    rows: { [OWNER]: [{ name: 'Released 1.0.0', source: 'released', version: '1.0.0', doc: BUSINESS }] },
    cmsDefault: OWNER
  })
  const r = await resolveQuestions({ platform: 'emdash', quickstart: null, lang: 'en', pool, standard })
  assert.equal(r.source, 'standard')
  assert.deepEqual(
    r.questions.map((q) => q.id),
    standardIds('emdash')
  )
})

test('D11: a server candidate in use for the CMS itself does not override the image file', async () => {
  const pool = everyTier({
    rows: {
      wordpress: [{ id: 'edited', name: 'Edited standard', source: 'custom', doc: BUSINESS_FOR('wordpress') }]
    },
    chosen: { wordpress: 'edited' }
  })
  const r = await resolveQuestions({ platform: 'wordpress', quickstart: null, lang: 'en', pool, standard })
  assert.deepEqual(
    r.questions.map((q) => q.id),
    standardIds('wordpress')
  )
  assert.equal(r.set.contentHash, contentHashOf(r.doc))
})

test('every CMS: no quickstart and no choice → the standard file, in the language asked for', async () => {
  for (const platform of ['wordpress', 'joomla', 'emdash']) {
    const r = await resolveQuestions({ platform, quickstart: null, lang: 'en', pool: noRows, standard })
    assert.equal(r.source, 'standard')
    assert.deepEqual(
      r.questions.map((q) => q.id),
      standardIds(platform)
    )
  }
  const fr = await resolveQuestions({
    platform: 'wordpress',
    quickstart: null,
    lang: 'fr',
    pool: noRows,
    standard
  })
  assert.equal(fr.questions[0].label, "Nom de l'entreprise", 'French is one of the shipped languages')
  // A language nobody can switch to falls back to English rather than drawing an empty form.
  const nowhere = await resolveQuestions({
    platform: 'wordpress',
    quickstart: null,
    lang: 'xx',
    pool: noRows,
    standard
  })
  assert.equal(nowhere.questions[0].label, 'Business name')
})

test('a CMS this build ships no standard file for is an error, never an empty form', async () => {
  await assert.rejects(
    resolveQuestions({ platform: 'drupal', quickstart: null, lang: 'en', pool: noRows, standard }),
    /No standard questionnaire for drupal/
  )
})

const RELEASES = [
  {
    tag: 'tracy-business/emdash-0.x',
    platform: 'emdash',
    choosable: true,
    setting: { label: 'Tracy Business' },
    questions: BUSINESS
  },
  // Ready, but it ships no questionnaire: nothing to point a CMS default at.
  {
    tag: 'tracy-base/j6',
    platform: 'joomla',
    choosable: true,
    setting: { label: 'Tracy Base' },
    questions: null
  },
  // Carries one, but is a draft: not choosable, so not offered.
  {
    tag: 'tracy-base/wp7',
    platform: 'wordpress',
    choosable: false,
    setting: { label: 'Tracy Base' },
    questions: BUSINESS
  }
]

test('the choices are the standard set plus every READY release of that platform carrying one', () => {
  assert.deepEqual(
    questionChoices('emdash', standard, RELEASES).map((c) => c.id),
    [STANDARD, 'tracy-business/emdash-0.x']
  )
  assert.deepEqual(
    questionChoices('joomla', standard, RELEASES).map((c) => c.id),
    [STANDARD],
    'a release with no questionnaire cannot be a default'
  )
  assert.deepEqual(
    questionChoices('wordpress', standard, RELEASES).map((c) => c.id),
    [STANDARD],
    'a draft is not choosable, questionnaire or not'
  )
})

test('saving accepts only a listed source and checks the revision', async () => {
  let calls = 0
  const pool = {
    query: async () => {
      calls++
      return { rows: [] }
    }
  }
  const choices = questionChoices('emdash', standard, RELEASES)
  assert.equal(
    (await saveDefaultSource(pool, 'emdash', choices, 'tracy-next/emdash', 0, 'o@t.test')).error,
    'INVALID_SOURCE'
  )
  assert.equal(calls, 0)
  assert.equal(
    (await saveDefaultSource(pool, 'emdash', choices, 'tracy-business/emdash-0.x', 3, 'o@t.test')).error,
    'SOURCE_CHANGED'
  )
  assert.equal((await readDefaultSource(noRows, 'emdash')).source, STANDARD)
})

test('a set written here is a CANDIDATE beside the released one, kept and chosen, but not served (D11)', async () => {
  const mine = {
    ...BUSINESS,
    questions: [
      ...BUSINESS.questions,
      { id: 'city', kind: 'text', step: 2, label: { en: 'City', vi: 'Thành phố' }, feeds: ['agent'] }
    ]
  }
  const owner = 'tracy-business/emdash-0.x'
  const rows = [
    {
      id: 'released-1',
      name: 'Released 1.0.0',
      source: 'released',
      version: '1.0.0',
      sha256: 'aa',
      doc: BUSINESS
    },
    { id: 'mine-1', name: 'Sales team wording', source: 'custom', doc: mine }
  ]
  const pool = (chosenId) => ({
    query: async (sql, params = []) => {
      const text = sql.replace(/\s+/g, ' ')
      if (text.includes('from question_set where owner'))
        return {
          rows: rows.map((r) => ({ owner: params[0], revision: 1, updated_by: null, updated_at: null, ...r }))
        }
      if (text.includes('from question_choice where owner'))
        return { rows: chosenId ? [{ set_id: chosenId, revision: 1 }] : [] }
      return { rows: [] }
    }
  })

  // Neither the released set nor the chosen one is what a site is asked this round (D11): the
  // standard file is. The rows stay — the /ops screen still lists them, and the choice is kept.
  for (const chosenId of [null, 'mine-1']) {
    const asked = await resolveQuestions({
      platform: 'emdash',
      quickstart: owner,
      lang: 'en',
      pool: pool(chosenId),
      standard
    })
    assert.deepEqual(
      asked.questions.map((q) => q.id),
      standardIds('emdash')
    )
  }

  const { sets, inUse } = await candidatesFor(pool('mine-1'), owner, null)
  assert.deepEqual(
    sets.map((s) => s.source),
    ['released', 'custom']
  )
  assert.equal(inUse.id, 'mine-1')
  assert.equal(
    sets.find((s) => s.source === 'released').inUse,
    false,
    'the release is untouched by the choice'
  )
})
