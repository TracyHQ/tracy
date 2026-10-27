/**
 * A response body told in the visitor's terms (#1037, `own-domain.js`) — and, for a page, what it
 * says about the BYTES of itself and of its assets kept true once those bytes change.
 *
 * 🔒 THE PAGE IS PARSED, BY THE HTML STANDARD'S OWN PARSER (parse5), NEVER SEARCHED. Which text is
 * an attribute of a tag — and not text inside a script, a comment or a `<textarea>` — what an
 * attribute's value is once its character references are read, where an inline script ends and
 * what `<base>` says, are the parser's answers. This file builds no page of its own: every change
 * is written at the offsets the parser reported for one attribute or one inline block, in the
 * original text, and everything between the changes is the site's own bytes.
 *
 * Projecting a body replaces the site's Tracy address by the customer's domain, so the body is no
 * longer the one the CMS hashed. Three things carry such a hash, and each has one rule:
 *
 *   1. SUBRESOURCE INTEGRITY — `integrity="sha384-…"` on a `<script src>` / `<link href>`, and the
 *      `integrity` table of an import map. 🔒 RULE: the hash is REMOVED for an asset of the site
 *      itself — a reference that, read by the parser and resolved against the page's `<base>` by
 *      the URL Standard, lands on the site's own origin: that asset is served by this same proxy
 *      and may itself be projected. A hash on anybody else's file (a CDN) is not touched, and
 *      neither is that file's address.
 *   2. CONTENT-SECURITY-POLICY HASH SOURCES — `'sha256-…'` in the policy (response header, its
 *      report-only twin, or `<meta http-equiv>`) allowing one inline `<script>` / `<style>`, or
 *      with `'unsafe-hashes'` one inline handler or `style` attribute. 🔒 RULE: for every inline
 *      block this file CHANGED and whose hash the policy lists, the hash of the block AS SENT is
 *      ADDED beside it. Nothing else of the policy moves.
 *   3. BODY DIGESTS AND VALIDATORS — `Content-MD5`, `Digest`, `Content-Digest`, `Repr-Digest` are
 *      dropped, a strong `ETag` becomes a weak one and `Accept-Ranges` goes, on every response
 *      whose body this file may change (`site-proxy.js`).
 *
 * 🔒 WHAT THIS FILE CANNOT DO IS SAID, NOT GUESSED AT — AND NOT SENT HALF DONE. A body is either
 * told whole in the visitor's terms or not told at all: `projectBody` answers `unsupported: <why>`
 * with the site's own bytes untouched, and the proxy REFUSES that response on the own domain
 * (`site-proxy.js`: 502, `x-tracy-own-domain-projection: refused; reason=<why>`). The headers of a
 * response are projected as one with its body — a policy naming the customer's domain over a page
 * still naming the Tracy address, a canonical tag of the other name, an asset hash that no longer
 * matches — so a page that cannot be projected is not a page this name can serve, and a domain
 * whose home page is refused is never read as connected (`sites/domain-probe.js` asks for a 200).
 *
 *   xhtml               an `application/xhtml+xml` page (XML rules, not the HTML parser's)
 *   charset             a body that is not UTF-8 (by its BOM, its header, its `<meta>`, or its bytes)
 *   size                a body past `PROJECTED_MAX`
 *   csp-external-hash   a policy that allows one of the site's own scripts BY HASH (CSP3): that
 *                       leans on the very `integrity` attribute rule 1 would remove
 *   parse               a body, an inline `<script>` / `<style>` / JSON block, an event handler
 *                       or a `style` attribute that NAMES THE SITE and that its format's parser
 *                       refused or left partly unread — or a change the page's own text gave no
 *                       exact place to write
 *
 * `parse` is only ever about text that spells the site's host name: a block or a file that does not
 * has nothing to project whatever its syntax, and goes out as it is. What is by design left as the
 * site wrote it, without being an error: a string built at run time (a template literal with
 * expressions, a concatenation), and a `<script>` of a type no browser runs or reads as JSON.
 */
