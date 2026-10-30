// A button's editorial role says what it holds; its action declares what a visitor does with it.
export const ACTION_KINDS = Object.freeze([
  'primary-cta',
  'go-to-item',
  'open-map',
  'contact',
  'external-profile',
  'navigation',
  // A form's own send button: its words belong to the form, never to a conversion or contact label.
  'submit-form',
  // A control of the page itself (closes a dialog, plays a video, switches a tab): it leads nowhere, its words name
  // the control, never a conversion, a page or a channel.
  'page-control'
])
const known = (kind) => ACTION_KINDS.includes(kind)
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

/** Only explicit button signals count. An ordinary inline anchor alone is not a button. */
export function isButtonSlot(slot) {
  if (!slot || !['text', 'url'].includes(slot.type)) return false
  if (slot.action !== undefined) return true
  if (slot.button === true) return true
  if (slot.role === 'editorial.button_label' || /\.cta_(?:label|url)$/.test(slot.role ?? '')) return true
  if (/\/button(?:\[\d+\])?(?:\/|$)/i.test(String(slot.xpath ?? ''))) return true
  const raw = Array.isArray(slot.jsonPath)
    ? (slot.jsonPath.filter((part) => typeof part === 'string').at(-1) ?? '')
    : String(slot.jsonPath ?? '')
  const field = raw.match(/\[([^\]]+)\]$/)?.[1] ?? raw
  if (/(?:^|[-_])(?:icon|class|style|type|target|size)(?:$|[-_])/i.test(field)) return false
  return (
    /(?:^|[-_])(?:btn|button)(?:[-_]|\d|$)/i.test(field) ||
    /^cta(?:[-_](?:label|text|url|link|href)|\d+(?:[-_](?:label|text|url|link|href))?)$/i.test(field) ||
    /(?:^|\.)(?:button|cta)(?:\.\d+)?$/i.test(String(slot.target?.block ?? ''))
  )
}

/** Every rendered job of a shared label, otherwise its single declared job. */
export function actionKindsOf(slot) {
  const uses = slot?.action?.uses
  return Array.isArray(uses) && uses.length
    ? [...new Set(uses.map((use) => use.kind))]
    : [slot?.action?.kind].filter(Boolean)
}

/**
 * Structural declaration check, independent of the historical editorial-role vocabulary.
 * A slot of a `demoOnly` entity (a style-guide page, ADR 0040) is left out: its buttons are style samples no build
 * writes, and the mark on the entity is the declaration.
 */
export function buttonActionProblems(contentMap) {
  const demoOnly = new Set(
    (Array.isArray(contentMap?.entities) ? contentMap.entities : [])
      .filter((entity) => entity?.demoOnly === true)
      .map((entity) => entity.key)
  )
  const slots = Array.isArray(contentMap?.slots) ? contentMap.slots : []
  const byKey = new Map(slots.map((slot) => [slot.key, slot]))
  const errors = []
  for (const slot of slots) {
    if (!isButtonSlot(slot) || demoOnly.has(slot.entity ?? String(slot.key).split('.')[0])) continue
    const named = `slot "${slot.key}"`
    const action = slot.action
    if (!object(action) || !known(action.kind)) {
      errors.push(
        `${named} ${action === undefined ? 'has no action role' : `has unknown action role ${JSON.stringify(action?.kind)}`}`
      )
      continue
    }
    if (action.urlKey !== undefined && byKey.get(action.urlKey)?.type !== 'url')
      errors.push(`${named} action urlKey must name a URL slot`)
    if (action.uses !== undefined) {
      if (!Array.isArray(action.uses) || action.uses.length === 0) {
        errors.push(`${named} action uses must be a non-empty array of rendered uses`)
        continue
      }
      for (const use of action.uses) {
        if (!object(use) || !known(use.kind))
          errors.push(`${named} has unknown action role in a rendered use`)
        else if (
          !['selector', 'route', 'destination'].some((key) => typeof use[key] === 'string' && use[key].trim())
        )
          errors.push(`${named} action use needs a selector, route or destination`)
      }
      const kinds = actionKindsOf(slot)
      if (kinds.length > 1 && action.kind !== 'navigation')
        errors.push(`${named} conflicting action uses require the common navigation kind`)
      if (kinds.length === 1 && kinds[0] !== action.kind)
        errors.push(`${named} action kind disagrees with its rendered uses`)
    }
  }
  return errors
}
