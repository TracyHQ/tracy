/**
 * A finished read, kept on disk until the fleet has taken it.
 *
 * A run ends with two store keys (the database dump and the webroot archive) and the handover
 * to the fleet is a separate call the wizard makes. Until 2026-09-04 those keys lived only in the
 * run's memory: a 559 MB read completed, the fleet's Claude Cowork plugin was restarted in the second the
 * handover arrived, the lane restarted a little later, and the only way forward was reading the
 * whole site again. The read was in the store the entire time; nothing knew its name.
 *
 * So a finished read is written here, next to `uploads.json`, and a new run for the same site
 * that finds a fresh one hands it over at once instead of reading again. Same book shape, same
 * atomic write, same idea as the upload cursor: state that survives the process that made it.
 * Only a run that brings no new credentials looks here: nothing in this plugin learns that the
 * fleet took a read, so an import with a pasted token or an admin login reads the site again
 * rather than hand over a read the fleet may already have built a copy from (#530, `run.ts`).
 *
 * Freshness is deliberately short. The read is a snapshot of the customer's site; handing over
 * one taken hours ago is describing a site that no longer exists. Two hours covers a retry after
 * a restart and not much more.
 */
import path from 'node:path'

import { readBook, updateBook } from './json-book.mjs'

export interface FinishedRead {
  result: { webrootKey: string; dbKey: string; liveSite: string }
  finishedAt: number
}

/**
 * One site's line in the book: a finished read, and/or a database dump from a run that got that
 * far and no further. The dump is a complete object in the store that nothing will ever hand
 * over; it is remembered so the next run can delete it rather than leave it to be paid for.
 */
interface Entry {
  result?: FinishedRead['result']
  finishedAt?: number
  pending?: { dbKey: string }
}

type Book = Record<string, Entry>

const FRESH_MS = 2 * 60 * 60_000

function bookPath(): string {
  const home = process.env.DSH_HOME ?? process.cwd()
  return path.join(home, 'tracy-add-site', 'handovers.json')
}

/** Is a finished read still worth handing over, or old enough to describe another site? */
export function isFresh(read: FinishedRead, now: number, freshMs = FRESH_MS): boolean {
  return now - read.finishedAt < freshMs
}

/** A fresh finished read for the site, or nothing — an old one is left in place and ignored. */
export async function heldHandover(siteKey: string): Promise<FinishedRead | undefined> {
  const held = (await readBook<Book>(bookPath()))[siteKey]
  if (!held?.result || held.finishedAt === undefined) return undefined
  const read = { result: held.result, finishedAt: held.finishedAt }
  return isFresh(read, Date.now()) ? read : undefined
}

/**
 * What a new run does first: hand over a fresh finished read if there is one, and otherwise
 * clean up after the runs before it — the dump of a run that died before its files were done,
 * and a finished read that expired unhanded — through `remove`, then forget the line.
 *
 * Automatic and best effort. The store objects are the customer's data in Tracy's bucket; a
 * failed delete is retried by the next run, never a reason to stop this one.
 */
export async function takeOrSweep(
  siteKey: string,
  remove: (key: string) => Promise<void>
): Promise<FinishedRead | undefined> {
  const fresh = await heldHandover(siteKey)
  if (fresh) return fresh

  const file = bookPath()
  const entry = (await readBook<Book>(file))[siteKey]
  if (!entry) return undefined
  const leftovers = [entry.pending?.dbKey, entry.result?.dbKey, entry.result?.webrootKey].filter(
    (key): key is string => typeof key === 'string' && key !== ''
  )
  // The deletes are store calls; they run outside the book's queue so other sites' writes do not
  // wait on them. The line is dropped only if it is still the one swept: a run for the same site
  // may have written its own dump meanwhile, and losing that line would leak the dump.
  const swept = JSON.stringify(entry)
  for (const key of leftovers) await remove(key)
  await updateBook<Book>(file, (book) => {
    if (JSON.stringify(book[siteKey]) !== swept) return false
    delete book[siteKey]
  })
  return undefined
}

/** The database is in the store; the files are not yet. Remembered so a death here leaves nothing behind. */
export async function rememberPartial(siteKey: string, dbKey: string): Promise<void> {
  await updateBook<Book>(bookPath(), (book) => {
    book[siteKey] = { pending: { dbKey } }
  })
}

export async function rememberHandover(siteKey: string, result: FinishedRead['result']): Promise<void> {
  await updateBook<Book>(bookPath(), (book) => {
    // The finished read replaces the pending line: its dump IS the pending dump, now handed over.
    book[siteKey] = { result, finishedAt: Date.now() }
  })
}

/**
 * Every store key the site's line names (a finished read and/or a pending dump), for a Remove to
 * delete before `forgetHandover` drops the line: once the line is gone no later run sweeps them.
 */
export async function handoverKeys(siteKey: string): Promise<string[]> {
  const entry = (await readBook<Book>(bookPath()))[siteKey]
  if (!entry) return []
  return [entry.pending?.dbKey, entry.result?.dbKey, entry.result?.webrootKey].filter(
    (key): key is string => typeof key === 'string' && key !== ''
  )
}

export async function forgetHandover(siteKey: string): Promise<void> {
  await updateBook<Book>(bookPath(), (book) => {
    if (!(siteKey in book)) return false
    delete book[siteKey]
  })
}
