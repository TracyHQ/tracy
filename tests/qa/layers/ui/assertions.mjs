// The ui layer's assertions.
//
// Two halves, kept apart on purpose:
//   1. `collectFacts` / `readFocusStyle` / `collectDialogFacts` run INSIDE the page (they are passed to
//      page.evaluate, so each must be self-contained) and only MEASURE: controls, accessible names,
//      visible text, widths, computed styles.
//   2. The `check*` functions run in node on those plain facts and DECIDE. They are pure, so the
//      selftests can feed them hand-made facts and prove that a known-good page passes and an
//      injected fault is caught, without a browser.
//
// Each check returns `{ ok, vacuous, violations: [{ message, evidence }] }`. `vacuous` is true when
// nothing in the page was subject to the assertion (no control, no text): the caller turns that into
// PENDING, never into PASS.

/** Storybook's own requests that fail on every story and say nothing about the product. */
export const HARNESS_NOISE = Object.freeze([
  /vite-inject-mocker-entry\.js/,
  /\/favicon\.ico/,
  /\/__vite_ping/,
  /\.map(\?|$)/
])

/** Vite re-optimises dependencies on the first story that needs one; the page reloads itself. */
export const OPTIMIZE_RELOAD = /Outdated Optimize Dep|504 \(Outdated/

/** Roles whose children are navigated with arrow keys (one tab stop for the whole widget). */
export const COMPOSITE_ROLES = Object.freeze([
  'tablist',
  'menu',
  'menubar',
  'radiogroup',
  'listbox',
  'toolbar',
  'grid',
  'tree',
  'treegrid'
])

// ---------------------------------------------------------------------------------------------
// In-page measurement
// ---------------------------------------------------------------------------------------------

/**
 * Measure the page. Runs in the browser; takes and returns plain JSON.
 * @param {{ composite: string[] }} options
 */
export function collectFacts(options) {
  const composite = options.composite
  const INTERACTIVE =
    'button, a[href], input:not([type=hidden]), select, textarea, summary, [contenteditable=""], [contenteditable="true"], ' +
    '[role=button], [role=link], [role=tab], [role=menuitem], [role=menuitemcheckbox], [role=menuitemradio], [role=checkbox], ' +
    '[role=radio], [role=switch], [role=option], [role=combobox], [role=slider], [role=textbox], [role=spinbutton], [role=searchbox]'
  const IGNORED_ROOT =
    '#storybook-docs, .sb-errordisplay, .sb-nopreview, .sb-wrapper, script, style, noscript, [data-qa-ignore]'
  const isBanner = (el) =>
    el.matches('div[style*="ui-monospace"][style*="letter-spacing"]') ||
    el.closest('div[style*="ui-monospace"][style*="letter-spacing"]') !== null

  const hiddenByStyle = (el) => {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n)
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.visibility === 'collapse') return true
      if (n.hasAttribute('hidden') || n.getAttribute('aria-hidden') === 'true' || n.hasAttribute('inert'))
        return true
    }
    return false
  }
  const inScope = (el) => !el.closest(IGNORED_ROOT) && !isBanner(el)
  const rectOf = (el) => {
    const r = el.getBoundingClientRect()
    return {
      x: Math.round(r.x),
      y: Math.round(r.y),
      w: Math.round(r.width),
      h: Math.round(r.height),
      right: Math.round(r.right)
    }
  }
  const norm = (s) => (s ?? '').replace(/\s+/g, ' ').trim()

  // Accessible name, HTML-AAM subset: aria-labelledby, aria-label, native labelling, content, title.
  const textOfNode = (node, referenced) => {
    if (node.nodeType === 3) return node.nodeValue
    if (node.nodeType !== 1) return ''
    const el = node
    if (!referenced) {
      const cs = getComputedStyle(el)
      if (
        cs.display === 'none' ||
        cs.visibility === 'hidden' ||
        el.getAttribute('aria-hidden') === 'true' ||
        el.hasAttribute('hidden')
      )
        return ''
    }
    const label = norm(el.getAttribute('aria-label'))
    if (label) return ` ${label} `
    const tag = el.tagName.toLowerCase()
    if (tag === 'img') return ` ${norm(el.getAttribute('alt'))} `
    if (tag === 'svg') {
      const title = el.querySelector(':scope > title')
      return title ? ` ${norm(title.textContent)} ` : ''
    }
    if (tag === 'input' && ['button', 'submit', 'reset'].includes(el.type)) return ` ${norm(el.value)} `
    let out = ''
    for (const child of el.childNodes) out += textOfNode(child, false)
    return out
  }
  const accessibleName = (el) => {
    const labelledby = el.getAttribute('aria-labelledby')
    if (labelledby) {
      const text = norm(
        labelledby
          .split(/\s+/)
          .map((id) => document.getElementById(id))
          .filter(Boolean)
          .map((n) => textOfNode(n, true))
          .join(' ')
      )
      if (text) return { name: text, source: 'aria-labelledby' }
    }
    const aria = norm(el.getAttribute('aria-label'))
    if (aria) return { name: aria, source: 'aria-label' }
    const tag = el.tagName.toLowerCase()
    const type = (el.getAttribute('type') ?? '').toLowerCase()
    if (tag === 'input' && ['button', 'submit', 'reset'].includes(type)) {
      const value = norm(el.value)
      if (value) return { name: value, source: 'value' }
    }
    if (tag === 'input' && type === 'image') {
      const alt = norm(el.getAttribute('alt'))
      if (alt) return { name: alt, source: 'alt' }
    }
    if (
      ['input', 'select', 'textarea', 'button', 'meter', 'output', 'progress'].includes(tag) &&
      el.labels &&
      el.labels.length
    ) {
      const text = norm([...el.labels].map((l) => textOfNode(l, true)).join(' '))
      if (text) return { name: text, source: 'label' }
    }
    const fromContent = norm(textOfNode(el, true))
    if (fromContent && !['input', 'textarea', 'select'].includes(tag))
      return { name: fromContent, source: 'content' }
    const title = norm(el.getAttribute('title'))
    if (title) return { name: title, source: 'title' }
    const placeholder = norm(el.getAttribute('placeholder'))
    if (placeholder) return { name: placeholder, source: 'placeholder' }
    return { name: '', source: 'none' }
  }

  const roleOf = (el) => el.getAttribute('role') ?? ''
  const compositeParent = (el) => {
    for (let n = el.parentElement; n; n = n.parentElement) {
      const role = n.getAttribute('role')
      if (role && composite.includes(role)) return role
    }
    return null
  }
  const pathOf = (el) => {
    const parts = []
    for (let n = el; n && n.nodeType === 1 && parts.length < 4; n = n.parentElement) {
      const slot = n.getAttribute('data-slot')
      parts.unshift(`${n.tagName.toLowerCase()}${n.id ? `#${n.id}` : ''}${slot ? `[${slot}]` : ''}`)
    }
    return parts.join(' > ')
  }

  const controls = []
  let index = 0
  for (const el of document.querySelectorAll(`${INTERACTIVE}, [tabindex]`)) {
    if (!inScope(el)) continue
    const isNamedControl = el.matches(INTERACTIVE)
    const visible =
      !hiddenByStyle(el) &&
      (() => {
        const r = el.getBoundingClientRect()
        return r.width > 0 && r.height > 0
      })()
    el.setAttribute('data-qa-i', String(index))
    const { name, source } = accessibleName(el)
    const tabindexAttr = el.getAttribute('tabindex')
    controls.push({
      i: index++,
      tag: el.tagName.toLowerCase(),
      role: roleOf(el),
      type: (el.getAttribute('type') ?? '').toLowerCase(),
      radioGroup: el.tagName === 'INPUT' && el.type === 'radio' ? el.name || '(unnamed)' : null,
      named: isNamedControl,
      name,
      nameSource: source,
      visible,
      disabled:
        el.disabled === true ||
        el.getAttribute('aria-disabled') === 'true' ||
        el.closest('fieldset[disabled]') !== null,
      tabindex: tabindexAttr === null ? null : Number.parseInt(tabindexAttr, 10),
      composite: compositeParent(el),
      path: pathOf(el),
      rect: rectOf(el)
    })
  }

  // Visible text, per element so a raw key is matched as a WHOLE text node. Code samples are not copy.
  const texts = []
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement
    if (!parent || !inScope(parent)) continue
    const value = norm(node.nodeValue)
    if (!value) continue
    if (parent.closest('code, pre, kbd, samp, [data-qa-code]')) continue
    if (hiddenByStyle(parent)) continue
    texts.push(value)
  }
  const attributes = []
  for (const el of document.querySelectorAll('[aria-label], [title], [placeholder], img[alt]')) {
    if (!inScope(el) || hiddenByStyle(el)) continue
    for (const a of ['aria-label', 'title', 'placeholder', 'alt']) {
      const v = norm(el.getAttribute(a))
      if (v) attributes.push({ attribute: a, value: v })
    }
  }

  const doc = document.documentElement
  const wide = []
  for (const el of document.body.querySelectorAll('*')) {
    if (!inScope(el)) continue
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.right > window.innerWidth + 1)
      wide.push({ path: pathOf(el), right: Math.round(r.right), w: Math.round(r.width) })
    if (wide.length >= 6) break
  }
  const dialogs = [...document.querySelectorAll('[role=dialog], [role=alertdialog], dialog[open]')].filter(
    (d) => inScope(d) && !hiddenByStyle(d)
  ).length

  return {
    controls,
    texts: [...new Set(texts)],
    attributes,
    layout: {
      scrollWidth: doc.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      innerWidth: window.innerWidth,
      wide
    },
    openDialogs: dialogs,
    title: document.title
  }
}

