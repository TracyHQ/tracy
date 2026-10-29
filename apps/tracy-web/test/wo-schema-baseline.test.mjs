// The schema the open Website Opportunities layer runs on (ADR 0036 decision 8): a new database gets the package's
// baseline, Tracy's existing database reaches the same target through its own chain (171/172 move the WO tables
// from `account` to `wo_principal`), and Tracy hands the `wo_*` schema over only after the live schema is verified
// equal to the baseline's target.
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { copyFile, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { migrate as tracyMigrate } from '../src/db/index.js'
import { BASELINE, migrate, readSchemaFiles, SCHEMA_DIR } from 'website-opportunities/src/schema/index.js'
import { adoptWoSchema, verifyWoSchema } from 'website-opportunities/src/schema/verify.js'
import { scratchPool } from './_db.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const TRACY_DIR = fileURLToPath(new URL('../src/db/migrations/', import.meta.url))
const PRINCIPAL = '171-wo-principal.sql'
const VALIDATE = '172-wo-principal-validate.sql'
const BEFORE_PRINCIPAL = '169-site-push.sql'

// Every package schema file in apply order. Tracy's chain carries some later ones with the same SQL (each Tracy copy
// is named here); the rest (the hub's) are applied by the package's migrator after adoption.
const packageFiles = async () => (await readSchemaFiles()).map((f) => f.name)
const TRACY_COPIES = {
  '0004-place-snapshot-guard.sql': '173-wo-place-snapshot-guard.sql',
  '0009-site-check-read-tier.sql': '176-wo-site-check-read-tier.sql',
  '0010-monid-key.sql': '186-wo-monid-key.sql'
}
const CARRIED = Object.keys(TRACY_COPIES)
const afterBaseline = async () =>
  (await packageFiles()).filter((name) => name > BASELINE && !CARRIED.includes(name))
const TRACY_TARGET = { through: BASELINE, carried: CARRIED }

const open = []
after(async () => {
  for (const close of open) await close()
})

async function scratch() {
  const s = await scratchPool()
  open.push(s.close)
  const lockId = createHash('sha256').update(s.url).digest().readUInt32BE(0)
  return { ...s, lockId }
}

const recorded = async (pool) =>
  (
    await pool.query('select count(*)::int as n from schema_migration where name = any($1)', [
      [PRINCIPAL, VALIDATE]
    ])
  ).rows[0].n

/** Tracy's migration folder cut after `last` (inclusive), as a temp folder. */
async function tracyChainThrough(last) {
  const dir = await mkdtemp(join(tmpdir(), 'wo-schema-chain-'))
  for (const name of (await readdir(TRACY_DIR)).filter((f) => f.endsWith('.sql') && f <= last)) {
    await copyFile(join(TRACY_DIR, name), join(dir, name))
  }
  return dir
}

const markerRows = async (pool) => {
  const { rows } = await pool.query(`select to_regclass('wo_schema_migration') as t`)
  if (!rows[0].t) return []
  return (await pool.query('select name, how from wo_schema_migration order by name')).rows
}

test(
  'a new database migrated by the package has exactly the target schema, and no Tracy table',
  opts,
  async () => {
    const { pool, lockId } = await scratch()
    const first = await migrate(pool, { lockId })
    assert.deepEqual(first.applied, await packageFiles())
    assert.deepEqual(await verifyWoSchema(pool), [])
    const { rows } = await pool.query(
      `select to_regclass('account') as account, to_regclass('wo_principal') as principal`
    )
    assert.equal(rows[0].account, null)
    assert.equal(rows[0].principal, 'wo_principal')
    // Build-layer tables stay in Tracy's chain.
    const build = await pool.query(
      `select to_regclass('wo_revision') as r, to_regclass('wo_build') as b, to_regclass('wo_demo_action') as d`
    )
    assert.deepEqual(build.rows[0], { r: null, b: null, d: null })
  }
)

test('migrate twice is a no-op, and an applied file whose checksum changed is refused', opts, async () => {
  const { pool, lockId } = await scratch()
  const dir = await mkdtemp(join(tmpdir(), 'wo-schema-files-'))
  for (const name of await readdir(SCHEMA_DIR)) {
    if (name.endsWith('.sql')) await copyFile(join(SCHEMA_DIR, name), join(dir, name))
  }
  assert.deepEqual((await migrate(pool, { dir, lockId })).applied, await packageFiles())
  assert.deepEqual((await migrate(pool, { dir, lockId })).applied, [])
  const file = join(dir, '0001-baseline.sql')
  await writeFile(file, `${await readFile(file, 'utf8')}\n-- edited after it was applied\n`)
  await assert.rejects(migrate(pool, { dir, lockId }), /0001-baseline\.sql.*checksum/)
})

test('migrate refuses a database that already holds the tables but was never adopted', opts, async () => {
  const { pool, lockId } = await scratch()
  await tracyMigrate(pool, TRACY_DIR, { lockId })
  await assert.rejects(migrate(pool, { lockId }), /adoptWoSchema/)
  assert.deepEqual(await markerRows(pool), [])
})

test(
  "Tracy's full chain reaches the target; adoption writes the marker once, then the package owns the schema",
  opts,
  async () => {
    const { pool, lockId } = await scratch()
    await tracyMigrate(pool, TRACY_DIR, { lockId })
    assert.deepEqual(await verifyWoSchema(pool, TRACY_TARGET), [])
    const first = await adoptWoSchema(pool, { lockId, carried: CARRIED })
    assert.equal(first.adopted, true)
    const adopted = [BASELINE, ...CARRIED].map((name) => ({ name, how: 'adopted' }))
    assert.deepEqual(await markerRows(pool), adopted)
    const second = await adoptWoSchema(pool, { lockId, carried: CARRIED })
    assert.equal(second.adopted, false)
    assert.deepEqual(second.differences, [])
    assert.deepEqual(await markerRows(pool), adopted)
    // From the marker on, the package's migrator takes over: only the files after the baseline are left to apply.
    assert.deepEqual((await migrate(pool, { lockId })).applied, await afterBaseline())
    assert.deepEqual(await verifyWoSchema(pool), [])
  }
)

test(
  'verification names each kind of drift: type, null, default, index, foreign key, trigger',
  opts,
  async () => {
    const { pool, lockId } = await scratch()
    await tracyMigrate(pool, TRACY_DIR, { lockId })
    await pool.query(`
    alter table wo_place_ops_event alter column actor type varchar(500);
    alter table wo_opportunity alter column name drop not null;
    alter table wo_place_job alter column attempt set default 7;
    drop index wo_place_job_one_queued;
    alter table wo_source drop constraint wo_source_opportunity_id_fkey;
    drop trigger wo_place_media_immutable on wo_place_media;
    create index wo_place_extra on wo_place (created_at);
  `)
    const diffs = await verifyWoSchema(pool, TRACY_TARGET)
    const seen = diffs.map((d) => `${d.table}|${d.kind}|${d.name}|${d.problem}`).sort()
    assert.deepEqual(seen, [
      'wo_opportunity|column|name|changed',
      'wo_place_job|column|attempt|changed',
      'wo_place_job|index|wo_place_job_one_queued|missing',
      'wo_place_media|trigger|wo_place_media_immutable|missing',
      'wo_place_ops_event|column|actor|changed',
      'wo_place|index|wo_place_extra|unexpected',
      'wo_source|constraint|wo_source_opportunity_id_fkey|missing'
    ])
  }
)

test('a failure in the middle of adoption leaves no marker', opts, async () => {
  const { pool, lockId } = await scratch()
  await tracyMigrate(pool, TRACY_DIR, { lockId })

  // Drift: verification refuses, nothing is written.
  await pool.query('drop trigger wo_place_media_immutable on wo_place_media')
  const refused = await adoptWoSchema(pool, { lockId, carried: CARRIED })
  assert.equal(refused.adopted, false)
  assert.equal(refused.differences.length, 1)
  assert.deepEqual(await markerRows(pool), [])
  await pool.query(`create trigger wo_place_media_immutable before update or delete on wo_place_media
    for each row execute function wo_place_media_guard()`)

  // The marker write itself fails after a clean verification: the transaction leaves nothing behind.
  const failing = {
    connect: async () => {
      const client = await pool.connect()
      const query = client.query.bind(client)
      client.query = (sql, ...rest) => {
        if (typeof sql === 'string' && /insert into wo_schema_migration/i.test(sql)) {
          return Promise.reject(new Error('disk full'))
        }
        return query(sql, ...rest)
      }
      const release = client.release.bind(client)
      // The client goes back to the shared pool: hand it back unpatched.
      client.release = (...args) => {
        client.query = query
        client.release = release
        return release(...args)
      }
      return client
    }
  }
  await assert.rejects(adoptWoSchema(failing, { lockId, carried: CARRIED }), /disk full/)
  assert.deepEqual(await markerRows(pool), [])
  assert.equal((await adoptWoSchema(pool, { lockId, carried: CARRIED })).adopted, true)
})

test(
  '171/172 on a database with WO rows: every row keeps its data, one principal per account, FKs hold',
  opts,
  async () => {
    const { pool, lockId } = await scratch()
    await tracyMigrate(pool, await tracyChainThrough(BEFORE_PRINCIPAL), { lockId })
    const account = async (email) =>
      (await pool.query('insert into account (email) values ($1) returning id', [email])).rows[0].id
    const a = await account('a@example.com')
    const b = await account('b@example.com')
    const idle = await account('idle@example.com')
    for (const who of [a, b]) {
      await pool.query(`insert into wo_preference (account_id, cms) values ($1, 'emdash')`, [who])
      const opp = (
        await pool.query(
          `insert into wo_opportunity (account_id, name, provider, provider_id) values ($1, 'Cafe', 'google', $2) returning id`,
          [who, `g-${who}`]
        )
      ).rows[0].id
      await pool.query(
        `insert into wo_job (account_id, opportunity_id, kind, request_id) values ($1, $2, 'research', $3)`,
        [who, opp, `r-${who}`]
      )
      await pool.query(
        `insert into wo_media (account_id, opportunity_id, sha256, kind, source, source_url)
       values ($1, $2, 'abc', 'image', 'google', 'https://example.com/a.jpg')`,
        [who, opp]
      )
      await pool.query(
        `insert into wo_bulk_request (account_id, request_id, action, request_hash) values ($1, $2, 'cancel', 'h')`,
        [who, `b-${who}`]
      )
      const place = (await pool.query('insert into wo_place default values returning id')).rows[0].id
      await pool.query(
        `insert into wo_place_job (place_id, started_by, started_by_account_id) values ($1, 'account', $2)`,
        [place, who]
      )
      await pool.query(
        `insert into wo_cost_ledger (budget_day, provider, operation, reserved_cents, payer, payer_account_id, account_id)
       values (current_date, 'google', 'search', 3, 'account', $1, $1)`,
        [who]
      )
    }
    const tables = [
      'wo_preference',
      'wo_opportunity',
      'wo_job',
      'wo_media',
      'wo_bulk_request',
      'wo_place_job',
      'wo_cost_ledger'
    ]
    const dump = async () => {
      const out = {}
      for (const t of tables) out[t] = (await pool.query(`select * from ${t} order by 1`)).rows
      return out
    }
    const before = await dump()

    const done = await tracyMigrate(pool, TRACY_DIR, { lockId })
    assert.ok(done.applied.includes(PRINCIPAL) && done.applied.includes(VALIDATE))
    assert.equal(await recorded(pool), 2)
    assert.deepEqual(await dump(), before)

    const principals = (await pool.query('select id, kind, external_ref from wo_principal order by id')).rows
    const accounts = (await pool.query('select id from account order by id')).rows
    assert.deepEqual(
      principals,
      accounts.map(({ id }) => ({ id, kind: 'tracy_account', external_ref: id }))
    )
    assert.ok(principals.some((p) => p.id === idle))

    const targets = async () =>
      (
        await pool.query(
          `select conrelid::regclass::text as tbl, confrelid::regclass::text as ref from pg_constraint
         where contype = 'f' and conrelid::regclass::text = any($1) and confrelid::regclass::text in ('account', 'wo_principal')
         order by 1`,
          [tables]
        )
      ).rows
    assert.deepEqual(
      (await targets()).map((r) => r.ref),
      Array(7).fill('wo_principal')
    )
    await assert.rejects(
      pool.query(`insert into wo_preference (account_id, cms) values ($1, 'emdash')`, [randomUUID()]),
      (e) => e.code === '23503'
    )

    // Every re-pointed FK ends validated, as the baseline declares it.
    const unvalidated = await pool.query(
      `select conname from pg_constraint where contype = 'f' and not convalidated and conrelid::regclass::text = any($1)`,
      [tables]
    )
    assert.deepEqual(unvalidated.rows, [])

    // The documented rollback restores the FKs to `account` without touching a row; the chain then applies both again.
    const sql = await readFile(join(TRACY_DIR, PRINCIPAL), 'utf8')
    const rollback = sql
      .split('-- ROLLBACK BEGIN')[1]
      .split('-- ROLLBACK END')[0]
      .split('\n')
      .map((line) => line.replace(/^-- ?/, ''))
      .join('\n')
    await pool.query(rollback)
    assert.deepEqual(
      (await targets()).map((r) => r.ref),
      Array(7).fill('account')
    )
    assert.equal((await pool.query(`select to_regclass('wo_principal') as t`)).rows[0].t, null)
    assert.deepEqual(await dump(), before)
    assert.equal(await recorded(pool), 0)
    assert.deepEqual((await tracyMigrate(pool, TRACY_DIR, { lockId })).applied, [PRINCIPAL, VALIDATE])
    assert.equal(await recorded(pool), 2)
    assert.deepEqual((await tracyMigrate(pool, TRACY_DIR, { lockId })).applied, [])
    assert.deepEqual(await dump(), before)

    // A new account can open WO at once; deleting an account still removes its WO rows and clears what it started.
    const c = await account('c@example.com')
    await pool.query(`insert into wo_preference (account_id, cms) values ($1, 'wordpress')`, [c])
    await pool.query('delete from account where id = $1', [a])
    assert.equal(
      (await pool.query('select count(*)::int as n from wo_opportunity where account_id = $1', [a])).rows[0]
        .n,
      0
    )
    assert.equal(
      (await pool.query('select count(*)::int as n from wo_opportunity where account_id = $1', [b])).rows[0]
        .n,
      1
    )
    const started = (
      await pool.query(
        'select started_by_account_id from wo_place_job order by started_by_account_id nulls first'
      )
    ).rows
    assert.deepEqual(
      started.map((r) => r.started_by_account_id),
      [null, b]
    )
    assert.equal(
      (await pool.query('select count(*)::int as n from wo_principal where id = $1', [a])).rows[0].n,
      0
    )
  }
)

test(
  '171 does not deadlock a writer that already holds wo_cost_ledger and then checks its payer account',
  opts,
  async () => {
    const { pool, lockId } = await scratch()
    await tracyMigrate(pool, await tracyChainThrough(BEFORE_PRINCIPAL), { lockId })
    const payer = (await pool.query(`insert into account (email) values ('p@example.com') returning id`))
      .rows[0].id
    const writer = await pool.connect()
    const ledger = (who) =>
      writer.query(
        `insert into wo_cost_ledger (budget_day, provider, operation, reserved_cents, payer, payer_account_id)
         values (current_date, 'google', 'search', 1, $1, $2)`,
        [who ? 'account' : null, who]
      )
    try {
      // A live request's transaction: it holds wo_cost_ledger before the deploy's migration starts.
      await writer.query('begin')
      await ledger(null)
      const writerPid = (await writer.query('select pg_backend_pid() as p')).rows[0].p
      const migrating = tracyMigrate(pool, TRACY_DIR, { lockId })
      const waiting = async () =>
        (
          await pool.query(
            `select count(*)::int as n from pg_locks where not granted and pid <> $1 and pid <> pg_backend_pid()`,
            [writerPid]
          )
        ).rows[0].n
      const deadline = Date.now() + 10_000
      while ((await waiting()) === 0) {
        assert.ok(Date.now() < deadline, 'the migration never queued behind the writer')
        await new Promise((r) => setTimeout(r, 20))
      }
      // The same transaction now checks its payer against the referenced table, then commits.
      await ledger(payer)
      await writer.query('commit')
      const { applied } = await migrating
      assert.ok(applied.includes(PRINCIPAL) && applied.includes(VALIDATE))
      assert.equal(
        (
          await pool.query('select count(*)::int as n from wo_cost_ledger where payer_account_id = $1', [
            payer
          ])
        ).rows[0].n,
        1
      )
      assert.deepEqual(await verifyWoSchema(pool, TRACY_TARGET), [])
    } finally {
      writer.release()
    }
  }
)

test(
  'a host that does not declare the guard it carries is refused adoption, naming the guard',
  opts,
  async () => {
    const { pool, lockId } = await scratch()
    await tracyMigrate(pool, TRACY_DIR, { lockId })
    const refused = await adoptWoSchema(pool, { lockId })
    assert.equal(refused.adopted, false)
    assert.ok(
      refused.differences.some((d) => d.kind === 'trigger' && d.name === 'wo_place_snapshot_immutable')
    )
    assert.deepEqual(await markerRows(pool), [])
  }
)

test(
  "a database adopted at the baseline alone gets the guard from the package; Tracy's copy then changes nothing",
  opts,
  async () => {
    const { pool, lockId } = await scratch()
    await tracyMigrate(pool, await tracyChainThrough('172-wo-principal-validate.sql'), { lockId })
    assert.deepEqual(await verifyWoSchema(pool, { through: BASELINE }), [])
    assert.equal((await adoptWoSchema(pool, { lockId })).adopted, true)
    assert.deepEqual((await migrate(pool, { lockId })).applied, (await packageFiles()).slice(1))
    assert.deepEqual(await verifyWoSchema(pool), [])
    // Tracy's chain after 172: its copies of package files, then migrations of its own (none touches the open schema).
    const after = (await readdir(TRACY_DIR))
      .filter((f) => f.endsWith('.sql') && f > '172-wo-principal-validate.sql')
      .sort()
    const applied = (await tracyMigrate(pool, TRACY_DIR, { lockId })).applied
    assert.deepEqual(applied, after)
    for (const copy of Object.values(TRACY_COPIES)) assert.ok(applied.includes(copy), copy)
    assert.deepEqual(await verifyWoSchema(pool), [])
  }
)

test("Tracy's copy of each package file it carries is the same SQL", async () => {
  const tracy = (await readdir(TRACY_DIR)).filter((f) => f.endsWith('.sql'))
  for (const [name, copy] of Object.entries(TRACY_COPIES)) {
    assert.ok(tracy.includes(copy), `${name} has its copy ${copy} in Tracy's chain`)
    assert.equal(
      await readFile(join(TRACY_DIR, copy), 'utf8'),
      await readFile(join(SCHEMA_DIR, name), 'utf8')
    )
  }
})
