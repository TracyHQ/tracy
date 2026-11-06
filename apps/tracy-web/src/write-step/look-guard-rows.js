// The look guard over rows of the CMS (ADR 0044, decision 10): what `content.update` and `content.batch` may touch. A row's column or
// setting is closed unless it is listed here, so a new one fails by name. The settings of a row are judged by what changed from what
// was read of it, so a template's other settings, whatever they are, stay as they were and stay green.
import { fallbackBlocksIn, isFallbackBlock, withoutFallbackBlocks } from '../lib/printed-in-body.js'
import { HEAD_END, HEAD_START } from './brand-head-block.js'
import { videoBlockFor, videoBlockIn, withVideoBlock } from '../lib/empty-video-buttons.js'
import { isSelfLinkBlock, selfLinkBlockIn, withSelfLinkBlock } from '../lib/self-link-buttons.js'
import { cssFaults, stylesOf } from './look-guard-css.js'
import { hasMarkup, markupFaults } from './look-guard-markup.js'
import { NOT_A_POST } from './page-create-stage.js'
import { MARK } from './page-create-lines.js'
import { paramsOf } from './page-meta-write.js'

const WRITE = 9
const BRAND = 2
const ACCENT_MARK = 'id="tracy-ds-slot"'

/** What a page of the template may take in its settings: its words for search and sharing, and the plan closing its form. */
const MENU_PARAMS = new Set(['page_title', 'menu-meta_description', 'og_img', 'show_email_form'])
const ARTICLE_ATTRIBS = new Set(['article_page_title', 'og_img'])
// A created page's item also takes its on-page heading (`page_heading`, page-create-stage.js).
const CREATED_SETTINGS = new Set([...Object.keys(NOT_A_POST), 'menu_show', 'page_heading'])

const CREATED_FIELDS = {
  article: new Set([
    'title',
    'alias',
    'introtext',
    'fulltext',
    'metadesc',
    'state',
    'catid',
    'featured',
    'language',
    'access',
    'attribs',
    'note'
  ]),
  menuItem: new Set([
    'title',
    'alias',
    'menutype',
    'type',
    'link',
    'published',
    'language',
    'access',
    'note',
    'params'
  ]),
  category: new Set(['title', 'published', 'language', 'access', 'note'])
}
// `alias` is the address a kept page answers at: the route stage gives it the plan's slug (page-route-stage.js). An address
// restyles nothing, so it is open, and only as a slug, which can hold no markup and no other setting.
const TEMPLATE_FIELDS = {
  article: new Set(['metadesc', 'attribs', 'alias']),
  menuItem: new Set(['published', 'link', 'params', 'alias'])
}
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const ACCENT_FIELDS = new Set([
  'title',
  'module',
  'content',
  'position',
  'ordering',
  'published',
  'showtitle',
  'access',
  'language',
  'params'
])
const ACCENT_PARAMS = new Set(['prepare_content', 'layout', 'moduleclass_sfx', 'cache', 'style'])
const PHONE_LOGO = /\bimg\b/

/** The stated exception of the head block: it shows the phone menu's own picture, and a picture takes its own height. */
const phoneLogo = (rule, { prop, value }) =>
  PHONE_LOGO.test(rule.selector) &&
  ((prop === 'content' && /^url\(\/images\/[^)]+\)$/.test(value)) || (prop === 'height' && value === 'auto'))

const fault = (step, what, reason) => ({ step, what, reason })

/** Each setting of a JSON column that moved from what was read, unless it is open here. */
function settingFaults({ step = WRITE, what, next, held, open }) {
  const was = paramsOf(held)
  const now = paramsOf(next)
  const faults = []
  for (const name of new Set([...Object.keys(was), ...Object.keys(now)])) {
    if (String(was[name]) === String(now[name])) continue
    const reason = open(name, now[name])
    if (reason !== true)
      faults.push(
        fault(step, `${what} ${name}`, reason || `the setting ${name} is not open to the write step`)
      )
  }
  return faults
}

const settingsOpen = (state, created, listed) => (name, value) => {
  if (listed.has(name) || (created && CREATED_SETTINGS.has(name)))
    return hasMarkup(String(value)) ? `the setting ${name} holds markup` : true
  if (created && name === 'article_layout')
    return (
      state.layouts.has(value) ||
      `the layout ${value} is not one read from the template's own pages, so it is not a copy of the template's`
    )
  return false
}

/** A template article's full text may change by the picture fallback blocks alone (printed-stage.js); every other byte stays as read. */
function fallbackFaults(what, value, held) {
  if (typeof held !== 'string')
    return [fault(WRITE, what, 'the article was not read first, so a change of its text cannot be judged')]
  if (withoutFallbackBlocks(value) !== withoutFallbackBlocks(held))
    return [fault(WRITE, what, 'only a picture fallback block may change in the text of a template article')]
  const before = new Set(fallbackBlocksIn(held).map((b) => b.whole))
  return fallbackBlocksIn(value)
    .filter((b) => !before.has(b.whole) && !(isFallbackBlock(b.whole) && b.key.startsWith('images/')))
    .map((b) => fault(WRITE, what, `this is not the picture fallback block: ${b.whole.slice(0, 80)}`))
}

