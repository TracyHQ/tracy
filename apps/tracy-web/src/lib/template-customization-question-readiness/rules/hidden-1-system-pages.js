/**
 * HIDDEN-1: the 404 page, the search results, the Terms and the Privacy pages carry the customer's
 * facts, not the demo's (spec `tasks/spec-template-customization-question-readiness.md`, HIDDEN-1).
 * Static half: no demo fingerprint written where Tracy cannot reach, and a body slot on every
 * legal page (a legal text is the demo company's own). Whether the slots get filled with the
 * customer's facts only a built site shows.
 *
 * A demo fingerprint is a demo company name (the same lists ABOUT-3 reads), an e-mail address, and
 * on EmDash 404/search fields also a year or a standard number ("Capability statement 2026",
 * "ISO 45001").
 * - Joomla: the template's `error.php` and `offline.php` (PHP comments aside) and its T4 HTML blocks
 *   (`html/layouts/t4/block/*.html`, drawn on those pages too) carry none; a legal article
 *   (alias `privacy|terms|legal|cookie`) has a text slot in its body.
 * - WordPress: the 404 template (dump `wp_template` 404, else the theme's `templates/404.html`) and
 *   `templates/search.html` carry none; a legal page is a contract page with a slot, or carries none.
 * - EmDash: `site` fields `not_found_*`/`search_*` with a fingerprint have a writing rule; the body
 *   (`content`) of a legal page has `identity`, `copy`, `rewrite` or `blocks` (`labels` translates,
 *   `replace` renames: neither rewrites it).
 */
import { demoDatabase } from '../readers/demo-database-tables.js'
import {
  coverageOf,
  defaultEntries,
  emdashTemplate,
  stringsIn
} from '../readers/emdash-personalize-coverage.js'
import { htmlTextPieces, normalText } from '../readers/joomla-row-text.js'
import { contractOf, NO_CONTRACT_FIX, NO_CONTRACT_OWNER } from '../readers/quickstart-contract.js'
import { UnreadableContent } from '../readers/release-content.js'
import { templateSourceFiles } from '../readers/template-source-files.js'

