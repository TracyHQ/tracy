/**
 * The WordPress half of the showcase-navigation rule: parse the block markup of a `wp_navigation` post
 * or a template part, decide which navigation entries are template showcase, and turn the decision into
 * edits — take an entry out of a navigation, repoint a template part's navigation block, drop one block
 * of a template part — each fingerprinted (`before`/`after` sha256 of the whole post content) so the
 * Claude Cowork plugin applies it only to the bytes it was computed on. Pure: the generator feeds it the
 * raw markup of `navigation-source.json`.
 *
 * 🔒 NEVER A POST STATUS. Every showcase page stays published; only the entry that links it leaves a
 * navigation. The operations this module can produce are the three in `WP_OPERATIONS`, and no other.
 * 🔒 BYTES ARE NOT RE-SERIALISED. An edit cuts the span of one block (and the line break after it) or
 * rewrites the attribute JSON of one comment; every other byte of the post is the one it read.
 */
import { sha256 } from './common.mjs'
import { isKitLabel, KIT_ALONE, RULES, SHOWCASE_WORDS, VARIANT_LABEL } from './rules.mjs'

export const WP_OPERATIONS = [
  'navigation.removeLink',
  'templatePart.setNavigationRef',
  'templatePart.removeBlock'
]

export const WP_RULES = {
  home: RULES.home,
  decisionKeep: RULES.decisionKeep,
  defaultKeep: RULES.defaultKeep,
  holdsKept: RULES.holdsKept,
  decisionHide: RULES.decisionHide,
  insideHidden: RULES.insideHidden,
  kit: RULES.kit,
  homeVariant: RULES.homeVariant,
  decisionRef: 'repoint.decision',
  decisionBlock: 'remove-block.decision',
  variantLabel: RULES.variantLabel,
  showcaseWord: RULES.showcaseWord,
  functionalInBranch: RULES.functionalInBranch,
  aliasOfHidden: RULES.aliasOfHidden,
  emptyHeading: RULES.emptyHeading,
  linkToHidden: RULES.linkToHidden,
  inexactId: 'unresolved.inexact-id',
  onlyRoute: 'unresolved.only-route-to-content',
  routeNotProven: 'unresolved.route-not-proven'
}

// The comment grammar of WordPress's block parser (`WP_Block_Parser::next_token`), attributes included.
const COMMENT = /<!--\s+(\/)?wp:([a-z][a-z0-9_-]*(?:\/[a-z][a-z0-9_-]*)?)\s+(\{[\s\S]*?\}\s+)?(\/)?-->/g
const fullName = (name) => (name.includes('/') ? name : `core/${name}`)
const ITEM = new Set(['core/navigation-link', 'core/navigation-submenu'])
/** A sign-in, account or search screen: a working feature, not a showcase, unless a decision names it. */
const FUNCTIONAL_LABEL =
  /\b(log ?in|sign ?in|log ?out|regist(er|ration)|profile|reminder|reset|password|search)\b/i
const FUNCTIONAL_BLOCKS = new Set(['core/loginout', 'core/search'])
/** An ancestor that holds a drawer: a navigation inside it is the menu small screens open. */
const DRAWER = /off-?canvas|drawer/i

/**
 * Every block of a markup string, in document order: `{ name, attrs, rawAttrs, start, end, parent,
 * children }`, where `start`/`end` span the whole block (opening comment to closing comment, or the
 * void comment).
 */
export function parseBlocks(markup) {
  const text = String(markup ?? '')
  const blocks = []
  const open = []
  for (const m of text.matchAll(COMMENT)) {
    const [whole, closing, rawName, rawAttrs, isVoid] = m
    const name = fullName(rawName)
    if (closing) {
      const top = open.at(-1)
      if (!top || top.name !== name)
        throw new Error(`block markup closes ${name} while ${top?.name ?? 'nothing'} is open`)
      open.pop()
      top.end = m.index + whole.length
      continue
    }
    let attrs = {}
    if (rawAttrs) {
      try {
        attrs = JSON.parse(rawAttrs)
      } catch {
        throw new Error(`block ${name} has attributes that do not parse`)
      }
    }
    const parent = open.at(-1) ?? null
    const block = {
      name,
      attrs,
      rawAttrs: rawAttrs ?? null,
      start: m.index,
      end: m.index + whole.length,
      parent,
      children: []
    }
    parent?.children.push(block)
    blocks.push(block)
    if (!isVoid) open.push(block)
  }
  if (open.length) throw new Error(`block markup leaves ${open.map((b) => b.name).join(', ')} open`)
  return blocks
}

const labelOf = (b) => String(b.attrs.label ?? '').trim()
const pageIdOf = (b) =>
  Number.isSafeInteger(Number(b.attrs.id)) && b.attrs.id !== undefined && b.attrs.id !== ''
    ? Number(b.attrs.id)
    : null
/** An integer past 2^53, which JavaScript does not hold exactly: two such ids may read as one. */
const inexact = (value) =>
  value !== undefined &&
  value !== null &&
  value !== '' &&
  Number.isInteger(Number(value)) &&
  !Number.isSafeInteger(Number(value))

/**
 * The navigation entries of one container (a `wp_navigation` post's content, or one inline navigation
 * block of a template part), as a tree: `{ block, label, pageId, url, submenu, path, parent, children }`
 * where `path` is the labels from the top entry down to this one.
 */
export function navItems(blocks, within = null) {
  const items = []
  const visit = (block, parent) => {
    if (!ITEM.has(block.name)) {
      for (const c of block.children) visit(c, parent)
      return
    }
    const label = labelOf(block)
    const item = {
      block,
      label,
      pageId: pageIdOf(block),
      inexactId: inexact(block.attrs.id),
      url: block.attrs.url ?? null,
      submenu: block.name === 'core/navigation-submenu',
      path: [...(parent?.path ?? []), label],
      parent,
      children: []
    }
    parent?.children.push(item)
    items.push(item)
    for (const c of block.children) visit(c, item)
  }
  for (const b of within ? within.children : blocks.filter((x) => !x.parent)) visit(b, null)
  return items
}

/** Whether a container lists every page (`core/page-list`), showcase pages included. */
export const listsPages = (blocks) => blocks.some((b) => b.name === 'core/page-list')

const samePath = (a, b) => a.length === b.length && a.every((x, i) => x === b[i])

/** The one entry at `path` (labels, top down) linking `pageId`; throws unless exactly one. */
function locate(items, { path, pageId }) {
  const found = items.filter(
    (i) => samePath(i.path, path) && (pageId === undefined || i.pageId === (pageId ?? null))
  )
  if (found.length !== 1)
    throw new Error(`entry ${path.join(' › ')} (page ${pageId ?? null}) is found ${found.length} times`)
  return found[0]
}

/** The markup without the span of one block (and the line break that followed it). */
const cut = (markup, block) => markup.slice(0, block.start) + markup.slice(block.end).replace(/^\r?\n/, '')

/** The markup of a `wp_navigation` post without one entry (a submenu goes with what it holds). */
export function removeLink(markup, entry) {
  return cut(markup, locate(navItems(parseBlocks(markup)), entry).block)
}

/** The inline navigation blocks of a template part (no `ref`), in document order. */
const inlineNavigations = (blocks) =>
  blocks.filter((b) => b.name === 'core/navigation' && b.attrs.ref === undefined)

/** The markup of a template part without one entry of its `navigationBlock`-th inline navigation. */
export function removeInlineLink(markup, { navigationBlock, path, pageId }) {
  const blocks = parseBlocks(markup)
  const nav = inlineNavigations(blocks)[navigationBlock]
  if (!nav) throw new Error(`inline navigation ${navigationBlock} is not in the template part`)
  return cut(markup, locate(navItems(blocks, nav), { path, pageId }).block)
}

/** The navigation refs a template part's markup points at. */
export const navigationRefsOf = (markup) =>
  parseBlocks(markup)
    .filter((b) => b.name === 'core/navigation' && b.attrs.ref !== undefined)
    .map((b) => Number(b.attrs.ref))

