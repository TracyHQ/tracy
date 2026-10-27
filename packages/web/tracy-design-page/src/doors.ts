/**
 * Where the shared components knock when they run on the public page (ADR 0011 §A4). The plugin's
 * client calls one `door(rest)` for everything; here the same requests land on static assets
 * (the 152 systems, split out of vendor at build time) and on cowork-web's own doors (`api/read`
 * for a visitor's words). No brand door since 03/10/2026: a measured brand is not a template and
 * the page no longer asks for one (`template-shelf.mjs`). Doors that need a
 * seat — `choose`, `copy/*` — point at `api/none`, which answers 404; the components already treat
 * that as "no file", and `publicMode` hides the buttons that would write.
 */

import type { SitePreview } from '../../../design/tracy-design-inspiration/src/client/api'

export const BASE = '/design-inspiration'

/** Everything the components ask for is a static file of the 152, or no door at all. */
export function publicDoor(rest: string): string {
  const parts = rest.split('/')
  const head = parts[0]
  if (rest === 'catalog') return `${BASE}/data/catalog.json`
  if (head === 'systems' && parts.length >= 3) {
    const id = decodeURIComponent(parts[1] ?? '')
    const file = parts.slice(2).join('/')
    if (file === 'slots') return `${BASE}/systems/${encodeURIComponent(id)}/slots.json`
    if (parts[2] === 'artifact-slots' && parts[3])
      return `${BASE}/systems/${encodeURIComponent(id)}/artifact-slots/${parts[3]}.json`
    return `${BASE}/systems/${encodeURIComponent(id)}/${file}`
  }
  return `${BASE}/api/none/${rest}`
}

/** The words of a public site, read by the Worker (no seat, no model). */
export interface ReadResult {
  ok: boolean
  host?: string
  site?: SitePreview
  message?: string
  /** The read door's machine code on a refusal — `BLOCKED` reads differently from `UNREACHABLE`. */
  code?: string
  /** True when the site answered too slowly to finish: these words are as far as it got. */
  partial?: boolean
}
/** `&lang=` for a door that answers in the asker's language; nothing for a value that is not one. */
function langParam(lang: string | undefined): string {
  return lang && /^[a-z]{2}$/.test(lang) ? `lang=${lang}` : ''
}

/** @param lang - the page's language (`locale.ts`), so the door's own sentences match the page. */
export async function readSite(domain: string, lang?: string): Promise<ReadResult> {
  try {
    const also = langParam(lang)
    const res = await fetch(`${BASE}/api/read?url=${encodeURIComponent(domain)}${also ? `&${also}` : ''}`, {
      headers: { accept: 'application/json' }
    })
    const body = (await res.json().catch(() => ({}))) as ReadResult
    return res.ok
      ? { ...body, ok: true }
      : { ok: false, code: body.code, message: body.message ?? `${res.status}` }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * A name or a sentence about the business → the site block, written by the Worker's model.
 * @param lang - the page's language (`locale.ts`), the same way `readSite` takes it.
 */
export async function writeWords(brief: string, lang?: string): Promise<ReadResult> {
  try {
    const also = langParam(lang)
    const res = await fetch(`${BASE}/api/words${also ? `?${also}` : ''}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ brief })
    })
    const body = (await res.json().catch(() => ({}))) as ReadResult
    return res.ok ? { ...body, ok: true } : { ok: false, message: body.message ?? `${res.status}` }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Where a visitor goes to build, and the finished sites this deployment publishes. Both live in
 * `templates.mjs` — plain, so their tests can import them — and are re-exported here because this
 * is where the page looks for a door.
 */
export { buildUrl, fetchDesignSystemsShown, fetchTemplates, listRows, TEMPLATES_DOOR } from './templates.mjs'

/** A typed domain as a host: scheme and path dropped, lower-cased, or null when it is not one. */
export function hostOf(input: string): string | null {
  const trimmed = input.trim().toLowerCase()
  if (trimmed === '') return null
  try {
    const url = new URL(/^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`)
    return /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(url.hostname) ? url.hostname : null
  } catch {
    return null
  }
}
