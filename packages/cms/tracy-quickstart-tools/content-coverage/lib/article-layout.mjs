// Does the page of an article render the layout the article asks for? Since Joomla 6 an article's own
// `attribs.article_layout` is merged only when the menu or global value of that key is `use_article`, so an article
// asking for `<template>:tour` can be served with default.php and nothing else says so. The signal is the root
// element of the layout file: its literal classes, at least one of which default.php's root does not have, must sit
// together on one element of the served page. A layout whose root has no class of its own cannot be checked, and is
// reported so, never as a pass.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Published articles whose attribs name a layout (`<template>:<name>` or a bare `<name>`), from the dump's tables.
 * @param {Map<string, Record<string, any>[]>} tables
 * @param {string} prefix
 * @returns {{ id: string, alias: string, title: string, asked: string }[]}
 */
export function articlesAskingLayout(tables, prefix = '') {
  const out = []
  for (const [full, rows] of tables) {
    const table = (prefix && full.startsWith(prefix) ? full.slice(prefix.length) : full).replace(/^#__/, '')
    if (table !== 'content') continue
    for (const row of rows) {
      if (String(row.state ?? '') !== '1') continue
      let attribs = row.attribs
      if (typeof attribs === 'string') {
        try {
          attribs = JSON.parse(attribs)
        } catch {
          continue
        }
      }
      const asked = typeof attribs?.article_layout === 'string' ? attribs.article_layout.trim() : ''
      if (!asked) continue
      out.push({ id: String(row.id), alias: String(row.alias ?? ''), title: String(row.title ?? ''), asked })
    }
  }
  return out
}

/**
 * The classes of the first HTML element of a PHP layout. `literal` are whole class names written in the file; a
 * class glued to a PHP echo (`item-page<?php echo $sfx ?>`) is only a `fragment`, since the page may print it longer.
 * @param {string} php
 * @returns {{ literal: string[], fragments: string[] } | null}
 */
export function rootClassesOf(php) {
  // Strip until stable: one pass can leave a new marker behind (`<!<!---->--`), so a single replace is not enough.
  const stripped = (text, re, to) => {
    let out = text
    for (let prev = null; prev !== out; ) {
      prev = out
      out = out.replace(re, to)
    }
    return out
  }
  const html = stripped(
    stripped(String(php), /<\?(?:php|=)?[\s\S]*?(?:\?>|$)/g, '\u0000'),
    /<!--[\s\S]*?-->/g,
    ''
  )
  const tag = html.match(/<([a-z][a-z0-9-]*)\b([^>]*)>/i)
  if (!tag) return null
  const cls = tag[2].match(/\bclass\s*=\s*(["'])([\s\S]*?)\1/i)
  const literal = []
  const fragments = []
  for (const token of (cls?.[2] ?? '').split(/\s+/).filter(Boolean)) {
    if (!token.includes('\u0000')) literal.push(token)
    else fragments.push(...token.split('\u0000').filter(Boolean))
  }
  return { literal, fragments }
}

/** Every element's class list in an HTML page, each as a set. */
function classListsOf(html) {
  const lists = []
  for (const m of String(html).matchAll(/<[a-z][a-z0-9-]*\b[^>]*?\sclass\s*=\s*(["'])([^"']*)\1/gi))
    lists.push(new Set(m[2].split(/\s+/).filter(Boolean)))
  return lists
}

/**
 * What to look for: per asked layout of the active template, the root classes that prove it rendered.
 * @param {{ articles: ReturnType<typeof articlesAskingLayout>, webroot: string, template: string }} input
 */
export function planLayoutCheck({ articles, webroot, template }) {
  const tpl = String(template ?? '').toLowerCase()
  const dir = join(webroot, 'templates', template ?? '', 'html/com_content/article')
  const read = (file) => (existsSync(file) ? readFileSync(file, 'utf8') : null)
  const defaultPhp =
    read(join(dir, 'default.php')) ?? read(join(webroot, 'components/com_content/tmpl/article/default.php'))
  const defaultRoot = defaultPhp === null ? null : rootClassesOf(defaultPhp)
  const layouts = new Map()
  const expect = []
  const cannotCheck = []
  for (const a of articles) {
    const [owner, name] = a.asked.includes(':') ? a.asked.split(':', 2) : ['', a.asked]
    // Another template's layout, `_` (the active one's default) or default itself: nothing else is asked of the page.
    if ((owner && owner !== '_' && owner.toLowerCase() !== tpl) || !name || name === 'default') continue
    if (!layouts.has(name)) {
      const php = read(join(dir, `${name}.php`))
      if (php === null) continue
      const root = rootClassesOf(php)
      const own = new Set([...(defaultRoot?.literal ?? []), ...(defaultRoot?.fragments ?? [])])
      const distinct = (root?.literal ?? []).filter((c) => !own.has(c))
      const reason = !defaultRoot
        ? 'no default.php to compare with'
        : distinct.length === 0
          ? `the root element of ${name}.php has no class that default.php's root lacks`
          : null
      layouts.set(name, { name, file: `${name}.php`, signature: root?.literal ?? [], distinct, reason })
    }
    const layout = layouts.get(name)
    if (layout.reason)
      cannotCheck.push({ article: a.id, title: a.title, asked: a.asked, reason: layout.reason })
    else expect.push({ ...a, layout: name })
  }
  const checkable = [...layouts.values()].filter((l) => !l.reason)
  const defaultSignature = defaultRoot?.literal?.length ? defaultRoot.literal : null
  return {
    expect,
    cannotCheck,
    layouts: Object.fromEntries([...layouts].map(([k, l]) => [k, l])),
    /** The asked layouts (and `default`) whose root classes sit together on one element of this served HTML. */
    probe(html) {
      const lists = classListsOf(html)
      const has = (sig) => lists.some((set) => sig.every((c) => set.has(c)))
      const served = checkable.filter((l) => has(l.signature)).map((l) => l.name)
      if (defaultSignature && has(defaultSignature)) served.push('default')
      return served
    }
  }
}

/** The article id a URL opens: `?view=article&id=N`, or a last path part `N-alias` or `alias`. */
function articleOfUrl(url, byAlias) {
  let u
  try {
    u = new URL(url)
  } catch {
    return []
  }
  if (u.searchParams.get('view') === 'article') {
    const id = String(u.searchParams.get('id') ?? '').split(':')[0]
    return id ? [id] : []
  }
  const last = decodeURIComponent(u.pathname.replace(/\/$/, '').split('/').pop() ?? '').replace(
    /\.html?$/,
    ''
  )
  const withId = last.match(/^(\d+)-(.+)$/)
  if (withId) return [withId[1]]
  return byAlias.get(last) ?? []
}

/**
 * One finding per crawled page of an asked article that does not show the asked layout's root.
 * @param {{ plan: ReturnType<typeof planLayoutCheck>, mapPages: { entity: string, link?: string }[],
 *   pages: { url: string, mapPages?: { entity: string }[], bodyClass?: string, served: string[] }[] }} input
 */
export function layoutFindingsOf({ plan, mapPages, pages }) {
  const asked = new Map(plan.expect.map((a) => [a.id, a]))
  const byAlias = new Map()
  for (const a of plan.expect) byAlias.set(a.alias, [...(byAlias.get(a.alias) ?? []), a.id])
  const articleOfEntity = new Map()
  for (const p of mapPages ?? []) {
    const q = new URLSearchParams(String(p.link ?? '').split('?')[1] ?? '')
    if (q.get('view') === 'article' && q.get('id')) articleOfEntity.set(p.entity, q.get('id').split(':')[0])
  }
  const mismatches = []
  const seen = new Set()
  for (const p of pages) {
    const ids = new Set((p.mapPages ?? []).map((m) => articleOfEntity.get(m.entity)).filter(Boolean))
    // A path that only looks like an alias counts on an article view (Joomla puts `view-article` on the body).
    if (!ids.size && (!p.bodyClass || /\bview-article\b/.test(p.bodyClass)))
      for (const id of articleOfUrl(p.url, byAlias)) ids.add(id)
    for (const id of ids) {
      const a = asked.get(id)
      if (!a) continue
      seen.add(id)
      if (p.served.includes(a.layout)) continue
      const sig = plan.layouts[a.layout].signature
      const instead = p.served.includes('default') ? 'it shows the root of default.php' : 'it shows neither'
      mismatches.push({
        url: p.url,
        article: id,
        asked: a.asked,
        error: `article ${id} "${a.title}" asks layout ${a.asked} but its page has no element with the classes "${sig.join(' ')}" of ${a.layout}.php's root; ${instead}`
      })
    }
  }
  const notCrawled = plan.expect
    .filter((a) => !seen.has(a.id))
    .map((a) => ({ article: a.id, title: a.title, asked: a.asked }))
  return {
    mismatches,
    checked: seen.size,
    cannotCheck: [
      ...plan.cannotCheck,
      ...notCrawled.map((a) => ({ ...a, reason: 'the crawl reached no page of it' }))
    ]
  }
}
