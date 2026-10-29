// PHP is kept opaque while finding HTML boundaries, then restored for destination and language-key evidence.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { actionKindOfDestination } from './button-actions.mjs'
const { parseFragment } = createRequire(new URL('../../apps/tracy-web/package.json', import.meta.url))(
  'parse5'
)

const attr = (attrs, name) =>
  attrs.match(new RegExp(`\\b${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i'))?.[2] ?? ''

/** Every literal language constant used inside a real button, with the job of that rendered use. */
export function buttonsOfMarkup(source, file = '') {
  const php = []
  const masked = String(source).replace(/<\?[\s\S]*?\?>/g, (part) => `__PHP_${php.push(part) - 1}__`)
  const restore = (text) => text.replace(/__PHP_(\d+)__/g, (_, index) => php[Number(index)])
  const buttons = []
  const wrapped = `<div>${masked}</div>`
  const walk = (node, xpath) => {
    const tag = node.tagName
    if (tag === 'a' || tag === 'button') {
      const location = node.sourceCodeLocation
      if (!location?.startTag || !location.endTag) return
      const attrs = restore(wrapped.slice(location.startTag.startOffset, location.startTag.endOffset))
      const body = restore(wrapped.slice(location.startTag.endOffset, location.endTag.startOffset))
      const classes = attr(attrs, 'class')
      const toggle = attr(attrs, 'data-bs-toggle') || attr(attrs, 'data-toggle')
      const header = /(?:header|masthead)/i.test(file)
      const button =
        tag === 'button' ||
        /(?:^|\s)(?:btn(?:-\w+)?|button(?:-\w+)?|cta(?:-\w+)?)(?:\s|$)/i.test(classes) ||
        toggle
      if (button) {
        const target = attr(attrs, 'data-bs-target') || attr(attrs, 'data-target')
        const destination = target || attr(attrs, 'href')
        const id = attr(attrs, 'id')
        const selector = `${file}:${tag}${id ? `#${id}` : classes ? `.${classes.trim().split(/\s+/).join('.')}` : ''}`
        const contactForm =
          tag === 'button' && /com_contact\/.*form/i.test(file) && /submit/i.test(attr(attrs, 'type'))
        const destinationKind = actionKindOfDestination(destination)
        const conversion =
          destinationKind === 'contact' ||
          /(?:^|\/)(?:book|reserve|appointments?|order|shop)(?:[/?#-]|$)/i.test(destination)
        const kind =
          toggle === 'collapse'
            ? 'navigation'
            : header && conversion
              ? 'primary-cta'
              : contactForm
                ? 'submit-form'
                : destinationKind
        buttons.push({ kind, selector, xpath, ...(destination ? { destination } : {}), body })
      }
    }
    const elements = (node.childNodes ?? []).filter((child) => child.tagName)
    for (const child of elements) {
      const siblings = elements.filter((sibling) => sibling.tagName === child.tagName)
      walk(child, `${xpath}/${child.tagName}${siblings.length > 1 ? `[${siblings.indexOf(child) + 1}]` : ''}`)
    }
  }
  const root = parseFragment(wrapped, { sourceCodeLocationInfo: true }).childNodes[0]
  walk(root, '/html/body/div')
  return buttons
}

/** Every literal language constant inside a button, retaining conflicting rendered uses. */
export function buttonUsesOfMarkup(source, file = '') {
  const uses = new Map()
  for (const { body, xpath: _xpath, ...use } of buttonsOfMarkup(source, file)) {
    for (const constant of body.matchAll(
      /(?:Text|JText)\s*::\s*(?:_|sprintf)\s*\(\s*['"]([A-Z][A-Z0-9_]+)['"]/g
    )) {
      const list = uses.get(constant[1]) ?? []
      if (!list.some((existing) => JSON.stringify(existing) === JSON.stringify(use))) list.push(use)
      uses.set(constant[1], list)
    }
  }
  return uses
}

/** The captured module/article HTML proves which otherwise generic anchor slots are buttons. */
export function sourceButtonUses(contentMap) {
  const entities = new Map((contentMap.entities ?? []).map((entity) => [entity.key, entity]))
  const uses = new Map()
  const parsed = new Map()
  for (const slot of contentMap.slots ?? []) {
    if (!slot.xpath || !['text', 'url'].includes(slot.type)) continue
    let source = entities.get(slot.entity)?.initial?.[slot.column]
    for (const part of slot.jsonPath ?? []) {
      if (typeof source === 'string') {
        try {
          source = JSON.parse(source)
        } catch {
          break
        }
      }
      source = source?.[part]
    }
    if (typeof source !== 'string' || !source.includes('<')) continue
    const at = String(slot.xpath).replace(/\/(?:@href|text\(\)(?:\[\d+\])?)$/, '')
    if (!parsed.has(source)) parsed.set(source, buttonsOfMarkup(source))
    const found = parsed
      .get(source)
      .filter((button) => at === button.xpath || (slot.type === 'text' && at.startsWith(`${button.xpath}/`)))
    if (!found.length) continue
    uses.set(
      slot.key,
      found.map(({ body: _body, xpath: _xpath, ...use }) => use)
    )
    if (found.some((button) => !button.kind)) slot.button = true
  }
  return uses
}

/** Scan template-owned files only, with every use retained for a shared language string. */
export function templateButtonUses(webroot, template) {
  const dir = path.join(webroot, 'templates', template)
  const found = new Map()
  const walk = (folder) => {
    if (!existsSync(folder)) return
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const full = path.join(folder, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (/\.(?:php|html?)$/i.test(entry.name)) {
        for (const [key, uses] of buttonUsesOfMarkup(
          readFileSync(full, 'utf8'),
          path.relative(webroot, full)
        ))
          found.set(key, [...(found.get(key) ?? []), ...uses])
      }
    }
  }
  walk(dir)
  return found
}

/** Bind source language constants to their content-map identities, never their translated wording. */
export function languageButtonUses(contentMap, usesByConstant) {
  const entities = new Map((contentMap.entities ?? []).map((entity) => [entity.key, entity]))
  const uses = new Map()
  for (const slot of contentMap.slots ?? []) {
    const entity = entities.get(slot.entity)
    const found = entity?.kind === 'languageString' ? usesByConstant.get(entity.identity?.key) : null
    if (found?.length && slot.type === 'text') {
      uses.set(slot.key, found)
      if (found.some((use) => !use.kind)) slot.button = true
    }
  }
  return uses
}
