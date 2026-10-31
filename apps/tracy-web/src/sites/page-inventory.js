/** Reuse complete page walks only after a fresh authenticated CMS snapshot confirms them. */
import { createHash } from 'node:crypto'
import { walkListing, pageAddressIndex } from './content-pages.js'

/** @param {any} head */
function stamp(head, requireInventoryRevision) {
  if (
    head?.schemaVersion !== 'tracy-content/v1' ||
    typeof head.snapshot?.revision !== 'string' ||
    !head.snapshot.revision ||
    (requireInventoryRevision && typeof head.snapshot.inventoryRevision !== 'string')
  )
    return null
  // The first page also fences address/locale metadata that an adapter may keep outside revisions.
  return createHash('sha256')
    .update(
      JSON.stringify([
        head.snapshot.inventoryRevision ?? head.snapshot.revision,
        head.site,
        head.provenance,
        head.completeness,
        head.contents,
        head.pagination?.limit,
        head.pagination?.total
      ])
    )
    .digest('hex')
}

/** Scope is supplied by the authenticated relay, never by the model. Every hit costs a fresh read.
 * @param {{now?:()=>number, maxEntries?:number, maxBytes?:number, ttlMs?:number}} [options]
 */
export function createPageInventoryReader({
  now = Date.now,
  maxEntries = 64,
  maxBytes = 16 * 1024 * 1024,
  ttlMs = 60_000
} = {}) {
  /** @type {Map<string,{at:number, stamp:string, listings:any[], index:Map<string,number[]>, bytes:number}>} */
  const held = new Map()
  let bytes = 0
  const drop = (/** @type {string} */ key) => {
    const old = held.get(key)
    if (old) bytes -= old.bytes
    held.delete(key)
  }
  return async (
    /** @type {string} */ key,
    /** @type {(params:Record<string,unknown>)=>Promise<any>} */ ask,
    /** @type {Record<string,unknown>} */ filter,
    { requireInventoryRevision = false, reusable = true } = {}
  ) => {
    const head = await ask({ ...filter, limit: 100 })
    const signature = reusable ? stamp(head, requireInventoryRevision) : null
    const old = held.get(key)
    if (old && signature !== null && signature === old.stamp && now() - old.at < ttlMs) {
      const listings = structuredClone(old.listings)
      listings[0] = head
      return { listings, truncated: false, refusal: null, index: structuredClone(old.index) }
    }
    drop(key)
    let first = true
    const walk = await walkListing(async (params) => {
      if (first) {
        first = false
        return head
      }
      return ask(params)
    }, filter)
    const index = pageAddressIndex(walk.listings)
    if (
      signature !== null &&
      !walk.truncated &&
      walk.refusal === null &&
      walk.listings.every(
        (p) =>
          p.snapshot?.revision === head.snapshot.revision &&
          p.snapshot?.inventoryRevision === head.snapshot.inventoryRevision
      )
    ) {
      const size = Buffer.byteLength(JSON.stringify([walk.listings, [...index]]))
      if (size <= maxBytes && maxEntries > 0) {
        for (const [id, value] of held) if (now() - value.at >= ttlMs) drop(id)
        while (held.size && (held.size >= maxEntries || bytes + size > maxBytes))
          drop(held.keys().next().value)
        held.set(key, {
          at: now(),
          stamp: signature,
          listings: structuredClone(walk.listings),
          index,
          bytes: size
        })
        bytes += size
      }
    }
    return { ...walk, index }
  }
}
