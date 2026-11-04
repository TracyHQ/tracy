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
 * - EmDash: the fields `src/views/Home.astro` prints inside its `<h1>` and in the element under it (the first
 *   `<p>`, or the first element printing a stamped field, whichever comes first) must each have an `identity`,
 *   `copy`, `blocks` or `rewrite` rule and exist in the seed. A field is read through a stamp the view declares
 *   (`const $hero = stampFor(Astro.request, 'hero', …)` makes `$hero("f")` / `$hero('f')` a field of collection
 *   `hero`; an undeclared `$page` and `{ h.f }` mean the `home` entry, as in Tracy Business). Each is checked
 *   against the first entry of its collection that holds the field. The `<h1>` and the element under it must EACH
 *   print such a field (a static `<p>` standing first fails); with no element after the `<h1>` the heading alone is
 *   judged. A stamp alone proves nothing: the element's text expressions (`{x.f}`, a PortableText `value={… x.f …}`)
 *   must reach the field OF THE ENTRY THE STAMP IS BOUND TO (the third argument of its `stampFor`: `hero`), through that
 *   variable, a variable derived from it, or a frontmatter variable built from either: `{other.hero_heading}` does not count.
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

/**
 * The collection each stamp of a view names: `const $hero = stampFor(Astro.request, 'hero', …)` -> `$hero: hero`.
 * @param {string} view
 */
