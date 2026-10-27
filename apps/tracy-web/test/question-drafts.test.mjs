/**
 * Drafts beside the set in use: the `custom` and `generated` rows the removed /ops editor and
 * generator left behind (10/10/2026), which set counts as in use, and what the resolver hands a new
 * site — on a real database, migrated from zero, so the migration itself is under test too.
 *
 * The two traps spec §5 named are the first two tests: `candidatesFor` picking `list[0]` when
 * nothing was chosen (a freshly generated draft became the questionnaire customers met), and the
 * resolver calling the tag's candidates with no standard document, so a choice of `<cms>@standard`
 * could not be found and fell to the same `list[0]`.
 */
import assert from 'node:assert/strict'
import { test, after, before, beforeEach } from 'node:test'

import { loadStandardQuestions, resolveQuestions } from '../src/lib/build-questions.js'
import { candidatesFor, contentHashOf, standardIdFor } from '../src/lib/question-sets.js'
import { fileDb } from './_db.mjs'

// One migrated schema for the whole file, emptied before each test (see _db.mjs).
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const standard = loadStandardQuestions()
const OWNER = 'tracy-business/j6'

const doc = (ids = ['name'], extra = {}) => ({
  schemaVersion: 'tracy-questions/v1',
  owner: OWNER,
  languages: ['en'],
  questions: ids.map((id) => ({
    id,
    kind: 'text',
    label: { en: id === 'name' ? 'Company name' : id },
    feeds: id === 'name' ? ['site.name', 'agent'] : ['agent']
  })),
  ...extra
})

/** A row the removed /ops editor (`custom`) or generator (`generated`) left in the table. */
async function seedStored(pool, owner, id, source, d) {
  await pool.query(
    `insert into question_set (id, owner, name, source, doc, content_hash)
       values ($1, $2, $3, $4, $5::jsonb, $6)`,
    [id, owner, source === 'custom' ? 'Draft' : 'Generated', source, JSON.stringify(d), contentHashOf(d)]
  )
}

async function seedReleased(pool, owner, sha, version, d) {
  await pool.query(
    `insert into question_set (id, owner, name, source, version, sha256, doc)
       values ($1, $2, $3, 'released', $4, $5, $6::jsonb)`,
    [`${owner}@${sha}`, owner, `Released ${version}`, version, sha, JSON.stringify(d)]
  )
}

test(
  'trap 1: with nothing chosen, a draft written or generated here is NEVER the set in use',
  opts,
  async () => {
    const { pool } = db
    // No released set for this tag: before the fix, the first custom row won by position.
    await seedStored(pool, OWNER, `${OWNER}#mine`, 'custom', doc(['name', 'x']))
    await seedStored(pool, OWNER, `${OWNER}#gen`, 'generated', doc(['name', 'y']))

    const { sets, inUse } = await candidatesFor(pool, OWNER, standard.joomla)
    assert.equal(inUse.source, 'standard', 'the CMS set, not somebody’s draft')
    assert.deepEqual(
      sets.filter((s) => s.inUse).map((s) => s.source),
      ['standard']
    )
    const asked = await resolveQuestions({
      platform: 'joomla',
      quickstart: OWNER,
      lang: 'en',
      pool,
      standard
    })
    assert.equal(asked.source, 'standard')
    assert.ok(!asked.questions.some((q) => q.id === 'x' || q.id === 'y'))

    // With a released set, that one is the rule — still not the draft.
    await seedReleased(pool, OWNER, 'aa', '1.1.0', doc(['name', 'sector']))
    const again = await candidatesFor(pool, OWNER, standard.joomla)
    assert.equal(again.inUse.source, 'released')
  }
)

test(
  'trap 2: a choice of the CMS standard set is honoured by list, detail AND the create door',
  opts,
  async () => {
    const { pool } = db
    await seedReleased(pool, OWNER, 'aa', '1.1.0', doc(['name', 'sector']))
    await seedStored(pool, OWNER, `${OWNER}#mine`, 'custom', doc(['name', 'x']))
    // The choice a Use press stored before the editor was removed.
    await pool.query(`insert into question_choice (owner, set_id, updated_by) values ($1, $2, 'a@t')`, [
      OWNER,
      standardIdFor('joomla')
    ])

    const { inUse, choiceMissing } = await candidatesFor(pool, OWNER, standard.joomla)
    assert.equal(inUse.source, 'standard')
    assert.equal(choiceMissing, false)

    const asked = await resolveQuestions({
      platform: 'joomla',
      quickstart: OWNER,
      lang: 'en',
      pool,
      standard
    })
    assert.equal(asked.source, 'standard')
    assert.deepEqual(
      asked.questions.map((q) => q.id),
      // Logo and Favicon are served only with the site-brand-uploads switch on (D12), off by default here.
      standard.joomla.questions.filter((q) => q.kind !== 'logo' && q.kind !== 'favicon').map((q) => q.id)
    )
    assert.equal(asked.set.id, standardIdFor('joomla'))
    assert.match(asked.set.contentHash, /^[0-9a-f]{64}$/)
  }
)

test('every candidate carries a content hash, and the hash is of the document', opts, async () => {
  const { pool } = db
  await seedReleased(pool, OWNER, 'aa', '1.1.0', doc(['name']))
  const { sets } = await candidatesFor(pool, OWNER, standard.joomla)
  for (const s of sets) assert.equal(s.contentHash, contentHashOf(s.doc), s.id)
})

test(
  'a legacy choice keeps pointing at its set after the migration; nothing moves by itself',
  opts,
  async () => {
    const { pool } = db
    await seedReleased(pool, OWNER, 'aa', '1.0.0', doc(['name']))
    await seedReleased(pool, OWNER, 'bb', '1.1.0', doc(['name', 'sector']))
    await pool.query(`insert into question_choice (owner, set_id, updated_by) values ($1, $2, 'a@t')`, [
      OWNER,
      `${OWNER}@aa`
    ])
    const { inUse } = await candidatesFor(pool, OWNER, standard.joomla)
    assert.equal(inUse.id, `${OWNER}@aa`, 'the older release, because that is what was chosen')
    const asked = await resolveQuestions({
      platform: 'joomla',
      quickstart: OWNER,
      lang: 'en',
      pool,
      standard
    })
    // The choice is kept, but this round every site is asked the standard file of its CMS (D11).
    assert.deepEqual(
      asked.questions.map((q) => q.id),
      // Logo and Favicon are served only with the site-brand-uploads switch on (D12), off by default here.
      standard.joomla.questions.filter((q) => q.kind !== 'logo' && q.kind !== 'favicon').map((q) => q.id)
    )
  }
)
