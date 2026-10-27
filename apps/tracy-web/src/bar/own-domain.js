/**
 * A site answering on a domain of the customer's own, while its CMS goes on believing it lives at
 * its Tracy address (#1037).
 *
 * 🔒 TWO ORIGINS, ONE CANONICAL. The CMS keeps exactly one address — the Tracy one. Connecting a
 * domain never changes it: WordPress `home`/`siteurl`, Joomla `$live_site` and `EMDASH_SITE_URL`
 * stay as they are, so the admin, its sign-in (the Tracy Access plugins, which trust headers only
 * this proxy sets) and an EmDash passkey (whose RP ID is the site URL's hostname) keep working where
 * they always did. A request on the own domain is told to the CMS as a request on the Tracy address
 * (`site-proxy.js` `originRequest`), so the CMS never redirects it "home"; what comes back names the
 * Tracy address, and this file puts the visitor's own domain in its place.
 *
 * 🔒 A URL IS PROJECTED ONLY AS A COMPLETE VALUE THE CONTAINING FORMAT HANDED OVER — NEVER FOUND BY
 * SEARCHING TEXT. Where an address begins and ends is decided by the parser of the format it is
 * written in, not by this file:
 *
 *   HTML        parse5 (attributes, `<base>`, inline `<script>`/`<style>`) — `own-domain-integrity.js`
 *   JavaScript  acorn: a static string literal, or a template literal with no expressions
 *   JSON        `JSON.parse` says it is JSON; acorn (JSON is a subset of JavaScript) says where each
 *               string is, so only those bytes change — numbers are never re-serialized
 *   CSS         css-tree: `url(…)` and the string of an `@import`
 *   XML / SVG   saxes: an attribute value, an element's whole text or CDATA, `<?xml-stylesheet?>`
 *   headers     `Location` / `Content-Location` (one URL), each `<URI>` of `Link`, each source of a
 *               Content-Security-Policy, any other header whose whole value is one URL
 *
 * The value is then read by the URL Standard's own parser (`new URL`), and replaced only when BOTH
 * hold: the parser says its origin is the site's (no user name, no password), and it is spelled in
 * the one plain form whose authority this file can replace exactly — `[scheme:]//host[:port]`
 * followed by `/`, `?`, `#` or the end of the value. Everything else is left as the site wrote it:
 * a value that is not wholly a URL, a spelling the parser would read differently (`\`, a tab, an
 * encoded host), a string a script goes on to build something from (see `staticString`). Leaving an
 * address of the site unprojected costs a link that still works — it opens the Tracy address;
 * projecting one that was not the site's would be changing a stranger's link.
 *
 * PERCENT-ENCODING is decoded in exactly one place: a value of the QUERY of a URL that was itself
 * parsed as above (`?redirect_to=https%3A%2F%2F…`, a share link's `?url=`), by the query's own
 * format (`&`-separated `name=value`, `+` a space) — and such a value is replaced only when its
 * authority ends inside it (`https://host/…`), so nothing after the next `&` or `+` can belong to
 * its host however the query is read. A percent-encoded string met anywhere else is not known to
 * be a URL and is not touched.
 *
 * WHAT HAS A HASH OF THESE BYTES is kept true beside this file: `own-domain-integrity.js`.
 */
import { parse as parseScript, parseExpressionAt } from 'acorn'
import { parse as parseCss, walk as walkCss } from 'css-tree'
import { SaxesParser } from 'saxes'
import { isTracyCookieName } from '../lib/cookies.js'

const type = (contentType) =>
  String(contentType ?? '')
    .split(';')[0]
    .trim()
    .toLowerCase()

/**
 * The format a response body is projected as, or null: bytes this file never reads (images, fonts,
 * archives, video) and text formats it has no parser for.
 * @param {string | null} contentType
 * @returns {'html' | 'xhtml' | 'script' | 'json' | 'css' | 'xml' | 'plain' | null}
 */
