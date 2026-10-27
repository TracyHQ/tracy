// joomla-php-scan.mjs — what a T3 template PHP file can be read as (issue #67): which text is executed
// and which of it runs only under a condition. Nothing is evaluated. A file is scanned once, and the
// layout reader looks for its literal forms (`loadBlock('x')`, `<jdoc:include …>`) only in the result:
//  - `text`: the file with every comment (PHP `//`, `#`, `/* */`, HTML `<!-- -->`) blanked to spaces, so
//    a form that is only written in a comment is not there and offsets are unchanged;
//  - `conditional(i)`: whether offset `i` lies in a control structure (`if`/`else`/`elseif`/`foreach`/`for`/
//    `while`/`switch`, brace or `endif:` syntax, or a one-statement body): the form is written there, but
//    whether it runs is not known;
//  - `conditions(i)`: the head of each control structure around offset `i`, outermost first (`($this->countModules('hero'))`;
//    `else` and `elseif` are named as such), so a caller can tell a guard it understands from one it does not;
//  - `inString(i)`: offset `i` lies inside a PHP string literal. Text in a string is not executed as PHP: a
//    `$this->loadBlock('x')` there is not a load (an `<jdoc:include>` there may still be printed);
//  - `shortCircuited(i)`: the PHP statement holding offset `i` has a ternary or a short-circuit operator
//    before it (`$a && $this->loadBlock('x')`);
//  - `unscanned`: the file holds a heredoc/nowdoc, which this scanner does not follow: everything from it on is
//    conditional.
// The scanner is a single pass with one bounded stack; the input is bounded by the caller.

const CONTROL = new Set(['if', 'elseif', 'foreach', 'for', 'while', 'switch'])
const END = new Set(['endif', 'endforeach', 'endfor', 'endwhile', 'endswitch'])
const IDENT = /[A-Za-z_][A-Za-z0-9_]*/y

