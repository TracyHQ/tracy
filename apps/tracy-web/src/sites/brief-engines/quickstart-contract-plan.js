/** Compile existing contract declarations against observed native records once, before execution. */
import { parse } from 'parse5'
import { parseBlocks, namedBlocks } from './wp-blocks.js'
import { customizable } from '../../lib/contract-customize.js'

const keyOf = (path) => JSON.stringify(path.map(String))
const valueAt = (data, path) => path.reduce((value, key) => value?.[key], data)

export function contractSlotPath(slot, platform) {
  if (slot.target?.option) return ['value', ...(slot.target.jsonPath ?? [])]
  if (slot.column)
    return [slot.column, ...(slot.nestedJson ? [slot.nestedJson] : []), ...(slot.jsonPath ?? [])]
  if (slot.target?.block) return [platform === 'wordpress' ? 'post_content' : 'content']
  return null
}

/** Resolve the bounded absolute XPath grammar emitted by the contract capture tool. */
export function contractHtmlTarget(html, xpath) {
  if (typeof html !== 'string' || typeof xpath !== 'string' || !xpath.startsWith('/')) return null
  // ContentSlots.php captures fragments inside this synthetic root.
  const prefix = '<html><body><div id="contract-root">'
  let nodes = [parse(prefix + html + '</div></body></html>', { sourceCodeLocationInfo: true })]
  for (const segment of xpath.slice(1).split('/')) {
    const match = /^(?:([a-zA-Z][\w-]*)(?:\[(\d+)\])?|(text\(\))(?:\[(\d+)\])?|@([\w:-]+))$/.exec(segment)
    if (!match) return null
    const next = []
    for (const node of nodes) {
      if (match[5]) {
        const attr = node.attrs?.find((item) => item.name === match[5])
        const loc = node.sourceCodeLocation?.attrs?.[match[5]]
        if (attr && loc) next.push({ value: attr.value, sourceCodeLocation: loc })
      } else {
        const children = (node.childNodes ?? []).filter((child) =>
          match[3] ? child.nodeName === '#text' : child.tagName === match[1].toLowerCase()
        )
        const ordinal = match[2] ?? match[4]
        if (ordinal) {
          if (children[Number(ordinal) - 1]) next.push(children[Number(ordinal) - 1])
        } else next.push(...children)
      }
    }
    nodes = next
  }
  if (nodes.length !== 1) return null
  const node = nodes[0],
    loc = node.sourceCodeLocation
  if (!loc) return null
  const text = (item) => item.value ?? (item.childNodes ?? []).map(text).join('')
  return { start: loc.startOffset - prefix.length, end: loc.endOffset - prefix.length, value: text(node) }
}

function matchesEntity(record, entity, platform) {
  if (!entity) return false
  if (platform === 'wordpress' && record.identity.kind === 'post') {
    const postType = entity.identity?.postType ?? entity.kind
    if (postType && postType !== record.data.post_type) return false
  } else if (entity.kind && entity.kind !== record.identity.kind) return false
  if (
    entity.sourceId != null &&
    record.identity.id != null &&
    String(entity.sourceId) === String(record.identity.id)
  )
    return true
  if (entity.identity?.slug)
    return (
      entity.identity.slug === record.data.post_name &&
      (!entity.identity.postType || entity.identity.postType === record.data.post_type)
    )
  return !!entity.identity?.key && entity.identity.key === record.identity.key
}

