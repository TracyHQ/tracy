/**
 * Whether the customer's Add site preview can load right now, asked of THIS server's own doors (PR 2 of
 * 14/10/2026). The measuring machine reads a demo's stylesheets through its own copy of the asset door,
 * so it never sees the product door break: on 14/10/2026 every fleet01 stylesheet answered 502 through
 * `/api/design-system/preview-asset` and the popup showed an unstyled page while every rule passed.
 *
 * For each published line with a live demo, the server asks its own preview door for the home page
 * wearing one system (Moxie), then every stylesheet and font that page and its stylesheets point at
 * through the asset door, in process (`request` is the app's own `app.request`), and keeps what failed.
 * The Road to live turns a failure into PREV-1 must-fix ("the customer's preview cannot load its
 * stylesheets"), so a door regression shows on /ops within one refresh, not by eye.
 *
 * The doors are for signed-in seats; this check passes them with a per-process token in
 * {@link DOOR_PROBE_HEADER}, made at boot and never sent anywhere else (`sites/route.js` dsSignedIn).
 * It runs one line at a time, a few seconds apart, so it stays under the doors' thirty asks a minute
 * and never hammers a light demo host.
 */

import { randomBytes, timingSafeEqual } from 'node:crypto'

export const DOOR_PROBE_HEADER = 'x-tracy-door-probe'

/** A fresh token for one process (64 hex characters). */
export const newDoorProbeToken = () => randomBytes(32).toString('hex')

/** Whether a request header carries this process's token, compared in constant time. */
export function isDoorProbe(
  /** @type {string | undefined | null} */ header,
  /** @type {string | null} */ token
) {
  if (!token || typeof header !== 'string' || header.length !== token.length) return false
  return timingSafeEqual(Buffer.from(header), Buffer.from(token))
}

/** The system the check dresses each demo in: Moxie, the one the eye audits use. */
export const DOOR_PROBE_SYSTEM = 'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0'

const ASSET_LINK = /\/api\/design-system\/preview-asset\?[^"'\s)<>]+/g

/**
 * `missing`: stylesheets or fonts the page links that the demo ITSELF has not got (the asset door's 404
 * `DEMO_UNREADABLE`, its answer for "the demo has not got the file"). The live site misses them the same
 * way, so the preview looks as the site does: the template's own dead link, kept apart from `failed`
 * (measured 20/10/2026: JA T3 templates link `/templates/system/css/system.css`, which Joomla 6 no
 * longer ships). A 404 `NOT_FOUND` is the door not finding the demo and stays a failure, and when no
 * asset loads at all every miss counts as failed: that preview is unstyled whatever the cause.
 * @typedef {{ checkedAt: number, page: number, assets: number, failed: { path: string, status: number }[], missing?: { path: string, status: number }[], skipped?: string }} DoorHealth
 */

/**
 * @param {{
 *   request: (path: string, init?: RequestInit) => Promise<Response> | Response,
 *   token: string,
 *   systemId?: string,
 *   now?: () => number,
 *   keepMs?: number,
 *   spacingMs?: number,
 *   maxAssets?: number
 * }} deps
 */
export function previewDoorHealth({
  request,
  token,
  systemId = DOOR_PROBE_SYSTEM,
  now = Date.now,
  keepMs = 10 * 60_000,
  spacingMs = 3_000,
  maxAssets = 60
}) {
  /** @type {Map<string, DoorHealth>} */
  const kept = new Map()
  /** @type {Promise<void> | null} */
  let running = null
  const ask = (/** @type {string} */ path) =>
    Promise.resolve(request(path, { headers: { [DOOR_PROBE_HEADER]: token } }))
  /** The door paths an answer points at, `&amp;` undone, origin dropped. */
  const linksOf = (/** @type {string} */ text) =>
    [...String(text).matchAll(ASSET_LINK)].map((m) => m[0].replace(/&amp;/g, '&'))
  /** The refusal `code` of a door's JSON answer, or null. */
  const codeOf = async (/** @type {Response} */ res) => {
    try {
      return (await res.json())?.code ?? null
    } catch {
      return null
    }
  }
  const pathParam = (/** @type {string} */ link) =>
    new URLSearchParams(link.split('?')[1] ?? '').get('path') ?? link

  /**
   * One line's check now.
   * @param {string} tag
   * @returns {Promise<DoorHealth>}
   */
  async function check(tag) {
    const at = now()
    const page = await ask(
      `/api/design-system/preview?quickstart=${encodeURIComponent(tag)}&id=${encodeURIComponent(systemId)}`
    )
    // no demo or no slot: DEMO-1 says so; nothing to load
    if (page.status === 409)
      return { checkedAt: at, page: 409, assets: 0, failed: [], skipped: 'unavailable' }
    if (!page.ok)
      return { checkedAt: at, page: page.status, assets: 0, failed: [{ path: '/', status: page.status }] }
    const queue = [...new Set(linksOf(await page.text()))]
    const seen = new Set(queue)
    /** @type {{ path: string, status: number }[]} */
    const failed = []
    /** @type {{ path: string, status: number }[]} */
    const missing = []
    let loaded = 0
    let assets = 0
    while (queue.length && assets < maxAssets) {
      const link = /** @type {string} */ (queue.shift())
      assets++
      let res
      try {
        res = await ask(link)
      } catch {
        failed.push({ path: pathParam(link), status: 0 })
        continue
      }
      if (!res.ok) {
        const miss = { path: pathParam(link), status: res.status }
        if (res.status === 404 && (await codeOf(res)) === 'DEMO_UNREADABLE') missing.push(miss)
        else failed.push(miss)
        continue
      }
      loaded++
      // a stylesheet's own fonts and imports go through the same door
      if (/text\/css/.test(res.headers.get('content-type') ?? ''))
        for (const l of linksOf(await res.text()))
          if (!seen.has(l)) {
            seen.add(l)
            queue.push(l)
          }
    }
    if (!loaded) failed.push(...missing.splice(0))
    return { checkedAt: at, page: page.status, assets, failed, ...(missing.length ? { missing } : {}) }
  }

  /** The kept answer of a line, or null when it was never checked. */
  const of = (/** @type {string} */ tag) => kept.get(tag) ?? null

  /**
   * Check, one after another, every line of `tags` whose answer is older than `keepMs`. Only one run at
   * a time; a call while one runs returns that run.
   * @param {string[]} tags
   */
  function refresh(tags) {
    if (running) return running
    running = (async () => {
      for (const tag of tags) {
        const had = kept.get(tag)
        if (had && now() - had.checkedAt < keepMs) continue
        try {
          kept.set(tag, await check(tag))
        } catch {
          /* the next refresh asks again */
        }
        if (spacingMs) await new Promise((r) => setTimeout(r, spacingMs))
      }
    })().finally(() => {
      running = null
    })
    return running
  }

  return { check, of, refresh }
}
