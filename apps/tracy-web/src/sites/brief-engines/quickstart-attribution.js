/** Recognize a complete software licensing sentence, never surrounding business copy. */
export function softwareAttribution(node) {
  if (node?.tagName !== 'p') return false
  const children = (node.childNodes ?? []).filter((child) => child.nodeName !== '#text' || child.value.trim())
  const [software, sentence, license, punctuation] = children
  return (
    children.length >= 3 &&
    children.length <= 4 &&
    software?.tagName === 'a' &&
    license?.tagName === 'a' &&
    sentence?.nodeName === '#text' &&
    /^\s+is (?:free|open[- ]source) software released under (?:the\s+)?$/i.test(
      sentence.value.replace(/\s+/g, ' ')
    ) &&
    (license.childNodes ?? []).every((child) => child.nodeName === '#text') &&
    /(?:licen[cs]e|general public|GPL)/i.test(
      (license.childNodes ?? []).map((child) => child.value).join('')
    ) &&
    (!punctuation || (punctuation.nodeName === '#text' && /^[\s.!]*$/.test(punctuation.value)))
  )
}

/** Explicit attribution anchors retain their text as well as their destination. */
export function explicitAttribution(node) {
  const attrs = Object.fromEntries((node?.attrs ?? []).map((attr) => [attr.name, attr.value]))
  return attrs['data-tracy-role'] === 'attribution' || (attrs.rel ?? '').split(/\s+/).includes('license')
}