/** Focus-relevant computed style of one element, by its data-qa-i marker. Runs in the page. */
export function readFocusStyle(i) {
  const el = document.querySelector(`[data-qa-i="${i}"]`)
  if (!el) return null
  const cs = getComputedStyle(el)
  return {
    boxShadow: cs.boxShadow,
    outlineStyle: cs.outlineStyle,
    outlineWidth: cs.outlineWidth,
    outlineColor: cs.outlineColor,
    borderColor: cs.borderTopColor,
    borderWidth: cs.borderTopWidth,
    backgroundColor: cs.backgroundColor,
    color: cs.color
  }
}

/** Which marked control owns focus now (-1: body or something unmarked). Runs in the page. */
export function activeIndex() {
  const a = document.activeElement
  if (!a || a === document.body || a === document.documentElement) return -1
  const marked = a.closest('[data-qa-i]')
  return marked ? Number.parseInt(marked.getAttribute('data-qa-i'), 10) : -2
}

/** Dialog facts for the dialog family. Runs in the page. */
export function collectDialogFacts() {
  const visible = (el) => {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n)
      if (cs.display === 'none' || cs.visibility === 'hidden' || n.hasAttribute('hidden')) return false
    }
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0
  }
  const list = [...document.querySelectorAll('[role=dialog], [role=alertdialog], dialog[open]')].filter(
    visible
  )
  const d = list[list.length - 1]
  if (!d) return { open: false }
  const labelled = d.getAttribute('aria-labelledby')
  const name =
    (d.getAttribute('aria-label') ?? '').trim() ||
    (labelled
      ? labelled
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent ?? '')
          .join(' ')
          .trim()
      : '')
  const active = document.activeElement
  return {
    open: true,
    role: d.getAttribute('role') ?? 'dialog',
    name,
    modal:
      d.getAttribute('aria-modal') === 'true' ||
      d.hasAttribute('data-modal') ||
      document.querySelector(
        '[data-slot=dialog-overlay], [data-slot=sheet-overlay], [data-slot=alert-dialog-overlay]'
      ) !== null,
    focusInside: !!active && d.contains(active),
    activeTag: active ? active.tagName.toLowerCase() : null
  }
}

