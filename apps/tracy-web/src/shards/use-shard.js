/**
 * `409 USE_SHARD` on this master's own create doors (docs/sre/2026-10-15-shard-beta-design.md §4.4,
 * review item 31; docs/sre/hop-dong-cua-shard.md §12, §12b): somebody who lives on a shard creates,
 * imports and claims sites THERE, or they would end up with sites on two machines. `redirect` is
 * where the Add site form opens on their shard while it still takes people; a full one is not where
 * a new site goes, and neither is this master (spec §13 S40) — then `redirect` is this master's own
 * `/new/?fresh=1`, the door that moves them onto another shard or tells them none takes anybody.
 * Somebody on s0, or new and adopted nowhere yet, reaches the door as before.
 */
import { json, viewer } from '../lib/http.js'
import { MASTER_SHARD } from '../lib/shard-shapes.js'
import { homeOf, placesOf } from './directory.js'
import { accepts } from './pick.js'

export function useShardGuard({ pool, book, config }) {
  return async (c, next) => {
    if (c.req.method !== 'POST') return next()
    const email = await viewer(c, config)
    if (!email) return next()
    const home = homeOf(await placesOf(pool, email))
    if (!home || home === MASTER_SHARD) return next()
    const shard = await book.get(home)
    if (!shard) return next()
    const redirect = accepts(shard) ? `${shard.origin}/new/` : `${config.origin}/new/?fresh=1`
    return json(c, { code: 'USE_SHARD', redirect }, 409)
  }
}
