/**
 * The residue sweep's calls that no single site-tool action is: a template button or link sent to its real page
 * (`link`) and a template picture replaced by one of the business's own (`image`). The plan stays pure
 * (`apps/tracy-web/src/opportunities-build/residue-sweep.js`); this resolves each call per platform through the
 * doors an agent already has — `content.get` then `content.update` of the record that holds it, or EmDash's own
 * `content_get` / `content_update` and `menu_get` / `menu_set_items` — so every guard of an agent's call holds.
 *
 * 🔒 THE RECORD'S OWN FIELD, NEVER THE RENDERED PAGE (24/10/2026). The replace job's `href:true` writes only a link
 * the theme prints; a link kept in a record (a page's content, a navigation block, a menu item) is that record's
 * (`rendered-words.mjs` `hrefStoredNext`). A call whose address no record named here holds is refused, never
 * widened to the next record that happens to hold the same address.
 *
 * 🔒 ONE ANCHOR BY ITS ADDRESS AND ITS WORDS (lrsweep rig, 24/10/2026): Home's "Book a Table" and the menu's
 * "About us" both lead to /about-us; only the button goes to Contact. An anchor is rewritten when its address is
 * the call's and, when the call names words, its own words are those.
 *
 * A `post` is a template post the plan left unwritten: its fields set, and on WordPress its body made one
 * research paragraph through the positional `blocks` road, on a read made for the write (`withSweepRead`).
 *
 * A `logo` is the business's logo or drawn wordmark, set through the site's logo setting (`siteLogo`).
 *
 * A `usage` is a template picture the theme prints from a post meta or an option, found by the site's
 * `media.usage` and written where it is kept (`pictureInStorage`).
 *
 * A `terms` clears every term description still the template's lorem (`loremTerms`).
 *
 * Any call that is not `link`, `image`, `post`, `logo`, `usage` or `terms` passes straight to the site tool (or, an EmDash tool name, to
 * EmDash's).
 */
import { createHash, randomBytes } from 'node:crypto'
import { withSweepRead } from './site-call.mjs'
import { revOf, topBlocks } from './wp-blocks.mjs'

/** @typedef {(action: string, params: Record<string, unknown>) => Promise<any>} Run */

const SITE_ACTIONS = /^[a-z]+\.[a-z.]+$/i

/** Entities an address carries inside an attribute, read back to the address. @param {string} s */
const unescape = (s) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&#0*38;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")

/** An anchor's words as a visitor reads them: no tags, entities read, spaces collapsed, any case. @param {string} html */
const wordsOf = (html) =>
  unescape(html.replace(/<[^>]*>/g, ' '))
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

/**
 * The words a call's anchors read, any of them, or null for every anchor: one button's words, or the words of each
 * button on a page that shares one address and one destination (the plan's `texts`).
 * @param {string | string[] | null | undefined} text
 */
function wantOf(text) {
  const all = (Array.isArray(text) ? text : [text]).filter((t) => typeof t === 'string' && t !== '')
  return all.length === 0 ? null : new Set(all.map((t) => wordsOf(String(t))))
}

/**
 * Every anchor of `html` leading to `href` (and reading `text`, or any of `text` when a list, when given) sent to
 * `to`.
 * @param {string} html
 * @param {string} href
 * @param {string} to
 * @param {string | string[] | null} [text]
 * @returns {{html: string, count: number}}
 */
