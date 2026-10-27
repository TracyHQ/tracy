/**
 * How a sign-in is named on the account's first-sign-in signal (`touchAccount`'s `via`), per
 * identity provider. `joomlart` is aMember's signed redirect (`route.js`, `/signin/joomlart`), not
 * an OAuth code exchange; it shares this table and the `identity` row shape, nothing else.
 */
const VIA_LABELS = Object.freeze({ google: 'Google', github: 'GitHub', joomlart: 'JoomlArt' })
const viaLabel = (provider) => VIA_LABELS[provider] ?? provider

/** How long a template waits on an account before the root landing stops answering it. */
const INTENT_TTL_MS = 7 * 24 * 60 * 60 * 1000

export function memoryIdentityStore() {
  let signal = null
  const codes = new Map()
  const accounts = new Map()
  const states = new Map()
  const links = new Map()
  // What `recordAudit` wrote, in order — the memory mirror of the `audit` table, readable by tests.
  const audits = []
  // `provider:subject` -> the same object stored in `accounts`, so a lookup here and a lookup by
  // email always agree on one account, without a second id-keyed index to keep in sync.
  const identities = new Map()
  // `provider:subject` -> the entitlement array of the last sign-in (`identity.entitlement`).
  const entitlements = new Map()
  const intents = new Map()
  // id -> a challenge row (`091-auth-challenge.sql`); the round's row going away takes its
  // challenges with it, as `on delete cascade` does in Postgres.
  const challenges = new Map()
  let challengeSeq = 0
  const dropChallenges = (nonceHash) => {
    for (const [id, row] of challenges) if (row.nonceHash === nonceHash) challenges.delete(id)
  }
  return {
    setSignal(value) {
      signal = value
    },
    async accountByEmail(email) {
      return accounts.get(email) ?? null
    },
    async accountForIdentity(provider, subject) {
      return identities.get(`${provider}:${subject}`) ?? null
    },
    async putCode({ email, codeHash, expiresAt, admission = null }) {
      codes.set(email, { codeHash, expiresAt, attempts: 0, admission })
    },
    async takeCode(email) {
      return codes.get(email) ?? null
    },
    async bumpAttempts(email) {
      const c = codes.get(email)
      if (!c) return 0
      c.attempts += 1
      return c.attempts
    },
    async deleteCode(email) {
      codes.delete(email)
    },
    async touchAccount(email, { admission = { badge: 'gate off', plans: [] }, via = 'email code' } = {}) {
      if (!accounts.has(email)) accounts.set(email, { id: crypto.randomUUID(), email, lastSeenAt: null })
      const account = accounts.get(email)
      const first = !account.lastSeenAt
      account.lastSeenAt = Date.now()
      if (first) {
        account.admission = admission
        await signal?.record('account.first_sign_in', {
          email,
          accountId: account.id,
          data: { ...admission, via },
          dedupeKey: `first:${account.id}`
        })
      }
      return { id: account.id, email: account.email }
    },
    async putState({ state, provider, next, expiresAt, source = null }) {
      states.set(state, { provider, next, expiresAt, source })
    },
    // The memory twin of `pgIdentityStore.rememberProfile`: same rule, on the same objects
    // `accountByEmail` answers, so `/auth/me` draws the picture without a database.
    async rememberProfile(accountId, { name = null, picture = null } = {}) {
      const account = [...accounts.values()].find((a) => a.id === accountId)
      if (!account) return
      if (picture) account.avatar_url = picture
      if (name && !account.display_name?.trim()) account.display_name = name
    },
    async avatarSourceFor(accountId) {
      return [...accounts.values()].find((a) => a.id === accountId)?.avatar_url ?? null
    },
    async rememberLanguage(email, language) {
      const account = accounts.get(email)
      if (!account || account.language === language) return false
      account.language = language
      return true
    },
    audits,
    async recordAudit({ actor, action, detail = {} }) {
      audits.push({ actor, action, site_key: null, detail: structuredClone(detail) })
    },
    // ── Device-link rounds (a lane's or the desktop app's sign-in), mirrored by `pgIdentityStore` ─
    async putLink({
      nonceHash,
      clientSecretHash,
      expiresAt,
      device = '',
      purpose = 'lane',
      emailHint = null
    }) {
      links.set(nonceHash, {
        clientSecretHash,
        email: '',
        status: 'pending',
        expiresAt,
        device,
        purpose,
        emailHint
      })
    },
    async linkByNonce(nonceHash) {
      const row = links.get(nonceHash)
      return row ? { ...row } : null
    },
    async approveLink(nonceHash, email) {
      const row = links.get(nonceHash)
      if (!row || row.status !== 'pending') return false
      row.email = email
      row.status = 'approved'
      return true
    },
    async denyLink(nonceHash) {
      const row = links.get(nonceHash)
      if (!row || row.status !== 'pending') return false
      row.status = 'denied'
      return true
    },
    // One shot, like `takeState`: the row is gone whichever way the secret compares, so a second
    // exchange — right or wrong — finds nothing. A desktop round is not the lane's to take: it is
    // left where it is, unburned.
    async takeLink(nonceHash) {
      const row = links.get(nonceHash) ?? null
      if (!row || row.purpose !== 'lane') return null
      links.delete(nonceHash)
      dropChallenges(nonceHash)
      return { ...row }
    },
    // ── Codes bound to one desktop round (`091-auth-challenge.sql`), mirrored by `pgIdentityStore` ─
    // Kill the round's live challenge and write the new one with no await in between: at most one
    // live challenge per round, and a resend can never bring an older code back.
    async putChallenge({ nonceHash, email, purpose = 'desktop', codeHash, expiresAt }) {
      for (const row of challenges.values())
        if (row.nonceHash === nonceHash && row.consumedAt === null) row.consumedAt = Date.now()
      const id = String(++challengeSeq)
      challenges.set(id, {
        id,
        nonceHash,
        email,
        purpose,
        codeHash,
        expiresAt,
        attempts: 0,
        consumedAt: null
      })
      return id
    },
    async tryChallenge(nonceHash, now) {
      for (const row of challenges.values()) {
        if (row.nonceHash !== nonceHash || row.consumedAt !== null || row.expiresAt <= now) continue
        row.attempts += 1
        return {
          id: row.id,
          email: row.email,
          purpose: row.purpose,
          codeHash: row.codeHash,
          attempts: row.attempts
        }
      }
      return null
    },
    async killChallenge(id) {
      const row = challenges.get(String(id))
      if (row && row.consumedAt === null) row.consumedAt = Date.now()
    },
    // Every condition checked and both rows written with no await in between — the memory twin of
    // the one transaction below: of two parallel presses exactly one approves.
    async approveWithChallenge({ id, nonceHash, email, maxAttempts, now }) {
      const challenge = challenges.get(String(id))
      const link = links.get(nonceHash)
      if (
        !challenge ||
        challenge.nonceHash !== nonceHash ||
        challenge.consumedAt !== null ||
        challenge.expiresAt <= now ||
        challenge.attempts > maxAttempts ||
        challenge.email !== email ||
        !link ||
        link.purpose !== 'desktop' ||
        link.status !== 'pending' ||
        link.expiresAt <= now ||
        link.emailHint !== email
      )
        return false
      challenge.consumedAt = now
      link.email = email
      link.status = 'approved'
      return true
    },
    // The app cancelling its own round: only a pending desktop round whose secret matches flips, the
    // memory twin of the one `update … where` statement below.
    async cancelDesktopLink({ nonceHash, clientSecretHash, now }) {
      const row = links.get(nonceHash)
      if (
        !row ||
        row.purpose !== 'desktop' ||
        row.status !== 'pending' ||
        row.clientSecretHash !== clientSecretHash ||
        row.expiresAt <= now
      )
        return false
      row.status = 'denied'
      return true
    },
    // Check and delete with no await in between — the memory twin of the one `delete … where`
    // statement below: of two concurrent redeems exactly one finds the row, and a wrong secret
    // leaves it in place.
    async redeemDesktopLink({ nonceHash, clientSecretHash, now }) {
      const row = links.get(nonceHash)
      if (
        !row ||
        row.purpose !== 'desktop' ||
        row.status !== 'approved' ||
        row.clientSecretHash !== clientSecretHash ||
        row.email === '' ||
        row.expiresAt <= now
      )
        return null
      links.delete(nonceHash)
      dropChallenges(nonceHash)
      return { email: row.email, device: row.device }
    },
    // Single-use: the row is gone the moment it is read, whether or not the caller likes what it
    // finds — a state string that already answered once must never answer twice.
    async takeState(state) {
      const row = states.get(state) ?? null
      states.delete(state)
      return row
    },
    async upsertOAuthIdentity(
      provider,
      subject,
      email,
      { admission = { badge: 'gate off', plans: [] }, entitlement = undefined } = {}
    ) {
      const key = `${provider}:${subject}`
      const existing = identities.get(key)
      const account = await this.touchAccount(existing?.email ?? email, {
        admission,
        via: viaLabel(provider)
      })
      identities.set(key, accounts.get(account.email))
      if (entitlement !== undefined) entitlements.set(key, structuredClone(entitlement))
      return account
    },
    /** The memory twin of `identity.entitlement`: what the last joomlart sign-in said, or null. */
    async entitlementFor(provider, subject) {
      return entitlements.get(`${provider}:${subject}`) ?? null
    },
    // A template waiting on an account (plan B6): one per account, the newest wins, seven days.
    async putDesktopIntent(accountId, template, platform = null) {
      intents.set(accountId, { template, platform, createdAt: Date.now() })
    },
    async peekDesktopIntent(email) {
      const account = accounts.get(email)
      const row = account ? intents.get(account.id) : null
      return row && row.createdAt > Date.now() - INTENT_TTL_MS
        ? { template: row.template, platform: row.platform }
        : null
    },
    async takeDesktopIntent(email, template = null) {
      const account = accounts.get(email)
      const row = account ? intents.get(account.id) : null
      if (!row || (template !== null && row.template !== template)) return null
      intents.delete(account.id)
      return row.createdAt > Date.now() - INTENT_TTL_MS ? row.template : null
    }
  }
}

