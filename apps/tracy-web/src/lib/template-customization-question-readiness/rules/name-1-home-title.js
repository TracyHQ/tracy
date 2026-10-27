/**
 * NAME-1: a customer who gave a business name sees it in the home page's tab; one who did not keeps
 * the template's (spec `tasks/spec-template-customization-question-readiness.md`, NAME-1).
 *
 * - Joomla: the home entries of the demo menu (one per language). A `page_title` with words in it
 *   must be one the release's presentation lock ships, so the engine knows it is the template's and
 *   writes the name over it (`joomla-tidy.js` `pageMetaSteps`). An empty `page_title` takes the name
 *   from the engine; no `page_title` key at all is named by the site-name switch Tracy turns on with
 *   the name (decision D1), so neither is the template's to fix. A release sealed by no contract has
 *   its titles judged by the owner's words, which also replaces them.
 * - WordPress: core prints the site name on the home tab (`title-tag`). A theme that writes its own
 *   `<title>`, or a title filter that returns a phrase of the demo (the template's name, the demo's
 *   site name, the word "template"), fails.
 * - EmDash: `src/layouts/*.astro` builds the title from `settings.title`, and `seed/personalize.json`
 *   writes `settings.title` from the name (`{name}`). The home tab must show that name FIRST: the
 *   expression `<title>{…}</title>` prints (or the function it calls, from `src/lib/`, as Tracy Business 1.7.4's
 *   `pageTitleOf` in `src/lib/page-title.ts`) has a branch that is a bare name, or that starts with it
 *   (`${siteTitle} — ${title}`, 12/10/2026: the customer's name first, a page title after it is fine), never
 *   only "Page — Name". Tracy Business
 *   1.7.3 passed without this read while every tab, the home one included, was "${title} — ${siteTitle}" (09/10/2026).
 */
import { shippedPageMeta } from '../../../sites/brief-engines/joomla-tidy.js'
import { readTables, tableEndingWith } from '../readers/sql-dump.js'
import { releaseContract } from '../readers/release-contract.js'
import { UnreadableContent } from '../readers/release-content.js'
import { templateSource } from '../readers/template-source.js'
import { wordpressServedMarkup } from '../readers/wordpress-theme-parts.js'
import { phpStrings, wordpressTitleFilters } from '../readers/wordpress-title-filters.js'

const flat = (/** @type {unknown} */ text) =>
  String(text ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** @param {import('../index.js').RuleContext} context */
async function joomlaProblems(context) {
  const tables = readTables(await context.content.sql(), (n) => n.endsWith('_menu'))
  const homes = (tableEndingWith(tables, 'menu')?.rows ?? []).filter(
    (r) => Number(r.client_id) === 0 && Number(r.home) === 1 && Number(r.published) === 1
  )
  const contract = releaseContract(context)
  const shipped = contract ? shippedPageMeta(contract.dir) : null
  const problems = []
  const notes = []
  for (const r of homes) {
    let params = {}
    try {
      params = JSON.parse(r.params || '{}') ?? {}
    } catch {
      params = {}
    }
    const title = flat(params.page_title)
    const entry = `home entry ${r.id} (${r.language})`
    if (!('page_title' in params))
      notes.push(
        `${entry} has no page_title: the site-name switch Tracy turns on with the name titles it (D1)`
      )
    else if (title === '') notes.push(`${entry} ships an empty page_title: the engine writes the name there`)
    else if (!contract)
      notes.push(
        `${entry} ships "${title}" and no contract seals the release: the engine replaces it as not the owner's words`
      )
    else if (!shipped?.page_title.includes(title))
      problems.push(
        `${entry} ships the page title "${title}", which the presentation lock of contract ${contract.id} does not hold, so the engine keeps it as the owner's`
      )
    else notes.push(`${entry} ships "${title}", held by the lock: the engine writes the name over it`)
  }
  if (homes.length === 0) problems.push('the demo menu has no published home entry')
  return { problems, notes }
}

/** @param {import('../index.js').RuleContext} context */
async function wordpressProblems(context) {
  const { filters, handWritten } = await wordpressTitleFilters(context)
  const { options } = await wordpressServedMarkup(context)
  const label = String(context.setting.label ?? '')
  const demo = [label, label.replace(/^JA\s+/i, ''), options.blogname ?? '']
    .map((s) => s.toLowerCase())
    .filter((s) => s.length > 2)
  const problems = [...handWritten]
  for (const f of filters)
    for (const s of phpStrings(f.body)) {
      const words = s.toLowerCase()
      if (/\s/.test(s) && (words.includes('template') || demo.some((d) => words.includes(d))))
        problems.push(`${f.file} ${f.name} (on ${f.hook}) returns the demo's words "${s}"`)
    }
  return { problems, notes: filters.map((f) => `${f.file} hooks ${f.name} on ${f.hook}`) }
}

/** A bare identifier that is a whole branch of a ternary (after `?` or `:`), ending where the branch ends. */
const BARE_BRANCH = /[?:]\s*([A-Za-z_$][\w$]*)\s*(?=[:;)}\n]|$)/g
/** A bare identifier a function returns (type annotations, also after `:`, are not branches there). */
const BARE_RETURN = /\breturn\s+([A-Za-z_$][\w$]*)\s*(?=[;}\n]|$)/g

/**
 * A template literal that opens with an interpolated name (`${siteTitle} — ${title}`): the customer's name is
 * read first, and a page title after it is fine (12/10/2026, Tracy Base EmDash's home branch).
 */
