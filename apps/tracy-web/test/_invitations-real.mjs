import { randomUUID } from 'node:crypto'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { freshPool } from './_db.mjs'
import { createCampaignKeyStore } from '../src/invitations/real-keys.js'
import { seal } from '../src/invitations/real-crypto.js'

export async function withRealDb(fn) {
  if (!process.env.TEST_DATABASE_URL) throw new Error('A private test database is required')
  const scratch = await freshPool()
  const root = await mkdtemp(join(await realpath(tmpdir()), 'invitations-real-db-'))
  try {
    return await fn({ pool: scratch.pool, keys: createCampaignKeyStore({ root }), root })
  } finally {
    await scratch.close()
    await rm(root, { recursive: true, force: true })
  }
}

export async function dbClock(pool) {
  return (await pool.query('select clock_timestamp() as now')).rows[0].now.toISOString()
}

export async function seedRealCampaign({ pool, keys, days = 30 }) {
  const id = randomUUID()
  const now = await dbClock(pool)
  const expiresAt = new Date(Date.parse(now) + days * 86400000).toISOString()
  await keys.create({ campaignId: id, now, initialImportedAt: now, expiresAt })
  const { key } = await keys.read({ campaignId: id, now })
  const payload = seal({
    key,
    context: { campaignId: id, recordId: id, purpose: 'campaign', version: 1 },
    bytes: Buffer.from(
      JSON.stringify({
        name: 'Synthetic canary company',
        registry: {},
        image: 'Synthetic canary image',
        email: 'canary@example.test',
        body: 'Synthetic canary body'
      })
    )
  })
  await pool.query(
    `insert into invitations_real_campaign(id,source_date,first_imported_at,expires_at,payload)
    values($1,'2026-10-07',$2,$3,$4)`,
    [id, now, expiresAt, payload]
  )
  return { id, revision: 1, expiresAt, firstImportedAt: now }
}

export function syntheticSnapshot({ total = 1340, offset = 0 } = {}) {
  const headers = [
    'user_id',
    'email',
    'nhom_gui',
    'goi',
    'template_tai_gan_nhat',
    'cong_ty',
    'website',
    'unsubscribed_toan_bo',
    'noi_bo',
    ...Array.from({ length: 34 }, (_, i) => `source_column_${i + 1}`)
  ]
  const groups = [
    '1 agency dang hoat dong',
    '2 agency it hoat dong',
    '3 doanh nghiep dang hoat dong',
    '4 doanh nghiep it hoat dong',
    '5 ca nhan'
  ]
  const ends = [318, 594, 697, 1048, 1340]
  const rows = Array.from({ length: total }, (_, i) => {
    const n = offset + i
    return [
      String(n + 1),
      `synthetic${n}@example.test`,
      groups[ends.findIndex((e) => n % 1340 < e)],
      'Synthetic plan',
      '',
      'Synthetic company <script>literal</script>',
      '',
      n % 1340 < 22 ? 'co' : 'khong',
      n % 1340 >= 21 && n % 1340 < 42 ? 'co' : '',
      ...Array.from({ length: 34 }, (_, j) =>
        j === 0 ? '=SUM(1,2)' : j === 1 ? 'Synthetic Unicode \u03a9' : ''
      )
    ]
  })
  return { headers, rows, csvBytes: snapshotCsv(headers, rows) }
}

export function snapshotCsv(headers, rows) {
  const cell = (s) => `"${s.replaceAll('"', '""')}"`
  return Buffer.from([headers, ...rows].map((row) => row.map(cell).join(',')).join('\n'))
}
