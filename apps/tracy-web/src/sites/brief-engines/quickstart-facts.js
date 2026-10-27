/** Bind contact destinations from frozen business facts without changing internal navigation or markup. */
import { parseFragment } from 'parse5'

export function quickstartContactFacts(data, business) {
  const phone = typeof business.phone === 'string' ? business.phone.replace(/[^+\d]/g, '') : ''
  const email = typeof business.email === 'string' ? business.email.trim() : ''
  const website = /^https?:\/\//i.test(business.website ?? '') ? business.website : ''
  const fallback = website || (phone ? `tel:${phone}` : '')
  const destination = (value) =>
    /^tel:/i.test(value)
      ? phone
        ? `tel:${phone}`
        : fallback
      : /^mailto:/i.test(value)
        ? email
          ? `mailto:${email}`
          : fallback
        : ''
  function html(value) {
    const edits = []
    function visit(node) {
      const attrs = Object.fromEntries((node.attrs ?? []).map((a) => [a.name, a.value]))
      for (const attr of node.attrs ?? []) {
        let next = ['href', 'action'].includes(attr.name) ? destination(attr.value) : ''
        if (
          node.tagName === 'iframe' &&
          attr.name === 'src' &&
          business.address &&
          /(?:google\.[^/]+\/maps|maps\.google\.|yandex\.[^/]+\/map)/i.test(attr.value)
        )
          next = `https://maps.google.com/maps?q=${encodeURIComponent(business.address)}&output=embed`
        const location = node.sourceCodeLocation?.attrs?.[attr.name]
        if (next && next !== attr.value && location)
          edits.push({
            start: location.startOffset,
            end: location.endOffset,
            text: `${attr.name}="${next.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}"`
          })
      }
      if (node.tagName === 'a' && /^mailto:/i.test(attrs.href ?? '') && !email && fallback)
        for (const child of node.childNodes ?? [])
          if (
            child.nodeName === '#text' &&
            /^(?:\s*email(?: us)?\s*|\s*[^\s@]+@[^\s@]+\s*)$/i.test(child.value)
          ) {
            const where = child.sourceCodeLocation
            if (where)
              edits.push({ start: where.startOffset, end: where.endOffset, text: website || business.phone })
          }
      for (const child of node.childNodes ?? []) visit(child)
    }
    visit(parseFragment(value, { sourceCodeLocationInfo: true }))
    for (const edit of edits.sort((a, b) => b.start - a.start))
      value = value.slice(0, edit.start) + edit.text + value.slice(edit.end)
    return value
  }
  function walk(value, key = null) {
    if (key === 'email_to' && typeof value === 'string') return email
    if (key === 'webpage' && typeof value === 'string' && website) return website
    if (typeof value === 'string') return /<[a-z!/]/i.test(value) ? html(value) : destination(value) || value
    if (Array.isArray(value)) return value.map((child) => walk(child))
    if (value && typeof value === 'object')
      return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, walk(child, key)]))
    return value
  }
  return walk(data)
}
