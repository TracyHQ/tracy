// Step copy needs a useful title and body. Empty process items and their linked tab controls leave together.
import { isProcessPlaceholder } from 'website-opportunities/domain/process-placeholders.mjs'

const attr = (node, name) => node?.attrs?.find((item) => item.name === name)?.value ?? ''
const kids = (node) => (node.childNodes ?? []).filter((child) => child.tagName)
const token = (node, pattern) => pattern.test(attr(node, 'class'))
const GROUP = /(?:^|\s)(?:steps|process|process-steps|steps-list)(?:\s|$)/i
const ITEM = /(?:^|\s)(?:step|step-item|process-item|process-step)(?:\s|$)/i
const TITLE = /(?:^|\s)(?:step|process)[-_](?:title|heading)(?:\s|$)/i
const SKIP = new Set(['script', 'style', 'template', 'noscript', 'svg', 'i'])
const textOf = (node, omit = null) => {
  if (node === omit || SKIP.has(node.tagName)) return ''
  if (node.nodeName === '#text') return node.value ?? ''
  return (node.childNodes ?? [])
    .map((child) => textOf(child, omit))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}
const bodyUseful = (node, omit = null) => {
  if (node === omit || SKIP.has(node.tagName)) return false
  if (node.nodeName === '#text') return !isProcessPlaceholder(node.value)
  return (node.childNodes ?? []).some((child) => bodyUseful(child, omit))
}
const descendants = (node) => kids(node).flatMap((child) => [child, ...descendants(child)])
const hidden = (node) =>
  node?.attrs?.some((item) => item.name === 'hidden') || /display\s*:\s*none/i.test(attr(node, 'style'))
const isTab = (node) =>
  attr(node, 'role') === 'tab' || ['data-toggle', 'data-bs-toggle'].some((name) => attr(node, name) === 'tab')
const meaningful = (text) => !isProcessPlaceholder(text)
const headingOf = (node) => descendants(node).find((child) => /^h[1-6]$/.test(child.tagName))
const ancestor = (node, predicate) => {
  for (let at = node.parentNode; at?.tagName && at.tagName !== 'body'; at = at.parentNode)
    if (predicate(at)) return at
  return null
}

/**
 * The DOM frames with no complete process copy. Uses the engine's already parsed tree and selector builder.
 * @param {any} body
 * @param {(node: any) => string} selectorOf
 * @returns {string[]}
 */
export function processFrameSelectors(body, selectorOf) {
  const nodes = descendants(body)
  const byId = new Map(nodes.filter((node) => attr(node, 'id')).map((node) => [attr(node, 'id'), node]))
  const removed = new Set()
  const groups = new Map()
  const panels = new Map()
  const record = (group, frame, useful) => {
    if (!groups.has(group)) groups.set(group, [])
    groups.get(group).push({ frame, useful })
    if (!useful) removed.add(frame)
  }
  for (const node of nodes) {
    // Header/footer navigation is unrelated to the process; an ordinary link named "Step" is not a step.
    if (ancestor(node, (at) => ['header', 'footer'].includes(at.tagName))) continue
    if (isTab(node)) {
      const target =
        attr(node, 'aria-controls') ||
        attr(node, 'data-bs-target') ||
        attr(node, 'data-target') ||
        attr(node, 'href')
      const panel = byId.get(target.replace(/^#/, ''))
      if (!panel) continue
      const group = ancestor(
        node,
        (at) => attr(at, 'role') === 'tablist' || token(at, /(?:^|\s)nav-tabs(?:\s|$)/)
      )
      if (!group) continue
      const frame = node.parentNode?.tagName === 'li' ? node.parentNode : node
      panels.set(group, [...(panels.get(group) ?? []), panel])
      const useful = meaningful(textOf(node)) && bodyUseful(panel, headingOf(panel))
      record(group, frame, useful)
      if (!useful) removed.add(panel)
      continue
    }
    if (!(token(node, ITEM) || (node.tagName === 'li' && token(node.parentNode, GROUP)))) continue
    const group = ancestor(node, (at) => token(at, GROUP))
    if (!group) continue
    const title =
      headingOf(node) ??
      descendants(node).find((child) => attr(child, 'data-slot-role') === 'step.title' || token(child, TITLE))
    record(group, node, Boolean(title) && meaningful(textOf(title)) && bodyUseful(node, title))
  }
  for (const [group, entries] of groups) {
    if (entries.some((entry) => entry.useful && !hidden(entry.frame))) continue
    removed.add(group)
    const linked = panels.get(group) ?? []
    const section = ancestor(
      group,
      (at) =>
        at.tagName === 'section' ||
        token(at, GROUP) ||
        (linked.length > 0 && linked.every((panel) => descendants(at).includes(panel)))
    )
    if (!section) continue
    // A section may contain several step/tab groups. Keep it when any other group still has useful copy.
    const usefulElsewhere = [...groups].some(
      ([other, items]) =>
        other !== group &&
        descendants(section).includes(other) &&
        items.some((entry) => entry.useful && !hidden(entry.frame))
    )
    if (!usefulElsewhere) removed.add(section)
  }
  return [...removed].map(selectorOf)
}
