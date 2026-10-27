// apps/tracy-web/src/shard/status.js
/**
 * `GET /_shard/status` (contract §6): what the heartbeat (W3) reads on this machine and sends to the
 * master — `{sites, releases_read_at, migration_head, accepting}`. Signed like the master's calls
 * (`GET`, empty body), because the heartbeat reaches tracy-web through docker-proxy and its source
 * address is the bridge gateway, never a loopback this door could trust. `migration_head` is the
 * JavaScript string order of the applied migrations (`node-store.js` `migrationHeadOf`), the order the
 * master compares in.
 */
import { json } from '../lib/http.js'
import { shardStatus } from './node-store.js'

export function statusDoor(app, { config, pool, isShard, notAShard, signed }) {
  app.get('/_shard/status', async (c) => {
    c.header('cache-control', 'no-store')
    if (!isShard()) return notAShard(c)
    const call = await signed(c)
    if (call.refused) return call.refused
    return json(c, await shardStatus(pool, { maxSites: config.shard.maxSites }))
  })
}
