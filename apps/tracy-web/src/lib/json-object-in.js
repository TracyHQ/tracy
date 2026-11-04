// The first JSON object in a model answer, shared by the brief engines and the benches.
/**
 * The first complete JSON object in a model's answer, however it is wrapped (a code fence, a sentence before it, a note
 * after it), or null. Not the text from the first brace to the last: that reads two objects, or an object and a remark with
 * braces in it, as one thing that is not JSON.
 * @param {unknown} answer
 * @returns {Record<string, unknown> | null}
 */
export function jsonObjectIn(answer) {
  const text = String(answer ?? '')
  for (let start = text.indexOf('{'); start >= 0; start = text.indexOf('{', start + 1)) {
    let depth = 0
    let inString = false
    let escaped = false
    for (let i = start; i < text.length; i += 1) {
      const ch = text[i]
      if (inString) {
        if (escaped) escaped = false
        else if (ch === '\\') escaped = true
        else if (ch === '"') inString = false
        continue
      }
      if (ch === '"') inString = true
      else if (ch === '{') depth += 1
      else if (ch === '}') {
        depth -= 1
        if (depth === 0) {
          try {
            const value = JSON.parse(text.slice(start, i + 1))
            if (value && typeof value === 'object' && !Array.isArray(value)) return value
          } catch {
            // not this one: the next brace may start the object
          }
          break
        }
      }
    }
  }
  return null
}