export function scanPhp(source) {
  const src = String(source ?? '')
  const n = src.length
  const text = src.split('')
  const mask = new Uint8Array(n)
  const strMask = new Uint8Array(n)
  const phpMask = new Uint8Array(n)
  const chainAt = new Uint32Array(n)
  const chains = [[], ['<unscanned>']] // 0: no condition; 1: after a heredoc
  let chain = 0
  let unscanned = false
  const stack = [] // 'c' brace body of a control structure, 'a' alternative syntax (`:` … endX), 'p' any other `{`
  const heads = [] // the head text of each stack entry (null for 'p')
  let pendingBrace = false // the next `{` opens the body of a control structure
  let pendingHead = null
  let oneShot = null // a control structure with a one-statement body: its head; conditional up to the next `;`
  let elseCarry = false // `else` was followed by `if`: the `if` is an `else if`
  let php = false
  let i = 0
  const blank = (from, to) => {
    for (let k = from; k < to; k++) if (text[k] !== '\n' && text[k] !== '\r') text[k] = ' '
  }
  const inCond = () => oneShot !== null || stack.some((s) => s !== 'p')
  const refresh = () => {
    const c = heads.filter((h) => h !== null)
    if (oneShot !== null) c.push(oneShot)
    chains.push(c)
    chain = chains.length - 1
  }
  const push = (kind, head) => {
    stack.push(kind)
    heads.push(head)
    refresh()
  }
  const pop = () => {
    stack.pop()
    heads.pop()
    refresh()
  }
  const setOne = (v) => {
    if (oneShot === v) return
    oneShot = v
    refresh()
  }
  const mark = (from, to) => {
    if (!inCond()) return
    mask.fill(1, from, to)
    chainAt.fill(chain, from, to)
  }
  const skipSpace = (at) => {
    let k = at
    while (k < n && /\s/.test(src[k])) k++
    return k
  }
  /** Index just past the string opened at `at` (a quote), honouring backslash escapes. */
  const skipString = (at) => {
    const q = src[at]
    let k = at + 1
    while (k < n && src[k] !== q) k += src[k] === '\\' ? 2 : 1
    return Math.min(k + 1, n)
  }
  /** Index just past the balanced `( … )` opened at `at`. */
  const skipParens = (at) => {
    let depth = 0
    let k = at
    while (k < n) {
      const c = src[k]
      if (c === '"' || c === "'") k = skipString(k)
      else {
        if (c === '(') depth++
        else if (c === ')' && --depth === 0) return k + 1
        k++
      }
    }
    return n
  }
  while (i < n) {
    if (!php) {
      if (src.startsWith('<!--', i)) {
        const end = src.indexOf('-->', i + 4)
        const to = end === -1 ? n : end + 3
        blank(i, to)
        i = to
        continue
      }
      if (src.startsWith('<?', i)) {
        php = true
        i += src.startsWith('<?php', i) ? 5 : src.startsWith('<?=', i) ? 3 : 2
        continue
      }
      mark(i, i + 1)
      i++
      continue
    }
    if (unscanned) {
      mask[i] = 1
      phpMask[i] = 1
      chainAt[i++] = 1
      continue
    }
    const c = src[i]
    phpMask[i] = 1
    if (src.startsWith('?>', i)) {
      php = false
      setOne(null)
      i += 2
      continue
    }
    mark(i, i + 1)
    if (c === '"' || c === "'") {
      const to = skipString(i)
      mark(i, to)
      strMask.fill(1, i, to)
      i = to
      continue
    }
    if (c === '#' || src.startsWith('//', i)) {
      let to = i
      while (to < n && src[to] !== '\n' && !src.startsWith('?>', to)) to++
      blank(i, to)
      i = to
      continue
    }
    if (src.startsWith('/*', i)) {
      const end = src.indexOf('*/', i + 2)
      const to = end === -1 ? n : end + 2
      blank(i, to)
      i = to
      continue
    }
    if (src.startsWith('<<<', i)) {
      unscanned = true
      continue
    }
    if (c === '{') {
      push(pendingBrace ? 'c' : 'p', pendingBrace ? pendingHead : null)
      pendingBrace = false
      i++
      continue
    }
    if (c === '}') {
      pop()
      i++
      continue
    }
    if (c === ';') {
      setOne(null)
      i++
      continue
    }
    IDENT.lastIndex = i
    const m = /[A-Za-z_]/.test(c) && !/[$>:\w]/.test(src[i - 1] ?? '') ? IDENT.exec(src) : null
    if (!m) {
      i++
      continue
    }
    const word = m[0].toLowerCase()
    let next = i + m[0].length
    if (CONTROL.has(word) || word === 'else') {
      let head = word
      if (word !== 'else') {
        const at = skipSpace(next)
        if (src[at] === '(') {
          next = skipParens(at)
          head = src.slice(at, next).replace(/\s+/g, ' ')
        }
      }
      if (word === 'elseif') head = `elseif ${head === word ? '' : head}`.trim()
      else if (elseCarry && word !== 'else') head = `else ${head}`
      const at = skipSpace(next)
      if (word === 'else' && /^if(?![A-Za-z0-9_])/i.test(src.slice(at, at + 3))) {
        // `else if (…)`: the `if` is read as the next word
        elseCarry = true
      } else if (src[at] === ':') {
        // alternative syntax: `else:` / `elseif (…):` continue the block `if (…):` opened; the first opener pushes.
        // The branch after an `else` is not the branch the head names: the head becomes the word.
        if (word !== 'else' && word !== 'elseif') push('a', head)
        else if (stack.length) {
          heads[stack.length - 1] = head
          refresh()
        }
        elseCarry = false
        next = at + 1
      } else if (src[at] === '{') {
        pendingBrace = true
        pendingHead = head
        elseCarry = false
      } else {
        setOne(head)
        elseCarry = false
      }
      i = next
      continue
    }
    if (END.has(word)) pop()
    i = next
  }
  // a statement with a ternary or a short-circuit operator before the form is conditional as well
  const shortCircuit = (idx) => {
    let k = idx
    while (k > 0 && !';{}'.includes(text[k - 1]) && !(text[k - 1] === '>' && text[k - 2] === '?') && !/<\?(?:php|=)?$/.test(text.slice(Math.max(0, k - 5), k).join(''))) k--
    return /\?|&&|\|\||\b(?:and|or)\b/.test(text.slice(k, idx).join(''))
  }
  return { text: text.join(''), unscanned, inPhp: (idx) => phpMask[idx] === 1, conditional: (idx) => mask[idx] === 1, conditions: (idx) => chains[chainAt[idx]], inString: (idx) => strMask[idx] === 1, shortCircuited: shortCircuit }
}

