/**
 * A hand-built DOM with exactly what the picker reads, for tests that run without a browser.
 *
 * Not a test file (no `.test.`), so no group runs it on its own. It is a stub rather than jsdom for
 * the reason `build.test.mjs` gives: this repo has no jsdom at the root, and the handful of DOM calls
 * the picker makes are cheap to stand up honestly. Geometry is given, not computed: every element
 * carries the box a browser would have laid it out at, and `elementFromPoint` answers with the
 * deepest element whose box holds the point, later siblings painted on top.
 */

/**
 * One element.
 * @param {string} tag
 * @param {{ rect?: number[], id?: string, cls?: string, attrs?: Record<string, string>,
 *   text?: string, bg?: string, currentSrc?: string, src?: string, alt?: string,
 *   css?: Record<string, string>, scroll?: number[], shadow?: Array<object | string>,
 *   textRect?: number[] | number[][] }} [props] - `textRect`: the line box(es) of `text` (default: the
 *   element's own box); `css`:
 *   what `getComputedStyle` reads for it (position, overflow, opacity…); `scroll`: `[scrollWidth,
 *   scrollHeight, clientWidth, clientHeight]`; `shadow`: the children of an open shadow root.
 * @param {Array<object | string>} [kids] - elements, or strings for text nodes.
 */
export function h(tag, props = {}, kids = []) {
  const attrs = { ...props.attrs }
  if (props.id !== undefined) attrs.id = props.id
  if (props.cls !== undefined) attrs.class = props.cls
  const [x, y, width, height] = props.rect ?? [0, 0, 0, 0]
  const node = {
    nodeType: 1,
    tagName: tag.toUpperCase(),
    id: props.id ?? '',
    parentElement: null,
    ownerDocument: null,
    children: [],
    childNodes: [],
    bg: props.bg,
    computed: props.css ?? {},
    scrollWidth: props.scroll?.[0],
    scrollHeight: props.scroll?.[1],
    clientWidth: props.scroll?.[2],
    clientHeight: props.scroll?.[3],
    scrollTop: 0,
    scrollLeft: 0,
    currentSrc: props.currentSrc ?? '',
    src: props.src ?? '',
    alt: props.alt ?? '',
    style: {},
    getAttribute: (name) => (name in attrs ? attrs[name] : null),
    hasAttribute: (name) => name in attrs,
    setAttribute: (name, value) => {
      attrs[name] = String(value)
    },
    getBoundingClientRect: () => ({
      x,
      y,
      left: x,
      top: y,
      width,
      height,
      right: x + width,
      bottom: y + height
    })
  }
  if (props.shadow !== undefined) {
    const root = { nodeType: 11, host: node, children: [], childNodes: [] }
    for (const kid of props.shadow) {
      if (typeof kid === 'string') root.childNodes.push({ nodeType: 3, nodeValue: kid })
      else {
        kid.parentElement = null
        kid.parentNode = root
        root.children.push(kid)
        root.childNodes.push(kid)
      }
    }
    node.shadowRoot = root
  }
  // A text node's line boxes: `textRect` (one box, or several lines) when given, else its element's box.
  const lines =
    props.textRect === undefined
      ? undefined
      : Array.isArray(props.textRect[0])
        ? props.textRect
        : [props.textRect]
  if (props.text !== undefined)
    node.childNodes.push({ nodeType: 3, nodeValue: props.text, parentNode: node, lines })
  for (const kid of kids) {
    if (typeof kid === 'string') {
      node.childNodes.push({ nodeType: 3, nodeValue: kid, parentNode: node })
      continue
    }
    kid.parentElement = node
    node.children.push(kid)
    node.childNodes.push(kid)
  }
  return node
}

/**
 * The few selectors the picker writes and reads, parsed: a comma list of complex selectors, each a
 * chain of compounds (`tag#id.class[attr="v"]:nth-child(n)`) joined by `>` or a space. Anything else
 * throws, so a test never passes on a selector the stub silently misread.
 * @param {string} selector
 */
