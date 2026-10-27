/**
 * SHARE-1: a link shared on Facebook or Zalo previews the customer's site, not the demo (spec
 * `tasks/spec-template-customization-question-readiness.md`, SHARE-1). The PICTURE of the preview is
 * Tracy's (the customer's logo, D5, 09/10/2026); this rule reads only whether the template
 * writes the preview's words, or a picture, by hand.
 *
 * - Every CMS: no `og:*` / `twitter:*` tag in the template's source carries a literal title,
 *   description, site name or image (a value with no expression in it).
 * - Joomla T4: no public menu item carries its own `og_title` / `og_desc` that no slot can rewrite.
 * - WordPress: an active SEO plugin (Yoast, Rank Math) carries no demo company name in its options.
 *
 * What a platform shows when the template prints no tag (it picks the title and some picture of
 * the page) depends on the built site's final content, so only a built site shows the preview.
 */
import { demoDatabase } from '../readers/demo-database-tables.js'
import { normalText } from '../readers/joomla-row-text.js'
import { contractOf } from '../readers/quickstart-contract.js'
import { UnreadableContent } from '../readers/release-content.js'
import { templateSourceFiles } from '../readers/template-source-files.js'

const PREVIEW_TAG = /^(og:(title|description|site_name|image(:url)?)|twitter:(title|description|image|site))$/
const META = /<meta\b[^>]*>/gi
const ATTR = (/** @type {string} */ name) => new RegExp(`\\b${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i')
/** A value that is written at run time: PHP, a template expression, a JS or Astro expression. */
const DYNAMIC = /<\?|\{|\$|\bget_|\bbloginfo\b/

/** Literal preview tags in the template's source files. */
function literalTags(/** @type {Map<string, string>} */ files) {
  const out = []
  for (const [file, text] of files) {
    if (!/\.(php|html?|astro|tsx?|jsx?|mjs)$/.test(file)) continue
    for (const meta of text.match(META) ?? []) {
      const tag = ATTR('property').exec(meta)?.[2] ?? ATTR('name').exec(meta)?.[2] ?? ''
      const content = ATTR('content').exec(meta)
      if (PREVIEW_TAG.test(tag) && content && content[2].trim() && !DYNAMIC.test(content[2]))
        out.push(`${file}: ${tag} = "${content[2].slice(0, 50)}"`)
    }
    // Tag objects in code: `{ property: 'og:title', content: 'Northgate' }`.
    for (const m of text.matchAll(
      /(?:property|name)\s*:\s*['"]((?:og|twitter):[a-z_:]+)['"]\s*,\s*content\s*:\s*(['"])([^'"]*)\2/g
    ))
      if (PREVIEW_TAG.test(m[1]) && m[3].trim()) out.push(`${file}: ${m[1]} = "${m[3].slice(0, 50)}"`)
  }
  return out
}

/** @param {import('../index.js').RuleContext} context @param {string[]} problems @param {string[]} open */
async function platformProblems(context, problems, open) {
  const { platform } = context.release
  if (platform === 'emdash') return
  const db = await demoDatabase(context)
  if (platform === 'joomla') {
    const slots = contractOf(context)?.json('content-map.json')?.slots ?? []
    for (const item of db
      .table('menu')
      .filter((m) => String(m.published) === '1' && String(m.client_id) === '0')) {
      let params = {}
      try {
        params = JSON.parse(String(item.params ?? '{}'))
      } catch {
        params = {}
      }
      for (const key of ['og_title', 'og_desc'])
        if (
          String(params[key] ?? '').trim() &&
          !slots.some(
            (s) => s.entity === `menuItem-${item.id}` && JSON.stringify(s.jsonPath ?? []).includes(key)
          )
        )
          problems.push(
            `the menu item ${item.alias} carries its own ${key} "${String(params[key]).slice(0, 40)}" that no slot rewrites`
          )
    }
    return
  }
  const plugins = String(db.option('active_plugins') ?? '')
  if (!/wordpress-seo|seo-by-rank-math/.test(plugins)) return
  const names = [normalText(db.option('blogname'))].filter((n) => n.length >= 3)
  for (const option of [
    'wpseo_titles',
    'wpseo_social',
    'rank-math-options-titles',
    'rank-math-options-general'
  ])
    for (const n of names)
      if (String(db.option(option) ?? '').includes(n))
        problems.push(`the SEO option ${option} carries the demo name "${n}"`)
  open.push('the SEO plugin’s default share picture is Tracy’s (D5)')
}

export const share1LinkPreview = {
  id: 'SHARE-1',
  title: 'A shared link previews the customer’s site, not the demo',
  platforms: ['joomla', 'wordpress', 'emdash'],
  owner: /** @type {const} */ ('template'),

  /** @param {import('../index.js').RuleContext} context */
  async run(context) {
    const { name } = context.release
    /** @type {string[]} */
    const problems = []
    /** @type {string[]} */
    const open = []
    let files
    try {
      files = await templateSourceFiles(context)
      if (files) problems.push(...literalTags(files))
      else open.push('the template files are not carried: hard-coded preview tags are not read')
      await platformProblems(context, problems, open)
    } catch (e) {
      if (!(e instanceof UnreadableContent)) throw e
      return { status: e.status, message: `${name}: ${e.message}.` }
    }
    const live =
      'The preview picture is Tracy’s (D5); what Facebook or Zalo then shows only a built site tells.'
    if (problems.length)
      return {
        status: 'fail',
        message: `${name} fails SHARE-1: ${problems.slice(0, 5).join('; ')}.`,
        fix: 'Print the preview tags from the site’s own name, description and picture, never from words or files of the demo.',
        details: [...problems, ...open, live]
      }
    if (!files) return { status: 'live-only', message: `${name}: ${open[0]}.`, details: [...open, live] }
    return {
      status: 'pass',
      message: `${name}: the template writes no preview text or picture by hand.`,
      details: [...open, live]
    }
  }
}
