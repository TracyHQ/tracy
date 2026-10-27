/**
 * The Design system doors that name no site (`design-system.js`), for any signed-in seat:
 *
 * - GET  /api/design-system/library            the systems the panel and Add site offer — every Refero
 *        system that passes the quality gate (`refero:<uuid>`, with a screenshot; 12/10/2026:
 *        Refero only, all of it) — each with the font substitutions the slot makes and its palette
 *        (`colors`: the hex values of its own accent, background, text, surface and muted roles).
 *        OpenDesign (`od:<id>`) is no longer offered: applying or previewing one is `DS_UNKNOWN`. A site
 *        that already wears one still reads its name and still undoes it.
 * - GET  /api/design-system/library/refero/:uuid/screenshot.jpg   an offered Refero system's picture: a
 *        480-px WebP thumbnail (`image/webp`; the URL keeps its old `.jpg` name so cards already drawn hold).
 * - GET  /api/design-system/support?quickstart=<tag>&platform=<cms>   whether a NEW site built from the
 *        newest release of that quickstart can wear a design system. A template the customer lock closes
 *        (`lib/design-system-customer-lock.js`) answers `supported: false`, `TEMPLATE_NOT_READY`, `locked: true`
 *        to a customer; staff, and this server's own door probe, are answered as the contract says.
 */
import { readFile } from 'node:fs/promises'

import { LOCKED_REASON } from '../lib/design-system-customer-lock.js'

/**
 * @param {import('hono').Hono} app
 * @param {{
 *   ds: {
 *     referoScreenshot?: (uuid: string) => Promise<string | null> | string | null,
 *     supportForNewSite?: (q: { platform: string, tag: string, version: string | null }) => any,
 *     quickstartTemplateOf?: (q: { platform: string, tag: string | null }) => string | null
 *   },
 *   offered: () => Promise<any[]>,
 *   signedIn: (c: any) => Promise<{ error?: Response, email?: string, probe?: boolean }>,
 *   releaseVersion: (tag: string) => Promise<string | null>,
 *   json: (c: any, body: any, status?: number) => Response,
 *   platforms: Set<string>,
 *   lockedFor?: (email: string | null | undefined, templateKey: string | null | undefined) => Promise<boolean>
 * }} deps
 */
export function mountDesignSystemLibrary(
  app,
  { ds, offered, signedIn, releaseVersion, json, platforms, lockedFor = async () => false }
) {
  app.get('/api/design-system/library', async (c) => {
    const who = await signedIn(c)
    if (who.error) return who.error
    const refero = await offered()
    const row = (s, kind, id, image) => ({
      id,
      kind,
      name: s.name,
      description: s.description ?? null,
      group: s.category ?? null,
      theme: s.theme ?? null,
      image,
      fonts: Array.isArray(s.fonts) ? s.fonts : [],
      colors: Array.isArray(s.colors) ? s.colors : [],
      ok: s.ok === true
    })
    c.header('Cache-Control', 'private, max-age=300')
    return c.json({
      systems: refero.map((s) =>
        row(s, 'refero', s.id, `/api/design-system/library/refero/${s.uuid}/screenshot.jpg`)
      )
    })
  })

  app.get('/api/design-system/library/refero/:uuid/screenshot.jpg', async (c) => {
    const file = ds.referoScreenshot ? await ds.referoScreenshot(c.req.param('uuid')) : null
    if (!file) return json(c, { code: 'NOT_FOUND' }, 404)
    let bytes
    try {
      bytes = await readFile(file)
    } catch {
      return json(c, { code: 'NOT_FOUND' }, 404)
    }
    return c.body(bytes, 200, {
      'content-type': 'image/webp',
      'cache-control': 'public, max-age=86400'
    })
  })

  app.get('/api/design-system/support', async (c) => {
    const who = await signedIn(c)
    if (who.error) return who.error
    const tag = String(c.req.query('quickstart') ?? '').slice(0, 200)
    const platform = String(c.req.query('platform') ?? '')
    const unknown = { supported: false, reason: 'TEMPLATE_NOT_READY', need: null, have: null }
    if (!tag || !platforms.has(platform) || !ds.supportForNewSite) return json(c, unknown)
    let version = null
    try {
      version = await releaseVersion(tag)
    } catch {
      version = null
    }
    if (version === null && platform !== 'wordpress') return json(c, unknown)
    const said = ds.supportForNewSite({ platform, tag, version })
    if (said?.supported === true && !who.probe) {
      // The template a site built from that quickstart runs (the lock's key); none named: locked.
      const templateKey = ds.quickstartTemplateOf ? ds.quickstartTemplateOf({ platform, tag }) : null
      if (await lockedFor(who.email, templateKey))
        return json(c, { supported: false, reason: LOCKED_REASON, need: null, have: null, locked: true })
    }
    return json(c, said)
  })
}
