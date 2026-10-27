/**
 * The three LANG-2 signals added after the g59 test builds (10/10/2026), each a place where a word
 * reaches the visitor without any translation path:
 * - stylesheet words: `content:"By"` in a `::before` of the theme's CSS (WordPress theme, EmDash
 *   `src/**`), `readers/visitor-words-in-css.js`;
 * - block attribute words: `moreText`, `prefix`, `buttonText`… of the theme's templates, parts and
 *   used patterns and of the demo database's published content (WordPress),
 *   `readers/wordpress-block-attribute-words.js`; a value the theme translates itself, or a pair the
 *   Claude Cowork plugin translates (`readers/plugin-block-words.js`), is left out;
 * - the language switcher (EmDash): an option named from the STORED locale (`wordsOf(l).name`) says
 *   "English" on a site written in Vietnamese into the `en` locale; it must be named from the locale
 *   shown (`wordsOf(uiLocale(l))`, `displayLocaleOf`). LANG-4 itself moved to Tracy (D2), so the
 *   switcher's words are counted here.
 * Called by `lang-2-one-language-everywhere.js` inside its parts.
 */

import { pluginTranslates } from '../readers/plugin-block-words.js'
import { listed, plural } from '../readers/rule-findings.js'
import { templateSourceFiles } from '../readers/template-source-files.js'
import { cssContentWords } from '../readers/visitor-words-in-css.js'
import { blockAttributeWords, translatedByTheme } from '../readers/wordpress-block-attribute-words.js'
import { wordpressDemo } from '../readers/wordpress-demo.js'

const DB_TYPES = new Set(['page', 'post', 'wp_template', 'wp_template_part', 'wp_block'])
const SWITCHER_NAME = /\bname\s*:\s*wordsOf\(\s*([^()]*?)\s*\)\s*\.name\b/g

/** Group `{ text, where }` hits as `'By' ×3 (a.css:4, b.css:9)`. */
function grouped(/** @type {{ text: string, where: string }[]} */ hits) {
  const by = new Map()
  for (const h of hits) by.set(h.text, [...(by.get(h.text) ?? []), h.where])
  return [...by].map(
    ([t, w]) => `'${t.slice(0, 40)}'${w.length > 1 ? ` ×${w.length}` : ''} (${listed(w, 2)})`
  )
}

/** @param {import('../index.js').RuleContext} context @param {ReturnType<typeof import('../readers/rule-findings.js').findings>} f */
export async function stylesheetWords(context, f) {
  const { platform } = context.release
  if (platform !== 'wordpress' && platform !== 'emdash') return
  const files = (await templateSourceFiles(context)) ?? new Map()
  const hits = []
  for (const [file, text] of files) {
    if (!file.endsWith('.css') || (platform === 'emdash' && !file.startsWith('src/'))) continue
    for (const w of cssContentWords(text)) hits.push({ text: w.text, where: `${file}:${w.line}` })
  }
  if (hits.length)
    f.problem(
      `stylesheet words: ${plural(hits.length, 'word')} painted by CSS content:, which no translation reaches: ${listed(grouped(hits), 10)}`
    )
}

/**
 * @param {import('../index.js').RuleContext} context
 * @param {ReturnType<typeof import('../readers/rule-findings.js').findings>} f
 * @param {[string, string][]} shown the theme files a page is drawn from (templates, parts, used patterns)
 */
export async function blockAttributes(context, f, shown) {
  if (context.release.platform !== 'wordpress') return
  const themePhp = [...((await templateSourceFiles(context)) ?? new Map())]
    .filter(([n]) => n.endsWith('.php'))
    .map(([, t]) => t)
    .join('\n')
  const hits = []
  let byPlugin = 0
  const add = (/** @type {string} */ where, /** @type {string} */ text) => {
    for (const w of blockAttributeWords(text))
      if (pluginTranslates(w.block, w.attr)) byPlugin += 1
      else if (!translatedByTheme(w.text, themePhp))
        hits.push({ text: `${w.attr}: ${w.text}`, where: `${where}:${w.line}` })
  }
  for (const [file, text] of shown)
    if (!file.endsWith('.php') || file.startsWith('patterns/')) add(file, text)
  const wp = await wordpressDemo(context)
  for (const p of wp.posts)
    if (p.post_status === 'publish' && DB_TYPES.has(p.post_type) && wp.isSource(p))
      add(
        p.post_type === 'page' ? `/${wp.pathOf(p)}` : `${p.post_type} ${p.post_name}`,
        String(p.post_content ?? '')
      )
  if (byPlugin)
    f.note(
      `${plural(byPlugin, 'block attribute word')} on the pairs the Claude Cowork plugin translates (BlockWords::PAIRS, after 0.18.7) are not counted.`
    )
  if (hits.length)
    f.problem(
      `block attribute words: ${plural(hits.length, 'word')} in block attributes (moreText, prefix, label…), which neither the theme nor the plugin translates: ${listed(grouped(hits), 10)}`
    )
}

/** @param {import('../index.js').RuleContext} context @param {ReturnType<typeof import('../readers/rule-findings.js').findings>} f */
export async function switcherNames(context, f) {
  if (context.release.platform !== 'emdash') return
  const hits = []
  for (const [file, text] of (await templateSourceFiles(context)) ?? new Map()) {
    if (!/^src\/.*\.(astro|tsx?)$/.test(file)) continue
    for (const m of text.matchAll(SWITCHER_NAME))
      if (!/uiLocale|displayLocale/.test(m[1]))
        hits.push(`${file}:${text.slice(0, m.index).split('\n').length} (wordsOf(${m[1]}).name)`)
  }
  if (hits.length)
    f.problem(
      `language switcher: options named from the stored locale, so a site written into "en" in another language offers "English": ${listed(hits)}`
    )
}