function stampCollections(view) {
  return new Map(
    [...view.matchAll(/const\s+(\$\w+)\s*=\s*stampFor\(\s*Astro\.request\s*,\s*["'](\w+)["']/g)].map((m) => [
      m[1],
      m[2]
    ])
  )
}

/**
 * The variables each stamp is bound to: the third argument of `stampFor(Astro.request, 'c', <entry>)` names the entry it
 * stamps (`hero ? { id: hero.id, slug: hero.slug } : null` -> `hero`, `{ data: site } as any` -> `site`).
 * @param {string} view
 * @returns {Map<string, Set<string>>} stamp name -> the entry variables
 */
function stampRoots(view) {
  const out = new Map()
  for (const m of view.matchAll(/const\s+(\$\w+)\s*=\s*stampFor\(\s*Astro\.request\s*,\s*["']\w+["']\s*,/g)) {
    // the argument runs to the `)` that closes the call
    let depth = 1
    let i = m.index + m[0].length
    const start = i
    for (; i < view.length && depth > 0; i++) depth += view[i] === '(' ? 1 : view[i] === ')' ? -1 : 0
    const arg = view
      .slice(start, i - 1)
      .replace(/\bas\s+[\w.<>[\], ]+/g, ' ')
      .replace(/\b[A-Za-z_$][\w$]*\s*:/g, ' ')
    out.set(m[1], new Set(rootsIn(arg)))
  }
  return out
}

const NOT_VARIABLES = new Set(['null', 'undefined', 'true', 'false', 'new', 'typeof', 'await', 'as', 'any'])
/** The variables an expression reads: identifiers that are not property names or keywords. */
function rootsIn(/** @type {string} */ code) {
  return [...code.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)/g)]
    .map((m) => m[1])
    .filter((id) => !NOT_VARIABLES.has(id))
}

/**
 * The frontmatter variables derived from `roots` through `const` / `let` assignments: `h = entry.data`, then anything
 * built from `h`, and so on.
 * @param {Set<string>} roots @param {Map<string, string>} declared
 */
function derivedFrom(roots, declared) {
  const known = new Set(roots)
  for (let grew = true; grew; ) {
    grew = false
    for (const [name, init] of declared)
      if (!known.has(name) && rootsIn(init).some((id) => known.has(id))) {
        known.add(name)
        grew = true
      }
  }
  return known
}

/** A field printed through a stamp: `$X("f")` or `$X('f')`. */
const STAMPED = /(\$\w+)\(\s*["'](\w+)["']\s*\)/g

/**
 * The (collection, field) pairs a piece of Home.astro prints: through a declared stamp, through an undeclared `$page`
 * (the `home` entry, as the Tracy templates write it), or as `{ h.f }` (also `home`).
 * @param {string} text @param {Map<string, string>} stamps
 * @returns {{ collection: string, field: string, stamp: string | null }[]}
 */
function printedFields(text, stamps) {
  /** @type {{ collection: string, field: string, stamp: string | null }[]} */
  const out = []
  const add = (
    /** @type {string} */ collection,
    /** @type {string} */ field,
    /** @type {string | null} */ stamp
  ) => {
    if (!out.some((o) => o.collection === collection && o.field === field))
      out.push({ collection, field, stamp })
  }
  for (const m of text.matchAll(STAMPED)) {
    const collection = stamps.get(m[1]) ?? (m[1] === '$page' ? 'home' : null)
    if (collection) add(collection, m[2], m[1])
  }
  for (const m of text.matchAll(/\{\s*h\.(\w+)\s*\}/g)) add('home', m[1], null)
  return out
}

/**
 * The element "under" the heading: the first `<p>` after it, or the first element that prints a stamped field, whichever
 * comes first (a hero's intro is often a `<div>` holding rich text, not a `<p>`). Either is read whole, to its closing tag.
 * @param {string} rest what follows the `</h1>`
 */
function underHeading(rest) {
  const p = /<p\b[\s\S]*?<\/p>/i.exec(rest)
  const stamped = new RegExp(STAMPED.source).exec(rest)
  let stampedTag = null
  if (stamped) {
    const open = rest.lastIndexOf('<', stamped.index)
    const close = rest.indexOf('>', stamped.index)
    if (open >= 0 && close > open) stampedTag = { at: open, text: elementFrom(rest, open, close) }
  }
  if (p && (!stampedTag || p.index <= stampedTag.at)) return p[0]
  return stampedTag?.text ?? ''
}

/**
 * The element whose opening tag is `rest[open..close]`, to its matching closing tag (same-name tags nest); a void or
 * self-closing tag, or one never closed, is the tag alone.
 * @param {string} rest @param {number} open @param {number} close
 */
function elementFrom(rest, open, close) {
  const name = /^<([A-Za-z][\w.-]*)/.exec(rest.slice(open, close + 1))?.[1]
  if (!name || rest[close - 1] === '/') return rest.slice(open, close + 1)
  const tag = new RegExp(`<(/?)${name.replace(/[.]/g, '\\.')}(?=[\\s>/])[^>]*?(/?)>`, 'g')
  tag.lastIndex = close + 1
  let depth = 1
  for (let m = tag.exec(rest); m; m = tag.exec(rest)) {
    if (m[2] === '/') continue
    depth += m[1] ? -1 : 1
    if (depth === 0) return rest.slice(open, m.index + m[0].length)
  }
  return rest.slice(open, close + 1)
}

/** `{ ... }` expressions of a JSX fragment: the code it prints, its static text left out. Braces nest; strings are skipped. */
function expressionsOf(/** @type {string} */ jsx) {
  /** @type {string[]} */
  const out = []
  for (let i = 0; i < jsx.length; i++) {
    if (jsx[i] !== '{') continue
    let depth = 0
    let j = i
    for (; j < jsx.length; j++) {
      const c = jsx[j]
      if (c === '"' || c === "'" || c === '`') {
        const end = jsx.indexOf(c, j + 1)
        if (end < 0) break
        j = end
      } else if (c === '{') depth++
      else if (c === '}' && --depth === 0) break
    }
    out.push(jsx.slice(i + 1, j))
    i = j
  }
  return out
}

/**
 * The frontmatter's `const` / `let` initialisers by name: `heroLines` -> `hero ? lines(hero.hero_heading) : []`. A
 * statement runs to the next line that starts another declaration.
 * @param {string} view
 */
function declarations(view) {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(view)?.[1] ?? ''
  /** @type {Map<string, string>} */
  const out = new Map()
  const starts = [...fm.matchAll(/^(?:const|let|var)\s+(\w+)\s*(?::[^=\n]+)?=/gm)]
  const next = /^(?:const|let|var|import|export|function|async function)\b/gm
  for (const m of starts) {
    next.lastIndex = m.index + m[0].length
    const end = next.exec(fm)?.index ?? fm.length
    out.set(m[1], fm.slice(m.index + m[0].length, end))
  }
  return out
}

/**
 * A JSX fragment without its tags: what is left between them, `{...}` expressions included. A tag's attributes (the open tag
 * of the element itself, a nested HTML element's) never print text, so `data-copy={hero.hero_heading}` proves nothing. A tag
 * inside an expression stays with it.
 * @param {string} jsx
 */
function childrenOf(jsx) {
  let out = ''
  let depth = 0
  for (let i = 0; i < jsx.length; i++) {
    const c = jsx[i]
    if (depth === 0 && c === '<' && /[A-Za-z/]/.test(jsx[i + 1] ?? '')) {
      // skip the tag: to the first `>` outside braces and quotes
      let braces = 0
      let j = i + 1
      for (; j < jsx.length; j++) {
        const d = jsx[j]
        if (d === '"' || d === "'" || d === '`') {
          const end = jsx.indexOf(d, j + 1)
          if (end < 0) break
          j = end
        } else if (d === '{') braces++
        else if (d === '}') braces--
        else if (d === '>' && braces === 0) break
      }
      // a component's props are its content (`<PortableText value={x.f} />`); an HTML element's attributes are not text
      out += /^<[A-Z]/.test(jsx.slice(i, i + 2)) ? jsx.slice(i, j + 1) : ' '
      i = j
      continue
    }
    if (c === '{') depth++
    else if (c === '}') depth--
    out += c
  }
  return out
}

/**
 * The code a fragment prints: the `{...}` expressions of its children (`childrenOf`: attributes are not text) and, for
 * each frontmatter variable they use, that variable's initialiser, and so on down the chain.
 * @param {string} fragment @param {Map<string, string>} declared
 */
function printedCode(fragment, declared) {
  const own = expressionsOf(childrenOf(fragment))
  const seen = new Set()
  const code = [...own]
  for (let i = 0; i < code.length; i++)
    for (const [, id] of code[i].matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)/g))
      if (declared.has(id) && !seen.has(id)) {
        seen.add(id)
        code.push(/** @type {string} */ (declared.get(id)))
      }
  return code.join('\n')
}

/**
 * Whether `code` reaches the field of the entry: `r.f`, `r?.f` or `r['f']`, where `r` is one of `roots` (the entry the
 * stamp is bound to, or a variable derived from it). With no roots (a stamp the view does not declare) any `x.f` does.
 */
const reaches = (
  /** @type {string} */ code,
  /** @type {string} */ field,
  /** @type {Set<string> | null} */ roots
) => {
  const owner =
    roots && roots.size
      ? `(?<![.\\w$])(?:${[...roots].map((r) => r.replace(/\$/g, '\\$')).join('|')})\\s*`
      : '[\\w$)\\]]\\s*'
  return new RegExp(`${owner}(?:\\?\\.|\\.)\\s*${field}\\b|${owner}\\[\\s*["']${field}["']\\s*\\]`).test(code)
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
  const stamps = stampCollections(view)
  const under = underHeading(view.slice(h1.index + h1[0].length))
  const declared = declarations(view)
  const roots = stampRoots(view)
  /** The fields an element stamps and really prints: its text expression reaches them. */
  const read = (/** @type {string} */ element) => {
    const stamped = printedFields(element, stamps)
    const code = printedCode(element, declared)
    const printed = stamped.filter((f) => {
      const bound = f.stamp ? roots.get(f.stamp) : null
      return reaches(code, f.field, bound ? derivedFrom(bound, declared) : null)
    })
    return { stamped, printed }
  }
  const heading = read(h1[0])
  const paragraph = read(under)
  const headingFields = heading.printed
  const paragraphFields = paragraph.printed
  const named = (/** @type {{ collection: string, field: string }[]} */ list) =>
    list.map((f) => (f.collection === 'home' ? f.field : `${f.collection}.${f.field}`)).join(', ')
  const fields = [...headingFields, ...paragraphFields].filter(
    (f, i, all) => all.findIndex((o) => o.collection === f.collection && o.field === f.field) === i
  )
  const covered = coverageOf(t.personalize)
  const entries = defaultEntries(t.seed)
  const problems = []
  for (const { collection, field } of fields) {
    // the entry that holds the field (the first one when several do); the front page entry when the collection is absent
    const holder = entries.find((e) => e.collection === collection && field in e.data)
    const own = entries.some((e) => e.collection === collection)
    const slug = holder?.slug ?? entries.find((e) => e.collection === collection)?.slug ?? collection
    if (!covered(collection, slug, field).some((k) => ['identity', 'copy', 'blocks', 'rewrite'].includes(k)))
      problems.push(`${collection}.${field} has no identity, copy, blocks or rewrite rule`)
    if ((own || collection !== 'home') && !holder)
      problems.push(`${collection}.${field} is not in seed/seed.json`)
  }
  // Both must be written: a covered heading does not excuse a static paragraph under it, nor the reverse. A home with
  // no element after the <h1> is judged on the heading alone (as before).
  if (!headingFields.length)
    problems.push(
      heading.stamped.length
        ? `the home <h1> stamps ${named(heading.stamped)} but its text prints none of them`
        : 'the home <h1> prints no field of the home entry'
    )
  if (under && !paragraphFields.length)
    problems.push(
      paragraph.stamped.length
        ? `the element under the home heading stamps ${named(paragraph.stamped)} but its text prints none of them`
        : 'the element under the home heading (<p>) prints no field of the home entry'
    )
  return {
    status: problems.length ? 'fail' : 'pass',
    message: `home heading and paragraph fields ${fields.map((f) => (f.collection === 'home' ? f.field : `${f.collection}.${f.field}`)).join(', ')}`,
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