import { createHash } from 'node:crypto'
import { parse } from 'parse5'
import { URL_ATTRIBUTES, applied, bodyFormat } from './own-domain.js'

/** The largest body read whole to be projected; a bigger one is refused on an own domain (`size`). */
export const PROJECTED_MAX = 5 * 1024 * 1024
/** The response header that says a response was REFUSED because its body could not be projected, and why. */
export const PROJECTION_HEADER = 'x-tracy-own-domain-projection'

const HTML_NS = 'http://www.w3.org/1999/xhtml'
const HASH_SOURCE = /'(sha256|sha384|sha512)-([A-Za-z0-9+/_-]+={0,2})'/g
/** A base64 digest in one spelling, so `+/` and `-_`, padded or not, compare equal. */
const plain = (digest) => digest.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '')

/** The hash sources a policy text lists: `algorithm:digest` → the token as the policy spells it. */
function hashSources(policy, into = new Map()) {
  for (const [token, algorithm, digest] of String(policy ?? '').matchAll(HASH_SOURCE))
    if (!into.has(`${algorithm}:${plain(digest)}`)) into.set(`${algorithm}:${plain(digest)}`, token)
  return into
}

/** A hash source's digest of `text` as a browser computes it: UTF-8, line ends as the parser leaves them. */
const digestOf = (algorithm, text) =>
  createHash(algorithm).update(text.replace(/\r\n?/g, '\n'), 'utf8').digest('base64')

/** `policy` with each new hash written beside the one it stands for. */
export function withAddedHashes(policy, pairs) {
  let made = String(policy)
  for (const [listed, added] of pairs)
    if (made.includes(listed) && !made.includes(added)) made = made.split(listed).join(`${listed} ${added}`)
  return made
}

const escapedAttribute = (value) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
const SCRIPT_TYPES =
  /^(?:|module|(?:text|application)\/(?:javascript|x-javascript|ecmascript|jscript|livescript|x-ecmascript)|text\/javascript1\.[0-5])$/
const JSON_TYPES = /^(?:application\/json|speculationrules|[a-z]+\/[a-z0-9.-]+\+json)$/

/**
 * One HTML page in the visitor's terms.
 * @param {string} html - the page as the site sent it, decoded
 * @param {object} input
 * @param {ReturnType<import('./own-domain.js').originProjection>} input.projection
 * @param {URL} input.canonical - the site's own origin (its Tracy address)
 * @param {string} input.path - the path and query that was asked for, for relative URLs
 * @param {string[]} [input.policies] - the response's Content-Security-Policy header values
 * @returns {{ html: string, hashes: Array<[string, string]> } | { unsupported: string }}
 */
export function projectPage(html, input) {
  try {
    return pageProjected(html, input)
  } catch (error) {
    if (error instanceof Unprojectable) return { unsupported: error.reason }
    throw error
  }
}

/** Thrown inside `pageProjected`: the page cannot be told whole, and why. */
class Unprojectable extends Error {
  constructor(reason) {
    super(reason)
    this.reason = reason
  }
}
const unprojectable = (reason) => {
  throw new Unprojectable(reason)
}