// ---------------------------------------------------------------------------------------------
// Decisions (node)
// ---------------------------------------------------------------------------------------------

const result = (violations, vacuous = false) => ({ ok: violations.length === 0, vacuous, violations })
const label = (c) => `${c.tag}${c.role ? `[role=${c.role}]` : ''} ${c.path}`

export function checkAccessibleNames(facts) {
  const subject = facts.controls.filter((c) => c.named && c.visible)
  const violations = subject
    .filter((c) => !c.name)
    .map((c) => ({
      message: `control has no accessible name: ${label(c)}`,
      evidence: { i: c.i, path: c.path, tag: c.tag, role: c.role, rect: c.rect }
    }))
  return result(violations, subject.length === 0)
}

/**
 * @param facts      collectFacts() result
 * @param tabOrder   marked indexes in the order Tab visited them (-1/-2 entries dropped by the caller)
 */
export function checkTabReach(facts, tabOrder) {
  const visited = new Set(tabOrder)
  const violations = []
  const subject = facts.controls.filter((c) => c.named && c.visible && !c.disabled)
  const radioGroupsReached = new Set(
    facts.controls.filter((c) => c.radioGroup && visited.has(c.i)).map((c) => c.radioGroup)
  )
  for (const c of subject) {
    if (c.tabindex !== null && c.tabindex > 0) {
      violations.push({
        message: `positive tabindex ${c.tabindex} breaks the natural focus order: ${label(c)}`,
        evidence: { i: c.i, path: c.path }
      })
    }
    if (visited.has(c.i)) continue
    if (c.radioGroup && radioGroupsReached.has(c.radioGroup)) continue
    if (c.tabindex === -1 && c.composite) continue
    // A composite widget's members are reached with arrow keys once the widget holds the tab stop.
    if (c.composite && facts.controls.some((o) => o.composite === c.composite && visited.has(o.i))) continue
    violations.push({
      message:
        c.tabindex === -1
          ? `tabindex=-1 outside a composite widget, not reachable by keyboard: ${label(c)}`
          : `not reached by Tab: ${label(c)}`,
      evidence: { i: c.i, path: c.path, tabindex: c.tabindex, rect: c.rect }
    })
  }
  return result(violations, subject.length === 0)
}

