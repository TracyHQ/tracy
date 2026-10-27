// Offline stand-in for the Claude Design runtime (support.js) — fixture only. It binds the
// `text/x-dc` data script into the <x-dc> template with the same mini-language the real runtime
// uses ({{ path }}, ===, !, sc-if with hint-placeholder-val, sc-for with `as`), without React or
// any network access, so the render path can be exercised in a test.
window.DCLogic = class {
  constructor(props) {
    this.props = props || {}
  }
  setState() {}
}
window.someCall = () => null

function resolvePath(vals, path) {
  let cur = vals
  for (const seg of path.trim().split('.')) {
    if (cur == null) return undefined
    cur = cur[seg]
  }
  return cur
}
function resolve(vals, src) {
  const expr = String(src).trim()
  if (!expr) return undefined
  const eq = expr.match(/^(.*?)\s*(===|!==)\s*(.*)$/)
  if (eq) {
    const l = resolve(vals, eq[1])
    const r = resolve(vals, eq[3])
    return eq[2] === '===' ? l === r : l !== r
  }
  if (expr[0] === '!') return !resolve(vals, expr.slice(1))
  if (expr === 'true') return true
  if (expr === 'false') return false
  if (/^-?\d+(\.\d+)?$/.test(expr)) return Number(expr)
  if (/^(['"]).*\1$/.test(expr)) return expr.slice(1, -1)
  return resolvePath(vals, expr)
}
function interpolate(raw, vals) {
  const whole = raw.match(/^\s*\{\{([\s\S]+?)\}\}\s*$/)
  if (whole) return resolve(vals, whole[1])
  return raw.replace(/\{\{([\s\S]+?)\}\}/g, (m, e) => {
    const v = resolve(vals, e)
    return v == null ? '' : String(v)
  })
}
function bind(node, vals, out) {
  if (node.nodeType === 3) {
    const txt = node.nodeValue
    if (!txt.includes('{{')) {
      out.append(node.cloneNode())
      return
    }
    out.append(document.createTextNode(interpolate(txt, vals)))
    return
  }
  if (node.nodeType !== 1) return
  const tag = node.tagName.toLowerCase()
  if (tag === 'sc-for') {
    const list = resolve(vals, node.getAttribute('list').replace(/^\s*\{\{|\}\}\s*$/g, ''))
    const as = node.getAttribute('as') || 'item'
    if (!Array.isArray(list)) return
    list.forEach((item, i) => {
      const sub = { ...vals, [as]: item, $index: i }
      for (const c of node.childNodes) bind(c, sub, out)
    })
    return
  }
  if (tag === 'sc-if') {
    const v = resolve(vals, node.getAttribute('value').replace(/^\s*\{\{|\}\}\s*$/g, ''))
    if (!v) return
    for (const c of node.childNodes) bind(c, vals, out)
    return
  }
  const el = document.createElement(tag)
  for (const { name, value } of node.attributes) {
    if (name.startsWith('hint-') || name.startsWith('style-')) continue
    if (/^on[a-z]/i.test(name)) {
      const fn = interpolate(value, vals)
      if (typeof fn === 'function') el.addEventListener(name.slice(2).toLowerCase(), fn)
      continue
    }
    const v = value.includes('{{') ? interpolate(value, vals) : value
    if (v != null && v !== false) el.setAttribute(name, String(v))
  }
  for (const c of node.childNodes) bind(c, vals, el)
  out.append(el)
}

document.addEventListener('DOMContentLoaded', () => {
  const dc = document.querySelector('x-dc')
  const scriptEl = document.querySelector('script[data-dc-script]')
  const meta = JSON.parse(scriptEl.getAttribute('data-props') || '{}')
  const props = {}
  for (const [k, v] of Object.entries(meta)) props[k] = v.default
  const Component = new Function(scriptEl.textContent + '\nreturn Component;')()
  const inst = new Component(props)
  const vals = inst.renderVals()
  const helmet = dc.querySelector('helmet')
  if (helmet) {
    document.head.append(...helmet.childNodes)
    helmet.remove()
  }
  const root = document.createElement('div')
  root.id = 'dc-root'
  for (const c of [...dc.childNodes]) bind(c, vals, root)
  dc.remove()
  document.body.append(root)
  document.documentElement.setAttribute('data-dc-booted', '1')
})
