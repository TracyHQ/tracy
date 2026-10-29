/**
 * The overlap safety net of a Joomla brief build (spec TracyHQ/tracy#189): once the build has written its pictures and its
 * head block, the site's host reads the home page and the kept pages in a browser at every visitor width
 * (`POST /_host/picture-overlap`, tracy-host `picture-overlap.js`). A picture of the build that covers a heading, a
 * paragraph, a button or the logo is taken off: added to the head block's `pictures` (hidden wherever it is shown, nothing
 * else moves) and named in the build's notes with the widths and the words it covered.
 *
 * 🔒 A NET, NEVER A GATE: no host, no browser, a check that fails or times out: the build goes on as it is and the note
 * says the pictures were not checked. It never fails the build or the QA gate. Only the build's own pictures (its upload
 * folder) are ever taken off; a template picture is the template's design.
 */

/** The pages read: the home page and the first kept pages. Each is read at four widths. */
export const OVERLAP_PAGES = 5
/** The folder a brief build uploads its pictures under (`content.media.write`: `…/tracy-content/<sha256>.<ext>`). */
export const BUILD_FOLDER = 'tracy-content/'

/**
 * The pages the net reads, from the site plan: home, then each page the plan keeps.
 * @param {{pages?: Array<{decision?: string, path?: string}>} | null | undefined} plan
 */
export function overlapPagesOf(plan) {
  const kept = (plan?.pages ?? [])
    .filter((p) => p?.decision === 'keep' && typeof p.path === 'string' && p.path !== '/' && p.path !== '')
    .map((p) => (p.path.startsWith('/') ? p.path : `/${p.path}`))
  return [...new Set(['/', ...kept])].slice(0, OVERLAP_PAGES)
}

const pathOf = (src) =>
  String(src ?? '')
    .split(/[?#]/)[0]
    .replace(/^\/+/, '')

/**
 * Check once, and take off what covers words.
 * @param {object} input
 * @param {((siteKey: string, pages: string[]) => Promise<{findings?: any[]} | null>) | null} input.check - the host call
 * @param {string} input.siteKey
 * @param {any} input.plan - the site plan (its kept pages)
 * @param {string[]} input.pictures - the pictures the head block already hides
 * @param {(pictures: string[]) => Promise<unknown>} input.rewrite - writes the head block again with these pictures
 * @param {(note: string) => void} input.note
 * @param {(phase: string, n: number) => void} [input.time]
 * @returns {Promise<{checked: boolean, takenOff: Array<{path: string, widths: number[], covers: any[]}>}>}
 */
export async function overlapSafetyNet({ check, siteKey, plan, pictures, rewrite, note, time = () => {} }) {
  if (!check) return { checked: false, takenOff: [] }
  let answer = null
  try {
    answer = await check(siteKey, overlapPagesOf(plan))
  } catch {
    answer = null
  }
  if (!answer || !Array.isArray(answer.findings)) {
    note('the placed pictures could not be checked against the words in a browser')
    return { checked: false, takenOff: [] }
  }
  const hidden = new Set(pictures.map(pathOf))
  const takenOff = []
  for (const f of answer.findings) {
    const path = pathOf(f?.src)
    if (!path.includes(BUILD_FOLDER) || hidden.has(path)) continue
    hidden.add(path)
    takenOff.push({
      path,
      widths: (f.widths ?? []).filter(Number.isFinite),
      covers: (f.covers ?? []).slice(0, 4)
    })
  }
  if (takenOff.length === 0) return { checked: true, takenOff }
  try {
    await rewrite([...pictures, ...takenOff.map((t) => t.path)])
  } catch (error) {
    note(
      `a placed picture covers the words but could not be taken off: ${error instanceof Error ? error.message : error}`
    )
    return { checked: true, takenOff: [] }
  }
  for (const t of takenOff) {
    const words = t.covers.map((c) => (c.text ? `${c.kind} "${c.text}"` : c.kind)).join(', ')
    note(`a placed picture covered ${words} at ${t.widths.join(', ')}px wide, so it was taken off: ${t.path}`)
  }
  time('picturesOverlapTakenOff', takenOff.length)
  return { checked: true, takenOff }
}
