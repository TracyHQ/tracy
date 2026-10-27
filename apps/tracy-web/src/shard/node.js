// apps/tracy-web/src/shard/node.js
/**
 * What `sites/` needs of a shard (shard beta), built once by the composition root (`app.js`) and
 * handed in as `shard` — the same seam as `inventory` and `seats`: a domain never imports another.
 * Null on the master.
 */
import { masterCatalogue } from './catalogue.js'
import { shardEvents } from './events-outbox.js'
import { hostnameBroker, masterLink } from './master-link.js'
import { isMirror, shardStatus } from './node-store.js'

export function shardNode({ config, pool, fetchImpl = fetch, now = Date.now, log = console }) {
  const shard = config.shard
  const link = masterLink({ shard, fetchImpl, now })
  const events = shardEvents({ pool, link, now, log })
  const catalogue = masterCatalogue({ masterOrigin: shard.masterOrigin, fetchImpl, now })
  return {
    masterOrigin: shard.masterOrigin,
    link,
    events,
    catalogue,
    demoOf: (tag) => catalogue.demoOf(tag),
    hostnameBroker: hostnameBroker(config, fetchImpl),
    reserveLabel: (input) => link.reserveLabel(input),
    emit: (kind, data, key, db) => events.emit(kind, data, key, db),
    isMirror: (email) => isMirror(pool, email),
    accepting: async () => (await shardStatus(pool, { maxSites: shard.maxSites })).accepting,
    pump: async () => {
      await events.sweepMirrors()
      return events.pump()
    }
  }
}