/** Parse the layers of a computed `box-shadow` into { inset, x, y, blur, spread, alpha, raw }. */
export function parseShadows(value) {
  if (!value || value === 'none') return []
  const layers = []
  let depth = 0
  let current = ''
  for (const ch of value) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) {
      layers.push(current.trim())
      current = ''
    } else current += ch
  }
  if (current.trim()) layers.push(current.trim())
  return layers.map((raw) => {
    const inset = /\binset\b/.test(raw)
    const color = raw.match(/(rgba?|color|oklch|oklab|lab|lch|hsla?)\([^)]*\)/)?.[0] ?? ''
    const rest = raw.replace(color, '').replace(/\binset\b/, '')
    const lengths = (rest.match(/-?[\d.]+px/g) ?? []).map((n) => Number.parseFloat(n))
    const [x = 0, y = 0, blur = 0, spread = 0] = lengths
    let alpha = 1
    const rgba = color.match(/rgba?\(([^)]*)\)/)
    if (rgba) {
      const parts = rgba[1].split(/[,/\s]+/).filter(Boolean)
      if (parts.length >= 4) alpha = Number.parseFloat(parts[3])
    } else {
      const slash = color.match(/\/\s*([\d.]+%?)/)
      if (slash)
        alpha = slash[1].endsWith('%') ? Number.parseFloat(slash[1]) / 100 : Number.parseFloat(slash[1])
      if (color.includes('transparent')) alpha = 0
    }
    return {
      raw,
      inset,
      x,
      y,
      blur,
      spread,
      alpha,
      invisible: alpha === 0 || (x === 0 && y === 0 && blur === 0 && spread === 0)
    }
  })
}

const px = (value) => {
  const m = /^(-?\d+(?:\.\d+)?)px$/.exec(String(value ?? '').trim())
  return m ? Number(m[1]) : null
}
const norm = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
const colorAlpha = (color) => {
  const c = norm(color)
  if (!c) return null
  if (c === 'transparent') return 0
  const rgba = c.match(/^rgba?\(([^)]*)\)$/)
  if (rgba) {
    const parts = rgba[1].split(/[,/\s]+/).filter(Boolean)
    if (parts.length < 4) return 1
    const v = parts[3].endsWith('%') ? Number.parseFloat(parts[3]) / 100 : Number.parseFloat(parts[3])
    return Number.isFinite(v) ? v : null
  }
  const slash = c.match(/\/\s*([\d.]+%?)\)$/)
  if (slash) return slash[1].endsWith('%') ? Number.parseFloat(slash[1]) / 100 : Number.parseFloat(slash[1])
  return 1
}

/**
 * One stroke mechanism (outline or border) read from computed styles before and after focus.
 * valid = visible after, exactly 1 CSS px, and its colour differs from before. `touched` = focus changed
 * any of its properties (so a resting stroke that focus does not touch is never judged).
 * `unsupported` = a value that is not a px length / a colour, which cannot be judged.
 */