/** The markup with the one navigation block that points at `from` pointing at `to`; nothing else moves. */
export function setNavigationRef(markup, from, to) {
  const found = parseBlocks(markup).filter(
    (b) => b.name === 'core/navigation' && Number(b.attrs.ref) === Number(from)
  )
  if (found.length !== 1) throw new Error(`navigation ref ${from} is found ${found.length} times`)
  const b = found[0]
  const head = markup.slice(b.start, b.end)
  const raw = b.rawAttrs.trim()
  const next = raw.replace(new RegExp(`("ref"\\s*:\\s*)${Number(from)}(?=\\s*[,}])`), `$1${Number(to)}`)
  if (next === raw) throw new Error(`navigation ref ${from} is not written as a number`)
  return markup.slice(0, b.start) + head.replace(raw, next) + markup.slice(b.end)
}

/**
 * Whether a block matches a decision's `block`: `name`, and each of `ref`, `anchor`, `className`
 * (one of its classes) and `contains` (a string inside its markup) when given.
 */
const matches = (markup, b, want) =>
  b.name === fullName(want.name) &&
  (want.ref === undefined || Number(b.attrs.ref) === Number(want.ref)) &&
  (want.anchor === undefined || b.attrs.anchor === want.anchor) &&
  (want.className === undefined ||
    String(b.attrs.className ?? '')
      .split(/\s+/)
      .includes(want.className)) &&
  (want.contains === undefined || markup.slice(b.start, b.end).includes(want.contains))

/** The markup without the one block a decision's `block` matches. */
export function removeBlock(markup, want) {
  const found = parseBlocks(markup).filter((b) => matches(markup, b, want))
  if (found.length !== 1) throw new Error(`block ${JSON.stringify(want)} is found ${found.length} times`)
  return cut(markup, found[0])
}

/**
 * The containers of navigation entries: each `wp_navigation` post, and each inline navigation block of
 * a template part (`markupOf` gives the part's markup after the decided block edits).
 */
function containersOf(source, partMarkup) {
  const out = []
  for (const nav of source.navigations) {
    const blocks = parseBlocks(nav.content)
    out.push({
      key: `navigation-${nav.id}`,
      kind: 'navigation',
      post: nav,
      where: `wp_navigation ${nav.id} (${nav.slug})`,
      items: navItems(blocks)
    })
  }
  for (const part of source.templateParts) {
    const blocks = parseBlocks(partMarkup.get(part.id))
    inlineNavigations(blocks).forEach((nav, n) =>
      out.push({
        key: `templatePart-${part.id}`,
        kind: 'templatePart',
        post: part,
        navigationBlock: n,
        where: `template part ${part.id} (${part.slug}), inline navigation ${n}`,
        items: navItems(blocks, nav)
      })
    )
  }
  return out
}

/**
 * The links to a kit screen (Style guide, Typography, 404…) a template part lists outside its
 * navigation blocks, as a container of entries of their own: a theme's mega menu may be the only menu
 * that links them (Tracy Business: "Marketing kit" › Style guide), so the kit rule would never see them.
 * One entry per site-relative target, and none for a target a navigation entry opens: that entry's
 * verdict decides, and the duplicate-link step follows it. The entries leave through that step too.
 */
function markupKitLinks(source, partMarkup, containers) {
  const linked = containers
    .flatMap((c) => c.items.map((i) => siteTarget(i.url)))
    .filter((t) => t?.kind === 'site')
  const seen = []
  const out = []
  for (const part of source.templateParts) {
    const markup = partMarkup.get(part.id)
    const navigations = parseBlocks(markup).filter((b) => b.name === 'core/navigation')
    const items = []
    for (const a of anchorsOf(markup)) {
      if (
        a.uncertain ||
        !a.attrs.has('href') ||
        navigations.some((n) => a.start >= n.start && a.start < n.end)
      )
        continue
      const href = decodeAttribute(a.attrs.get('href'))
      const target = href === null ? null : siteTarget(href)
      const close = markup.indexOf('</a>', a.end)
      const label = (close < 0 ? '' : markup.slice(a.end, close))
        .replace(/<[^>]*>/g, '')
        .replace(/\s+/g, ' ')
        .trim()
      if (target?.kind !== 'site' || isRoot(target) || !KIT_ALONE.test(label)) continue
      if ([...linked, ...seen].some((t) => sameTarget(t, target))) continue
      seen.push(target)
      items.push({
        markupLink: true,
        label,
        url: href,
        pageId: null,
        path: [label],
        parent: null,
        children: [],
        block: { name: 'core/list-item', attrs: {} }
      })
    }
    if (items.length)
      out.push({
        key: `templatePart-${part.id}`,
        kind: 'markupLinks',
        post: part,
        where: `template part ${part.id} (${part.slug}), links outside its navigations`,
        items
      })
  }
  return out
}

/** Whether a decision entry names an item of a container. */
function names(entry, container, item) {
  if (
    container.kind === 'navigation'
      ? Number(entry.navigation) !== container.post.id
      : String(entry.templatePart) !== String(container.post.id) && entry.templatePart !== container.post.slug
  )
    return false
  if (
    container.kind === 'templatePart' &&
    entry.navigationBlock !== undefined &&
    entry.navigationBlock !== container.navigationBlock
  )
    return false
  if (String(entry.label ?? '').trim() !== item.label) return false
  if (entry.pageId !== undefined && (entry.pageId ?? null) !== item.pageId) return false
  if (
    entry.path !== undefined &&
    !samePath(
      entry.path.map((s) => String(s).trim()),
      item.path
    )
  )
    return false
  return true
}

/**
 * What happens to every navigation entry and template part of one release, from its raw markup and the
 * design's decisions. Returns the operations (chained per post), what stays and why, what is
 * unresolved, and the problems — a decision that names nothing, an edit that does not apply, a header
 * left without a navigation, falling back to a page list, or a small screen left with no menu.
 */
