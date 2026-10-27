/**
 * NAME-2: a customer who gave a business name sees it in the tab of every inner page; one who did
 * not keeps the template's (spec `tasks/spec-template-customization-question-readiness.md`, NAME-2).
 *
 * - Joomla: not the template's. One switch of the whole site (`sitename_pagetitles`) adds the site
 *   name to every title, and Tracy turns it on when it writes the name (decision D1, 09/10/2026).
 * - WordPress: core builds "page, separator, site name" (`title-tag`). A theme that writes its own
 *   `<title>`, a `document_title_parts` filter that drops `site`, or a `pre_get_document_title`
 *   filter that returns a title without the site name (`get_bloginfo( 'name' )`) fails.
 * - EmDash: the title the layout prints (`fullTitle`, else the `<title>` expression) is built with
 *   the site title (`siteTitle` / `settings.title`).
 */
import { UnreadableContent } from '../readers/release-content.js'
import { templateSource } from '../readers/template-source.js'
import { wordpressTitleFilters } from '../readers/wordpress-title-filters.js'

const SITE_NAME = /get_bloginfo\s*\(\s*['"]name['"]\s*\)|get_option\s*\(\s*['"]blogname['"]\s*\)/

/** @param {import('../index.js').RuleContext} context */
async function wordpressProblems(context) {
  const { filters, handWritten } = await wordpressTitleFilters(context)
  const problems = [...handWritten]
  for (const f of filters) {
    if (f.hook === 'document_title_parts' && /unset\s*\(\s*\$\w+\s*\[\s*['"]site['"]\s*\]\s*\)/.test(f.body))
      problems.push(`${f.file} ${f.name} drops the site name from the title parts`)
    if (f.hook === 'pre_get_document_title')
      for (const m of f.body.matchAll(/\breturn\b([^;]*);/g)) {
        const value = m[1].trim()
        // Handing back what WordPress passed in (`$title`, often empty) lets core build the title.
        if (/^\$\w+$/.test(value) || value === "''" || value === '""' || SITE_NAME.test(value)) continue
        // A helper defined in the same body that adds the name (`$named( … )`) counts as naming the site.
        const helper = /^\$(\w+)\s*\(/.exec(value)?.[1]
        if (helper && SITE_NAME.test(new RegExp(`\\$${helper}\\s*=[^;]*;`).exec(f.body)?.[0] ?? '')) continue
        problems.push(
          `${f.file} ${f.name} returns a title without the site name: return ${value.slice(0, 80)}`
        )
      }
  }
  return { problems, notes: filters.map((f) => `${f.file} hooks ${f.name} on ${f.hook}`) }
}

/** @param {import('../index.js').RuleContext} context */
async function emdashProblems(context) {
  const layouts = await templateSource(context).texts((n) => /^src\/layouts\/[^/]+\.astro$/.test(n))
  const problems = []
  for (const [file, text] of layouts) {
    const built =
      /const\s+fullTitle\s*=([^\n]*)/.exec(text)?.[1] ?? /<title>\s*\{([^}]*)\}\s*<\/title>/.exec(text)?.[1]
    if (built === undefined) continue
    if (!/siteTitle|settings\??\.title/.test(built))
      problems.push(`${file} builds the page title without the site title: ${built.trim().slice(0, 80)}`)
  }
  if (layouts.size === 0) problems.push('no layout found in src/layouts')
  return { problems, notes: [] }
}

export const name2PageTitles = {
  id: 'NAME-2',
  title: 'A customer who gave a business name sees it in the tab of every inner page',
  platforms: ['joomla', 'wordpress', 'emdash'],
  owner: /** @type {const} */ ('template'),

  /** @param {import('../index.js').RuleContext} context */
  async run(context) {
    const { name, platform } = context.release
    if (platform === 'joomla')
      return {
        status: 'not-applicable',
        message: `${name}: on Joomla the site name in every title is Tracy's switch (sitename_pagetitles, decision D1), not the template's.`,
        owner: 'tracy'
      }
    let read
    try {
      read = platform === 'wordpress' ? await wordpressProblems(context) : await emdashProblems(context)
    } catch (e) {
      const status = e instanceof UnreadableContent ? e.status : 'fail'
      return {
        status,
        message: `${name}: the page titles cannot be read: ${e instanceof Error ? e.message : e}.`
      }
    }
    if (read.problems.length)
      return {
        status: 'fail',
        message: `${name} fails NAME-2: ${read.problems.join('; ')}.`,
        fix:
          platform === 'wordpress'
            ? 'Keep the site name in every inner page title (leave $parts["site"], end a fixed title with get_bloginfo("name")), and cut a new release.'
            : 'Keep the site name in every inner page title (build fullTitle with siteTitle), and cut a new release.',
        details: read.notes
      }
    return {
      status: 'pass',
      message: `${name}: every inner page title ends with the site name the customer gives.`,
      details: read.notes
    }
  }
}
