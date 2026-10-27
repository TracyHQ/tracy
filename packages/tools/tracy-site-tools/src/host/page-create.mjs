/**
 * `tracy_site page.create` — A NEW PAGE AND ITS MENU ENTRY IN ONE CALL, on WordPress, Joomla and EmDash.
 *
 * 🔒 WHY A JOB, NOT A RECIPE. "Create an FAQ page with three questions and put it in the top menu after
 * Services" took 22–26 calls on all three CMS of the D bench (05/10/2026): the agent read the describe's
 * `where.pages` recipe, then theme patterns, SCSS and template files for about eight steps before its two
 * to four writes, and two of three runs still wrote the menu wrong (a whole wp_navigation body re-sent;
 * a Joomla article refused for its missing `introtext`). The recipe already says what the page is made
 * of; this job fills it host-side — the theme's own markup the quickstart's map pins, the CMS's own page
 * and menu doors, the language the customer named — and answers with the page's path, its menu entry
 * and what a read of the page showed, so the agent writes once and reads nothing back.
 *
 * 🔒 EVERY WRITE LEAVES THROUGH A DOOR THE REST OF THE TOOL ALREADY GUARDS. WordPress and Joomla write
 * through `write` (`runSiteCall`: normalisation, the body guard, the site's flight, the write memory),
 * under ONE apply id this call mints, so one `apply.revert` takes the page and its menu entry back;
 * EmDash writes through `emdash` (`runEmdashTool`: the locale rule, the draft guard, the receipts —
 * the same road `tracy_emdash` takes). The menu is read and its place found BEFORE anything is written,
 * so a call that cannot place its link writes nothing; a menu write that fails after the page was made
 * takes the page back on WordPress and Joomla (never a page no menu reaches while the answer says done).
 *
 * 🔒 ONE PAGE, ONE LANGUAGE. A quickstart keeps one page per language; this job makes the page in the
 * language the call names (`locale`, else the site's default) and never copies it into another — a
 * second language is the customer's to ask for, and then it is another call with that `locale`.
 *
 * 🔒 NOTHING HERE IS GUESSED. A recipe the map does not pin falls back to the CMS's own plain markup
 * (and the answer says so); a menu whose place the item named does not decide — two menus hold it, none
 * does — is refused with the menus listed, never written into the likeliest one.
 *
 * Pure except for the injected I/O, so `test/page-create.test.mjs` drives every road with the package's
 * fakes.
 */

import { decodeEntities, foldForMatch, renderedUnits } from './html-units.mjs'
import { escapeHtmlText, parseBlocks } from './replace-wordpress.mjs'
import { blockMarkupProblem } from './site-call.mjs'

/** How a sentence names the call. */
export const PAGE_CREATE_CALL = 'tracy_site page.create'

/** The parameter names, and nothing else. */
export const PAGE_CREATE_KEYS = Object.freeze(['title', 'body', 'heading', 'slug', 'menu', 'locale'])
/** The keys of `menu`. */
export const PAGE_MENU_KEYS = Object.freeze(['after', 'name'])
/** The keys of one `body` item. */
export const PAGE_ITEM_KEYS = Object.freeze(['title', 'text'])

const TITLE_MAX = 200
const ITEM_TITLE_MAX = 300
const TEXT_MAX = 4000
const ITEMS_MAX = 40
const SLUG_MAX = 80
/** wp_navigation posts listed (bodies included), pages of 25 at most. */
const NAV_PAGES_MAX = 4
/** Joomla menu items listed, pages of 200 at most. */
const MENU_ITEM_PAGES_MAX = 5
/** Joomla article pages read whole to learn the template style a content page wears. */
const STYLE_SAMPLES_MAX = 5
/** Menus an EmDash call reads to find the item named, when nothing names the menu. */
const EMDASH_MENUS_MAX = 6

/**
 * Every sentence this job answers with (T10: an error ≤ 160 characters, a next ≤ 200), `{name}` filled
 * by {@link pageText}; `test/page-create.test.mjs` holds each to its budget on its worst case.
 */
export const PAGE_CREATE_NEXT = Object.freeze({
  receipt:
    'The receipt: tell the customer in plain words the page is live at {path}{place}. Read nothing back.',
  receiptHidden:
    'Tell the customer plainly: the page is at {path}{place}, but its words do not show yet; not done.',
  receiptMenuHidden:
    'Tell the customer: the page is live at {path}, but its menu link does not show at desktop width, so the desktop header still needs it.',
  menuPlace: ' and in the menu after "{after}"',
  menuEnd: ' and at the end of its menu',
  badUnknownError: '{param} is not a parameter of page.create; allowed: {allowed}',
  badUnknownNext:
    '{call} {title:"<page title>", body:[{title:"<heading>", text:"<words>"}, …], menu:{after:"<menu item it follows>"}}',
  badMissingError: '{param} is missing: {want}',
  badTypeError: '{param} must be {want}',
  badSlugError: '"{title}" has no letter a web address can carry',
  badSlugNext: 'the same call with slug:"<a few latin words, joined by hyphens>"',
  menuNotFoundError: 'no menu of this site holds an item "{after}"; nothing was written',
  menuNotFoundNext:
    'the same call with menu.after as one of the labels in menus, quoted exactly; or without menu',
  menuAmbiguousError: '"{after}" is in {n} menus: {list}; nothing was written',
  menuAmbiguousNext: 'the same call with menu:{after:"{after}", name:"<the menu meant, from menus>"}',
  menuUnnamedError: 'which menu was not said and this site has {n}: {list}; nothing was written',
  menuUnnamedNext:
    'the same call with menu:{name:"<the menu meant>"} or menu:{after:"<the item it follows>"}',
  noCategoryError:
    'no category for a {lang} page: the item it follows is not an article page; nothing was written',
  noCategoryNext:
    'the same call with menu.after naming an article page of that language, whose category the new page joins',
  languageError: 'this site does not serve {locale}; nothing was written',
  languageNext:
    'the same call with locale as one of the languages this site serves ({locales}), or without locale',
  menuUndoneError: 'the menu entry could not be written ({why}); the page made first was taken back',
  menuUndoneNext: 'tell the customer the page was not added, in plain words, and why; nothing stands',
  menuPartialError: 'the page stands at {path}, and its menu entry could not be written: {why}',
  menuPartialNext:
    'tell the customer the page is live but not yet in the menu; tracy_emdash menu_get {name:"{menu}"} then menu_set_items with it added puts it there',
  plainNote: "this site's quickstart pins no page markup: the page is written in the CMS's plain blocks",
  shownOn: 'shown on {path}',
  notShownYet: 'not shown on {path} yet: a page cache may still hold the old page',
  bodyHidden:
    '{path} answers, but its own words do not show in its main area: its layout may print no article',
  menuShown: 'its menu link shows on {home} at {widths}',
  menuDesktopHidden: 'its menu link does not show on {home} at desktop 1440 ({why}); it shows at {widths}',
  menuInHtml: "its menu link is in {path}'s HTML; whether a visitor sees it could not be checked",
  menuNotShownYet: 'its menu link does not show on {path} yet',
  notChecked: 'not checked: the page could not be read',
  noEntryError: 'the site answered no id for the new page; nothing more was written',
  noEntryNext: 'read the pages list once to see whether "{title}" exists, then tell the customer what stands'
})

/** Quoted facts are cut to this width, so a long title cannot push a sentence past its budget. */
const QUOTED_WIDTH = Object.freeze({
  title: 60,
  after: 30,
  list: 80,
  why: 40,
  widths: 70,
  home: 20,
  path: 50,
  locale: 20,
  menu: 40,
  param: 40,
  want: 60
})

/**
 * Fill one {@link PAGE_CREATE_NEXT} sentence.
 * @param {keyof typeof PAGE_CREATE_NEXT} key
 * @param {Record<string, unknown>} [facts]
 */
export function pageText(key, facts = {}) {
  return PAGE_CREATE_NEXT[key].replace(/\{(\w+)\}/g, (whole, name) => {
    if (name === 'call') return PAGE_CREATE_CALL
    if (!(name in facts)) return whole
    const v = String(facts[name])
    const width = QUOTED_WIDTH[/** @type {keyof typeof QUOTED_WIDTH} */ (name)] ?? Infinity
    return v.length > width ? `${v.slice(0, width - 1)}…` : v
  })
}

/**
 * @param {string} code
 * @param {string} error
 * @param {string} next
 * @param {Record<string, unknown>} [extra]
 */
const refuse = (code, error, next, extra = {}) => ({ ok: false, code, verdict: code, error, next, ...extra })

/** @param {unknown} v @returns {v is Record<string, any>} */
const isRecord = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
/** @param {unknown} v */
const positive = (v) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : 0
  return Number.isInteger(n) && n > 0 ? n : 0
}
/** Two labels the same to a reader: case, accents of spacing and typography folded. @param {unknown} a @param {unknown} b */
const sameLabel = (a, b) => foldForMatch(a).trim() === foldForMatch(b).trim()

// ── The call ────────────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {{ title: string | null, text: string }} PageItem
 * @typedef {{ ok: true, title: string, heading: string, slug: string, items: PageItem[],
 *   menu: { after: string | null, name: string | null } | null, locale: string | null }} PagePlan
 */

/**
 * The address a title gives, as the CMSes' own slugs read: accents off, `đ` as `d`, lower case, every
 * other run of characters one hyphen. Empty when the title has no latin letter or digit.
 * @param {string} title
 */
export function slugOf(title) {
  return title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, '')
}

