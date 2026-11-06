// How the finisher confirms a first site check failure on the live site before it may become a repair order (#423, spec #418):
//   - by the finder, only when the finder's fault is about the same place: the same slot or the same block, or, when the
//     finder named neither, words it quoted that are the words the failure measured. A finder fault elsewhere on the same
//     page confirms nothing;
//   - else by reading the page the site serves now: it still holds what the check measured.
// And when two failures of the site check are one fault (another width, another group), counted once. Pure.
import { siteCheckText } from './glued-words.js'
import { hrefsIn } from './live-confirm.js'
import { pageOf, samePage } from './page-paths.js'

const DEMO_CONTACT = /^(tel|mailto):/i
const squash = (s) =>
  String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
const blockOf = (slot) => (slot ? String(slot).replace(/\.[^.]*$/, '') : null)
const digits = (s) => String(s).replace(/\D+/g, '')
const decoded = (html) =>
  String(html)
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")

/** The words a finder quoted in what it saw: each double-quoted part, else the whole sentence. */
export function quotedIn(seen) {
  const parts = [...String(seen ?? '').matchAll(/["“]([^"”]{3,})["”]/g)].map((m) => squash(m[1]))
  return parts.length ? parts : [squash(seen)].filter(Boolean)
}

/** Whether the finder's fault `x` confirms the site check's fault `f`: same kind, same page, and the same place. */
export function confirmedByFinder(x, f) {
  if (x.kind !== f.kind) return false
  if (x.page && f.page && !samePage(x.page, f.page)) return false
  const xBlock = x.block ?? blockOf(x.slot)
  if (x.slot || x.block) {
    if (x.slot && f.slot && x.slot === f.slot) return true
    const fBlock = f.block ?? blockOf(f.slot)
    return Boolean(xBlock && fBlock && xBlock === fBlock)
  }
  const measured = squash(f.measured)
  if (measured.length < 3) return false
  return quotedIn(x.seen).some((q) => q.length >= 3 && (measured.includes(q) || q.includes(measured)))
}

/** Two site check failures of one fault: same kind, agreeing on page and slot, one of the two named alike in both. */
export function sameCheckFault(a, b) {
  if (a.kind !== b.kind) return false
  if (a.page && b.page && !samePage(a.page, b.page)) return false
  if (a.slot && b.slot && a.slot !== b.slot) return false
  return Boolean((a.page && pageOf(a.page) === pageOf(b.page)) || (a.slot && a.slot === b.slot))
}

/**
 * Whether the page the site serves now still holds what the check measured: a tel: or mailto: link to the same number or
 * address, else the measured words or address anywhere in the page, as written or read the way the site check reads it (a
 * hidden line break glues the words beside it, and a template's capitals are set aside), so the same text is judged the
 * same. Null when there is nothing measured to look for.
 */
export function servedNow(html, measured) {
  if (typeof measured !== 'string' || !measured.trim()) return null
  const page = decoded(html)
  const scheme = measured.match(DEMO_CONTACT)?.[1]?.toLowerCase()
  if (scheme) {
    // Every link target, quoted or not, so a number written with spaces is read whole (live-confirm.js).
    const hrefs = hrefsIn(html)
      .filter((h) => h.toLowerCase().startsWith(`${scheme}:`))
      .map((h) => h.slice(scheme.length + 1))
    const want = measured.slice(scheme.length + 1)
    return scheme === 'tel'
      ? hrefs.some((h) => digits(h) === digits(want) && digits(want) !== '')
      : hrefs.some((h) => decodeURIComponent(h).toLowerCase() === want.toLowerCase())
  }
  if (page.includes(measured.trim())) return true
  const read = measured.replace(/\s+/g, ' ').trim().toLowerCase()
  return siteCheckText(html).includes(read)
}
