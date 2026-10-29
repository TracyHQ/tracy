import { serialize } from 'parse5'
import { boundNodes } from './joomla-bound-nodes.js'

/** Visitor-facing string columns the Joomla records door permits, never routing or account settings. */
const fields = (names) => new Set(names.split(' '))
export const RECORD_FIELDS = {
  article: fields('title introtext fulltext images urls attribs metadata metakey metadesc note'),
  module: fields('title content params note'),
  contact: fields(
    'name con_position address suburb country postcode telephone fax misc email_to mobile webpage params metadesc metakey metadata'
  ),
  menuItem: fields('title params note'),
  category: fields('title description params metadesc metakey note'),
  tag: fields('title description params note'),
  field: fields('title label description default_value params fieldparams note'),
  fieldValue: fields('value'),
  userProfile: fields('value'),
  templateStyle: fields('title params'),
  banner: fields('name description custombannercode params'),
  bannerClient: fields('name contact email extrainfo'),
  newsfeed: fields('name description params metadesc metakey'),
  menutype: fields('title description'),
  language: fields('title title_native description metakey metadesc sitename')
}

export const JSON_FIELDS = fields('params attribs images urls metadata fieldparams')

/** Required title columns cannot go empty through Joomla's Table validation. A no-break space hides demo words. */
export const emptyRecordValue = (column) => (column === 'title' || column === 'name' ? '\u00a0' : '')

/** Blank the actual bound node, keeping its siblings, tags and text-node positions, even when words repeat. */
export function blankBoundField(html, blank) {
  const nodes = boundNodes(html, blank.xpath)
  if (nodes?.length !== 1) return null
  const node = nodes[0]
  const element = node.owner ?? node
  let root = element
  while (root.parentNode && root.parentNode.tagName !== 'body') root = root.parentNode
  if (root.parentNode?.tagName !== 'body') return null
  const hide = (target) => {
    if (!target.attrs.some((attr) => attr.name === 'hidden'))
      target.attrs.unshift({ name: 'hidden', value: '' })
  }
  const empty = (target, preserveSpace = false) => {
    if (target.nodeName === '#text') {
      if (target.value.trim() !== '')
        target.value = preserveSpace ? target.value.replace(/^(\s*)[\s\S]*?(\s*)$/, '$1\u00a0$2') : '\u00a0'
      return
    }
    if (target.tagName === 'img') hide(target)
    for (const child of target.childNodes ?? []) empty(child)
  }
  if (node.owner) {
    if (blank.type === 'image') hide(node.owner)
    else node.owner.attrs.find((attr) => attr.name === node.name).value = node.name === 'href' ? '#' : ''
  } else empty(node, true)
  return serialize(root).replace(/<img hidden=""/g, '<img hidden')
}

/** A mandatory emptying that cannot reach its target must stop the brief build, with all affected slot keys. */
export function recordFallbackError(keys, cause) {
  const error = new Error(
    `Template content could not be neutralized: ${[...new Set(keys)].join(', ')}`,
    cause ? { cause } : undefined
  )
  error.code = 'JOOMLA_RECORD_FALLBACK_UNRESOLVED'
  return error
}