/** Read the deliberately small ACM counter idiom without executing PHP. */
export function computedAcmItemField(source, items, fields = {}) {
  const scanned = scanPhp(source)
  const text = scanned.text
  const unresolved = (field, reason) => ({ field, unresolved: reason })
  if (scanned.unscanned) return null
  const loop = /for\s*\(\s*\$(\w+)\s*=\s*([^;]+);\s*\$\1\s*<\s*([^;]+);\s*([^)]*)\)\s*(\{|:)/g.exec(text)
  if (!loop || !scanned.inPhp(loop.index) || scanned.inString(loop.index)) return null
  const variable = loop[1]
  const assignments = [...text.matchAll(new RegExp(`\\$(\\w+)\\s*=\\s*([^;]+);`, 'g'))]
    .filter((entry) => scanned.inPhp(entry.index) && !scanned.inString(entry.index))
  const writesOf = (name) => [...text.matchAll(new RegExp(`\\$${name}\\s*(?:\\+\\+|--|(?:[+\\-*/.%]?=(?!=)))`, 'g'))]
    .filter((entry) => scanned.inPhp(entry.index) && !scanned.inString(entry.index))
  const echoes = [...text.matchAll(/echo\s+([^;]*?)(?:;|(?=\?>))/g)]
    .filter((entry) => scanned.inPhp(entry.index) && !scanned.inString(entry.index))
  let body
  let bodyStart
  let bodyEnd
  if (loop[5] === ':') {
    bodyStart = loop.index + loop[0].length
    bodyEnd = text.indexOf('endfor', bodyStart)
    if (bodyEnd < 0 || !scanned.inPhp(bodyEnd)) return null
    body = text.slice(bodyStart, bodyEnd)
  } else {
    const open = text.indexOf('{', loop.index)
    bodyStart = open + 1
    let depth = 1
    bodyEnd = bodyStart
    for (; bodyEnd < text.length && depth; bodyEnd++) {
      if (text[bodyEnd] === '{') depth++
      else if (text[bodyEnd] === '}') depth--
    }
    if (depth) return null
    body = text.slice(bodyStart, bodyEnd - 1)
    bodyEnd--
  }
  const candidates = assignments.flatMap((entry) => {
    const rhs = entry[2].trim()
    if (/^\$helper\s*->\s*get\s*\(/.test(rhs)) return []
    if (!rhs.includes(`$${variable}`) && !/\b(?:sprintf|str_pad)\s*\(/.test(rhs)) return []
    const echo = echoes.find((candidate) => candidate.index >= bodyStart && candidate.index < bodyEnd && new RegExp(`\\$${entry[1]}\\b`).test(candidate[1]))
    return echo ? [{ entry, echo }] : []
  })
  if (!candidates.length) return null
  const { entry: assign, echo } = candidates[0]
  const field = assign[1]
  const fieldAssignments = assignments.filter((entry) => entry[1] === field)
  const fieldWrites = writesOf(field)
  if (fieldAssignments.length !== 1 || fieldWrites.length !== 1 || fieldWrites[0].index !== fieldAssignments[0].index)
    return unresolved(field, 'printed counter variable is assigned more than once in the layout')
  if (assign.index < bodyStart || assign.index >= bodyEnd)
    return unresolved(field, 'printed counter variable is assigned outside the item loop')
  if (!/^0$/.test(loop[2].trim()) || loop[4].trim() !== `$${variable}++`)
    return unresolved(field, 'item loop start or increment is unsupported')

  const expression = assign[2].trim()
  const ordinal = new RegExp(`^\\$${variable}\\s*\\+\\s*1$`).test(expression)
  const sprintf = new RegExp(`^sprintf\\s*\\(\\s*(['"])%0([1-9])d\\1\\s*,\\s*\\$${variable}\\s*\\+\\s*1\\s*\\)$`).exec(expression)
  const pad = new RegExp(`^str_pad\\s*\\(\\s*\\$${variable}\\s*\\+\\s*1\\s*,\\s*([1-9])\\s*,\\s*(['"])0\\2\\s*,\\s*STR_PAD_LEFT\\s*\\)$`).exec(expression)
  const width = sprintf ? Number(sprintf[2]) : pad ? Number(pad[1]) : null
  if (!ordinal && width === null) return unresolved(field, `unsupported computed expression: ${expression}`)

  const bound = /^\$(\w+)$/.exec(loop[3].trim())?.[1]
  const boundAssignments = bound ? assignments.filter((entry) => entry[1] === bound) : []
  const boundWrites = bound ? writesOf(bound) : []
  const countAssignment = boundAssignments[0]
  const countCall = /^\$helper\s*->\s*count\s*\(\s*(['"])([^'"]+)\1\s*\)$/.exec(countAssignment?.[2].trim() ?? '')
  if (!bound || boundAssignments.length !== 1 || boundWrites.length !== 1 || boundWrites[0].index !== countAssignment.index || countAssignment.index >= loop.index)
    return unresolved(field, `item loop bound ${loop[3].trim()} is assigned more than once or is not assigned exactly once before the loop`)
  if (!countCall || !items.length || !items.every((item) => typeof item[countCall[2]] === 'string' && item[countCall[2]] !== ''))
    return unresolved(field, `item loop bound ${loop[3].trim()} cannot be proven equal to the normalized item count`)

  const branch = scanned.conditions(echo.index).filter((head) => !new RegExp(`^\\(?\\s*\\$${variable}\\s*=`).test(head))
  if (branch.length > 1 || branch.some((head) => /^elseif\b/.test(head)))
    return unresolved(field, 'print branch has nested or multiple guards the scanner cannot evaluate exactly')
  let visible = true
  if (branch.length === 1) {
    const ifs = [...body.matchAll(/\bif\s*\(/g)]
      .filter((entry) => scanned.inPhp(bodyStart + entry.index) && !scanned.inString(bodyStart + entry.index))
      .map((entry) => {
        const open = bodyStart + entry.index + entry[0].lastIndexOf('(')
        let depth = 1
        let close = open + 1
        for (; close < bodyEnd && depth; close++) {
          if (scanned.inString(close)) continue
          if (text[close] === '(') depth++
          else if (text[close] === ')') depth--
        }
        return { start: bodyStart + entry.index, end: close, expression: text.slice(open + 1, close - 1).trim() }
      })
    let guardSource
    if (branch[0] === 'else') {
      const elseTokens = [...body.matchAll(/\belse\s*(?::|\{)/g)]
        .filter((entry) => scanned.inPhp(bodyStart + entry.index) && bodyStart + entry.index < echo.index)
      const elseAt = elseTokens.at(-1)
      const parent = elseAt && ifs.filter((entry) => entry.end < bodyStart + elseAt.index).at(-1)
      guardSource = parent?.expression
    } else {
      guardSource = ifs.find((entry) => {
        const expected = `(${entry.expression})`.replace(/\s+/g, ' ')
        return expected === branch[0].replace(/\s+/g, ' ')
      })?.expression
    }
    const guard = /^\$helper\s*->\s*get\s*\(\s*(['"])([^'"]+)\1\s*\)\s*(===|!==|==|!=)\s*(\d+|true|false|null)$/.exec(guardSource ?? '')
    if (!guard) return unresolved(field, 'print guard is unsupported or does not directly enclose the echo')
    const actual = fields[guard[2]]
    const literal = guard[4] === 'true' ? true : guard[4] === 'false' ? false : guard[4] === 'null' ? null : Number(guard[4])
    if (actual === undefined || actual === null || !['string', 'number', 'boolean'].includes(typeof actual))
      return unresolved(field, `condition helper->get('${guard[2]}') has no scalar instance value`)
    const strict = guard[3].length === 3
    let equal
    if (strict) equal = actual === literal
    else if (typeof actual === 'boolean' || typeof literal === 'boolean') {
      const phpBoolean = (value) => !(value === false || value === null || value === 0 || value === '' || value === '0')
      equal = phpBoolean(actual) === phpBoolean(literal)
    } else if (typeof actual === 'number' && typeof literal === 'number') equal = actual === literal
    else if (typeof actual === 'string' && typeof literal === 'number') {
      const numeric = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(actual.trim())
      equal = numeric ? Number(actual) === literal : actual === String(literal)
    } else if (typeof actual === 'string' && typeof literal === 'string') equal = actual === literal
    else return unresolved(field, 'print guard comparison cannot be evaluated exactly')
    visible = guard[3].startsWith('!') ? !equal : equal
    if (branch[0] === 'else') visible = !visible
  } else if (echo[1].includes('?') || /&&|\|\||\band\b|\bor\b/.test(echo[1])) {
    return unresolved(field, 'unconditional print uses a ternary or short-circuit expression')
  }
  return { field, values: items.map((_, i) => visible ? String(i + 1).padStart(width ?? 0, '0') : '') }
}