export function relink(html, href, to, text = null) {
  let count = 0
  const want = wantOf(text)
  const out = html.replace(
    /<a\b([^>]*)>([\s\S]*?)<\/a>/gi,
    (/** @type {string} */ whole, /** @type {string} */ attrs, /** @type {string} */ inner) => {
      const m = /\shref\s*=\s*(["'])(.*?)\1/i.exec(attrs)
      if (!m || unescape(m[2]) !== href) return whole
      if (want !== null && !want.has(wordsOf(inner))) return whole
      count += 1
      return `<a${attrs.replace(m[0], ` href=${m[1]}${to.replace(/&/g, '&amp;')}${m[1]}`)}>${inner}</a>`
    }
  )
  return { html: out, count }
}

/**
 * The block comments of WordPress markup as a tree's flat list: each block's name, attributes (null when its JSON
 * does not read), the span of its opening comment and the span of its own markup (empty for a self-closing one, a
 * navigation link, or one never closed).
 * @param {string} html
 */
function blocksOf(html) {
  /** @type {{name: string, attrs: any, json: string, at: number, end: number, from: number, to: number}[]} */
  const all = []
  /** @type {typeof all} */
  const open = []
  for (const m of html.matchAll(/<!--\s+(\/)?wp:([a-z0-9/-]+)(?:\s+(\{[\s\S]*?\}))?\s+(\/)?-->/g)) {
    const at = m.index ?? 0
    const end = at + m[0].length
    if (m[1]) {
      const i = open.findLastIndex((b) => b.name === m[2])
      if (i < 0) continue
      open[i].to = at
      open.length = i
      continue
    }
    let attrs = null
    try {
      attrs = m[3] ? JSON.parse(m[3]) : {}
    } catch {
      // an unreadable block's attributes are left as they are
    }
    const block = { name: m[2], attrs, json: m[3] ?? '', at, end, from: end, to: end }
    all.push(block)
    if (!m[4]) open.push(block)
  }
  return all
}

/**
 * An anchor's words as a visitor reads them; a picture's link, which shows no words, reads its `aria-label` or its
 * picture's `alt`. @param {string} attrs @param {string} inner
 */
function anchorWords(attrs, inner) {
  const shown = wordsOf(inner)
  if (shown !== '') return shown
  const label = /\saria-label\s*=\s*(["'])(.*?)\1/i.exec(attrs) ?? /\salt\s*=\s*(["'])(.*?)\1/i.exec(inner)
  return label ? wordsOf(label[2]) : ''
}

/**
 * Every anchor of WordPress markup leading to `href` (and reading the call's words, when it names some) sent to
 * `to`, with the address its block keeps in its comment: a button's or navigation link's `"url"`, an image's
 * `"href"`.
 *
 * 🔒 ONE LINK A VISITOR SEES IS COUNTED ONCE (review 26/10/2026): a button keeps its address twice, in its block
 * comment and in its saved `<a>`; the anchor is counted, its comment is not. Only a block whose own markup shows no
 * anchor to the address (a navigation link, a submenu) counts its `url`. The plan counts the same way
 * (`post-routes.js` `blockUrlsOf`).
 *
 * 🔒 A BLOCK'S COMMENT MOVES ONLY WITH ITS OWN ANCHOR (second review, 26/10/2026): a call scoped to "Book" sent an
 * image block's `href` to the new page while its `<a>` still led to the old one, so the editor and the page told
 * different addresses. A comment's address is rewritten only when an anchor of that block's own markup (not one of
 * a block inside it) was; a block with no such anchor moves when its `label` is the call's words or the call names
 * none.
 * @param {string} html @param {string} href @param {string} to @param {string | string[] | null} text
 * @returns {{html: string, count: number}}
 */
export function relinkBlocks(html, href, to, text = null) {
  const want = wantOf(text)
  const blocks = blocksOf(html)
  /** The innermost block whose own markup holds `at`. @param {number} at */
  const ownerOf = (at) =>
    blocks.reduce(
      (/** @type {(typeof blocks)[number] | null} */ best, b) =>
        b.from <= at && at < b.to && (!best || b.from >= best.from) ? b : best,
      null
    )
  /** @type {{at: number, end: number, out: string}[]} */
  const edits = []
  /** @type {Map<object, boolean>} each block holding an anchor to `href`: whether one of them was rewritten */
  const anchored = new Map()
  let count = 0
  for (const m of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const h = /\shref\s*=\s*(["'])(.*?)\1/i.exec(m[1])
    if (!h || unescape(h[2]) !== href) continue
    const at = m.index ?? 0
    const owner = ownerOf(at)
    const moves = want === null || want.has(anchorWords(m[1], m[2]))
    if (owner) anchored.set(owner, (anchored.get(owner) ?? false) || moves)
    if (!moves) continue
    count += 1
    const attrs = m[1].replace(h[0], ` href=${h[1]}${to.replace(/&/g, '&amp;')}${h[1]}`)
    edits.push({ at, end: at + m[0].length, out: `<a${attrs}>${m[2]}</a>` })
  }
  for (const b of blocks) {
    const key = b.name === 'image' && b.attrs?.href === href ? 'href' : b.attrs?.url === href ? 'url' : null
    if (!key) continue
    let moves = anchored.get(b)
    if (moves === undefined) {
      moves = want === null || (typeof b.attrs.label === 'string' && want.has(wordsOf(b.attrs.label)))
      if (moves) count += 1
    }
    if (!moves) continue
    const comment = html.slice(b.at, b.end)
    edits.push({
      at: b.at,
      end: b.end,
      out: comment.replace(b.json, JSON.stringify({ ...b.attrs, [key]: to }))
    })
  }
  edits.sort((x, y) => y.at - x.at)
  let out = html
  for (const e of edits) out = out.slice(0, e.at) + e.out + out.slice(e.end)
  return { html: out, count }
}

/**
 * A deep copy of `value` with every link-like string equal to `href` sent to `to` (EmDash's JSON fields).
 * @param {unknown} value
 * @param {string} href
 * @param {string} to
 * @returns {{data: any, count: number}}
 */
function relinkData(value, href, to) {
  let count = 0
  /** @type {(v: unknown, key: string | number | null) => unknown} */
  const walk = (v, key) => {
    if (typeof v === 'string') {
      if (v === href && ['href', 'url', 'link', 'cta_url', 'button_url'].includes(String(key))) {
        count += 1
        return to
      }
      if (v.includes('<a')) {
        const r = relink(v, href, to)
        count += r.count
        return r.html
      }
      return v
    }
    if (Array.isArray(v)) return v.map((x, i) => walk(x, i))
    if (v && typeof v === 'object')
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, k)]))
    return v
  }
  return { data: walk(value, null), count }
}

/** @param {string} code @param {string} error */
const refuse = (code, error) => ({ ok: false, code, error })

/** The fields of a WordPress or Joomla record that hold its words, as the door names them. */
/** @type {Record<string, string[]>} */
const BODY_FIELDS = {
  wordpress: ['post_content'],
  joomla: ['introtext', 'fulltext', 'content']
}

/**
 * An EmDash entry as `tracy_emdash content_get` answers it (`result.item`, runEmdashTool), or a bare `item`.
 * 🔒 Reading only `item` refused every EmDash link and picture as "has no data" (lrsweep EmDash rig, 25/10/2026:
 * 32 links on Tracy Base 0.5.6).
 * @param {any} got
 * @returns {{data?: any, status?: string, slug?: any} | null}
 */
function entryOf(got) {
  return got?.result?.item ?? got?.item ?? (got?.data ? got : null)
}

/**
 * The write of an entry's changed fields, live when the entry is: without `status:"published"` EmDash only stages
 * a draft (`live:false`), the page keeps the template's words and the next replace there is refused PENDING_DRAFT.
 * @param {Record<string, any>} record
 * @param {{status?: string} | null} entry
 * @param {Record<string, unknown>} data @param {string | null} [slug]
 */
const entryUpdate = (record, entry, data, slug = null) => ({
  collection: record.collection,
  id: record.id,
  ...(record.locale ? { locale: record.locale } : {}),
  data,
  ...(slug ? { slug } : {}),
  ...(entry?.status === 'published' ? { status: 'published' } : {})
})

/**
 * 🔒 A COUNTED LINK IS WRITTEN ONLY WHERE THE PLAN COUNTED IT (product owner, 26/10/2026): a link to a post's old
 * route is planned with how many times the record held it (`expect`); a record holding more or fewer is refused
 * unwritten, never widened.
 * @param {Record<string, any>} p @param {number} count @param {string} where
 */
const countRefused = (p, count, where) =>
  typeof p.expect === 'number' && count !== p.expect
    ? refuse('COUNT_MISMATCH', `${where} holds ${count} links to ${p.href}, the plan counted ${p.expect}`)
    : null

/**
 * @param {{record?: Record<string, any> | null, href: string, to: string, text?: string | null, texts?: string[], path?: string, targetLink?: string}} p
 * @param {string} platform
 * @param {Run} run
 */
async function linkInRecord(p, platform, run) {
  const record = p.record
  if (!record) return refuse('NOT_FOUND', `no record of the site holds the page ${p.path ?? ''}`)
  const text = p.texts ?? p.text ?? null
  if (platform === 'emdash') {
    const got = await run('content_get', {
      collection: record.collection,
      id: record.id,
      ...(record.locale ? { locale: record.locale } : {})
    })
    const entry = entryOf(got)
    const data = entry?.data
    if (!data || typeof data !== 'object')
      return refuse('NOT_FOUND', `${record.collection}/${record.id} has no data`)
    const r = relinkData(data, p.href, p.to)
    if (r.count === 0)
      return refuse('NOT_FOUND', `${record.collection}/${record.id} holds no link to ${p.href}`)
    const off = countRefused(p, r.count, `${record.collection}/${record.id}`)
    if (off) return off
    const changed = Object.fromEntries(
      Object.entries(r.data).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(data[k]))
    )
    const answer = await run('content_update', entryUpdate(record, entry, changed))
    return answer?.ok === false ? answer : { ok: true, count: r.count, record }
  }
  // 🔒 A JOOMLA MENU ITEM IS A ROUTE, NOT WORDS: its `link` becomes the target page's own menu item `link`, never a
  // rendered address the router would not read back.
  // 🔒 …AND ONLY WHILE IT STILL HOLDS THE LINK THE PLAN SAW (review 26/10/2026): the item is read now and written
  // only when its `link` is the one the plan named (`record.link`, as `was` everywhere else); one the agent changed
  // since is refused CHANGED, unwritten, and a plan naming none is refused too.
  if (platform === 'joomla' && record.kind === 'menuItem') {
    if (typeof p.targetLink !== 'string' || p.targetLink === '')
      return refuse('NOT_FOUND', `no menu item of the site leads to ${p.to}`)
    if (typeof record.link !== 'string')
      return refuse('NOT_FOUND', `the plan did not say which link menu item ${record.id} held`)
    const got = await run('content.get', { kind: 'menuItem', id: record.id })
    const now = got?.item?.link
    if (typeof now !== 'string') return refuse('NOT_FOUND', `menu item ${record.id}'s link could not be read`)
    if (now === p.targetLink) return { ok: true, count: 0, record }
    if (now !== record.link)
      return refuse('CHANGED', `menu item ${record.id} links ${now} now, not ${record.link} the plan saw`)
    const answer = await run('content.update', {
      kind: 'menuItem',
      id: record.id,
      fields: { link: p.targetLink }
    })
    return answer?.ok === false ? answer : { ok: true, count: 1, record }
  }
  return changeRecord(
    run,
    record,
    BODY_FIELDS[platform] ?? [],
    `link to ${p.href}`,
    (s) => {
      const r = platform === 'wordpress' ? relinkBlocks(s, p.href, p.to, text) : relink(s, p.href, p.to, text)
      return { out: r.html, count: r.count }
    },
    (count) => countRefused(p, count, `${record.kind} ${record.id}`)
  )
}

/**
 * One WordPress or Joomla record's `fields`, each changed by `change`, written back if any changed.
 *
 * 🔒 A LONG BODY IS READ AND WRITTEN BY ITS BLOCKS (lrsweep rig, JA Diner wp7, 25/10/2026). The site tool shows a
 * WordPress body over 4,000 characters as its outline (`site-call.mjs` W2), with no `post_content`: the home page
 * (52k) and About (31k) answered every picture and link the sweep sent there NOT_FOUND, 72 calls a round. Such a
 * body is read by all its blocks, and only the blocks that changed are written, with the rev of that read.
 * @param {Run} run
 * @param {Record<string, any>} record
 * @param {string[]} fields
 * @param {string} what - what the record holds when it holds nothing to change, for the NOT_FOUND
 * @param {(s: string) => {out: string, count: number}} change
 * @param {(count: number) => Record<string, any> | null} [counted] - a refusal for a count the plan did not expect
 */
async function changeRecord(run, record, fields, what, change, counted = () => null) {
  const got = await run('content.get', { kind: record.kind, id: record.id })
  const item = got?.item
  if (!item || typeof item !== 'object')
    return refuse('NOT_FOUND', `${record.kind} ${record.id} could not be read`)
  /** @type {Record<string, string>} */
  const changed = {}
  let count = 0
  for (const field of fields) {
    if (typeof item[field] !== 'string') continue
    const r = change(item[field])
    if (r.count > 0) {
      changed[field] = r.out
      count += r.count
    }
  }
  /** @type {Record<string, string>} */
  const blocks = {}
  let rev = null
  if (Array.isArray(got.outline) && got.outline.length > 0) {
    const read = await run('content.get', {
      kind: record.kind,
      id: record.id,
      block: got.outline.map((/** @type {{i: number}} */ row) => row.i)
    })
    if (!Array.isArray(read?.blocks))
      return refuse('NOT_FOUND', `${record.kind} ${record.id}'s blocks could not be read`)
    rev = read.rev ?? got.rev ?? null
    for (const block of read.blocks) {
      const r = change(String(block?.markup ?? ''))
      if (r.count > 0) {
        blocks[String(block.i)] = r.out
        count += r.count
      }
    }
  }
  if (count === 0) return refuse('NOT_FOUND', `${record.kind} ${record.id} holds no ${what}`)
  const off = counted(count)
  if (off) return off
  const answer = await run('content.update', {
    kind: record.kind,
    id: record.id,
    ...(Object.keys(changed).length > 0 ? { fields: changed } : {}),
    ...(Object.keys(blocks).length > 0 ? { rev, blocks } : {})
  })
  return answer?.ok === false ? answer : { ok: true, count, record }
}

/**
 * EmDash's menu: `menu_get`, every item leading to `href` (and reading `text`) sent to `to`, `menu_set_items` with
 * all of them back.
 * @param {Record<string, any>} p
 * @param {Run} run
 */
async function linkInEmdashMenu(p, run) {
  const got = await run('menu_get', { name: p.menu })
  const items = got?.items ?? got?.item?.items
  if (!Array.isArray(items)) return refuse('NOT_FOUND', `menu ${p.menu} could not be read`)
  let count = 0
  const want = wantOf(p.texts ?? p.text)
  const next = items.map((i) => {
    if (i?.url !== p.href || (want !== null && !want.has(wordsOf(String(i.label ?? ''))))) return i
    count += 1
    return { ...i, url: p.to }
  })
  if (count === 0) return refuse('NOT_FOUND', `menu ${p.menu} holds no link to ${p.href}`)
  const off = countRefused(p, count, `menu ${p.menu}`)
  if (off) return off
  const answer = await run('menu_set_items', { name: p.menu, items: next })
  return answer?.ok === false ? answer : { ok: true, count }
}

/**
 * A picture: every place a record holds the template file (`find`) becomes the business's own (`media`), the
 * WordPress block's attachment id with it, so the editor and the page show the same picture.
 * @param {{record?: Record<string, any> | null, find: string, attachment?: number | null, media: {id?: number | string | null, url: string}, path?: string}} p
 * @param {string} platform
 * @param {Run} run
 */
async function imageInRecord(p, platform, run) {
  const record = p.record
  if (!record) return refuse('NOT_FOUND', `no record of the site holds the page ${p.path ?? ''}`)
  if (!p.media?.url) return refuse('NOT_FOUND', 'no picture of the business to put there')
  /** @param {string} s */
  const swap = (s) => {
    let count = 0
    let out = s
    // The file under any of its sizes (`item-1-1536x864.jpg`, `item-1.jpg`): the stem before a size suffix.
    const stem = p.find.replace(/-\d+x\d+(?=\.[a-z0-9]+$)/i, '').replace(/\.[a-z0-9]+$/i, '')
    const escaped = stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const file = new RegExp(`[^"'\\s(),]*${escaped}(?:-\\d+x\\d+)?\\.[a-z0-9]+`, 'gi')
    out = out.replace(file, () => {
      count += 1
      return p.media.url
    })
    if (count > 0 && platform === 'wordpress' && p.attachment != null && p.media.id != null) {
      out = out
        .replace(new RegExp(`\\bwp-image-${p.attachment}\\b`, 'g'), `wp-image-${p.media.id}`)
        .replace(new RegExp(`("id"\\s*:\\s*)${p.attachment}\\b`, 'g'), `$1${p.media.id}`)
      // `srcset` lists the template's other sizes, which the new file does not have.
      out = out.replace(/\s(?:srcset|sizes)="[^"]*"/g, '')
    }
    return { out, count }
  }
  if (platform === 'emdash') {
    const got = await run('content_get', {
      collection: record.collection,
      id: record.id,
      ...(record.locale ? { locale: record.locale } : {})
    })
    const entry = entryOf(got)
    const data = entry?.data
    if (!data || typeof data !== 'object')
      return refuse('NOT_FOUND', `${record.collection}/${record.id} has no data`)
    const before = JSON.stringify(data)
    const r = swap(before)
    if (r.count === 0) return refuse('NOT_FOUND', `${record.collection}/${record.id} holds no ${p.find}`)
    const after = JSON.parse(r.out)
    const changed = Object.fromEntries(
      Object.entries(after).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(data[k]))
    )
    const answer = await run('content_update', entryUpdate(record, entry, changed))
    return answer?.ok === false ? answer : { ok: true, count: r.count, record }
  }
  return changeRecord(
    run,
    record,
    [...(BODY_FIELDS[platform] ?? []), ...(platform === 'joomla' ? ['images'] : [])],
    p.find,
    swap
  )
}