export function planWordpress(source, decisions = {}, { pages = [], options = {} } = {}) {
  const problems = []
  const operations = []
  const kept = []
  const unresolved = []
  // Ids and refs past 2^53 would match the wrong post: the whole plan stops rather than guess.
  for (const [what, value] of [
    ['the front page', source.frontPage],
    ...source.navigations.map((n) => ['a navigation', n.id]),
    ...source.templateParts.map((p) => ['a template part', p.id]),
    ...(source.linkedPosts ?? []).map((p) => ['a linked post', p.id]),
    ...source.templateParts.flatMap((p) => {
      try {
        return parseBlocks(p.content)
          .filter((b) => b.name === 'core/navigation')
          .map((b) => [`a navigation ref in template part ${p.slug}`, b.attrs.ref])
      } catch {
        return []
      }
    })
  ])
    if (inexact(value)) problems.push(`${what} has the id ${value}, past the exact integers`)
  const navById = new Map(source.navigations.map((n) => [n.id, n]))
  const partOf = (ref) =>
    source.templateParts.find((p) => String(p.id) === String(ref) || p.slug === ref) ?? null
  const linked = new Map((source.linkedPosts ?? []).map((p) => [p.id, p]))
  const current = new Map()
  for (const n of source.navigations) current.set(`navigation-${n.id}`, n.content)
  for (const p of source.templateParts) current.set(`templatePart-${p.id}`, p.content)
  const step = (key, apply, op) => {
    const before = current.get(key)
    let after
    try {
      after = apply(before)
    } catch (error) {
      problems.push(`${key}: ${error.message}`)
      return false
    }
    current.set(key, after)
    operations.push({ ...op, key, before: sha256(before), after: sha256(after) })
    return true
  }
  const reasoned = (e, side) => {
    if (typeof e?.reason === 'string' && e.reason.trim()) return true
    problems.push(`decisions.${side}: ${JSON.stringify(e)} has no reason`)
    return false
  }

  // 1. Template-part decisions: repoint a navigation block, drop a block.
  for (const e of decisions.repoint ?? []) {
    if (!reasoned(e, 'repoint')) continue
    const part = partOf(e.templatePart)
    const to = navById.get(Number(e.to))
    if (!part)
      problems.push(`decisions.repoint: template part ${e.templatePart} is not in navigation-source.json`)
    if (!navById.has(Number(e.from)))
      problems.push(`decisions.repoint: navigation ${e.from} is not in navigation-source.json`)
    if (!to) problems.push(`decisions.repoint: navigation ${e.to} is not in navigation-source.json`)
    else if (listsPages(parseBlocks(to.content)))
      problems.push(`decisions.repoint: navigation ${e.to} is a page list, which lists every page`)
    if (part && to)
      step(`templatePart-${part.id}`, (m) => setNavigationRef(m, e.from, e.to), {
        op: 'templatePart.setNavigationRef',
        templatePart: { id: part.id, slug: part.slug },
        label: part.slug,
        from: Number(e.from),
        to: Number(e.to),
        rule: WP_RULES.decisionRef,
        reason: e.reason.trim()
      })
  }
  for (const e of decisions.removeBlock ?? []) {
    if (!reasoned(e, 'removeBlock')) continue
    if (!e.block?.name) {
      problems.push(`decisions.removeBlock: ${JSON.stringify(e)} names no block`)
      continue
    }
    const part = partOf(e.templatePart)
    if (!part) {
      problems.push(`decisions.removeBlock: template part ${e.templatePart} is not in navigation-source.json`)
      continue
    }
    step(`templatePart-${part.id}`, (m) => removeBlock(m, e.block), {
      op: 'templatePart.removeBlock',
      templatePart: { id: part.id, slug: part.slug },
      label: e.label ?? e.block.anchor ?? e.block.name,
      block: e.block,
      rule: WP_RULES.decisionBlock,
      reason: e.reason.trim()
    })
  }

  // 2. Every navigation entry, classified.
  const partMarkup = new Map(source.templateParts.map((p) => [p.id, current.get(`templatePart-${p.id}`)]))
  const containers = containersOf(source, partMarkup)
  containers.push(...markupKitLinks(source, partMarkup, containers))
  const used = new Set()
  /** Every entry that leaves a navigation, its submenu's entries included. */
  const left = []
  const decidedOf = (container, item) => {
    const hit = (side) =>
      (decisions[side] ?? [])
        .map((e, i) => ({ e, i }))
        .filter(({ e }) => typeof e?.reason === 'string' && e.reason.trim() && names(e, container, item))
    const hide = hit('hide')
    const keep = hit('keep')
    for (const { i } of hide) used.add(`hide.${i}`)
    for (const { i } of keep) used.add(`keep.${i}`)
    if (hide.length && keep.length)
      problems.push(`decisions: ${container.where} entry ${item.path.join(' › ')} is both hidden and kept`)
    return keep.length ? { side: 'keep', ...keep[0].e } : hide.length ? { side: 'hide', ...hide[0].e } : null
  }
  const functional = (item) =>
    FUNCTIONAL_LABEL.test(item.label) ||
    (linked.get(item.pageId)?.blocks ?? []).some((b) => FUNCTIONAL_BLOCKS.has(b))
  const front = source.frontPage ?? null
  /** A submenu label that opens no page: no page id and no URL but `#`. */
  const opensNothing = (item) => item.pageId === null && ['', '#'].includes(String(item.url ?? '').trim())
  /** An entry that opens the front page: a page link to it, or a custom link to the site root. */
  const linksFront = (item) =>
    front !== null && (item.pageId === front || (item.pageId === null && isRoot(siteTarget(item.url))))
  // The release's pages (`inventory.json` posts): id, slug, parent and the skeleton hash of their blocks.
  const pageById = new Map(pages.filter((p) => p.type === 'page').map((p) => [p.id, p]))
  /** The page an entry opens: its page id, or a site-relative URL walked down the page tree by slug. */
  const pageOf = (item) => {
    if (item.pageId !== null) return pageById.get(item.pageId) ?? null
    const target = siteTarget(item.url)
    if (target?.kind !== 'site' || target.search) return null
    let at = null
    for (const slug of target.path.split('/').filter(Boolean)) {
      const parent = at?.id ?? 0
      const found = [...pageById.values()].filter((p) => p.slug === slug && Number(p.parent ?? 0) === parent)
      if (found.length !== 1) return null
      at = found[0]
    }
    return at
  }
  const frontSkeleton = pageById.get(front)?.skeleton ?? null
  /**
   * A copy of the home page: another page whose block skeleton is the front page's, hash for hash (JA
   * Kinetic: Blueprint and Signal are the home page's 134 blocks with other words). A label or a slug
   * that reads "home" proves nothing: "Home Care" is a page of its own.
   */
  const copiesFront = (item) => {
    const page = pageOf(item)
    return Boolean(page && frontSkeleton && page.id !== front && page.skeleton === frontSkeleton)
  }
  const entry = (container, item, rule, reason) => ({
    key: container.key,
    where: container.where,
    label: item.label,
    path: item.path,
    pageId: item.pageId,
    rule,
    reason
  })

  /** item → { hide: boolean, rule, reason }, over every container */
  const verdict = new Map()
  for (const container of containers) {
    for (const item of container.items) {
      const d = decidedOf(container, item)
      const sweptBy = (() => {
        for (let up = item.parent; up; up = up.parent) {
          const v = verdict.get(up)
          if (v?.hide && v.subtree) return up
        }
        return null
      })()
      const homeBranch = (() => {
        for (let up = item.parent; up; up = up.parent) if (linksFront(up)) return up
        // As on Joomla, a top-level "Home" submenu that opens nothing itself and holds the front-page entry
        // holds the other demos of the home page (JA Kinetic: Home › Terminal "/", Blueprint, Signal). The
        // label is required: Tracy Base's "Pages" › "Wrapper" links the front page as a stand-in.
        let top = item
        while (top.parent) top = top.parent
        return top !== item &&
          /^home$/i.test(top.label) &&
          opensNothing(top) &&
          navItemsBelow(top).some(linksFront)
          ? top
          : null
      })()
      const holder = homeBranch !== null && !linksFront(homeBranch)
      let v
      if (item.inexactId)
        v = {
          hide: false,
          unresolved: true,
          rule: WP_RULES.inexactId,
          reason: `its page id ${item.block.attrs.id} is past the exact integers, so which page it opens cannot be read`
        }
      else if (d?.side === 'keep') v = { hide: false, rule: WP_RULES.decisionKeep, reason: d.reason.trim() }
      else if (d?.side === 'hide')
        v = { hide: true, subtree: d.subtree === true, rule: WP_RULES.decisionHide, reason: d.reason.trim() }
      else if (sweptBy && functional(item))
        v = {
          hide: false,
          unresolved: true,
          rule: WP_RULES.functionalInBranch,
          reason: `a sign-in, account or search screen inside "${sweptBy.label}", decided hidden: it leaves only when a decision names it`
        }
      else if (sweptBy)
        v = {
          hide: true,
          subtree: true,
          rule: WP_RULES.insideHidden,
          reason: `inside "${sweptBy.label}", decided hidden`
        }
      else if (holder && linksFront(item))
        v = {
          hide: false,
          rule: WP_RULES.home,
          reason: `the home page, the entry that makes "${homeBranch.label}" its branch`
        }
      else if (KIT_ALONE.test(item.label))
        v = { hide: true, rule: WP_RULES.kit, reason: `"${item.label}" is one of the template's own screens` }
      else if (homeBranch && !functional(item) && (linksFront(item) || copiesFront(item)))
        v = {
          hide: true,
          rule: WP_RULES.homeVariant,
          reason: linksFront(item)
            ? `the home page again, under "${homeBranch.label}", which already links it`
            : `a copy of the home page (the same block skeleton, other words), under "${homeBranch.label}"`
        }
      else if (holder && !functional(item))
        // A "Home" submenu may also hold a real page (Support, Home Care) whose only route it is: what is
        // not a copy of the home page is a question, never a removal.
        v = {
          hide: false,
          unresolved: true,
          rule: WP_RULES.variantLabel,
          reason: `under "${homeBranch.label}", which holds the home page, and not a copy of it: may be a page of its own`
        }
      else if (item.parent && /^home$/i.test(item.parent.label) && !homeBranch && !linksFront(item))
        v = {
          hide: false,
          unresolved: true,
          rule: WP_RULES.variantLabel,
          reason: `under "${item.parent.label}", which does not link the home page: may be another demo of it`
        }
      else if (VARIANT_LABEL.test(item.label) && !/^home$/i.test(item.label) && !linksFront(item))
        v = {
          hide: false,
          unresolved: true,
          rule: WP_RULES.variantLabel,
          reason: `"${item.label}" reads as another demo of the home page or a colour scheme`
        }
      else if (SHOWCASE_WORDS.test(item.label))
        v = {
          hide: false,
          unresolved: true,
          rule: WP_RULES.showcaseWord,
          reason: `"${item.label}" names a showcase branch`
        }
      else v = { hide: false, rule: WP_RULES.defaultKeep, reason: 'not a showcase entry by any rule' }
      verdict.set(item, v)
    }
  }
  // A hidden submenu that still holds an entry that stays cannot leave whole: it stays, and only its
  // hidden entries leave.
  const whole = (item) => verdict.get(item).hide && item.children.every(whole)
  const holdKept = () => {
    for (const item of verdict.keys()) {
      const v = verdict.get(item)
      if (v.hide && !whole(item))
        verdict.set(item, {
          hide: false,
          rule: WP_RULES.holdsKept,
          reason: `${v.reason}; it holds an entry that stays, so only its hidden entries leave`
        })
    }
  }
  holdKept()
  guardRoutes({ source, current, options, pages, containers, verdict, linksFront, pageOf, copiesFront })
  holdKept()
  // As on Joomla, a submenu that opens nothing itself and whose every entry leaves goes with them,
  // unless a decision keeps it; inner ones first, so an emptied parent follows.
  for (let grew = true; grew; ) {
    grew = false
    for (const item of verdict.keys()) {
      const v = verdict.get(item)
      if (
        v.hide ||
        v.rule === WP_RULES.decisionKeep ||
        !item.children.length ||
        !opensNothing(item) ||
        !item.children.every((c) => verdict.get(c).hide)
      )
        continue
      verdict.set(item, {
        hide: true,
        rule: WP_RULES.emptyHeading,
        reason: 'a submenu that opens nothing itself and whose every entry leaves the navigation'
      })
      grew = true
    }
  }

  for (const container of containers) {
    for (const item of container.items) {
      const v = verdict.get(item)
      if (v.hide) {
        left.push(item)
        // A markup link leaves through the duplicate-link step below, as the links to a hidden entry do.
        if (container.kind === 'markupLinks') continue
        if (item.parent && verdict.get(item.parent).hide) continue // leaves with its submenu
        const contains = item.children.length ? navItemsBelow(item).map((i) => i.path.join(' › ')) : []
        const common = {
          label: item.label,
          path: item.path,
          contains,
          rule: v.rule,
          reason: v.reason,
          ...(v.route ? { route: v.route } : {})
        }
        if (container.kind === 'navigation')
          step(container.key, (m) => removeLink(m, { path: item.path, pageId: item.pageId }), {
            op: 'navigation.removeLink',
            navigation: { id: container.post.id, slug: container.post.slug },
            link: { label: item.label, pageId: item.pageId },
            ...common
          })
        else
          step(
            container.key,
            (m) =>
              removeInlineLink(m, {
                navigationBlock: container.navigationBlock,
                path: item.path,
                pageId: item.pageId
              }),
            {
              op: 'templatePart.removeBlock',
              templatePart: { id: container.post.id, slug: container.post.slug },
              block: {
                name: item.block.name,
                navigationBlock: container.navigationBlock,
                path: item.path,
                pageId: item.pageId
              },
              ...common
            }
          )
      } else (v.unresolved ? unresolved : kept).push(entry(container, item, v.rule, v.reason))
    }
  }
  for (const side of ['hide', 'keep'])
    (decisions[side] ?? []).forEach((e, i) => {
      if (!reasoned(e, side)) return
      if (!used.has(`${side}.${i}`))
        problems.push(
          `decisions.${side}: ${JSON.stringify({ ...e, reason: undefined })} names no navigation entry`
        )
    })

  // 3. The same link elsewhere in a template part: a theme's mega menu lists it again outside any
  // navigation block (JA Kinetic's "Home" panel: Terminal, Blueprint, Signal), so it would stay in a
  // menu. A list item that is that link alone leaves too; any other block holding it is a question.
  linksToLeft(source, current, left, linksFront, step, unresolved)

  const header = headerChecks(source, current)
  problems.push(...header.problems)
  unresolved.push(...header.existing)
  const finals = [...current]
    .filter(([key, markup]) => markup !== original(source, key))
    .map(([key, markup]) => ({ key, before: sha256(original(source, key)), after: sha256(markup) }))
  return { operations, kept, unresolved, problems, finals, current }
}

