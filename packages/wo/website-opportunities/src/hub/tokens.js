/**
 * Hub accounts and their bearer token (ADR 0036 Phase 3). One account per principal, one active token per account.
 * Only a sha256 of a token is stored; the token itself is returned once, at issue or rotate. Rotation revokes the old
 * token in the same transaction, so it stops working at once. Quota and receipts belong to the account: whoever holds
 * its token shares them.
 */
import { createHash, randomBytes } from 'node:crypto'

const TOKEN_RE = /^woh_[A-Za-z0-9_-]{43}$/
const PREFIX_LENGTH = 8

export const hashToken = (token) => createHash('sha256').update(token).digest('hex')

/** The hub account of a principal, made on first use. */
export async function ensureHubAccount(db, principalId) {
  const { rows } = await db.query(
    `insert into wo_hub_account (principal_id) values ($1)
     on conflict (principal_id) do update set principal_id = excluded.principal_id
     returning id, state`,
    [principalId]
  )
  return { accountId: rows[0].id, state: rows[0].state }
}

/** @param {{ pool: import('pg').Pool }} deps */
export function createHubTokens({ pool }) {
  async function inTransaction(fn) {
    const client = await pool.connect()
    try {
      await client.query('begin')
      const out = await fn(client)
      await client.query('commit')
      return out
    } catch (error) {
      await client.query('rollback').catch(() => {})
      throw error
    } finally {
      client.release()
    }
  }

  async function insertToken(db, accountId) {
    const token = `woh_${randomBytes(32).toString('base64url')}`
    const prefix = token.slice(4, 4 + PREFIX_LENGTH)
    await db.query('insert into wo_hub_token (account_id, token_hash, token_prefix) values ($1, $2, $3)', [
      accountId,
      hashToken(token),
      prefix
    ])
    return { token, prefix, accountId }
  }

  /** A first token. Throws `TOKEN_EXISTS` when the account already has an active one (rotate instead). */
  async function issue(principalId) {
    return inTransaction(async (db) => {
      const { accountId } = await ensureHubAccount(db, principalId)
      await db.query('select 1 from wo_hub_account where id = $1 for update', [accountId])
      const active = await db.query(
        'select 1 from wo_hub_token where account_id = $1 and revoked_at is null',
        [accountId]
      )
      if (active.rowCount)
        throw Object.assign(new Error('this account already has a token; rotate it instead'), {
          code: 'TOKEN_EXISTS'
        })
      return insertToken(db, accountId)
    })
  }

  /** A new token; the previous one (if any) is revoked in the same transaction. */
  async function rotate(principalId) {
    return inTransaction(async (db) => {
      const { accountId } = await ensureHubAccount(db, principalId)
      await db.query('select 1 from wo_hub_account where id = $1 for update', [accountId])
      await db.query(
        'update wo_hub_token set revoked_at = now() where account_id = $1 and revoked_at is null',
        [accountId]
      )
      return insertToken(db, accountId)
    })
  }

  /** Revokes the active token; false when there was none. The account, its quota and receipts stay. */
  async function revoke(principalId) {
    const { rowCount } = await pool.query(
      `update wo_hub_token t set revoked_at = now() from wo_hub_account a
       where t.account_id = a.id and a.principal_id = $1 and t.revoked_at is null`,
      [principalId]
    )
    return rowCount === 1
  }

  /** `{accountId, principalId}` of an active token on an active account, otherwise null. */
  async function authenticate(token) {
    if (typeof token !== 'string' || !TOKEN_RE.test(token)) return null
    const { rows } = await pool.query(
      `select a.id as account_id, a.principal_id from wo_hub_token t join wo_hub_account a on a.id = t.account_id
       where t.token_hash = $1 and t.revoked_at is null and a.state = 'active'`,
      [hashToken(token)]
    )
    return rows[0] ? { accountId: rows[0].account_id, principalId: rows[0].principal_id } : null
  }

  /** What a "your token" page may show: the account and the active token's prefix, never the token. */
  async function status(principalId) {
    const { rows } = await pool.query(
      `select a.id, a.state, t.token_prefix, t.created_at from wo_hub_account a
       left join wo_hub_token t on t.account_id = a.id and t.revoked_at is null
       where a.principal_id = $1`,
      [principalId]
    )
    const r = rows[0]
    return {
      accountId: r?.id ?? null,
      state: r?.state ?? null,
      tokenPrefix: r?.token_prefix ?? null,
      tokenCreatedAt: r?.created_at?.toISOString() ?? null
    }
  }

  return { issue, rotate, revoke, authenticate, status }
}
