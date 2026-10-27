/**
 * NAME-3: a customer who gave a business name sees it in the © line at the foot of the page (spec
 * `tasks/spec-template-customization-question-readiness.md`, NAME-3).
 *
 * Every © line takes the name from a place Tracy writes:
 *
 * - WordPress: each block of the served parts and templates holding ©, `&copy;` or "Copyright" has a
 *   name token, `{site.name}` / `{site.legalName}` (the Claude Cowork plugin's closed list) or
 *   `{site.title}` where the theme's PHP fills it, or sits beside a Site Title block. A token outside
 *   the closed list that the theme does not fill prints as written.
 * - Joomla: each published site module showing © is `mod_footer` (whose layout, or the template's
 *   override of it, prints `$lineone`, the site name), a contract slot whose sample holds ©, or text
 *   with a name token; and no file of the template (`error.php`, `index.php`, `offline.php`, `html/**`)
 *   writes a © line in fixed words.
 * - EmDash: each field of the seed holding © or (c) has an `identity` rule in `seed/personalize.json`
 *   writing it from `{name}`.
 *
 * A template with no © line at all passes. Whether the model fills a slot it was given on every
 * build is only seen on a built site.
 */
import { readTables, tableEndingWith } from '../readers/sql-dump.js'
import { releaseContract } from '../readers/release-contract.js'
import { UnreadableContent } from '../readers/release-content.js'
import { templateSource } from '../readers/template-source.js'
import { wordpressServedMarkup } from '../readers/wordpress-theme-parts.js'

/** The identity tokens the Claude Cowork plugin replaces (`IdentityTokens::NAMES`). */
const PLUGIN_TOKENS = new Set([
  'site.name',
  'site.legalName',
  'site.slogan',
  'site.monogram',
  'contact.email',
  'contact.phone',
  'contact.tel',
  'contact.address',
  'contact.hours',
  'social.facebook',
  'social.instagram',
  'social.linkedin',
  'social.tiktok',
  'social.youtube'
])
const NAME_TOKENS = ['site.name', 'site.legalName', 'site.title']
const COPYRIGHT = /©|&copy;|&#169;|\bcopyright\b/i
const LIVE_NOTE = 'Only a built site shows that a © slot handed to the model is filled on every build.'

/** @param {import('../index.js').RuleContext} context */
async function wordpressProblems(context) {
  const { markup } = await wordpressServedMarkup(context)
  const php = await templateSource(context)
    .texts((n) => n.endsWith('.php'))
    .catch(() => new Map())
  const themeFills = (/** @type {string} */ token) =>
    [...php.values()].some((t) => t.includes(`'{${token}}'`) || t.includes(`"{${token}}"`))
  const problems = []
  for (const m of markup) {
    const runs = m.content.split(/<!--\s+\/?wp:[^>]*-->/)
    const blocks = [...m.content.matchAll(/<!--\s+\/?wp:([a-z0-9/-]+)/g)].map((b) => b[1])
    runs.forEach((run, k) => {
      if (!COPYRIGHT.test(run.replace(/<[^>]*>/g, ' '))) return
      const tokens = [...run.matchAll(/\{([a-z]+\.[A-Za-z]+)\}/g)].map((t) => t[1])
      const unknown = tokens.filter((t) => !PLUGIN_TOKENS.has(t) && !themeFills(t))
      const where = `${m.kind} "${m.slug}" (${m.from === 'database' ? 'demo database' : 'theme file'})`
      if (unknown.length)
        problems.push(`${where} prints {${unknown.join('}, {')}} as written: nothing fills it`)
      const named = tokens.some((t) => NAME_TOKENS.includes(t) && (PLUGIN_TOKENS.has(t) || themeFills(t)))
      if (!named && !/site-title/.test(`${blocks[k - 1] ?? ''} ${blocks[k] ?? ''}`))
        problems.push(
          `${where} writes the © line "${run
            .replace(/<[^>]*>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 80)}" without the site name`
        )
    })
  }
  return problems
}

