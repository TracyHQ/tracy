// Add action metadata without reformatting the released map's arrays, samples or other declarations.
function objectEnd(text, start) {
  let depth = 0
  let quoted = false
  let escaped = false
  for (let at = start; at < text.length; at += 1) {
    const char = text[at]
    if (quoted) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') quoted = false
    } else if (char === '"') quoted = true
    else if (char === '{') depth += 1
    else if (char === '}' && --depth === 0) return at + 1
  }
  throw new Error('content map has an unterminated slot')
}

/** Only additive action/button metadata; refuses to overwrite an already declared action. */
export function withActionMetadata(text, contentMap) {
  const start = /"slots"\s*:\s*\[/.exec(text)
  if (!start) return text
  const slots = new Map((contentMap.slots ?? []).map((slot) => [slot.key, slot]))
  let at = start.index + start[0].length
  let out = text.slice(0, at)
  while (at < text.length) {
    const next = text.slice(at).search(/[^\s,]/)
    if (next < 0 || text[at + next] === ']') return out + text.slice(at)
    out += text.slice(at, at + next)
    at += next
    if (text[at] !== '{') throw new Error('content map slot must be an object')
    const end = objectEnd(text, at)
    const original = text.slice(at, end)
    const before = JSON.parse(original)
    const after = slots.get(before.key)
    let added = original
    const fields = ['action', 'button'].filter(
      (key) => after?.[key] !== undefined && JSON.stringify(after[key]) !== JSON.stringify(before[key])
    )
    if (fields.length) {
      if (fields.some((key) => before[key] !== undefined))
        throw new Error(`slot ${before.key} already declares changed action metadata; review it explicitly`)
      const indent = text.slice(text.lastIndexOf('\n', at) + 1, at).match(/^\s*/)?.[0] ?? ''
      const props = fields.map(
        (key) =>
          `${indent}  "${key}": ${JSON.stringify(after[key], null, 2).replaceAll('\n', `\n${indent}  `)}`
      )
      added = `${original.slice(0, -1).trimEnd()},\n${props.join(',\n')}\n${indent}}`
    }
    out += added
    at = end
  }
  return out
}