/**
 * The call checked: closed keys, each with its shape. `body` is a list of `{title?, text}` items (a
 * question and its answer, a heading and its paragraph) or of plain strings (a paragraph each), or one
 * string whose blank lines part its paragraphs.
 * @param {unknown} params
 * @returns {PagePlan | ReturnType<typeof refuse>}
 */
export function planPageCreate(params) {
  const p = isRecord(params) ? params : {}
  const unknown = Object.keys(p).find((k) => !PAGE_CREATE_KEYS.includes(k))
  if (unknown !== undefined)
    return refuse(
      'BAD_PARAMS',
      pageText('badUnknownError', { param: unknown, allowed: PAGE_CREATE_KEYS.join(', ') }),
      pageText('badUnknownNext'),
      { param: unknown }
    )
  /** @param {string} param @param {string} want */
  const bad = (param, want) =>
    refuse(
      'BAD_PARAMS',
      pageText(p[param] === undefined ? 'badMissingError' : 'badTypeError', { param, want }),
      pageText('badUnknownNext'),
      { param }
    )
  const title = typeof p.title === 'string' ? p.title.replace(/\s+/g, ' ').trim() : ''
  if (title === '' || title.length > TITLE_MAX)
    return bad('title', `the page title, 1–${TITLE_MAX} characters`)
  /** @type {PageItem[]} */
  let items = []
  if (typeof p.body === 'string')
    items = p.body
      .split(/\n\s*\n/)
      .map((t) => t.trim())
      .filter(Boolean)
      .map((text) => ({ title: null, text }))
  else if (Array.isArray(p.body))
    for (const [k, it] of p.body.entries()) {
      if (typeof it === 'string' && it.trim() !== '') {
        items.push({ title: null, text: it.trim() })
        continue
      }
      if (!isRecord(it)) return bad(`body[${k}]`, '{title?, text} or a string')
      const extra = Object.keys(it).find((key) => !PAGE_ITEM_KEYS.includes(key))
      if (extra !== undefined) return bad(`body[${k}].${extra}`, 'one of title, text')
      const text = typeof it.text === 'string' ? it.text.trim() : ''
      const head = typeof it.title === 'string' ? it.title.replace(/\s+/g, ' ').trim() : ''
      if (text === '' && head === '') return bad(`body[${k}].text`, 'the words of this part')
      if (text.length > TEXT_MAX) return bad(`body[${k}].text`, `at most ${TEXT_MAX} characters`)
      if (head.length > ITEM_TITLE_MAX) return bad(`body[${k}].title`, `at most ${ITEM_TITLE_MAX} characters`)
      items.push({ title: head === '' ? null : head, text })
    }
  if (items.length === 0 || items.length > ITEMS_MAX)
    return bad('body', `1–${ITEMS_MAX} parts: [{title:"<heading>", text:"<words>"}, …]`)
  const heading = typeof p.heading === 'string' && p.heading.trim() !== '' ? p.heading.trim() : title
  const given = typeof p.slug === 'string' ? slugOf(p.slug) : ''
  const slug = given !== '' ? given : slugOf(title)
  if (slug === '')
    return refuse('BAD_PARAMS', pageText('badSlugError', { title }), pageText('badSlugNext'), {
      param: 'slug'
    })
  /** @type {PagePlan['menu']} */
  let menu = null
  if (p.menu !== undefined && p.menu !== null && p.menu !== false) {
    if (!isRecord(p.menu)) return bad('menu', '{after?:"<item it follows>", name?:"<menu>"}')
    const extra = Object.keys(p.menu).find((key) => !PAGE_MENU_KEYS.includes(key))
    if (extra !== undefined) return bad(`menu.${extra}`, 'one of after, name')
    const after = typeof p.menu.after === 'string' && p.menu.after.trim() !== '' ? p.menu.after.trim() : null
    const name = typeof p.menu.name === 'string' && p.menu.name.trim() !== '' ? p.menu.name.trim() : null
    menu = { after, name }
  }
  const locale = typeof p.locale === 'string' && p.locale.trim() !== '' ? p.locale.trim() : null
  return { ok: true, title, heading, slug, items, menu, locale }
}

// ── The recipes (`content.read {describe:true}` → `where.pages`) ────────────────────────────────

/**
 * @typedef {{ wpMarkup: string | null, wpNav: number | null, joomla: Record<string, any> | null,
 *   joomlaMenu: Record<string, any> | null, emdash: Record<string, any> | null,
 *   emdashMenu: string | null, defaultLocale: string | null, locales: string[] }} Recipes
 *   What the quickstart's map pins for a page: WordPress's section markup and the menu post its
 *   release names; Joomla's article fields and its menu item's; EmDash's entry and its menu's name.
 */

/**
 * The page recipes a describe answer carries, per CMS. Every field is null when the map does not say
 * it: the job then uses the CMS's plain markup and finds the menu by the item named.
 * @param {unknown} describe
 * @returns {Recipes}
 */
export function recipesOf(describe) {
  const d = isRecord(describe) ? describe : {}
  /** @type {Record<string, any>[]} */
  const pages = Array.isArray(d.where?.topics?.pages) ? d.where.topics.pages.filter(isRecord) : []
  const call = (/** @type {any} */ e) => (isRecord(e?.door?.call) ? e.door.call : null)
  const wp = pages.find(
    (e) => call(e)?.action === 'content.update' && call(e)?.params?.fields?.post_type === 'page'
  )
  const nav = pages.find(
    (e) => e.where?.kind === 'post' && positive(e.where?.id) > 0 && isRecord(call(e)?.params?.blocks)
  )
  const jo = pages.find((e) => call(e)?.action === 'content.update' && call(e)?.params?.kind === 'article')
  const em = pages.find((e) => call(e)?.tool === 'content_create')
  const site = isRecord(d.site) ? d.site : {}
  return {
    wpMarkup:
      typeof wp?.door.call.params.fields.post_content === 'string'
        ? wp.door.call.params.fields.post_content
        : null,
    wpNav: nav ? positive(nav.where.id) : null,
    joomla: isRecord(jo?.door?.call?.params?.fields) ? jo.door.call.params.fields : null,
    joomlaMenu: isRecord(jo?.door?.then?.call?.params?.fields) ? jo.door.then.call.params.fields : null,
    emdash: isRecord(em?.door?.call?.arguments) ? em.door.call.arguments : null,
    emdashMenu:
      typeof em?.door?.then?.call?.arguments?.name === 'string' ? em.door.then.call.arguments.name : null,
    defaultLocale: typeof site.defaultLocale === 'string' ? site.defaultLocale : null,
    locales: Array.isArray(site.locales) ? site.locales.filter((l) => typeof l === 'string') : []
  }
}

/** The placeholders a recipe's body carries. */
const QUESTION = '<question>'
const ANSWER = '<answer>'
const HEADING = '<page heading>'
/** A placeholder left in a body: the recipe was not filled whole, so it is not sent. */
const LEFT_OVER = /<(question|answer|page heading|title|slug)>/

/** Text for HTML, its line breaks kept. @param {string} t */
const htmlText = (t) => escapeHtmlText(t).replace(/\s*\n\s*/g, '<br>')

/**
 * The block delimiters of a body, each opener with its closer (`end` the closer's end; a void block
 * its own).
 * @param {string} raw
 * @returns {{ name: string, start: number, end: number }[]}
 */
function blockSpans(raw) {
  /** @type {{ name: string, start: number, end: number }[]} */
  const out = []
  /** @type {{ name: string, start: number }[]} */
  const stack = []
  for (const d of parseBlocks(raw)) {
    if (d.isVoid) out.push({ name: d.name, start: d.start, end: d.end })
    else if (!d.closer) stack.push({ name: d.name, start: d.start })
    else {
      const k = stack.map((s) => s.name).lastIndexOf(d.name)
      if (k === -1) continue
      const [open] = stack.splice(k)
      out.push({ name: d.name, start: open.start, end: d.end })
    }
  }
  return out
}

/** The innermost block holding `[a, b)`. @param {string} raw @param {number} a @param {number} b */
const blockAround = (raw, a, b) =>
  blockSpans(raw)
    .filter((s) => s.start <= a && b <= s.end)
    .sort((x, y) => x.end - x.start - (y.end - y.start))[0] ?? null

/**
 * The WordPress body: the recipe's section markup (the theme's own pattern, which the map pins) with
 * its repeated part — the innermost block holding both `<question>` and `<answer>` — once per item,
 * an item with no title losing the block of its title; else the CMS's plain heading and paragraph
 * blocks. A body WordPress could not read is never sent: the plain one is.
 * @param {string | null} recipe
 * @param {PagePlan} plan
 * @returns {{ markup: string, pinned: boolean }}
 */