/** One row's fields. `created`: a row of a page the write step made, as the mark on it or this run says. */
function rowFaults(kind, id, fields, { state, created, kitNamed }) {
  const what = `${kind} ${id}`
  const listed = created ? CREATED_FIELDS[kind] : TEMPLATE_FIELDS[kind]
  const held = state.rows.get(`${kind}:${id}`)
  const faults = []
  for (const [name, value] of Object.entries(fields ?? {})) {
    if (kind === 'article' && name === 'fulltext' && !created) {
      faults.push(...fallbackFaults(`${what} fulltext`, String(value ?? ''), held?.fulltext))
      continue
    }
    if (kitNamed?.has(`${kind}-${id} ${name}`)) {
      if (hasMarkup(String(value)))
        faults.push(fault(WRITE, `${what} ${name}`, 'a setting slot holds words, with no markup'))
      continue
    }
    if (!listed?.has(name)) {
      faults.push(
        fault(WRITE, `${what} ${name}`, `the column ${name} of ${what} is not open to the write step`)
      )
      continue
    }
    if (name === 'params')
      faults.push(
        ...settingFaults({
          what: `${what} params`,
          next: value,
          held: held?.params,
          open: settingsOpen(state, created, MENU_PARAMS)
        })
      )
    else if (name === 'attribs')
      faults.push(
        ...settingFaults({
          what: `${what} attribs`,
          next: value,
          held: held?.attribs,
          open: settingsOpen(state, created, ARTICLE_ATTRIBS)
        })
      )
    else if (name === 'published' && !created && Number(value) !== 0)
      faults.push(fault(WRITE, `${what} published`, 'a template row can only be taken off, by the plan'))
    else if (name === 'alias' && !SLUG.test(String(value)))
      faults.push(
        fault(WRITE, `${what} alias`, 'an alias is a slug: lower case letters and digits joined by hyphens')
      )
    else if (name === 'note' && !String(value).startsWith(MARK))
      faults.push(fault(WRITE, `${what} note`, 'a row the write step makes carries its mark'))
    else if (name === 'introtext' || name === 'fulltext')
      for (const said of markupFaults(String(value), ''))
        faults.push(fault(6, `${what} ${name}`, `a created page's words: ${said}`))
    else if (hasMarkup(String(value)))
      faults.push(fault(WRITE, `${what} ${name}`, `the column ${name} holds markup`))
  }
  return faults
}

/** The head block between its markers: icons and the phone logo. */
function headFaults(inside, what) {
  const { blocks, rest } = stylesOf(inside)
  const faults = blocks.flatMap((b) =>
    cssFaults(b.css, { except: phoneLogo }).map((f) => fault(BRAND, `${what} head block`, f.reason))
  )
  for (const tag of rest.match(/<[^>]+>/g) ?? [])
    if (!/^<link\b[^>]*\brel="(?:shortcut icon|icon|apple-touch-icon)"[^>]*>$/i.test(tag))
      faults.push(fault(BRAND, `${what} head block`, `the head block holds ${tag.slice(0, 60)}`))
  return faults
}

/**
 * The empty video button block (ADR 0044, decision 27): it may hold exactly the rule for the selectors the kit names, or be
 * taken off. The rest of the module is judged without it, as the head block and the accent module always were.
 */
function videoBlockFaults(what, raw, heldRaw, selectors) {
  const block = videoBlockIn(raw)
  if (!block || block === videoBlockIn(heldRaw) || block === videoBlockFor(selectors)) return []
  return [
    fault(
      WRITE,
      `${what} empty video buttons`,
      'the empty video button block holds only the hide rule for the selectors the kit names'
    )
  ]
}

/**
 * The self link block (ADR 0044, decision 27, second use): it may hold only hide rules scoped to one page each, on the containers
 * the kit names, or be what the site held already.
 */
function selfLinkBlockFaults(what, raw, heldRaw, containers) {
  const block = selfLinkBlockIn(raw)
  if (!block || block === selfLinkBlockIn(heldRaw) || isSelfLinkBlock(block, containers)) return []
  return [
    fault(
      WRITE,
      `${what} self link buttons`,
      'the self link block holds only hide rules, one page each, on the containers the kit names'
    )
  ]
}

const withoutMarked = (text) => withSelfLinkBlock(withVideoBlock(text, null), null)

/** What a module's content may change: the accent style alone, or the head block with all around it as the site held it. */
function moduleContentFaults(id, content, { state }) {
  const what = `module ${id ?? '(new)'} content`
  const raw = String(content ?? '')
  const heldRaw = String(state.rows.get(`module:${id}`)?.content ?? '')
  const marked = [
    ...videoBlockFaults(what, raw, heldRaw, state.videoSelectors ?? []),
    ...selfLinkBlockFaults(what, raw, heldRaw, state.selfLinkContainers ?? [])
  ]
  const text = withoutMarked(raw)
  const held = withoutMarked(heldRaw)
  const touched = [raw, heldRaw].some((t) => videoBlockIn(t) || selfLinkBlockIn(t))
  // A write of the marked blocks alone: everything else of the module stays as the site held it.
  if (touched && text.trim() === held.trim()) return marked
  return [...marked, ...restFaults(text, held, what, state)]
}