/**
 * 🔒 A POST THE AGENT LEFT IS WRITTEN FROM THE RESEARCH, NEVER "Coming soon" (product owner, 25/10/2026). This applies
 * only to a template post whose body the agent's plan did not write and whose body still holds the template's; the
 * sweep composes its text from one research topic's facts (`postDraftsOf`, `agent-demo.js`) and, with no fact left,
 * leaves it unresolved for the operator. The post stays, and so do its title, featured image and date: this call
 * deletes none of them, and the sweep changes each only in its own field (`fields`) where it still holds the
 * template's value. Only the template's lorem blocks give way: the first block becomes the research paragraph and
 * the template's other blocks go, by position, read from the body this call just got (`rev`), so a body that
 * changed since the plan is refused, never overwritten. The write
 * runs in the sweep's scope (`withSweepRead`, `site-call.mjs`): the door checks that `rev` against its own read of
 * the record now and then lets the research paragraph past BODY_SHRINK, a one-block body included (product owner,
 * 24/10/2026). The same write from anywhere else keeps the guard.
 * @param {Record<string, any>} p
 * @param {Run} run
 */
async function templatePost(p, run) {
  if (p.bodyFields && typeof p.bodyFields === 'object') return templateFields(p, run)
  if (typeof p.body !== 'string')
    return stillUpdate(
      {
        action: 'content.update',
        params: { kind: p.kind, id: p.id, fields: p.fields ?? {}, was: p.was, slugFrom: p.slugFrom }
      },
      run
    )
  const got = await run('content.get', { kind: p.kind, id: p.id })
  const body = got?.item?.post_content
  const fields = slugWithTitle(
    fieldsStill(p.fields, p.was, got?.item && typeof got.item === 'object' ? got.item : {}),
    p.fields,
    p.slugFrom
  )
  /** @type {{i: number, markup: string}[]} */
  let parts
  let rev
  if (typeof body === 'string') {
    const spans = topBlocks(body)
    if (!spans || spans.length === 0) return refuse('NOT_FOUND', `${p.kind} ${p.id} has no blocks to name`)
    parts = spans.map((s, i) => ({ i, markup: body.slice(s.start, s.end) }))
    rev = revOf(body)
  } else if (Array.isArray(got?.outline) && got.outline.length > 0) {
    // 🔒 A LONG TEMPLATE POST IS READ BY ITS BLOCKS (The Willow Nook local, build 16, 25/10/2026): the template's
    // posts are 4,674 characters, shown as their outline with no `post_content` (`changeRecord`), and all 24 posts
    // the sweep sent were refused NOT_FOUND two rounds running, so their lorem stayed.
    const read = await run('content.get', {
      kind: p.kind,
      id: p.id,
      block: got.outline.map((/** @type {{i: number}} */ row) => row.i)
    })
    if (!Array.isArray(read?.blocks))
      return refuse('NOT_FOUND', `${p.kind} ${p.id}'s blocks could not be read`)
    parts = read.blocks.map((/** @type {{i: number, markup?: string}} */ b) => ({
      i: b.i,
      markup: String(b?.markup ?? '')
    }))
    rev = read.rev ?? got.rev ?? null
  } else return refuse('NOT_FOUND', `${p.kind} ${p.id} could not be read`)
  // 🔒 ONLY THE TEMPLATE'S OWN BLOCKS GIVE WAY (review 24/10/2026): with the frozen body (`template`), a block
  // found in it verbatim is the template's and a block not found there is the agent's (a picture it placed), kept
  // where it stands. Without one, every block is the template's.
  // 🔒 …AND THE TEMPLATE'S PROSE INSIDE A BLOCK THE AGENT CHANGED (review 24/10/2026): a group whose picture the
  // agent replaced is no longer found verbatim, and its lorem paragraph stayed (`count: 0`, no write). Inside such
  // a block each prose block found verbatim in the frozen body gives way, at any depth; the agent's picture, its
  // own words and the block's wrapper stay. The first unit to give way, in reading order, takes the research paragraph.
  const own = typeof p.template === 'string' ? templateBlocks(p.template) : null
  const placeholder = `<!-- wp:paragraph -->\n<p>${p.body}</p>\n<!-- /wp:paragraph -->`
  let placed = false
  const take = () => {
    if (placed) return null
    placed = true
    return placeholder
  }
  /** @type {Record<string, string | null>} */
  const blocks = {}
  let count = 0
  for (const { i, markup } of parts) {
    if (!own || own.top.has(markup)) {
      blocks[String(i)] = take()
      count++
      continue
    }
    const inner = sweepInner(markup, own.all, take)
    if (inner.count > 0) {
      blocks[String(i)] = inner.markup
      count += inner.count
    }
  }
  if (count === 0)
    return Object.keys(fields).length > 0
      ? run('content.update', { kind: p.kind, id: p.id, fields })
      : { ok: true, count: 0 }
  const answer = await withSweepRead(() =>
    run('content.update', {
      kind: p.kind,
      id: p.id,
      rev,
      blocks,
      ...(Object.keys(fields).length > 0 ? { fields } : {})
    })
  )
  return answer?.ok === false ? answer : { ok: true, count }
}