/** This only plans bindings. It never changes native values, publication state or membership. */
export function compileQuickstartContract({ map, records, platform, exclusions = new Map() }) {
  const coverage = []
  const entities = new Map((map?.entities ?? []).map((entity) => [entity.key, entity]))
  for (const slot of map?.slots ?? []) {
    const path = contractSlotPath(slot, platform)
    const entry = {
      surface: slot.key,
      entity: slot.entity ?? null,
      path,
      state: 'required-unresolved',
      reason: 'contract-target-not-covered'
    }
    coverage.push(entry)
    const excluded = exclusions.get(slot.entity)
    if (excluded) {
      Object.assign(entry, { state: 'excluded', disposition: 'nonpublic-preserved', ...excluded })
      continue
    }
    // Declared for the site agent, left as the demo wrote it by Customize (`lib/contract-customize.js`).
    if (!customizable(slot)) {
      Object.assign(entry, {
        state: 'excluded',
        disposition: 'declared-preserved',
        reason: 'contract-slot-kept'
      })
      continue
    }
    if (!['text', 'url', 'image', 'number'].includes(slot.type)) {
      Object.assign(entry, {
        state: 'excluded',
        disposition: 'technical-preserved',
        reason: 'non-content-contract-slot'
      })
      continue
    }
    const candidates = slot.target?.option
      ? records.filter(
          (record) => record.identity.kind === 'option' && record.identity.key === slot.target.option
        )
      : records.filter((record) => matchesEntity(record, entities.get(slot.entity), platform))
    if (candidates.length !== 1) {
      entry.reason = candidates.length ? 'contract-entity-ambiguous' : 'contract-entity-missing'
      continue
    }
    const record = candidates[0]
    entry.record = record.key
    if (!path) {
      entry.reason = 'contract-path-unsupported'
      continue
    }
    // WordPress templates store their block tree under content, unlike posts.
    const resolvedPath = slot.target?.block && record.identity.kind !== 'post' ? ['content'] : path
    entry.path = resolvedPath
    const value = valueAt(record.data, resolvedPath)
    if (value === undefined) {
      entry.reason = 'contract-path-missing'
      continue
    }
    const mediaObject =
      slot.type === 'image' &&
      value &&
      typeof value === 'object' &&
      value.id &&
      (value.provider || value.mimeType)
    if (!mediaObject && typeof value !== 'string' && !(typeof value === 'number' && Number.isFinite(value))) {
      entry.reason = 'contract-value-type-unsupported'
      continue
    }
    let blockTargetValue
    if (slot.target?.block) {
      const tree = typeof value === 'string' ? parseBlocks(value) : null
      const blocks = tree ? namedBlocks(tree, slot.target.block) : []
      if (!blocks.length) {
        entry.reason = 'contract-block-missing'
        continue
      }
      const block = blocks[0],
        attr = slot.target.attr ?? 'content'
      const inner = value.slice(block.innerStart, block.innerEnd)
      if (['content', 'text'].includes(attr) && ['text', 'number'].includes(slot.type)) {
        const text = (node) =>
          node.nodeName === '#text' ? node.value : (node.childNodes ?? []).map(text).join('')
        blockTargetValue = text(parse(inner))
      } else if (['url', 'src', 'alt', 'title'].includes(attr)) {
        const attribute = attr === 'url' ? 'href' : attr
        const matches = []
        const visit = (node) => {
          for (const item of node.attrs ?? []) {
            if (
              item.name === attribute &&
              (attr !== 'url' || node.tagName === 'a') &&
              (attr !== 'src' || node.tagName === 'img')
            )
              matches.push(item.value)
          }
          for (const child of node.childNodes ?? []) visit(child)
        }
        visit(parse(inner))
        if (matches.length !== 1) {
          entry.reason = 'contract-block-attribute-unresolved'
          continue
        }
        blockTargetValue = matches[0]
      } else {
        entry.reason = 'contract-block-attribute-unsupported'
        continue
      }
      if (['text', 'number'].includes(slot.type)) {
        const binding = record.bindings.find((item) => keyOf(item.path) === keyOf(resolvedPath))
        if (!binding) {
          entry.reason = 'contract-block-binding-missing'
          continue
        }
        binding.slots ??= []
        if (!binding.slots.some((item) => item.key === slot.key)) binding.slots.push(slot)
      }
    }
    const htmlTarget = slot.xpath ? contractHtmlTarget(value, slot.xpath) : null
    if (slot.xpath && !htmlTarget) {
      entry.reason = 'contract-xpath-unresolved'
      continue
    }
    const targetValue = htmlTarget ? htmlTarget.value : (blockTargetValue ?? value)
    if (typeof targetValue === 'string' && !targetValue.trim()) {
      Object.assign(entry, {
        state: 'supported',
        disposition: 'empty-preserved',
        reason: 'native-empty-value'
      })
      continue
    }
    if (slot.type === 'image' || slot.type === 'url') {
      if (!mediaObject && typeof value !== 'string') {
        entry.reason = 'contract-value-type-unsupported'
        continue
      }
      const collection = slot.type === 'image' ? 'mediaBindings' : 'linkBindings'
      record[collection] ??= []
      if (
        !record[collection].some(
          (binding) => keyOf(binding.path) === keyOf(resolvedPath) && binding.block === slot.target?.block
        )
      )
        record[collection].push({
          path: resolvedPath,
          block: slot.target?.block,
          role: slot.role ?? slot.input
        })
    } else if (!slot.target?.block) {
      let binding = record.bindings.find((item) => keyOf(item.path) === keyOf(resolvedPath))
      if (!binding) {
        const key = JSON.stringify(resolvedPath)
        record.copy[key] = value
        binding = { key, path: resolvedPath, valueType: typeof value }
        record.bindings.push(binding)
      }
      if (htmlTarget) {
        binding.htmlSlots ??= []
        if (!binding.htmlSlots.some((item) => item.key === slot.key)) binding.htmlSlots.push(slot)
      } else
        Object.assign(
          binding,
          Object.fromEntries(
            Object.entries({
              fact: slot.input,
              role: slot.role,
              renderer: slot.renderer,
              maxCharacters: slot.maxCharacters
            }).filter(([, value]) => value !== undefined)
          )
        )
    }
    Object.assign(entry, { state: 'supported', disposition: 'editable', reason: 'native-contract-binding' })
  }
  return {
    version: 'quickstart-contract-plan/1',
    coverage,
    issues: coverage.filter((entry) => entry.state === 'required-unresolved')
  }
}
