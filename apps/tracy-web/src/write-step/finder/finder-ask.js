// One finder call (#448, carried over from PR #426): one page's screenshot sheets (finder-sheets.js) at desktop
// (1440 px) and phone (390 px) width, with the template demo's shot of each block the page shows, in; faults of the closed list
// (finder-kinds.js) out, as one JSON object. It never reads the site check and never writes to the site. A call that fails
// or answers no JSON object is `{ problem }`; the caller logs it and moves on.
import { jsonObjectIn } from '../../lib/json-object-in.js'
import { imageAt } from '../../lib/template-kit/reader.js'
import { pagePath } from '../../lib/hidden-page-links.js'
import { faultListText } from './finder-kinds.js'

export const DEMO_WIDTH = 1440

const FINDER_SYSTEM = `You look at screenshots of one page of a website a customer is about to receive. Each picture is a sheet of the page at desktop width (1440 px, shown at four fifths of its size) or phone width (390 px): consecutive viewport shots stacked into one picture, labelled with its viewport, its sheet number and the page rows it shows. Two consecutive sheets of a width share a few rows; a row shown twice is how the page was shot, not a fault. Name only faults a site owner would see, and only of these kinds:
{FAULTS}
Pictures labelled "template demo" show the template's own demo of a block this page shows; they are not the site. Use them only for "lost-emphasis" and "lost-design": a trait the demo block shows that the site's block lost. Never name a fault on a template demo picture. A fault a site owner would see that fits none of these kinds: name it with kind "other", so it is logged. Never judge taste, colours or fonts. Name a fault once, on the sheet where it shows. Answer with one JSON object: { "faults": [ { "page": "<path>", "viewport": "desktop" | "phone", "tile": <sheet number>, "kind": "<kind>", "slot": "<slot id when the page names it, else null>", "block": "<block id when the page names it, else null>", "seen": "<one sentence; quote the words you see in double quotes>" } ] }. No fault: { "faults": [] }.`

/** The finder's call for one page's tiles and the demo's block shots, answered as `{ answer }` or `{ problem }`. */
export async function askFinder(door, page, shots, demoShots = []) {
  const content = [
    { type: 'text', text: `Page ${page}.` },
    ...shots.flatMap((s) => [
      {
        type: 'text',
        text: `Page ${s.page}, ${s.viewport}, sheet ${s.index}, page rows ${s.y} to ${s.y + s.height} px`
      },
      { type: 'image_url', image_url: { url: s.image } }
    ]),
    ...demoShots.flatMap((d) => [
      {
        type: 'text',
        text: `Template demo, block ${d.block} (slots ${d.slots.join(', ') || 'none'}), ${d.viewport}`
      },
      { type: 'image_url', image_url: { url: d.image } }
    ])
  ]
  try {
    const { text, costUsd = null } = await door.ask({
      system: FINDER_SYSTEM.replace('{FAULTS}', faultListText()),
      content
    })
    const answer = jsonObjectIn(text)
    if (!answer || typeof answer !== 'object')
      return { problem: 'the answer holds no JSON object', costUsd, text }
    return { answer, costUsd, text }
  } catch (error) {
    return {
      problem: `the call failed: ${String(error?.message ?? error).slice(0, 200)}`,
      costUsd: null,
      text: null
    }
  }
}

/**
 * The template demo's shot of each block a site page shows, from the kit's images (the step 0 template profile packs one
 * per block and width). A block with no shot, or one that cannot be opened, is left out, never invented.
 * @param {{ kit: object | null, sitePages: { path: string, id: string | null }[],
 *   images: { open: (id: string) => Promise<any> } | null }} input
 * @returns {(page: string) => Promise<{ block: string, slots: string[], viewport: 'desktop', image: string }[]>}
 */
export function demoBlockShots({ kit, sitePages, images }) {
  const blocks = new Map((kit?.blocks ?? []).map((b) => [b?.id, b]))
  return async (page) => {
    if (!images) return []
    const site = sitePages.find((p) => pagePath(p.path) === pagePath(page))
    const kitPage = site
      ? (kit?.pages ?? []).find((p) =>
          site.id ? p?.id === site.id : pagePath(p?.path) === pagePath(site.path)
        )
      : null
    if (!kitPage) return []
    const shots = []
    for (const id of new Set(Object.values(kitPage.blocks ?? {}).flat())) {
      const block = blocks.get(id)
      const ref = imageAt(block?.images, DEMO_WIDTH)
      if (!ref) continue
      // eslint-disable-next-line no-await-in-loop -- a page shows a few blocks; one file at a time.
      const opened = await images.open(ref).catch(() => null)
      const picture = typeof opened === 'object' ? opened?.images?.[0] : null
      if (!picture?.base64) continue
      shots.push({
        block: id,
        slots: [...(block.slots ?? []), ...(block.demoOwned ?? [])]
          .map((s) => s?.id)
          .filter((s) => typeof s === 'string'),
        viewport: 'desktop',
        image: `data:${picture.mediaType ?? 'image/jpeg'};base64,${picture.base64}`
      })
    }
    return shots
  }
}
