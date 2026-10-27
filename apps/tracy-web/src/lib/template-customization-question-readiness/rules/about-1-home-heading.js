/**
 * ABOUT-1: when the customer describes the business, the home page's big heading and the paragraph
 * under it speak about that business (spec `tasks/spec-template-customization-question-readiness.md`,
 * ABOUT-1). Only the template half is checked: both must sit where Tracy writes. Whether the new
 * words match the description is Tracy's model, and only a built site shows it.
 *
 * - Joomla: the home menu item of the presentation lock, the blocks its page shows (content map
 *   `pages[]`), and the first `<h1>` in their stored rows: every text piece of it must be a text
 *   slot's sample, and the same block needs a paragraph slot. No `<h1>` in any row (printed by the
 *   template's PHP) is `live-only`: no data says which block stands first.
 * - WordPress: the first level-1 heading of the front page (else its first heading) and the first
 *   paragraph after it. A named block (`metadata.name`) must have a slot targeting that name; an
 *   unnamed one passes, because Tracy rewrites unnamed text itself (`wp-leaves.js`).
 * - EmDash: the fields `src/views/Home.astro` prints inside its `<h1>` and the paragraph after it
 *   must each have an `identity`, `copy`, `blocks` or `rewrite` rule and exist in the seed.
 */
import {
  contractOf,
  declaredCopyOwner,
  NO_CONTRACT_FIX,
  slotsByEntity
} from '../readers/quickstart-contract.js'
import { demoDatabase } from '../readers/demo-database-tables.js'
import { coverageOf, defaultEntries, emdashTemplate } from '../readers/emdash-personalize-coverage.js'
import { acmStrings, firstHeadingOf, htmlTextPieces, normalText } from '../readers/joomla-row-text.js'
import { UnreadableContent } from '../readers/release-content.js'
import { blocksOf } from '../site-pages/wordpress-blocks.js'

const PARAGRAPH_FIELD = /(^|[-_[])(desc|description|intro|info-desc|text|lead)([-_\]]|$)/

