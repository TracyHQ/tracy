// form-embed.mjs — the source's form as a Contact Form 7 form, and the shortcode put where the
// source's controls stood. A design export draws its contact form as static markup — labels,
// inputs with placeholders, a row of "chips" for a choice, a dashed drop zone, a consent line,
// two buttons — none of it posts anywhere. WordPress has no core form block; the seeder installs
// Contact Form 7 and embeds one form. Before this the form was a generic name/email/message
// (labels the source never printed) appended AFTER the page body, so the contact page showed
// two forms: the source's dead one in its card, and an unstyled live one below it at the page
// edge. Now the CF7 form is built from the source's controls (`sourceForm`), and in the page's
// core/html the run of controls is replaced by the shortcode (`embedShortcode`) — one form, the
// source's fields, in the source's card.
import { JSDOM } from 'jsdom'
import { slugify } from './html-content.mjs'

const dom = new JSDOM('')
const { document } = dom.window

const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '')
const style = (el) => (el.getAttribute('style') ?? '').toLowerCase()
const CONTROLS = 'input, textarea, select, button'
const REQUIRED = /\*/

/** Element kinds a design export uses for controls it did not draw as inputs. */
const isChipRow = (el) => {
  const kids = [...el.children]
  return kids.length >= 2 && kids.every((k) => k.tagName === 'SPAN' && style(k).includes('cursor: pointer')) && !el.querySelector(CONTROLS)
}
const isDropZone = (el) => style(el).includes('dashed') && !el.querySelector(CONTROLS) && text(el).length > 0
const isConsentRow = (el) => {
  const kids = [...el.children]
  if (kids.length < 2 || el.querySelector(CONTROLS)) return false
  const box = kids[0]
  return !text(box) && /width:\s*\d+px/.test(style(box)) && /border/.test(style(box)) && /\p{L}/u.test(text(el))
}

/**
 * The multi-column grid a control sits on, when its wrapper's parent is one (`display: grid`
 * with a `grid-template-columns` of two or more tracks): `{ columns, key }` — key tells fields
 * of one grid apart from those of another. The source lays name | company and email | phone
 * two abreast; a CF7 form is a flat run of tags, so the run keeps the grouping as a wrapper.
 */
let gridSeq = 0
const grids = new WeakMap()
const gridOf = (control) => {
  const grid = control.parentElement?.parentElement
  if (!grid) return null
  const st = style(grid)
  const cols = /grid-template-columns:\s*([^;]+)/.exec(st)
  if (!/display:\s*grid/.test(st) || !cols) return null
  const tracks = cols[1].trim()
  const repeat = /repeat\(\s*(\d+)/.exec(tracks)
  const columns = repeat ? Number(repeat[1]) : tracks.split(/\s+/).length
  if (columns < 2) return null
  if (!grids.has(grid)) grids.set(grid, ++gridSeq)
  return { columns, key: grids.get(grid) }
}

/**
 * The label element that names a control. A `<label for>` naming the control's own id wins (Joomla
 * draws `div.control-label > label[for]` beside `div.controls > input#id`); an id that more than
 * one control carries names none of them. Else the previous `<label>` in the same wrapper, or the
 * wrapper's first label — unless that label points (`for`) at another control.
 */
const labelFor = (control) => {
  const id = control.getAttribute('id')
  const root = control.getRootNode()
  if (id && root?.querySelectorAll) {
    const sharers = [...root.querySelectorAll('[id]')].filter((e) => e.getAttribute('id') === id)
    // An id two controls carry is ambiguous: neither takes a label by it, nor by the neighbour.
    if (sharers.length > 1) return null
    const named = [...root.querySelectorAll('label[for]')].find((l) => l.getAttribute('for') === id)
    if (named) return named
  }
  const foreign = (l) => l.hasAttribute('for') && l.getAttribute('for') !== id
  let n = control.previousElementSibling
  while (n && n.tagName !== 'LABEL') n = n.previousElementSibling
  if (n) return foreign(n) ? null : n
  const label = control.parentElement?.querySelector('label') ?? null
  return label && !foreign(label) ? label : null
}
const kindOfInput = (input, label) => {
  const type = (input.getAttribute('type') ?? 'text').toLowerCase()
  const hint = `${label} ${input.getAttribute('placeholder') ?? ''}`.toLowerCase()
  if (type === 'email' || /e-?mail|@|почт/.test(hint)) return 'email'
  if (type === 'tel' || /phone|tel|телефон|\+7|\(___\)/.test(hint)) return 'tel'
  if (type === 'url') return 'url'
  return 'text'
}

/**
 * The controls of a source form, in order: `{ kind, label, required, placeholder, options,
 * hint, accept, limit }` — kind is text | email | tel | url | textarea | radio | file |
 * acceptance — plus `submit` and `reset` labels, and `region`: the element whose direct
 * children hold every control (the card), with the indexes of the first and last child that
 * do. The FIRST form when the html draws more than one (`sourceForms`). Null when the html has
 * no control at all.
 */
export function sourceForm(html) {
  return sourceForms(html)[0] ?? null
}

/** Every form the html draws, in document order, each read as `sourceForm` reads one. */
export function sourceForms(html) {
  const tpl = document.createElement('template')
  tpl.innerHTML = String(html ?? '')
  return readForms(tpl.content)
}

const isButton = ({ el, tag }) =>
  tag === 'BUTTON' || (tag === 'INPUT' && ['submit', 'reset', 'button', 'hidden'].includes((el.getAttribute('type') ?? '').toLowerCase()))
const FIELD_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])
const isFieldControl = (el) =>
  FIELD_TAGS.has(el.tagName) && !['submit', 'reset', 'button', 'hidden'].includes((el.getAttribute('type') ?? '').toLowerCase())