export function wordpressBody(recipe, plan) {
  const plain = () => ({
    markup: plan.items
      .map(
        (it) =>
          `${it.title ? `<!-- wp:heading {"level":3} -->\n<h3 class="wp-block-heading">${htmlText(it.title)}</h3>\n<!-- /wp:heading -->\n` : ''}<!-- wp:paragraph -->\n<p>${htmlText(it.text)}</p>\n<!-- /wp:paragraph -->`
      )
      .join('\n'),
    pinned: false
  })
  if (typeof recipe !== 'string') return plain()
  // A note to the reader of the map ("one more … group per further …") is not markup.
  const raw = recipe.replace(/\n?<!--(?!\s*\/?wp:)[\s\S]*?-->/g, '')
  const qi = raw.indexOf(QUESTION)
  const ai = raw.indexOf(ANSWER)
  if (qi === -1 || ai === -1) return plain()
  const unit = blockAround(raw, Math.min(qi, ai), Math.max(qi, ai) + ANSWER.length)
  if (!unit) return plain()
  const part = raw.slice(unit.start, unit.end)
  const qPart = part.indexOf(QUESTION)
  const titleBlock = blockAround(part, qPart, qPart + QUESTION.length)
  const one = (/** @type {PageItem} */ it) => {
    let text = part
    if (it.title === null && titleBlock && !part.slice(titleBlock.start, titleBlock.end).includes(ANSWER))
      text = (part.slice(0, titleBlock.start) + part.slice(titleBlock.end)).replace(/\n{2,}/g, '\n')
    return text
      .split(QUESTION)
      .join(htmlText(it.title ?? ''))
      .split(ANSWER)
      .join(htmlText(it.text))
  }
  const markup = (raw.slice(0, unit.start) + plan.items.map(one).join('\n') + raw.slice(unit.end))
    .split(HEADING)
    .join(htmlText(plan.heading))
  if (LEFT_OVER.test(markup) || blockMarkupProblem(markup) !== null) return plain()
  return { markup, pinned: true }
}

/**
 * The Joomla article body: the recipe's `fulltext` (`<h3><question></h3><p><answer></p>`) once per item,
 * an item with no title losing the element of its title; else plain `<h3>`/`<p>`.
 * @param {string | null} recipe
 * @param {PagePlan} plan
 * @returns {{ html: string, pinned: boolean }}
 */
export function joomlaBody(recipe, plan) {
  const plain = () => ({
    html: plan.items
      .map((it) => `${it.title ? `<h3>${htmlText(it.title)}</h3>` : ''}<p>${htmlText(it.text)}</p>`)
      .join(''),
    pinned: false
  })
  if (typeof recipe !== 'string') return plain()
  const qi = recipe.indexOf(QUESTION)
  const ai = recipe.indexOf(ANSWER)
  if (qi === -1 || ai === -1 || ai < qi) return plain()
  // The element around each placeholder: its opening tag before it, its closing tag after it.
  const openAt = (/** @type {number} */ i) => recipe.lastIndexOf('<', i - 1)
  const closeAt = (/** @type {number} */ i) => {
    const c = recipe.indexOf('</', i)
    return c === -1 ? -1 : recipe.indexOf('>', c) + 1
  }
  const qs = openAt(qi)
  const qe = closeAt(qi + QUESTION.length)
  const ae = closeAt(ai + ANSWER.length)
  if (qs < 0 || qe <= 0 || ae <= 0 || qe > ai) return plain()
  const part = recipe.slice(qs, ae)
  const titlePart = recipe.slice(qs, qe)
  const html =
    recipe.slice(0, qs) +
    plan.items
      .map((it) =>
        (it.title === null ? part.replace(titlePart, '') : part)
          .split(QUESTION)
          .join(htmlText(it.title ?? ''))
          .split(ANSWER)
          .join(htmlText(it.text))
      )
      .join('') +
    recipe.slice(ae).replace(/[\s\S]*<answer>[\s\S]*?<\/[a-z0-9]+>/i, '')
  return LEFT_OVER.test(html) ? plain() : { html, pinned: true }
}

/**
 * The EmDash entry's Markdown: the recipe's (`## <question>\n\n<answer>\n\n…`) line pattern once per
 * item, an item with no title keeping only its words; else `## title` and a paragraph.
 * @param {string | null} recipe
 * @param {PagePlan} plan
 * @returns {{ markdown: string, pinned: boolean }}
 */
export function emdashBody(recipe, plan) {
  const plainItem = (/** @type {PageItem} */ it) => `${it.title ? `## ${it.title}\n\n` : ''}${it.text}`
  if (typeof recipe !== 'string') return { markdown: plan.items.map(plainItem).join('\n\n'), pinned: false }
  const lines = recipe.split('\n')
  const q = lines.findIndex((l) => l.includes(QUESTION))
  const a = lines.findIndex((l, k) => k > q && l.includes(ANSWER))
  if (q === -1 || a === -1) return { markdown: plan.items.map(plainItem).join('\n\n'), pinned: false }
  const last = lines.reduce((m, l, k) => (l.includes(QUESTION) || l.includes(ANSWER) ? k : m), a)
  const unit = lines.slice(q, a + 1)
  const markdown = [
    ...lines.slice(0, q),
    plan.items
      .map((it) =>
        (it.title === null ? [unit[unit.length - 1]] : unit)
          .join('\n')
          .split(QUESTION)
          .join(it.title ?? '')
          .split(ANSWER)
          .join(it.text)
      )
      .join('\n\n'),
    ...lines.slice(last + 1)
  ].join('\n')
  return LEFT_OVER.test(markdown)
    ? { markdown: plan.items.map(plainItem).join('\n\n'), pinned: false }
    : { markdown: markdown.trim(), pinned: true }
}

// ── The language ────────────────────────────────────────────────────────────────────────────────

/** A locale's language, as the CMSes' codes share it: `vi`, `en-US` → `en`, `ru_RU` → `ru`. @param {unknown} code */
const languageOf = (code) => (typeof code === 'string' ? code.toLowerCase().split(/[-_]/)[0] : '')

/**
 * The language a page is made in: the one the call names when the site serves it, else the default.
 * `null` when the call named one the site does not serve (the job refuses, never files it elsewhere).
 * @param {PagePlan} plan
 * @param {Recipes} recipes
 * @returns {{ locale: string | null, other: boolean } | null}
 */
function languageFor(plan, recipes) {
  if (plan.locale === null) return { locale: recipes.defaultLocale, other: false }
  const wanted = languageOf(plan.locale)
  const def = languageOf(recipes.defaultLocale)
  if (def !== '' && wanted === def) return { locale: recipes.defaultLocale, other: false }
  if (recipes.locales.length > 0) {
    const served = recipes.locales.find((l) => languageOf(l) === wanted)
    return served === undefined ? null : { locale: served, other: true }
  }
  return { locale: plan.locale, other: def !== '' }
}

/**
 * A write that answered ok with no id: what it made cannot be named, so nothing is built on it.
 * @param {PagePlan} plan
 */
const noEntry = (plan) =>
  refuse('WRITE_FAILED', pageText('noEntryError'), pageText('noEntryNext', { title: plan.title }))

// ── WordPress ──────────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {(action: string, params: Record<string, unknown>) => Promise<any>} Door
 */

/**
 * The navigation-link blocks of a wp_navigation body: each label and where its block ends (after a
 * submenu's closer, so a link placed after it follows its children too).
 * @param {string} raw
 */
function navLinks(raw) {
  /** @type {{ label: string, end: number }[]} */
  const out = []
  const spans = blockSpans(raw)
  for (const d of parseBlocks(raw)) {
    if (d.closer || !/^core\/navigation-(link|submenu)$/.test(d.name) || typeof d.attrs?.label !== 'string')
      continue
    const span = spans.find((s) => s.start === d.start)
    out.push({ label: d.attrs.label, end: span ? span.end : d.end })
  }
  return out
}

/**
 * The menu a WordPress page's link goes into, found BEFORE anything is written: the published
 * wp_navigation posts that hold the item named (`menu.after`) — narrowed by `menu.name` (its title or
 * slug) and, when several still do, by the ones the header part renders (a `ref`, the theme's
 * `nav.<kind>` name, the menu the quickstart's map names). One left: that menu. None or several: refused,
 * with the menus listed.
 * @param {PagePlan} plan
 * @param {{ read: Door, send: Door, hint: number | null, lang: string }} io
 * @returns {Promise<{ ok: true, id: number, title: string, after: string | null } | { ok: false, answer: Record<string, unknown> }>}
 */