function parseList(selector) {
  return selector.split(',').map((one) => {
    const tokens = one
      .trim()
      .replace(/\s*>\s*/g, ' > ')
      .split(/\s+/)
    const chain = []
    let combinator = ' '
    for (const token of tokens) {
      if (token === '>') {
        combinator = '>'
        continue
      }
      const m =
        /^([a-zA-Z][\w-]*|\*)?((?:#[\w-]+|\.[\w-]+|\[[\w-]+(?:="[^"]*")?\])*)(?::nth-child\((\d+)\))?$/.exec(
          token
        )
      if (m === null) throw new Error(`stub querySelectorAll: unsupported selector ${selector}`)
      const parts = m[2].match(/#[\w-]+|\.[\w-]+|\[[\w-]+(?:="[^"]*")?\]/g) ?? []
      chain.push({
        combinator,
        tag: m[1] && m[1] !== '*' ? m[1].toUpperCase() : null,
        parts,
        nth: m[3] === undefined ? null : Number(m[3])
      })
      combinator = ' '
    }
    return chain
  })
}

/** @param {object} node @param {{ tag: string | null, parts: string[], nth: number | null }} c */
function matchesCompound(node, c) {
  if (c.tag !== null && node.tagName !== c.tag) return false
  for (const part of c.parts) {
    if (part.startsWith('#') && node.id !== part.slice(1)) return false
    if (part.startsWith('.') && !(node.getAttribute('class') || '').split(/\s+/).includes(part.slice(1)))
      return false
    if (part.startsWith('[')) {
      const [, name, value] = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(part)
      if (!node.hasAttribute(name)) return false
      if (value !== undefined && node.getAttribute(name) !== value) return false
    }
  }
  if (c.nth !== null) {
    const parent = node.parentElement
    if (!parent || parent.children.indexOf(node) + 1 !== c.nth) return false
  }
  return true
}

/** @param {object} node @param {ReturnType<typeof parseList>[number]} chain - matched right to left. */
function matches(node, chain, at = chain.length - 1) {
  if (!matchesCompound(node, chain[at])) return false
  if (at === 0) return true
  if (chain[at].combinator === '>')
    return node.parentElement ? matches(node.parentElement, chain, at - 1) : false
  for (let up = node.parentElement; up; up = up.parentElement) if (matches(up, chain, at - 1)) return true
  return false
}

/** @param {object} node - its box as `[x, y, width, height]`. */
function rectArray(node) {
  const r = node.getBoundingClientRect()
  return [r.left, r.top, r.width, r.height]
}

/**
 * A document around one `<body>`.
 * @param {object} body - the body element, from {@link h}.
 */
export function doc(body) {
  const html = h('html', { rect: [0, 0, 1280, 4000] }, [body])
  // A browser's hit test skips what the pointer passes through and what is not painted at all.
  const hittable = (node) =>
    node.style.pointerEvents !== 'none' && document.defaultView.getComputedStyle(node).visibility !== 'hidden'
  const all = []
  const walk = (node) => {
    all.push(node)
    for (const kid of node.children) walk(kid)
  }
  walk(html)
  const document = {
    documentElement: html,
    body,
    elementFromPoint(px, py) {
      let hit = null
      const visit = (node) => {
        const r = node.getBoundingClientRect()
        const inside = px >= r.left && px < r.right && py >= r.top && py < r.bottom
        if (inside && hittable(node)) hit = node
        for (const kid of node.children) visit(kid)
      }
      visit(html)
      return hit
    },
    /** Every element whose box holds the point, topmost first (the browser's paint order, reversed). */
    elementsFromPoint(px, py) {
      const hits = []
      const visit = (node) => {
        const r = node.getBoundingClientRect()
        const inside = px >= r.left && px < r.right && py >= r.top && py < r.bottom
        if (inside && hittable(node)) hits.push(node)
        for (const kid of node.children) visit(kid)
      }
      visit(html)
      return hits.reverse()
    },
    /**
     * A range over one text node answers its line boxes, as a browser lays them out: `textRect` when
     * the test gave one, else the box of the element holding it.
     */
    createRange() {
      let target = null
      return {
        selectNodeContents(node) {
          target = node
        },
        getClientRects() {
          if (target === null) return []
          const lines = target.lines ?? [target.parentNode ? rectArray(target.parentNode) : [0, 0, 0, 0]]
          return lines.map(([x, y, width, height]) => ({
            x,
            y,
            left: x,
            top: y,
            width,
            height,
            right: x + width,
            bottom: y + height
          }))
        }
      }
    },
    getElementById: (id) => all.find((node) => node.id === id) ?? null,
    querySelectorAll(selector) {
      const list = parseList(selector)
      return all.filter((node) => list.some((complex) => matches(node, complex)))
    },
    defaultView: {
      // `visibility` inherits, as in a browser; every other property is the element's own.
      getComputedStyle: (node) => {
        let visibility = 'visible'
        for (let up = node; up; up = up.parentElement)
          if (up.computed && up.computed.visibility !== undefined) {
            visibility = up.computed.visibility
            break
          }
        return { backgroundImage: node.bg ?? 'none', ...node.computed, visibility }
      }
    }
  }
  for (const node of all) node.ownerDocument = document
  return document
}
