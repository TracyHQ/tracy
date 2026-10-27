/**
 * What `GET /api/templates` answers, as rows of the Design inspiration list.
 *
 * Tracy holds the finished sites on the releases it has read off `ja-products` and serves them at
 * one unadmitted door. TWO surfaces read that door and draw the same cards from it:
 *
 *   - the tab inside dsh, through `host/templates.mjs#templatesFromTracy`;
 *   - the public page at `/design-inspiration` (`packages/web/tracy-design-page`), which has no
 *     dsh behind it at all.
 *
 * So the mapping lives here — plain `.mjs`, no `node:` imports — rather than beside the fetch: the
 * public page cannot import a module that reads the filesystem, and one Publish must not need two
 * mappings to reach two surfaces (tasks/todo-design-inspiration-card-ops.md, "One Publish, two
 * surfaces").
 *
 * 🔒 THE ROW SHAPE IS THE LIST'S, NOT THE DOOR'S. The rows land in the same list the 152 design
 * systems do, and both the list and `PreviewDialog` read a template by branching on `template`. A
 * row that carried the door's own shape — the picture and the demo loose at the top level — drew a
 * card with no picture and a preview with no frame, and nothing anywhere said so. Since 16/09 this
 * is the ONLY producer of those rows: the image's copy of the catalogue no longer builds any.
 */

/** A file name a template may serve: one path segment, a picture. */
export const PICTURE = /^[a-z0-9][a-z0-9._-]*\.(?:png|jpg|jpeg|webp)$/

/** An address (a scheme, or a root-absolute path) — already answerable by the browser as it is. */
const ADDRESS = /^(?:[a-z]+:|\/)/i

/**
 * A picture as `GET /api/templates` may name one: an absolute `http(s)` address, or null.
 *
 * 🔒 A BARE FILE NAME IS NO PICTURE (#523). tracy-web names every picture it holds by absolute
 * address and, since #523, answers null for one it does not hold. An older server answered the bare
 * name instead, as a "fallback" for this plugin's `template/<id>/<file>` door — but that door reads
 * the image's `quickstarts.json`, which the image has not carried since 16/09, so it answers 404 for
 * every name and the card drew a broken image (JA Restaurant, 27/09). So a bare name, a relative or
 * rooted path, and any other scheme are all absent here: the card draws its empty block, never a
 * broken `<img>`, and no door is pointed at.
 * @param {unknown} value
 * @returns {string | null}
 */