/** @param {import('../index.js').RuleContext} context */
async function joomlaProblems(context) {
  const problems = []
  const files = await templateSource(context).texts((n) =>
    /^(error|index|offline|component)\.php$|^html\/.+\.php$/.test(n)
  )
  for (const [file, text] of files)
    text.split('\n').forEach((line, i) => {
      if (/^\s*(\*|\/\/|#|\/\*)/.test(line) || !/©|&copy;|&#169;/.test(line)) return
      const words = line
        .replace(/<\?(?:php|=)?[\s\S]*?\?>/g, ' ')
        .replace(/<[^>]*>/g, ' ')
        .replace(/©|&copy;|&#169;/g, '')
      if (/\p{L}{2,}/u.test(words) && !/\$|Text::|JText::|\{site\./.test(line))
        problems.push(
          `${file}:${i + 1} writes "${words.replace(/\s+/g, ' ').trim().slice(0, 60)}" in fixed words`
        )
    })
  const contract = releaseContract(context)
  const slots = contract?.slots() ?? []
  const footerOverride = [...files].find(([n]) => /^html\/mod_footer\/[^/]+\.php$/.test(n))
  const tables = readTables(await context.content.sql(), (n) => n.endsWith('_modules'))
  for (const m of tableEndingWith(tables, 'modules')?.rows ?? []) {
    if (Number(m.client_id) !== 0 || Number(m.published) !== 1) continue
    const text = String(m.content ?? '').replace(/<[^>]*>/g, ' ')
    const entity = `module-${m.id}`
    if (m.module === 'mod_footer') {
      if (footerOverride && !/\$lineone|sitename/.test(footerOverride[1]))
        problems.push(`${footerOverride[0]} overrides mod_footer without printing the site name`)
      continue
    }
    if (!/©|&copy;|&#169;/.test(text)) continue
    if (/\{site\.(name|legalName)\}/.test(text)) continue
    if (slots.some((s) => s.entity === entity && /©|&copy;|&#169;/.test(String(s.sample ?? '')))) continue
    problems.push(
      `module ${m.id} "${m.title}" (${m.module}, ${m.position}) shows "${text.replace(/\s+/g, ' ').trim().slice(0, 60)}" with no contract slot${contract ? ` in ${contract.id}` : ' (no contract seals the release)'}`
    )
  }
  return problems
}

/** @param {import('../index.js').RuleContext} context */
async function emdashProblems(context) {
  const model = await context.content.siteModel()
  const texts = await templateSource(context).texts((n) => n === 'seed/personalize.json')
  let identity = []
  try {
    identity = JSON.parse(texts.get('seed/personalize.json') ?? '{}')?.identity ?? []
  } catch {
    identity = []
  }
  const problems = []
  const seen = new Set()
  for (const r of model.records ?? [])
    for (const [field, value] of Object.entries(r.values ?? {})) {
      if (typeof value !== 'string' || !/©|\(c\)/i.test(value) || seen.has(`${r.type}/${r.slug}/${field}`))
        continue
      seen.add(`${r.type}/${r.slug}/${field}`)
      const rule = identity.find((i) => i.collection === r.type && i.slug === r.slug && i.field === field)
      if (!rule || !/\{name\}|\{NAME\}/.test(JSON.stringify(rule.value ?? '')))
        problems.push(
          `${r.type}/${r.slug} ${field} "${value.slice(0, 60)}" has no identity rule writing {name}`
        )
    }
  return problems
}

export const name3CopyrightLine = {
  id: 'NAME-3',
  title: 'A customer who gave a business name sees it in the © line at the foot of the page',
  platforms: ['joomla', 'wordpress', 'emdash'],
  owner: /** @type {const} */ ('template'),

  /** @param {import('../index.js').RuleContext} context */
  async run(context) {
    const { name, platform } = context.release
    let problems
    try {
      problems =
        platform === 'joomla'
          ? await joomlaProblems(context)
          : platform === 'wordpress'
            ? await wordpressProblems(context)
            : await emdashProblems(context)
    } catch (e) {
      const status = e instanceof UnreadableContent ? e.status : 'fail'
      return {
        status,
        message: `${name}: the © lines cannot be read: ${e instanceof Error ? e.message : e}.`
      }
    }
    if (problems.length)
      return {
        status: 'fail',
        message: `${name} fails NAME-3: ${problems.join('; ')}.`,
        fix: `Print the © line from the site name (${
          platform === 'joomla'
            ? '$app->get("sitename") or mod_footer, or a contract slot'
            : platform === 'wordpress'
              ? "a token the theme's inc/identity.php renders, such as {site.title} or {site.name}, or a Site Title block"
              : 'an identity rule with {name} in seed/personalize.json'
        }), and cut a new release.`,
        details: [LIVE_NOTE]
      }
    return {
      status: 'pass',
      message: `${name}: every © line takes the business name from a place Tracy writes.`,
      details: [LIVE_NOTE]
    }
  }
}