function pageProjected(html, { projection, canonical, path, policies = [] }) {
  const listed = new Map()
  for (const policy of policies) hashSources(policy, listed)
  // Nothing on the page this file is about: it is not parsed at all.
  if (!projection.mentions(html) && !/integrity/i.test(html)) return { html, hashes: [] }

  let document
  try {
    document = parse(html, { sourceCodeLocationInfo: true, scriptingEnabled: false })
  } catch {
    unprojectable('parse')
  }
  const elements = []
  const collect = (node) => {
    if (node.tagName) elements.push(node)
    for (const child of node.childNodes ?? []) collect(child)
    if (node.content) collect(node.content)
  }
  collect(document)
  const html5 = (element) => element.namespaceURI === HTML_NS
  const key = (attr) => (attr.prefix ? `${attr.prefix}:${attr.name}` : attr.name).toLowerCase()
  const named = (element, name) => element.attrs.find((attr) => key(attr) === name)
  const valueOf = (element, name) => named(element, name)?.value ?? null

  // The page's own word on its encoding and its policies, as the parser read them.
  const metas = []
  for (const element of elements) {
    if (!html5(element) || element.tagName !== 'meta') continue
    const declared =
      valueOf(element, 'charset') ??
      (/^content-type$/i.test((valueOf(element, 'http-equiv') ?? '').trim())
        ? (/charset\s*=\s*["']?([^\s;"']+)/i.exec(valueOf(element, 'content') ?? '')?.[1] ?? null)
        : null)
    if (declared !== null && !/^(?:utf-?8|us-ascii)$/i.test(declared.trim())) unprojectable('charset')
    if (/^content-security-policy(?:-report-only)?$/i.test((valueOf(element, 'http-equiv') ?? '').trim())) {
      const content = named(element, 'content')
      if (content) {
        metas.push([element, content])
        hashSources(content.value, listed)
      }
    }
  }
  let base = new URL(path, canonical)
  const baseElement = elements.find(
    (element) => html5(element) && element.tagName === 'base' && named(element, 'href')
  )
  if (baseElement) {
    try {
      base = new URL(valueOf(baseElement, 'href'), base)
    } catch {
      /* A base that is no URL changes nothing. */
    }
  }
  /** Whether `reference` names a file of the site itself, as the browser will resolve it. */
  const ownAsset = (reference) => {
    try {
      return projection.own(new URL(reference, base))
    } catch {
      return false
    }
  }

  const edits = []
  const hashes = []
  // One refusal anywhere on the page is the page's (`Unprojectable`, caught by `projectPage`).
  const how = { refused: () => unprojectable('parse') }
  const algorithms = [...new Set([...listed.keys()].map((entry) => entry.split(':')[0]))]
  /** An inline block that was changed, whose hash the policy lists: the hash as sent is added. */
  const allow = (before, after) => {
    for (const algorithm of algorithms) {
      const token = listed.get(`${algorithm}:${plain(digestOf(algorithm, before))}`)
      if (token) hashes.push([token, `'${algorithm}-${digestOf(algorithm, after)}'`])
    }
  }
  /** Where one attribute is written, or null when the parser did not say. */
  const span = (element, attr) => {
    const at = element.sourceCodeLocation?.attrs?.[key(attr)]
    if (!at) return null
    const raw = html.slice(at.startOffset, at.endOffset)
    const eq = raw.indexOf('=')
    if (eq === -1) return null
    // Read back: the bytes there must BE this attribute, or nothing is written.
    const name = raw.slice(0, eq).trimEnd()
    return name.toLowerCase() === key(attr) ? { start: at.startOffset, end: at.endOffset, name } : null
  }
  const rewrite = (element, attr, value) => {
    const at = span(element, attr)
    if (at === null) return false
    edits.push([at.start, at.end, `${at.name}="${escapedAttribute(value)}"`])
    return true
  }
  /** The text of an element whose content is one text node written exactly as the parser read it. */
  const inline = (element) => {
    if (element.childNodes.length !== 1 || element.childNodes[0].nodeName !== '#text') return null
    const node = element.childNodes[0]
    const at = node.sourceCodeLocation
    if (!at) return null
    const raw = html.slice(at.startOffset, at.endOffset)
    return raw.replace(/\r\n?/g, '\n') === node.value
      ? { start: at.startOffset, end: at.endOffset, raw }
      : null
  }

  for (const element of elements) {
    const tag = element.tagName
    // Rule 1: the hash of one of the site's own files goes.
    const integrity = named(element, 'integrity')
    const reference = valueOf(element, tag === 'link' ? 'href' : 'src')
    if (integrity && reference !== null && ownAsset(reference)) {
      if (tag === 'script')
        for (const [, algorithm, digest] of ` ${integrity.value} `.matchAll(
          /\s(sha256|sha384|sha512)-([A-Za-z0-9+/_-]+={0,2})(?=[\s?])/g
        ))
          if (listed.has(`${algorithm}:${plain(digest)}`)) unprojectable('csp-external-hash')
      const at = element.sourceCodeLocation?.attrs?.integrity
      // A hash that must go and cannot be found where the parser said it is: not left standing.
      if (!at || !/^integrity\b/i.test(html.slice(at.startOffset, at.endOffset))) unprojectable('parse')
      edits.push([at.startOffset, at.endOffset, ''])
    }
    for (const attr of element.attrs) {
      const name = key(attr)
      if (name === 'integrity') continue
      if (metas.some(([meta, content]) => meta === element && content === attr)) continue
      let made = null
      let hashed = false
      if (name.endsWith('srcset')) made = projection.srcset(attr.value)
      else if (name === 'style') {
        made = projection.css(attr.value, { declarations: true, ...how })
        hashed = true
      } else if (name.startsWith('on')) {
        made = projection.script(attr.value, { handler: true, ...how })
        hashed = true
      } else if (name === 'ping') {
        const parts = attr.value.split(/([\t\n\f\r ]+)/)
        const told = parts.map((part) => projection.url(part, { schemeless: true }) ?? part)
        made = told.join('') === attr.value ? null : told.join('')
      } else if (
        tag === 'meta' &&
        name === 'content' &&
        /^refresh$/i.test((valueOf(element, 'http-equiv') ?? '').trim())
      )
        made = projection.header('refresh', attr.value)
      else {
        made = projection.url(attr.value, { schemeless: URL_ATTRIBUTES.has(name) })
        // A value that is JSON by its own shape (a widget's `data-settings`). One that has the shape,
        // names the site and is not JSON (a JavaScript object literal) has no reader here: refused.
        if (made === null && /^\s*[{[]/.test(attr.value)) made = projection.json(attr.value, how)
      }
      if (made === null) continue
      // A value that must change and has no exact place to be written is not left as it was.
      if (!rewrite(element, attr, made)) unprojectable('parse')
      if (hashed) allow(attr.value, made)
    }
    if (tag !== 'script' && tag !== 'style') continue
    // Which reader the block is for; a block no browser runs or reads as JSON is data, left alone.
    let read = null
    if (tag === 'style') read = (text) => projection.css(text, how)
    else if (!named(element, 'src')) {
      const kind = (valueOf(element, 'type') ?? '').trim().toLowerCase()
      if (kind === 'importmap') read = (text) => importMap(text, { projection, ownAsset, ...how })
      else if (JSON_TYPES.test(kind)) read = (text) => projection.json(text, how)
      else if (SCRIPT_TYPES.test(kind)) read = (text) => projection.script(text, how)
    }
    if (read === null) continue
    const content = inline(element)
    if (content === null) {
      // Not one run of text written as the parser read it: nothing can be written into it at exact
      // offsets, so a block that names the site cannot be told.
      const said = element.childNodes.map((node) => node.value ?? '').join('')
      if (projection.mentions(said)) unprojectable('parse')
      continue
    }
    const made = read(content.raw)
    if (made === null || made === content.raw) continue
    // The block must still end where it ended: nothing written into it may close the element.
    if (new RegExp(`</${tag}`, 'i').test(made) && !new RegExp(`</${tag}`, 'i').test(content.raw))
      unprojectable('parse')
    edits.push([content.start, content.end, made])
    allow(content.raw, made)
  }
  // A policy written in the page: its sources told, and the new hashes listed in it.
  for (const [element, content] of metas) {
    const made = withAddedHashes(projection.policy(content.value) ?? content.value, hashes)
    if (made !== content.value && !rewrite(element, content, made)) unprojectable('parse')
  }
  return { html: edits.length === 0 ? html : applied(html, edits), hashes }
}

/** An import map with the site's own entries told and their `integrity` rows removed, or null. */
function importMap(text, { projection, ownAsset, refused = null }) {
  let map
  try {
    map = JSON.parse(text)
  } catch {
    // A browser ignores a map that is not JSON; one that names the site is still not told.
    if (projection.mentions(text)) refused?.()
    return null
  }
  if (!map || typeof map !== 'object' || Array.isArray(map)) return null
  let changed = false
  const told = (value) => {
    const made = typeof value === 'string' ? projection.url(value) : null
    if (made === null) return value
    changed = true
    return made
  }
  const table = (entries) =>
    entries && typeof entries === 'object' && !Array.isArray(entries)
      ? Object.fromEntries(Object.entries(entries).map(([name, value]) => [told(name), told(value)]))
      : entries
  if ('imports' in map) map.imports = table(map.imports)
  if (map.scopes && typeof map.scopes === 'object' && !Array.isArray(map.scopes))
    map.scopes = Object.fromEntries(
      Object.entries(map.scopes).map(([scope, entries]) => [told(scope), table(entries)])
    )
  if (map.integrity && typeof map.integrity === 'object' && !Array.isArray(map.integrity)) {
    for (const name of Object.keys(map.integrity).filter(ownAsset)) {
      delete map.integrity[name]
      changed = true
    }
    if (Object.keys(map.integrity).length === 0) delete map.integrity
  }
  // `<` cannot end the element from inside a string: written as its escape.
  return changed ? JSON.stringify(map).replace(/</g, '\\u003c') : null
}

/**
 * The text of a body that is UTF-8 by everything it says about itself, or null: a BOM of another
 * encoding, a `charset` that is not UTF-8, or bytes that are not valid UTF-8.
 * @param {Uint8Array} bytes
 * @param {string | null} contentType
 * @returns {{ text: string, bom: boolean } | null}
 */
export function utf8Text(bytes, contentType) {
  const bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
  if ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff)) return null
  const charset = /;\s*charset\s*=\s*"?([^\s;"]+)/i.exec(String(contentType ?? ''))?.[1] ?? null
  if (!bom && charset !== null && !/^(?:utf-?8|us-ascii)$/i.test(charset)) return null
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bom ? bytes.subarray(3) : bytes), bom }
  } catch {
    return null
  }
}

