/**
 * The two tables behind `discord/route.js` (`080-discord-link.sql`), plus the same contract in
 * memory for the one configuration with no database (`DATABASE_URL` unset), the way
 * `identity/store.js` keeps both.
 */

/** @param {import('pg').Pool} pool */
export function pgDiscordStore(pool) {
  return {
    /** A new code replaces the member's earlier one and resets its attempts. */
    async putCode({ discordId, email, codeHash, expiresAt }) {
      await pool.query(
        `insert into discord_link_code (discord_id, email, code_hash, expires_at, attempts)
         values ($1, $2, $3, $4, 0)
         on conflict (discord_id) do update set email = excluded.email, code_hash = excluded.code_hash,
           expires_at = excluded.expires_at, attempts = 0`,
        [discordId, email, codeHash, new Date(expiresAt)]
      )
    },
    async takeCode(discordId) {
      const row = (
        await pool.query('select email, code_hash, expires_at from discord_link_code where discord_id = $1', [
          discordId
        ])
      ).rows[0]
      return row ? { email: row.email, codeHash: row.code_hash, expiresAt: row.expires_at.getTime() } : null
    },
    async bumpAttempts(discordId) {
      const row = (
        await pool.query(
          'update discord_link_code set attempts = attempts + 1 where discord_id = $1 returning attempts',
          [discordId]
        )
      ).rows[0]
      return row?.attempts ?? Number.POSITIVE_INFINITY
    },
    async deleteCode(discordId) {
      await pool.query('delete from discord_link_code where discord_id = $1', [discordId])
    },
    /** One address, one member: whatever either side was linked to before is let go. */
    async link({ discordId, email }) {
      const client = await pool.connect()
      try {
        await client.query('begin')
        await client.query('delete from discord_link where email = $1 or discord_id = $2', [email, discordId])
        await client.query('insert into discord_link (email, discord_id) values ($1, $2)', [email, discordId])
        await client.query('commit')
      } catch (error) {
        await client.query('rollback').catch(() => {})
        throw error
      } finally {
        client.release()
      }
    },
    async emailOf(discordId) {
      return (
        (await pool.query('select email from discord_link where discord_id = $1', [discordId])).rows[0]
          ?.email ?? null
      )
    },
    /** The member left the server: the link goes, so a return proves the address again. */
    async unlink(discordId) {
      await pool.query('delete from discord_link where discord_id = $1', [discordId])
    }
  }
}

export function memoryDiscordStore() {
  const codes = new Map()
  const links = new Map()
  return {
    async putCode({ discordId, email, codeHash, expiresAt }) {
      codes.set(discordId, { email, codeHash, expiresAt, attempts: 0 })
    },
    async takeCode(discordId) {
      const row = codes.get(discordId)
      return row ? { email: row.email, codeHash: row.codeHash, expiresAt: row.expiresAt } : null
    },
    async bumpAttempts(discordId) {
      const row = codes.get(discordId)
      if (!row) return Number.POSITIVE_INFINITY
      row.attempts += 1
      return row.attempts
    },
    async deleteCode(discordId) {
      codes.delete(discordId)
    },
    async link({ discordId, email }) {
      for (const [id, linked] of links) if (id === discordId || linked === email) links.delete(id)
      links.set(discordId, email)
    },
    async emailOf(discordId) {
      return links.get(discordId) ?? null
    },
    async unlink(discordId) {
      links.delete(discordId)
    }
  }
}
