import { createHash } from 'node:crypto'
import { parseFragment, serialize } from 'parse5'
import { validateRegistry, resolveFields } from './real-fields.js'
import { dependencyFingerprint } from './source-approval.js'
import { realError } from './real-store.js'

const SYSTEM = 'invitation_url'
const FOOTER = 'Unsubscribe will be available when sending is enabled.'
// The system footer sits under the template's content as a small, muted, centered line, so it
// reads as part of the email rather than as stray default text. Only inline properties the
// cleaner allows, so a saved draft keeps it as is.
export const FOOTER_STYLE =
  'margin:24px auto 16px;max-width:560px;padding:0 12px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#6b625d;text-align:center'
const BLOCKS = new Set([
  'p',
  'div',
  'table',
  'tr',
  'td',
  'th',
  'blockquote',
  'ul',
  'ol',
  'li',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6'
])
const EMPTY = new Set(['style', 'head', 'title', 'script'])
function tokens(text) {
  if (typeof text !== 'string') throw realError('REAL_INVALID_TEMPLATE')
  const result = []
  let cursor = 0
  for (const match of text.matchAll(/\{\{([^{}]*)\}\}/g)) {
    if (
      /[{}]/.test(text.slice(cursor, match.index)) ||
      !(/^[a-z][a-z0-9_]*$/.test(match[1]) || /^custom\.[a-z][a-z0-9_]{0,63}$/.test(match[1])) ||
      match[1] === 'unsubscribe_url' ||
      ['custom.constructor', 'custom.prototype', 'custom.__proto__'].includes(match[1])
    )
      throw realError('REAL_INVALID_TOKEN')
    result.push(match[1])
    cursor = match.index + match[0].length
  }
  if (/[{}]/.test(text.slice(cursor))) throw realError('REAL_INVALID_TOKEN')
  return result
}
function compiler({ subject, html, text, registry }) {
  const headers =
    registry?.fields?.filter((f) => f.source?.kind === 'column').map((f) => f.source.column) ?? []
  const r = validateRegistry({ registry, headers: [...new Set(headers)], storedValues: true })
  if (
    typeof html !== 'string' ||
    Buffer.byteLength(html) > 256 * 1024 ||
    (text !== null &&
      text !== undefined &&
      (typeof text !== 'string' || Buffer.byteLength(text) > 100 * 1024)) ||
    typeof subject !== 'string' ||
    Buffer.byteLength(subject) > 998
  )
    throw realError('REAL_TEMPLATE_LIMIT')
  const definitions = new Map(r.fields.map((f) => [f.key, f])),
    dependencies = new Set(),
    unknown = new Set()
  function track(value, conditions = [], system = false) {
    for (const key of tokens(value)) {
      if (key === SYSTEM) {
        if (!system) throw realError('REAL_TOKEN_CONTEXT')
        dependencies.add(key)
        continue
      }
      const field = definitions.get(key)
      if (!field) unknown.add(key)
      else if (field.missing === 'omit' && !conditions.includes(key)) throw realError('REAL_OMIT_CONTEXT')
      dependencies.add(key)
    }
  }
  track(subject)
  if (text !== null && text !== undefined) track(text)
  const tree = parseFragment(html)
  function visit(node, conditions = []) {
    if (node.tagName?.match(/[{}]/)) throw realError('REAL_TOKEN_CONTEXT')
    if (node.nodeName === '#comment') {
      if (/[{}]/.test(node.data)) throw realError('REAL_TOKEN_CONTEXT')
      return
    }
    let local = conditions
    for (const attr of node.attrs ?? []) {
      if (/[{}]/.test(attr.name)) throw realError('REAL_TOKEN_CONTEXT')
      if (attr.name === 'data-if-present') {
        if (!BLOCKS.has(node.tagName) || !/^([a-z][a-z0-9_]*|custom\.[a-z][a-z0-9_]{0,63})$/.test(attr.value))
          throw realError('REAL_INVALID_CONDITION')
        if (!definitions.has(attr.value)) unknown.add(attr.value)
        dependencies.add(attr.value)
        local = [...conditions, attr.value]
      } else if (/[{}]/.test(attr.value)) {
        if (attr.name === 'href' && node.tagName === 'a' && attr.value === '{{invitation_url}}')
          track(attr.value, [], true)
        else throw realError('REAL_TOKEN_CONTEXT')
      }
    }
    if (node.nodeName === '#text') {
      if (EMPTY.has(node.parentNode?.tagName)) {
        // Adjacent closing braces are ordinary nested CSS rules, not a token.
        if (node.parentNode.tagName === 'style' ? /\{\{/.test(node.value) : /\{\{|\}\}/.test(node.value))
          throw realError('REAL_TOKEN_CONTEXT')
      } else track(node.value, local)
    }
    for (const child of node.childNodes ?? []) visit(child, local)
    // A template subtree is inert in browsers but must not bypass dependency validation.
    if (node.content) visit(node.content, local)
  }
  visit(tree)
  return {
    tree,
    registry: r,
    definitions,
    unknown: [...unknown].sort(),
    dependencies: [...dependencies].sort()
  }
}
export function inspectTokens(input) {
  const c = compiler(input)
  return { unknown: c.unknown, dependencies: c.dependencies }
}
export function emailText(tree) {
  function read(node) {
    if (EMPTY.has(node.tagName)) return ''
    if (node.nodeName === '#text') return node.value
    if (node.tagName === 'br') return '\n'
    if (node.tagName === 'img') return node.attrs.find((a) => a.name === 'alt')?.value ?? ''
    let text = (node.childNodes ?? []).map(read).join('')
    if (node.tagName === 'a') {
      const href = node.attrs.find((a) => a.name === 'href')?.value
      if (href && href !== text) text += ` (${href})`
    }
    return BLOCKS.has(node.tagName) ? `\n${text}\n` : text
  }
  return read(tree)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
/** Input HTML must already have passed the archive/HTML sanitizer before any user-facing call. */
export function renderRealTemplate({
  template,
  registry,
  rawSource,
  group,
  groupLabel,
  recipientValues = {},
  destination,
  identities
}) {
  if (
    !template ||
    !Number.isSafeInteger(template.version) ||
    template.version < 1 ||
    !Array.isArray(template.assets) ||
    template.assets.length > 50 ||
    typeof destination !== 'string' ||
    !Array.isArray(identities) ||
    !identities.every((i) => typeof i === 'string')
  )
    throw realError('REAL_INVALID_TEMPLATE')
  const c = compiler({ ...template, text: template.text ?? null, registry })
  if (c.unknown.length) throw realError('REAL_UNKNOWN_TOKEN')
  const resolved = resolveFields({
    registry: c.registry,
    rawSource,
    group,
    groupLabel,
    recipientValues,
    storedValues: true
  })
  const replace = (text) =>
    text.replace(/\{\{([^{}]*)\}\}/g, (_match, key) => {
      if (!resolved.presence[key]) throw realError('REAL_MISSING_FIELD')
      return resolved.values[key]
    })
  function render(node) {
    const condition = node.attrs?.find((a) => a.name === 'data-if-present')?.value
    if (condition && !resolved.presence[condition]) {
      if (c.definitions.get(condition)?.missing === 'required') throw realError('REAL_MISSING_FIELD')
      return false
    }
    if (node.attrs)
      node.attrs = node.attrs.filter(
        (a) =>
          a.name !== 'data-if-present' &&
          !(node.tagName === 'a' && a.name === 'href' && a.value === '{{invitation_url}}')
      )
    if (node.nodeName === '#text' && !EMPTY.has(node.parentNode?.tagName)) node.value = replace(node.value)
    if (node.childNodes) node.childNodes = node.childNodes.filter(render)
    if (node.content) render(node.content)
    return true
  }
  render(c.tree)
  const subject = replace(template.subject)
  if (/[\p{Cc}\u2028\u2029]/u.test(subject) || Buffer.byteLength(subject) > 998)
    throw realError('REAL_SUBJECT_LIMIT')
  const footer = parseFragment(`<p style="${FOOTER_STYLE}">${FOOTER}</p>`).childNodes[0]
  footer.parentNode = c.tree
  c.tree.childNodes.push(footer)
  const html = serialize(c.tree)
  const bodyText =
    template.text === null || template.text === undefined
      ? emailText(c.tree)
      : `${replace(template.text)}\n\n${FOOTER}`
  if (Buffer.byteLength(html) > 256 * 1024 || Buffer.byteLength(bodyText) > 100 * 1024)
    throw realError('REAL_TEMPLATE_LIMIT')
  const fingerprint = dependencyFingerprint({
    fields: c.dependencies,
    personalization: resolved.values,
    destination,
    identities,
    policyVersion: JSON.stringify({
      version: 'real-render-v1',
      revision: c.registry.revision,
      definitions: c.dependencies.map((k) => c.definitions.get(k) ?? { key: SYSTEM })
    })
  })
  const contentHash = createHash('sha256')
    .update(
      JSON.stringify({
        subject,
        html,
        bodyText,
        assets: template.assets,
        version: template.version,
        dependencyFingerprint: fingerprint
      })
    )
    .digest('hex')
  return {
    subject,
    html,
    bodyText,
    dependencyFields: c.dependencies,
    dependencyFingerprint: fingerprint,
    contentHash,
    assets: structuredClone(template.assets)
  }
}