// What ends a form: a submit, or a button that stands as one. A design export draws its send button
// as `type="button"` as often as not (nothing posts), so that type ends a form too — unless it sits
// beside a field in the same parent (a "show password" or "add file" control inside a field row).
// A reset never ends a form.
const isSubmit = ({ el, tag }) => {
  const type = (el.getAttribute('type') ?? '').toLowerCase()
  if (tag === 'INPUT') return type === 'submit'
  if (tag !== 'BUTTON' || type === 'reset') return false
  if (type !== 'button') return true
  return ![...(el.parentElement?.children ?? [])].some(isFieldControl)
}

/**
 * The controls split into forms. A page can draw two forms (a quote card and a support card):
 * read as one, they became one Contact Form 7 form with both forms' fields, and the embed
 * replaced both cards and everything between them with a single shortcode. A field that comes
 * after a submit starts a new form (a reset after the submit stays with it); so does a control
 * inside another `<form>` element. A run with no field (a stray button before the first field)
 * joins its neighbour, so it never becomes a form of its own.
 */
function splitForms(found) {
  const groups = []
  let closed = false
  for (const item of found) {
    const cur = groups.at(-1)
    const prevForm = cur?.at(-1).el.closest('form') ?? null
    const form = item.el.closest('form')
    const otherForm = form && prevForm && form !== prevForm
    if (!cur || otherForm || (closed && !isButton(item))) {
      groups.push([item])
      closed = false
    } else cur.push(item)
    if (isSubmit(item)) closed = true
  }
  const out = []
  let pending = []
  for (const group of groups) {
    if (!group.some((item) => !isButton(item))) {
      if (out.length) out.at(-1).push(...group)
      else pending.push(...group)
      continue
    }
    out.push([...pending, ...group])
    pending = []
  }
  if (pending.length) out.push(pending)
  return out
}

function readForms(root) {
  const found = []
  const seen = new Set()
  const walk = (el) => {
    for (const child of el.children) {
      if (seen.has(child)) continue
      if (child.tagName === 'INPUT' || child.tagName === 'TEXTAREA' || child.tagName === 'SELECT' || child.tagName === 'BUTTON') {
        found.push({ el: child, tag: child.tagName })
        seen.add(child)
        continue
      }
      if (isChipRow(child)) {
        found.push({ el: child, tag: 'CHIPS' })
        seen.add(child)
        continue
      }
      if (isDropZone(child)) {
        found.push({ el: child, tag: 'DROP' })
        seen.add(child)
        continue
      }
      if (isConsentRow(child)) {
        found.push({ el: child, tag: 'CONSENT' })
        seen.add(child)
        continue
      }
      walk(child)
    }
  }
  walk(root)
  return splitForms(found).map(formOf)
}

