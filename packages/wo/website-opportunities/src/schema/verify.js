/**
 * Compare a live database with the schema the package's files describe, and adopt a database that reached that
 * schema through another migration history.
 *
 * The target is never a hand-kept copy: the files are applied inside a throwaway schema in the same transaction, read
 * back from the catalog, and rolled back. Live and target are read by the same queries, so a difference is a real one.
 */
import { createHash, randomBytes } from 'node:crypto'
import { BASELINE, LEDGER_SQL, LOCK_ID, SCHEMA_DIR, readLedger, readSchemaFiles } from './index.js'

/**
 * @typedef {{ table: string | null, kind: 'table' | 'column' | 'constraint' | 'index' | 'trigger' | 'function' | 'sequence',
 *   name: string, problem: 'missing' | 'unexpected' | 'changed', expected?: unknown, actual?: unknown }} SchemaDifference
 */

/**
 * The differences between the live schema and the target of the package's files (all of them, or up to `through`).
 * Tables the target does not define are not looked at: a host may keep tables of its own next to these.
 *
 * @param {import('pg').Pool} pool
 * `carried`: later files a host's own chain already ran (the same SQL), compared as applied even past `through`.
 * @param {{ dir?: string, through?: string, carried?: string[] }} [options]
 * @returns {Promise<SchemaDifference[]>}
 */
export async function verifyWoSchema(pool, { dir = SCHEMA_DIR, through, carried = [] } = {}) {
  const files = await targetFiles(dir, through, carried)
  const client = await pool.connect()
  try {
    await client.query('begin')
    return (await compare(client, files)).differences
  } finally {
    await client.query('rollback').catch(() => {})
    client.release()
  }
}

/**
 * Record that this database's `wo_*` schema is now the package's, as if the baseline had been applied. Written only
 * when the live schema equals the baseline's target, in the same transaction as the check, under the migration lock.
 * `carried` names later package files the host's own migration chain already ran with the same SQL: they are part of
 * the compared target and recorded as adopted too, so the package's migrator applies only the rest.
 * Running it again on an adopted (or package-migrated) database changes nothing.
 *
 * @param {import('pg').Pool | { connect: () => Promise<import('pg').PoolClient> }} pool
 * @param {{ dir?: string, lockId?: number, carried?: string[] }} [options]
 * @returns {Promise<{ adopted: boolean, differences: SchemaDifference[], target?: string }>}
 */
export async function adoptWoSchema(pool, { dir = SCHEMA_DIR, lockId = LOCK_ID, carried = [] } = {}) {
  const files = await targetFiles(dir, BASELINE, carried)
  const client = await pool.connect()
  try {
    await client.query('select pg_advisory_lock($1)', [lockId])
    await client.query('begin')
    try {
      if ((await readLedger(client)).has(BASELINE)) {
        await client.query('commit')
        return { adopted: false, differences: [] }
      }
      const { differences, target } = await compare(client, files)
      if (differences.length) {
        await client.query('rollback')
        return { adopted: false, differences }
      }
      await client.query(LEDGER_SQL)
      for (const file of files) {
        await client.query(
          `insert into wo_schema_migration (name, checksum, how, target) values ($1, $2, 'adopted', $3)`,
          [file.name, file.checksum, target]
        )
      }
      await client.query('commit')
      return { adopted: true, differences: [], target }
    } catch (error) {
      await client.query('rollback').catch(() => {})
      throw error
    }
  } finally {
    await client.query('select pg_advisory_unlock($1)', [lockId]).catch(() => {})
    client.release()
  }
}

async function targetFiles(dir, through, carried = []) {
  const all = await readSchemaFiles(dir)
  const files = all.filter((f) => !through || f.name <= through || carried.includes(f.name))
  if (!files.length || (through && !files.some((f) => f.name === through))) {
    throw new Error(`wo schema: no schema file ${through ?? ''} in ${dir}`)
  }
  const unknown = carried.filter((name) => !all.some((f) => f.name === name))
  if (unknown.length) throw new Error(`wo schema: no schema file ${unknown.join(', ')} in ${dir}`)
  return files
}

/** Must run inside a transaction: the target is built in a savepoint and rolled back. */
async function compare(client, files) {
  const scratch = `wo_target_${randomBytes(6).toString('hex')}`
  await client.query('savepoint wo_target')
  let target
  try {
    await client.query(`create schema ${scratch}`)
    await client.query(`set local search_path to ${scratch}`)
    for (const file of files) await client.query(file.sql)
    target = await describe(client, scratch, null)
  } finally {
    await client.query('rollback to savepoint wo_target')
    await client.query('release savepoint wo_target')
  }
  const live = (await client.query('select current_schema() as s')).rows[0].s
  const actual = await describe(client, live, target)
  return { differences: diff(target, actual), target: fingerprint(target) }
}

/**
 * The catalog's own rendering of every table, column, constraint, index, trigger, trigger function and sequence, with
 * the schema name taken out so two schemas compare. `like` limits the read to the objects the target names.
 */