/**
 * One response body in the visitor's terms.
 * @param {Uint8Array} bytes - the whole body as the site sent it
 * @param {object} input
 * @param {string | null} input.contentType
 * @param {ReturnType<import('./own-domain.js').originProjection>} input.projection
 * @param {URL} input.canonical
 * @param {string} input.path - the path and query that was asked for
 * @param {string[]} [input.policies]
 * @returns {{ bytes: Uint8Array, changed: boolean, hashes: Array<[string, string]>, unsupported?: string }}
 *   `bytes` are the site's own whenever `changed` is false; with `unsupported` the body could not be
 *   told whole and the caller must not send it on the own domain
 */
export function projectBody(bytes, { contentType, projection, canonical, path, policies = [] }) {
  const same = (unsupported) => ({
    bytes,
    changed: false,
    hashes: [],
    ...(unsupported ? { unsupported } : {})
  })
  const format = bodyFormat(contentType)
  if (format === null || bytes.length === 0) return same()
  if (format === 'xhtml') return same('xhtml')
  if (bytes.length > PROJECTED_MAX) return same('size')
  const decoded = utf8Text(bytes, contentType)
  if (decoded === null) return same('charset')
  const { text, bom } = decoded
  let made = null
  let hashes = []
  let unread = false
  const how = {
    refused() {
      unread = true
    }
  }
  if (format === 'html') {
    const page = projectPage(text, { projection, canonical, path, policies })
    if (page.unsupported) return same(page.unsupported)
    made = page.html
    hashes = page.hashes
  } else if (format === 'script') made = projection.script(text, how)
  else if (format === 'json') made = projection.json(text, how)
  else if (format === 'css') made = projection.css(text, how)
  else if (format === 'xml') made = projection.xml(text, how)
  else if (format === 'plain' && /^\/robots\.txt(?:\?|$)/i.test(path)) made = projection.robots(text)
  if (unread) return same('parse')
  if (made === null || made === text) return same()
  return { bytes: Buffer.from(`${bom ? '﻿' : ''}${made}`, 'utf8'), changed: true, hashes }
}