export function bodyFormat(contentType) {
  const mime = type(contentType)
  if (mime === 'text/html') return 'html'
  if (mime === 'application/xhtml+xml') return 'xhtml'
  if (/^(?:text|application)\/(?:javascript|x-javascript|ecmascript)$/.test(mime)) return 'script'
  if (mime === 'application/json' || mime === 'text/json' || /^[a-z]+\/[a-z0-9.-]+\+json$/.test(mime))
    return 'json'
  if (mime === 'text/css') return 'css'
  if (mime === 'text/xml' || mime === 'application/xml' || /^[a-z]+\/[a-z0-9.-]+\+xml$/.test(mime))
    return 'xml'
  if (mime === 'text/plain') return 'plain'
  return null
}

/** Whether a body of this content type may be told in the visitor's terms at all. */
export const projectable = (contentType) => bodyFormat(contentType) !== null

/**
 * `[scheme:]//authority` and what follows, white space allowed only around the whole: the authority
 * has none of the characters that end one, and the rest none that a URL is never written with (a
 * space, a quote, `<`, `>`, a backslash) — text that merely begins with an address is not one.
 */
const SPELLED = /^([\t\n\f\r ]*)(?:(https?):)?\/\/([^/?#\\@\s]*)([^\s<>"`\\]*)([\t\n\f\r ]*)$/i
/** Attributes whose value is one URL by HTML's or SVG's own definition (so `//host/…` is one too). */
export const URL_ATTRIBUTES = new Set([
  'href',
  'xlink:href',
  'src',
  'action',
  'formaction',
  'poster',
  'data',
  'cite',
  'manifest',
  'background',
  'longdesc'
])
/** How deep a URL inside a URL's query inside a URL's query is followed. */
const QUERY_DEPTH = 2
/** A comment that is nothing but a source directive: its lead, then the one URL it names. */
const DIRECTIVE = /^([#@][ \t]*source(?:Mapping)?URL=)(\S+)[ \t]*$/

const escapedScript = (value) => JSON.stringify(value).replace(/</g, '\\u003c')
const escapedCss = (value) => value.replace(/["\\<\n\r\f]/g, (ch) => `\\${ch.codePointAt(0).toString(16)} `)
const escapedXml = (value, quote = '') =>
  value.replace(/[&<>"']/g, (ch) =>
    ch === '&'
      ? '&amp;'
      : ch === '<'
        ? '&lt;'
        : ch === '>'
          ? '&gt;'
          : ch === quote
            ? ch === '"'
              ? '&quot;'
              : '&apos;'
            : ch
  )
const XML_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
/** XML text with the five predefined entities read; anything else in it is left to disagree. */
const unescapedXml = (raw) => raw.replace(/&(amp|lt|gt|quot|apos);/g, (_, name) => XML_ENTITIES[name])

/** `text` with `[start, end, replacement]` edits applied, last first so no offset moves. */
export function applied(text, edits) {
  let made = text
  for (const [start, end, replacement] of [...edits].sort((a, b) => b[0] - a[0]))
    made = made.slice(0, start) + replacement + made.slice(end)
  return made
}

/**
 * The projection of one origin onto another.
 * @param {URL} from - the origin whose URLs are found (either scheme of its host is the site's)
 * @param {URL} to - the origin written in its place, scheme included
 */
export function originProjection(from, to) {
  const host = from.hostname.toLowerCase()
  const ports = from.port ? [from.port] : ['80', '443']
  const portOf = (url) => url.port || (url.protocol === 'https:' ? '443' : '80')
  /** Cheap and safe: a body that never spells the host name has nothing to project. */
  const mentions = (text) => text.toLowerCase().includes(host)

  /** Whether a parsed URL is one of the site's own: its host, its port, nobody's credentials. */
  const own = (url) =>
    (url.protocol === 'http:' || url.protocol === 'https:') &&
    url.username === '' &&
    url.password === '' &&
    url.hostname.toLowerCase() === host &&
    ports.includes(portOf(url))

  /** The query of `rest` (`/path?query#fragment`) with each value that is a URL of the site projected. */
  const query = (rest, depth) => {
    const hash = rest.indexOf('#')
    const mark = rest.indexOf('?')
    if (mark === -1 || (hash !== -1 && hash < mark) || depth > QUERY_DEPTH) return rest
    const end = hash === -1 ? rest.length : hash
    let changed = false
    const pairs = rest
      .slice(mark + 1, end)
      .split('&')
      .map((pair) => {
        const eq = pair.indexOf('=')
        if (eq === -1) return pair
        let value
        try {
          value = decodeURIComponent(pair.slice(eq + 1).replace(/\+/g, ' '))
        } catch {
          return pair
        }
        // 🔒 `continued`: whoever reads the outer URL may read its query whole rather than pair by
        // pair, so a value counts only when its authority has ended INSIDE it — what follows the
        // next `&` can then no longer be part of its host.
        const made = url(value, { continued: true }, depth + 1)
        if (made === null) return pair
        changed = true
        return `${pair.slice(0, eq + 1)}${encodeURIComponent(made)}`
      })
    return changed ? `${rest.slice(0, mark + 1)}${pairs.join('&')}${rest.slice(end)}` : rest
  }

  /**
   * One complete URL value in the visitor's terms, or null when it is not to be changed.
   * @param {string} value
   * @param {object} [how]
   * @param {boolean} [how.schemeless] - the format defines the value as a URL, so `//host/…` is one
   * @param {boolean} [how.continued] - something is appended to the value at run time: its authority
   *   must already have ended inside it (`https://host/…`), or what follows could still be part of it
   */
  function url(value, { schemeless = false, continued = false } = {}, depth = 0) {
    const spelled = SPELLED.exec(String(value))
    if (!spelled) {
      // A relative reference where the format says the value is a URL (`/share?u=…`): it names no
      // host, so only its query can carry an address. Anything with a scheme or `\` is not read.
      if (!schemeless || /^[\t\n\f\r ]*(?:[a-z][a-z0-9+.-]*:|[\\/]{2})/i.test(value) || value.includes('\\'))
        return null
      const told = query(String(value), depth)
      return told === value ? null : told
    }
    const [, lead, scheme, authority, rest, trail] = spelled
    if (!scheme && !schemeless) return null
    if (rest !== '' && !'/?#'.includes(rest[0])) return null
    if (continued && rest === '') return null
    let parsed
    try {
      parsed = new URL(`${scheme ?? from.protocol.replace(':', '')}://${authority}${rest}`)
    } catch {
      return null
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    const told = query(rest, depth)
    // The authority as written is the host the parser read — not a spelling of some other one.
    const plain = authority.toLowerCase()
    if (own(parsed) && (plain === host || plain === `${host}:${portOf(parsed)}`))
      return `${lead}${scheme ? to.protocol : ''}//${to.host}${told}${trail}`
    return told === rest ? null : `${lead}${scheme ? `${scheme}:` : ''}//${authority}${told}${trail}`
  }

  /**
   * Whether a string in a script is a value of its own, and how it may be read: null when it is
   * part of something the script builds (the right-hand side of a `+`, the object a method is called on).
   * 🔒 IN A SCRIPT A STRING IS ALWAYS READ AS `continued`: code can append to any string it holds
   * (`u += '@other.example/'` two statements later), so only a string whose authority has ended
   * INSIDE it (`https://host/…`) is known to be an address of the site. In JSON — data, where a
   * value is whole by the format — a bare origin is one too.
   */
  const staticString = (node, ancestors, data) => {
    let continued = !data
    let child = node
    for (let i = ancestors.length - 1; i >= 0; i--) {
      const parent = ancestors[i]
      if (parent.type === 'BinaryExpression' && parent.operator === '+') {
        if (parent.right === child) return null
        continued = true
      } else if (parent.type === 'AssignmentExpression' && parent.operator === '+=') {
        return null
      } else {
        if (parent.type === 'MemberExpression' && parent.object === child) return null
        if (parent.type === 'TaggedTemplateExpression') return null
        if (parent.type === 'TemplateLiteral') return null
        const key =
          parent.type === 'Property' ||
          parent.type === 'PropertyDefinition' ||
          parent.type === 'MethodDefinition'
        if (key && parent.key === child && !parent.computed) return null
        break
      }
      child = parent
    }
    return { continued }
  }

  /**
   * The edit of one comment a parser handed over whole, when it is a source directive
   * (`# sourceURL=<url>`, `# sourceMappingURL=<url>` — what WordPress closes every inline style and
   * script with). The directive defines what follows `=` as one URL, to the end of the comment; no
   * other comment is read.
   * @param {string} text - the comment between its delimiters
   * @param {number} at - where that text starts in the source
   */
  const directiveEdit = (text, at) => {
    const told = DIRECTIVE.exec(text)
    if (!told) return null
    const made = url(told[2], { schemeless: true })
    if (made === null || /\*\/|\s/.test(made)) return null
    return [at + told[1].length, at + told[1].length + told[2].length, made]
  }

  /** The string edits of one parsed script, or (`data`) of one JSON text. */
  const stringEdits = (tree, data = false) => {
    const edits = []
    const visit = (node, ancestors) => {
      if (!node || typeof node.type !== 'string') return
      let value = null
      if (node.type === 'Literal' && typeof node.value === 'string') value = node.value
      else if (node.type === 'TemplateLiteral' && node.expressions.length === 0)
        value = node.quasis[0]?.value?.cooked ?? null
      if (value !== null) {
        const how = staticString(node, ancestors, data)
        const made = how === null ? null : url(value, how)
        if (made !== null) edits.push([node.start, node.end, escapedScript(made)])
        return
      }
      ancestors.push(node)
      for (const key of Object.keys(node)) {
        const child = node[key]
        if (Array.isArray(child)) for (const item of child) visit(item, ancestors)
        else if (child && typeof child === 'object') visit(child, ancestors)
      }
      ancestors.pop()
    }
    visit(tree, [])
    return edits
  }

  /**
   * A script in the visitor's terms, or null (nothing to change, or not a script acorn reads).
   * @param {string} text
   * @param {{ handler?: boolean, refused?: () => void }} [how] - `handler`: an event handler
   *   attribute, the body of a function; `refused`: told when the text could not be parsed
   */
  function script(text, { handler = false, refused = null } = {}) {
    if (!mentions(text)) return null
    let tree = null
    let comments = []
    for (const sourceType of ['script', 'module']) {
      comments = []
      try {
        tree = parseScript(text, {
          ecmaVersion: 'latest',
          sourceType,
          allowHashBang: true,
          allowReturnOutsideFunction: handler,
          onComment: (_block, said, start) => comments.push(directiveEdit(said, start + 2))
        })
        break
      } catch {
        /* Tried as the other kind next; a text that is neither is not projected. */
      }
    }
    if (tree === null) {
      refused?.()
      return null
    }
    const edits = [...stringEdits(tree), ...comments.filter(Boolean)]
    return edits.length === 0 ? null : applied(text, edits)
  }

  /** JSON in the visitor's terms, or null. Only string VALUES change, byte for byte elsewhere. */
  function json(text, { refused = null } = {}) {
    if (!mentions(text)) return null
    let tree
    try {
      JSON.parse(text)
      tree = parseExpressionAt(text, 0, { ecmaVersion: 'latest' })
      // The whole text was one expression: nothing but white space may follow it.
      if (text.slice(tree.end).trim() !== '') throw new Error('not one value')
    } catch {
      refused?.()
      return null
    }
    const edits = stringEdits(tree, true)
    return edits.length === 0 ? null : applied(text, edits)
  }

  /**
   * A style sheet (or, with `declarations`, the value of a `style` attribute) in the visitor's
   * terms, or null. Only `url(…)` and the address of an `@import` are URLs by CSS's definition.
   */
  function css(text, { declarations = false, refused = null } = {}) {
    if (!mentions(text)) return null
    const edits = []
    let tree
    try {
      tree = parseCss(text, {
        positions: true,
        context: declarations ? 'declarationList' : 'stylesheet',
        // A custom property's value is read like any other, so a `url()` in it is found.
        parseCustomProperty: true,
        // What the parser could not read is kept in the tree as `Raw`, and judged below.
        onParseError() {},
        onComment(said, loc) {
          const edit = directiveEdit(said, loc.start.offset + 2)
          if (edit) edits.push(edit)
        }
      })
    } catch {
      refused?.()
      return null
    }
    // 🔒 A PART THE PARSER DID NOT READ, THAT NAMES THE SITE, IS NOT SKIPPED IN SILENCE. css-tree
    // recovers from what it cannot parse (an old browser hack, a broken rule) by keeping it as
    // `Raw`. Raw text that never spells the host has nothing to project, so leaving it is exact;
    // Raw text that does may hold an address this function would not have told — the sheet would
    // go out half projected. That is said (`refused`), and nothing of the sheet is changed.
    let unread = false
    walkCss(tree, (node) => {
      if (node.type === 'Raw' && mentions(String(node.value ?? ''))) unread = true
    })
    if (unread) {
      refused?.()
      return null
    }
    walkCss(tree, function (node) {
      if (!node.loc) return
      const imported = node.type === 'String' && this.atrule?.name?.toLowerCase() === 'import' && !this.block
      if (node.type !== 'Url' && !imported) return
      const made = url(node.value, { schemeless: true })
      if (made === null) return
      const written = `"${escapedCss(made)}"`
      edits.push([
        node.loc.start.offset,
        node.loc.end.offset,
        node.type === 'Url' ? `url(${written})` : written
      ])
    })
    return edits.length === 0 ? null : applied(text, edits)
  }

  /** The candidates of a `srcset`, read by HTML's own algorithm, each URL in the visitor's terms. */
  function srcset(value) {
    const space = (ch) => '\t\n\f\r '.includes(ch)
    let out = ''
    let changed = false
    let i = 0
    while (i < value.length) {
      const from = i
      while (i < value.length && (space(value[i]) || value[i] === ',')) i++
      out += value.slice(from, i)
      if (i >= value.length) break
      let end = i
      while (end < value.length && !space(value[end])) end++
      const commas = /,+$/.exec(value.slice(i, end))
      if (commas) end -= commas[0].length
      const made = url(value.slice(i, end), { schemeless: true })
      out += made ?? value.slice(i, end)
      changed ||= made !== null
      i = end
      if (commas) continue
      // Descriptors: up to the next comma that is not inside parentheses.
      const descriptors = i
      let depth = 0
      while (i < value.length && !(value[i] === ',' && depth === 0)) {
        if (value[i] === '(') depth++
        else if (value[i] === ')' && depth > 0) depth--
        i++
      }
      out += value.slice(descriptors, i)
    }
    return changed ? out : null
  }

  /**
   * The edits of one XML text, or null when it is not well-formed. Where a value is written is found
   * from the parser's own position, and an edit is made only when the bytes there, read back, ARE
   * the value the parser reported — so a position this file misjudged changes nothing.
   *
   * 🔒 A VALUE THAT MUST CHANGE AND CANNOT IS SAID, NEVER SKIPPED. The document is told whole or not
   * at all: a nested style sheet its parser left unread, a value whose place could not be read back,
   * a CDATA section the new text would end, a `<style>` that is not one run of text — each calls
   * `refused`, and `xml()` then changes nothing, so the caller refuses the whole answer.
   * @param {string} xml
   * @param {() => void} refused
   */
  const xmlEdits = (xml, refused) => {
    const edits = []
    let failed = false
    let mark = 0
    /**
     * The element whose character data is being read:
     * `{ name, texts: [[start, end, value, cdata, exact]] }` — `exact`: the bytes at that place,
     * read back, are the value.
     */
    const open = []
    const parser = new SaxesParser({ xmlns: false, position: true })
    /** One run of text written in its place, or refused when that place cannot take it. */
    const write = ([start, end, , cdata, exact], whole) => {
      if (!exact || (cdata && whole.includes(']]>'))) refused()
      else edits.push([start, end, cdata ? whole : escapedXml(whole)])
    }
    const leaf = (text) => {
      const value = text[2]
      const inner = value.trim()
      const made = url(inner)
      if (made === null) return
      const lead = /^\s*/.exec(value)[0]
      write(text, `${lead}${made}${value.slice(lead.length + inner.length)}`)
    }
    parser.on('error', () => {
      failed = true
    })
    parser.on('opentagstart', (tag) => {
      open.push({ name: tag.name.toLowerCase(), texts: [], children: 0 })
      if (open.length > 1) open[open.length - 2].children++
    })
    parser.on('attribute', ({ name, value }) => {
      const key = name.toLowerCase()
      const made =
        key === 'style'
          ? css(value, { declarations: true, refused })
          : url(value, { schemeless: URL_ATTRIBUTES.has(key) })
      if (made === null) return
      const at = parser.position
      const quote = xml[at - 1]
      const start = quote === '"' || quote === "'" ? xml.lastIndexOf(quote, at - 2) + 1 : 0
      if (start === 0 || unescapedXml(xml.slice(start, at - 1)) !== value) return refused()
      edits.push([start, at - 1, escapedXml(made, quote)])
    })
    parser.on('opentag', () => {
      mark = parser.position
    })
    parser.on('text', (value) => {
      const end = xml[parser.position - 1] === '<' ? parser.position - 1 : parser.position
      const top = open[open.length - 1]
      if (top) top.texts.push([mark, end, value, false, unescapedXml(xml.slice(mark, end)) === value])
      mark = end
    })
    parser.on('cdata', (value) => {
      const end = parser.position - 3
      const start = end - value.length
      const top = open[open.length - 1]
      const exact = xml.slice(start, end) === value && xml.slice(start - 9, start) === '<![CDATA['
      if (top) top.texts.push([start, end, value, true, exact])
      mark = parser.position
    })
    parser.on('closetag', () => {
      const element = open.pop()
      mark = parser.position
      if (!element) return
      const texts = element.texts.filter((text) => text[2].trim() !== '')
      const sheet = element.name === 'style' || element.name.endsWith(':style')
      // An element whose whole content is one run of text: the one value the format hands over.
      if (element.children > 0 || texts.length !== 1) {
        // A style sheet written in several runs has no one place to be told in; one that names the
        // site is not left half told. Any other mixed content is prose, which is never read.
        if (sheet && mentions(element.texts.map((text) => text[2]).join(''))) refused()
        return
      }
      if (sheet) {
        const made = css(texts[0][2], { refused })
        if (made !== null) write(texts[0], made)
        return
      }
      leaf(texts[0])
    })
    for (const event of ['comment', 'doctype', 'xmldecl']) {
      parser.on(event, () => {
        mark = parser.position
      })
    }
    parser.on('processinginstruction', ({ target, body }) => {
      const end = parser.position - 2
      mark = parser.position
      if (target !== 'xml-stylesheet') return
      // Its pseudo-attributes are, by definition, written as the attributes of a start tag.
      const inner = xmlEdits(`<x ${body}/>`, refused)
      if (inner === null) {
        // Not written as attributes: a sheet that is named by the site's address is not told.
        if (mentions(body)) refused()
        return
      }
      if (inner.length === 0) return
      if (xml.slice(end - body.length, end) !== body) return refused()
      edits.push([end - body.length, end, applied(`<x ${body}/>`, inner).slice(3, -2)])
    })
    try {
      parser.write(xml).close()
    } catch {
      return null
    }
    return failed ? null : edits
  }

  /** An XML document (a feed, a sitemap, an SVG image) in the visitor's terms, or null. */
  function xml(text, { refused = null } = {}) {
    if (!mentions(text)) return null
    let unread = false
    const edits = xmlEdits(text, () => {
      unread = true
    })
    if (edits === null || unread) {
      refused?.()
      return null
    }
    if (edits.length === 0) return null
    const made = applied(text, edits)
    return made === text ? null : made
  }

  /** `robots.txt`: the one line of it that is a URL by definition is `Sitemap:`. */
  function robots(text) {
    let changed = false
    const made = text.replace(
      /^([\t ]*sitemap[\t ]*:[\t ]*)(\S+)([\t ]*)$/gim,
      (line, field, value, trail) => {
        const told = url(value)
        if (told === null) return line
        changed = true
        return `${field}${told}${trail}`
      }
    )
    return changed ? made : null
  }

  /** The sources of a Content-Security-Policy, each one that is an origin or URL of the site told. */
  function policy(value) {
    let changed = false
    const made = String(value)
      .split(/([\t\n\f\r ;,]+)/)
      .map((token) => {
        const told = url(token)
        if (told === null) return token
        changed = true
        return told
      })
      .join('')
    return changed ? made : null
  }

  /**
   * One response header value in the visitor's terms, or null when it is not to be changed.
   * @param {string} name - lower case
   * @param {string} value
   */
  function header(name, value) {
    if (name === 'link') {
      // RFC 8288: every target is written `<URI-Reference>`.
      let changed = false
      const made = value.replace(/<([^<>]*)>/g, (target, uri) => {
        const told = url(uri, { schemeless: true })
        if (told === null) return target
        changed = true
        return `<${told}>`
      })
      return changed ? made : null
    }
    if (name === 'content-security-policy' || name === 'content-security-policy-report-only')
      return policy(value)
    if (name === 'refresh') {
      const refresh = /^(\s*\d+(?:\.\d*)?\s*[;,]\s*url\s*=\s*)(\S+)\s*$/i.exec(value)
      const told = refresh ? url(refresh[2], { schemeless: true }) : null
      return told === null ? null : `${refresh[1]}${told}`
    }
    return url(value, { schemeless: name === 'location' || name === 'content-location' })
  }

  return {
    url,
    /** A URL's own `?query` (with its `?`), each value that is a URL of the origin told. */
    search: (value) => query(String(value), 0),
    header,
    policy,
    script,
    json,
    css,
    srcset,
    xml,
    robots,
    own,
    mentions
  }
}

/**
 * The CMS back-office paths a browser is sent to the Tracy address for instead of being served on
 * the customer's domain: that is where the Tracy Access sign-in and an EmDash passkey work. Only a
 * navigation (GET/HEAD) is redirected. Left on the own domain because the public site calls them:
 * WordPress `admin-ajax.php` and `admin-post.php` (front-end forms), and `wp-login.php` (a password
 * for a protected post, a shop's customer sign-in).
 * @param {string | undefined} platform
 * @param {string} pathname
 */
export function isAdminPath(platform, pathname) {
  const path = pathname.toLowerCase()
  const under = (prefix) => path === prefix || path.startsWith(`${prefix}/`)
  if (platform === 'joomla') return under('/administrator')
  if (platform === 'emdash') return under('/_emdash/admin')
  if (platform === 'wordpress' || platform === undefined || platform === null) {
    if (!under('/wp-admin')) return false
    return path !== '/wp-admin/admin-ajax.php' && path !== '/wp-admin/admin-post.php'
  }
  return false
}

/**
 * Whether a site's `Set-Cookie` line sets one of Tracy's own cookies (`lib/cookies.js`
 * `isTracyCookieName`, `COOKIE_LEDGER`) — every `tracy_*` but the theme's own `tracy_style`.
 */
export function isTracyCookie(setCookie) {
  return isTracyCookieName(String(setCookie).split('=')[0], { site: true })
}