/**
 * 🔒 A FIELD IS WRITTEN ONLY WHILE IT STILL HOLDS WHAT THE SWEEP PLANNED OVER (review 26/10/2026, second pass): a
 * title the agent changed after the plan was overwritten with the sweep's. Each field the plan saw (`was`) is
 * kept only while the record read this call holds that value; one it changed, or the read does not show, is
 * dropped. A field the plan could not see in a read (a WordPress featured picture, which `content.get` lacks)
 * carries no `was` and stays the plan's.
 * @param {Record<string, unknown> | undefined} fields @param {Record<string, unknown> | undefined} was
 * @param {Record<string, unknown>} now
 */
function fieldsStill(fields, was, now) {
  if (!fields || typeof fields !== 'object') return {}
  const same = (/** @type {unknown} */ a, /** @type {unknown} */ b) =>
    typeof a === 'string' && typeof b === 'string'
      ? a.replace(/\s+/g, ' ').trim() === b.replace(/\s+/g, ' ').trim()
      : JSON.stringify(a) === JSON.stringify(b)
  return Object.fromEntries(
    Object.entries(fields).filter(
      ([field]) =>
        !was || !Object.hasOwn(was, field) || (Object.hasOwn(now, field) && same(now[field], was[field]))
    )
  )
}

/**
 * A sweep's plain write of a post's fields that names what it planned over (`was`): read now, written only in the
 * fields still holding it (`fieldsStill`).
 * @param {{action: string, params: Record<string, any>}} call
 * @param {Run} run
 */
async function stillUpdate({ action, params }, run) {
  const { was, slug, slugFrom, ...rest } = params
  const emdash = action === 'content_update'
  const record = emdash
    ? { collection: rest.collection, id: rest.id, ...(rest.locale ? { locale: rest.locale } : {}) }
    : { kind: rest.kind, id: rest.id }
  const got = await run(emdash ? 'content_get' : 'content.get', record)
  const entry = emdash ? entryOf(got) : null
  const now = emdash ? entry?.data : got?.item
  if (!now || typeof now !== 'object')
    return refuse('NOT_FOUND', `${rest.collection ?? rest.kind} ${rest.id} could not be read`)
  const key = emdash ? 'data' : 'fields'
  const kept = slugWithTitle(fieldsStill(rest[key], was, now), rest[key], slugFrom)
  const moved = emdash && titleKept(kept, rest[key], slugFrom) ? slugStill(slug, was, entry) : null
  const count = Object.keys(kept).length + (moved ? 1 : 0)
  if (count === 0) return unwritten()
  const answer = await run(action, { ...rest, [key]: kept, ...(moved ? { slug: moved } : {}) })
  return answer?.ok === false ? answer : { ok: true, count }
}

/**
 * An EmDash entry's planned slug, kept only while the entry still holds the slug the plan saw (`was.slug`): one the
 * agent changed since is the agent's (product owner, 26/10/2026). Null when none is planned or it changed.
 * @param {unknown} slug @param {Record<string, unknown> | undefined} was @param {{slug?: unknown} | null} entry
 */
