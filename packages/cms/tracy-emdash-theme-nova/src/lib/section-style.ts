/**
 * The look of a page section's wrapper: its top and bottom space and its background band.
 *
 * Template design, not content: in the Joomla source these are module parameters (`top-space`, `bottom-space`, `bg-color` of
 * `html/layouts/chromes/t4section.php`), read from the rendered pages of the source; the CMS entries do not carry them. The keys are
 * section slugs (`src/lib/page-layout.json` `sections`). The spacing comes from `page-layout.json` (`info.spacing`) and is passed in;
 * only the background is tabled here.
 *
 * `sectionWrap(slug, info)` returns the classes of the wrapper every section prints around its content:
 *
 *   nv-mod nv-top-large nv-bottom-medium nv-bg-color nv-bg-purple
 *
 * `nv-bg-color` = a full colour band (white words on it), `nv-bg-nomal` = a plain or pale band (the words keep their own colours).
 * The classes are drawn in `src/styles/blocks/features.css` (section of the same name), which every block can use.
 */

export type Bg = 'normal' | 'light' | 'purple' | 'purple-light' | 'green' | 'green-light' | 'yellow' | 'red' | 'cyan'

/** Background band of each section slug, as the source module renders it. */
export const SECTION_BG: Record<string, Bg> = {
  'home-intro-1': 'purple',
  'home-chips-1': 'purple',
  'home-chips-2': 'purple',
  'products-cards': 'normal',
  'home-cta': 'purple-light',
  clients: 'normal',
  'home-intro-2': 'normal',
  team: 'yellow',
  'home-intro-3': 'normal',
  'home-stats': 'green-light',
  pricing: 'normal',
  faq: 'normal',
  'cta-contact': 'purple',
  'about-intro': 'normal',
  'about-video': 'normal',
  'about-intro-2': 'normal',
  'about-expertise': 'light',
  'about-stats': 'normal',
  'services-intro': 'light',
  'services-cards': 'normal',
  'career-positions': 'normal',
  social: 'normal'
}

/**
 * Sections whose module prints a main title above the content (the module's `main-section` of the source). The words come from the
 * entry (`main_title`, with the coloured words; else `title`). Not listed: the counters (`home-stats`, `about-stats`), whose entry `title` is
 * an admin label and whose heading is only in `main_title`.
 */
export const SECTION_HAS_MAIN_TITLE = new Set([
  'products-cards',
  'services-cards',
  'about-expertise',
  'career-positions'
])

/** Colours that make the band a "colour" module (white words); every other band keeps the page's words. */
const COLOUR_BANDS = new Set<Bg>(['purple', 'green', 'yellow', 'red', 'cyan'])

export interface SectionInfoLike {
  spacing?: { top?: string | null; bottom?: string | null }
}

export interface SectionStyle {
  top: string
  bottom: string
  bg: Bg
  /** `true` for a full colour band. */
  colour: boolean
  /** The class string of the wrapper. */
  wrap: string
}

export function sectionStyle(slug: string, info?: SectionInfoLike | null): SectionStyle {
  const top = info?.spacing?.top || 'blank'
  const bottom = info?.spacing?.bottom || 'blank'
  const bg = SECTION_BG[slug] ?? 'normal'
  const colour = COLOUR_BANDS.has(bg)
  return {
    top,
    bottom,
    bg,
    colour,
    wrap: `nv-mod nv-top-${top} nv-bottom-${bottom} ${colour ? 'nv-bg-color' : 'nv-bg-nomal'} nv-bg-${bg}`
  }
}

/** Shorthand: the wrapper class string of a section. */
export const sectionWrap = (slug: string, info?: SectionInfoLike | null): string => sectionStyle(slug, info).wrap
