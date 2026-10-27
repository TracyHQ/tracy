/**
 * The hold on a site whose unfinished import tracy-web is removing (part 2 of the unfinished-import
 * fix, PR #1598).
 *
 * tracy-web's Remove (`apps/tracy-web/src/sites/import-remove.js`) must know that no read of the site
 * is going here, and that none begins while it deletes. So it asks THIS host to hold the site: the
 * check ("is a run of this site running?") and the hold itself happen in one synchronous step, and
 * `startRun` refuses a held site in the same way, so a start racing a Remove either opens its run
 * first (and the hold is refused) or finds the hold (and is refused). Never both.
 *
 * - The hold is written next to `runs.json` (`holds.json`), so a dsh restart in the middle of a
 *   Remove does not let a start through.
 * - It lapses after `HOLD_TTL_MS`: a Remove that died between its hold and its release (tracy-web
 *   restarted, the release never arrived) must not keep the site unstartable for ever.
 * - Only tracy-web may hold, release or forget: the call is signed with the host's seat secret
 *   (`MCP_SEAT_SECRET`), the same HMAC over timestamp, nonce, method, path and body the gateway's
 *   seat door verifies (`vendor/tracy/dsh-passwords/src/tracy/seat.ts`). A browser on this dsh has
 *   a session but not the secret, so it cannot hold or forget another customer's site.
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import path from 'node:path'

import { readBook, updateBook } from './json-book.mjs'

/** Long enough for one Remove (seconds), short enough that a lost release heals by itself. */
export const HOLD_TTL_MS = 15 * 60_000

type HoldBook = Record<string, { heldAt: number }>

const holds = new Map<string, number>()

function holdBookPath(): string {
  return path.join(process.env.DSH_HOME ?? process.cwd(), 'tracy-add-site', 'holds.json')
}

let restored: Promise<void> | undefined

/** The holds a dsh that just started finds on disk; called before the first start is answered. */
export function restoreHolds(): Promise<void> {
  restored ??= (async () => {
    const book = await readBook<HoldBook>(holdBookPath())
    for (const [siteKey, entry] of Object.entries(book))
      if (typeof entry?.heldAt === 'number' && !holds.has(siteKey)) holds.set(siteKey, entry.heldAt)
  })().catch((error: unknown) =>
    console.warn(
      `[tracy-add-site] could not read site holds: ${error instanceof Error ? error.message : String(error)}`
    )
  )
  return restored
}

/** Whether a Remove holds this site now. Synchronous, so `startRun` can ask it before anything awaits. */
export function isHeld(siteKey: string, now = Date.now()): boolean {
  const heldAt = holds.get(siteKey)
  return heldAt !== undefined && now - heldAt < HOLD_TTL_MS
}

/**
 * Hold the site in memory at once (the caller has just checked, in the same step, that no run of it
 * is going), then on disk. Resolves once the hold is written.
 */
export async function holdSite(siteKey: string, now = Date.now()): Promise<void> {
  holds.set(siteKey, now)
  await updateBook<HoldBook>(holdBookPath(), (book) => {
    book[siteKey] = { heldAt: now }
  })
}

/** Lift the hold: the Remove gave up, or it is done. */
export async function releaseSite(siteKey: string): Promise<void> {
  holds.delete(siteKey)
  await updateBook<HoldBook>(holdBookPath(), (book) => {
    if (!(siteKey in book)) return false
    delete book[siteKey]
  })
}

/** A start refused because a Remove holds its site (`startRun`). */
export class SiteHeld extends Error {
  constructor(readonly siteKey: string) {
    super(`import of ${siteKey} is being removed`)
  }
}

/** How old a signed call may be, and how long its nonce is remembered (the seat door's own numbers). */
const FRESHNESS_MS = 60_000
const NONCE_MEMORY_MS = 120_000
const spent = new Map<string, number>()

/**
 * Whether a call comes from tracy-web: the HMAC tracy-web's `signSeatCall`
 * (`apps/tracy-web/src/workspace/seat-door.js`) puts on it, over `<timestamp>\n<nonce>\nPOST\n<path>\n
 * <sha256hex(body)>`, with a fresh timestamp and a nonce never seen. No secret here = no caller may.
 */
export function signedByTracy(input: {
  secret: string | null
  path: string
  body: string
  timestamp: string
  nonce: string
  signature: string
  now?: number
}): boolean {
  const now = input.now ?? Date.now()
  if (!input.secret || !input.timestamp || !input.nonce || !input.signature) return false
  const sent = Number(input.timestamp)
  if (!Number.isFinite(sent) || Math.abs(now - sent) > FRESHNESS_MS) return false
  const bodyHash = createHash('sha256').update(input.body).digest('hex')
  const expected = createHmac('sha256', input.secret)
    .update(`${input.timestamp}\n${input.nonce}\nPOST\n${input.path}\n${bodyHash}`)
    .digest('hex')
  const a = Buffer.from(expected)
  const b = Buffer.from(input.signature)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false
  for (const [nonce, expiresAt] of spent) if (expiresAt <= now) spent.delete(nonce)
  if (spent.has(input.nonce)) return false
  spent.set(input.nonce, now + NONCE_MEMORY_MS)
  return true
}
