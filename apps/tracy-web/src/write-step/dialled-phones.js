// A phone link the kit says no door holds is refused with the demo number the template printed (link-lines.js `noDoor`). The
// template may still dial the brief's number: it prints a tel: link around the contact phone the write step wrote (card AZ,
// 2026-11-06). So, once the writes are done and the pages read, such a refusal is read against the page: a tel: link dialling the
// plan's number, and none left dialling the demo's, means the page already calls the business and nothing is to write.
// Numbers are matched as the brief phones are (phone-links.js): spaces, dashes, a leading + or 00, a national 0.
import { international, phoneOf } from './phone-links.js'

const each = (value) => (Array.isArray(value) ? value : [])
const TEL = /href\s*=\s*["']tel:([^"']+)["']/gi

const decoded = (value) => {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}
/** The numbers a page's tel: links dial, as written. */
const telsOf = (html) => [...String(html ?? '').matchAll(TEL)].map((m) => decoded(m[1]).trim())

/**
 * @param {{ lines: object[], planLinks?: object[], keptPages?: { id: string, path: string }[],
 *   pageHtml: (path: string) => Promise<string | null> }} input
 * @returns {Promise<object[]>} the lines, a refused phone link the page already dials given as skipped with `already: 'dials'`
 */
export async function settleDialledPhones({ lines, planLinks, keptPages, pageHtml }) {
  const links = new Map(each(planLinks).map((l) => [l?.link, l]))
  const pathOf = new Map(each(keptPages).map((p) => [p?.id, p?.path]))
  const read = new Map()
  const page = async (path) => {
    if (!read.has(path)) read.set(path, await pageHtml(path).catch(() => null))
    return read.get(path)
  }
  const out = []
  for (const line of each(lines)) {
    const link = line?.status === 'refused' ? links.get(line.slot) : null
    const digits = link?.target?.kind === 'phone' ? String(link.target.digits ?? '') : ''
    if (!digits) {
      out.push(line)
      continue
    }
    const plan = { digits }
    const demo =
      typeof line.keeps === 'string' ? { digits: international(line.keeps.replace(/^tel:/i, '')) } : null
    let dialled = null
    for (const path of each(link.pages)
      .map((id) => pathOf.get(id))
      .filter(Boolean)) {
      const html = await page(path)
      if (typeof html !== 'string') continue
      const tels = telsOf(html)
      if (demo?.digits && tels.some((t) => phoneOf(t, [demo]))) continue
      if (tels.some((t) => phoneOf(t, [plan]))) {
        dialled = path
        break
      }
    }
    out.push(
      dialled
        ? {
            key: null,
            slot: line.slot,
            owner: line.owner,
            status: 'skipped',
            already: 'dials',
            reason: `it already dials +${digits} on ${dialled} (the template prints a tel: link around the phone the page holds), so there is nothing to write; read: the page's tel: links`,
            readBack: null
          }
        : line
    )
  }
  return out
}
