/**
 * LANG-6: dates read in the chosen language's own format (spec
 * `tasks/spec-template-customization-question-readiness.md`, LANG-6, 10/10/2026): a
 * Vietnamese site prints "9 tháng 6, 2023", never "Tháng 6 9, 2023" or "Jun 09, 2023".
 *
 * The template's side is that it writes no date format of its own in English word order, so the
 * site's language decides (`readers/english-date-formats.js`):
 * - WordPress: the `format` of date blocks in the theme's templates, parts and patterns and in the
 *   demo's published content; PHP calls with a literal format (`get_the_date( 'M d, Y' )`,
 *   `gmdate( 'M j, Y' )`) in the theme;
 * - Joomla: date format parameters of the demo's site modules (`show_date_format`, `date_format`)
 *   and literal formats in the template's layouts (`HTMLHelper::_('date', $d, 'M d, Y')`);
 * - EmDash: dates formatted with a fixed English locale in `src/**`.
 * Setting the site's own format (WordPress `date_format`, the Joomla language pack's keys) is
 * Tracy's (spec "Tracy's job" 14); what a built site prints is measured there.
 */
import { demoTables } from '../readers/demo-tables.js'
import { blockDateFormats, dateFormatsIn, englishOrder } from '../readers/english-date-formats.js'
import { findings, listed, plural } from '../readers/rule-findings.js'
import { templateSourceFiles } from '../readers/template-source-files.js'
import { wordpressDemo } from '../readers/wordpress-demo.js'
import { blocksOf } from '../site-pages/wordpress-blocks.js'

/** `'M d, Y' ×3 (a.php:4, b.html:9)` */
function grouped(/** @type {{ format: string, where: string }[]} */ hits) {
  const by = new Map()
  for (const h of hits) by.set(h.format, [...(by.get(h.format) ?? []), h.where])
  return [...by].map(([fmt, w]) => `'${fmt}'${w.length > 1 ? ` ×${w.length}` : ''} (${listed(w, 2)})`)
}

/** @param {import('../index.js').RuleContext} context */
async function found(context) {
  const { platform } = context.release
  const files = (await templateSourceFiles(context)) ?? new Map()
  /** @type {{ format: string, where: string }[]} */
  const hits = []
  const add = (/** @type {string} */ where, /** @type {{ line: number, format: string }[]} */ list) => {
    for (const h of list) hits.push({ format: h.format, where: `${where}:${h.line}` })
  }
  for (const [file, text] of files) {
    if (platform === 'emdash') {
      if (/^src\/.*\.(astro|tsx?|jsx?)$/.test(file) && !/\.test\./.test(file))
        add(file, dateFormatsIn('script', text))
      continue
    }
    if (file.endsWith('.php')) add(file, dateFormatsIn('php', text))
    if (platform === 'wordpress' && /\.(html|php)$/.test(file)) add(file, blockDateFormats(text, blocksOf))
  }
  if (platform === 'wordpress') {
    const wp = await wordpressDemo(context)
    for (const p of wp.posts)
      if (p.post_status === 'publish' && wp.isSource(p))
        add(`${p.post_type} ${p.post_name}`, blockDateFormats(String(p.post_content ?? ''), blocksOf))
  }
  if (platform === 'joomla') {
    for (const m of (await demoTables(context)).rows('modules')) {
      if (String(m.client_id) !== '0' || String(m.published) !== '1') continue
      let params = {}
      try {
        params = JSON.parse(String(m.params ?? '{}')) ?? {}
      } catch {
        continue
      }
      for (const [k, v] of Object.entries(params))
        if (/date_?format/i.test(k) && typeof v === 'string' && englishOrder(v))
          hits.push({ format: v, where: `module ${m.id} (${m.module}) ${k}` })
    }
  }
  return hits
}

export const lang6DatesInLanguage = {
  id: 'LANG-6',
  title: "Dates read in the chosen language's own format",
  platforms: ['joomla', 'wordpress', 'emdash'],
  owner: /** @type {const} */ ('template'),

  /** @param {import('../index.js').RuleContext} context */
  async run(context) {
    const f = findings(context, 'LANG-6')
    await f.part('the date formats', async () => {
      const hits = await found(context)
      if (hits.length)
        f.problem(
          `${plural(hits.length, 'date format')} written in English order (month name before the day) or with English month names, which override the site language's own: ${listed(grouped(hits), 10)}`
        )
    })
    f.note("The site's own date format (WordPress date_format, the Joomla language pack) is set by Tracy.")
    return f.outcome({
      pass: 'the template writes no date format of its own in English order',
      fix: {
        joomla:
          "Drop the fixed format (or use Text::_('DATE_FORMAT_LC3')) so the language pack decides the order.",
        wordpress:
          "Drop the format of each date block and PHP call (or wrap it in __()) so the site's date_format decides.",
        emdash:
          "Format dates with the page's own locale (Intl with the display locale), never a fixed 'en' or English month names."
      }[context.release.platform]
    })
  }
}