async function describe(client, schema, like) {
  const strip = (text) =>
    text == null ? text : text.split(`"${schema}".`).join('').split(`${schema}.`).join('')
  const tableNames = like ? Object.keys(like.tables) : null
  const tables = (
    await client.query(
      `select c.oid, c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = $1 and c.relkind in ('r', 'p') and ($2::text[] is null or c.relname = any($2))`,
      [schema, tableNames]
    )
  ).rows
  const oids = tables.map((t) => t.oid)
  const out = { tables: {}, functions: {}, sequences: {} }
  for (const t of tables) out.tables[t.relname] = { column: {}, constraint: {}, index: {}, trigger: {} }

  const columns = await client.query(
    `select c.relname as tbl, a.attname as name, format_type(a.atttypid, a.atttypmod) as type, a.attnotnull as not_null,
            pg_get_expr(d.adbin, d.adrelid) as default, a.attidentity as identity, a.attgenerated as generated,
            co.collname as collation
     from pg_attribute a join pg_class c on c.oid = a.attrelid
     left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
     left join pg_collation co on co.oid = a.attcollation and a.attcollation <> 0
     where a.attrelid = any($1) and a.attnum > 0 and not a.attisdropped`,
    [oids]
  )
  for (const r of columns.rows) {
    out.tables[r.tbl].column[r.name] = {
      type: r.type,
      notNull: r.not_null,
      default: strip(r.default),
      identity: r.identity,
      generated: r.generated,
      collation: r.collation
    }
  }
  // Not-null constraints (contype 'n', Postgres 18) carry history-dependent names; nullability is read per column.
  const constraints = await client.query(
    `select c.relname as tbl, k.conname as name, pg_get_constraintdef(k.oid) as def, k.condeferrable, k.condeferred
     from pg_constraint k join pg_class c on c.oid = k.conrelid
     where k.conrelid = any($1) and k.contype <> 'n'`,
    [oids]
  )
  for (const r of constraints.rows) {
    out.tables[r.tbl].constraint[r.name] = {
      def: strip(r.def),
      deferrable: r.condeferrable,
      deferred: r.condeferred
    }
  }
  const indexes = await client.query(
    `select c.relname as tbl, i.relname as name, pg_get_indexdef(i.oid) as def
     from pg_index x join pg_class i on i.oid = x.indexrelid join pg_class c on c.oid = x.indrelid
     where x.indrelid = any($1)`,
    [oids]
  )
  for (const r of indexes.rows) out.tables[r.tbl].index[r.name] = { def: strip(r.def) }
  const triggers = await client.query(
    `select c.relname as tbl, t.tgname as name, pg_get_triggerdef(t.oid) as def, t.tgenabled as enabled,
            p.proname as fn
     from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_proc p on p.oid = t.tgfoid
     where t.tgrelid = any($1) and not t.tgisinternal`,
    [oids]
  )
  for (const r of triggers.rows) out.tables[r.tbl].trigger[r.name] = { def: strip(r.def), enabled: r.enabled }

  const fnNames = like ? Object.keys(like.functions) : triggers.rows.map((r) => r.fn)
  const functions = await client.query(
    `select p.proname as name, pg_get_functiondef(p.oid) as def from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace where n.nspname = $1 and p.proname = any($2)`,
    [schema, fnNames]
  )
  for (const r of functions.rows) out.functions[r.name] = { def: strip(r.def) }
  const sequences = await client.query(
    `select c.relname as name, format_type(s.seqtypid, null) as type, s.seqstart, s.seqincrement, s.seqmin, s.seqmax,
            s.seqcycle, s.seqcache
     from pg_sequence s join pg_class c on c.oid = s.seqrelid join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = $1 and ($2::text[] is null or c.relname = any($2))`,
    [schema, like ? Object.keys(like.sequences) : null]
  )
  for (const { name, ...rest } of sequences.rows) out.sequences[name] = rest
  return out
}

/** @returns {SchemaDifference[]} */
function diff(target, actual) {
  const differences = []
  const side = (table, kind, expected, found) => {
    for (const [name, value] of Object.entries(expected)) {
      if (!(name in found)) differences.push({ table, kind, name, problem: 'missing', expected: value })
      else if (stable(value) !== stable(found[name])) {
        differences.push({ table, kind, name, problem: 'changed', expected: value, actual: found[name] })
      }
    }
    for (const [name, value] of Object.entries(found)) {
      if (!(name in expected)) differences.push({ table, kind, name, problem: 'unexpected', actual: value })
    }
  }
  for (const [table, shape] of Object.entries(target.tables)) {
    const found = actual.tables[table]
    if (!found) {
      differences.push({ table, kind: 'table', name: table, problem: 'missing' })
      continue
    }
    for (const kind of /** @type {const} */ (['column', 'constraint', 'index', 'trigger'])) {
      side(table, kind, shape[kind], found[kind])
    }
  }
  side(null, 'function', target.functions, actual.functions)
  side(null, 'sequence', target.sequences, actual.sequences)
  return differences
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(value[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(value ?? null)
}

function fingerprint(target) {
  return createHash('sha256').update(stable(target)).digest('hex')
}