const LEGAL = /privacy|terms|legal|cookie/i
const EMAIL = /[\w.+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi
const BODY_KINDS = ['identity', 'copy', 'rewrite', 'blocks']

/** The fingerprints of `names` and e-mail addresses in a text. */
function fingerprintsIn(
  /** @type {string} */ text,
  /** @type {string[]} */ names,
  /** @type {RegExp | null} */ extra = null
) {
  const hits = new Set()
  for (const n of names)
    if (n.length >= 3 && new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(text))
      hits.add(n)
  for (const m of text.matchAll(EMAIL)) hits.add(m[0])
  if (extra) for (const m of text.matchAll(extra)) hits.add(m[0])
  return [...hits]
}

const stripPhpComments = (/** @type {string} */ php) =>
  php.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*(\/\/|#).*$/gm, ' ')

/** @param {import('../index.js').RuleContext} context @param {string[]} problems @param {string[]} open */
async function joomla(context, problems, open) {
  const contract = contractOf(context)
  if (!contract) return void problems.push('no content contract seals this release')
  const brand = String(context.setting.template ?? '')
    .replace(/^(ja|tpl|gk)_/, '')
    .replace(/_/g, ' ')
  const label = String(context.setting.label ?? '')
  const names = [
    brand.replace(/\b\w/g, (c) => c.toUpperCase()),
    label === context.setting.template ? '' : label
  ].filter(Boolean)
  const files = await templateSourceFiles(context)
  if (!files) open.push('the template files are not carried: error.php is not read')
  else
    for (const [file, text] of files) {
      // The 404 page, the offline page, and T4's HTML blocks (a header, a drawer) those pages draw too.
      const page = /^(error|offline)\.php$/.test(file)
      if (!page && !/^html\/layouts\/t4\/block\/[^/]+\.html$/.test(file)) continue
      const words = page ? stripPhpComments(text) : htmlTextPieces(text).join(' ')
      const hits = fingerprintsIn(words, names)
      if (hits.length)
        problems.push(
          `${file} writes demo text ${page ? `the ${file === 'offline.php' ? 'offline' : '404'} page` : 'every page, the 404 page too,'} shows to every visitor: ${hits.join(', ')}`
        )
    }
  const lock = contract.json('presentation-lock.json')
  const slots = contract.json('content-map.json')?.slots ?? []
  for (const [key, row] of Object.entries(lock?.entities ?? {}))
    if (
      key.startsWith('article-') &&
      LEGAL.test(String(row.alias)) &&
      String(row.state ?? '1') === '1' &&
      htmlTextPieces(`${row.introtext ?? ''} ${row.fulltext ?? ''}`).length
    )
      if (!slots.some((s) => s.entity === key && s.type === 'text' && /introtext|fulltext/.test(s.column)))
        problems.push(`the legal article ${row.alias} (${key}) has no slot in its body`)
  open.push('the search page (com_finder and its overrides) is not read')
}

/** @param {import('../index.js').RuleContext} context @param {string[]} problems @param {string[]} open */
async function wordpress(context, problems, open) {
  const contract = contractOf(context)
  if (!contract) return void problems.push('no content contract seals this release')
  const db = await demoDatabase(context)
  const map = contract.json('content-map.json')
  const names = [
    normalText(db.option('blogname')),
    ...(map?.slots ?? []).filter((s) => s.input === 'name').map((s) => normalText(s.sample))
  ].filter(Boolean)
  const posts = db.table('posts').filter((p) => p.post_status === 'publish')
  const files = await templateSourceFiles(context)
  for (const kind of ['404', 'search']) {
    const own = posts.find((p) => p.post_type === 'wp_template' && p.post_name === kind)?.post_content
    const text = own ?? files?.get(`templates/${kind}.html`)
    if (text === undefined) {
      open.push(
        files
          ? `the theme has no templates/${kind}.html`
          : `the theme files are not carried: the ${kind} template is not read`
      )
      continue
    }
    const hits = fingerprintsIn(htmlTextPieces(text).join(' '), names)
    if (hits.length) problems.push(`the ${kind} template writes demo text: ${hits.join(', ')}`)
  }
  const pages = new Map(
    (map?.entities ?? []).filter((e) => e.kind === 'page').map((e) => [e.identity.slug, e.key])
  )
  for (const page of posts.filter((p) => p.post_type === 'page' && LEGAL.test(String(p.post_name)))) {
    const key = pages.get(page.post_name)
    if (key && (map?.slots ?? []).some((s) => s.entity === key)) continue
    const hits = fingerprintsIn(htmlTextPieces(page.post_content).join(' '), names)
    if (hits.length)
      problems.push(
        `the legal page ${page.post_name} has no slot and names the demo: ${hits.slice(0, 4).join(', ')}`
      )
  }
}

/** @param {import('../index.js').RuleContext} context @param {string[]} problems @param {string[]} open */
async function emdash(context, problems, open) {
  const t = await emdashTemplate(context)
  if (!t?.personalize || !t.seed)
    return void open.push('the release carries no readable source zip with the seed')
  const covered = coverageOf(t.personalize)
  const names = (t.personalize.replace ?? []).map((r) => String(r.find))
  for (const { collection, slug, data } of defaultEntries(t.seed)) {
    if (collection === 'site')
      for (const [field, value] of Object.entries(data)) {
        if (!/^(not_found|search)_/.test(field)) continue
        const hits = fingerprintsIn(stringsIn(value).join(' '), names, /\b(?:19|20)\d\d\b|\bISO\s?\d{3,5}\b/g)
        if (hits.length && !covered(collection, slug, field).some((k) => BODY_KINDS.includes(k)))
          problems.push(`site.${field} carries demo facts (${hits.join(', ')}) and no rule rewrites it`)
      }
    if (collection === 'pages' && LEGAL.test(String(slug))) {
      const kinds = covered(collection, slug, 'content')
      if (!kinds.some((k) => BODY_KINDS.includes(k)))
        problems.push(
          `the body of pages/${slug} has ${kinds.filter((k) => k !== 'replace').join(', ') || 'no rule'}${kinds.includes('replace') ? ' and the brand replace' : ''}: the demo company's legal text stays`
        )
    }
  }
}

export const hidden1SystemPages = {
  id: 'HIDDEN-1',
  title: 'The 404, search, Terms and Privacy pages carry the customer’s facts, not the demo’s',
  platforms: ['joomla', 'wordpress', 'emdash'],
  owner: /** @type {const} */ ('template'),

  /** @param {import('../index.js').RuleContext} context */
  async run(context) {
    const { name, platform } = context.release
    /** @type {string[]} */
    const problems = []
    /** @type {string[]} */
    const open = []
    try {
      if (platform === 'joomla') await joomla(context, problems, open)
      else if (platform === 'wordpress') await wordpress(context, problems, open)
      else await emdash(context, problems, open)
    } catch (e) {
      if (!(e instanceof UnreadableContent)) throw e
      return { status: e.status, message: `${name}: ${e.message}.` }
    }
    const live = 'Whether the slots get the customer’s facts only a built site shows.'
    // Only the Joomla and WordPress part reads a contract, so only it can find none.
    const unsealed = platform !== 'emdash' && problems.includes('no content contract seals this release')
    if (problems.length)
      return {
        status: 'fail',
        message: `${name} fails HIDDEN-1: ${problems.join('; ')}.`,
        ...(unsealed ? { owner: NO_CONTRACT_OWNER } : {}),
        fix: unsealed
          ? NO_CONTRACT_FIX
          : 'Take the demo brand and addresses out of the 404 and search templates, and give the legal pages a body slot or rewrite rule (or a neutral sample text).',
        details: [...open, live]
      }
    const blocking = open.filter((o) => !o.startsWith('the search page'))
    if (blocking.length)
      return {
        status: 'live-only',
        message: `${name}: nothing failed in what was read; ${blocking.join('; ')}.`,
        details: [...open, live]
      }
    return {
      status: 'pass',
      message: `${name}: the 404, search and legal pages carry no demo fingerprint outside Tracy's reach.`,
      details: [...open, live]
    }
  }
}
