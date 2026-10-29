/**
 * Editorial defaults of the slot role rule tables (ADR 0038). After the fact tables ran, every text and image slot still
 * without a role is bound to an editorial role from the signals the slot itself carries: its type, the tag at the end of
 * its xpath, the field name of its Joomla json path or WordPress block, and for a Joomla database column the column and
 * the kind of entity. A slot with no usable signal gets no role and stays on the list the packaging agent binds by hand.
 *
 * Editorial slots need no group (the contract check asks for one only on fact roles). A fact role is never replaced:
 * the caller only offers slots the fact tables left empty.
 */

/** Field name words that mark a technical value (an id, a class, a colour, a size), never page copy. */
const TECHNICAL_WORDS = new Set([
  'id',
  'ids',
  'class',
  'classes',
  'css',
  'color',
  'colour',
  'bg',
  'icon',
  'video',
  'key',
  'width',
  'height',
  'size',
  'style',
  'anchor',
  'rel',
  'align',
  'effect',
  'speed',
  'ratio',
  'alt',
  'offset',
  'delay'
])

const BUTTON_WORDS = new Set(['btn', 'button', 'cta', 'action'])
const MENU_WORDS = new Set(['nav', 'navigation', 'menuitem', 'breadcrumb'])
const HEADING_WORDS = new Set([
  'title',
  'heading',
  'headline',
  'subtitle',
  'subheading',
  'eyebrow',
  'kicker',
  'caption'
])
const PARAGRAPH_WORDS = new Set([
  'desc',
  'description',
  'text',
  'body',
  'intro',
  'introtext',
  'fulltext',
  'lead',
  'content',
  'summary',
  'subtext',
  'posttext',
  'statement',
  'support',
  'note',
  'copy',
  'paragraph',
  'excerpt',
  'message',
  'answer',
  'metadesc',
  'info'
])

/** Joomla database columns that hold article or category copy: whatever tag the text sits in, it is body copy. */
const BODY_COLUMNS = new Set(['introtext', 'fulltext', 'description', 'metadesc'])

/** A heading longer than this is a sentence: it reads as a paragraph. */
const HEADING_MAX_CHARACTERS = 160

const wordsOf = (name) =>
  String(name ?? '')
    .toLowerCase()
    .replace(/\d+$/, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)

/** The field name of a slot: the last name in a Joomla json path, or the last part of a WordPress block name or key. */
function fieldOf(slot) {
  if (Array.isArray(slot.jsonPath)) {
    const names = slot.jsonPath.filter((part) => typeof part === 'string')
    const last = names[names.length - 1] ?? ''
    const bracket = last.match(/\[([^\]]+)\]$/)
    return bracket ? bracket[1] : last
  }
  if (typeof slot.jsonPath === 'string') {
    const bracket = slot.jsonPath.match(/\[([^\]]+)\](?:\[\d+\])?$/)
    return bracket ? bracket[1] : ''
  }
  const block = slot.target && typeof slot.target === 'object' ? slot.target.block : null
  const source = typeof block === 'string' && block ? block : String(slot.key ?? '')
  const parts = source.split('.').filter((part) => part && !/^\d+$/.test(part))
  return parts.pop() ?? ''
}

/**
 * The element a text slot sits in, from the end of its xpath: `/div/h2/text()` is `h2`, and a whole-unit slot
 * (`/div/h2`, the element itself) is `h2` too.
 */
function tagOf(xpath) {
  const text = String(xpath ?? '')
  const m =
    text.match(/\/([a-z][a-z0-9]*)(?:\[\d+\])?\/text\(\)(?:\[\d+\])?$/i) ??
    text.match(/\/([a-z][a-z0-9]*)(?:\[\d+\])?$/i)
  return m ? m[1].toLowerCase() : ''
}

const inNavigation = (xpath, slot) =>
  /\/nav(\[|\/)/i.test(String(xpath ?? '')) ||
  String(slot.entity ?? '').startsWith('menuItem-') ||
  (Array.isArray(slot.jsonPath) && slot.jsonPath.some((p) => /^menuitem/i.test(String(p))))

const longerThanHeading = (slot) => Number(slot.maxCharacters) > HEADING_MAX_CHARACTERS

function editorialTextRole(slot) {
  const xpath = String(slot.xpath ?? '')
  const field = fieldOf(slot)
  const words = wordsOf(field)
  const tag = tagOf(xpath)
  const hasWord = (set) => words.some((w) => set.has(w))

  if (words.some((w) => TECHNICAL_WORDS.has(w))) return null
  if (inNavigation(xpath, slot) && (tag === 'a' || hasWord(HEADING_WORDS) || slot.column === 'title'))
    return 'editorial.menu_label'
  if (hasWord(MENU_WORDS)) return 'editorial.menu_label'
  if (
    hasWord(BUTTON_WORDS) ||
    (words.includes('link') && (words.includes('text') || words.includes('label')))
  )
    return 'editorial.button_label'
  if (tag === 'button' || tag === 'a') return 'editorial.button_label'
  if (/^h[1-6]$/.test(tag)) return longerThanHeading(slot) ? 'editorial.paragraph' : 'editorial.heading'
  if (tag === 'p' || tag === 'blockquote') return 'editorial.paragraph'
  if (hasWord(HEADING_WORDS)) return longerThanHeading(slot) ? 'editorial.paragraph' : 'editorial.heading'
  if (hasWord(PARAGRAPH_WORDS)) return 'editorial.paragraph'
  // A section title a template splits over several pieces (the "main-section" field of the JoomlArt modules).
  if (words.includes('main') && words.includes('section')) return 'editorial.heading'
  if (BODY_COLUMNS.has(slot.column)) return 'editorial.paragraph'
  // A Joomla database column on its own (no json path, no xpath): the column says what the text is.
  if (!slot.jsonPath && !xpath && slot.column === 'title') return 'editorial.heading'
  return null
}

/**
 * The editorial role a text or image slot defaults to, or `null` when the slot carries no usable signal.
 * @param {any} slot a content map slot
 * @param {{vocabulary3?: boolean}} [options]
 * @returns {string | null}
 */
export function editorialRoleOf(slot, { vocabulary3 = false } = {}) {
  if (!slot || typeof slot !== 'object') return null
  // Version 3 split the decorative image: a picture no signal marks as a design element may be replaced (the Slot fit
  // audit marks the icons, shapes and textures).
  if (slot.type === 'image') return vocabulary3 ? 'editorial.illustration' : 'editorial.decorative_image'
  if (slot.type === 'text') return editorialTextRole(slot)
  return null
}
