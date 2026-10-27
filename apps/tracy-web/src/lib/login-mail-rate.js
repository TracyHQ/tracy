/**
 * The cap on sign-in codes sent by mail — one count, whichever door asked (#664, #805).
 *
 * Two doors mail the same six digits from the same table: `POST /login` (`identity/route.js`) and
 * a lane's `POST /auth/otp/start` (`lanes/route.js`). Until 03/10/2026 only the first one counted,
 * so the second was a way around it: a signed lane could mail one inbox without limit, and each
 * call replaced the code already sent. This is `/login`'s own limiter, moved here — the same
 * buckets, the same numbers (`./policy.js`), the same fail-closed read — so that the composition
 * root can hand ONE instance to both routers. A domain may not import a sibling
 * (`test/module-graph.test.mjs`), which is why it lives in `lib/`.
 *
 * What the two doors share is the PER-INBOX bucket (`login-email:<email>`, five an hour): that is
 * the count a second door must not be a way around. They do NOT share a per-address bucket.
 * `/login` is called by a person's browser and counts `login-ip:<address>` (thirty an hour); the
 * lane door is called by a fleet host on behalf of every site it serves, so it counts its own
 * `lane-mail:<address>` (three hundred an hour) and leaves `login-ip:` alone.
 */
import {
  DISCORD_MAIL_LIMIT_PER_MEMBER_PER_HOUR,
  LANE_MAIL_LIMIT_PER_HOST_PER_HOUR,
  LOGIN_MAIL_LIMIT_PER_EMAIL_PER_HOUR,
  LOGIN_MAIL_LIMIT_PER_IP_PER_HOUR
} from './policy.js'
import { memoryRateLimiter, overLimitOrClosed } from './rate.js'

/** What a client address may look like as a bucket key: IPv4 or IPv6 digits, nothing else. */
const CLIENT_IP = /^[0-9a-fA-F:.]{2,45}$/

/**
 * The client address a rate bucket is keyed by. `cf-connecting-ip` is the one header this app
 * already trusts for it (`public/design-page.js`): production is reached only through the
 * Cloudflare tunnel, and Cloudflare overwrites that header with the address it saw. Anything that
 * does not look like an address — absent on a laptop, or junk — shares ONE bucket, `unknown`, so a
 * missing or forged header is never a way to get a fresh bucket per request.
 *
 * ⚠ FOR A LANE THIS IS THE LANE HOST'S ADDRESS, NOT THE PERSON'S: the gateway calls through the
 * public origin from its own host and forwards nobody's address, and one host serves every site
 * (ADR 0014). So the lane door keys its own bucket by it (`overLane` below), never `/login`'s
 * person-sized one; the per-inbox five is what protects a person.
 */
export function clientIp(c) {
  const raw = (c.req.header('cf-connecting-ip') ?? '').trim()
  return CLIENT_IP.test(raw) ? raw.toLowerCase() : 'unknown'
}

/**
 * @param {object} [deps]
 * @param {import('pg').Pool|null} [deps.pool] - with a database, the `rate_bucket` table every
 *   write door counts in (and a failed read of it refuses — fail closed). Without one (the memory
 *   identity store a laptop runs on), this instance's own count: still a cap, never "no cap
 *   because there is nowhere to count".
 * @param {() => number} [deps.now]
 * @returns {{
 *   over: (c: import('hono').Context, email: string) => Promise<boolean>,
 *   overLane: (c: import('hono').Context, email: string) => Promise<boolean>,
 *   overDiscord: (email: string, discordId: string) => Promise<boolean>
 * }}
 */
export function loginMailLimiter({ pool = null, now = Date.now } = {}) {
  const memoryRate = pool ? null : memoryRateLimiter()
  const overLimitNow = (bucket, limit) =>
    pool ? overLimitOrClosed(pool, bucket, limit, now()) : memoryRate.overLimit(bucket, limit, now())
  return {
    /**
     * `POST /login`: count one request for a code, and say whether it is over either cap. Call it
     * BEFORE a code exists or a mail leaves, and only once the request is known to be well-formed
     * and allowed.
     *
     * 🔒 Both buckets are counted on every request, so neither can be emptied by spending the
     * other. `email` must already be normalised (trimmed, lower-case), so `Lee@X` and ` lee@x `
     * are one inbox.
     */
    async over(c, email) {
      const overEmail = await overLimitNow(`login-email:${email}`, LOGIN_MAIL_LIMIT_PER_EMAIL_PER_HOUR)
      const overIp = await overLimitNow(`login-ip:${clientIp(c)}`, LOGIN_MAIL_LIMIT_PER_IP_PER_HOUR)
      return overEmail || overIp
    },
    /**
     * A lane's `POST /auth/otp/start`: the same rules as `over`, and the SAME per-inbox bucket, so
     * the two doors spend one budget for an inbox. The second bucket is the lane's own: the calling
     * address is a fleet host's, and counting it in `login-ip:` would give every site on that host
     * one person's thirty an hour.
     */
    async overLane(c, email) {
      const overEmail = await overLimitNow(`login-email:${email}`, LOGIN_MAIL_LIMIT_PER_EMAIL_PER_HOUR)
      const overHost = await overLimitNow(`lane-mail:${clientIp(c)}`, LANE_MAIL_LIMIT_PER_HOST_PER_HOUR)
      return overEmail || overHost
    },
    /**
     * Tracy's Discord bot (`POST /api/discord/link/start`): the SAME per-inbox bucket again, and a
     * second one per Discord member, never per address — the bot calls from one machine for every
     * member of the server.
     */
    async overDiscord(email, discordId) {
      const overEmail = await overLimitNow(`login-email:${email}`, LOGIN_MAIL_LIMIT_PER_EMAIL_PER_HOUR)
      const overMember = await overLimitNow(
        `discord-member:${discordId}`,
        DISCORD_MAIL_LIMIT_PER_MEMBER_PER_HOUR
      )
      return overEmail || overMember
    }
  }
}