/** Blocks that list posts on the page they sit on. */
const LISTS_POSTS = new Set(['core/query', 'core/post-template', 'core/latest-posts'])
/** Rules that judge the entry's own screen a showcase: its page may go, what it leads to may not. */
const OWN_SCREEN_JUDGED = new Set([
  WP_RULES.kit,
  WP_RULES.homeVariant,
  WP_RULES.decisionHide,
  WP_RULES.aliasOfHidden
])

/**
 * The only-route guard, as on Joomla (`rules.mjs`, cascade guard), over every hide, a decision's
 * included: a hide that would leave a published page, post or post listing with no route from what
 * stays (the front page, the entries that stay in any navigation, the links of template parts outside
 * their navigations, the post listings of the pages these reach) is not applied, and the entry becomes
 * unresolved with what it would take along. An entry whose rule judged its own screen a showcase (a kit
 * screen, a copy of the home page, a decision naming it) is held to what it leads to; one hidden for
 * where it sits (inside a hidden submenu) is held to its own page too, unless its label reads as a kit
 * screen or a home or colour demo, as Joomla's `recognised`. When the contract does not carry
 * what an entry opens, an automatic hide is not applied; a decision's stays, and records the route as
 * not proven. An entry whose page another route that stays opens takes nothing along: what the page
 * leads to stays with that route.
 *
 * When the source carries the listings (`listings`, `listedPosts`, `terms`, `stickyPosts`), a listing
 * only proves a route to the posts it filters to: post type, terms, author, sticky, excluded posts and
 * language; a search, or a filter the capture could not read, proves none; with no pagination only the
 * first page counts, by date. What a hidden entry would take along is read wider: every post its
 * filters let through on any page, and the posts of the terms its cards link. A term archive, linked
 * from a navigation or by its URL, reaches the posts of the term and of the terms below it. Without
 * them, a page holding a listing block lists every post of its language.
 */
