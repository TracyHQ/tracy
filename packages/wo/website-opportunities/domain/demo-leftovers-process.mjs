// C09: a neutral title is still unfinished copy even when none of the template's words remain.
// Only declared step structure and tab controls count; navigation, counters and hidden frames never do.
import { isProcessPlaceholder } from './process-placeholders.mjs'

const VOID = /^(?:area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/i
const SKIP = /^(?:script|style|head|template|noscript|header|footer)$/i
const GROUP = /(?:^|\s)(?:steps|process|process-steps|steps-list)(?:\s|$)/i
const ITEM = /(?:^|\s)(?:step|step-item|process-item|process-step)(?:\s|$)/i
const TITLE = /(?:^|\s)(?:step|process)[-_](?:title|heading)(?:\s|$)/i
const attrOf = (attrs, name) => {
  const match = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(attrs)
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? ''
}
const decode = (value) =>
  value
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#(x[\da-f]+|\d+);/gi, (_, n) => {
      const point = n[0].toLowerCase() === 'x' ? parseInt(n.slice(1), 16) : Number(n)
      return point >= 0 && point <= 0x10ffff ? String.fromCodePoint(point) : '\uFFFD'
    })

/**
 * Read title positions with a small tag stack, without adding a CMS or browser dependency to the domain package.
 * @param {{served: Array<{path: string, html: string}>}} ctx
 * @returns {Array<{page: string, place: string, found: string}>}
 */
export function processPlaceholderLeftovers(ctx) {
  const out = []
  for (const page of ctx.served) {
    const css = [...page.html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)]
      .map((match) => match[1])
      .join('\n')
    const hides = new Set(
      [...css.matchAll(/([^{}]+)\{[^{}]*display\s*:\s*none[^{}]*\}/gi)].flatMap((match) =>
        match[1].trim().split(/\s*,\s*/)
      )
    )
    const stack = [{ tag: '', selector: '', hidden: false, process: false }]
    let number = 0
    for (const match of page.html.matchAll(/<!--[\s\S]*?-->|<\/?([a-z][\w:-]*)\b([^>]*)>|([^<]+)/gi)) {
      if (match[0].startsWith('<!--')) continue
      if (match[3]) {
        for (const frame of stack) if (frame.title && !frame.hidden) frame.text += ` ${decode(match[3])}`
        continue
      }
      const tag = match[1]?.toLowerCase()
      if (!tag) continue
      if (match[0][1] === '/') {
        const index = stack.findLastIndex((frame) => frame.tag === tag)
        if (index < 1) continue
        for (const frame of stack.splice(index)) {
          const title = frame.text?.replace(/\s+/g, ' ').trim()
          if (frame.title && !frame.hidden && title && isProcessPlaceholder(title))
            out.push({ page: page.path, place: `process title ${frame.position}`, found: title })
        }
        continue
      }
      const attrs = match[2] ?? ''
      const parent = stack.at(-1)
      const id = attrOf(attrs, 'id')
      const classes = attrOf(attrs, 'class')
      const nth = (parent.children ??= 0) + 1
      parent.children = nth
      const path = `${tag}${classes
        .split(/\s+/)
        .filter((value) => /^[\w-]+$/.test(value))
        .map((value) => `.${value}`)
        .join('')}:nth-child(${nth})`
      const selector = ['html', 'body'].includes(tag)
        ? ''
        : id && /^[A-Za-z][\w-]*$/.test(id)
          ? `#${id}`
          : parent.selector
            ? `${parent.selector} > ${path}`
            : path
      const hidden =
        parent.hidden ||
        SKIP.test(tag) ||
        /(?:^|\s)hidden(?:\s|=|$)/i.test(attrs) ||
        /display\s*:\s*none/i.test(attrOf(attrs, 'style')) ||
        hides.has(selector) ||
        hides.has(`body > ${selector}`)
      const process =
        parent.process ||
        GROUP.test(classes) ||
        ITEM.test(classes) ||
        attrOf(attrs, 'data-slot-role').startsWith('step.')
      const tab =
        attrOf(attrs, 'role') === 'tab' ||
        ['data-toggle', 'data-bs-toggle'].some((name) => attrOf(attrs, name) === 'tab')
      const title =
        tab ||
        (process &&
          (/^h[1-6]$/.test(tag) || TITLE.test(classes) || attrOf(attrs, 'data-slot-role') === 'step.title'))
      const frame = { tag, selector, hidden, process, title, text: '', position: ++number }
      if (!VOID.test(tag) && !/\/\s*$/.test(attrs)) stack.push(frame)
    }
  }
  return out
}