function readStroke(was, now, keys) {
  const [style, width, color] = keys
  const nowW = px(now[width])
  const wasW = px(was[width])
  const unsupported = []
  if (nowW === null) unsupported.push(`${width}=${now[width]}`)
  if (wasW === null) unsupported.push(`before ${width}=${was[width]}`)
  const alpha = colorAlpha(now[color])
  if (alpha === null) unsupported.push(`${color}=${now[color]}`)
  const styled = style === null || !['none', 'hidden'].includes(norm(now[style]))
  const visible = styled && nowW !== null && nowW > 0 && alpha !== null && alpha > 0
  const touched =
    (style !== null && was[style] !== now[style]) || was[width] !== now[width] || was[color] !== now[color]
  const colourChanged = norm(was[color]) !== norm(now[color])
  return {
    unsupported,
    visible,
    touched,
    thick: visible && touched && nowW > 1,
    valid: visible && nowW === 1 && colourChanged
  }
}

/**
 * focus = one 1px stroke that changes colour, never a halo (DESIGN.md §5). The same predicate holds for
 * outline, border and ring (box-shadow): the stroke must be visible, exactly 1 CSS px and differ in
 * colour from before; a width/style-only change, a resting stroke, a transparent one, an offset or
 * blurred shadow, or more than one stroke does not pass. A form that cannot be read is "not measured"
 * (vacuous), never guessed as a pass.
 * @param stops  [{ i, before, after }] computed styles of each control unfocused / focused
 */
export function checkFocusStroke(facts, stops) {
  const violations = []
  const insufficient = []
  for (const stop of stops) {
    const control = facts.controls.find((c) => c.i === stop.i)
    const where = control ? label(control) : `control ${stop.i}`
    const { before: was, after: now } = stop
    const before = parseShadows(was.boxShadow).map((l) => l.raw)
    const added = parseShadows(now.boxShadow).filter((l) => !l.invisible && !before.includes(l.raw))
    // Every newly drawn shadow is judged on its own: only a 0 0 0 1px solid ring is a stroke; any other
    // (offset, blur, spread other than 1) is a halo or a drop shadow, and one stroke beside it does not excuse it.
    const rings = []
    let halo = false
    for (const layer of added) {
      if (
        layer.x === 0 &&
        layer.y === 0 &&
        layer.blur === 0 &&
        layer.spread === 1 &&
        (layer.alpha ?? 1) > 0
      ) {
        rings.push(layer)
        continue
      }
      halo = true
      violations.push({
        message: `focus draws a shadow that is not a 1px ring (box-shadow "${layer.raw}"): ${where}`,
        evidence: { i: stop.i, boxShadow: now.boxShadow }
      })
    }
    const outline = readStroke(was, now, ['outlineStyle', 'outlineWidth', 'outlineColor'])
    const border = readStroke(was, now, [null, 'borderWidth', 'borderColor'])
    const strokes = [outline.valid, border.valid].filter(Boolean).length + rings.length
    if (strokes === 0 && !halo) {
      const unreadable = [...outline.unsupported, ...border.unsupported]
      if (unreadable.length) {
        insufficient.push({ i: stop.i, unreadable })
      } else {
        violations.push({
          message: `focus shows no 1px stroke that changes colour (outline, border or ring): ${where}`,
          evidence: { i: stop.i, before: was, after: now }
        })
      }
    }
    if (strokes > 1) {
      violations.push({
        message: `focus draws ${strokes} strokes (outline, border and ring are one stroke, not several): ${where}`,
        evidence: { i: stop.i, before: was, after: now }
      })
    }
    if (border.thick) {
      violations.push({
        message: `focus border is ${now.borderWidth} thick (limit 1px): ${where}`,
        evidence: { i: stop.i, border: `${now.borderWidth} ${now.borderColor}` }
      })
    }
    if (outline.thick) {
      violations.push({
        message: `focus outline is ${now.outlineWidth} thick (limit 1px): ${where}`,
        evidence: { i: stop.i, outline: `${now.outlineStyle} ${now.outlineWidth}` }
      })
    }
  }
  if (violations.length === 0 && insufficient.length > 0)
    return { ok: false, vacuous: true, violations: [], insufficient }
  return result(violations, stops.length === 0)
}

export function checkOverflow(facts, viewportWidth) {
  const { scrollWidth, bodyScrollWidth, wide } = facts.layout
  const widest = Math.max(scrollWidth, bodyScrollWidth)
  const violations =
    widest > viewportWidth + 1
      ? [
          {
            message: `horizontal overflow at ${viewportWidth}px: page is ${widest}px wide`,
            evidence: { scrollWidth, bodyScrollWidth, viewportWidth, wide }
          }
        ]
      : []
  return result(violations)
}

