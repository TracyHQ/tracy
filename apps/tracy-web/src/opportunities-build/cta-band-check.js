import { parse } from 'parse5'
import { ctaBandsOf } from 'website-opportunities/domain/cta-bands.mjs'

// A kept call-to-action band shows its message with its button (COO decision, spec TracyHQ/tracy#189 item 7). Judged on
// the served pages, where the content map declares bands: a band on a page whose button shows with no words beside it is
// a lone button on an empty ground, reported as a major finding of the build.

const attr = (node, name) => node.attrs?.find((a) => a.name === name)?.value ?? ''
const flat = (value) =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
const walk = (node, visit) => {
  if (visit(node) === false) return
  for (const child of node.childNodes ?? []) walk(child, visit)
}
const SKIP = new Set(['script', 'style', 'noscript', 'template'])

/** The rendered block of a declared band: Joomla's module chrome carries the module id (`Mod161`, T3 and T4). */
function blockIdOf(entity) {
  const id = /^module-(\d+)$/.exec(String(entity))?.[1]
  return id ? `Mod${id}` : null
}

/** A rendered band's button words and the rest of its visible words. */
export function bandWords(block) {
  const buttons = []
  const message = []
  walk(block, (node) => {
    if (SKIP.has(node.tagName)) return false
    const button =
      node.tagName === 'a' || node.tagName === 'button' || /\bbtn\b/.test(attr(node, 'class'))
    if (button) {
      buttons.push(flat(textOf(node)))
      return false
    }
    if (node.nodeName === '#text' && flat(node.value)) message.push(flat(node.value))
    return true
  })
  return { buttons: buttons.filter(Boolean), message: flat(message.join(' ')) }
}

function textOf(node) {
  if (node.nodeName === '#text') return node.value
  if (SKIP.has(node.tagName)) return ''
  return (node.childNodes ?? []).map(textOf).join(' ')
}

/**
 * @param {{pages: Array<{path: string, status?: number | null, html?: string}>, contentMap: any, sitePlan?: any}} input
 * @returns {Array<{kind: 'cta-band', severity: 'major', path: string, entity: string, reason: string, why: string}>}
 */
export function checkCtaBands({ pages, contentMap, sitePlan = null }) {
  if (!sitePlan) return []
  const findings = []
  for (const band of ctaBandsOf(contentMap)) {
    const id = blockIdOf(band.entity)
    if (!id) continue
    for (const page of pages) {
      if (page.status && page.status !== 200) continue
      let block = null
      walk(parse(String(page.html ?? '')), (node) => {
        if (block) return false
        if (attr(node, 'id') === id) block = node
        return !block
      })
      if (!block) continue
      const { buttons, message } = bandWords(block)
      const reason = !buttons.length
        ? 'cta-band-without-button'
        : !message
          ? 'cta-band-lone-button'
          : null
      if (reason)
        findings.push({
          kind: 'cta-band',
          severity: 'major',
          path: page.path,
          entity: band.entity,
          reason,
          why: `Call-to-action band ${band.entity} on ${page.path}: ${reason === 'cta-band-lone-button' ? `the button "${buttons[0]}" shows with no message` : 'the message shows with no button'}`
        })
    }
  }
  return findings
}
