/**
 * The cursor of an unfinished webroot upload — written to disk after EVERY part.
 *
 * WHY AFTER EVERY PART, NOT AT THE END. Its whole point is to survive a run that NEVER
 * reaches the end. A large webroot is dozens of parts over many tens of minutes, and in that time
 * anything nobody predicted can happen: dsh restarts, the customer's server reboots, the network drops entirely, a
 * never-seen error. Writing at the end means anything outside the predicted list wipes out the work done.
 *
 * 🔒 PARTS ALREADY RECEIVED ARE NEVER THROWN AWAY ON ERROR. They are the only thing a later run can
 * continue from. Throwing them away is how 1.4 GB of work vanished over one 502 in `tracy-desk` (measured 14/08). An
 * abandoned upload costs storage until the bucket's lifecycle rule clears it — a far cheaper price.
 *
 * Written by rename, for the same reason as the token store: `rename` is atomic, so a
 * power cut midway leaves the OLD copy intact instead of a truncated JSON file.
 */

import path from 'node:path'

import { UPLOAD_IDLE_MS } from './import-ttl.mjs'
import { readBook, updateBook } from './json-book.mjs'

export interface UploadCursor {
  key: string
  uploadId: string
  parts: Array<{ PartNumber: number; ETag: string }>
  /** A two-part cursor: the path inside the webroot + the position in that file, plus the declared header size. */
  cursor: { path: string; offset: number; size: number }
  files: number
  bytes: number
  /** The timestamp of the FIRST part, not of the latest resume — see `isFresh`. */
  startedAt: number
  /**
   * The number the next part goes under: past every number stored AND every number a call was
   * abandoned on, which a late PUT may still write to (`export.ts`). Absent on older cursors.
   */
  nextPart?: number
  /** When the last part landed; set by `rememberUpload`. Absent on cursors written before #1565. */
  updatedAt?: number
}

type Book = Record<string, UploadCursor>

/**
 * How long an unfinished upload still counts as a true description of the site it came from.
 *
 * An archive resumed after many hours is half old, half new: the first part captured the site at 9:00,
 * the last at 15:00, and the copy built from it never existed anywhere. Past the limit, drop it and start
 * again — it costs time, but yields something real.
 *
 * MEASURED FROM THE LAST PART, WITH A BOUND (#1565). Until 22/10/2026 this was 60 min from the
 * FIRST part, and a read on a slow uplink takes longer than that by itself (QA: 628 MB at 38–133
 * KB/s, ~1.5 h): a deploy cut it, and the cursor was thrown away though its last part had landed
 * minutes before. Now a cursor lives while parts keep landing — `IDLE_MS` after the last one, as
 * long as the wizard offers Continue for an interrupted run (`run.ts` `RUN_TTL_MS`) — and never past
 * `MAX_AGE_MS` from the first, so the archive still describes one site, not one per day.
 */
const IDLE_MS = UPLOAD_IDLE_MS
const MAX_AGE_MS = 24 * 60 * 60_000

/** Whether a held cursor still describes the site it came from. */
export function isFresh(held: UploadCursor, now = Date.now()): boolean {
  return now - (held.updatedAt ?? held.startedAt) < IDLE_MS && now - held.startedAt < MAX_AGE_MS
}

function bookPath(): string {
  const home = process.env.DSH_HOME ?? process.cwd()
  return path.join(home, 'tracy-add-site', 'uploads.json')
}

/** This site's unfinished upload, if still usable. Expired means none. */
export async function heldUpload(siteKey: string): Promise<UploadCursor | undefined> {
  const held = (await readBook<Book>(bookPath()))[siteKey]
  if (!held) return undefined
  return isFresh(held) ? held : undefined
}

/** An EXPIRED unfinished upload — returned so the caller can still `abandon` it rather than leave it in storage. */
export async function staleUpload(siteKey: string): Promise<UploadCursor | undefined> {
  const held = (await readBook<Book>(bookPath()))[siteKey]
  if (!held) return undefined
  return isFresh(held) ? undefined : held
}

/** Write the cursor. Called after every part. */
export async function rememberUpload(siteKey: string, cursor: UploadCursor): Promise<void> {
  // Several imports write this book at once; `updateBook` keeps every site's line.
  await updateBook<Book>(bookPath(), (book) => {
    // Copy the `parts` array rather than hand over the array itself: it keeps growing, and a record holding
    // the live array is a window onto the future, not a record of this moment.
    book[siteKey] = { ...cursor, parts: [...cursor.parts], updatedAt: cursor.updatedAt ?? Date.now() }
  })
}

/** Forget the cursor — when the upload is closed, or when it is abandoned. */
export async function forgetUpload(siteKey: string): Promise<void> {
  await updateBook<Book>(bookPath(), (book) => {
    if (!(siteKey in book)) return false
    delete book[siteKey]
  })
}
