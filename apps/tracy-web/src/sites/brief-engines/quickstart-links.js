/** Resolve external business links by declared role or the actual source URL, never by a guessed company. */
import { parseFragment } from 'parse5'
import { parseBlocks, namedBlocks, commentJson } from './wp-blocks.js'
import { softwareAttribution } from './quickstart-attribution.js'
const web = (value, base) => {
  try {
    const url = new URL(value, base)
    return /^https?:$/.test(url.protocol) ? url : null
  } catch {
    return null
  }
}
export function quickstartLinks(
  data,
  business,
  { base, bindings = [], referenceUrls = [], navigationFallback = false } = {}
) {
  const unresolved = [],
    receipts = []
  const social = Array.isArray(business.socials)
    ? business.socials.map((s) => s.url)
    : Object.values(business.socials ?? {})
  const known = [business.website, business.bookingUrl, ...social, ...referenceUrls]
    .map((url) => web(url))
    .filter(Boolean)
  const site = web(base)
  function destination(raw, path, role = null, ordinary = null) {
    const url = web(raw, base)
    let protocol
    try {
      protocol = new URL(raw, base).protocol
    } catch {}
    if (['javascript:', 'data:', 'vbscript:'].includes(protocol)) {
      unresolved.push({ path, reason: 'unsupported-link-protocol' })
      return raw
    }
    if (!url) {
      if (!/^(?:https?:)?\/\//i.test(String(raw).trim())) return raw
    } else if (!/^(?:https?:)?\/\//i.test(String(raw).trim())) return raw
    if (!url) {
      unresolved.push({ path, reason: 'external-link-unreadable' })
      return raw
    }
    if (site && url.origin === site.origin) return raw
    if (known.some((candidate) => candidate.href === url.href)) return raw
    let next = null
    const declared =
      bindings.find((binding) => JSON.stringify(binding.path) === JSON.stringify(path))?.role ?? role
    if (declared === 'website') next = business.website
    if (declared === 'booking') next = business.bookingUrl
    if (declared === 'social') next = known.find((candidate) => candidate.hostname === url.hostname)?.href
    if (['attribution', 'asset'].includes(declared)) return raw
    if (!next && navigationFallback && ordinary && web(business.website)) {
      next = business.website
      receipts.push({
        path,
        before: raw,
        after: next,
        role: 'navigation-fallback',
        sourceId: 'business.website',
        beforeLabel: ordinary.label,
        afterLabel: web(next).hostname,
        occurrence: ordinary.occurrence
      })
      return next
    }
    if (!next) {
      unresolved.push({ path, reason: 'external-link-role-or-source-missing' })
      return raw
    }
    receipts.push({ path, before: raw, after: next, role: declared })
    return next
  }
  function html(value, path) {
    const edits = [],
      fallbackAnchors = []
    let anchorIndex = 0
    const blocks = parseBlocks(value)
    const textOf = (node) =>
      node.nodeName === '#text' ? node.value : (node.childNodes ?? []).map(textOf).join(' ')
    const behavior = (node) => {
      for (let parent = node; parent; parent = parent.parentNode)
        if (
          parent.tagName === 'form' ||
          (parent.attrs ?? []).some((a) =>
            /^on|^data-(?:action|toggle|target|bs-toggle|bs-target|fancybox|payment|checkout)$/i.test(a.name)
          )
        )
          return true
      return false
    }
    if (/<!--\s*wp:/.test(value) && !blocks)
      unresolved.push({ path, reason: 'block-link-structure-unreadable' })
    function visit(node) {
      const attrs = Object.fromEntries((node.attrs ?? []).map((a) => [a.name, a.value]))
      const occurrence = node.tagName === 'a' ? anchorIndex++ : null
      for (const name of node.tagName === 'form' ? ['action'] : node.tagName === 'a' ? ['href'] : []) {
        const before = attrs[name],
          where = node.sourceCodeLocation?.attrs?.[name]
        if (!before || !where) continue
        const descriptor =
          blocks &&
          bindings.find(
            (binding) =>
              binding.block &&
              JSON.stringify(binding.path) === JSON.stringify(path) &&
              namedBlocks(blocks, binding.block).some(
                (block) => where.startOffset >= block.innerStart && where.endOffset <= block.innerEnd
              )
          )
        const role =
          descriptor?.role ??
          attrs['data-tracy-role'] ??
          (attrs.rel?.split(/\s+/).includes('me')
            ? 'social'
            : navigationFallback &&
                (attrs.rel?.split(/\s+/).includes('license') || softwareAttribution(node.parentNode))
              ? 'attribution'
              : null)
        const plain =
          node.tagName === 'a' &&
          node.childNodes?.length &&
          node.sourceCodeLocation?.startTag &&
          node.sourceCodeLocation?.endTag &&
          node.childNodes.every((child) => child.nodeName === '#text') &&
          node.childNodes.some((child) => /[\p{L}\d]/u.test(child.value)) &&
          !(node.attrs ?? []).some((a) =>
            /^on|^data-|^download$|^ping$|^aria-controls$|^aria-haspopup$|^aria-labelledby$|^aria-describedby$|^role$/i.test(
              a.name
            )
          ) &&
          !behavior(node) &&
          !(
            node.parentNode?.tagName === 'p' &&
            /(?:©|copyright|licen[cs]e|designed by|powered by|credits?)/i.test(textOf(node.parentNode))
          ) &&
          !['social', 'attribution', 'asset'].includes(role)
        const count = receipts.length
        const after = destination(
          before,
          [...path, `@${name}`, where.startOffset],
          role,
          plain
            ? {
                label: node.childNodes.map((child) => child.value).join(''),
                occurrence: [...path, '@anchor', occurrence]
              }
            : null
        )
        const fallback =
          receipts.length > count && receipts.at(-1).role === 'navigation-fallback' ? receipts.at(-1) : null
        if (fallback) {
          const loc = node.sourceCodeLocation
          const escape = (text) =>
            String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;')
          edits.push({
            start: loc.startTag.endOffset,
            end: loc.endTag.startOffset,
            text: escape(fallback.afterLabel)
          })
          for (const label of ['title', 'aria-label']) {
            const at = loc.attrs?.[label]
            if (at)
              edits.push({
                start: at.startOffset,
                end: at.endOffset,
                text: `${label}="${escape(fallback.afterLabel)}"`
              })
          }
          fallbackAnchors.push({ ...fallback, start: loc.startOffset, end: loc.endOffset })
        }
        if (after !== before)
          edits.push({
            start: where.startOffset,
            end: where.endOffset,
            text: `${name}="${after.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}"`
          })
      }
      for (const child of node.childNodes ?? []) visit(child)
    }
    visit(parseFragment(value, { sourceCodeLocationInfo: true }))
    if (blocks) {
      const visitBlock = (block) => {
        if (block.attrs && Object.keys(block.attrs).length) {
          const role = bindings.find(
            (binding) =>
              binding.block &&
              binding.block === block.attrs.metadata?.name &&
              JSON.stringify(binding.path) === JSON.stringify(path)
          )?.role
          const fallback =
            block.name === 'core/button' &&
            fallbackAnchors.find((a) => a.start >= block.innerStart && a.end <= block.innerEnd)
          const rewrite = (attrs, parts = []) => {
            if (!attrs || typeof attrs !== 'object') return attrs
            if (Array.isArray(attrs)) return attrs.map((item, index) => rewrite(item, [...parts, index]))
            return Object.fromEntries(
              Object.entries(attrs).map(([key, child]) => [
                key,
                fallback &&
                parts.length === 0 &&
                ['label', 'text', 'title', 'aria-label', 'ariaLabel'].includes(key) &&
                typeof child === 'string'
                  ? fallback.afterLabel
                  : fallback &&
                      ['url', 'href'].includes(key) &&
                      [fallback.before, fallback.after].includes(child)
                    ? fallback.after
                    : ['url', 'href', 'action'].includes(key) && typeof child === 'string'
                      ? destination(child, [...path, '$block', block.start, ...parts, key], role)
                      : Array.isArray(child)
                        ? child.map((item, index) => rewrite(item, [...parts, key, index]))
                        : child && typeof child === 'object'
                          ? rewrite(child, [...parts, key])
                          : child
              ])
            )
          }
          const next = rewrite(block.attrs)
          if (JSON.stringify(next) !== JSON.stringify(block.attrs)) {
            const opening = value.slice(block.start, block.innerStart)
            const start = opening.indexOf('{'),
              end = opening.lastIndexOf('}')
            if (start < 0 || end < start) throw new Error('QUICKSTART_BLOCK_LINK_UNREADABLE')
            edits.push({ start: block.start + start, end: block.start + end + 1, text: commentJson(next) })
          }
        }
        for (const child of block.children ?? []) visitBlock(child)
      }
      visitBlock(blocks)
    }
    for (const edit of edits.sort((a, b) => b.start - a.start))
      value = value.slice(0, edit.start) + edit.text + value.slice(edit.end)
    return value
  }
  function walk(value, path = []) {
    if (typeof value === 'string') {
      if (/<[a-z!/]/i.test(value)) return html(value, path)
      if (/^(?:url|href|link|action|website|webpage|booking_url)$/i.test(String(path.at(-1))))
        return destination(value, path)
      return value
    }
    if (Array.isArray(value)) return value.map((child, index) => walk(child, [...path, index]))
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value).map(([key, child]) => [key, walk(child, [...path, key])])
      )
    return value
  }
  return { data: walk(data), unresolved, receipts }
}
