/**
 * The WordPress half of the design system preview (`design-system-preview-page.js`): a served page made to
 * wear one style variation the way WordPress itself would serve it once the variation is applied.
 *
 * WordPress wears a system as a theme.json style variation written into the user's global styles
 * (`tracy_apply_inspiration()`). It never sends that file: it turns the merged theme + user data into
 * the one `<style id="global-styles-inline-css">` block of every page (WordPress 7.1,
 * `wp_enqueue_global_styles()`): the preset and custom variables, the element styles, the preset
 * classes, then the root `styles.css`, which the variation's REPLACES. Its font faces are printed in
 * `<style class="wp-fonts-local">` (`wp_print_font_faces()`). Nothing else of the home page moves: an
 * apply keeps the site's menu and hero (`tracy_nav` / `tracy_hero`).
 *
 * So the preview does in that block what the merge does: the theme's own `styles.css` (read from the
 * theme's `theme.json`, which WordPress prints verbatim) or the variation a site already wears (its
 * `styles.css` opens with `/* tracy-ds-slot:`) is taken out, and the variation's variables, element
 * styles and `styles.css` are written at the end of the same block, in WordPress's own selectors, so
 * every later theme stylesheet still comes after them as it does on the site. Measured 12/10/2026 on
 * JA Essence WP 1.0.17 (WordPress 7.1.3) against WordPress's own output for the same variation
 * (`wp_get_global_stylesheet()` with the variation as user data, read-only): see the journal entry.
 *
 * Known difference: on a site that already wears a variation, a field the new system leaves empty
 * keeps the old system's value here, where the site would fall back to the theme's.
 */

/** WordPress 7.1's selectors for the root element styles a variation sets (`WP_Theme_JSON::ELEMENTS`). */
const ELEMENT_SELECTORS = {
  link: 'a:where(:not(.wp-element-button))',
  heading: 'h1, h2, h3, h4, h5, h6',
  button: ':root :where(.wp-element-button, .wp-block-button__link)'
}
/** The pseudo-class selectors WordPress writes for an element, wrapped as it wraps them. */
const PSEUDO_SELECTORS = {
  link: { ':hover': ':root :where(a:where(:not(.wp-element-button)):hover)' }
}
/** A value that can stand in a declaration of the block without ending it or the element. */
const SAFE = /^[^{};<>\\]*$/
const safe = (/** @type {unknown} */ v) =>
  (typeof v === 'string' || typeof v === 'number') && SAFE.test(String(v)) && !/\/\*/.test(String(v))
const SLUG = /^[a-z0-9-]+$/

/** `sectionY` → `section-y`, as WordPress names a custom variable (`_wp_to_kebab_case`). */
const kebab = (/** @type {string} */ s) =>
  s
    .replace(/([a-z])([0-9])/g, '$1-$2')
    .replace(/([0-9])([a-zA-Z])/g, '$1-$2')
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .toLowerCase()

/**
 * `--wp--custom--<path>` for every leaf of `settings.custom`, as WordPress flattens it.
 * @param {any} node
 * @param {string} prefix
 * @param {string[]} out
 */
function customVars(node, prefix, out) {
  for (const [k, v] of Object.entries(node ?? {})) {
    const name = `${prefix}--${kebab(k)}`
    if (v && typeof v === 'object' && !Array.isArray(v)) customVars(v, name, out)
    else if (safe(v)) out.push(`${name}: ${v};`)
  }
  return out
}

/**
 * The declarations WordPress writes for one style node (`color.text` → `color`, `border.radius` →
 * `border-radius`, `spacing.padding.top` → `padding-top`, `typography.fontWeight` → `font-weight`).
 * @param {any} node
 * @returns {string}
 */
function declarationsOf(node) {
  const out = []
  const put = (prop, v) => {
    if (safe(v)) out.push(`${prop}: ${v};`)
  }
  put('background-color', node?.color?.background)
  put('border-radius', node?.border?.radius)
  put('color', node?.color?.text)
  put('font-family', node?.typography?.fontFamily)
  put('font-size', node?.typography?.fontSize)
  put('font-weight', node?.typography?.fontWeight)
  for (const side of ['top', 'right', 'bottom', 'left'])
    put(`padding-${side}`, node?.spacing?.padding?.[side])
  return out.join('')
}

/**
 * The rules WordPress adds to the global styles block for one variation: its preset and custom
 * variables, its layout sizes, its root typography and element styles, then its `styles.css`. PURE.
 * @param {any} variation the theme.json variation the apply writes (`emitFor`'s `variation`)
 * @returns {string | null} null when the variation cannot be laid in a style element safely
 */