function guardRoutes({
  source,
  current,
  options,
  pages,
  containers,
  verdict,
  linksFront,
  pageOf,
  copiesFront
}) {
  const front = source.frontPage ?? null
  // What the release carries of its posts: inventory.json (status, slug, parent, language) and the
  // posts its navigations link (status and the core blocks they hold).
  const posts = new Map()
  for (const p of pages) posts.set(p.id, { ...p, core: null })
  const filtered = Array.isArray(source.listings)
  for (const p of source.listedPosts ?? [])
    posts.set(p.id, { status: 'publish', core: null, ...posts.get(p.id), ...p, terms: p.terms ?? {} })
  for (const p of source.linkedPosts ?? [])
    posts.set(p.id, {
      ...posts.get(p.id),
      ...p,
      blocks: posts.get(p.id)?.blocks,
      core: p.blocks ?? []
    })
  const published = (p) => p?.status === 'publish'
  const lang = (p) => p?.language ?? null
  const listing = (p) => `listing:post@${lang(p) ?? '*'}`
  const forPosts = Number(options.page_for_posts) || null
  const listingsAt = new Map((source.listings ?? []).map((l) => [l.id, l]))
  const sticky = new Set(source.stickyPosts ?? [])
  const termList = source.terms ?? []
  const listed = () => [...posts.values()].filter((p) => p.terms && published(p))
  const tokenOf = (p) => `${p.type === 'page' ? 'page' : 'post'}:${p.id}`
  const sameLanguage = (host, p) => !lang(host) || !lang(p) || lang(host) === lang(p)
  /** A term and every term below it: what its archive lists. */
  const within = (term) => {
    const out = new Set([term.id])
    for (let grew = true; grew; ) {
      grew = false
      for (const t of termList)
        if (t.taxonomy === term.taxonomy && out.has(t.parent) && !out.has(t.id)) {
          out.add(t.id)
          grew = true
        }
    }
    return out
  }
  const archive = (term) => {
    const ids = within(term)
    return new Set(
      listed()
        .filter((p) => (p.terms[term.taxonomy] ?? []).some((t) => ids.has(t)))
        .map(tokenOf)
    )
  }
  const TAXONOMY_OF = { tag: 'post_tag', post_tag: 'post_tag', category: 'category' }
  /** The term a site path opens through its archive URL (`/category/<…>/<slug>/`, `/tag/<slug>/`). */
  const termAt = (target) => {
    if (target?.kind !== 'site' || target.search) return null
    const slugs = target.path.split('/').filter(Boolean)
    const bases = { category: options.category_base || 'category', post_tag: options.tag_base || 'tag' }
    for (const [taxonomy, base] of Object.entries(bases)) {
      const head = String(base).split('/').filter(Boolean)
      if (slugs.length <= head.length || head.some((s, i) => slugs[i] !== s)) continue
      const found = termList.filter((t) => t.taxonomy === taxonomy && t.slug === slugs.at(-1))
      if (found.length === 1) return found[0]
    }
    return null
  }
  /**
   * The posts one listing block on `host` lists. `reach` is what it proves (nothing it cannot read
   * for sure); otherwise what it may show (filters that only narrow, ignored).
   */
  const listsFrom = (block, host, reach) => {
    if (block.block === 'core/page-list') return new Set(['page:*'])
    if (block.taxonomy)
      return new Set(
        listed()
          .filter((p) => (p.terms[block.taxonomy] ?? []).length)
          .map(tokenOf)
      )
    const languageOk = listed().filter((p) => sameLanguage(host, p))
    if (!block.postType) return reach ? new Set() : new Set(languageOk.map(tokenOf))
    if (block.inherit)
      return host.id === forPosts
        ? new Set(languageOk.filter((p) => p.type === 'post').map(tokenOf))
        : new Set()
    if (reach && (block.search || block.unsupported.length)) return new Set()
    const matches = languageOk.filter(
      (p) =>
        p.type === block.postType &&
        (!block.author.length || block.author.includes(p.author)) &&
        !block.exclude.includes(p.id) &&
        (block.sticky !== 'only' || sticky.has(p.id)) &&
        (block.sticky !== 'exclude' || !sticky.has(p.id)) &&
        Object.entries(block.taxQuery).every(([tax, ids]) =>
          (p.terms[tax] ?? []).some((t) => ids.includes(t))
        ) &&
        !Object.entries(block.taxExclude).some(([tax, ids]) =>
          (p.terms[tax] ?? []).some((t) => ids.includes(t))
        )
    )
    if (!reach) {
      const linkedTerms = languageOk.filter((p) => block.termLinks.some((tax) => (p.terms[tax] ?? []).length))
      return new Set([...matches, ...linkedTerms].map(tokenOf))
    }
    // The block query never puts sticky posts first, so the order is the block's own.
    const limit = block.paginated
      ? block.pages > 0
        ? (block.perPage ?? 10) * block.pages
        : Number.POSITIVE_INFINITY
      : (block.perPage ?? 10)
    if (block.offset === 0 && matches.length <= limit) return new Set(matches.map(tokenOf))
    if (block.orderBy !== 'date') return new Set()
    const sign = block.order === 'asc' ? 1 : -1
    const sorted = [...matches].sort((a, b) => (a.date === b.date ? 0 : (a.date < b.date ? -1 : 1) * sign))
    const shown = sorted.slice(block.offset, block.offset + limit)
    // Posts dated the same as one just outside the slice may swap with it: none of them is proven.
    const outside = new Set(
      [...sorted.slice(0, block.offset), ...sorted.slice(block.offset + limit)].map((p) => p.date)
    )
    return new Set(shown.filter((p) => !outside.has(p.date)).map(tokenOf))
  }
  /** Every post of the host's language: the blog page, or a front page that lists the posts. */
  const allPosts = (host) =>
    new Set(
      listed()
        .filter((p) => p.type === 'post' && sameLanguage(host, p))
        .map(tokenOf)
    )
  /** Whether a post's own screen is template sample: a kit screen, or a copy of the home page. */
  const sample = (p) =>
    isKitLabel(String(p.title ?? '')) ||
    isKitLabel(String(p.slug ?? '')) ||
    (p.type === 'page' &&
      front !== null &&
      p.id !== front &&
      Boolean(p.skeleton) &&
      p.skeleton === posts.get(front)?.skeleton)
  /**
   * What one post opens: its own screen and what its listings list. `reach` reads the listings as
   * what they prove, otherwise as what they may show.
   */
  const opensPost = (p, own, reach) => {
    const tokens = new Set()
    if (!published(p)) return { tokens }
    if (own) tokens.add(tokenOf(p))
    if (!filtered) {
      if (p.id === forPosts || (p.core ?? []).some((b) => LISTS_POSTS.has(b))) tokens.add(listing(p))
      if ((p.core ?? []).includes('core/page-list')) tokens.add('page:*')
      return { tokens, unknownListing: p.core === null && p.id !== forPosts }
    }
    const host = { ...p, language: lang(p) ?? listingsAt.get(p.id)?.language ?? null }
    if (p.id === forPosts) for (const t of allPosts(host)) tokens.add(t)
    for (const block of listingsAt.get(p.id)?.blocks ?? [])
      for (const t of listsFrom(block, host, reach)) tokens.add(t)
    // `listings` covers every published page and post; another type's blocks are read from the
    // navigations' linked posts, as without it.
    const covered = p.type === 'page' || p.type === 'post'
    if (!covered && (p.core ?? []).includes('core/page-list')) tokens.add('page:*')
    return { tokens, unknownListing: !covered && p.core === null && p.id !== forPosts }
  }
  /** The post a site-relative target opens: a page walked down by slug, else a post by its slug. */
  const postAt = (item) => {
    const page = pageOf(item)
    if (page) return posts.get(page.id) ?? page
    const target = siteTarget(item.url)
    if (target?.kind !== 'site' || target.search) return null
    const slugs = target.path.split('/').filter(Boolean)
    if (slugs.length !== 1) return null
    const found = [...posts.values()].filter((p) => p.type === 'post' && p.slug === slugs[0])
    return found.length === 1 ? found[0] : null
  }
  /**
   * What an entry opens: `{ tokens, unknown }`, `unknown` saying why the contract cannot tell. `own`
   * counts the entry's own page or post.
   */
  const opens = (item, own = true, reach = false) => {
    if (item.block.attrs.kind === 'taxonomy') {
      const taxonomy = TAXONOMY_OF[item.block.attrs.type] ?? item.block.attrs.type
      const term = filtered
        ? termList.find((t) => t.taxonomy === taxonomy && t.id === Number(item.block.attrs.id))
        : null
      return term
        ? { tokens: archive(term) }
        : {
            tokens: new Set(),
            unknown: `a ${item.block.attrs.type ?? 'term'} archive: the contract does not carry which posts it lists`
          }
    }
    if (linksFront(item)) return { tokens: new Set() }
    if (item.pageId === null) {
      const target = siteTarget(item.url)
      if (!target || target.kind === 'none' || target.kind === 'elsewhere') return { tokens: new Set() }
      if (target.kind === 'relative')
        return { tokens: new Set(), unknown: `the URL ${item.url} is relative to the page it sits on` }
      const term = filtered && !pageOf(item) ? termAt(target) : null
      if (term) return { tokens: archive(term) }
      const p = postAt(item)
      if (!p)
        return {
          tokens: new Set(),
          unknown: `the URL ${item.url} opens no page or post the contract carries`
        }
      return described(p, own, reach)
    }
    const p = posts.get(item.pageId)
    if (!p)
      return {
        tokens: new Set(),
        unknown: `post ${item.pageId} is neither in inventory.json nor among the posts the navigations link`
      }
    return described(p, own, reach)
  }
  const described = (p, own, reach) => {
    if (copiesFront({ pageId: p.id, url: null })) return { tokens: new Set() }
    const { tokens, unknownListing } = opensPost(p, own && !sample(p), reach)
    return unknownListing && published(p)
      ? { tokens, unknown: `which blocks ${p.type} ${p.id} (${p.slug}) holds, and so whether it lists posts` }
      : { tokens }
  }

  const items = containers.flatMap((c) => c.items)
  const shown = (item) => {
    for (let at = item; at; at = at.parent) if (verdict.get(at).hide) return false
    return true
  }
  const goneIds = () =>
    new Set(
      items
        .filter((i) => verdict.get(i).hide)
        .map((i) => (i.pageId !== null ? i.pageId : (postAt(i)?.id ?? null)))
        .filter((id) => id !== null)
    )
  /** Everything a route that stays reaches. */
  const reachedNow = () => {
    const reached = new Set()
    const add = (tokens) => {
      for (const t of tokens) reached.add(t)
    }
    if (front === null) {
      reached.add('listing:post@*')
      add(allPosts(null))
    } else {
      reached.add(`page:${front}`)
      if (posts.has(front)) add(opensPost(posts.get(front), true, true).tokens)
    }
    for (const c of containers) {
      const kept = c.items.filter(shown)
      if (kept.length && c.kind === 'navigation' && listsPages(parseBlocks(current.get(c.key))))
        reached.add('page:*')
      for (const item of kept) add(opens(item, true, true).tokens)
    }
    // A link of a template part outside its navigations, unless it opens a page that leaves a menu (the
    // duplicate-link step removes it, or asks about it).
    const gone = goneIds()
    for (const part of source.templateParts) {
      const markup = current.get(`templatePart-${part.id}`)
      const navigations = parseBlocks(markup).filter((b) => b.name === 'core/navigation')
      for (const a of anchorsOf(markup)) {
        if (
          a.uncertain ||
          !a.attrs.has('href') ||
          navigations.some((n) => a.start >= n.start && a.start < n.end)
        )
          continue
        const href = decodeAttribute(a.attrs.get('href'))
        if (href === null) continue
        const probe = { pageId: null, url: href, block: { attrs: {} } }
        const target = siteTarget(href)
        const term = filtered && !pageOf(probe) ? termAt(target) : null
        if (term) {
          add(archive(term))
          continue
        }
        const p = isRoot(target) ? null : postAt(probe)
        if (p && !gone.has(p.id)) add(opensPost(p, true, true).tokens)
      }
    }
    // The blog page lists the posts; a listing reaches every published post of its language.
    if (forPosts && reached.has(`page:${forPosts}`) && posts.has(forPosts)) {
      reached.add(listing(posts.get(forPosts)))
      add(allPosts(posts.get(forPosts)))
    }
    return reached
  }
  const isReached = (reached, token) => {
    if (reached.has(token)) return true
    if (token.startsWith('page:') && reached.has('page:*')) return true
    if (token.startsWith('listing:post@')) return reached.has('listing:post@*')
    if (token.startsWith('post:') && !filtered) {
      const p = posts.get(Number(token.slice(5)))
      return reached.has(listing(p)) || reached.has('listing:post@*')
    }
    return false
  }
  const label = (token) => {
    const [kind, rest] = token.split(':')
    if (kind === 'listing') return `the post listing${rest.endsWith('@*') ? '' : ` (${rest.split('@')[1]})`}`
    const p = posts.get(Number(rest))
    return `${kind} ${rest}${p?.slug ? ` (${p.slug})` : ''}`
  }

  // As on Joomla: an entry that reads as a kit screen or as a home or colour demo is a showcase wherever
  // it sits, so a sweep may take its own screen, never what it leads to.
  const recognised = (item) =>
    isKitLabel(item.label) || (VARIANT_LABEL.test(item.label) && !/^home$/i.test(item.label))
  const candidates = items
    .filter((i) => verdict.get(i).hide)
    .map((i) => {
      const v = verdict.get(i)
      return { item: i, what: opens(i, !OWN_SCREEN_JUDGED.has(v.rule) && !recognised(i)) }
    })
    // Broad routes first: restoring one may make the narrower ones redundant.
    .sort((a, b) => b.what.tokens.size - a.what.tokens.size)
  for (const { item, what } of candidates) {
    const v = verdict.get(item)
    if (!v.hide) continue
    if (what.unknown) {
      if (v.rule === WP_RULES.decisionHide) {
        verdict.set(item, { ...v, route: { proven: false, reason: what.unknown } })
        continue
      }
      restore(item, {
        hide: false,
        unresolved: true,
        rule: WP_RULES.routeNotProven,
        reason: `${v.reason}; but what it opens cannot be read (${what.unknown}), so no route that stays is proven`
      })
      continue
    }
    const reached = reachedNow()
    // Another route that stays opens the same page: everything the page leads to stays with it.
    const target = item.pageId !== null ? posts.get(item.pageId) : postAt(item)
    if (published(target) && isReached(reached, tokenOf(target))) continue
    const lost = [...what.tokens].filter((t) => !isReached(reached, t))
    if (!lost.length) continue
    restore(item, {
      hide: false,
      unresolved: true,
      rule: WP_RULES.onlyRoute,
      reason: `${v.reason}; but it is the only route to ${lost.slice(0, 3).map(label).join(', ')}${lost.length > 3 ? ` (+${lost.length - 3})` : ''}`
    })
  }
  /** The entry stays, and so do the submenus that hold it. */
  function restore(item, v) {
    verdict.set(item, v)
    for (let up = item.parent; up; up = up.parent) {
      const was = verdict.get(up)
      if (was.hide)
        verdict.set(up, {
          hide: false,
          rule: WP_RULES.holdsKept,
          reason: `${was.reason}; it holds an entry that stays, so only its hidden entries leave`
        })
    }
  }
}