export function pgIdentityStore(pool) {
  let signal = null
  return {
    setSignal(value) {
      signal = value
    },
    async accountByEmail(email) {
      const row = (await pool.query('select id, email, last_seen_at from account where email = $1', [email]))
        .rows[0]
      return row ? { id: row.id, email: row.email, lastSeenAt: row.last_seen_at } : null
    },
    async accountForIdentity(provider, subject) {
      const row = (
        await pool.query(
          'select a.id, a.email, a.last_seen_at from account a join identity i on i.account_id = a.id where i.provider = $1 and i.subject = $2',
          [provider, subject]
        )
      ).rows[0]
      return row ? { id: row.id, email: row.email, lastSeenAt: row.last_seen_at } : null
    },
    async putCode({ email, codeHash, expiresAt, admission = null }) {
      await pool.query(
        `insert into otp_code (email, code_hash, expires_at, attempts, admission) values ($1, $2, $3, 0, $4)
         on conflict (email) do update set code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0, created_at = now(), admission = excluded.admission`,
        [email, codeHash, new Date(expiresAt), admission]
      )
    },
    async takeCode(email) {
      const { rows } = await pool.query(
        'select code_hash, expires_at, attempts, admission from otp_code where email = $1',
        [email]
      )
      return rows[0]
        ? {
            codeHash: rows[0].code_hash,
            expiresAt: rows[0].expires_at.getTime(),
            attempts: rows[0].attempts,
            admission: rows[0].admission
          }
        : null
    },
    async bumpAttempts(email) {
      const { rows } = await pool.query(
        'update otp_code set attempts = attempts + 1 where email = $1 returning attempts',
        [email]
      )
      return rows[0]?.attempts ?? 0
    },
    async deleteCode(email) {
      await pool.query('delete from otp_code where email = $1', [email])
    },
    async touchAccount(email, { admission = { badge: 'gate off', plans: [] }, via = 'email code' } = {}) {
      const client = await pool.connect()
      try {
        await client.query('begin')
        await client.query('insert into account (email) values ($1) on conflict (email) do nothing', [email])
        const account = (
          await client.query('select id, last_seen_at from account where email = $1 for update', [email])
        ).rows[0]
        const first = account.last_seen_at === null
        await client.query(
          'update account set last_seen_at = now(), beta_admission = case when $2 then $3::jsonb else beta_admission end where email = $1',
          [email, first, admission]
        )
        if (first && signal) {
          await client.query('savepoint analytics')
          await client.query("set local statement_timeout = '500ms'")
          const event = await signal.record(
            'account.first_sign_in',
            { email, accountId: account.id, data: { ...admission, via }, dedupeKey: `first:${account.id}` },
            client
          )
          if (!event) await client.query('rollback to savepoint analytics')
          else await client.query('set local statement_timeout = default')
        }
        await client.query('commit')
        return { id: account.id }
      } catch (error) {
        await client.query('rollback')
        throw error
      } finally {
        client.release()
      }
    },
    /**
     * The interface language this person reads (`account.language`), the language mail somebody
     * else triggers reaches them in (ADR 0026 §5). Written on sign-in and from the Settings pick
     * (`route.js` says which value); an account that does not exist yet is left alone.
     * @returns {Promise<boolean>} whether the stored value changed.
     */
    async rememberLanguage(email, language) {
      const { rowCount } = await pool.query(
        'update account set language = $2 where email = $1 and language is distinct from $2',
        [email.toLowerCase(), language]
      )
      return rowCount > 0
    },
    /**
     * Keep the face the provider's profile gives (an OAuth sign-in, `identity/route.js`).
     * `picture` — an address `lib/avatar-source.js` already passed, or null — replaces the stored
     * one, because pictures change; null leaves the stored one alone. `name` fills
     * `display_name` only while it is empty: a name the person or an admin set is never replaced.
     */
    async rememberProfile(accountId, { name = null, picture = null } = {}) {
      if (!name && !picture) return
      await pool.query(
        `update account
            set avatar_url = coalesce($2, avatar_url),
                display_name = case when nullif(btrim(display_name), '') is null then coalesce($3, display_name)
                                    else display_name end
          where id = $1`,
        [accountId, picture, name]
      )
    },
    /** The stored provider address of an account's picture (`GET /auth/avatar/:accountId`), or null. */
    async avatarSourceFor(accountId) {
      const { rows } = await pool.query('select avatar_url from account where id = $1', [accountId])
      return rows[0]?.avatar_url ?? null
    },
    async putState({ state, provider, next, expiresAt, source = null }) {
      await pool.query(
        'insert into oauth_state (state, provider, next, expires_at, source) values ($1, $2, $3, $4, $5)',
        [state, provider, next, new Date(expiresAt), source]
      )
    },
    async recordAudit({ actor, action, detail = {} }) {
      await pool.query(
        'insert into audit (actor, action, site_key, detail) values ($1, $2, null, $3::jsonb)',
        [actor, action, JSON.stringify(detail)]
      )
    },
    async putLink({
      nonceHash,
      clientSecretHash,
      expiresAt,
      device = '',
      purpose = 'lane',
      emailHint = null
    }) {
      await pool.query(
        `insert into auth_link (nonce_hash, client_secret_hash, expires_at, device_label, purpose, email_hint)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (nonce_hash) do nothing`,
        [nonceHash, clientSecretHash, new Date(expiresAt), device, purpose, emailHint]
      )
    },
    async linkByNonce(nonceHash) {
      const { rows } = await pool.query(
        'select client_secret_hash, email, status, expires_at, device_label, purpose, email_hint from auth_link where nonce_hash = $1',
        [nonceHash]
      )
      return rows[0]
        ? {
            clientSecretHash: rows[0].client_secret_hash,
            email: rows[0].email,
            status: rows[0].status,
            expiresAt: rows[0].expires_at.getTime(),
            device: rows[0].device_label,
            purpose: rows[0].purpose,
            emailHint: rows[0].email_hint ?? null
          }
        : null
    },
    /**
     * A new code for one desktop round (`091-auth-challenge.sql`). The round's live challenge is
     * consumed and the new one written in ONE transaction, so a resend never leaves two live codes
     * and never brings an older one back. Answers the new challenge's id.
     */
    async putChallenge({ nonceHash, email, purpose = 'desktop', codeHash, expiresAt }) {
      const client = await pool.connect()
      try {
        await client.query('begin')
        await client.query(
          'update auth_challenge set consumed_at = now() where round_nonce_hash = $1 and consumed_at is null',
          [nonceHash]
        )
        const { rows } = await client.query(
          `insert into auth_challenge (round_nonce_hash, email, purpose, code_hash, expires_at)
           values ($1, $2, $3, $4, $5) returning id`,
          [nonceHash, email, purpose, codeHash, new Date(expiresAt)]
        )
        await client.query('commit')
        return String(rows[0].id)
      } catch (error) {
        await client.query('rollback')
        throw error
      } finally {
        client.release()
      }
    },
    // One try at the round's live challenge: the attempt is counted in the same statement that
    // reads it, before any comparison, so parallel guesses cannot all read one old count.
    async tryChallenge(nonceHash, now) {
      const { rows } = await pool.query(
        `update auth_challenge set attempts = attempts + 1
         where round_nonce_hash = $1 and consumed_at is null and expires_at > $2
         returning id, email, purpose, code_hash, attempts`,
        [nonceHash, new Date(now)]
      )
      const row = rows[0]
      return row
        ? {
            id: String(row.id),
            email: row.email,
            purpose: row.purpose,
            codeHash: row.code_hash,
            attempts: row.attempts
          }
        : null
    },
    async killChallenge(id) {
      await pool.query(
        'update auth_challenge set consumed_at = now() where id = $1 and consumed_at is null',
        [id]
      )
    },
    /**
     * 🔒 Consume the challenge AND approve its round in one transaction, each with every condition
     * in its own `where` (council (a) points 3 and 4). Either update matching no row rolls both back:
     * a second press, a resent code, an expired or replaced challenge, a round that is no longer
     * pending, or a round whose hint is not the challenge's address approves nothing.
     */
    async approveWithChallenge({ id, nonceHash, email, maxAttempts, now }) {
      const client = await pool.connect()
      try {
        await client.query('begin')
        const consumed = await client.query(
          `update auth_challenge set consumed_at = $5
           where id = $1 and round_nonce_hash = $2 and email = $3 and consumed_at is null
             and expires_at > $5 and attempts <= $4`,
          [id, nonceHash, email, maxAttempts, new Date(now)]
        )
        const approved =
          consumed.rowCount === 1
            ? await client.query(
                `update auth_link set email = $2, status = 'approved', approved_at = now()
                 where nonce_hash = $1 and purpose = 'desktop' and status = 'pending'
                   and expires_at > $3 and email_hint = $2`,
                [nonceHash, email, new Date(now)]
              )
            : { rowCount: 0 }
        if (approved.rowCount !== 1) {
          await client.query('rollback')
          return false
        }
        await client.query('commit')
        return true
      } catch (error) {
        await client.query('rollback')
        throw error
      } finally {
        client.release()
      }
    },
    // `where status = 'pending'` in the UPDATE, not a read-then-write: two browsers on one nonce
    // must not both approve it, and the second must learn that from the row count. `expires_at` is
    // written from this process's clock (`putLink`), so it is compared with that clock (`now`), not
    // the database's: under clock-shift the two are 400 days apart.
    async approveLink(nonceHash, email, now = Date.now()) {
      const { rowCount } = await pool.query(
        `update auth_link set email = $2, status = 'approved', approved_at = now()
         where nonce_hash = $1 and status = 'pending' and expires_at > $3`,
        [nonceHash, email, new Date(now)]
      )
      return rowCount === 1
    },
    // The same guard as `approveLink`: only a round still pending flips, and only once.
    async denyLink(nonceHash, now = Date.now()) {
      const { rowCount } = await pool.query(
        `update auth_link set status = 'denied'
         where nonce_hash = $1 and status = 'pending' and expires_at > $2`,
        [nonceHash, new Date(now)]
      )
      return rowCount === 1
    },
    // `delete ... returning`, the shape `takeState` uses and for the same reason: single-use is a
    // property of the statement, not of a caller remembering to delete afterwards. `purpose = 'lane'`
    // in the statement: a desktop round is not the lane's to take, and is left unburned.
    async takeLink(nonceHash) {
      const { rows } = await pool.query(
        `delete from auth_link where nonce_hash = $1 and purpose = 'lane'
         returning client_secret_hash, email, status, expires_at`,
        [nonceHash]
      )
      return rows[0]
        ? {
            clientSecretHash: rows[0].client_secret_hash,
            email: rows[0].email,
            status: rows[0].status,
            expiresAt: rows[0].expires_at.getTime()
          }
        : null
    },
    // The app cancelling its own round (`POST /auth/link/:nonce/cancel`): ONE statement, every
    // condition in the `where` — a wrong secret, a lane round, a round already approved, denied or
    // expired match nothing and stay as they were. `denied` is the terminal word the app and the
    // approve page already know (074), so no new status is needed.
    async cancelDesktopLink({ nonceHash, clientSecretHash, now }) {
      const { rowCount } = await pool.query(
        `update auth_link set status = 'denied'
         where nonce_hash = $1 and client_secret_hash = $2 and purpose = 'desktop'
           and status = 'pending' and expires_at > $3`,
        [nonceHash, clientSecretHash, new Date(now)]
      )
      return rowCount === 1
    },
    // 🔒 ONE STATEMENT decides and consumes: every condition is in the `where`, so a wrong secret,
    // a lane round, a pending/denied/expired round match nothing and are left exactly as they were,
    // and of two concurrent redeems the second finds the row already gone.
    async redeemDesktopLink({ nonceHash, clientSecretHash, now }) {
      const { rows } = await pool.query(
        `delete from auth_link
         where nonce_hash = $1 and client_secret_hash = $2 and purpose = 'desktop'
           and status = 'approved' and email <> '' and expires_at > $3
         returning email, device_label`,
        [nonceHash, clientSecretHash, new Date(now)]
      )
      return rows[0] ? { email: rows[0].email, device: rows[0].device_label } : null
    },
    // `delete ... returning` reads and consumes the row in one statement — single-use is a
    // property of the query, not of a caller remembering to delete afterwards.
    async takeState(state) {
      const { rows } = await pool.query(
        'delete from oauth_state where state = $1 returning provider, next, expires_at, source',
        [state]
      )
      return rows[0]
        ? {
            provider: rows[0].provider,
            next: rows[0].next,
            expiresAt: rows[0].expires_at.getTime(),
            source: rows[0].source ?? null
          }
        : null
    },
    /**
     * The account behind a (provider, subject) pair — the same account on every later sign-in,
     * even if the provider's own reported email changes in between. Ported to this app's own
     * `identity` table (002-book.sql), which existed since Task 2/6 but had no writer until now.
     *
     * `identity` already known: return its account untouched — the subject, not today's email, is
     * what says "same person". `identity` unknown: find-or-create the account by email (`account`
     * is unique on email, same as `touchAccount`), then link the two. The insert can lose a race
     * against a second, concurrent first-sign-in for the same brand-new subject (two requests both
     * see "not found"); `23505` (unique_violation on `identity`'s own primary key) means the other
     * request already won, so this one reads back its answer instead of erroring.
     */
    async upsertOAuthIdentity(
      provider,
      subject,
      email,
      { admission = { badge: 'gate off', plans: [] }, entitlement = undefined } = {}
    ) {
      // `entitlement` undefined = the caller has nothing to say (Google, GitHub): the column is left
      // as it is. An array, even `[]`, is what aMember said this time and replaces the last answer.
      const keepEntitlement = async () => {
        if (entitlement === undefined) return
        await pool.query('update identity set entitlement = $3::jsonb where provider = $1 and subject = $2', [
          provider,
          subject,
          JSON.stringify(entitlement)
        ])
      }
      const linked = await pool.query(
        `select acc.id, acc.email from identity i join account acc on acc.id = i.account_id
         where i.provider = $1 and i.subject = $2`,
        [provider, subject]
      )
      if (linked.rows[0]) {
        await this.touchAccount(linked.rows[0].email, {
          admission,
          via: viaLabel(provider)
        })
        await keepEntitlement()
        return linked.rows[0]
      }
      const touched = await this.touchAccount(email, {
        admission,
        via: viaLabel(provider)
      })
      const account = { id: touched.id, email }
      try {
        await pool.query(
          'insert into identity (provider, subject, account_id, entitlement) values ($1, $2, $3, $4::jsonb)',
          [provider, subject, account.id, entitlement === undefined ? null : JSON.stringify(entitlement)]
        )
      } catch (error) {
        if (error.code !== '23505') throw error
        const { rows: winner } = await pool.query(
          `select acc.id, acc.email from identity i join account acc on acc.id = i.account_id
           where i.provider = $1 and i.subject = $2`,
          [provider, subject]
        )
        await keepEntitlement()
        return winner[0]
      }
      return account
    },
    // A template waiting on an account (plan B6; `088-desktop-intent.sql`): one row per account,
    // the newest wins, a row older than seven days is not answered. `take` is `delete … returning`
    // like `takeState`, for the same reason — the landing page consumes it exactly once.
    // `platform` (`091-desktop-intent-platform.sql`) is replaced with the row: a newer template
    // with nothing said must not inherit the platform of the one it replaced.
    async putDesktopIntent(accountId, template, platform = null) {
      await pool.query(
        `insert into desktop_intent (account_id, template, platform) values ($1, $2, $3)
         on conflict (account_id) do update
           set template = excluded.template, platform = excluded.platform, created_at = now()`,
        [accountId, template, platform]
      )
    },
    async peekDesktopIntent(email) {
      const { rows } = await pool.query(
        `select i.template, i.platform from desktop_intent i join account a on a.id = i.account_id
         where a.email = $1 and i.created_at > now() - interval '7 days'`,
        [email]
      )
      return rows[0] ? { template: rows[0].template, platform: rows[0].platform } : null
    },
    async takeDesktopIntent(email, template = null) {
      const { rows } = await pool.query(
        `delete from desktop_intent i using account a
         where a.id = i.account_id and a.email = $1 and ($2::text is null or i.template = $2)
         returning i.template, (i.created_at > now() - interval '7 days') as fresh`,
        [email, template]
      )
      // Freshness is the database's clock against its own `created_at`, like `peek` — not this
      // process's `Date.now()`, which CI runs 400 days ahead (clock-shift) and which would then
      // read every row just written as expired.
      const row = rows[0]
      if (!row) return null
      return row.fresh ? row.template : null
    }
  }
}