function slugStill(slug, was, entry) {
  if (typeof slug !== 'string' || slug === '') return null
  if (!was || !Object.hasOwn(was, 'slug')) return slug
  return entry?.slug === was.slug ? slug : null
}

/** The answers of a write the resolver did not send: every field it planned changed since (`fieldsStill`). */
const UNWRITTEN = new WeakSet()
const unwritten = () => {
  const answer = { ok: true, count: 0 }
  UNWRITTEN.add(answer)
  return answer
}

/** The fields a WordPress post or a Joomla article keeps its slug in. */
const SLUG_FIELDS = ['post_name', 'alias']

/**
 * Whether the title a planned slug was made of (`slugFrom`; a plan naming none, its `post_title` or `title`) is
 * still written: `fieldsStill` dropped it when the agent changed the title after the plan.
 * @param {Record<string, unknown>} kept @param {Record<string, unknown> | undefined} planned @param {unknown} slugFrom
 */
function titleKept(kept, planned, slugFrom) {
  const from =
    typeof slugFrom === 'string' && slugFrom !== ''
      ? slugFrom
      : ['post_title', 'title'].find((f) => Object.hasOwn(planned ?? {}, f))
  return !from || !Object.hasOwn(planned ?? {}, from) || Object.hasOwn(kept, from)
}

/**
 * 🔒 A SLUG MADE OF A TITLE IS WRITTEN ONLY WITH THAT TITLE (review 26/10/2026): when the agent changed the title
 * after the plan, the sweep's title is dropped (`fieldsStill`) and the slug made of it goes too, so the agent's
 * own title and slug stand. The kept fields without a slug field when the title is gone.
 * @param {Record<string, unknown>} kept @param {Record<string, unknown> | undefined} planned @param {unknown} slugFrom
 */
function slugWithTitle(kept, planned, slugFrom) {
  if (titleKept(kept, planned, slugFrom)) return kept
  return Object.fromEntries(Object.entries(kept).filter(([f]) => !SLUG_FIELDS.includes(f)))
}

/**
 * 🔒 THE SLUG THE SITE STORED, READ BACK (product owner, 26/10/2026): WordPress makes a post's slug unique itself
 * (`-2`), so what a write that planned a slug left is read again and answered as `slug`, never assumed.
 * @param {{action: string, params: Record<string, any>}} call @param {Record<string, any>} answer @param {Run} run
 */
async function withSlugRead(call, answer, run) {
  const p = call.params ?? {}
  const emdash = call.action === 'content_update' || p.platform === 'emdash'
  const planned = emdash
    ? typeof p.slug === 'string'
    : SLUG_FIELDS.some((f) => typeof p.fields?.[f] === 'string')
  // Nothing written (the agent changed what the plan saw): nothing to read back.
  if (!planned || answer?.ok === false || UNWRITTEN.has(answer)) return answer
  const got = emdash
    ? await run('content_get', {
        collection: p.collection,
        id: p.id,
        ...(p.locale ? { locale: p.locale } : {})
      })
    : await run('content.get', { kind: p.kind, id: p.id })
  const slug = emdash
    ? entryOf(got)?.slug
    : SLUG_FIELDS.map((f) => got?.item?.[f]).find((v) => typeof v === 'string')
  return typeof slug === 'string' ? { ...answer, slug } : answer
}

/**
 * A body's words as the page shows them: markup's text, or the text of Portable Text's spans, as-is.
 * @param {unknown} value
 */
function bodyWordsOf(value) {
  const text = Array.isArray(value)
    ? value
        .flatMap((b) =>
          Array.isArray(b?.children)
            ? b.children.map((/** @type {any} */ s) => (typeof s?.text === 'string' ? s.text : ''))
            : []
        )
        .join(' ')
    : typeof value === 'string'
      ? value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ')
      : ''
  return text.replace(/\s+/g, ' ').trim()
}

/**
 * The pictures the agent placed in a body the template's words are still in: an `<img>` of markup, a non-text
 * block of Portable Text, each one the template's body does not hold. They stay, ahead of the research body.
 * @param {unknown} now @param {unknown} was
 */
function placedOf(now, was) {
  if (Array.isArray(now)) {
    const theirs = new Set((Array.isArray(was) ? was : []).map((b) => JSON.stringify(b)))
    return now.filter((b) => b?._type !== 'block' && !theirs.has(JSON.stringify(b)))
  }
  if (typeof now !== 'string') return []
  return (now.match(/<img\b[^>]*>/gi) ?? []).filter((tag) => !String(was ?? '').includes(tag))
}

/**
 * 🔒 A JOOMLA OR EMDASH POST THE AGENT LEFT IS WRITTEN FROM THE RESEARCH, LIKE WORDPRESS'S (review of round 12,
 * 26/10/2026): an article's `introtext` and `fulltext`, an entry's `content` or `body`, each written whole
 * (`bodyFields`) only while the record read this call still holds the template's words there (`template`); a
 * field the agent wrote since is kept, and so is a picture it placed in a template body. The write runs in the
 * sweep's scope (`withSweepRead`), so the door lets the research body past BODY_SHRINK on that read; the same
 * write from anywhere else keeps the guard.
 * @param {Record<string, any>} p
 * @param {Run} run
 */
async function templateFields(p, run) {
  const emdash = p.platform === 'emdash'
  const record = emdash
    ? { collection: p.collection, id: p.id, ...(p.locale ? { locale: p.locale } : {}) }
    : { kind: p.kind, id: p.id }
  const got = await run(emdash ? 'content_get' : 'content.get', record)
  const entry = emdash ? entryOf(got) : null
  const now = emdash ? entry?.data : got?.item
  if (!now || typeof now !== 'object')
    return refuse('NOT_FOUND', `${p.collection ?? p.kind} ${p.id} could not be read`)
  /** @type {Record<string, unknown>} */
  const bodies = {}
  for (const [field, value] of Object.entries(p.bodyFields)) {
    const was = p.template?.[field]
    if (bodyWordsOf(now[field]) === '' || bodyWordsOf(now[field]) !== bodyWordsOf(was)) continue
    const placed = placedOf(now[field], was)
    bodies[field] =
      placed.length === 0
        ? value
        : Array.isArray(value)
          ? [...placed, ...value]
          : `${placed.join('')}${String(value)}`
  }
  const fields = slugWithTitle(fieldsStill(p.fields, p.was, now), p.fields, p.slugFrom)
  const moved = emdash && titleKept(fields, p.fields, p.slugFrom) ? slugStill(p.slug, p.was, entry) : null
  const count = Object.keys(bodies).length
  if (count === 0 && Object.keys(fields).length === 0 && !moved) return unwritten()
  const data = { ...fields, ...bodies }
  const write = () =>
    emdash
      ? run('content_update', entryUpdate(record, entry, data, moved))
      : run('content.update', { kind: p.kind, id: p.id, fields: data })
  const answer = count > 0 ? await withSweepRead(write) : await write()
  return answer?.ok === false ? answer : { ok: true, count }
}

/** The blocks whose words are a post's prose: what gives way inside a block the agent changed. */
const PROSE_BLOCKS = new Set([
  'core/paragraph',
  'core/heading',
  'core/list',
  'core/list-item',
  'core/quote',
  'core/pullquote',
  'core/preformatted',
  'core/verse'
])

/**
 * A container block's markup split at its own delimiters: what sits between its opener and its closer, and its
 * child blocks there (`topBlocks`). Null for a block with no children (a leaf, a self-closing block).
 * @param {string} markup
 */
