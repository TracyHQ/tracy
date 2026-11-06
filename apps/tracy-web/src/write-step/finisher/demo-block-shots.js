// The template demo's shot of each block a page shows (#423, spec #418), for the finder's "lost-design" kind: the step 0
// template profile packs one shot per block and width in the template kit, made once per template version. The finder
// sees each block of a page as the demo shows it beside the site's own tiles, so it can name a design trait the built
// block lost (accent emphasis, an accent button, a small label). Only the desktop shot is sent: these traits show there,
// and each picture costs the finder. A block with no shot, or a shot that cannot be opened, is left out, never invented.
import { imageAt } from '../../lib/template-kit/reader.js'
import { samePage } from './page-paths.js'

export const DEMO_WIDTH = 1440

/** The kit page a site page is: by the id the write report kept, else by the same path. */
const kitPageOf = (kit, { path, id }) =>
  (kit?.pages ?? []).find((p) => (id ? p?.id === id : samePage(p?.path, path))) ?? null

/**
 * @param {{ kit: object, sitePages: { path: string, id?: string }[],
 *   images: { open: (id: string) => Promise<any> } | null }} input `images` opens one kit image by id, as the kit image
 *   cache does (lib/template-kit-images.js); without it no demo shot is given
 * @returns {(page: string) => Promise<{ block: string, slots: string[], viewport: 'desktop', image: string }[]>}
 */
export function demoBlockShots({ kit, sitePages, images }) {
  const blocks = new Map((kit?.blocks ?? []).map((b) => [b?.id, b]))
  return async (page) => {
    if (!images) return []
    const site = sitePages.find((p) => samePage(p.path, page))
    const kitPage = site ? kitPageOf(kit, site) : null
    if (!kitPage) return []
    const ids = [...new Set(Object.values(kitPage.blocks ?? {}).flat())]
    const shots = []
    for (const id of ids) {
      const block = blocks.get(id)
      const ref = imageAt(block?.images, DEMO_WIDTH)
      if (!ref) continue
      let opened
      try {
        // eslint-disable-next-line no-await-in-loop -- a page shows a few blocks; one file at a time.
        opened = await images.open(ref)
      } catch {
        continue
      }
      const picture = typeof opened === 'object' ? opened?.images?.[0] : null
      if (!picture?.base64) continue
      shots.push({
        block: id,
        slots: (block.slots ?? []).map((s) => s?.id).filter((s) => typeof s === 'string'),
        viewport: 'desktop',
        image: `data:${picture.mediaType ?? 'image/jpeg'};base64,${picture.base64}`
      })
    }
    return shots
  }
}
