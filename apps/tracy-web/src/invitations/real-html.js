import { parse, serialize } from 'parse5'
import { parse as parseCss, generate, walk } from 'css-tree'
import { inspectTokens } from './real-render.js'
import { realError } from './real-store.js'

const TAGS = new Set(
  'html head body title style table thead tbody tfoot tr td th div span p br hr h1 h2 h3 h4 h5 h6 a img ul ol li strong em b i u blockquote'.split(
    ' '
  )
)
const PROPERTIES = new Set(
  'color background-color font-family font-size font-weight font-style line-height letter-spacing text-align text-decoration text-transform white-space word-break overflow-wrap vertical-align padding padding-top padding-right padding-bottom padding-left margin margin-top margin-right margin-bottom margin-left border border-top border-right border-bottom border-left border-color border-width border-style border-radius border-collapse border-spacing table-layout width min-width max-width height min-height max-height display float clear list-style-type opacity'.split(
    ' '
  )
)
const FUNCTIONS = new Set(['rgb', 'rgba', 'hsl', 'hsla'])
const LAYOUT = new Set([
  'align',
  'valign',
  'width',
  'height',
  'border',
  'cellpadding',
  'cellspacing',
  'colspan',
  'rowspan',
  'bgcolor'
])
function hasSpaceOrControl(value) {
  return [...value].some((char) => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127)
}
export function emailImagePath(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 1024 &&
    !/[\\:%?#]/.test(value) &&
    !hasSpaceOrControl(value) &&
    !value.startsWith('/') &&
    value.split('/').every((p) => p && p !== '.' && p !== '..')
  )
}
function safeHref(value) {
  if (value === '{{invitation_url}}') return true
  if (hasSpaceOrControl(value) || value.includes('\\')) return false
  try {
    const u = new URL(value)
    return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password
  } catch {
    return false
  }
}
export function sanitizeEmailHtml({ html, imagePaths, registry }) {
  if (
    typeof html !== 'string' ||
    Buffer.byteLength(html) > 256 * 1024 ||
    !Array.isArray(imagePaths) ||
    !imagePaths.every(emailImagePath)
  )
    throw realError('REAL_HTML_LIMIT')
  const warnings = new Set(),
    refs = new Set(),
    paths = new Set(imagePaths),
    removed = new Map()
  // `what` names the kind of thing dropped (never its content) so the operator sees what changed.
  const warn = (what = 'unsupported content') => {
    warnings.add('HTML_CONTENT_REMOVED')
    removed.set(what, (removed.get(what) ?? 0) + 1)
  }
  function declarations(list) {
    const result = []
    list.forEach((node) => {
      if (node.type !== 'Declaration') {
        warn('CSS rule')
        return
      }
      if (!PROPERTIES.has(node.property.toLowerCase())) {
        warn(`CSS property ${node.property.toLowerCase().slice(0, 40)}`)
        return
      }
      let valid = true
      walk(node.value, (n) => {
        if (
          n.type === 'Raw' ||
          n.type === 'Url' ||
          (n.type === 'Function' && !FUNCTIONS.has(n.name.toLowerCase())) ||
          // css-tree decodes escapes such as \3c into a real "<" when it generates a string, and
          // <style> text is raw: such a string could close the element and open markup.
          (n.type === 'String' && /[<>\\]/.test(n.value))
        )
          valid = false
      })
      if (!valid) {
        warn(`CSS value of ${node.property.toLowerCase().slice(0, 40)}`)
        return
      }
      if (node.important) {
        warn('CSS !important')
        return
      }
      result.push(generate(node))
    })
    return result.join(';')
  }
  function rules(list, nested = false) {
    const result = []
    list.forEach((node) => {
      if (node.type === 'Rule' && node.prelude?.type === 'SelectorList') {
        const selector = generate(node.prelude)
        if (!/^[a-zA-Z0-9_.# ,>+~*:-]+$/.test(selector) || /:/.test(selector)) {
          warn('CSS selector')
          return
        }
        const body = declarations(node.block.children)
        if (body) result.push(`${selector}{${body}}`)
      } else if (!nested && node.type === 'Atrule' && node.name.toLowerCase() === 'media' && node.block) {
        const query = generate(node.prelude)
        const match = /^(?:screen and )?\((?:min|max)-width:(\d+)px\)$/.exec(query)
        if (!match || Number(match[1]) < 1 || Number(match[1]) > 10000) {
          warn('CSS @media query')
          return
        }
        const body = rules(node.block.children, true)
        if (body) result.push(`@media ${query}{${body}}`)
      } else warn(node.type === 'Atrule' ? `CSS @${node.name.toLowerCase().slice(0, 40)}` : 'CSS rule')
    })
    return result.join('')
  }
  function css(value, inline) {
    if (/\{\{/.test(value)) throw realError('REAL_TOKEN_CONTEXT')
    try {
      const ast = parseCss(value, {
        context: inline ? 'declarationList' : 'stylesheet',
        onParseError: () => warn('CSS that could not be read')
      })
      const out = inline ? declarations(ast.children) : rules(ast.children)
      // Defence in depth: generated CSS must never carry markup back into the raw <style> text.
      if (/[<>]/.test(out)) {
        warn('CSS that could not be read')
        return ''
      }
      return out
    } catch {
      warn('CSS that could not be read')
      return ''
    }
  }
  const tree = parse(html)
  function clean(node) {
    if (node.nodeName === '#text') {
      if (node.parentNode?.tagName === 'title' && /[{}]/.test(node.value))
        throw realError('REAL_TOKEN_CONTEXT')
      return true
    }
    if (!node.tagName) {
      if (node.nodeName === '#document') return children(node)
      warn(
        node.nodeName === '#comment'
          ? 'HTML comment'
          : node.nodeName === '#documentType'
            ? 'doctype'
            : 'unsupported content'
      )
      return false
    }
    if (!TAGS.has(node.tagName) || node.namespaceURI !== 'http://www.w3.org/1999/xhtml') {
      warn(`<${node.tagName.slice(0, 40)}> element`)
      return false
    }
    const attrs = []
    for (const attr of node.attrs) {
      const { name, value } = attr
      if (
        /[{}]/.test(name) ||
        (/\{\{|\}\}/.test(value) &&
          !(node.tagName === 'a' && name === 'href' && value === '{{invitation_url}}'))
      )
        throw realError('REAL_TOKEN_CONTEXT')
      if (attr.namespace || attr.prefix) {
        warn(`${name.slice(0, 40)} attribute`)
        continue
      }
      if (name === 'style') {
        const value = css(attr.value, true)
        if (value) attrs.push({ ...attr, value })
        continue
      }
      if (name === 'src' && node.tagName === 'img') {
        if (!emailImagePath(value) || !paths.has(value)) throw realError('REAL_IMAGE_REFERENCE')
        refs.add(value)
        attrs.push(attr)
        continue
      }
      if (name === 'href' && node.tagName === 'a') {
        if (safeHref(value)) attrs.push(attr)
        else warn('link that is not https or http')
        continue
      }
      if (
        ['title', 'alt', 'class', 'data-if-present'].includes(name) ||
        (LAYOUT.has(name) && /^[a-zA-Z0-9 #%.,-]{1,100}$/.test(value))
      )
        attrs.push(attr)
      else warn(`${name.slice(0, 40)} attribute`)
    }
    node.attrs = attrs
    if (node.tagName === 'img' && !attrs.some((a) => a.name === 'src'))
      throw realError('REAL_IMAGE_REFERENCE')
    if (node.tagName === 'style') {
      const value = css(node.childNodes.map((n) => n.value ?? '').join(''), false)
      node.childNodes = [{ nodeName: '#text', value, parentNode: node }]
      return true
    }
    return children(node)
  }
  function children(node) {
    node.childNodes = (node.childNodes ?? []).filter(clean)
    return true
  }
  clean(tree)
  // Inspect a fragment: document wrappers are not part of the renderer's input contract.
  const output = serialize(tree)
  const body = tree.childNodes.find((n) => n.tagName === 'html')?.childNodes.find((n) => n.tagName === 'body')
  const head = tree.childNodes.find((n) => n.tagName === 'html')?.childNodes.find((n) => n.tagName === 'head')
  const headTokens = inspectTokens({ subject: '', html: serialize(head), text: null, registry })
  const inspected = inspectTokens({ subject: '', html: serialize(body), text: null, registry })
  return {
    html: output,
    assetReferences: [...refs],
    warnings: [...warnings],
    removed: [...removed].map(([item, count]) => ({ item, count })),
    dependencies: [...new Set([...headTokens.dependencies, ...inspected.dependencies])].sort()
  }
}
