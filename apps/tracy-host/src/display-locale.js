/**
 * `POST /_host/display-locale` — the language tag an EmDash site prints in `<html lang>` and hreflang,
 * written where its template reads it: `<privateRoot>/<label>/data/display-locale.json`, which is the
 * container's `/app/data` (`render-compose.sh` binds `./data:/app/data`; the template's
 * `src/lib/display-locale.ts` reads `<SITE_DATA_DIR>/display-locale.json`).
 *
 * WHY A HOST DOOR (#1013). The template's personalize tool decides the tag (`{ "en": "vi-VN" }` for a root
 * written in Vietnamese) and writes it beside its receipts. The Build runs that tool inside the container,
 * so the file lands in `/app/data`. Apply runs it from tracy-web, outside every container, against the
 * site's HTTP API: the file landed in tracy-web's scratch folder and was deleted with it, and every site
 * Apply wrote in another language still printed `<html lang="en">`. EmDash's settings cannot hold the tag
 * (its schema strips unknown keys), so the file is the template's contract and this door delivers it.
 *
 * 🔒 ONE FILE, ONE SHAPE, NEVER A PATH THE CALLER NAMES. The body is `{label, locales}`; `locales` maps a
 * stored locale to a BCP 47 tag and nothing else passes. Only an EmDash site (`siteShape`) whose `data`
 * is a real directory is written, and neither the folder nor the file is followed through a link. The
 * file is written whole (a temporary file renamed over it), readable by the site's own user.
 */
import { randomBytes } from 'node:crypto'
import { chown, lstat, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { siteShape } from './webroot.js'

/** The file the template reads, in its data folder. */
export const DISPLAY_LOCALE_FILE = 'display-locale.json'
/** A stored locale as EmDash names one: `en`, `zh-TW`, `pt-BR`. */
const STORED = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/
/** The tag the template prints (its own `TAG`): a language, optionally with its region. */
const SHOWN = /^[a-z]{2,3}(?:-[A-Z]{2})?$/
/** More locales than any template ships (Business ships 40). */
const MAX_LOCALES = 64

/**
 * The map as it may be written, or null when it is not one.
 * @param {unknown} locales
 * @returns {Record<string, string> | null}
 */
export function displayLocalesOf(locales) {
  if (!locales || typeof locales !== 'object' || Array.isArray(locales)) return null
  const entries = Object.entries(locales)
  if (entries.length > MAX_LOCALES) return null
  /** @type {Record<string, string>} */
  const out = {}
  for (const [stored, shown] of entries) {
    if (!STORED.test(stored) || typeof shown !== 'string' || !SHOWN.test(shown)) return null
    out[stored] = shown
  }
  return out
}

/**
 * Write the tag map into one EmDash site's data folder.
 * @param {{ label: string, locales: unknown, config: { privateRoot: string } }} input
 * @returns {Promise<{ ok: true } | { ok: false, code: 'BAD_LOCALES' | 'NOT_EMDASH' | 'NO_DATA_DIR' | 'NOT_A_FILE' | 'WRITE_FAILED', detail?: string }>}
 */
export async function writeDisplayLocale({ label, locales, config }) {
  const map = displayLocalesOf(locales)
  if (!map) return { ok: false, code: 'BAD_LOCALES' }
  const siteDir = path.join(config.privateRoot, label)
  if ((await siteShape(siteDir)) !== 'emdash') return { ok: false, code: 'NOT_EMDASH' }
  const dataDir = path.join(siteDir, 'data')
  const folder = await lstat(dataDir).catch(() => null)
  if (!folder?.isDirectory()) return { ok: false, code: 'NO_DATA_DIR' }
  const target = path.join(dataDir, DISPLAY_LOCALE_FILE)
  const existing = await lstat(target).catch(() => null)
  if (existing && !existing.isFile()) return { ok: false, code: 'NOT_A_FILE' }
  const temp = path.join(dataDir, `.${DISPLAY_LOCALE_FILE}.${randomBytes(6).toString('hex')}`)
  try {
    // `wx`: a name nobody holds, never a file (or a link) somebody left there.
    await writeFile(temp, `${JSON.stringify(map)}\n`, { flag: 'wx', mode: 0o644 })
    // The site's own user owns its data folder; a file left to root is one the in-container tool cannot replace later.
    await chown(temp, folder.uid, folder.gid).catch(() => {})
    await rename(temp, target)
    return { ok: true }
  } catch (error) {
    await unlink(temp).catch(() => {})
    return { ok: false, code: 'WRITE_FAILED', detail: error instanceof Error ? error.message : String(error) }
  }
}
