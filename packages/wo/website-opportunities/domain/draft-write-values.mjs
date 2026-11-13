// The value the draft write puts at a location (ticket #597): the order's words, written the way the place stores them.
// Pure. The rules measured on the blank site (`docs/references/ai-quickstart-contract.md`):
//
//   inline `write: "codes"`   an ACM module's data (nested JSON, no xpath): wrapper markers as the content map writes
//                             them (`((p))words((/p))`); plain words are always valid
//   inline `write: "html"`    a stored HTML value: on a copy or a created record the wrapper as real tags, the words
//                             escaped; through the blank site contract plain words only (it refuses `<` and `>`)
//   a slot that opens empty   through the contract, a straight double quote is refused: typographic quotes instead
//   a text node               never written empty: one space keeps the node
//   `as: tel` / `as: mailto`  a phone or an email written as a link of that scheme

import { isTextNode } from './draft-write-codec.mjs'

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }
export const escapeHtml = (text) => String(text).replace(/[&<>"]/g, (c) => ESCAPES[c])

/** Straight double quotes as typographic ones, opening and closing in turn. */
export function curlyQuotes(text) {
  let open = true
  return String(text).replace(/"/g, () => {
    const mark = open ? '“' : '”'
    open = !open
    return mark
  })
}

/** The digits of a phone as a `tel:` link. */
export const telOf = (phone) => `tel:${String(phone).replace(/[^\d+]/g, '')}`

/**
 * The text written at a location.
 * @param {string} words the order's value
 * @param {{loc: object, inline?: object, via: 'contract' | 'open', slot?: object}} how `via`: the blank site contract
 *   (an in-place record or a site language string) or the open writes (a copy, a created record); `slot`: the blank
 *   site contract slot of the location, when it has one
 * @returns {{value: string, rules: string[]}}
 */
export function textAt(words, { loc, inline, via, slot }) {
  const rules = []
  let value = String(words)
  if (loc.as === 'tel') return { value: telOf(value), rules: ['as_tel'] }
  if (loc.as === 'mailto') return { value: `mailto:${value.trim()}`, rules: ['as_mailto'] }
  if (via === 'contract') {
    if (slot?.opensEmpty && value.includes('"')) {
      value = curlyQuotes(value)
      rules.push('curly_quotes_in_open_slot')
    }
  } else if (inline && !loc.xpath) {
    const wrapper = (inline.wrapper ?? []).includes('p') ? 'p' : null
    if (inline.write === 'codes' && wrapper) {
      value = `((${wrapper}))${value}((/${wrapper}))`
      rules.push('inline_codes_wrapper')
    } else if (inline.write === 'html') {
      value = wrapper ? `<${wrapper}>${escapeHtml(value)}</${wrapper}>` : escapeHtml(value)
      rules.push('inline_html')
    }
  }
  if (value === '' && isTextNode(loc)) {
    value = ' '
    rules.push('text_node_space')
  }
  return { value, rules }
}