function formOf(found) {
  const fields = []
  let submit = null
  let reset = null
  const clean = (s) => s.replace(/\s*\*\s*$/, '').replace(/^\*\s*/, '').trim()
  for (const { el, tag } of found) {
    if (tag === 'BUTTON') {
      const t = text(el)
      const type = (el.getAttribute('type') ?? '').toLowerCase()
      if (type === 'reset' || (submit && /clear|reset|очист|сброс/i.test(t))) reset = reset ?? t
      else if (!submit) submit = t
      continue
    }
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      const label = labelFor(el)
      const labelText = text(label)
      const type = (el.getAttribute('type') ?? 'text').toLowerCase()
      const grid = gridOf(el)
      if (tag === 'INPUT' && ['submit', 'reset', 'button', 'hidden'].includes(type)) {
        if (type === 'submit' && !submit) submit = el.getAttribute('value') ?? ''
        continue
      }
      if (tag === 'INPUT' && type === 'checkbox') {
        fields.push({ kind: 'acceptance', label: clean(labelText || text(el.parentElement)), required: REQUIRED.test(labelText) })
        continue
      }
      if (tag === 'INPUT' && type === 'file') {
        fields.push({ kind: 'file', label: clean(labelText), required: REQUIRED.test(labelText), hint: null, accept: null, limit: null })
        continue
      }
      fields.push({
        kind: tag === 'TEXTAREA' ? 'textarea' : tag === 'SELECT' ? 'select' : kindOfInput(el, labelText),
        label: clean(labelText),
        required: REQUIRED.test(labelText) || el.hasAttribute('required'),
        placeholder: el.getAttribute('placeholder') ?? null,
        ...(grid ? { grid: grid.columns, gridKey: grid.key } : {}),
        ...(tag === 'SELECT' ? { options: [...el.querySelectorAll('option')].map(text).filter(Boolean) } : {})
      })
      continue
    }
    if (tag === 'CHIPS') {
      const label = labelFor(el)
      const labelText = text(label)
      fields.push({ kind: 'radio', label: clean(labelText), required: REQUIRED.test(labelText), options: [...el.children].map(text).filter(Boolean) })
      continue
    }
    if (tag === 'DROP') {
      const lines = [...el.children].map(text).filter(Boolean)
      const hint = lines[1] ?? null
      const types = hint ? [...hint.matchAll(/\b(pdf|dwg|dxf|zip|rar|docx?|xlsx?|pptx?|jpe?g|png)\b/gi)].map((m) => m[1].toLowerCase()) : []
      const limit = hint ? /(\d+)\s*(mb|мб)/i.exec(hint) : null
      fields.push({ kind: 'file', label: lines[0] ?? text(el), required: false, hint, accept: types.length ? [...new Set(types)] : null, limit: limit ? `${limit[1]}mb` : null })
      continue
    }
    if (tag === 'CONSENT') {
      fields.push({ kind: 'acceptance', label: text(el), required: true })
    }
  }
  // The region: the deepest element whose direct children hold every control found.
  const holders = found.map(({ el }) => el)
  let region = holders[0].parentElement
  while (region && !holders.every((h) => region.contains(h))) region = region.parentElement
  const kids = region ? [...region.children] : []
  const holds = (child) => holders.some((h) => child === h || child.contains(h))
  const first = kids.findIndex(holds)
  const last = kids.length - 1 - [...kids].reverse().findIndex(holds)
  return { fields, submit, reset, region: region && first >= 0 ? { el: region, first, last } : null }
}

/** The required-field mark of a CF7 label: the star in an element the theme styles. */
const REQUIRED_MARK = '<span class="wtb-form__required" aria-hidden="true">*</span>'

const isLatin = (s) => /^[a-z0-9-]+$/.test(s)
const quote = (s) => `"${String(s).replace(/"/g, "'")}"`

/**
 * The Contact Form 7 form (`_form`) for the controls `sourceForm` read: one CF7 tag per field,
 * the label the source printed around it, the placeholder as CF7's `placeholder` option, a
 * chip row as radio buttons, the drop zone as a file field with the types and the limit its
 * hint named, the consent line as an acceptance, the source's submit label, and its reset
 * button as a plain `<button type="reset">` (CF7 has no reset tag). Field names are the label's
 * Latin slug, else `<kind>-<n>`. The `wtb-form__*` classes are hooks for the theme's CSS.
 */
