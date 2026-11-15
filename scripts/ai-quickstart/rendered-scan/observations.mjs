// What a rendered page says and shows, read from its HTML with no browser (ticket #585): every piece of words a visitor
// or a search engine reads, every picture address and every link. Hidden means removed from the HTML (ADR 0044,
// decision 2), so words hidden by CSS or a `hidden` attribute are read like any other. Pure.
import { parseHTML } from 'linkedom'

const SKIP = new Set(['script', 'style', 'template', 'noscript', 'svg'])
const BLOCK = new Set(
  'address article aside blockquote body button dd details dialog div dl dt fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hr label legend li main nav ol option p pre section select summary table tbody td textarea tfoot th thead tr ul'.split(
    ' '
  )
)
/** The elements the host reads a block of words from (tracy-host `demo-qa-browser.js`): innermost only. */
const HOST_BLOCK = 'p,h1,h2,h3,h4,h5,h6,li,td,th,figcaption,blockquote,dt,dd,address,summary'
const HOST_BLOCK_TAGS = new Set(HOST_BLOCK.split(','))
const META_NAMES = new Set(['description', 'author', 'keywords'])
const BUTTON_TYPES = new Set(['submit', 'button', 'reset'])
const MENU_TOKEN = /(^|[-_])(nav|navbar|navigation|menu|mainmenu|megamenu)($|[-_])/i
const CSS_URL = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi
const PLACE_MAX = 40

const squash = (text) =>
  String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
const cut = (text) => [...text].slice(0, PLACE_MAX).join('')
const tagOf = (el) => String(el.localName ?? el.tagName ?? '').toLowerCase()

function inMenu(el) {
  for (let n = el; n && n.nodeType === 1; n = n.parentNode) {
    if (tagOf(n) === 'nav' || n.getAttribute('role') === 'navigation') return true
    const tokens = `${n.getAttribute('class') ?? ''} ${n.getAttribute('id') ?? ''}`.split(/\s+/)
    if (tokens.some((t) => MENU_TOKEN.test(t))) return true
  }
  return false
}

/** A place the built site check keeps: the element (and attribute) and whether it sits in a menu. */
const placeOf = (el, element) => ({ element: cut(element), ...(el && inMenu(el) ? { menu: true } : {}) })

/** The words of an element as a visitor reads them: a block child and a line break set apart by a space. */
function wordsOf(el) {
  const parts = []
  const walk = (n) => {
    if (n.nodeType === 3) return parts.push(n.data)
    if (n.nodeType !== 1 || SKIP.has(tagOf(n))) return
    const tag = tagOf(n)
    if (tag === 'br') return parts.push(' ')
    const block = BLOCK.has(tag)
    if (block) parts.push(' ')
    for (const c of n.childNodes) walk(c)
    if (block) parts.push(' ')
  }
  walk(el)
  return squash(parts.join(''))
}

const documentOf = (html) => {
  const source = String(html ?? '')
  const whole = /<body[\s>]/i.test(source) && /<html[\s>]/i.test(source)
  return parseHTML(whole ? source : `<!doctype html><html><head></head><body>${source}</body></html>`)
    .document
}

/**
 * The words of each block element that holds words of its own: its text nodes and inline children joined (so words
 * split by a `<strong>` stay one sentence), a nested block or a line break read apart.
 */
function ownTexts(body, add) {
  const walk = (el) => {
    const own = (n) => {
      let out = ''
      for (const c of n.childNodes) {
        if (c.nodeType === 3) out += c.data
        else if (c.nodeType !== 1 || SKIP.has(tagOf(c))) continue
        else if (tagOf(c) === 'br') out += '\n'
        else if (BLOCK.has(tagOf(c))) {
          out += '\n'
          walk(c)
        } else out += own(c)
      }
      return out
    }
    for (const line of own(el).split('\n'))
      if (squash(line)) add('text', squash(line), placeOf(el, tagOf(el)))
  }
  walk(body)
}

/** The blocks of words the host hashes: innermost text elements, and divs with words of their own. */
function hostBlocks(body, add) {
  for (const el of body.querySelectorAll(`${HOST_BLOCK},div`)) {
    if (el.querySelector(HOST_BLOCK)) continue
    if (!HOST_BLOCK_TAGS.has(tagOf(el)) && ![...el.childNodes].some((n) => n.nodeType === 3 && n.data.trim()))
      continue
    const text = wordsOf(el)
    if (text) add('block', text.slice(0, 500), placeOf(el, tagOf(el)))
  }
}

