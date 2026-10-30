/**
 * A BUILD'S WORDS PUT ON THE SITE PAGE BY PAGE, NOT TYPED AGAIN BY THE MODEL (plan "10/10" §7 S5, council 26/10/2026).
 *
 * tracy-web writes each page's words in small structured tasks and keeps them as packs of `{find, replace}` pairs —
 * the template's words as the page shows them and the business's in their place (`demo-copy.js`). `tracy_demo
 * {operation:"copy.apply"}` reads the packs (`copy.read`) and puts them on the site with the very content.replace job a
 * person's words take (`replace.mjs`): it finds words where they are stored, on all three CMS, and never touches markup.
 * The model sends one short call instead of every word again.
 *
 * A call carries at most `REPLACE_MAX_CHANGES` pairs, and the job refuses a whole call for one pair it cannot place
 * (`locateAll`: "the first refusal wins, and nothing is written"); that pair is set aside with its reason and the rest
 * are sent again. The answer lists what was placed, what was not and why, and the issues the tasks raised — the agent
 * writes only those. The pack of the words every page shows (`*shared*`) is placed from the home page.
 *
 * A pair whose words the page shows in more than one place (`AMBIGUOUS`) is sent again alone with `all:"page"`: the
 * tasks wrote from the page's words read once each (`pageBlocks`), so every place showing them gets the same new words
 * (local round 35, 26/10/2026: four service names of an EmDash home, in its cards and its footer, left as they were).
 * A pair the page shows but no record of its own holds (`NOT_EDITABLE`: a post's title on a list page) stays an
 * issue for its native record's editor. A page pack never expands its write to records elsewhere on the site.
 * Either retry that asks for its count (`confirm-count`) is sent once more with the count it read.
 *
 * 🔒 ONLY A REFUSAL THAT PROVES NOTHING WAS WRITTEN IS SENT AGAIN (28/10/2026, `refusedBeforeWrite`): a lost
 * receipt, a timeout or an unknown outcome may have written the whole call, and a pair whose new words hold its old
 * ones would be written twice. Such pairs are never listed under `notPlaced`, which the agent is told to write: they
 * are listed under `unknown`, with the answer's code, and the `next` says to read the page first and write only the
 * words it still shows as they were (28/10/2026). `notPlaced` holds only pairs proven unwritten.
 */
import { refusedBeforeWrite } from './refused-before-write.mjs'
import { REPLACE_MAX_CHANGES } from './replace.mjs'

/**
 * What `next` says of pairs whose write's answer was lost: they may be on the site already, and a pair whose new words
 * hold its old ones would be written twice if sent unread.
 */
export const UNKNOWN_NEXT =
  'The words under unknown may already be on the site (their answer was lost): in about 30 s read their page with tracy_site page.text {path}, and write only the words it still shows as they were; never send them again unread.'

/** How many entries of each list (`notPlaced`, `unknown`, `issues`) one page's answer carries. */
export const LIST_MAX = 30

/** What `next` says when a page's list was cut: the rest are counted, not named, so they are read for. */
export const CUT_NEXT =
  'A page whose answer has notListed lists only the first of them: read that page with tracy_site page.text {path} and write only the template words it still shows; nothing is known to be on the site beyond what is listed as placed.'

/** The page a pack is placed from. */
const pathOf = (/** @type {{ path: string }} */ pack) => (pack.path === '*shared*' ? '/' : pack.path)

/**
 * @param {{ read: (page?: string) => Promise<any>,
 *   replace: (path: string, changes: {find: string, replace: string}[], options?: {all?: true | 'page', expect?: number}) => Promise<any>,
 *   page?: string, signal?: AbortSignal | null }} input
 * @returns {Promise<Record<string, unknown>>}
 */