export function cf7Form({ fields = [], submit = null, reset = null } = {}) {
  const names = new Set()
  const counts = {}
  const nameFor = (f) => {
    const slug = slugify(f.label ?? '')
    let name = isLatin(slug) && slug.length <= 40 && !/^(drag|drop|click)/.test(slug) ? slug : `${f.kind}-${(counts[f.kind] = (counts[f.kind] ?? 0) + 1)}`
    while (names.has(name)) name = `${name}-${(counts[name] = (counts[name] ?? 1) + 1)}`
    names.add(name)
    return name
  }
  const star = (f) => (f.required ? '*' : '')
  // Source text is text: a label or hint that reads like markup must not become markup in the form.
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  // The source marks a required field with a star of its own (`<span class="star"> *</span>`,
  // drawn in its own colour); a star typed into the label text is a character the theme cannot
  // reach. It is an element with a hook, as in the source, and the label text stays the label.
  const required = (f) => (f.required ? ` ${REQUIRED_MARK}` : '')
  const lines = []
  const named = fields.map((f) => ({ ...f, name: nameFor(f) }))
  // Fields of one source grid, consecutive, are wrapped as one: the theme draws the grid.
  let open = null
  const closeGrid = () => {
    if (open === null) return
    const start = lines.findIndex((l) => l === open.marker)
    lines.splice(start, 1, `<div class="wtb-form__grid wtb-form__grid--${open.columns}">\n${lines.splice(start + 1).join('\n')}\n</div>`)
    open = null
  }
  for (const f of named) {
    if (f.gridKey && open?.key !== f.gridKey) {
      closeGrid()
      open = { key: f.gridKey, columns: f.grid, marker: `\u0000grid-${f.gridKey}` }
      lines.push(open.marker)
    } else if (!f.gridKey) closeGrid()
    const label = f.label ? `${esc(f.label)}${required(f)}` : ''
    switch (f.kind) {
      case 'text':
      case 'email':
      case 'tel':
      case 'url':
      case 'textarea':
        lines.push(`<label class="wtb-form__field"> ${label}\n    [${f.kind}${star(f)} ${f.name}${f.placeholder ? ` placeholder ${quote(f.placeholder)}` : ''}] </label>`)
        break
      case 'select':
        lines.push(`<label class="wtb-form__field"> ${label}\n    [select${star(f)} ${f.name} ${(f.options ?? []).map(quote).join(' ')}] </label>`)
        break
      case 'radio':
        lines.push(`<fieldset class="wtb-form__choices"><legend>${label}</legend>\n    [radio ${f.name} use_label_element default:1 ${(f.options ?? []).map(quote).join(' ')}]</fieldset>`)
        break
      case 'file':
        lines.push(
          `<label class="wtb-form__file"> ${label}${f.hint ? ` <span class="wtb-form__hint">${esc(f.hint)}</span>` : ''}\n    [file${star(f)} ${f.name}${f.accept ? ` filetypes:${f.accept.join('|')}` : ''}${f.limit ? ` limit:${f.limit}` : ''}] </label>`
        )
        break
      case 'acceptance':
        lines.push(`[acceptance ${f.name}] ${esc(f.label)} [/acceptance]`)
        break
      default:
        break
    }
  }
  closeGrid()
  const actions = [`[submit ${quote(submit || 'Send')}]`, reset ? `<button type="reset" class="wtb-form__reset">${esc(reset)}</button>` : '']
  lines.push(`<div class="wtb-form__actions">${actions.filter(Boolean).join(' ')}</div>`)
  return { form: lines.join('\n\n'), fields: named.map(({ gridKey, ...f }) => f) }
}

/** The mail body that lists every field the form carries, label by label. */
export function cf7MailBody(fields) {
  const rows = fields.filter((f) => f.kind !== 'acceptance').map((f) => `${f.label || f.name}: [${f.name}]`)
  return `${rows.join('\n')}\n\n-- \nThis is a notification that a contact form was submitted on your website ([_site_title] [_site_url]).`
}

/** The text a CF7 form prints — labels, options, hints, the buttons — for a coverage check. */
export function cf7FormText(form) {
  return String(form ?? '')
    .replace(/\[(radio|select|checkbox)[^\]]*?((?:"[^"]*"\s*)+)\]/g, (_, __, opts) => ` ${opts.replace(/"/g, ' ')} `)
    .replace(/\[submit\s+"([^"]*)"\]/g, ' $1 ')
    .replace(/\[\/?[a-z*]+[^\]]*\]/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * `html` with the source's run of controls replaced by `shortcode` — the region `sourceForm`
 * found, its children from the first that holds a control to the last. What stands before
 * (a note, a heading) and after (nothing, usually) stays; so does everything outside the card.
 * The shortcode sits on a line of its own so WordPress expands it as a block of its own
 * (`shortcode_unautop`). Returns the html unchanged when no control is found.
 *
 * Only the FIRST form is embedded: the seeder builds one Contact Form 7 form per locale, from
 * `sourceForm` (the first form), so a second shortcode would print the first form's fields in
 * the second form's card. Every other form stays as drawn — markup that posts nowhere — and is
 * named in `left` (`{ submit, fields }`, its button and field labels) for the caller to report.
 */
export function embedShortcode(html, shortcode) {
  const tpl = document.createElement('template')
  tpl.innerHTML = String(html ?? '')
  const [form, ...others] = readForms(tpl.content)
  if (!form?.region) return { html: String(html ?? ''), embedded: false }
  const { el: region, first, last } = form.region
  const kids = [...region.children]
  const anchor = kids[last + 1] ?? null
  for (let i = first; i <= last; i++) kids[i].remove()
  region.insertBefore(document.createTextNode(`\n${shortcode}\n`), anchor)
  const left = others.map((o) => ({ submit: o.submit, fields: o.fields.map((f) => f.label) }))
  return { html: tpl.innerHTML, embedded: true, left }
}