function childrenOf(markup) {
  const opener = /^<!--\s+wp:[^]*?-->/.exec(markup)
  const closer = markup.lastIndexOf('<!-- /wp:')
  if (!opener || closer <= opener[0].length) return null
  const from = opener[0].length
  const inner = markup.slice(from, closer)
  const kids = topBlocks(inner)
  if (!kids || !kids.some((k) => k.name)) return null
  return { from, to: closer, inner, kids }
}

/**
 * A block the agent changed, with the template's prose blocks inside it taken out (the first, through `take`,
 * replaced by the research paragraph): `count` units gave way, `markup` the block as it is written.
 * @param {string} markup
 * @param {Set<string>} template every block of the frozen body, at every depth
 * @param {() => string | null} take
 * @returns {{markup: string, count: number}}
 */
function sweepInner(markup, template, take) {
  const split = childrenOf(markup)
  if (!split) return { markup, count: 0 }
  let out = ''
  let last = 0
  let count = 0
  for (const kid of split.kids) {
    const piece = split.inner.slice(kid.start, kid.end)
    out += split.inner.slice(last, kid.start)
    last = kid.end
    if (kid.name && PROSE_BLOCKS.has(kid.name) && template.has(piece)) {
      out += take() ?? ''
      count++
      continue
    }
    const deeper = kid.name ? sweepInner(piece, template, take) : { markup: piece, count: 0 }
    out += deeper.markup
    count += deeper.count
  }
  out += split.inner.slice(last)
  return count
    ? { markup: markup.slice(0, split.from) + out + markup.slice(split.to), count }
    : { markup, count: 0 }
}

/** The blocks of a frozen template body: its top-level ones, and every block at every depth, each as its markup. */
function templateBlocks(/** @type {string} */ template) {
  const top = (topBlocks(template) ?? []).map((s) => template.slice(s.start, s.end))
  const all = new Set()
  const walk = (/** @type {string} */ markup) => {
    all.add(markup)
    const split = childrenOf(markup)
    if (split) for (const kid of split.kids) if (kid.name) walk(split.inner.slice(kid.start, kid.end))
  }
  top.forEach(walk)
  return { top: new Set(top), all }
}

/** Where the sweep's logo goes on WordPress: the brand writer's folder (`brand-wordpress.js`). */
const LOGO_FOLDER = 'wp-content/uploads/tracy-brand'

/**
 * 🔒 THE BUSINESS'S LOGO THROUGH THE SITE'S LOGO SETTING (product owner, 24/10/2026). On WordPress the logo is option
 * `site_logo`, the door the brand writer uses (`brand-wordpress.js`): the research's imported logo by its media
 * id, or the drawn wordmark uploaded under a new name (`logo-<sha256 16>-<stamp>.png`, so no old file is replaced
 * under a cached attachment) and then set. Joomla and EmDash keep their logo in the template's style or EmDash's
 * own settings, which the brand writers reach from Tracy's side and this resolver does not: answered unresolved
 * by name.
 * @param {Record<string, any>} p
 * @param {Run} run
 */
async function siteLogo(p, run) {
  if (p.platform !== 'wordpress')
    return {
      ok: false,
      code: 'NEEDS_LOGO_DOOR',
      unresolved: true,
      error: `the sweep has no logo writer for ${p.platform || 'this site'}; the template's logo ${p.find ?? ''} stays`
    }
  // One apply id for the upload and the setting, as the brand writer groups them (`brand.js`): the site refuses
  // an upload without one, and the change reads back and reverts as one.
  const applyId = `sweep-logo-${Date.now().toString(36)}`
  let attachment = Number(p.media?.id)
  if (!(Number.isInteger(attachment) && attachment > 0)) {
    if (typeof p.png !== 'string' || !p.png)
      return refuse('NOT_FOUND', `the logo ${p.media?.url ?? ''} has no media id to set`)
    const bytes = Buffer.from(p.png, 'base64')
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    const uploaded = await run('media.upload', {
      path: `${LOGO_FOLDER}/logo-${sha256.slice(0, 16)}-${Date.now()}.png`,
      content_b64: p.png,
      sha256,
      apply_id: applyId
    })
    if (uploaded?.ok === false) return uploaded
    attachment = Number(uploaded?.attachment)
    if (!(Number.isInteger(attachment) && attachment > 0))
      return refuse('NOT_FOUND', 'the site made no picture of the wordmark')
  }
  // 🔒 THE VALUE AS WORDPRESS KEEPS IT, A STRING (lrsweep rig round 6, 24/10/2026): the site logs the number it was
  // sent, reads the option back as "443", and refuses `apply.revert` as changed since — the sweep's logo could not be
  // undone. Sent as a string, it reverts.
  const answer = await run('content.update', {
    kind: 'option',
    id: 0,
    key: 'site_logo',
    fields: { value: String(attachment) },
    apply_id: applyId
  })
  return answer?.ok === false ? answer : { ok: true, count: 1, attachment }
}

/** At most this many `media.usage` reads per picture: each walks 100000 ids of a table, so five reach a large site. */
const USAGE_READS_MAX = 5

/**
 * 🔒 A SIZED COPY IS LOOKED UP BY ITS ORIGINAL (24/10/2026). The page shows WordPress's resized copies
 * (`item-2-1024x576.jpg`), and `media.usage` finds an attachment only by its own file (`_wp_attached_file`), so
 * every sized copy came back `not_found` on the rig while its original was in the Media Library. The usage of the
 * original covers its sizes: the site searches every file of the attachment.
 * @param {string} url
 * @returns {string | null} the URL without WordPress's `-<w>x<h>` size suffix, or null when it has none
 */