/** @param events [{ type: 'console'|'pageerror'|'requestfailed'|'response', text, status?, url? }] */
export function checkConsoleNetwork(events) {
  const relevant = events.filter(
    (e) => !HARNESS_NOISE.some((re) => re.test(`${e.url ?? ''} ${e.text ?? ''}`))
  )
  const violations = relevant.map((e) => ({
    message:
      e.type === 'console'
        ? `console error: ${e.text}`
        : e.type === 'pageerror'
          ? `uncaught exception: ${e.text}`
          : e.type === 'requestfailed'
            ? `request failed: ${e.url} (${e.text})`
            : `HTTP ${e.status}: ${e.url}`,
    evidence: e
  }))
  return result(violations)
}

const PLACEHOLDER = /\{\{?[A-Za-z_][\w.]*\}?\}/
const ARTEFACT = /(^|[^\w])(undefined|\[object Object\]|NaN)([^\w]|$)/

/**
 * No raw key / unfilled placeholder / interpolation artefact. `keys` is the union of the keys of
 * the owned `en` dictionaries (strings.ts): a text node that IS a key is a lookup that missed.
 */
export function checkRawKeys(facts, keys) {
  const violations = []
  const key = keys instanceof Set ? keys : new Set(keys)
  const sources = [
    ...facts.texts.map((t) => ({ where: 'text', value: t })),
    ...facts.attributes.map((a) => ({ where: a.attribute, value: a.value }))
  ]
  for (const { where, value } of sources) {
    if (key.has(value))
      violations.push({
        message: `raw translation key on screen (${where}): "${value}"`,
        evidence: { where, value }
      })
    else if (PLACEHOLDER.test(value))
      violations.push({ message: `unfilled placeholder (${where}): "${value}"`, evidence: { where, value } })
    else if (ARTEFACT.test(value))
      violations.push({
        message: `interpolation artefact (${where}): "${value}"`,
        evidence: { where, value }
      })
  }
  return result(violations, sources.length === 0)
}

/** @param banned [{ id, pattern, flags, replacement }] from oracles/ui/banned-vocabulary.json */
export function checkVocabulary(facts, banned) {
  const violations = []
  const compiled = banned.map((b) => ({ ...b, re: new RegExp(b.pattern, b.flags) }))
  const sources = [
    ...facts.texts.map((t) => ({ where: 'text', value: t })),
    ...facts.attributes.map((a) => ({ where: a.attribute, value: a.value }))
  ]
  for (const { where, value } of sources) {
    for (const b of compiled) {
      const m = value.match(b.re)
      if (m)
        violations.push({
          message: `banned vocabulary "${m[0]}" (${where}); use "${b.replacement}"`,
          evidence: { where, value, id: b.id }
        })
    }
  }
  return result(violations, sources.length === 0)
}

/**
 * @param dialog   { opened, before: collectDialogFacts(), afterTab: [facts...], afterEscape: facts, trigger }
 * `trigger` is null when the dialog was already open (focus restoration cannot be judged then).
 */
export function checkDialog(dialog) {
  if (!dialog.before?.open) return { ok: true, vacuous: true, violations: [] }
  const violations = []
  if (!dialog.before.name)
    violations.push({ message: `${dialog.before.role} has no accessible name`, evidence: dialog.before })
  if (dialog.before.modal && dialog.afterTab.some((f) => f.open && !f.focusInside)) {
    violations.push({
      message: 'focus left a modal dialog while tabbing',
      evidence: { afterTab: dialog.afterTab }
    })
  }
  if (dialog.afterEscape?.open)
    violations.push({ message: 'Escape did not close the dialog', evidence: dialog.afterEscape })
  if (dialog.trigger && !dialog.afterEscape?.open && !dialog.focusRestored) {
    violations.push({
      message: 'focus was not returned to the dialog trigger after Escape',
      evidence: { trigger: dialog.trigger, active: dialog.activeAfter }
    })
  }
  return result(violations)
}

/** Keyset of raw keys from en dictionaries: pure helper for the callers that parse strings.ts. */
export function keysetFrom(lists) {
  return new Set(lists.flat())
}
