// A collected video is stored with the width and height its own MP4 header names (`domain/video-size.mjs`), so its brief
// asset has an orientation and a grade like a photograph instead of "unknown" (F08).
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { websiteOpportunitiesDomain } from 'website-opportunities/src/domain-loader.js'
import { createExecutor } from 'website-opportunities/src/executor.js'
import { imageInfoWith } from 'website-opportunities/src/media-info.js'
import { fileDb } from './_db.mjs'
import { createTracyWoHost } from '../src/wo-host.js'

const woHost = createTracyWoHost()
const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const box = (type, ...parts) => {
  const body = Buffer.concat(parts)
  const head = Buffer.alloc(8)
  head.writeUInt32BE(8 + body.length, 0)
  head.write(type, 4, 'latin1')
  return Buffer.concat([head, body])
}
/** A portrait phone video: one 720x1280 track header. */
function portraitMp4() {
  const tkhd = Buffer.alloc(84)
  tkhd.writeInt32BE(65536, 40)
  tkhd.writeInt32BE(65536, 56)
  tkhd.writeUInt32BE(720 * 65536, 76)
  tkhd.writeUInt32BE(1280 * 65536, 80)
  return new Uint8Array(
    Buffer.concat([
      box('ftyp', Buffer.from('isom\0\0\0\0isom', 'latin1')),
      box('moov', box('trak', box('tkhd', tkhd))),
      box('mdat', Buffer.alloc(64))
    ])
  )
}

const blocked = {
  available: false,
  reason: 'credential_missing',
  collect: async () => ({
    status: 'blocked',
    reason: 'credential_missing',
    media: [],
    coverage: { fetched: 0 }
  })
}

test('a collected video is stored with the size its header names', opts, async () => {
  const { pool } = db
  const account = (await pool.query(`insert into account (email) values ('a@tracy.test') returning id`))
    .rows[0].id
  const opp = (
    await pool.query(
      `insert into wo_opportunity (account_id, name, provider, provider_id, candidate)
       values ($1, 'Harbour Sport Club', 'osm', 'node/1', $2) returning *`,
      [
        account,
        JSON.stringify({
          provider: 'osm',
          providerId: 'node/1',
          website: 'https://hsc.example/',
          socials: {}
        })
      ]
    )
  ).rows[0]
  await pool.query(
    `insert into wo_job (account_id, opportunity_id, kind, request_id) values ($1, $2, 'research', 'req-00000002')`,
    [account, opp.id]
  )
  const real = await websiteOpportunitiesDomain()
  const video = portraitMp4()
  const domain = {
    ...real,
    connectorsFor: () => ({
      website: {
        available: true,
        collect: async () => ({
          source: 'website',
          status: 'complete',
          profile: { name: 'Harbour Sport Club' },
          pages: [{ url: 'https://hsc.example/', title: 'Harbour Sport Club', text: 'Coaching' }],
          media: [{ url: 'https://hsc.example/rally.mp4', kind: 'video', sourceUrl: 'https://hsc.example/' }],
          coverage: { fetched: 1, total: 1 }
        })
      },
      facebook: blocked,
      instagram: blocked,
      tiktok: blocked,
      youtube: blocked
    }),
    fetchLimited: async (u) => ({ url: u, status: 200, mime: 'video/mp4', bytes: video, truncated: false })
  }
  const ex = createExecutor({
    host: woHost,
    pool,
    loadDomain: async () => domain,
    objects: { put: async () => true },
    switchOn: async () => true,
    imageInfo: imageInfoWith(woHost),
    resolve: async () => [{ address: '93.184.216.34', family: 4 }],
    fetchImpl: async () => {
      throw new Error('no network in tests')
    },
    log: { warn() {}, error() {}, log() {} }
  })
  await (await ex.tick()).done
  const rows = (
    await pool.query(`select kind, status, width, height from wo_media where opportunity_id = $1`, [opp.id])
  ).rows
  assert.deepEqual(rows, [{ kind: 'video', status: 'stored', width: 720, height: 1280 }])
})