const SITE = 'http://site.invalid'
const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

/** An attribute value with its character references decoded; null when one is not certain. */
export function decodeAttribute(value) {
  let certain = true
  const text = String(value).replace(/&(#[0-9]+|#x[0-9a-f]+|[a-z][a-z0-9]*)(;?)/gi, (whole, ref, semi) => {
    if (ref[0] === '#') {
      const code = ref[1] === 'x' || ref[1] === 'X' ? Number.parseInt(ref.slice(2), 16) : Number(ref.slice(1))
      if (!semi || !Number.isSafeInteger(code) || code < 1 || code > 0x10ffff) certain = false
      return certain ? String.fromCodePoint(code) : whole
    }
    if (!Object.hasOwn(NAMED, ref) || !semi) {
      certain = false
      return whole
    }
    return NAMED[ref]
  })
  return certain ? text : null
}

/**
 * Where an href leads, read as a browser on the site would: `none` (empty or a fragment of the page it
 * sits on), `site` with its decoded `path` (no trailing slash; `/` for the root) and `search` for a
 * site-relative URL, `relative` for a URL relative to the page it sits on (which page that is depends
 * on where the part renders), and `elsewhere` for any URL with a scheme or a host, which is never the
 * site's own: the markup carries no origin placeholder of the site.
 */