function originalOfSized(url) {
  const original = url.replace(/-\d+x\d+(\.[a-z0-9]+)(?=$|[?#])/i, '$1')
  return original === url ? null : original
}

/**
 * The refusal code of a site's answer. The plugin says it in `error` (`{error: 'not_found', message}`), a relay may
 * say it in `code`; a sentence in `error` is a message, not a code.
 * @param {Record<string, any>} read
 */
function refusalCode(read) {
  const slug = typeof read.error === 'string' && /^[a-z_]+$/i.test(read.error) ? read.error : ''
  return String(read.code ?? read.error_code ?? slug).toLowerCase()
}

/**
 * The URL of `size` of the replacement picture, from its `_wp_attachment_metadata` (read through `content.get`):
 * the full file's URL for `full` / `original`, else the size's file beside it. Null when the replacement has no such
 * size or its metadata could not be read.
 * @param {Record<string, any>} media - `{url, id}` of the replacement
 * @param {string} size
 * @param {Run} run
 * @param {Map<string, any>} metas - the replacement's metadata, read once per call
 */
async function sizedUrl(media, size, run, metas) {
  if (size === 'full' || size === 'original' || size === '') return String(media.url)
  const id = Number(media.id)
  if (!metas.has(String(id))) {
    const read = await run('content.get', { kind: 'postmeta', id, key: '_wp_attachment_metadata' })
    const value =
      read?.ok === false ? null : (read?.value ?? read?.data?.value ?? read?.fields?.value ?? null)
    metas.set(String(id), value && typeof value === 'object' ? value : null)
  }
  const file = metas.get(String(id))?.sizes?.[size]?.file
  if (typeof file !== 'string' || file === '' || /[/\\]/.test(file)) return null
  return `${String(media.url).replace(/\/[^/]*$/, '')}/${file}`
}

/**
 * 🔒 A TEMPLATE PICTURE THE THEME PRINTS FROM ITS OWN DATA, FOUND BY THE SITE (product owner, round 9, 24/10/2026).
 * A card's picture kept in a post meta, a banner kept in an option: no record a content door writes holds them, and
 * the key is never guessed (no per-template list). WordPress's `media.usage` (Claude Cowork plugin 0.18.31) names
 * every post meta and option holding the picture, with the value's shape; each is written through `content.update`
 * (`postmeta`, `option`) under an apply id of its own, so each reads back and reverts alone.
 *
 * - The value keeps its shape: an id stays an id (the replacement's, as a string, as WordPress keeps it); a URL
 *   becomes the URL of the replacement's SAME size. A JSON or serialized value, or a size the replacement lacks,
 *   is reported, never rewritten.
 * - A row the site marks `locked` (a write it refuses) or `pinned` (the contract's) is reported, never written.
 * - A walk cut short resumes with `after` (`scanned.<table>.through`) up to {@link USAGE_READS_MAX} reads; one still
 *   cut after those is said, as is every table that could not be read. An error is never read as "held nowhere".
 * @param {Record<string, any>} p - `{path, find, url, media: {url, id}}`
 * @param {{site: Run, usage: Run | null}} runs - `usage` reads `media.usage` (the Apply door's, not the agent's tool)
 */
async function pictureInStorage(p, { site, usage }) {
  const where = `the template picture ${p.find ?? ''}`
  if (p.platform !== 'wordpress' || usage === null)
    return {
      ok: false,
      code: 'NEEDS_USAGE_DOOR',
      unresolved: true,
      error: `${where} is kept in the theme's data, which this site cannot list`
    }
  if (!(Number.isInteger(Number(p.media?.id)) && Number(p.media.id) > 0) || typeof p.media?.url !== 'string')
    return refuse('NOT_FOUND', `no imported picture with a media id replaces ${where}`)
  /** @type {Map<string, any>} */
  const rows = new Map()
  /** @type {string[]} */
  const unresolved = []
  /** @type {Record<string, number>} */
  let after = { postmeta: 0, options: 0 }
  let cut = true
  let pinnedUnknown = false
  let url = String(p.url ?? p.find ?? '')
  for (let n = 0; n < USAGE_READS_MAX && cut; n++) {
    let read = await usage('media.usage', { url, ...(n > 0 ? { after } : {}) })
    const original =
      n === 0 && read?.ok === false && refusalCode(read) === 'not_found' ? originalOfSized(url) : null
    if (original !== null) {
      url = original
      read = await usage('media.usage', { url })
    }
    if (read?.ok === false) {
      const code = refusalCode(read)
      if (code === 'not_found')
        return {
          ok: false,
          code: 'NOT_FOUND',
          unresolved: true,
          error: `${where} is not in the site's Media Library`
        }
      return {
        ok: false,
        code: 'USAGE_READ_FAILED',
        unresolved: true,
        error: `${where}: ${read.message ?? read.error ?? 'media.usage failed'}`
      }
    }
    const stored = read?.usedInStorage
    if (!stored || typeof stored !== 'object')
      return {
        ok: false,
        code: 'USAGE_READ_FAILED',
        unresolved: true,
        error: `${where}: the site answered no usedInStorage`
      }
    if (stored.error || stored.errors)
      return {
        ok: false,
        code: 'USAGE_READ_FAILED',
        unresolved: true,
        error: `${where}: ${
          stored.error ??
          Object.entries(stored.errors)
            .map(([t, e]) => `${t}: ${e}`)
            .join('; ')
        }`
      }
    for (const row of Array.isArray(stored.postmeta) ? stored.postmeta : [])
      rows.set(`postmeta\u0000${row.post_id}\u0000${row.key}`, {
        kind: 'postmeta',
        id: Number(row.post_id),
        ...row
      })
    for (const row of Array.isArray(stored.options) ? stored.options : [])
      rows.set(`option\u0000${row.option}`, { kind: 'option', id: 0, key: String(row.option), ...row })
    const scanned = stored.scanned ?? {}
    cut = ['postmeta', 'options'].some((t) => scanned[t]?.complete !== true)
    const next = Object.fromEntries(['postmeta', 'options'].map((t) => [t, Number(scanned[t]?.through ?? 0)]))
    // A walk that says it was cut but did not move is not read again: the same answer would come back.
    if (cut && JSON.stringify(next) === JSON.stringify(after))
      return {
        ok: false,
        code: 'USAGE_READ_FAILED',
        unresolved: true,
        error: `${where}: the site's walk did not say where it stopped`
      }
    after = next
    if (stored.pinnedUnknown === true) pinnedUnknown = true
  }
  if (pinnedUnknown)
    unresolved.push("the site's contract could not be read, so which options it pins is not known")
  if (cut)
    unresolved.push(`the site's data was not all read after ${USAGE_READS_MAX} reads; more may hold it`)
  const stamp = Date.now().toString(36)
  /** @type {Map<string, any>} */
  const metas = new Map()
  let count = 0
  let n = 0
  for (const row of rows.values()) {
    const name = row.kind === 'postmeta' ? `post ${row.id} meta ${row.key}` : `option ${row.key}`
    if (row.locked === true || row.pinned === true) {
      unresolved.push(
        `${name} is ${row.locked === true ? 'one the site refuses to write' : "pinned by the site's contract"}`
      )
      continue
    }
    if (row.kind === 'option' && pinnedUnknown) {
      unresolved.push(`${name} may be pinned by the site's contract`)
      continue
    }
    let value = null
    if (row.shape === 'id') value = String(p.media.id)
    else if (row.shape === 'url') value = await sizedUrl(p.media, String(row.size ?? 'full'), site, metas)
    if (value === null) {
      unresolved.push(
        row.shape === 'url'
          ? `${name} holds the ${row.size} size, which the replacement picture has none of`
          : `${name} holds it inside ${row.shape ?? 'unknown'} data`
      )
      continue
    }
    n += 1
    const answer = await site('content.update', {
      kind: row.kind,
      id: row.id,
      key: row.key,
      fields: { value },
      apply_id: `sweep-usage-${stamp}-${randomBytes(2).toString('hex')}-${n}`
    })
    if (answer?.ok === false) unresolved.push(`${name}: ${answer.code ?? answer.error ?? 'refused'}`)
    else count += 1
  }
  if (count === 0)
    return rows.size === 0 && unresolved.length === 0
      ? {
          ok: false,
          code: 'NOT_FOUND',
          unresolved: true,
          error: `no post meta or option of the site holds ${where}`
        }
      : {
          ok: false,
          code: 'NOT_WRITTEN',
          unresolved: true,
          error: `${where}: ${unresolved.join('; ')}`,
          left: unresolved
        }
  return { ok: true, count, ...(unresolved.length > 0 ? { left: unresolved } : {}) }
}

/**
 * 🔒 EVERY SWEEP CALL IS A CHANGE OF ITS OWN (lrsweep rig round 7, 24/10/2026). A `content.update` sent with no
 * `apply_id` took the turn's one `wp-` id (`call-memory.mjs`, D9 until 26/10/2026), shared with the agent's own writes and with
 * every other call of every round: on the rig one id held 67 of the sweep's writes, interleaved with the replace
 * job's own ids, so undoing the sweep newest-first met CONFLICT at that id, and then at every older write of the
 * same posts (92 of 152 apply ids). Each sweep call now writes under its own `sweep-` id, as each replace does, so
 * it reads back and reverts alone. An id the call already names (the logo's) is kept.
 * @param {Run} run
 * @param {string} action
 * @returns {Run}
 */
export function ownChange(run, action) {
  const applyId = `sweep-${action}-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`
  return (name, params) =>
    (name === 'content.update' || name === 'media.upload') && !params?.apply_id
      ? run(name, { ...params, apply_id: applyId })
      : run(name, params)
}

/** A template's filler words in a description: the QA's own test (`apps/tracy-host/src/demo-qa.js`). */
const LOREM = /\blorem ipsum\b|\bdolor sit amet\b/i

/** The `(term_id, taxonomy)` pairs a WordPress `term_taxonomy` dump names, read again before any write. @param {string} sql */
function dumpedTerms(sql) {
  const out = new Map()
  for (const m of sql.matchAll(/\(\s*\d+\s*,\s*(\d+)\s*,\s*'([a-z0-9_-]+)'\s*,/gi))
    out.set(`${m[2]}:${m[1]}`, { taxonomy: m[2], id: Number(m[1]) })
  return [...out.values()]
}

/** Every term of a WordPress site, by its `term_taxonomy` table, or a refusal. @param {Run} run */
async function wordpressTerms(run) {
  const tables = (await run('db.tables', {}))?.tables
  const table = Array.isArray(tables)
    ? tables.find((t) => typeof t === 'string' && t.endsWith('_term_taxonomy'))
    : null
  if (!table) return refuse('NOT_FOUND', 'the site has no term_taxonomy table')
  const terms = []
  let cursor = ''
  for (let n = 0; n < 50; n += 1) {
    const chunk = await run('db.dump', { table, limit: 10, cursor })
    if (typeof chunk?.sql_b64 !== 'string') return refuse('NOT_FOUND', `${table} could not be read`)
    terms.push(...dumpedTerms(Buffer.from(chunk.sql_b64, 'base64').toString('utf8')))
    if (chunk.done || typeof chunk.next_cursor !== 'string' || chunk.next_cursor === '') break
    cursor = chunk.next_cursor
  }
  return terms
}

/**
 * 🔒 A TERM'S DESCRIPTION THAT IS STILL THE TEMPLATE'S LOREM IS CLEARED, ON EVERY PLATFORM (product owner, round 10,
 * 25/10/2026). A category or tag description the template shipped as lorem ipsum is the template's words even when
 * this theme does not print it: another theme, a feed or a search result does. It becomes empty, never invented
 * words (an empty description prints nothing). Each term is read again and written only when its own description
 * holds the lorem: WordPress terms through `content.get`/`content.update {kind:"term"}`, Joomla categories through
 * `{kind:"category"}`, EmDash terms through `taxonomy_list_terms` / `taxonomy_update_term`.
 * @param {Record<string, any>} p
 * @param {{site: Run, emdash: Run | null}} runs
 */
async function loremTerms(p, { site, emdash }) {
  const platform = String(p.platform ?? '')
  /** @type {string[]} */
  const cleared = []
  /** @type {string[]} */
  const failed = []
  if (platform === 'wordpress') {
    const terms = await wordpressTerms(site)
    if (!Array.isArray(terms)) return terms
    for (const { taxonomy, id } of terms) {
      const item = (await site('content.get', { kind: 'term', key: taxonomy, id }))?.item
      if (typeof item?.description !== 'string' || !LOREM.test(item.description)) continue
      const answer = await site('content.update', {
        kind: 'term',
        key: taxonomy,
        id,
        fields: { description: '' }
      })
      ;(answer?.ok === false ? failed : cleared).push(`${taxonomy} ${id}`)
    }
  } else if (platform === 'joomla') {
    const list = await site('content.list', { kind: 'category', limit: 100 })
    const rows = Array.isArray(list?.items) ? list.items : null
    if (!rows) return refuse('NOT_FOUND', "the site's categories could not be listed")
    for (const row of rows) {
      const item = (await site('content.get', { kind: 'category', id: row.id }))?.item
      if (typeof item?.description !== 'string' || !LOREM.test(item.description)) continue
      const answer = await site('content.update', {
        kind: 'category',
        id: row.id,
        fields: { description: '' }
      })
      ;(answer?.ok === false ? failed : cleared).push(`category ${row.id}`)
    }
  } else if (platform === 'emdash' && emdash) {
    const taxonomies = (await emdash('taxonomy_list', {}))?.items ?? []
    for (const t of Array.isArray(taxonomies) ? taxonomies : []) {
      const name = typeof t === 'string' ? t : t?.name
      if (typeof name !== 'string') continue
      const terms = (await emdash('taxonomy_list_terms', { taxonomy: name, limit: 100 }))?.items ?? []
      for (const term of Array.isArray(terms) ? terms : []) {
        if (typeof term?.description !== 'string' || !LOREM.test(term.description)) continue
        const answer = await emdash('taxonomy_update_term', {
          taxonomy: name,
          termSlug: term.slug,
          description: '',
          ...(typeof term.locale === 'string' ? { locale: term.locale } : {})
        })
        ;(answer?.ok === false ? failed : cleared).push(`${name} ${term.slug}`)
      }
    }
  } else return refuse('NOT_FOUND', `no term door for the platform ${platform}`)
  return failed.length > 0
    ? refuse('WRITE_FAILED', `term descriptions not cleared: ${failed.join(', ')}`)
    : { ok: true, count: cleared.length, cleared }
}

/**
 * One sweep call, run. A `link` or `image` names its platform (the plan's); an EmDash tool name goes to EmDash.
 * @param {{action: string, params: Record<string, any>}} call
 * @param {{site: Run, emdash?: Run | null, usage?: Run | null}} deps
 */
export async function resolveSweepCall(call, { site: siteRun, emdash = null, usage = null }) {
  const site = ownChange(siteRun, call.action)
  const platform = String(call.params?.platform ?? '')
  const run = platform === 'emdash' && emdash ? emdash : site
  if (call.action === 'post') return withSlugRead(call, await templatePost(call.params, run), run)
  if ((call.action === 'content.update' || call.action === 'content_update') && call.params?.was) {
    const door = call.action === 'content_update' ? (emdash ?? site) : site
    return withSlugRead(call, await stillUpdate(call, door), door)
  }
  if (call.action === 'logo') return siteLogo(call.params, site)
  if (call.action === 'usage') return pictureInStorage(call.params, { site: siteRun, usage })
  if (call.action === 'terms') return loremTerms(call.params, { site, emdash })
  if (call.action === 'link' || call.action === 'image') {
    if (call.action === 'link' && platform === 'emdash' && call.params.menu)
      return linkInEmdashMenu(call.params, run)
    // The page's own record first, then each shared one the plan named (a navigation block, a menu item): the
    // first that holds it is written, and only it.
    const records = Array.isArray(call.params.records) ? call.params.records : [call.params.record ?? null]
    let last = refuse('NOT_FOUND', `no record of the site holds the page ${call.params.path ?? ''}`)
    for (const record of records) {
      const p = /** @type {any} */ ({ ...call.params, record })
      const answer =
        call.action === 'link' ? await linkInRecord(p, platform, run) : await imageInRecord(p, platform, run)
      if (answer?.ok !== false || answer.code !== 'NOT_FOUND') return answer
      last = answer
    }
    if (call.action === 'link' && call.params.rendered) return site('content.replace', call.params.rendered)
    return last
  }
  if (!SITE_ACTIONS.test(call.action) && emdash) return emdash(call.action, call.params)
  return site(call.action, call.params)
}