async function wordpressMenu(plan, { read, send, hint, lang }) {
  const menu = /** @type {NonNullable<PagePlan['menu']>} */ (plan.menu)
  /** @type {{ id: number, title: string, slug: string, links: { label: string, end: number }[] }[]} */
  const navs = []
  for (let n = 0; n < NAV_PAGES_MAX; n += 1) {
    const got = await send('content.list', {
      kind: 'post',
      post_type: 'wp_navigation',
      include_body: true,
      limit: 25,
      offset: n * 25
    })
    if (!isRecord(got) || got.ok !== true || !Array.isArray(got.items))
      return {
        ok: false,
        answer: isRecord(got) ? got : { ok: false, code: 'READ_FAILED', error: 'the menus could not be read' }
      }
    for (const row of got.items.filter(isRecord))
      if (row.status === 'publish' && typeof row.content === 'string' && positive(row.id) > 0)
        navs.push({
          id: positive(row.id),
          title: String(row.title ?? ''),
          slug: String(row.slug ?? ''),
          links: navLinks(row.content)
        })
    if (got.items.length < 25) break
  }
  let pool = menu.name
    ? navs.filter((v) => sameLabel(v.title, menu.name) || sameLabel(v.slug, menu.name))
    : navs
  const listed = () => (pool.length > 0 ? pool : navs.filter((v) => v.links.length > 0))
  const menusOf = (/** @type {typeof navs} */ list) =>
    list
      .slice(0, 8)
      .map((v) => ({ name: v.title || v.slug, labels: v.links.slice(0, 8).map((l) => l.label) }))
  if (menu.after) pool = pool.filter((v) => v.links.some((l) => sameLabel(l.label, menu.after)))
  // With no item named, the menu meant holds links (an empty or page-list menu is not one to add to).
  if (!menu.after && pool.some((v) => v.links.length > 0)) pool = pool.filter((v) => v.links.length > 0)
  if (pool.length > 1) {
    // The header part names the menus it renders: by `ref`, or by the theme's `nav.<kind>` name, whose
    // menu is the published post `<kind>-<lang>`, else `<kind>` (wp-tracy-business `inc/extra.php`).
    const part = await read('content.get', { kind: 'templatePart', key: 'header' })
    const body =
      isRecord(part) && part.ok === true && typeof part.item?.content === 'string' ? part.item.content : ''
    /** @type {Set<number>} */
    const refs = new Set(hint ? [hint] : [])
    /** @type {Set<string>} */
    const kinds = new Set()
    for (const d of parseBlocks(body)) {
      if (d.closer || d.name !== 'core/navigation') continue
      if (positive(d.attrs?.ref) > 0) refs.add(positive(d.attrs?.ref))
      const name = d.attrs?.metadata?.name
      if (typeof name === 'string' && name.startsWith('nav.')) kinds.add(name.slice(4))
    }
    const rendered = pool.filter(
      (v) =>
        refs.has(v.id) ||
        [...kinds].some((k) => v.slug === `${k}-${lang}`) ||
        ([...kinds].some((k) => v.slug === k) &&
          !pool.some((w) => [...kinds].some((k) => w.slug === `${k}-${lang}`)))
    )
    if (rendered.length > 0) pool = rendered
  }
  if (pool.length === 1)
    return { ok: true, id: pool[0].id, title: pool[0].title || pool[0].slug, after: menu.after }
  if (menu.after && pool.length === 0)
    return {
      ok: false,
      answer: refuse(
        'NOT_FOUND',
        pageText('menuNotFoundError', { after: menu.after }),
        pageText('menuNotFoundNext'),
        {
          menus: menusOf(listed())
        }
      )
    }
  const list = pool.map((v) => v.title || v.slug)
  return {
    ok: false,
    answer: menu.after
      ? refuse(
          'AMBIGUOUS',
          pageText('menuAmbiguousError', { after: menu.after, n: pool.length, list: list.join(', ') }),
          pageText('menuAmbiguousNext', { after: menu.after }),
          { menus: menusOf(pool) }
        )
      : refuse(
          'AMBIGUOUS',
          pageText('menuUnnamedError', {
            n: listed().length,
            list: listed()
              .map((v) => v.title || v.slug)
              .join(', ')
          }),
          pageText('menuUnnamedNext'),
          { menus: menusOf(listed()) }
        )
  }
}

/**
 * A block comment's attributes as WordPress serializes them (`serialize_block_attributes`): JSON with
 * `--`, `<`, `>`, `&` and `"` inside strings escaped, so no value can end the comment.
 * @param {Record<string, unknown>} attrs
 */
const blockAttrs = (attrs) =>
  JSON.stringify(attrs)
    .replace(/--/g, '\\u002d\\u002d')
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\\"/g, '\\u0022')

/** A paragraph block whose whole content is one link: what a theme's own row of header links is made of. */
const LINK_PARAGRAPH =
  /^(<!-- wp:paragraph(?:\s+\{[\s\S]*?\})? -->)\s*<p\b[^>]*>\s*<a\b[^>]*\bhref="[^"]*"[^>]*>([^<]*)<\/a>\s*<\/p>\s*<!-- \/wp:paragraph -->$/

/**
 * The header part's body with the new page's link added to the theme's OWN row of header links, or
 * null when the header has none (or it cannot be read, or this menu is not the header's).
 *
 * 🔒 WHY A SECOND WRITE. A block theme may draw its desktop header from blocks of its own and keep
 * the navigation block for the phone: tracy-base's header part holds `core/navigation` with
 * `overlayMenu: "always"`, hidden by its CSS above 781px, beside `.tracy-header__links` — a row of
 * paragraphs, one link each (Home, Product, Pricing…), which is what a desktop visitor sees. On
 * dskeepwp (10/10/2026) page.create added "Đối tác" to the `tracy` menu only: the receipt said its
 * link showed, and on a desktop it did not. (The agent had put "Dịch vụ" in both by hand the turn
 * before.) So when the header part holds such a row — at least two paragraphs, sharing one block
 * comment, that are each one link labelled as an item of this menu — the new link joins it as a copy
 * of its neighbour (its block comment and classes), right after the row's copy of the item it follows
 * in the menu, else before the next one's. Nothing is guessed: no such row, no second write.
 * @param {Door} read
 * @param {{ navId: number, labels: string[], before: string[], title: string, path: string }} io -
 *   `labels`: the menu's items, in order, before the new one; `before`: those it follows
 * @returns {Promise<string | null>}
 */
