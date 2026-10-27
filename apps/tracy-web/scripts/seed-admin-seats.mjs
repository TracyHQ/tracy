#!/usr/bin/env node
/**
 * Give the operators of a NEW deployment their staff seats: the `tracy_admin` workspace and one
 * accepted seat in it per email, so `/ops` opens for them on a database with nobody in it yet — a
 * shard, where accounts are mirrors made by adopt and no door ever creates a staff seat
 * (`POST /workspaces` never takes `kind`, workspaces/store.js `createWorkspace`).
 *
 * Idempotent. An existing `tracy_admin` workspace is reused; an existing seat is left exactly as it
 * is — a revoked one stays revoked, because reopening a seat somebody closed is a person's
 * decision. Two `tracy_admin` workspaces is a book this script does not guess about: it refuses.
 *
 * Run where tracy-web runs: it needs that container's DATABASE_URL and imports ../src. The image
 * carries it (apps/tracy-web/Dockerfile names it):
 *
 *   docker exec <tracy-web> node scripts/seed-admin-seats.mjs anh@example.com,em@example.com
 *   docker exec <tracy-web> node scripts/seed-admin-seats.mjs --role admin ops@example.com
 *
 * Migrates first (the same `migrate()` server.js runs at boot), so it also works against a database
 * tracy-web has not booted on yet. Prints one JSON line: the workspace, and each seat granted|kept.
 */
import { createPool, migrate } from '../src/db/index.js'

/** The staff ladder of a `tracy_admin` workspace (078-three-roles.sql's trigger enforces it too). */
export const STAFF_ROLES = Object.freeze(['owner', 'admin', 'developer', 'editor'])
export const DEFAULT_WORKSPACE_NAME = 'Tracy staff'
const EMAIL = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/

/** A refusal with a reason a person can act on; anything else is a bug and is thrown as it is. */
export class SeedError extends Error {}

/** `' A@example.com, b@example.com '` → `['a@example.com', 'b@example.com']`: trimmed, lowercased, de-duplicated, in order. */
export function parseEmails(raw) {
  const emails = [
    ...new Set(
      String(raw ?? '')
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
    )
  ]
  if (emails.length === 0) throw new SeedError('name at least one email')
  const bad = emails.filter((e) => !EMAIL.test(e))
  if (bad.length > 0) throw new SeedError(`not an email address: ${bad.join(', ')}`)
  return emails
}

/**
 * @param {import('pg').Pool} pool
 * @param {{ emails: string[], role?: string, workspaceName?: string }} input
 */
export async function seedAdminSeats(
  pool,
  { emails, role = 'owner', workspaceName = DEFAULT_WORKSPACE_NAME }
) {
  if (!STAFF_ROLES.includes(role)) throw new SeedError(`role must be one of ${STAFF_ROLES.join(', ')}`)
  const list = parseEmails(emails.join(','))
  const client = await pool.connect()
  try {
    await client.query('begin')
    // Two installers on one database must not both create the workspace.
    await client.query("select pg_advisory_xact_lock(hashtext('seed-admin-seats'))")
    const existing = (
      await client.query("select id from workspace where kind = 'tracy_admin' order by created_at")
    ).rows
    if (existing.length > 1)
      throw new SeedError(`${existing.length} tracy_admin workspaces exist; settle the book by hand first`)
    const created = existing.length === 0
    const workspaceId = created
      ? (
          await client.query(
            "insert into workspace (display_name, kind) values ($1, 'tracy_admin') returning id",
            [workspaceName]
          )
        ).rows[0].id
      : existing[0].id
    const seats = []
    for (const email of list) {
      const accountId = (
        await client.query(
          'insert into account (email) values ($1) on conflict (email) do update set email = excluded.email returning id',
          [email]
        )
      ).rows[0].id
      const granted = await client.query(
        `insert into seat_workspace (workspace_id, account_id, role, granted_by, accepted_at)
         values ($1, $2, $3, $2, now())
         on conflict (workspace_id, account_id) do nothing
         returning account_id`,
        [workspaceId, accountId, role]
      )
      seats.push({ email, status: granted.rowCount === 1 ? 'granted' : 'kept' })
    }
    await client.query('commit')
    return { workspace: { id: workspaceId, created }, seats }
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

function parseArgs(argv) {
  let role = 'owner'
  let workspaceName = DEFAULT_WORKSPACE_NAME
  const rest = []
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--role') role = argv[++i]
    else if (argv[i] === '--workspace-name') workspaceName = argv[++i]
    else if (argv[i].startsWith('--')) throw new SeedError(`unknown option ${argv[i]}`)
    else rest.push(argv[i])
  }
  if (!role || !workspaceName) throw new SeedError('--role and --workspace-name need a value')
  return { emails: parseEmails(rest.join(',')), role, workspaceName }
}

async function main(argv) {
  let args
  try {
    args = parseArgs(argv)
  } catch (error) {
    process.stderr.write(
      `seed-admin-seats: ${error.message}\nusage: seed-admin-seats.mjs [--role owner|admin|developer|editor] [--workspace-name <name>] <email>[,<email>...]\n`
    )
    return 2
  }
  const url = process.env.DATABASE_URL
  if (!url) {
    process.stderr.write(
      'seed-admin-seats: DATABASE_URL is required (run it inside the tracy-web container)\n'
    )
    return 1
  }
  const pool = createPool(url)
  try {
    await migrate(pool)
    const report = await seedAdminSeats(pool, args)
    process.stdout.write(`${JSON.stringify(report)}\n`)
    return 0
  } catch (error) {
    if (!(error instanceof SeedError)) throw error
    process.stderr.write(`seed-admin-seats: ${error.message}\n`)
    return 1
  } finally {
    await pool.end()
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      console.error(error)
      process.exit(1)
    }
  )
}