export function servedPicture(value) {
  // `new URL` alone is not enough: it accepts `https:shot.png` and `https:/shot.png`, which a
  // browser on an https page resolves as a same-origin relative path. Written `//` and a host, or absent.
  if (typeof value !== 'string' || !/^https?:\/\/[^/\\?#]/i.test(value)) return null
  try {
    const url = new URL(value)
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.hostname !== '' ? value : null
  } catch {
    return null
  }
}

/**
 * A picture a component may draw, or null: what `servedPicture` accepts, plus a same-origin rooted
 * path (`/src/…png`) — the design bench's fixture pictures, which Vite serves from the page's own
 * origin. A row read off the door never carries one (`templateRows` keeps only `servedPicture`s).
 * @param {unknown} value
 * @returns {string | null}
 */
export function pictureAddress(value) {
  const served = servedPicture(value)
  if (served !== null) return served
  return typeof value === 'string' && /^\/(?![/\\])/.test(value) && !/(?:^|\/)\.\.?(?:\/|$)/.test(value)
    ? value
    : null
}

/**
 * The layout a card thumbnail frames: the one keyed `home`, else the first; undefined when there is
 * none.
 * @template {{ key?: unknown }} L
 * @param {L[] | undefined} layouts
 * @returns {L | undefined}
 */
export function homeLayout(layouts) {
  if (!Array.isArray(layouts)) return undefined
  return layouts.find((l) => l?.key === 'home') ?? layouts[0]
}

/**
 * The poster a template card draws under its live demo, or null.
 *
 * 🔒 THE POSTER IS THE SAME PAGE AT THE SAME WIDTH AS THE FRAME THAT FADES IN OVER IT (#523). The
 * card frames the demo at 1440×900 (`DemoThumb`), while `card.image` is the 390-px phone shot on
 * every card published so far — so for the 1–2 s a demo takes to load, a card showed the phone
 * layout (JA Vega: a huge "Contact Us" button and a hamburger) and then jumped to the desktop page.
 * A card with a live demo therefore shows the HOME layout's desktop shot, falling back to
 * `card.image` when there is none; a card with no demo keeps `card.image`, the picture it was
 * published with. Only the layout keyed `home` counts: another page's desktop shot under the front
 * page's frame would be the same jump.
 * @param {{ image?: unknown, demo?: { url?: unknown } | null, layouts?: { key?: unknown, shots?: { desktop?: unknown } }[] } | null | undefined} template
 * @returns {string | null}
 */
export function cardPoster(template) {
  const image = pictureAddress(template?.image)
  const demo = template?.demo?.url
  if (typeof demo !== 'string' || demo === '') return image
  const home = Array.isArray(template?.layouts) ? template.layouts.find((l) => l?.key === 'home') : undefined
  return pictureAddress(home?.shots?.desktop) ?? image
}

/**
 * The rows one `GET /api/templates` body declares, or null when the body is not that shape.
 *
 * 🔒 NULL IS NOT AN EMPTY LIST. An empty array is an answer — this deployment has no finished
 * sites — while null means the answer could not be read, and only null sends a lane back to the
 * catalogue in its image.
 * @param {unknown} body the parsed body: `{ templates: [{ id, label, card, platforms }] }`
 * @returns {any[] | null}
 */
/**
 * The address the preview frame loads for one layout of one template.
 *
 * 🔒 JOINED, NEVER CONCATENATED, and that is the whole of this function. `demo.url` is built by
 * `demoAddress` and always ENDS in a slash; every layout path BEGINS with one. Glued together they
 * make `http://host:51710//index.php/our-services`, and a double slash is not cosmetic: measured
 * 17/09 against the demo itself, `/index.php/our-services` answers 200 and `//index.php/our-services`
 * answers 404. For months the preview asked for the second one and showed a customer the demo's own
 * "not found" page — the earlier `//our-services` read as Apache's, this one as Joomla's, which is
 * why fixing the path first only changed WHICH 404 appeared.
 *
 * `theme` goes on through `searchParams`, so a layout that already carries a query — a Joomla with
 * SEF off addresses pages as `/index.php?option=com_content&id=7` — gets one more parameter rather
 * than a second `?`.
 *
 * @param {string} demoUrl - the demo's own base, trailing slash and all.
 * @param {{ path?: string, address?: string } | undefined} layout - where the page answers, else what
 *   names it; none means the front page.
 * @param {string} theme - `dark` or `light`.
 * @returns {string} the URL to load, or '' when there is no demo to load it from.
 */
export function previewSrc(demoUrl, layout, theme) {
  if (typeof demoUrl !== 'string' || demoUrl === '') return ''
  const named = layout?.address ?? layout?.path ?? '/'
  // A truncated path is a label, not an address (`…` is written by the card editor's own eliding).
  const where = typeof named === 'string' && named !== '' && !named.includes('…') ? named : '/'
  try {
    const url = new URL(where, demoUrl)
    url.searchParams.set('theme', theme)
    return url.href
  } catch {
    return demoUrl
  }
}

/** @param {unknown} body */
export function templateRows(body) {
  const served = /** @type {any} */ (body)?.templates
  if (!Array.isArray(served)) return null
  const rows = []
  for (const t of served) {
    if (!t || typeof t !== 'object' || typeof t.id !== 'string' || t.id === '') continue
    const card = t.card && typeof t.card === 'object' ? t.card : {}
    const platforms = (Array.isArray(t.platforms) ? t.platforms : []).filter(
      (/** @type {any} */ p) => p && typeof p.platform === 'string'
    )
    const pic = servedPicture
    const demo = card.demo && typeof card.demo === 'object' ? card.demo : null
    rows.push({
      id: t.id,
      name: typeof t.label === 'string' && t.label !== '' ? t.label : t.id,
      category: typeof card.category === 'string' ? card.category : 'Uncategorised',
      // The filter traits a template card wears until an administrator sets them (W3 of the card
      // work). Defaults, and they are read as such: a filter on them is filtering on a guess.
      nav: 'top-left',
      hero: 'split',
      // Whether the demo itself switches to dark on ?theme=dark: the card's own flag, measured by
      // /ops (Draft from demo) or set there by hand. A card that has never said stays true, as
      // every card read before the flag was honoured (30/09: no Light/Dark switch on a
      // template whose theme has no dark mode).
      dark: typeof card.dark === 'boolean' ? card.dark : true,
      provider: typeof card.provider === 'string' ? card.provider : 'JoomlArt',
      // The design system the card wears, joined by tracy-web from the sealing profile — the
      // only place it is named (29/09). Null when the profile names none; never a guess.
      design:
        t.design &&
        typeof t.design === 'object' &&
        typeof t.design.id === 'string' &&
        typeof t.design.source === 'string'
          ? { id: t.design.id, source: t.design.source }
          : null,
      platforms: platforms.map((/** @type {any} */ p) => p.platform),
      template: {
        quickstarts: Object.fromEntries(
          platforms.map((/** @type {any} */ p) => [p.platform, String(p.tag ?? '')])
        ),
        version: String(platforms.find((/** @type {any} */ p) => p.version)?.version ?? ''),
        image: pic(card.image),
        /** One sentence about the site, shown in the preview. */
        blurb: typeof card.blurb === 'string' ? card.blurb : null,
        demo: {
          url: String(demo?.url ?? ''),
          version: String(demo?.version ?? ''),
          // The `demo-frame` door, only as the address tracy-web wrote: a card fetches it as one.
          ...(typeof demo?.probe === 'string' && ADDRESS.test(demo.probe) ? { probe: demo.probe } : {})
        },
        // The side the demo opens on when no mode is asked (a dark-first template such as JA Boxing).
        // Read only when the card has both sides; a one-sided card is always its own light.
        defaultTheme:
          (typeof card.dark === 'boolean' ? card.dark : true) && card.defaultTheme === 'dark'
            ? 'dark'
            : 'light',
        languages: Array.isArray(card.languages) ? card.languages.map(String) : [],
        layouts: (Array.isArray(card.layouts) ? card.layouts : []).map((/** @type {any} */ l) => ({
          key: String(l?.key ?? ''),
          label: String(l?.label ?? l?.key ?? ''),
          path: String(l?.path ?? '/'),
          // Where the page answers, when the card says that is not its path. Carried through
          // rather than recomputed: this side has no way to know a demo's URL rules, and guessing
          // is how the preview came to show a customer an Apache 404 (17/09).
          ...(typeof l?.address === 'string' && l.address.startsWith('/') ? { address: l.address } : {}),
          ...(typeof l?.count === 'number' ? { count: l.count } : {}),
          ...(l?.shots && typeof l.shots === 'object'
            ? {
                shots: {
                  desktop: pic(l.shots.desktop),
                  ...(l.shots.mobile ? { mobile: pic(l.shots.mobile) } : {})
                }
              }
            : {})
        }))
      }
    })
  }
  return rows
}

/** The width a grid card asks the shots door for: 2× a 360-px card. One of `THUMB_WIDTHS` in tracy-web. */
export const CARD_THUMB_WIDTH = 720

/**
 * `address` as the card-sized copy the shots door serves (`?w=`, `apps/tracy-web/src/lib/shot-thumb.js`).
 *
 * 🔒 A STORED SHOT IS THE WHOLE PAGE AT 2× (2880×7200, 4–7 MB); a card is 279×160. Measured 29/09 on
 * cowork.tracy.site: 28 posters were 99 MB and 2.7 s of image decoding on the main thread. Only an
 * address of Tracy's own shots door gets the parameter — any other picture is passed through as is,
 * because no other server promises to understand it.
 * @param {string | null} address
 * @returns {string | null}
 */
export function cardThumb(address) {
  if (address === null) return null
  let url
  try {
    url = new URL(address, 'http://relative.invalid')
  } catch {
    return address
  }
  if (!/^\/api\/templates\/[^/]+\/shots\/[^/]+$/.test(url.pathname)) return address
  url.searchParams.set('w', String(CARD_THUMB_WIDTH))
  return url.origin === 'http://relative.invalid' ? `${url.pathname}${url.search}` : url.href
}
