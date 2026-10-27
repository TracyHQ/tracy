/** Recognize layout ordinals by repeated DOM structure, never by a template name. */
export function ordinalTextEvidence(node) {
  const sample = (node.value ?? '').trim()
  if (!/^\d{2,3}$/.test(sample)) return null
  const leaf = node.parentNode
  if (!leaf?.tagName || leaf.childNodes?.some((child) => child.nodeName !== '#text')) return null
  const elements = (item) => (item?.childNodes ?? []).filter((child) => child.tagName)
  const signature = (item) =>
    `${item.tagName}:${(item.attrs ?? []).find((attr) => attr.name === 'class')?.value ?? ''}`
  let child = leaf
  const path = []
  for (let depth = 0; child?.parentNode?.tagName && depth < 3; depth++) {
    const card = child.parentNode
    path.unshift(elements(card).indexOf(child))
    const siblings = elements(card.parentNode)
    if (siblings.some((item) => signature(item) !== signature(card))) {
      child = card
      continue
    }
    if (siblings.length >= 2) {
      const text = (item) =>
        item.nodeName === '#text' ? item.value : (item.childNodes ?? []).map(text).join(' ')
      if (
        siblings.some((item) =>
          /\b(?:years?|awards?|employees|customers|projects|clients|offices|countries|percent|rating|reviews?|satisfaction|revenue|sales)\b|[%$€£¥]/i.test(
            text(item)
          )
        )
      )
        return null
      const leaves = siblings.map((item) => path.reduce((part, index) => elements(part)[index], item))
      if (
        leaves.every(
          (item, index) =>
            item &&
            signature(item) === signature(leaf) &&
            item.childNodes?.every((part) => part.nodeName === '#text') &&
            item.childNodes
              .map((part) => part.value)
              .join('')
              .trim() === String(index + 1).padStart(sample.length, '0')
        )
      )
        return { version: 'sibling-ordinal/1', path, count: siblings.length, sample }
    }
    child = card
  }
  return null
}

/** Numeric navigation is interface state, not a business statistic. */
export function navigationNumberEvidence(node) {
  const sample = (node.value ?? '').trim()
  if (!/^[1-9]\d*$/.test(sample)) return null
  let parent = node.parentNode,
    nav = null
  for (let depth = 0; parent && depth < 6; depth++, parent = parent.parentNode)
    if (parent.tagName === 'nav') {
      nav = parent
      break
    }
  if (!nav) return null
  const behavior = (item) =>
    item.tagName === 'form' ||
    (item.attrs ?? []).some(
      (attr) =>
        /^on|^data-(?:action|toggle|target|bs-toggle|bs-target|fancybox|payment|checkout)$|^aria-controls$|^aria-haspopup$/i.test(
          attr.name
        ) ||
        (attr.name === 'role' &&
          /^(?:button|tab|tablist|listbox|option|spinbutton|slider|menuitem)$/.test(attr.value))
    )
  for (let item = nav; item; item = item.parentNode) if (behavior(item)) return null
  const anchors = [],
    outside = []
  let unsafe = false
  const text = (item) =>
    item.nodeName === '#text' ? item.value : (item.childNodes ?? []).map(text).join(' ')
  function visit(item, inside = false) {
    if (['form', 'input', 'select', 'button', 'script'].includes(item.tagName) || behavior(item))
      unsafe = true
    if (item.tagName === 'a') {
      const attrs = Object.fromEntries((item.attrs ?? []).map((attr) => [attr.name, attr.value]))
      if (!attrs.href || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(attrs.href.trim())) unsafe = true
      anchors.push({ node: item, label: text(item).trim() })
      inside = true
    }
    if (item.nodeName === '#text' && !inside) outside.push(item.value)
    for (const child of item.childNodes ?? []) visit(child, inside)
  }
  visit(nav)
  if (unsafe || outside.join('').trim()) return null
  const numbers = anchors.filter((item) => /^\d+$/.test(item.label))
  if (
    numbers.length < 2 ||
    anchors.some((item) => !/^\d+$/.test(item.label) && !/^[«»‹›←→<>\s]+$/.test(item.label))
  )
    return null
  if (!numbers.every((item, index) => item.label === String(index + 1))) return null
  if (
    !numbers.some((item) => {
      for (let current = node.parentNode; current && current !== nav; current = current.parentNode)
        if (current === item.node) return true
      return false
    })
  )
    return null
  return { version: 'navigation-page-number/1', count: numbers.length, sample }
}