export function siteTarget(href) {
  if (href === null || href === undefined) return null
  // The URL parser strips C0 controls and spaces at both ends, and every tab and line break inside.
  let raw = String(href)
  while (raw && raw.charCodeAt(0) <= 0x20) raw = raw.slice(1)
  while (raw && raw.charCodeAt(raw.length - 1) <= 0x20) raw = raw.slice(0, -1)
  raw = raw.replace(/[\t\n\r]/g, '')
  if (raw === '' || raw.startsWith('#')) return { kind: 'none' }
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || /^[/\\]{2}/.test(raw)) return { kind: 'elsewhere' }
  if (!/^[/\\]/.test(raw)) return { kind: 'relative', raw }
  let url
  try {
    url = new URL(raw, `${SITE}/`)
  } catch {
    return { kind: 'relative', raw }
  }
  if (url.origin !== SITE) return { kind: 'elsewhere' }
  // Unreserved characters mean the same escaped or not (RFC 3986 §6.2.2.2).
  const plain = (text) =>
    text.replace(/%([0-9a-f]{2})/gi, (whole, hex) => {
      const c = String.fromCharCode(Number.parseInt(hex, 16))
      return /[A-Za-z0-9\-._~]/.test(c) ? c : whole.toUpperCase()
    })
  return { kind: 'site', path: plain(url.pathname).replace(/\/+$/, '') || '/', search: plain(url.search) }
}
const isRoot = (target) => target?.kind === 'site' && target.path === '/' && target.search === ''
const sameTarget = (a, b) => a.path === b.path && a.search === b.search

/**
 * The `<a>` start tags of a markup, outside comments, tokenized as HTML does: an attribute value is
 * double-quoted, single-quoted or unquoted, and the first of two same-named attributes wins. A tag
 * whose quote or bracket never closes, or that runs into the next tag, is `uncertain`.
 */
export function anchorsOf(markup) {
  const text = String(markup)
  const found = []
  let i = 0
  while (i < text.length) {
    const lt = text.indexOf('<', i)
    if (lt < 0) break
    if (text.startsWith('<!--', lt)) {
      const end = text.indexOf('-->', lt + 4)
      i = end < 0 ? text.length : end + 3
      continue
    }
    if (!/^<a[\t\n\f\r />]/i.test(text.slice(lt, lt + 3))) {
      i = lt + 1
      continue
    }
    const attrs = new Map()
    let uncertain = null
    let j = lt + 2
    for (;;) {
      while (j < text.length && /[\t\n\f\r /]/.test(text[j])) j++
      if (j >= text.length) {
        uncertain = 'the tag never closes'
        break
      }
      if (text[j] === '>') {
        j++
        break
      }
      let k = j + 1
      while (k < text.length && !/[\t\n\f\r />=]/.test(text[k])) k++
      const name = text.slice(j, k).toLowerCase()
      j = k
      while (j < text.length && /[\t\n\f\r ]/.test(text[j])) j++
      let value = ''
      if (text[j] === '=') {
        j++
        while (j < text.length && /[\t\n\f\r ]/.test(text[j])) j++
        const quote = text[j]
        if (quote === '"' || quote === "'") {
          const end = text.indexOf(quote, j + 1)
          if (end < 0) {
            uncertain = 'a quoted attribute never closes'
            break
          }
          value = text.slice(j + 1, end)
          j = end + 1
        } else {
          let end = j
          while (end < text.length && !/[\t\n\f\r >]/.test(text[end])) end++
          value = text.slice(j, end)
          j = end
        }
      }
      if (!attrs.has(name)) attrs.set(name, value)
    }
    // A tag that runs into other markup (a quote closed by the next tag's) parses, but not as written.
    if (!uncertain && text.slice(lt + 1, j).includes('<')) uncertain = 'the tag runs into the markup after it'
    found.push({ start: lt, end: j, raw: text.slice(lt, j), attrs, uncertain })
    i = j
  }
  return found
}

/** The markup a block holds between its opening and closing comments (empty for a void block). */
const innerOf = (markup, b) => {
  const whole = markup.slice(b.start, b.end)
  const open = whole.indexOf('-->') + 3
  const close = whole.lastIndexOf('<!--')
  return close > open ? whole.slice(open, close) : ''
}

/** Every string inside a block's attributes, nested ones included. */
const stringsOf = (value) =>
  typeof value === 'string'
    ? [value]
    : value && typeof value === 'object'
      ? Object.values(value).flatMap(stringsOf)
      : []

/**
 * The other links to the entries that left a navigation, in every template part outside its
 * navigation blocks (a theme's mega menu lists them again: JA Kinetic's "Home" panel). A link is the
 * same when it opens the same site-relative target; a link to any other origin is never one of them.
 * A list item that is the link alone leaves; a link anywhere else, in a block setting, relative to the
 * page it sits on, or in a tag that does not parse with certainty, is a question.
 */
function linksToLeft(source, current, left, linksFront, step, unresolved) {
  const gone = []
  for (const item of left) {
    const target = siteTarget(item.url)
    if (target?.kind === 'site' && !linksFront(item) && !gone.some((g) => sameTarget(g.target, target)))
      gone.push({ target, item })
  }
  if (!gone.length) return
  const goneTo = (target) =>
    target?.kind === 'site' ? (gone.find((g) => sameTarget(g.target, target))?.item ?? null) : null
  const lastSegment = (path) => path.split('/').filter(Boolean).pop() ?? ''
  for (const part of source.templateParts) {
    const key = `templatePart-${part.id}`
    const markup = current.get(key)
    const blocks = parseBlocks(markup)
    const navigations = blocks.filter((b) => b.name === 'core/navigation')
    const inNavigation = (at) => navigations.some((n) => at >= n.start && at < n.end)
    const innermost = (at) =>
      blocks
        .filter((b) => b.start <= at && at < b.end)
        .sort((a, b) => a.end - a.start - (b.end - b.start))[0] ?? null
    const question = (label, reason) =>
      unresolved.push({
        key,
        where: `template part ${part.slug ?? part.id}`,
        label,
        path: [label],
        pageId: null,
        rule: WP_RULES.linkToHidden,
        reason
      })
    // A block setting that links a page leaves it to the block's own markup, which this rule does not edit.
    for (const b of blocks) {
      if (inNavigation(b.start)) continue
      for (const value of stringsOf(b.attrs)) {
        const item = goneTo(siteTarget(value))
        if (item)
          question(
            String(b.attrs.label ?? b.name),
            `the ${b.name} block links "${item.label}", which leaves the navigation, from its settings`
          )
      }
    }
    const found = []
    for (const a of anchorsOf(markup)) {
      if (inNavigation(a.start) || !a.attrs.has('href')) {
        if (a.uncertain && !inNavigation(a.start))
          question(a.raw.slice(0, 60), `a link tag that does not parse with certainty (${a.uncertain})`)
        continue
      }
      const href = decodeAttribute(a.attrs.get('href'))
      if (a.uncertain || href === null) {
        question(
          a.raw.slice(0, 60),
          `a link that does not parse with certainty (${a.uncertain ?? 'a character reference it cannot read'})`
        )
        continue
      }
      const target = siteTarget(href)
      if (target.kind === 'relative') {
        const tail = lastSegment(new URL(target.raw, `${SITE}/any/`).pathname)
        const item = gone.find((g) => tail && lastSegment(g.target.path) === tail)?.item
        if (item)
          question(
            href,
            `a link relative to the page it sits on, which may open "${item.label}", which leaves the navigation`
          )
        continue
      }
      const item = goneTo(target)
      if (item) found.push({ anchor: a, href, item, block: innermost(a.start) })
    }
    const listItems = blocks.filter((b) => b.name === 'core/list-item')
    /** `<li>`, the one link, its text and nothing else. */
    const alone = (f) => {
      if (f.block?.name !== 'core/list-item' || f.block.children.length) return false
      const inner = innerOf(markup, f.block)
      const anchors = anchorsOf(inner)
      if (anchors.length !== 1 || anchors[0].raw !== f.anchor.raw) return false
      return (
        /^\s*<li(?:[\t\n\f\r ][^<>]*)?>\s*$/i.test(inner.slice(0, anchors[0].start)) &&
        /^[^<]*<\/a>(?:\s*<span(?:[\t\n\f\r ][^<>]*)?>[^<]*<\/span>)*\s*<\/li>\s*$/i.test(
          inner.slice(anchors[0].end)
        )
      )
    }
    const removable = (f) =>
      alone(f) && listItems.filter((b) => markup.slice(b.start, b.end).includes(f.anchor.raw)).length === 1
    const leaving = new Set(found.filter(removable).map((f) => f.block))
    for (const f of found) {
      // A kit screen the markup alone links is named by its link, and leaves by the kit rule.
      const own = f.item.markupLink === true
      const label = own
        ? f.item.label
        : f.block
          ? innerOf(markup, f.block)
              .replace(/<[^>]*>/g, '')
              .trim() || f.href
          : f.href
      // The list keeps another entry, or its heading would be left standing over nothing.
      const keepsOne = f.block?.parent?.children.some((c) => c.name === 'core/list-item' && !leaving.has(c))
      if (leaving.has(f.block) && keepsOne)
        step(key, (m) => removeBlock(m, { name: 'core/list-item', contains: f.anchor.raw }), {
          op: 'templatePart.removeBlock',
          templatePart: { id: part.id, slug: part.slug },
          label,
          block: { name: 'core/list-item', contains: f.anchor.raw },
          ...(own
            ? { rule: WP_RULES.kit, reason: `"${f.item.label}" is one of the template's own screens` }
            : {
                rule: WP_RULES.aliasOfHidden,
                reason: `another link to "${f.item.label}", which leaves the navigation (${f.item.path.join(' › ')})`
              })
        })
      else {
        const what = own
          ? `a link to "${f.item.label}", one of the template's own screens,`
          : `a link to "${f.item.label}", which leaves the navigation,`
        question(
          label,
          leaving.has(f.block)
            ? `${what} is all its list has left: the list and its heading would stand empty`
            : `${what} stays in a ${f.block?.name ?? 'markup'} block that is not that link alone`
        )
      }
    }
  }
}

