// apps/tracy-web/src/shard/route.js
/**
 * The doors a shard answers (shard beta, docs/sre/hop-dong-cua-shard.md §4, §6), one file each,
 * mounted together here so the signed ones share ONE replay table:
 *   POST /_shard/adopt   the master hands a person here; answers a one-time ticket   (`adopt.js`)
 *   GET  /handoff        that ticket plus the master's nonce cookie becomes a session (`handoff.js`)
 *   GET  /_shard/status  what the heartbeat (W3) reports                              (`status.js`)
 * Mounted on every deployment so the API reference lists them; unless `config.deploymentRole` is
 * `shard` (W1's one reader) each answers 404 `NOT_A_SHARD`. Adopt and status are signed with
 * `SHARD_SECRET` (`lib/shard-channel.js`); the handoff is a browser navigation, authorised by the
 * ticket and the nonce together.
 */
import { Hono } from 'hono'
import { json } from '../lib/http.js'
import { verifyShardRequest } from '../lib/shard-channel.js'
import { adoptDoor } from './adopt.js'
import { handoffDoor } from './handoff.js'
import { statusDoor } from './status.js'

export function shardRoutes({ config, pool, identity, now = Date.now }) {
  const app = new Hono()
  // Spent nonces of signed requests, for this process (spec §8: a restart opens a 120 s replay window).
  const seen = new Map()
  const door = {
    config,
    pool,
    identity,
    now,
    isShard: () => config.deploymentRole === 'shard' && Boolean(config.shard && pool && identity),
    notAShard: (c) => json(c, { code: 'NOT_A_SHARD' }, 404),
    /**
     * The body of a request signed with this shard's secret, or the answer to give instead. A signed
     * door takes no query (contract §2: 400 before anything is verified), and the signature covers
     * the body's RAW bytes — hashed before any decoding — so `body` is decoded only afterwards.
     */
    async signed(c) {
      if (new URL(c.req.url).search !== '') return { refused: json(c, { code: 'BAD_BODY' }, 400) }
      const bytes = new Uint8Array(await c.req.arrayBuffer())
      const verdict = verifyShardRequest({
        secret: config.shard.secret,
        headers: c.req.raw.headers,
        method: c.req.method,
        path: c.req.path,
        body: bytes,
        now: now(),
        seen
      })
      return verdict.ok
        ? { body: new TextDecoder().decode(bytes) }
        : { refused: json(c, { code: 'SIGNATURE_INVALID', why: verdict.why }, 403) }
    }
  }
  adoptDoor(app, door)
  handoffDoor(app, door)
  statusDoor(app, door)
  return app
}
