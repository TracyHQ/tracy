/**
 * Where extension tokens are kept — ONE file, keyed by site.
 *
 * 🔒 NO PASSWORD IN HERE, and that is the whole design rather than a promise. The admin password
 * passes exactly once: sign in → install the extension → the extension mints its own token → only the token is written.
 * `tracy-desk` follows this rule too, but in TCH it weighs more: dsh runs in a container ON TRACY'S
 * SERVER, so a password stored there is a customer's site password sitting on our infrastructure.
 *
 * WHY IT MUST SURVIVE A RESTART: an import runs from a few minutes to several tens of minutes, and
 * `dsh` restarting midway is ordinary (HMR in development, an upgrade in production).
 * Without a store, the user would have to retype the admin password to redo half-finished work from scratch.
 *
 * Written by rename: write a temp file, then `rename` over. `rename` is atomic on the
 * same file system, so a power cut midway leaves **the old copy intact** instead of a
 * truncated JSON file the next read cannot parse.
 */

import path from 'node:path'

import { readBook, updateBook } from './json-book.mjs'

export interface SiteToken {
  /** The token the extension minted. */
  token: string
  /** The resolved webroot — not the string the user typed, since the admin may live on another host/subpath. */
  webRootUrl: string
  platform: 'joomla' | 'wordpress'
  /** The extension version at write time, so the next run knows whether it is an upgrade. */
  version?: string
  savedAt: number
}

type Book = Record<string, SiteToken>

/**
 * `$DSH_HOME` is where dsh keeps its own state. Without that variable it falls back to the current directory —
 * the way everything else in this process locates itself, and it only happens when running outside dsh.
 */
function bookPath(): string {
  const home = process.env.DSH_HOME ?? process.cwd()
  return path.join(home, 'tracy-add-site', 'site-tokens.json')
}

/** The token kept for this site, or `undefined`. */
export async function rememberedToken(siteKey: string): Promise<SiteToken | undefined> {
  const book = await readBook<Book>(bookPath())
  return book[siteKey]
}

/** Write the token for this site, replacing any old one. */
export async function rememberToken(siteKey: string, entry: Omit<SiteToken, 'savedAt'>): Promise<void> {
  await updateBook<Book>(bookPath(), (book) => {
    book[siteKey] = { ...entry, savedAt: Date.now() }
  })
}

/** Forget a site's token — when it is refused, or when the site leaves Tracy. */
export async function forgetToken(siteKey: string): Promise<void> {
  await updateBook<Book>(bookPath(), (book) => {
    if (!(siteKey in book)) return false
    delete book[siteKey]
  })
}