const navItemsBelow = (item) => item.children.flatMap((c) => [c, ...navItemsBelow(c)])
const original = (source, key) => {
  const [kind, id] = key.split('-')
  return (kind === 'navigation' ? source.navigations : source.templateParts).find((p) => String(p.id) === id)
    .content
}

/**
 * What a header shows, before and after: every navigation block with the entries it would render.
 * A small screen has a menu when a navigation collapses into WordPress's overlay (`overlayMenu` not
 * "never"; "mobile" is the default) or sits inside a drawer (an off-canvas group).
 */
function headerNavigations(part, markup, navContent) {
  const blocks = parseBlocks(markup)
  return blocks
    .filter((b) => b.name === 'core/navigation')
    .map((b) => {
      let drawer = false
      for (let up = b.parent; up; up = up.parent)
        if (DRAWER.test(`${up.attrs.anchor ?? ''} ${up.attrs.className ?? ''}`)) drawer = true
      const ref = b.attrs.ref === undefined ? null : Number(b.attrs.ref)
      const inner = ref === null ? b : null
      let entries = 0
      let pageList = false
      let missing = false
      if (inner) {
        entries = navItems(blocks, inner).length
        pageList = listsPages(blocks.filter((x) => isInside(x, inner)))
      } else if (navContent.has(ref)) {
        const nb = parseBlocks(navContent.get(ref))
        entries = navItems(nb).length
        pageList = listsPages(nb)
      } else missing = true
      return {
        ref,
        drawer,
        mobile: drawer || (b.attrs.overlayMenu ?? 'mobile') !== 'never',
        entries,
        pageList,
        missing,
        fallback: inner !== null && b.children.length === 0
      }
    })
}
const isInside = (b, ancestor) => {
  for (let up = b.parent; up; up = up.parent) if (up === ancestor) return true
  return false
}

/** What is wrong with one header's navigations, as sentences. */
function headerFaults(at, navigations) {
  const faults = []
  for (const n of navigations) {
    const what = n.ref === null ? 'its inline navigation' : `navigation ${n.ref}`
    if (n.missing)
      faults.push(
        `${at} points at navigation ${n.ref}, which is not a published wp_navigation of the release`
      )
    if (n.fallback)
      faults.push(`${at} has a navigation with no ref and no entries: WordPress falls back to another menu`)
    if (n.pageList) faults.push(`${at} points at page-list ${what}, which lists every page`)
  }
  return faults
}

/**
 * The header assertions, on the final markup against the release's own. A fault the operations bring
 * is a problem; one the release already has is listed (unresolved), since no operation here caused it.
 */
function headerChecks(source, current) {
  const problems = []
  const existing = []
  const before = new Map(source.navigations.map((n) => [n.id, n.content]))
  const after = new Map(source.navigations.map((n) => [n.id, current.get(`navigation-${n.id}`)]))
  const headers = source.templateParts.filter((p) => p.area === 'header')
  // Fail closed: with no header found there is nothing these checks could pass on.
  if (!headers.length && source.templateParts.length)
    problems.push('no template part of area header: the header checks found nothing to check')
  for (const part of headers) {
    const was = headerNavigations(part, part.content, before)
    const now = headerNavigations(part, current.get(`templatePart-${part.id}`), after)
    const at = `header ${part.slug} (${part.id})`
    const old = headerFaults(at, was)
    for (const f of new Set(headerFaults(at, now))) (old.includes(f) ? existing : problems).push(f)
    if (was.length && !now.length) problems.push(`${at} is left with no navigation`)
    for (const n of now)
      if (
        !n.missing &&
        !n.fallback &&
        !n.pageList &&
        n.entries === 0 &&
        was.some((w) => w.ref === n.ref && w.entries > 0)
      )
        problems.push(
          `${at}: ${n.ref === null ? 'its inline navigation' : `navigation ${n.ref}`} is left with no entry`
        )
    if (
      was.some((w) => w.mobile && w.entries > 0) &&
      !now.some((n) => n.mobile && n.entries > 0 && !n.pageList)
    )
      problems.push(`${at} is left with no menu a small screen can open`)
    for (const f of new Set(old.filter((f) => !problems.includes(f) && !existing.includes(f))))
      existing.push(f)
    existing.forEach((f, i) => {
      if (typeof f === 'string')
        existing[i] = {
          key: `templatePart-${part.id}`,
          where: `template part ${part.id} (${part.slug})`,
          label: part.slug,
          path: [],
          pageId: null,
          rule: 'unresolved.header-navigation',
          reason: `${f} (the release's own markup; no operation here changes it)`
        }
    })
  }
  return { problems, existing }
}

/** Every navigation and template part the operations edit has its raw source: true by construction. */
export const hasSource = (source) =>
  Array.isArray(source?.navigations) &&
  Array.isArray(source?.templateParts) &&
  source.navigations.every((n) => typeof n.content === 'string') &&
  source.templateParts.every((p) => typeof p.content === 'string')

/**
 * Apply a map's operations to the source markup: what the Claude Cowork plugin does, checked byte for
 * byte (each `before` must be the sha256 of the post as it stands). Returns the markup by post key.
 */
export function applyOperations(source, operations) {
  const current = new Map()
  for (const n of source.navigations) current.set(`navigation-${n.id}`, n.content)
  for (const p of source.templateParts) current.set(`templatePart-${p.id}`, p.content)
  for (const o of operations) {
    const markup = current.get(o.key)
    if (sha256(markup) !== o.before)
      throw new Error(`${o.op} on ${o.key}: the post is not the bytes the operation was computed on`)
    let next
    if (o.op === 'navigation.removeLink') next = removeLink(markup, { path: o.path, pageId: o.link.pageId })
    else if (o.op === 'templatePart.setNavigationRef') next = setNavigationRef(markup, o.from, o.to)
    else if (o.op === 'templatePart.removeBlock')
      next = o.block.path ? removeInlineLink(markup, o.block) : removeBlock(markup, o.block)
    else throw new Error(`unknown operation ${o.op}`)
    if (sha256(next) !== o.after)
      throw new Error(`${o.op} on ${o.key}: the result is not the bytes the map promises`)
    current.set(o.key, next)
  }
  return current
}
