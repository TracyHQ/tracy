/**
 * The tag syntax of a dictionary value for `<Trans>`: `<b>…</b>`, `<a>…</a>`, `<br/>`, nested.
 * Placeholders are filled in text nodes only, so a value never becomes markup. Malformed markup
 * (unbalanced, crossed) reads as the plain text.
 */
import { interpolate } from '@tracy/core/interface-languages/resolve'

import type { Params } from './translator.ts'

export type MarkupNode = string | { readonly tag: string; readonly children: MarkupNode[] }

const TAG = /<(\/?)([a-zA-Z][\w-]*)\s*(\/?)>/g

export function parseMarkup(text: string, params?: Params): MarkupNode[] {
  const root: { tag: string; children: MarkupNode[] } = { tag: '', children: [] }
  const stack = [root]
  const pushText = (raw: string) => {
    if (raw) stack[stack.length - 1].children.push(interpolate(raw, params))
  }
  let at = 0
  for (const match of text.matchAll(TAG)) {
    pushText(text.slice(at, match.index))
    at = match.index + match[0].length
    const [, closing, tag, selfClosing] = match
    if (selfClosing) stack[stack.length - 1].children.push({ tag, children: [] })
    else if (!closing) {
      const node = { tag, children: [] as MarkupNode[] }
      stack[stack.length - 1].children.push(node)
      stack.push(node)
    } else if (stack.length > 1 && stack[stack.length - 1].tag === tag) stack.pop()
    else return [interpolate(text, params)]
  }
  pushText(text.slice(at))
  return stack.length === 1 ? root.children : [interpolate(text, params)]
}
