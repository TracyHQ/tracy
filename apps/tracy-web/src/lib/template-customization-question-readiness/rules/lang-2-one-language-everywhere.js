/**
 * LANG-2: once the customer chose a language, every word on the site is in it (spec
 * `tasks/spec-template-customization-question-readiness.md`, LANG-2).
 *
 * The template's side is that its fixed interface words (form labels, buttons, block headings,
 * pagination, the error page) go through a translatable path: Joomla `.ini` keys, WordPress
 * `__()` with the theme's text domain, EmDash data fields that `seed/personalize.json` `labels`
 * reaches. Words written straight into a template file fail:
 * - Joomla: `html/**` and `acm/**` layouts of the template, `offline.php`, and T4's HTML blocks
 *   (`html/layouts/t4/block/*.html`) (`readers/hard-coded-words.js`);
 * - WordPress: theme `templates/*.html` and `parts/*.html` the database does not override, patterns
 *   a template or page uses, and PHP literals printed without `__()` (`inc/*.php`, `functions.php`);
 * - EmDash: `src/**` `.astro` files, and seed collections with word fields (`*_label`, `*_title`,
 *   `*_text`, `*_button`, …, the `WORDS_KEY` of `tools/personalize.mjs`) that `labels` does not list.
 * Only words a visitor reads count (element text, `placeholder`, `title`, button captions, the
 * `aria-label` of a control); code in `<script>` or PHP/JavaScript expressions, `alt` and landmark
 * labels do not (why: `readers/hard-coded-words.js`). Kit sample pages (style guide, form, email,
 * slide, newsletter) are NOT skipped: their content stays as the template has it, but it must be in
 * the site's language (K3 09/10/2026). Translating those keys into the chosen language is
 * Tracy's and the plugin's; the result on a built site is only known there (noted).
 * Since the g59 builds (10/10/2026) three more places count (`lang-2-styles-attributes-switcher.js`):
 * words painted by CSS `content:`, visitor words in WordPress block attributes, and an EmDash
 * language switcher that names its options from the stored locale. Since the g60 builds (11/10/2026) the fonts too
 * (`lang-2-font-glyphs.js`): a font the template loads that cannot draw a language the customer may choose.
 */
import { findings, listed, plural } from '../readers/rule-findings.js'
import { hardCodedWords } from '../readers/hard-coded-words.js'
import { templateSourceFiles } from '../readers/template-source-tree.js'
import { wordpressDemo } from '../readers/wordpress-demo.js'
import { fontGlyphs } from './lang-2-font-glyphs.js'
import { blockAttributes, stylesheetWords, switcherNames } from './lang-2-styles-attributes-switcher.js'

const WORDS_KEY = /_(?:label|title|text|button|placeholder|heading|caption)$/i

/** Which files of the template a visitor's page is drawn from, per CMS. */
async function shownFiles(/** @type {import('../index.js').RuleContext} */ context) {
  const files = await templateSourceFiles(context)
  const { platform } = context.release
  // Joomla: the layout overrides, the ACM layouts, the offline page, and T4's HTML blocks
  // (`html/layouts/t4/block/*.html`: a header or drawer every page draws).
  if (platform === 'joomla')
    return [...files].filter(([n]) =>
      /^(html\/.*|acm\/.*\/tmpl\/[^/]+)\.php$|^offline\.php$|^html\/layouts\/t4\/block\/[^/]+\.html$/.test(n)
    )
  if (platform === 'emdash') return [...files].filter(([n]) => /^src\/.*\.astro$/.test(n))
  const wp = await wordpressDemo(context)
  const live = wp.posts.filter((p) => p.post_status === 'publish')
  const shown = [...files].filter(
    ([n]) => /^(templates|parts)\/[^/]+\.html$/.test(n) && !wp.overridden.has(n)
  )
  const used = [...shown.map(([, t]) => t), ...live.map((p) => String(p.post_content ?? ''))].join('\n')
  const patterns = [...files].filter(([n, t]) => {
    if (!/^patterns\/[^/]+\.php$/.test(n)) return false
    const slug = /^\s*\*?\s*Slug:\s*(\S+)/m.exec(t)?.[1]
    return !!slug && used.includes(`"slug":"${slug}"`)
  })
  const php = [...files].filter(([n]) => /^(inc\/[^/]+|functions)\.php$/.test(n))
  return [...shown, ...patterns, ...php]
}

/** @param {import('../index.js').RuleContext} context @param {ReturnType<typeof findings>} f */
async function emdashLabels(context, f) {
  const files = await templateSourceFiles(context)
  const seed = files.get('seed/seed.json')
  const personalize = files.get('seed/personalize.json')
  if (!seed || !personalize) return
  const { defaultLocale = 'en', content = {} } = JSON.parse(seed)
  const covered = new Set((JSON.parse(personalize).labels ?? []).map((/** @type {any} */ l) => l.collection))
  const missing = []
  for (const [collection, rows] of Object.entries(content)) {
    if (covered.has(collection) || !Array.isArray(rows)) continue
    const own = rows.filter((r) => (r?.locale ?? defaultLocale) === defaultLocale)
    const keys = new Set(own.flatMap((r) => Object.keys(r?.data ?? r ?? {}).filter((k) => WORDS_KEY.test(k))))
    if (keys.size) missing.push(`${collection} (${listed([...keys], 3)})`)
  }
  if (missing.length)
    f.problem(
      `seed collections with interface words that personalize.json labels does not reach: ${listed(missing)}`
    )
}

export const lang2OneLanguageEverywhere = {
  id: 'LANG-2',
  title: 'Every word on the site is in the language the customer chose',
  platforms: ['joomla', 'wordpress', 'emdash'],
  owner: /** @type {const} */ ('template'),

  /** @param {import('../index.js').RuleContext} context */
  async run(context) {
    const f = findings(context, 'LANG-2')
    await f.part('the template files', async () => {
      const found = []
      const shown = await shownFiles(context)
      for (const [file, text] of shown) {
        for (const w of hardCodedWords(file, text)) found.push(`'${w.text.slice(0, 40)}' (${file}:${w.line})`)
      }
      if (found.length)
        f.problem(
          `${plural(found.length, 'interface word')} written into template files, not through a translation: ${listed(found, 40)}`
        )
      if (context.release.platform === 'emdash') await emdashLabels(context, f)
      await blockAttributes(context, f, shown)
    })
    await f.part('the stylesheets', () => stylesheetWords(context, f))
    await f.part('the language switcher', () => switcherNames(context, f))
    await f.part('the fonts', () => fontGlyphs(context, f))
    f.note(
      'Counted: element text, placeholder, title, button captions and the aria-label of a control. Not counted: code in <script> or PHP/JavaScript expressions, alt text and landmark aria-labels.'
    )
    f.note(
      'Translating the template keys into the chosen language is Tracy and the CMS plugin; the words a built site shows are only known there.'
    )
    return f.outcome({
      pass: 'the interface words of the template go through a translatable path',
      fix: {
        joomla:
          'Replace each word with a TPL_ key in the template language file (Text::_()); set the text in a font family that has the letters of every language offered.',
        wordpress:
          "Print each word through __() / esc_html__() with the theme's text domain, or move it into a template part Tracy rewrites; ship fonts with the letters of every language offered.",
        emdash:
          'Read each word from a data field and list its collection in seed/personalize.json labels; ship fonts with the letters of every language offered.'
      }[context.release.platform]
    })
  }
}