export async function applyCopy({ read, replace, page, signal = null }) {
  const got = await read(page)
  if (got?.ok === false) return got
  const packs = Array.isArray(got?.pages) ? got.pages : []
  if (!packs.length)
    return { ok: false, code: 'COPY_NOTHING_TO_APPLY', next: 'tracy_demo {operation:"copy.write"} first.' }
  const pages = []
  let left = 0
  let unsure = false
  let cut = false
  for (const pack of packs) {
    if (signal?.aborted) break
    const path = pathOf(pack)
    /** @type {{find: string, code: unknown}[]} */
    const notPlaced = []
    /** Pairs whose write may have landed: read before anything is written again. @type {{find: string, code: unknown}[]} */
    const unknown = []
    /** @type {[{find: string, replace: string}, 'page'][]} */
    const again = []
    // Only page-scoped retries are allowed. Editorial records shared with another page keep their own writer.
    const setAside = (/** @type {{find: string, replace: string}} */ one, /** @type {any} */ answer) => {
      if (!refusedBeforeWrite(answer)) unknown.push({ find: one.find, code: answer?.code ?? null })
      else if (answer?.code === 'AMBIGUOUS') again.push([one, 'page'])
      else notPlaced.push({ find: one.find, code: answer?.code ?? null })
    }
    let placed = 0
    const queue = [...(pack.changes ?? [])]
    while (queue.length && !signal?.aborted) {
      let chunk = queue.splice(0, REPLACE_MAX_CHANGES)
      // Set aside the pairs the job refuses one at a time; the rest go again in the same call.
      for (let tries = 0; chunk.length && tries <= REPLACE_MAX_CHANGES; tries++) {
        const answer = await replace(path, chunk)
        if (answer?.ok !== false) {
          placed += chunk.length
          break
        }
        if (!refusedBeforeWrite(answer)) {
          for (const one of chunk) unknown.push({ find: one.find, code: answer?.code ?? null })
          chunk = []
          break
        }
        const at = Number.isInteger(answer.change) ? answer.change : chunk.length === 1 ? 0 : null
        if (at === null) {
          // A refusal that names no pair (the theme-printed road's AMBIGUOUS among them): each is tried on its own so
          // one bad pair costs only itself.
          for (const one of chunk) {
            const alone = await replace(path, [one])
            if (alone?.ok === false) setAside(one, alone)
            else placed += 1
          }
          chunk = []
          break
        }
        setAside(chunk[at], answer)
        chunk = chunk.filter((_, i) => i !== at)
      }
    }
    for (const [one, all] of again) {
      if (signal?.aborted) break
      let answer = await replace(path, [one], { all })
      // More places than a change writes unasked: the count the job read is the one it is told to expect.
      if (refusedBeforeWrite(answer) && Number.isInteger(answer.count) && answer.rule === 'confirm-count')
        answer = await replace(path, [one], { all, expect: answer.count })
      if (answer?.ok === false)
        (refusedBeforeWrite(answer) ? notPlaced : unknown).push({ find: one.find, code: answer.code ?? null })
      else placed += 1
    }
    const lists = { notPlaced, unknown, issues: pack.issues ?? [] }
    // 🔒 A CUT LIST SAYS WHAT IT LEFT OUT (28/10/2026): 40 pairs of unknown outcome listed 30, and `next` said
    // every other page's words were on the site. Each list keeps its first `LIST_MAX` for the answer's size; the rest
    // are counted under `notListed`, and `next` then claims nothing about them.
    const notListed = Object.fromEntries(
      Object.entries(lists)
        .filter(([, list]) => list.length > LIST_MAX)
        .map(([key, list]) => [key, list.length - LIST_MAX])
    )
    pages.push({
      page: pack.path === '*shared*' ? 'shared (header and footer)' : path,
      placed,
      ...Object.fromEntries(
        Object.entries(lists)
          .filter(([, list]) => list.length > 0)
          .map(([key, list]) => [key, list.slice(0, LIST_MAX)])
      ),
      ...(Object.keys(notListed).length ? { notListed } : {})
    })
    // Counted whole, not as listed: what `next` says is left.
    left += notPlaced.length + lists.issues.length
    unsure ||= unknown.length > 0
    cut ||= Object.keys(notListed).length > 0
  }
  /** @type {string[]} */
  const next = []
  if (left)
    next.push(
      cut
        ? 'Write what is listed under notPlaced and issues, on its page, with content.replace or the record it lives in.'
        : 'Write only what is listed under notPlaced and issues, on its page, with content.replace or the record it lives in; everything else is on the site.'
    )
  else if (!cut)
    next.push(
      unsure
        ? 'Every other page’s words are on the site.'
        : 'Every page’s words are on the site; go on with the pictures and the checks.'
    )
  if (unsure) next.push(UNKNOWN_NEXT)
  if (cut) next.push(CUT_NEXT)
  return { ok: true, pages, next: next.join(' ') }
}