function jsonLdTexts(doc, add) {
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    let data
    try {
      data = JSON.parse(script.textContent ?? '')
    } catch {
      continue
    }
    const walk = (v) => {
      if (typeof v === 'string' && squash(v)) {
        add('jsonld', squash(v), placeOf(null, 'script[ld+json]'))
        if (/^(?:https?:)?\/?\/?[^\s]+\.(?:avif|gif|jpe?g|png|svg|webp)(?:[?#].*)?$/i.test(v.trim()))
          add('image', v.trim(), placeOf(null, 'script[ld+json]'))
      } else if (Array.isArray(v)) v.forEach(walk)
      else if (v && typeof v === 'object') Object.values(v).forEach(walk)
    }
    walk(data)
  }
}

const srcsetUrls = (value) =>
  String(value ?? '')
    .split(',')
    .map((part) => part.trim().split(/\s+/)[0])
    .filter(Boolean)

function pictures(doc, add) {
  const attr = (selector, name, element) => {
    for (const el of doc.querySelectorAll(selector)) {
      const v = el.getAttribute(name)
      if (!v) continue
      for (const url of name.endsWith('srcset') ? srcsetUrls(v) : [v.trim()])
        add('image', url, placeOf(el, element))
    }
  }
  attr('img[src]', 'src', 'img[src]')
  attr('img[data-src]', 'data-src', 'img[data-src]')
  attr('img[srcset]', 'srcset', 'img[srcset]')
  attr('img[data-srcset]', 'data-srcset', 'img[data-srcset]')
  attr('picture source[srcset]', 'srcset', 'source[srcset]')
  attr('video[poster]', 'poster', 'video[poster]')
  attr('video[src]', 'src', 'video[src]')
  attr('video source[src]', 'src', 'source[src]')
  for (const el of doc.querySelectorAll('[style]'))
    for (const m of String(el.getAttribute('style')).matchAll(CSS_URL))
      add('image', m[2].trim(), placeOf(el, `${tagOf(el)}[style]`))
}

function heads(doc, add) {
  const title = doc.querySelector('title')
  if (title && squash(title.textContent)) add('title', squash(title.textContent), placeOf(null, 'title'))
  for (const meta of doc.querySelectorAll('meta[content]')) {
    const name = String(meta.getAttribute('name') ?? meta.getAttribute('property') ?? '').toLowerCase()
    if (!(META_NAMES.has(name) || name.startsWith('og:') || name.startsWith('twitter:'))) continue
    const content = squash(meta.getAttribute('content'))
    if (!content) continue
    const place = placeOf(null, `meta[${name}]`)
    add(/:image(?::url|:secure_url)?$/.test(name) ? 'image' : 'meta', content, place)
  }
}

function attributes(body, add) {
  for (const name of ['alt', 'title', 'aria-label', 'placeholder'])
    for (const el of body.querySelectorAll(`[${name}]`)) {
      const v = squash(el.getAttribute(name))
      if (v) add('attr', v, placeOf(el, `${tagOf(el)}[${name}]`))
    }
  for (const el of body.querySelectorAll('button[value], input[value]')) {
    if (tagOf(el) === 'input' && !BUTTON_TYPES.has(String(el.getAttribute('type')).toLowerCase())) continue
    const v = squash(el.getAttribute('value'))
    if (v) add('attr', v, placeOf(el, `${tagOf(el)}[value]`))
  }
  for (const el of body.querySelectorAll('a[href], area[href]'))
    add('href', String(el.getAttribute('href')).trim(), placeOf(el, `${tagOf(el)}[href]`))
}

/**
 * Every observation of a rendered page: `{kind, value, place}`, `kind` one of `text` (the words of a block, nested
 * blocks apart), `block` (a block of words as the host hashes it), `attr`, `title`, `meta`, `jsonld`, `image`, `href`.
 * @param {string} html
 * @returns {Array<{kind: string, value: string, place: {element: string, menu?: true}}>}
 */
export function observationsFromHtml(html) {
  const doc = documentOf(html)
  const out = []
  const add = (kind, value, place) => out.push({ kind, value, place })
  if (doc.head) heads(doc, add)
  jsonLdTexts(doc, add)
  if (doc.body) {
    ownTexts(doc.body, add)
    hostBlocks(doc.body, add)
    attributes(doc.body, add)
  }
  pictures(doc, add)
  return out
}

/** The ids and anchor names a page holds, for a `#` link to land on. */
export function anchorsOf(html) {
  const doc = documentOf(html)
  const ids = new Set()
  for (const el of doc.querySelectorAll('[id]')) ids.add(el.getAttribute('id'))
  for (const el of doc.querySelectorAll('a[name]')) ids.add(el.getAttribute('name'))
  return ids
}
