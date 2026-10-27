// The brief of an opportunity not researched as a place reads its own `wo_media` rows: a photo two sources both hold
// reaches the brief once, as its sharper copy (#1780).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { briefResearchOf } from 'website-opportunities/src/brief-research.js'
import { fileDb } from './_db.mjs'

const url = process.env.TEST_DATABASE_URL
const opts = { skip: url ? false : 'set TEST_DATABASE_URL' }
const db = fileDb()
before(db.open)
after(db.close)

const FIXTURE = JSON.parse(
  readFileSync(
    new URL(
      '../../../packages/wo/website-opportunities/test/fixtures/pictures/near-copies.json',
      import.meta.url
    ),
    'utf8'
  )
)
const HSC = FIXTURE.harbourSportClub

test(
  "Harbour Sport Club's own rows: each Instagram copy of a Google photo stays out of the brief",
  opts,
  async () => {
    const { pool } = db
    const account = (await pool.query(`insert into account (email) values ('mai@example.test') returning id`))
      .rows[0]
    const opp = (
      await pool.query(
        `insert into wo_opportunity (account_id, name, provider, provider_id) values ($1, 'Harbour Sport Club', 'manual', 'hsc')
       returning *`,
        [account.id]
      )
    ).rows[0]
    const ids = new Map()
    for (const p of HSC.photos) {
      const sha = String(p.n).padStart(64, '0')
      const { rows } = await pool.query(
        `insert into wo_media (account_id, opportunity_id, sha256, object_key, kind, category, source, source_url, mime,
         bytes, width, height, dhash, labels)
       values ($1, $2, $3, $4, 'image', 'other', $5, $6, 'image/jpeg', $7, $8, $9, $10, $11::jsonb) returning id`,
        [
          account.id,
          opp.id,
          sha,
          `wo/${sha}.jpg`,
          p.source,
          p.sourceUrl ?? `https://${p.source}.test/${p.n}.jpg`,
          p.bytes,
          p.width,
          p.height,
          p.dhash,
          JSON.stringify({ features: { v: 1, ...p.features } })
        ]
      )
      ids.set(p.n, rows[0].id)
    }
    const { read, view } = await briefResearchOf(pool, opp)
    assert.equal(view, null)
    const kept = read.media.map((m) => m.id)
    for (const [instagram, google] of HSC.copies) {
      assert.ok(!kept.includes(ids.get(instagram)), `Instagram #${instagram} is a copy of Google #${google}`)
      assert.ok(kept.includes(ids.get(google)), `Google #${google} stays`)
    }
    assert.equal(kept.length, 20)
  }
)