/** The accent module, or the head block with all around it as the site held it. */
function restFaults(text, held, what, state) {
  if (text.includes(ACCENT_MARK)) {
    const { blocks, rest } = stylesOf(text)
    const faults = blocks.flatMap((b) =>
      cssFaults(b.css, { routes: state.routes }).map((f) => fault(BRAND, what, f.reason))
    )
    if (rest.trim())
      faults.push(
        fault(BRAND, what, `the accent module holds more than its style: ${rest.trim().slice(0, 60)}`)
      )
    return faults
  }
  const from = text.indexOf(HEAD_START)
  const to = text.indexOf(HEAD_END)
  if (from === -1 || to < from)
    return [
      fault(WRITE, what, 'only the accent module and the head block are open to a write of a whole module')
    ]
  const inside = text.slice(from + HEAD_START.length, to)
  const heldFrom = held.indexOf(HEAD_START)
  const heldTo = held.indexOf(HEAD_END)
  const heldOut =
    heldFrom !== -1 && heldTo > heldFrom
      ? held.slice(0, heldFrom) + held.slice(heldTo + HEAD_END.length)
      : held
  const faults = headFaults(inside, what)
  const around = text.slice(0, from) + text.slice(to + HEAD_END.length)
  const trim = (s) => s.trim()
  if (trim(around) === trim(heldOut)) return faults
  const now = stylesOf(around)
  const was = stylesOf(heldOut)
  for (const b of now.blocks)
    if (!was.blocks.some((w) => w.whole === b.whole))
      faults.push(...cssFaults(b.css, {}).map((f) => fault(BRAND, what, f.reason)))
  for (const said of markupFaults(now.rest, was.rest)) faults.push(fault(BRAND, what, said))
  return faults
}

function moduleFaults({ id, fields, state, kitNamed }) {
  const names = Object.keys(fields ?? {})
  if (names.length === 1 && kitNamed.has(`module-${id} ${names[0]}`))
    return rowFaults('module', id, fields, { state, created: false, kitNamed })
  if (!String(fields?.content ?? '').includes(ACCENT_MARK)) {
    const others = names.filter((n) => n !== 'content')
    if (others.length)
      return others.map((n) =>
        fault(
          WRITE,
          `module ${id ?? '(new)'} ${n}`,
          `the column ${n} of a module is not open to the write step`
        )
      )
    return moduleContentFaults(id, fields?.content, { state })
  }
  const faults = moduleContentFaults(id, fields.content, { state })
  for (const name of names)
    if (!ACCENT_FIELDS.has(name))
      faults.push(
        fault(BRAND, `module ${id ?? '(new)'} ${name}`, `the accent module does not take the column ${name}`)
      )
  if (fields.params !== undefined) {
    const params = paramsOf(fields.params)
    for (const name of Object.keys(params))
      if (!ACCENT_PARAMS.has(name) || (name === 'moduleclass_sfx' && params[name] !== ''))
        faults.push(
          fault(
            BRAND,
            `module ${id ?? '(new)'} params ${name}`,
            `the accent module does not take the setting ${name}`
          )
        )
  }
  return faults
}

/** @returns {{ step: number, what: string, reason: string }[]} */
export function updateFaults(params, state, kitNamed) {
  const { kind, id, fields } = params ?? {}
  if (kind === 'module') return moduleFaults({ id, fields, state, kitNamed })
  if (kind === 'moduleAssignment') {
    const on = Object.keys(fields ?? {}).join() === 'menuids' && fields.menuids === '[0]'
    return on && state.accents.has(Number(id))
      ? []
      : [fault(WRITE, `moduleAssignment ${id}`, 'only the accent module is assigned, to every page')]
  }
  const created =
    state.created.has(`${kind}:${id}`) || String(state.rows.get(`${kind}:${id}`)?.note ?? '').startsWith(MARK)
  return rowFaults(kind, id, fields, { state, created, kitNamed })
}

/** @returns {{ step: number, what: string, reason: string }[]} */
export function batchFaults(params, state) {
  return (Array.isArray(params?.operations) ? params.operations : []).flatMap(({ kind, id, fields }) => {
    if (!CREATED_FIELDS[kind])
      return [fault(WRITE, `content.batch ${kind}`, `a batch may make a page's rows, and not a ${kind}`)]
    if (Number(id) !== 0)
      return [fault(WRITE, `content.batch ${kind} ${id}`, 'a batch makes rows; it does not change one')]
    const faults = rowFaults(kind, 'new', fields, { state, created: true })
    if (!String(fields?.note ?? '').startsWith(MARK))
      faults.push(fault(WRITE, `${kind} new note`, 'a row the write step makes carries its mark'))
    return [...new Map(faults.map((f) => [`${f.what} ${f.reason}`, f])).values()]
  })
}
