// The page sections of an EmDash kit run (adapters/emdash-map.mjs), kept in the work folder as `emdash-sections.json`:
// read from the site (every page of the content map opened with `X-Tracy-Preview: pick`, so the template stamps which
// entry field printed each element) when the run has a browser, else from the file an earlier run wrote, so a later
// `assemble` splits the pages the same way. Read-only: pages are only requested.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { mediaIndexOf } from '../../../content-coverage/lib/emdash-audit.mjs'
import { openKitContext } from '../capture.mjs'
import { useEmdashSections } from '../contract-read.mjs'
import { urlOfPath } from '../kit-paths.mjs'
import { readEmdashSections } from './read-emdash-sections.js'

export const EMDASH_SECTIONS_FILE = 'emdash-sections.json'
const PICK = { 'X-Tracy-Preview': 'pick' }

/** The path of a page of the EmDash map: its `openAs`, else its route. */
export const emdashPagePath = (p) => String(p.openAs ?? p.route ?? '/').replace(/\/+$/, '') || '/'

/**
 * Open each path at desktop width and read its parts.
 * @returns {Promise<{pages: Record<string, object>, failures: {path: string, reason: string}[]}>}
 */
export async function readSectionsFromSite({ chromium, siteUrl, hostHeader, paths, log = () => {} }) {
  const browser = await chromium.launch()
  const pages = {}
  const failures = []
  try {
    const ctx = await openKitContext(browser, {
      width: 1440,
      siteUrl,
      hostHeader,
      skip: ['image', 'media', 'font']
    })
    for (const path of paths) {
      const page = await ctx.newPage()
      try {
        await page.setExtraHTTPHeaders(PICK)
        const resp = await page.goto(urlOfPath(path, siteUrl), { waitUntil: 'load', timeout: 60000 })
        if (!resp || resp.status() !== 200) {
          failures.push({ path, reason: `status ${resp?.status() ?? 'none'}` })
          continue
        }
        await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {})
        const read = await page.evaluate(readEmdashSections)
        if (read) pages[path] = read
        else failures.push({ path, reason: 'the page has no <main>' })
      } catch (e) {
        failures.push({ path, reason: String(e.message ?? e).split('\n')[0] })
      } finally {
        await page.close().catch(() => {})
      }
    }
  } finally {
    await browser.close()
  }
  log('emdash sections', Object.keys(pages).length, 'pages read,', failures.length, 'failed')
  return { pages, failures }
}

/**
 * The served path of the media file each picture slot holds, from the site's own record (REST read with the agent
 * token, `mediaIndexOf` of the content coverage audit): slot key -> `_emdash/api/media/file/<storage key>`. The
 * content map keeps a picture's demo file name (`rest-6.jpg`); the page serves the stored key, so without this a
 * frame is never matched to its slot.
 * @returns {Promise<Record<string, string>>}
 */
export async function mediaPathsOf({ siteUrl, tokenFile, map }) {
  const token = readFileSync(tokenFile, 'utf8').trim()
  const bySlot = {}
  for (const [key, slots] of await mediaIndexOf({ siteUrl, token, map }))
    for (const slot of slots) bySlot[slot] ??= `_emdash/api/media/file/${key}`
  return bySlot
}

/**
 * The page reader a sections file was written by. Reader 2 names a part without a unique id or class by its place among
 * the siblings of its own tag; an older file (no `reader`) counted every sibling, the page owner element only a stamped
 * page prints included, so its selectors name the next section on the pages the kit captures.
 */
export const EMDASH_SECTIONS_READER = 2

/** Was this sections file written by an older page reader? */
export const isStaleSections = (doc) => !!doc && doc.reader !== EMDASH_SECTIONS_READER

/**
 * Settle the sections every read of the contract map splits an EmDash theme's pages by, for this run; any other
 * platform is left as it is. Reads the site when a browser and a site are given and `reread` is set, no file exists or
 * the file is an older reader's; else the work folder's file. Returns where they came from, how many pages they cover,
 * and `stale` when the file used is an older reader's (a run with no browser cannot read it again).
 * `tokenFile` (the agent token) also reads which media file each picture slot holds (`mediaPathsOf`).
 * @param {{platform?: string, out: string, map: object, siteUrl?: string, hostHeader?: string, chromium?: object|null,
 *   tokenFile?: string, reread?: boolean, log?: Function}} a
 */
export async function settleEmdashSections({
  platform,
  out,
  map,
  siteUrl,
  hostHeader,
  chromium,
  tokenFile,
  reread,
  log
}) {
  if (String(platform ?? '').toLowerCase() !== 'emdash') return null
  const file = join(out, EMDASH_SECTIONS_FILE)
  const kept = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null
  let doc = null
  let from = 'none'
  if (chromium && siteUrl && (reread || !kept || isStaleSections(kept))) {
    const paths = [...new Set((map.pages ?? []).map(emdashPagePath))]
    const r = await readSectionsFromSite({ chromium, siteUrl, hostHeader, paths, log })
    if (!Object.keys(r.pages).length)
      throw new Error(
        `no page could be read for its sections (${r.failures[0]?.path}: ${r.failures[0]?.reason}); ${file} was left as it was`
      )
    const media = tokenFile ? await mediaPathsOf({ siteUrl, tokenFile, map }) : null
    doc = { reader: EMDASH_SECTIONS_READER, pages: r.pages, failures: r.failures, media }
    writeFileSync(file, `${JSON.stringify(doc, null, 1)}\n`)
    from = 'site'
  } else if (kept) {
    doc = kept
    from = EMDASH_SECTIONS_FILE
  }
  useEmdashSections(doc?.pages ?? null, doc?.media ?? null)
  return {
    pages: Object.keys(doc?.pages ?? {}).length,
    from,
    ...(from === EMDASH_SECTIONS_FILE && isStaleSections(doc) ? { stale: true } : {})
  }
}