const NAME_FIRST = /`\$\{\s*([A-Za-z_$][\w$]*)\s*\}/g
const NOT_A_NAME = ['title', 'null', 'undefined', 'true', 'false']

/** Whether `code` has a branch that is a name alone, or a title that starts with the name; never the page's own `title`. */
const hasBareName = (/** @type {string} */ code, pattern = BARE_BRANCH) =>
  [...code.matchAll(pattern), ...code.matchAll(NAME_FIRST)].some((m) => !NOT_A_NAME.includes(m[1]))

/**
 * The home tab of an EmDash layout: whether the code that builds `<title>` can print the site name alone.
 * @param {string} file @param {string} layout @param {Map<string, string>} texts
 * @returns {string | null} the problem, or null
 */
function emdashHomeTitleProblem(file, layout, texts) {
  const printed = /<title>\s*\{\s*([A-Za-z_$][\w$]*)\s*\}\s*<\/title>/.exec(layout)?.[1]
  if (!printed) return `${file} prints no <title>{…}</title> this check can follow`
  const made = new RegExp(`\\bconst\\s+${printed}\\s*=\\s*([^\\n]+)`).exec(layout)?.[1]?.trim()
  if (!made) return `${file} prints {${printed}}, built where this check cannot follow`
  if (hasBareName(made)) return null
  // A call into the theme's own `src/lib/` module: that function's body decides.
  for (const call of made.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)) {
    const from = new RegExp(
      `import\\s*\\{[^}]*\\b${call[1]}\\b[^}]*\\}\\s*from\\s*['"]@\\/lib\\/([\\w./-]+)['"]`
    ).exec(layout)?.[1]
    if (!from) continue
    const lib = ['', '.ts', '.js', '.mjs']
      .map((ext) => texts.get(`src/lib/${from}${ext}`))
      .find((t) => typeof t === 'string')
    if (lib === undefined)
      return `${file} builds its title with ${call[1]} from src/lib/${from}, which the source does not carry`
    const start = lib.search(new RegExp(`\\bfunction\\s+${call[1]}\\b`))
    if (start < 0) continue
    const next = lib.slice(start + 1).search(/\n(?:export\s+)?(?:async\s+)?function\s/)
    if (hasBareName(lib.slice(start, next < 0 ? undefined : start + 1 + next), BARE_RETURN)) return null
    return `src/lib/${from} ${call[1]} never returns a title that starts with the site name, so the home tab opens with the page's words`
  }
  // Quoted whole: a lone template literal trades its backticks for quotes, any other expression
  // (a ternary of two literals) is wrapped, so the message never opens one quote and closes another.
  const code = made.replace(/;$/, '')
  const quoted = /^`[^`]*`$/.test(code) ? `"${code.slice(1, -1)}"` : `"${code}"`
  return `${file} builds the home tab as ${quoted}: never the site name first`
}

/** @param {import('../index.js').RuleContext} context */
async function emdashProblems(context) {
  const texts = await templateSource(context).texts((n) =>
    /^src\/layouts\/[^/]+\.astro$|^src\/lib\/[\w./-]+\.(?:ts|js|mjs)$|^seed\/personalize\.json$/.test(n)
  )
  const problems = []
  let personalize = null
  try {
    personalize = JSON.parse(texts.get('seed/personalize.json') ?? 'null')
  } catch {
    personalize = null
  }
  if (!String(personalize?.settings?.title ?? '').includes('{name}'))
    problems.push('seed/personalize.json does not write settings.title from {name}')
  const layouts = [...texts].filter(([n]) => n.endsWith('.astro'))
  if (!layouts.some(([, t]) => /settings\??\.title/.test(t)))
    problems.push('no layout in src/layouts reads settings.title')
  for (const [file, text] of layouts) {
    if (!/<title>/.test(text)) continue
    const problem = emdashHomeTitleProblem(file, text, texts)
    if (problem) problems.push(problem)
  }
  return { problems, notes: [] }
}

export const name1HomeTitle = {
  id: 'NAME-1',
  title: "A customer who gave a business name sees it in the home page's tab",
  platforms: ['joomla', 'wordpress', 'emdash'],
  owner: /** @type {const} */ ('template'),

  /** @param {import('../index.js').RuleContext} context */
  async run(context) {
    const { name, platform } = context.release
    let read
    try {
      read =
        platform === 'joomla'
          ? await joomlaProblems(context)
          : platform === 'wordpress'
            ? await wordpressProblems(context)
            : await emdashProblems(context)
    } catch (e) {
      const status = e instanceof UnreadableContent ? e.status : 'fail'
      return {
        status,
        message: `${name}: the home title cannot be read: ${e instanceof Error ? e.message : e}.`
      }
    }
    if (read.problems.length)
      return {
        status: 'fail',
        message: `${name} fails NAME-1: ${read.problems.join('; ')}.`,
        fix:
          platform === 'joomla'
            ? 'Capture the presentation lock again from this release so it holds the home page title (repo tch, the contract profile).'
            : platform === 'wordpress'
              ? 'Build the home tab title from the site name the customer gave (get_bloginfo("name")), never from fixed words, and cut a new release.'
              : 'Build the home tab title from the site name the customer gave (settings.title), never from fixed words, and cut a new release.',
        owner: platform === 'joomla' ? 'contract' : 'template',
        details: read.notes
      }
    return {
      status: 'pass',
      message: `${name}: the home tab takes the business name the customer gives.`,
      details: read.notes
    }
  }
}