/** @param {import('../index.js').RuleContext} context */
function joomla(
  context,
  /** @type {import('../readers/quickstart-contract.js').SealingContract} */ contract
) {
  const lock = contract.json('presentation-lock.json')
  const map = contract.json('content-map.json')
  const homes = Object.entries(lock?.entities ?? {}).filter(
    ([k, row]) => k.startsWith('menuItem-') && row.home === '1'
  )
  const home = homes.find(([, row]) => row.language === '*') ?? homes[0]
  if (!home) return { status: 'fail', message: 'the presentation lock has no home menu item', problems: [] }
  const page = (map?.pages ?? []).find((p) => p.entity === home[0])
  const keys = (page?.assignedModules ?? []).filter((m) => m.published === '1').map((m) => m.entity)
  const article = /[?&]view=article\b.*?[?&]id=(\d+)/.exec(String(page?.link ?? ''))
  if (article) keys.unshift(`article-${article[1]}`)
  const slots = slotsByEntity(map)
  for (const key of keys) {
    const row = lock.entities[key]
    if (!row) continue
    const html = [
      row.content,
      row.introtext,
      row.fulltext,
      ...acmStrings(row.params).map((s) => s.text)
    ].join('\n')
    const found = firstHeadingOf(html)
    if (!found) continue
    const own = (slots.get(key) ?? []).filter((s) => s.type === 'text')
    const samples = new Set(own.map((s) => normalText(s.sample)))
    const missing = htmlTextPieces(found.heading.replace(/ /g, ' ')).filter((t) => !samples.has(t))
    const headingSlots = own.filter((s) => found.heading.includes(normalText(s.sample)))
    const paragraph = own.some(
      (s) =>
        !headingSlots.includes(s) &&
        (/\/p(\/|\[|$)/.test(String(s.xpath ?? '')) ||
          PARAGRAPH_FIELD.test(String((s.jsonPath ?? []).at(-2) ?? '')))
    )
    const problems = []
    if (missing.length || !headingSlots.length)
      problems.push(`the home heading "${found.heading}" (${key}) is not a text slot`)
    if (!paragraph) problems.push(`${key}, which holds the home heading, has no paragraph slot`)
    return {
      status: problems.length ? 'fail' : 'pass',
      message: `home heading "${found.heading}" in ${key}`,
      problems
    }
  }
  return {
    status: 'live-only',
    message: `no row of the home page (${home[0]}) stores an <h1>: the template prints it, and only a restored demo shows which block stands first`,
    problems: []
  }
}

/** @param {import('../index.js').RuleContext} context */
async function wordpress(
  context,
  /** @type {import('../readers/quickstart-contract.js').SealingContract} */ contract
) {
  const db = await demoDatabase(context)
  const front = db.option('show_on_front') === 'page' ? db.option('page_on_front') : null
  const post = front ? db.table('posts').find((p) => String(p.ID) === String(front)) : null
  if (!post)
    return { status: 'live-only', message: 'the front page is not a page: the theme prints it', problems: [] }
  const tokens = blocksOf(post.post_content).filter((t) => !t.close)
  const headings = tokens.filter((t) => t.name === 'core/heading')
  const heading = headings.find((t) => Number(t.attrs.level) === 1) ?? headings[0]
  if (!heading)
    return {
      status: 'live-only',
      message: `the front page "${post.post_name}" holds no heading block: a theme pattern prints it`,
      problems: []
    }
  const paragraph = tokens.find((t) => t.name === 'core/paragraph' && t.at > heading.at)
  const targets = new Set(
    (contract.json('content-map.json')?.slots ?? []).map((s) => s.target?.block).filter(Boolean)
  )
  const problems = []
  for (const [what, block] of [
    ['heading', heading],
    ['paragraph', paragraph]
  ]) {
    const name = block?.attrs?.metadata?.name
    if (name && !targets.has(name))
      problems.push(`the home ${what} is the named block "${name}", which no contract slot targets`)
  }
  const names = [heading, paragraph].map((b) => b?.attrs?.metadata?.name ?? 'unnamed').join(', ')
  return {
    status: problems.length ? 'fail' : 'pass',
    message: `home "${post.post_name}": heading and paragraph blocks ${names}`,
    problems
  }
}

/** @param {import('../index.js').RuleContext} context */
async function emdash(context) {
  const t = await emdashTemplate(context)
  const view = t?.files.get('src/views/Home.astro')
  if (!t || !t.personalize || view === undefined)
    return {
      status: 'live-only',
      message: 'the release carries no readable source zip with src/views/Home.astro',
      problems: []
    }
  const h1 = /<h1\b[\s\S]*?<\/h1>/i.exec(view)
  if (!h1)
    return { status: 'live-only', message: 'src/views/Home.astro prints no <h1> of its own', problems: [] }
  const rest = view.slice(h1.index + h1[0].length)
  const p = /<p\b[\s\S]*?<\/p>/i.exec(rest)
  const fieldsOf = (/** @type {string} */ s) => [
    ...new Set([...s.matchAll(/\$page\("(\w+)"\)|\{\s*h\.(\w+)\s*\}/g)].map((m) => m[1] ?? m[2]))
  ]
  const fields = [...fieldsOf(h1[0]), ...(p ? fieldsOf(p[0]) : [])]
  const covered = coverageOf(t.personalize)
  const home = defaultEntries(t.seed).find((e) => e.collection === 'home')
  const problems = []
  for (const field of fields) {
    if (
      !covered('home', home?.slug ?? 'home', field).some((k) =>
        ['identity', 'copy', 'blocks', 'rewrite'].includes(k)
      )
    )
      problems.push(`home.${field} has no identity, copy, blocks or rewrite rule`)
    if (home && !(field in home.data)) problems.push(`home.${field} is not in seed/seed.json`)
  }
  if (!fields.length) problems.push('the home <h1> prints no field of the home entry')
  return {
    status: problems.length ? 'fail' : 'pass',
    message: `home heading and paragraph fields ${fields.join(', ')}`,
    problems
  }
}

export const about1HomeHeading = {
  id: 'ABOUT-1',
  title: 'The home heading and the paragraph under it are where Tracy writes the description',
  platforms: ['joomla', 'wordpress', 'emdash'],
  owner: /** @type {const} */ ('contract'),

  /** @param {import('../index.js').RuleContext} context */
  async run(context) {
    const { name, platform } = context.release
    const contract = platform === 'emdash' ? null : contractOf(context)
    if (platform !== 'emdash' && !contract)
      return {
        status: 'fail',
        message: `${name}: no content contract seals this release.`,
        fix: NO_CONTRACT_FIX
      }
    let out
    try {
      if (platform === 'joomla') out = joomla(context, /** @type {any} */ (contract))
      else if (platform === 'wordpress') out = await wordpress(context, /** @type {any} */ (contract))
      else out = await emdash(context)
    } catch (e) {
      if (!(e instanceof UnreadableContent)) throw e
      return { status: e.status, message: `${name}: ${e.message}.` }
    }
    const details = [
      'Whether the new words match the description is Tracy’s model: only a built site shows it.'
    ]
    if (out.status === 'fail')
      return {
        status: 'fail',
        message: `${name} fails ABOUT-1: ${out.problems.join('; ')}.`,
        fix:
          platform === 'emdash'
            ? 'Give the home heading and the paragraph under it a copy rule in seed/personalize.json, then cut a new release.'
            : 'Give the home heading and the paragraph under it a text slot (re-capture the contract).',
        owner: declaredCopyOwner(platform),
        details: [out.message, ...details]
      }
    return { status: out.status, message: `${name}: ${out.message}.`, details }
  }
}