export function wordpressGlobalCssOf(variation) {
  const s = variation?.settings ?? {}
  const vars = []
  for (const c of s.color?.palette ?? [])
    if (SLUG.test(c?.slug ?? '') && safe(c.color)) vars.push(`--wp--preset--color--${c.slug}: ${c.color};`)
  for (const f of s.typography?.fontFamilies ?? [])
    if (SLUG.test(f?.slug ?? '') && safe(f.fontFamily))
      vars.push(`--wp--preset--font-family--${f.slug}: ${f.fontFamily};`)
  for (const f of s.typography?.fontSizes ?? [])
    if (SLUG.test(f?.slug ?? '') && safe(f.size)) vars.push(`--wp--preset--font-size--${f.slug}: ${f.size};`)
  for (const p of s.spacing?.spacingSizes ?? [])
    if (SLUG.test(p?.slug ?? '') && safe(p.size)) vars.push(`--wp--preset--spacing--${p.slug}: ${p.size};`)
  customVars(s.custom, '--wp--custom', vars)
  const rules = [`:root{${vars.join('')}}`]
  const layout = []
  if (safe(s.layout?.contentSize)) layout.push(`--wp--style--global--content-size: ${s.layout.contentSize};`)
  if (safe(s.layout?.wideSize)) layout.push(`--wp--style--global--wide-size: ${s.layout.wideSize};`)
  if (layout.length) rules.push(`:root { ${layout.join('')} }`)

  const st = variation?.styles ?? {}
  const body = declarationsOf(st)
  if (body) rules.push(`body{${body}}`)
  for (const [el, selector] of Object.entries(ELEMENT_SELECTORS)) {
    const node = st.elements?.[el]
    if (!node) continue
    const own = declarationsOf(node)
    if (own) rules.push(`${selector}{${own}}`)
    for (const [pseudo, at] of Object.entries(PSEUDO_SELECTORS[el] ?? {})) {
      const decl = declarationsOf(node[pseudo])
      if (decl) rules.push(`${at}{${decl}}`)
    }
  }
  const css = typeof st.css === 'string' ? st.css : ''
  const all = `${rules.join('')}${css}`
  return /<\/style/i.test(all) ? null : all
}

/**
 * The `@font-face` rules WordPress prints for the variation's Google faces (`wp_print_font_faces()`),
 * as one `<style class="wp-fonts-local">`; '' when the variation names none. PURE.
 * @param {any} variation
 * @returns {string}
 */
export function wordpressFontFacesOf(variation) {
  const faces = []
  for (const fam of variation?.settings?.typography?.fontFamilies ?? [])
    for (const f of fam?.fontFace ?? []) {
      const src = (f?.src ?? []).filter((u) => /^https:\/\/fonts\.gstatic\.com\/[A-Za-z0-9/._-]+$/.test(u))
      if (!src.length || !safe(f.fontFamily) || /"/.test(f.fontFamily)) continue
      const decl = [`font-family:"${f.fontFamily}"`]
      if (safe(f.fontStyle)) decl.push(`font-style:${f.fontStyle}`)
      if (safe(f.fontWeight)) decl.push(`font-weight:${f.fontWeight}`)
      if (safe(f.fontDisplay)) decl.push(`font-display:${f.fontDisplay}`)
      decl.push(`src:${src.map((u) => `url('${u}') format('woff2')`).join(', ')}`)
      if (safe(f.unicodeRange)) decl.push(`unicode-range:${f.unicodeRange}`)
      faces.push(`@font-face{${decl.join(';')};}`)
    }
  return faces.length ? `<style class="wp-fonts-local">\n${faces.join('\n')}\n</style>` : ''
}

/**
 * The root `styles.css` of a theme's `theme.json` (what WordPress prints at the end of the global
 * styles block while no variation replaces it); '' when it has none, null when the file is no JSON.
 * @param {string} text
 * @returns {string | null}
 */
export function themeCssOf(text) {
  try {
    const css = JSON.parse(text)?.styles?.css
    return typeof css === 'string' ? css : ''
  } catch {
    return null
  }
}

/**
 * The page with WordPress's global styles block as the variation makes it: the theme's `styles.css`
 * (or a worn variation's) out, `globalCss` in at the block's end. PURE.
 * @param {string} html
 * @param {{ globalCss: string, themeCss: string }} p
 * @returns {string | null} null when the page has no global styles block (not a block theme's page)
 */
export function wearGlobalStyles(html, { globalCss, themeCss }) {
  const m = /(<style\b[^>]*\bid=["']global-styles-inline-css["'][^>]*>)([\s\S]*?)(<\/style>)/i.exec(html)
  if (!m) return null
  let block = m[2]
  const worn = block.indexOf('/* tracy-ds-slot:')
  if (worn >= 0) block = block.slice(0, worn)
  else if (themeCss && block.includes(themeCss)) {
    const at = block.lastIndexOf(themeCss)
    block = block.slice(0, at) + block.slice(at + themeCss.length)
  }
  const inner = `${block.replace(/\s*\/\*# sourceURL=[^*]*\*\/\s*$/, '')}${globalCss}\n`
  return html.slice(0, m.index) + m[1] + inner + m[3] + html.slice(m.index + m[0].length)
}

/**
 * The theme folders a page loads files from, in the order it names them (`/wp-content/themes/<x>/`).
 * @param {string} html
 * @returns {string[]}
 */
export function themeFoldersOf(html) {
  const seen = new Set()
  for (const m of html.matchAll(/\/wp-content\/themes\/([a-z0-9][a-z0-9._-]{0,99})\//g)) seen.add(m[1])
  return [...seen]
}
