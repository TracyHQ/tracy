// Runs INSIDE the page (Playwright `page.evaluate`), next to the kit's `readTextFit`: no imports, no closures over
// Node values. Two readings the frame fill cannot make (ticket #583).

/**
 * For each text: whether the page holds it only in a box drawn 0 by 0 (a header button the phone layout hides).
 * @param {{texts: {id: string, text: string}[]}} o
 * @returns {Record<string, boolean>}
 */
export function readHiddenTexts({ texts }) {
  const norm = (s) =>
    String(s ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
  const all = [...document.querySelectorAll('body *')]
  const out = {}
  for (const { id, text } of texts) {
    const want = norm(text)
    const matching = all.filter((el) => norm(el.textContent) === want)
    // The innermost elements holding the words: a wrapper around a hidden button keeps its own padding box.
    const hits = matching.filter((el) => !matching.some((x) => x !== el && el.contains(x)))
    out[id] =
      hits.length > 0 &&
      hits.every((el) => {
        const r = el.getBoundingClientRect()
        return r.width < 1 || r.height < 1
      })
  }
  return out
}

/**
 * Wraps a bare text node that holds a text's words in a span of its own, so the frame fill can find a box for it
 * (a stat line: "Join over <span>100k</span> of inspiring creatives" keeps "Join over" in no element of its own).
 * An inline span with no class changes nothing on the page.
 * @param {{texts: {id: string, text: string}[]}} o
 * @returns {number} how many text nodes were wrapped
 */
export function wrapTextNodes({ texts }) {
  const norm = (s) =>
    String(s ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
  const wanted = new Set(texts.map((t) => norm(t.text)))
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  const nodes = []
  while (walker.nextNode()) if (wanted.has(norm(walker.currentNode.nodeValue))) nodes.push(walker.currentNode)
  for (const node of nodes) {
    if (node.parentElement && node.parentElement.childNodes.length === 1) continue
    const span = document.createElement('span')
    node.parentNode.insertBefore(span, node)
    span.appendChild(node)
  }
  return nodes.length
}

/**
 * The character limit of a form field's placeholder: the field's own text is not drawn in the page flow, so the
 * placeholder's words are repeated, longer and longer, until they are wider than the field's content box in the
 * field's own font.
 * @param {{texts: {id: string, text: string}[]}} o
 * @returns {Record<string, {limit: number, lines: number, allowed: number, demo: number}>}
 */
export function readPlaceholderFit({ texts }) {
  const out = {}
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  for (const { id, text } of texts) {
    const field = [...document.querySelectorAll('input[placeholder], textarea[placeholder]')].find(
      (el) => el.placeholder.trim().toLowerCase() === String(text).trim().toLowerCase()
    )
    if (!field || field.getBoundingClientRect().width < 1) continue
    const cs = getComputedStyle(field)
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
    const room = field.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
    const seed = `${field.placeholder.trim()} `
    let n = 0
    const fill = (k) => {
      let s = seed
      while (s.length < k) s += seed
      return s.slice(0, k)
    }
    while (n < 2000 && ctx.measureText(fill(n + 1)).width <= room) n++
    if (ctx.measureText(fill(n)).width <= room)
      out[id] = { limit: n, lines: 1, allowed: 1, demo: field.placeholder.trim().length, how: 'placeholder' }
  }
  return out
}