async function wordpressHeaderRow(read, { navId, labels, before, title, path }) {
  const got = await read('content.get', { kind: 'templatePart', key: 'header' })
  const body =
    isRecord(got) && got.ok === true && typeof got.item?.content === 'string' ? got.item.content : null
  if (body === null) return null
  // A header that names another menu draws that one: its row is not this menu's.
  const refs = parseBlocks(body)
    .filter((d) => !d.closer && d.name === 'core/navigation' && positive(d.attrs?.ref) > 0)
    .map((d) => positive(d.attrs?.ref))
  if (refs.length > 0 && !refs.includes(navId)) return null
  /** @type {Map<string, { label: string, start: number, end: number, raw: string }[]>} by block comment */
  const rows = new Map()
  for (const span of blockSpans(body)) {
    if (span.name !== 'core/paragraph') continue
    const raw = body.slice(span.start, span.end)
    const m = LINK_PARAGRAPH.exec(raw)
    const label = m ? decodeEntities(m[2]) : ''
    if (!m || !labels.some((l) => sameLabel(l, label))) continue
    rows.set(m[1], [...(rows.get(m[1]) ?? []), { label, start: span.start, end: span.end, raw }])
  }
  const row = [...rows.values()].sort((a, b) => b.length - a.length)[0] ?? []
  if (row.length < 2 || row.some((r) => sameLabel(r.label, title))) return null
  const copyOf = (/** @type {string} */ l) => row.find((r) => sameLabel(r.label, l))
  // Right after the row's copy of the item it follows; when that item is drawn otherwise (a mega menu),
  // right before the copy of the next one; else after the nearest earlier copy.
  const last = before.length > 0 ? copyOf(before[before.length - 1]) : undefined
  const next = labels
    .slice(before.length)
    .map(copyOf)
    .find((r) => r !== undefined)
  const prev = [...before]
    .reverse()
    .map(copyOf)
    .find((r) => r !== undefined)
  const near = last ?? next ?? prev
  if (!near) return null
  const link = near.raw
    .replace(
      /(<a\b[^>]*\bhref=")[^"]*(")/,
      (_, a, b) => `${a}${escapeHtmlText(path).replace(/"/g, '&quot;')}${b}`
    )
    .replace(/(<a\b[^>]*>)[^<]*(<\/a>)/, (_, a, b) => `${a}${htmlText(title)}${b}`)
  return near === next && !last
    ? `${body.slice(0, near.start)}${link}\n${body.slice(near.start)}`
    : `${body.slice(0, near.end)}\n${link}${body.slice(near.end)}`
}

/**
 * The block templates WordPress renders a page with no template of its own in, most specific first
 * (the template hierarchy past `page-<slug>` and `page-<id>`, which a page made now has none of).
 */
const PAGE_TEMPLATES = Object.freeze(['page', 'singular', 'index'])

/**
 * Whether the template a new page renders in prints the page's title: true or false from the first of
 * {@link PAGE_TEMPLATES} the site holds (its stored row or the active theme's file, `content.get
 * {kind:"template"}`); null when that cannot be told — a classic theme or a component without the
 * `template` kind (any refusal but "not found"), none of the three, or a template that hands part of
 * its body to a pattern or to a template part other than the header and footer, which a read of the
 * template cannot see into.
 * @param {Door} read
 * @returns {Promise<boolean | null>}
 */
async function wordpressTemplateTitles(read) {
  for (const key of PAGE_TEMPLATES) {
    const got = await read('content.get', { kind: 'template', key })
    if (!isRecord(got) || got.ok !== true) {
      if (/not.?found/i.test(String(got?.error ?? got?.code ?? ''))) continue
      return null
    }
    const body = typeof got.item?.content === 'string' ? got.item.content : null
    if (body === null) return null
    /** @type {boolean | null} */
    let titled = false
    for (const d of parseBlocks(body)) {
      if (d.closer) continue
      if (d.name === 'core/post-title') return true
      const chrome =
        d.name === 'core/template-part' &&
        [d.attrs?.slug, d.attrs?.area, d.attrs?.tagName].some((v) =>
          /^(header|footer)$/.test(String(v ?? ''))
        )
      if (d.name === 'core/pattern' || (d.name === 'core/template-part' && !chrome)) titled = null
    }
    return titled
  }
  return null
}

/** The page's heading as its h1, in WordPress's own heading block. @param {PagePlan} plan */
const wordpressTitleBlock = (plan) =>
  `<!-- wp:heading {"level":1} -->\n<h1 class="wp-block-heading">${htmlText(plan.heading)}</h1>\n<!-- /wp:heading -->`

/**
 * Make the page on WordPress, then its menu link, under ONE apply id.
 *
 * 🔒 A PAGE IN PLAIN BLOCKS OPENS WITH ITS H1 WHEN ITS TEMPLATE PRINTS NO TITLE. A block theme's page
 * template may leave the title to the page's own sections: tracy-base's `templates/page.html` is the
 * header, `post-content` and the footer, because each of its pages opens with a hero that carries the
 * h1. The plain blocks this job writes when no map pins the theme's markup have no hero, so on
 * dskeepwp (10/10/2026) the new "Dịch vụ" page had no h1 at all — no title a visitor or a search
 * engine reads. So when the template the page renders in prints no `core/post-title`, the body opens
 * with the page's heading as a level-1 heading block; when it does, or when that cannot be told, the
 * body is left as it was (a second title is as wrong as none). A pinned recipe is the theme's own
 * section and is never touched.
 * @param {PagePlan} plan
 * @param {{ recipes: Recipes, read: Door, send: Door, write: Door, mint: () => string,
 *   lang: { locale: string | null, other: boolean } }} io
 */
async function createOnWordPress(plan, { recipes, read, send, write, mint, lang }) {
  const short = languageOf(lang.locale) || 'en'
  const target = plan.menu
    ? await wordpressMenu(plan, { read, send, hint: recipes.wpNav, lang: short })
    : null
  if (target && !target.ok) return target.answer
  const body = wordpressBody(recipes.wpMarkup, plan)
  if (!body.pinned && (await wordpressTemplateTitles(read)) === false)
    body.markup = `${wordpressTitleBlock(plan)}\n${body.markup}`
  const applyId = mint()
  const made = await write('content.update', {
    kind: 'post',
    fields: {
      post_type: 'page',
      post_title: plan.title,
      post_name: plan.slug,
      post_status: 'publish',
      post_content: body.markup
    },
    apply_id: applyId
  })
  if (!isRecord(made) || made.ok !== true) return made
  if (positive(made.id) === 0) return noEntry(plan)
  const id = positive(made.id)
  const slug =
    typeof made.stored?.post_name === 'string' && made.stored.post_name !== ''
      ? made.stored.post_name
      : plan.slug
  const path = `${lang.other ? `/${short}` : ''}/${slug}/`
  /** @type {string[]} */
  const notes = body.pinned ? [] : [pageText('plainNote')]
  const undo = async (/** @type {string} */ why) => {
    await write('apply.revert', { apply_id: applyId })
    return refuse('WRITE_FAILED', pageText('menuUndoneError', { why }), pageText('menuUndoneNext'))
  }
  if (lang.other) {
    const filed = await write('content.language', { id, lang: short, apply_id: applyId })
    if (!isRecord(filed) || filed.ok !== true)
      return undo(String(filed?.error ?? filed?.code ?? 'its language'))
  }
  /** @type {Record<string, unknown> | null} */
  let entry = null
  if (target && target.ok) {
    const got = await read('content.get', { kind: 'post', id: target.id })
    const raw = isRecord(got) && got.ok === true ? got.item?.post_content : null
    if (typeof raw !== 'string') return undo('the menu could not be read again')
    const links = navLinks(raw)
    const at = target.after ? links.find((l) => sameLabel(l.label, target.after)) : null
    if (target.after && !at) return undo(`"${target.after}" left the menu`)
    const link = `<!-- wp:navigation-link ${blockAttrs({ label: plan.title, type: 'page', id, url: path, kind: 'post-type' })} /-->`
    const cut = at ? at.end : raw.replace(/\s+$/, '').length
    const after = `${raw.slice(0, cut)}\n${link}${raw.slice(cut)}`
    const wrote = await write('content.update', {
      kind: 'post',
      id: target.id,
      fields: { post_content: after },
      apply_id: applyId
    })
    if (!isRecord(wrote) || wrote.ok !== true) return undo(String(wrote?.error ?? wrote?.code ?? 'refused'))
    // The header's own row of links, when the theme draws its desktop header from blocks of its own.
    const row = await wordpressHeaderRow(read, {
      navId: target.id,
      labels: links.map((l) => l.label),
      before: links.filter((l) => l.end <= cut).map((l) => l.label),
      title: plan.title,
      path
    })
    if (row !== null) {
      const put = await write('content.update', {
        kind: 'templatePart',
        key: 'header',
        fields: { content: row },
        apply_id: applyId
      })
      if (!isRecord(put) || put.ok !== true)
        return undo(String(put?.message ?? put?.error ?? put?.code ?? 'the header row was refused'))
    }
    entry = {
      menu: target.title,
      label: plan.title,
      ...(target.after ? { after: target.after } : { at: 'end' }),
      ...(row !== null ? { header: "its link is also in the header part's own row of links" } : {})
    }
  }
  return {
    ok: true,
    page: { id, title: plan.title, path, ...(lang.locale ? { locale: lang.locale } : {}) },
    ...(entry ? { menu: entry } : {}),
    apply_id: applyId,
    notes,
    home: lang.other ? `/${short}/` : '/',
    undo: `apply.revert {apply_id:"${applyId}"} takes the page and its menu link${entry?.header ? 's' : ''} back`
  }
}

// ── Joomla ─────────────────────────────────────────────────────────────────────────────────────

/**
 * A Joomla language tag for a locale the call or the site names: `ru` → the site's `ru-RU`.
 * @param {string | null} locale
 * @param {string[]} tags - the tags the site's rows carry
 */
const joomlaTag = (locale, tags) => {
  if (locale === null) return null
  const exact = tags.find((t) => t.toLowerCase() === locale.toLowerCase().replace('_', '-'))
  return exact ?? tags.find((t) => languageOf(t) === languageOf(locale)) ?? null
}

/**
 * Make the page on Joomla: its article, its menu item, and the move that puts it after the item named
 * — three writes under ONE apply id. The article joins the category of the page it follows (that
 * menu item's article), else the one the quickstart's map names for its language.
 * @param {PagePlan} plan
 * @param {{ recipes: Recipes, read: Door, send: Door, write: Door, mint: () => string,
 *   lang: { locale: string | null, other: boolean } }} io
 */
async function createOnJoomla(plan, { recipes, read, send, write, mint, lang }) {
  const recipe = recipes.joomla ?? {}
  const recipeMenu = recipes.joomlaMenu ?? {}
  /** @type {Record<string, any>[]} */
  const items = []
  if (plan.menu)
    for (let n = 0; n < MENU_ITEM_PAGES_MAX; n += 1) {
      const got = await send('content.list', { kind: 'menuItem', limit: 200, offset: n * 200 })
      if (!isRecord(got) || got.ok !== true || !Array.isArray(got.items)) return got
      items.push(...got.items.filter(isRecord))
      if (got.items.length < 200) break
    }
  const tags = [
    ...new Set(
      [recipe.language, ...items.map((r) => r.language)].filter((t) => typeof t === 'string' && t !== '*')
    )
  ]
  // The language the call names, else the one the map's recipe writes, else the site's default.
  const known = lang.other
    ? joomlaTag(lang.locale, tags)
    : typeof recipe.language === 'string'
      ? recipe.language
      : joomlaTag(lang.locale, tags)
  if (lang.other && known === null)
    return refuse(
      'BAD_PARAMS',
      pageText('languageError', { locale: plan.locale }),
      pageText('languageNext', { locales: tags.join(', ') }),
      { param: 'locale' }
    )
  /** @type {Record<string, any> | null} */
  let sibling = null
  /** @type {string | null} */
  let menutype = null
  if (plan.menu) {
    const menu = plan.menu
    const live = items.filter(
      (r) =>
        String(r.published) === '1' &&
        String(r.client_id ?? '0') === '0' &&
        r.menutype !== '' &&
        r.type !== ''
    )
    const ofLanguage = known ? live.filter((r) => r.language === known || r.language === '*') : live
    const named = (/** @type {Record<string, any>[]} */ list) =>
      menu.name
        ? list.filter(
            (r) =>
              sameLabel(r.menutype, menu.name) || foldForMatch(r.menutype).includes(foldForMatch(menu.name))
          )
        : list
    const menusOf = (/** @type {Record<string, any>[]} */ list) => {
      /** @type {Map<string, string[]>} */
      const by = new Map()
      for (const r of list) by.set(r.menutype, [...(by.get(r.menutype) ?? []), String(r.title)])
      return [...by].slice(0, 8).map(([name, labels]) => ({ name, labels: labels.slice(0, 8) }))
    }
    if (menu.after) {
      let pool = named(ofLanguage).filter((r) => sameLabel(r.title, menu.after))
      if (pool.length > 1 && typeof recipeMenu.menutype === 'string') {
        const own = pool.filter((r) => r.menutype === recipeMenu.menutype)
        if (own.length > 0) pool = own
      }
      const types = [...new Set(pool.map((r) => r.menutype))]
      if (pool.length === 0)
        return refuse(
          'NOT_FOUND',
          pageText('menuNotFoundError', { after: menu.after }),
          pageText('menuNotFoundNext'),
          {
            menus: menusOf(named(ofLanguage))
          }
        )
      if (types.length > 1 || pool.length > 1)
        return refuse(
          'AMBIGUOUS',
          pageText('menuAmbiguousError', { after: menu.after, n: types.length, list: types.join(', ') }),
          pageText('menuAmbiguousNext', { after: menu.after }),
          { menus: menusOf(pool) }
        )
      sibling = pool[0]
      menutype = sibling.menutype
    } else {
      const types = [...new Set(named(ofLanguage).map((r) => r.menutype))]
      const own = typeof recipeMenu.menutype === 'string' && types.includes(recipeMenu.menutype) && !menu.name
      if (types.length === 1 || own) menutype = own ? recipeMenu.menutype : types[0]
      else
        return refuse(
          'AMBIGUOUS',
          pageText('menuUnnamedError', { n: types.length, list: types.join(', ') }),
          pageText('menuUnnamedNext'),
          { menus: menusOf(named(ofLanguage)) }
        )
    }
  }
  // Unknown so far (no map, no locale): the language of the page it follows.
  const language = known ?? (sibling && typeof sibling.language === 'string' ? sibling.language : '*')
  // The category: the one the page it follows sits in, read off that page's own article.
  let catid = 0
  const article = sibling ? /view=article&id=(\d+)/.exec(String(sibling.link ?? ''))?.[1] : undefined
  if (article) {
    const got = await read('content.get', { kind: 'article', id: Number(article) })
    if (
      isRecord(got) &&
      got.ok === true &&
      isRecord(got.item) &&
      (got.item.language === language || language === '*')
    )
      catid = positive(got.item.catid)
  }
  if (catid === 0 && (recipe.language === language || recipe.language === undefined))
    catid = positive(recipe.catid)
  if (catid === 0)
    return refuse('NOT_FOUND', pageText('noCategoryError', { lang: language }), pageText('noCategoryNext'))
  const body = joomlaBody(typeof recipe.fulltext === 'string' ? recipe.fulltext : null, plan)
  const applyId = mint()
  const made = await write('content.update', {
    kind: 'article',
    id: 0,
    fields: {
      title: plan.title,
      alias: plan.slug,
      catid,
      state: 1,
      language,
      // 🔒 The component inserts the row whole: an article with no `introtext` is refused ("Field
      // 'introtext' doesn't have a default value", the D bench's Joomla run, 05/10/2026).
      introtext: '',
      fulltext: body.html
    },
    apply_id: applyId
  })
  if (!isRecord(made) || made.ok !== true) return made
  if (positive(made.id) === 0) return noEntry(plan)
  const articleId = positive(made.id)
  /** @type {string[]} */
  const notes = body.pinned ? [] : [pageText('plainNote')]
  const undo = async (/** @type {string} */ why) => {
    await write('apply.revert', { apply_id: applyId })
    return refuse('WRITE_FAILED', pageText('menuUndoneError', { why }), pageText('menuUndoneNext'))
  }
  let path = null
  let home = '/'
  let joomlaMenuItemId = 0
  /** @type {Record<string, unknown> | null} */
  let entry = null
  if (menutype !== null) {
    const parent = sibling && positive(sibling.parent_id) > 1 ? positive(sibling.parent_id) : null
    const style = await joomlaPageStyle(send, items, sibling, menutype, language)
    const item = await write('content.update', {
      kind: 'menuItem',
      id: 0,
      fields: {
        title: plan.title,
        alias: plan.slug,
        menutype,
        type: 'component',
        link: `index.php?option=com_content&view=article&id=${articleId}`,
        published: 1,
        language,
        ...(parent ? { parent_id: parent } : {}),
        ...(style > 0 ? { template_style_id: style } : {})
      },
      apply_id: applyId
    })
    if (!isRecord(item) || item.ok !== true || positive(item.id) === 0)
      return undo(String(item?.message ?? item?.error ?? item?.code ?? 'refused'))
    const itemId = positive(item.id)
    joomlaMenuItemId = itemId
    if (sibling) {
      const moved = await write('content.update', {
        kind: 'menuItem',
        id: itemId,
        fields: { move_after: positive(sibling.id) },
        apply_id: applyId
      })
      if (!isRecord(moved) || moved.ok !== true)
        return undo(String(moved?.message ?? moved?.error ?? 'the move'))
    }
    const own =
      typeof item.stored?.path === 'string' && item.stored.path !== '' ? item.stored.path : plan.slug
    // The language prefix the item it follows is served under (`/en/services` → `/en/`).
    const prefix = language !== '*' ? await joomlaPrefix(send, language) : ''
    path = `${prefix}/${own}`
    home = `${prefix}/`
    entry = {
      menu: menutype,
      label: plan.title,
      ...(sibling ? { after: String(sibling.title) } : { at: 'end' })
    }
  }
  return {
    ok: true,
    page: { id: articleId, title: plan.title, ...(path ? { path } : {}), locale: language },
    ...(entry ? { menu: entry } : {}),
    apply_id: applyId,
    notes,
    home,
    ...(entry ? { joomlaMenuItemId } : {}),
    undo: `apply.revert {apply_id:"${applyId}"} takes the article${entry ? ' and its menu item' : ''} back`
  }
}

/**
 * The path prefix Joomla serves a language under (`/en`), when the site serves more than one: the
 * language filter puts each content language's `sef` in front of its pages. Empty for one language.
 * @param {Door} send
 * @param {string} tag
 */
async function joomlaPrefix(send, tag) {
  const got = await send('content.list', { kind: 'language', limit: 50 })
  if (!isRecord(got) || got.ok !== true || !Array.isArray(got.items)) return ''
  const live = got.items.filter((r) => isRecord(r) && String(r.published) === '1')
  if (live.length < 2) return ''
  const own = live.find((r) => r.lang_code === tag)
  return own && typeof own.sef === 'string' && own.sef !== '' ? `/${own.sef}` : ''
}

/** A menu item that opens one article: `index.php?option=com_content&view=article&id=N`. */
const ARTICLE_LINK = /^index\.php\?option=com_content&view=article&id=\d+(&|$)/

/**
 * The template style a new article page's menu item takes: the one this site's own article pages wear.
 *
 * 🔒 NEVER LEFT TO JOOMLA'S DEFAULT BLINDLY. An item written with no style (`template_style_id` 0) renders
 * in the site's DEFAULT style, and a template may make its home layout the default: on a tracy-base j6
 * site (dskeepjo, 10/10/2026) the default is "Tracy — base · Home", whose layout prints no article
 * area, so the new "Dịch vụ" page answered 200 with its menu link and none of its words, while every
 * article page of the site wore "Inner" or "No sidebar". So the site's own article pages say which
 * style a content page wears: the page it follows first, then the others of its menu, then any — up to
 * {@link STYLE_SAMPLES_MAX} that are not a home page, each read whole (`content.get`), since a list row
 * carries neither `template_style_id` nor `home`. The style most of them wear wins (the page it
 * follows among equals). 0 — the default — when they wear the default, when the site has no other
 * article page, or when none can be read: then the default is all that is known.
 * @param {Door} send
 * @param {Record<string, any>[]} items - the site's menu items, as `content.list` listed them
 * @param {Record<string, any> | null} sibling - the item the new one follows
 * @param {string} menutype
 * @param {string} language
 * @returns {Promise<number>}
 */
async function joomlaPageStyle(send, items, sibling, menutype, language) {
  const pages = items.filter(
    (r) =>
      String(r.published) === '1' &&
      String(r.client_id ?? '0') === '0' &&
      ARTICLE_LINK.test(String(r.link ?? '')) &&
      (language === '*' || r.language === language || r.language === '*')
  )
  const rank = (/** @type {Record<string, any>} */ r) =>
    sibling && positive(r.id) === positive(sibling.id) ? 0 : r.menutype === menutype ? 1 : 2
  const order = pages.map((r, k) => ({ r, k })).sort((a, b) => rank(a.r) - rank(b.r) || a.k - b.k)
  /** @type {Map<number, number>} style → how many of the pages read wear it, in the order first seen */
  const worn = new Map()
  let counted = 0
  // A site has one home page per language: one read more than the samples covers it.
  for (const { r } of order.slice(0, STYLE_SAMPLES_MAX + 1)) {
    if (counted === STYLE_SAMPLES_MAX) break
    const got = await send('content.get', { kind: 'menuItem', id: positive(r.id) })
    const row = isRecord(got) && got.ok === true && isRecord(got.item) ? got.item : null
    if (row === null || String(row.home ?? '0') === '1') continue
    const style = positive(row.template_style_id)
    worn.set(style, (worn.get(style) ?? 0) + 1)
    counted += 1
  }
  let best = 0
  let most = 0
  for (const [style, n] of worn)
    if (n > most) {
      best = style
      most = n
    }
  return best
}

// ── EmDash ─────────────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {(tool: string, args: Record<string, unknown>) => Promise<any>} EmdashDoor
 *   One `tracy_emdash` tool call, through the road that tool takes (`runEmdashTool`).
 */

/**
 * Make the page on EmDash: an entry of the pages collection, published, then the menu with its row
 * added after the item named — the menu read first, so a call that cannot place the row writes nothing.
 * @param {PagePlan} plan
 * @param {{ recipes: Recipes, emdash: EmdashDoor, lang: { locale: string | null, other: boolean } }} io
 */
async function createOnEmdash(plan, { recipes, emdash: door, lang }) {
  // `tracy_emdash` answers `{ok, site, tool, result}`: the tool's own answer is its `result`.
  /** @type {EmdashDoor} */
  const emdash = async (tool, args) => {
    const got = await door(tool, args)
    return isRecord(got) && got.ok === true && isRecord(got.result) ? { ok: true, ...got.result } : got
  }
  const recipe = recipes.emdash ?? {}
  const collection = typeof recipe.collection === 'string' ? recipe.collection : 'pages'
  const data = isRecord(recipe.data) ? recipe.data : {}
  const field =
    Object.keys(data).find((k) => typeof data[k] === 'string' && data[k].includes(QUESTION)) ?? 'content'
  const short = languageOf(lang.locale)
  const locale = lang.other && lang.locale ? { locale: lang.locale } : {}
  /** @type {{ name: string, items: Record<string, any>[], at: number } | null} */
  let menu = null
  if (plan.menu) {
    const want = plan.menu
    const names = want.name
      ? [want.name]
      : recipes.emdashMenu
        ? [recipes.emdashMenu]
        : await emdashMenus(emdash, locale)
    /** @type {{ name: string, items: Record<string, any>[] }[]} */
    const read = []
    for (const name of names.slice(0, EMDASH_MENUS_MAX)) {
      const got = await emdash('menu_get', { name, ...locale })
      if (isRecord(got) && isRecord(got.menu) && Array.isArray(got.menu.items))
        read.push({ name, items: got.menu.items.filter(isRecord) })
      else if (names.length === 1) return got
    }
    const holding = want.after
      ? read.filter((m) => m.items.some((it) => sameLabel(it.label, want.after)))
      : read
    if (want.after && holding.length === 0)
      return refuse(
        'NOT_FOUND',
        pageText('menuNotFoundError', { after: want.after }),
        pageText('menuNotFoundNext'),
        {
          menus: read.map((m) => ({
            name: m.name,
            labels: m.items.slice(0, 8).map((it) => String(it.label))
          }))
        }
      )
    if (holding.length !== 1)
      return refuse(
        'AMBIGUOUS',
        want.after
          ? pageText('menuAmbiguousError', {
              after: want.after,
              n: holding.length,
              list: holding.map((m) => m.name).join(', ')
            })
          : pageText('menuUnnamedError', { n: holding.length, list: holding.map((m) => m.name).join(', ') }),
        want.after ? pageText('menuAmbiguousNext', { after: want.after }) : pageText('menuUnnamedNext'),
        {
          menus: holding.map((m) => ({
            name: m.name,
            labels: m.items.slice(0, 8).map((it) => String(it.label))
          }))
        }
      )
    const chosen = holding[0]
    const at = want.after ? chosen.items.findIndex((it) => sameLabel(it.label, want.after)) : -1
    menu = { name: chosen.name, items: chosen.items, at }
  }
  const body = emdashBody(typeof data[field] === 'string' ? data[field] : null, plan)
  const made = await emdash('content_create', {
    collection,
    slug: plan.slug,
    status: 'published',
    data: { title: plan.title, [field]: body.markdown },
    ...locale
  })
  const entryOf = isRecord(made) && isRecord(made.entry) ? made.entry : null
  if (!entryOf || entryOf.id === null || entryOf.id === undefined)
    return isRecord(made) && made.ok === false ? made : noEntry(plan)
  const slug = typeof entryOf.slug === 'string' && entryOf.slug !== '' ? entryOf.slug : plan.slug
  const path = `${lang.other && short ? `/${short}` : ''}/${slug}`
  /** @type {string[]} */
  const notes = body.pinned ? [] : [pageText('plainNote')]
  if (made.live !== true && typeof made.next === 'string') notes.push(made.next)
  /** @type {Record<string, unknown> | null} */
  let entry = null
  if (menu) {
    const items = insertAfter(menu.items, menu.at, { label: plan.title, type: 'custom', customUrl: path })
    const set = await emdash('menu_set_items', { name: menu.name, ...locale, items })
    if (!isRecord(set) || set.ok === false)
      return refuse(
        'PARTIAL',
        pageText('menuPartialError', { path, why: String(set?.error ?? set?.code ?? 'refused') }),
        pageText('menuPartialNext', { menu: menu.name }),
        { page: { id: entryOf.id, title: plan.title, path, collection } }
      )
    entry = {
      menu: menu.name,
      label: plan.title,
      ...(menu.at >= 0 ? { after: String(menu.items[menu.at].label) } : { at: 'end' })
    }
  }
  return {
    ok: true,
    page: {
      id: entryOf.id,
      title: plan.title,
      path,
      collection,
      ...(lang.locale ? { locale: lang.locale } : {})
    },
    ...(entry ? { menu: entry } : {}),
    notes,
    home: lang.other && short ? `/${short}/` : '/',
    undo: `tracy_emdash content_delete {collection:"${collection}", id:"${entryOf.id}"}${entry ? `, then menu_set_items {name:"${menu?.name}"} with every item but "${plan.title.slice(0, 40)}"` : ''}`
  }
}

/**
 * The menus of an EmDash site, by name (`menu_list`), when nothing names the one meant.
 * @param {EmdashDoor} emdash
 * @param {Record<string, unknown>} locale
 * @returns {Promise<string[]>}
 */
async function emdashMenus(emdash, locale) {
  const got = await emdash('menu_list', { ...locale })
  /** @type {unknown[]} */
  const rows = Array.isArray(got?.items) ? got.items : Array.isArray(got) ? got : []
  return rows.filter(isRecord).flatMap((r) => (typeof r.name === 'string' ? [r.name] : []))
}

/**
 * Menu items in menu_set_items's own shape, with one row put after item `at` and every child of that
 * item (`parentIndex` after the insertion moved by one), at its level; `at` −1 puts it last.
 * @param {Record<string, any>[]} items
 * @param {number} at
 * @param {Record<string, unknown>} row
 */
export function insertAfter(items, at, row) {
  let k = at < 0 ? items.length : at + 1
  if (at >= 0) {
    // past the item's own children (and theirs): a parent comes before its children in this shape
    const inside = new Set([at])
    while (k < items.length && inside.has(Number(items[k].parentIndex ?? -1))) inside.add(k++)
  }
  const parent = at >= 0 && items[at].parentIndex !== undefined ? items[at].parentIndex : undefined
  const moved = items.map((it) =>
    it.parentIndex !== undefined && it.parentIndex >= k ? { ...it, parentIndex: it.parentIndex + 1 } : it
  )
  return [
    ...moved.slice(0, k),
    { ...row, ...(parent !== undefined ? { parentIndex: parent } : {}) },
    ...moved.slice(k)
  ]
}

// ── Checking the page ──────────────────────────────────────────────────────────────────────────

/** How much of a part's words a read of the page looks for: enough to be that part, not a whole paragraph. */
const PROBE_WIDTH = 60

/**
 * The words of the new page's body a read looks for, folded as the page's units are: each part's
 * text past any mark it opens with, up to the next mark Markdown or HTML could print differently, at
 * most {@link PROBE_WIDTH} characters and cut at a word; each part's title when no part has text.
 * Empty when no part leaves three characters to look for — then the read can only tell that the page
 * answers.
 * @param {PagePlan} plan
 * @returns {string[]}
 */
function bodyProbes(plan) {
  const probe = (/** @type {string} */ s) => {
    const folded = foldForMatch(s.replace(/^[\s*_`#<>[\]|~\\-]+/, '').split(/[*_`#<>[\]|~\\]/)[0])
    const cut = folded.length > PROBE_WIDTH ? folded.slice(0, PROBE_WIDTH).replace(/\s+\S*$/, '') : folded
    return cut.trim()
  }
  const texts = plan.items.map((it) => probe(it.text)).filter((p) => p.length >= 3)
  return texts.length > 0
    ? texts
    : plan.items.flatMap((it) => (it.title ? [probe(it.title)] : [])).filter((p) => p.length >= 3)
}

/**
 * The widths a menu link is looked for at: the viewports `page.look {style}` emulates, as a sentence
 * names them. Desktop first: a link a desktop visitor cannot see is not "in the menu" to them.
 */
const MENU_WIDTHS = Object.freeze([
  Object.freeze({ viewport: 'desktop', says: 'desktop 1440' }),
  Object.freeze({ viewport: 'mobile', says: 'phone 390' })
])

/** A closed panel a menu opens with its button: WordPress's overlay, a modal, an off-canvas, a drawer, a dropdown. */
const MENU_PANEL = /responsive-container|modal|off-?canvas|drawer|dropdown|collapse/i

/**
 * @typedef {(req: Record<string, unknown>, path: string) => Promise<any>} MenuSeen
 *   One read of one element in the site container's own browser (`page.look {style}`'s, through the
 *   same gate): `{ok:true, payload:{info:{el, how, hidden, chrome}}}`, `{ok:true, payload:{error}}` for
 *   an element the page does not hold, anything else when the browser could not read the page.
 */

/**
 * Where a visitor SEES the new menu link: for each of {@link MENU_WIDTHS}, whether the first element
 * that shows the label as its own words is a link of the site's header or footer, shown — read on the
 * site's home page, where the page's own h1 (the same words) is not. Null when the browser could not
 * read the page at one of them.
 *
 * 🔒 IN THE HTML IS NOT SHOWN. On dskeepwp (10/10/2026) the new link stood in tracy-base's
 * navigation block, which the theme's CSS hides above 781px (its desktop header is a row of links
 * of its own), and the receipt said "its menu link shows" because the link was in the page's markup.
 * The browser's own answer — `display:none` on an ancestor, no size — is the only one that says what
 * a visitor sees, so the width it shows at is said, and a desktop that does not show it is said.
 * @param {MenuSeen} seen
 * @param {string} home
 * @param {string} label
 * @returns {Promise<{ says: string, shown: boolean, behind: boolean, why: string }[] | null>}
 */
async function menuLinkSeen(seen, home, label) {
  /** @type {{ says: string, shown: boolean, behind: boolean, why: string }[]} */
  const out = []
  for (const w of MENU_WIDTHS) {
    /** @type {any} */
    let got
    try {
      got = await seen({ text: label, nth: 0, props: ['display'], viewport: w.viewport, set: true }, home)
    } catch {
      got = null
    }
    if (!isRecord(got) || got.ok !== true || !isRecord(got.payload)) return null
    const info = isRecord(got.payload.info) ? got.payload.info : null
    const link =
      info !== null &&
      /^<a\b/.test(String(info.el ?? '')) &&
      info.chrome === true &&
      (info.how === 'exact' || info.how === 'case')
    const why =
      info === null
        ? 'not on the page'
        : !link
          ? 'the words found there are not a header or footer link'
          : info.hidden === false
            ? ''
            : String(info.hidden)
    const shown = link && info?.hidden === false
    // Hidden inside a closed overlay, drawer or dropdown: the menu holds it behind its button.
    const behind = link && !shown && MENU_PANEL.test(why)
    out.push({ says: behind ? `${w.says} behind its menu button` : w.says, shown, behind, why })
  }
  return out
}

/**
 * What a read of the new page shows: its BODY — the words of one of its parts in the page's main area,
 * outside a menu — and, when a menu entry was written, where its link shows (`menuLinkSeen`; without a
 * browser, only that the HTML holds it). Best effort: a page cache or a slow start says "not yet",
 * never fails the call that wrote.
 *
 * 🔒 THE TITLE IS NOT THE PROOF. Every page of the site prints the new menu link, and the link carries
 * the title: on dskeepjo (10/10/2026) a Joomla page whose layout printed no article area passed as
 * "shown" on that link alone while a visitor read nothing of it. Only the page's own words in its main
 * area say the page shows; a page that answers without them is said as such (`bodyHidden`), and the
 * receipt then does not tell the customer the page is live.
 * @param {{ pageHtml: (path: string) => Promise<any>, menuSeen?: MenuSeen }} io
 * @param {string} path
 * @param {string} home - the site's home page in the page's language, where the menu link is looked for
 * @param {PagePlan} plan
 * @param {boolean} menu
 * @returns {Promise<{ lines: string[], body: 'shown' | 'hidden' | 'unknown', desktop: 'shown' | 'hidden' | 'unknown' }>}
 */
async function verifyPage({ pageHtml, menuSeen }, path, home, plan, menu) {
  /** @type {any} */
  let got
  try {
    got = await pageHtml(path)
  } catch {
    got = null
  }
  if (!isRecord(got) || got.ok !== true || typeof got.html !== 'string')
    return { lines: [pageText('notChecked')], body: 'unknown', desktop: 'unknown' }
  const status = typeof got.status === 'number' ? got.status : 200
  const units = renderedUnits(got.html).units
  const probes = bodyProbes(plan)
  const answers = status < 400 && units.some((u) => u.lower.includes(foldForMatch(plan.title)))
  const body =
    status < 400 &&
    (probes.length === 0
      ? answers
      : units.some(
          (u) => u.region === 'main' && !u.inNav && !u.hidden && probes.some((p) => u.lower.includes(p))
        ))
  const lines = [pageText(body ? 'shownOn' : answers ? 'bodyHidden' : 'notShownYet', { path })]
  /** @type {'shown' | 'hidden' | 'unknown'} */
  let desktop = 'unknown'
  if (menu) {
    const inHtml = units.some((u) => u.inNav && sameLabel(u.cased, plan.title))
    const seen = inHtml && menuSeen ? await menuLinkSeen(menuSeen, home, plan.title) : null
    if (!inHtml) lines.push(pageText('menuNotShownYet', { path }))
    else if (seen === null) lines.push(pageText('menuInHtml', { path }))
    else {
      const at = seen.filter((w) => w.shown || w.behind).map((w) => w.says)
      const widths = at.length > 0 ? at.join(' and ') : 'no width checked'
      // A desktop whose menu is a button (an overlay at every width) holds the link where it holds every other.
      const onDesktop = seen[0].shown || seen[0].behind
      desktop = onDesktop ? 'shown' : 'hidden'
      lines.push(
        onDesktop
          ? pageText('menuShown', { home, widths })
          : pageText('menuDesktopHidden', { home, why: seen[0].why, widths })
      )
    }
  }
  return { lines, body: body ? 'shown' : answers ? 'hidden' : 'unknown', desktop }
}

/**
 * The route Joomla actually serves for a new page is the href it renders for the new menu item.
 * Its path depends on the site's URL rewriting settings, so the stored menu path is not sufficient.
 * @param {(path: string) => Promise<any>} pageHtml
 * @param {string} home
 * @param {string | null | undefined} siteOrigin
 * @param {string} label
 * @param {number} itemId
 * @returns {Promise<string | null>}
 */
async function joomlaMenuHref(pageHtml, home, siteOrigin, label, itemId) {
  let got
  try {
    got = await pageHtml(home)
  } catch {
    return null
  }
  if (!isRecord(got) || got.ok !== true || typeof got.html !== 'string') return null
  const units = renderedUnits(got.html).units
  for (const unit of units) {
    if (!unit.inNav || !sameLabel(unit.cased, label)) continue
    const item = unit.chain.find(
      (element) =>
        element.tag === 'li' && new RegExp(`(?:^|\\s)item-${itemId}(?:\\s|$)`).test(element.cls ?? '')
    )
    if (!item) continue
    const href = unit.chain.find((element) => element.tag === 'a')?.href
    if (!href) continue
    try {
      const base = new URL(home, siteOrigin || 'https://joomla.invalid')
      const target = new URL(href, base)
      if (target.origin !== base.origin) continue
      return `${target.pathname}${target.search}${target.hash}`
    } catch {
      continue
    }
  }
  return null
}

// ── The road ───────────────────────────────────────────────────────────────────────────────────

/**
 * Run one `page.create` call on this conversation's site.
 *
 * `send`: the raw relay (no guard) — the describe and the lists, read whole, and the Joomla article pages a
 * new page's template style is read from (`joomlaPageStyle`). `siteCall`: `runSiteCall`
 * for this site — every get a write is built from, and every write. `emdash`: one `tracy_emdash` tool
 * call through its own road. `mint`: this call's apply id (`memory.mint('page')`). `menuSeen`: one
 * element read in the site's own browser (`page.look {style}`'s), which says where the new menu link
 * shows; without it the answer only says the HTML holds it. `verify:false` skips the read of the new page.
 * @param {{ params: unknown, platform: string | null | undefined, send: Door, siteCall: Door,
 *   pageHtml: (path: string) => Promise<any>, siteOrigin?: string | null, mint: () => string, emdash?: EmdashDoor,
 *   menuSeen?: MenuSeen, verify?: boolean }} input
 * @returns {Promise<Record<string, unknown>>}
 */
export async function runPageCreate(input) {
  const planned = planPageCreate(input.params)
  if (planned.ok !== true) return planned
  const plan = /** @type {PagePlan} */ (planned)
  const platform = String(input.platform ?? '')
  if (platform !== 'wordpress' && platform !== 'joomla' && platform !== 'emdash')
    return {
      ok: false,
      code: 'NOT_ON_THIS_PLATFORM',
      error: `${PAGE_CREATE_CALL} is not built for this site's door.`,
      next: 'Make the page through the write this site describes, then its menu entry.'
    }
  const described = await input.send('content.read', { describe: true })
  const recipes = recipesOf(isRecord(described) && described.ok !== false ? described : {})
  const lang = languageFor(plan, recipes)
  if (lang === null)
    return refuse(
      'BAD_PARAMS',
      pageText('languageError', { locale: plan.locale }),
      pageText('languageNext', { locales: recipes.locales.join(', ') }),
      { param: 'locale' }
    )
  /** @type {Record<string, unknown>} */
  let out
  if (platform === 'emdash') {
    if (!input.emdash)
      return { ok: false, code: 'SITE_UNREACHABLE', error: 'The EmDash road is not available here.' }
    out = await createOnEmdash(plan, { recipes, emdash: input.emdash, lang })
  } else {
    const io = {
      recipes,
      read: input.siteCall,
      send: input.send,
      write: input.siteCall,
      mint: input.mint,
      lang
    }
    out = platform === 'wordpress' ? await createOnWordPress(plan, io) : await createOnJoomla(plan, io)
  }
  if (!isRecord(out) || out.ok !== true) return out
  const page = /** @type {Record<string, any>} */ (out.page)
  const menu = /** @type {Record<string, any> | undefined} */ (out.menu)
  const joomlaMenuItemId = positive(out.joomlaMenuItemId)
  const notes = /** @type {string[]} */ (out.notes ?? [])
  const home = typeof out.home === 'string' ? out.home : '/'
  if (platform === 'joomla' && menu && typeof page.path === 'string' && joomlaMenuItemId > 0) {
    const href = await joomlaMenuHref(input.pageHtml, home, input.siteOrigin, plan.title, joomlaMenuItemId)
    if (href) page.path = href
  }
  const verified =
    input.verify !== false && typeof page.path === 'string'
      ? await verifyPage(
          { pageHtml: input.pageHtml, ...(input.menuSeen ? { menuSeen: input.menuSeen } : {}) },
          page.path,
          home,
          plan,
          menu !== undefined
        )
      : null
  const where = menu ? (menu.after ? pageText('menuPlace', { after: menu.after }) : pageText('menuEnd')) : ''
  const { notes: _n, home: _h, joomlaMenuItemId: _j, ...rest } = out
  return {
    ...rest,
    ...(notes.length > 0 ? { notes } : {}),
    ...(verified ? { verified: verified.lines } : {}),
    // A page that answers without its own words is not "live" to the customer, and a menu link a desktop
    // visitor cannot see is not "in the menu" to them (`verifyPage`).
    next: pageText(
      verified?.body === 'hidden'
        ? 'receiptHidden'
        : verified?.desktop === 'hidden'
          ? 'receiptMenuHidden'
          : 'receipt',
      { path: page.path ?? `"${plan.title}"`, place: where }
    )
  }
}
