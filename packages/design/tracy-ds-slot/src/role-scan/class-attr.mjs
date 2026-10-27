/**
 * What one element's class attribute holds, read statically: the classes it always has, the classes it
 * has only under a condition, and whether some part comes from somewhere the file does not show (a
 * prop, a lookup table, PHP). PURE. `class="…"`, `className="…"`, `class={…}`, `className={cn(…)}`,
 * `class:list={[…]}` and template literals are read; spread props (`{...attrs}`) are assumed to carry
 * no class (they carry data attributes in every template measured; a class from a spread is missed).
 */

const CALL = /^(cn|clsx|cx|twMerge|twJoin|classNames|classnames)\s*\(/

/**
 * @param {string} attrs the attribute text of an open tag
 * @returns {{ always: string[], sometimes: string[], unknown: boolean, present: boolean }}
 */
export function classAttr(attrs) {
  const out = { always: [], sometimes: [], unknown: false, present: false }
  const re = /(?:^|[\s{])(class|className|class:list)\s*=\s*/g
  for (let m = re.exec(attrs); m; m = re.exec(attrs)) {
    out.present = true
    let i = m.index + m[0].length
    const q = attrs[i]
    if (q === '"' || q === "'") {
      const e = attrs.indexOf(q, i + 1)
      const value = attrs.slice(i + 1, e === -1 ? attrs.length : e)
      if (/<\?|\{\{|\$\{/.test(value)) out.unknown = true
      out.always.push(...split(value.replace(/<\?[\s\S]*?\?>|\{\{[\s\S]*?\}\}/g, ' ')))
      re.lastIndex = e === -1 ? attrs.length : e + 1
      continue
    }
    if (q !== '{') {
      out.unknown = true
      continue
    }
    const end = balanced(attrs, i)
    expression(attrs.slice(i + 1, end - 1).trim(), out, true)
    re.lastIndex = end
  }
  return out
}

/** One class expression into `out`; `always` false once inside a condition. */
function expression(src, out, always) {
  const s = src.trim()
  if (!s) return
  const lit = literalOf(s)
  if (lit !== null) {
    ;(always ? out.always : out.sometimes).push(...split(lit))
    return
  }
  const call = CALL.exec(s)
  if (call && s.endsWith(')')) {
    for (const part of parts(s.slice(call[0].length, -1))) expression(part, out, always)
    return
  }
  if (s.startsWith('[') && s.endsWith(']')) {
    for (const part of parts(s.slice(1, -1))) expression(part, out, always)
    return
  }
  if (s.startsWith('{') && s.endsWith('}')) {
    // { 'bg-ink': dark } — every key is conditional
    for (const part of parts(s.slice(1, -1))) {
      const key = /^(["'`])(.*?)\1\s*:/.exec(part.trim())
      if (key) out.sometimes.push(...split(key[2]))
      else out.unknown = true
    }
    return
  }
  // `cond && "x"`, `cond ? "a" : "b"`: the strings are conditional; the condition itself paints nothing
  const cond = /^([\s\S]+?)(&&|\?)([\s\S]+)$/.exec(s)
  if (cond && !/\?\?/.test(s)) {
    const branches = cond[2] === '?' ? splitTernary(cond[3]) : [cond[3]]
    for (const b of branches) {
      const l = literalOf(b.trim())
      if (l === null) out.unknown = true
      else out.sometimes.push(...split(l))
    }
    return
  }
  out.unknown = true
  for (const m of s.matchAll(/(["'`])((?:(?!\1)[^\\]|\\.)*)\1/g)) out.sometimes.push(...split(m[2]))
}

/** A plain string literal's text, or null (a template literal with `${}` is not plain). */
function literalOf(s) {
  const m = /^(["'`])((?:(?!\1)[^\\]|\\.)*)\1$/.exec(s)
  if (!m) return null
  if (m[1] === '`' && m[2].includes('${')) return null
  return m[2]
}

/** `"a" : "b"` → the two branches, at the top level. */
function splitTernary(s) {
  const top = topLevel(s, ':')
  return top === -1 ? [s] : [s.slice(0, top), s.slice(top + 1)]
}

/** Comma-separated parts at the top level. */
function parts(s) {
  const out = []
  let rest = s
  for (let at = topLevel(rest, ','); at !== -1; at = topLevel(rest, ',')) {
    out.push(rest.slice(0, at))
    rest = rest.slice(at + 1)
  }
  if (rest.trim()) out.push(rest)
  return out
}

/** Offset of the first `ch` outside brackets and quotes, or -1. */
function topLevel(s, ch) {
  let d = 0
  let quote = ''
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (quote) {
      if (c === '\\') i++
      else if (c === quote) quote = ''
      continue
    }
    if (c === '"' || c === "'" || c === '`') quote = c
    else if ('([{'.includes(c)) d++
    else if (')]}'.includes(c)) d--
    else if (c === ch && d === 0) return i
  }
  return -1
}

/** Offset after the bracket that closes the one at `at`. */
function balanced(s, at) {
  let d = 0
  let quote = ''
  for (let i = at; i < s.length; i++) {
    const c = s[i]
    if (quote) {
      if (c === '\\') i++
      else if (c === quote) quote = ''
      continue
    }
    if (c === '"' || c === "'" || c === '`') quote = c
    else if ('([{'.includes(c)) d++
    else if (')]}'.includes(c) && --d === 0) return i + 1
  }
  return s.length
}

const split = (s) => s.split(/\s+/).filter(Boolean)
