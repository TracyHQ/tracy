// The demo's own words in any text slot (leftover kind C09, sharpened for spec TracyHQ/tracy#189): a heading, a paragraph, a
// step or a claim the writer left as the template shipped it, which the label rule never read. Measured 29/10/2026 on the
// local stand: four step descriptions in the demo's sport and a module's paragraphs stood on the home page with no finding.
//
//   head  a slot's sample, its first words, still on a page (what every slot rule probes), for the roles no other kind reads
//   tail  a long sample's LAST words still on a page while its first words are gone, for any role: the demo's sentence with
//         only a name swapped in ("We opened <the owner's name> in 2008, with a method that..."), which a head probe misses
//
// A sample counts only when it holds at least two words of the demo's own (`demoWordsOf`: no interface word, no word of the
// brief). A sample page of the template (`/pages/...`) is the showcase's (C11). Rules by role and words, never by template. Pure.
import { demoWordsOf, wordsOf } from './honest-written.mjs'
import { pageRole } from './page-plan.mjs'

const PROBE = 80
/** A sample this long has a tail of its own beside its head. */
const TAILED = PROBE + 40
const MIN_DEMO_WORDS = 2

const normalized = (value) =>
  String(value ?? '')
    .replace(/\(\([^)]*\)\)|<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&[a-z]+;|&#\d+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const holds = (text, probe) => new RegExp(`(^|[^a-z0-9])${escapeRe(probe)}($|[^a-z0-9])`).test(text)

const isSample = (page) =>
  page.path !== '/' && pageRole({ id: page.path.replace(/^\/+|\/+$/g, '') }) === 'sample'

/** A long sample's last words, cut at a word edge. */
function tailOf(text) {
  if (text.length < TAILED) return null
  const tail = text.slice(-PROBE)
  const edge = tail.indexOf(' ')
  return edge < 0 ? null : tail.slice(edge + 1).trim()
}

/**
 * @param {{served: Array<{path: string, text: string}>, contentMap?: {slots?: any[]} | null, demo: {own: string}}} ctx
 * @param {(slot: any) => boolean} ownedElsewhere - the roles another kind already reads by their first words
 * @returns {Array<{page: string, place: string, found: string}>}
 */
export function textLeftovers(ctx, ownedElsewhere) {
  const own = new Set(wordsOf(ctx.demo.own))
  const probes = []
  for (const slot of ctx.contentMap?.slots ?? []) {
    if (slot?.type !== 'text' || typeof slot.sample !== 'string') continue
    if (demoWordsOf(slot.sample, own).length < MIN_DEMO_WORDS) continue
    const text = normalized(slot.sample)
    const head = text.slice(0, PROBE).trim()
    if (holds(ctx.demo.own, head)) continue
    probes.push({ slot, head: ownedElsewhere(slot) ? null : head, tail: tailOf(text) })
  }
  const out = []
  for (const page of ctx.served) {
    if (isSample(page)) continue
    for (const { slot, head, tail } of probes) {
      if (head && holds(page.text, head)) out.push({ page: page.path, place: slot.key, found: head })
      else if (
        tail &&
        !holds(page.text, normalized(slot.sample).slice(0, PROBE).trim()) &&
        holds(page.text, tail)
      )
        out.push({ page: page.path, place: slot.key, found: tail })
    }
  }
  return out
}
