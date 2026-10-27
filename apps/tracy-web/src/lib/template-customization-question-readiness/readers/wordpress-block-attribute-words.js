/**
 * Words a visitor reads that WordPress keeps in a block's attributes, not in its markup, for LANG-2:
 * the "Read more" of a post excerpt (`moreText`), the words around post terms (`prefix`, `suffix`),
 * the label, placeholder and button of a search block, the labels of pagination and post
 * navigation links. A block comment is not markup, so the markup scan never sees them, and no
 * Tracy pass rewrites a block attribute (g59 10/10/2026: JA Essence WordPress `moreText:"Read more"`
 * on 9 pages of a Vietnamese site).
 *
 *   blockAttributeWords('<!-- wp:post-excerpt {"moreText":"Read more"} /-->')
 *   // [{ line: 1, block: 'core/post-excerpt', attr: 'moreText', text: 'Read more' }]
 *
 * Navigation and social links are left out: a menu label is content (ABOUT-2) and a network name
 * reads the same in every language (K6). A value the theme passes through a translation call of
 * its own (`__( 'Read more ...', … )` in a theme PHP file) has a translation path and is left out
 * by the caller (`translatedByTheme`).
 */
import { blocksOf } from '../site-pages/wordpress-blocks.js'

/** Attributes whose value is printed as words, per block (`*`: any block). */
const SHOWN = /** @type {Record<string, string[]>} */ ({
  '*': ['moreText', 'prefix', 'suffix', 'buttonText', 'placeholder', 'byline'],
  'core/read-more': ['content'],
  'core/search': ['label'],
  'core/query-pagination-next': ['label'],
  'core/query-pagination-previous': ['label'],
  'core/comments-pagination-next': ['label'],
  'core/comments-pagination-previous': ['label'],
  'core/post-navigation-link': ['label'],
  'core/post-comments-form': ['label'],
  'core/loginout': ['label']
})
const SKIPPED = /^core\/(navigation|navigation-link|navigation-submenu|social-link|social-links)$/

/** A value a visitor reads as words: a Latin word of two letters or more, no code. */
const isWords = (/** @type {string} */ v) =>
  /[A-Za-z]{2,}/.test(v) && !/[{}<>$=]|^https?:|^#|^[a-z0-9_.-]+$/.test(v.trim())

/**
 * @param {string} text block markup (a template, a part, a pattern, a post's content)
 * @returns {{ line: number, block: string, attr: string, text: string }[]}
 */
export function blockAttributeWords(text) {
  const source = String(text ?? '')
  const out = []
  for (const t of blocksOf(source)) {
    if (t.close || SKIPPED.test(t.name)) continue
    for (const attr of [...SHOWN['*'], ...(SHOWN[t.name] ?? [])]) {
      const value = t.attrs?.[attr]
      if (typeof value !== 'string' || !isWords(value)) continue
      out.push({ line: source.slice(0, t.at).split('\n').length, block: t.name, attr, text: value.trim() })
    }
  }
  return out
}

/**
 * True when a theme PHP file translates exactly this value (`__( 'Read more ...', 'domain' )`), so
 * a filter of the theme can print it in the site's language.
 * @param {string} value
 * @param {string} php every PHP file of the theme, joined
 */
export function translatedByTheme(value, php) {
  const quoted = value.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`\\b(?:__|_e|_x|esc_html__|esc_attr__|esc_html_e)\\(\\s*(['"])${quoted}\\1`).test(php)
}
