/**
 * Portable Text ⇄ Markdown, both directions, for the emdash adapter.
 *
 * emdash keeps a post's body in `ec_posts.content` as **Portable Text**: an array of blocks, each
 * with `children` spans carrying `marks`, and `markDefs` holding the targets those marks point at.
 * Measured 02/09 on `tchemdash1` — the column is `json`, not HTML and not Markdown.
 *
 * ## Why a projection at all, and what it must never do
 *
 * The agent edits Markdown; the site reads `data.db`. Between the two sits this file, and its one
 * unforgivable failure is a QUIET loss: an edit that applies cleanly while silently dropping a
 * link, an embedded image, or a block type Markdown has no syntax for. The site would keep serving,
 * nothing would error, and the missing paragraph would be found weeks later by a reader.
 *
 * Two rules make that impossible rather than unlikely:
 *
 * 1. **Anything Markdown cannot express is written out verbatim**, as a fenced `portable-text`
 *    block holding the block's own JSON. Nothing is dropped for being unusual; it just stops
 *    looking like prose, which is honest — it is not prose.
 * 2. **The projection is checked, not trusted.** `roundTrips()` re-renders what a parse produced
 *    and compares it to the Markdown it came from. The writer refuses to touch the database when
 *    that check fails, so a construct this file gets wrong costs a refusal, never an edit.
 *
 * ## Keys
 *
 * Every block and span carries a `_key` emdash uses for revisions and collaborative edits.
 * Markdown has nowhere to put one, so keys are taken from the PREVIOUS version of the same
 * document, by position, and only minted where the author added something new. Reminting them all
 * would rewrite every key on every apply — a diff the size of the document for a one-word edit.
 */

/** Block-level shapes this file can render as Markdown. Anything else goes out verbatim. */
const KNOWN_STYLES = new Set(['normal', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote'])

/** Marks with a Markdown spelling. `underline` deliberately absent — Markdown has no underline. */
const MARK_SYNTAX = {
  code: '`',
  strong: '**',
  em: '_',
  'strike-through': '~~'
}

/** Fixed nesting order, so the same marks always produce the same bytes and the round-trip holds. */
const MARK_ORDER = ['strike-through', 'em', 'strong', 'code']

const FENCE = '```portable-text'

/** Keys a block may carry and still be renderable; an unexpected one means we do not understand it. */
const BLOCK_KEYS = new Set(['_type', '_key', 'style', 'children', 'markDefs', 'listItem', 'level'])
const SPAN_KEYS = new Set(['_type', '_key', 'text', 'marks'])

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Can this block be written as Markdown without losing anything?
 *
 * Deliberately strict, and it fails CLOSED: a block with a property we have never seen is not
 * rendered as prose on the assumption the property does not matter. It might be the one that does.
 */
function isRenderable(block) {
  if (!isPlainObject(block) || block._type !== 'block') return false
  if (Object.keys(block).some((k) => !BLOCK_KEYS.has(k))) return false
  if (block.style !== undefined && !KNOWN_STYLES.has(block.style)) return false
  if (block.listItem !== undefined && block.listItem !== 'bullet' && block.listItem !== 'number') return false
  if (block.level !== undefined && !(Number.isInteger(block.level) && block.level >= 1)) return false

  const defs = block.markDefs ?? []
  if (!Array.isArray(defs)) return false
  // Only `link` is understood. A footnote or an annotation would render as bare text and lose its
  // target — the exact quiet loss this function exists to prevent.
  if (defs.some((d) => !isPlainObject(d) || d._type !== 'link' || typeof d.href !== 'string')) return false
  const defKeys = new Set(defs.map((d) => d._key))

  const children = block.children ?? []
  if (!Array.isArray(children) || children.length === 0) return false
  return children.every((child) => {
    if (!isPlainObject(child) || child._type !== 'span') return false
    if (Object.keys(child).some((k) => !SPAN_KEYS.has(k))) return false
    if (typeof child.text !== 'string') return false
    const marks = child.marks ?? []
    if (!Array.isArray(marks)) return false
    // A mark is either a decorator we can spell, or a reference to a `link` markDef. One link per
    // span: two overlapping links have no Markdown spelling at all.
    const links = marks.filter((m) => defKeys.has(m))
    if (links.length > 1) return false
    return marks.every((m) => m in MARK_SYNTAX || defKeys.has(m))
  })
}

/**
 * Escape the characters that would otherwise be read back as syntax.
 *
 * Only what the parser in this file can actually misread, and only where it could: escaping more
 * makes the Markdown ugly for the person editing it, which is the whole audience.
 */
function escapeText(text) {
  return text.replace(/([\\`*_~[\]])/g, '\\$1')
}

function unescapeText(text) {
  return text.replace(/\\([\\`*_~[\]])/g, '$1')
}

/** A line that would be parsed as something other than a paragraph if left alone. */
function escapeLeading(line) {
  return line.replace(/^(\s*)(#{1,6} |> |[-*] |\d+\. |```)/, (_m, indent, token) => `${indent}\\${token}`)
}

function unescapeLeading(line) {
  return line.replace(/^(\s*)\\(#{1,6} |> |[-*] |\d+\. |```)/, '$1$2')
}

function renderSpan(span, defsByKey) {
  const marks = span.marks ?? []
  const linkKey = marks.find((m) => defsByKey.has(m))
  let out = escapeText(span.text)
  for (const mark of MARK_ORDER) {
    if (marks.includes(mark)) {
      const token = MARK_SYNTAX[mark]
      out = `${token}${out}${token}`
    }
  }
  if (linkKey) out = `[${out}](${defsByKey.get(linkKey).href})`
  return out
}

function renderBlock(block) {
  const defsByKey = new Map((block.markDefs ?? []).map((d) => [d._key, d]))
  const text = block.children.map((c) => renderSpan(c, defsByKey)).join('')
  const style = block.style ?? 'normal'

  if (block.listItem) {
    const indent = '  '.repeat((block.level ?? 1) - 1)
    return `${indent}${block.listItem === 'bullet' ? '-' : '1.'} ${text}`
  }
  if (style === 'blockquote') return `> ${text}`
  if (style !== 'normal') return `${'#'.repeat(Number(style.slice(1)))} ${text}`
  return escapeLeading(text)
}

/**
 * Portable Text → Markdown.
 * @param {unknown} blocks the `content` column, already parsed from JSON.
 * @returns {string} Markdown, blocks separated by a blank line, no trailing newline.
 */
export function toMarkdown(blocks) {
  if (!Array.isArray(blocks)) return ''
  return blocks
    .map((block) =>
      isRenderable(block) ? renderBlock(block) : `${FENCE}\n${JSON.stringify(block, null, 1)}\n\`\`\``
    )
    .join('\n\n')
}

/** Split Markdown into block sources: fenced verbatim blocks stay whole, the rest splits on blank lines. */
function splitBlocks(markdown) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const out = []
  let buffer = []
  const flush = () => {
    while (buffer.length > 0 && buffer.at(-1).trim() === '') buffer.pop()
    if (buffer.length > 0) out.push({ verbatim: false, lines: [...buffer] })
    buffer = []
  }
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trimEnd() === FENCE) {
      flush()
      const body = []
      i++
      while (i < lines.length && lines[i].trimEnd() !== '```') body.push(lines[i++])
      out.push({ verbatim: true, lines: body })
      continue
    }
    if (lines[i].trim() === '') {
      flush()
      continue
    }
    buffer.push(lines[i])
  }
  flush()
  return out
}

/** Inline Markdown → spans. `defs` is filled with the link markDefs discovered along the way. */
function parseInline(source, defs, keyFor) {
  const spans = []
  let text = ''
  let marks = []
  // `marks` is omitted when empty rather than written as `[]`: that is how emdash stores an
  // unmarked span, and inventing the key would make every untouched post compare as edited.
  const span = (value, applied) => {
    const built = { _type: 'span', _key: keyFor(spans.length), text: value }
    if (applied.length > 0) built.marks = [...applied]
    return built
  }
  const push = () => {
    if (text === '') return
    spans.push(span(unescapeText(text), marks))
    text = ''
  }

  for (let i = 0; i < source.length; ) {
    if (source[i] === '\\' && i + 1 < source.length) {
      text += source.slice(i, i + 2)
      i += 2
      continue
    }
    // A link wraps everything else, so it is matched first and its label parsed on its own.
    const link = /^\[((?:\\.|[^\]\\])*)\]\(([^)\s]*)\)/.exec(source.slice(i))
    if (link) {
      push()
      const key = keyFor(`link${defs.length}`)
      defs.push({ _type: 'link', _key: key, href: link[2] })
      const inner = parseInline(link[1], [], () => keyFor(spans.length))
      for (const labelSpan of inner) spans.push({ ...labelSpan, marks: [...(labelSpan.marks ?? []), key] })
      i += link[0].length
      continue
    }
    let matched = false
    for (const mark of ['code', 'strong', 'strike-through', 'em']) {
      const token = MARK_SYNTAX[mark]
      if (!source.startsWith(token, i)) continue
      const close = source.indexOf(token, i + token.length)
      if (close === -1) continue
      push()
      const inner = source.slice(i + token.length, close)
      marks = [...marks, mark]
      // `code` is literal in Markdown: nothing inside it is syntax, so it is not parsed further.
      if (mark === 'code') {
        spans.push(span(inner, marks))
      } else {
        for (const inherited of parseInline(inner, defs, () => keyFor(spans.length))) {
          const applied = [...marks, ...(inherited.marks ?? []).filter((m) => m !== mark)]
          spans.push(applied.length > 0 ? { ...inherited, marks: applied } : inherited)
        }
      }
      marks = marks.slice(0, -1)
      i = close + token.length
      matched = true
      break
    }
    if (matched) continue
    text += source[i]
    i++
  }
  push()
  return spans.length > 0 ? spans : [{ _type: 'span', _key: keyFor(0), text: '' }]
}

/**
 * Markdown → Portable Text.
 *
 * @param {string} markdown the file body.
 * @param {unknown} previous the blocks currently stored, used only to keep `_key`s stable.
 * @returns {Array<object>} blocks ready to store.
 */
export function fromMarkdown(markdown, previous = []) {
  const old = Array.isArray(previous) ? previous : []
  return splitBlocks(markdown).map((chunk, index) => {
    if (chunk.verbatim) {
      try {
        return JSON.parse(chunk.lines.join('\n'))
      } catch {
        // A hand-broken fenced block is not silently dropped: it becomes a paragraph holding what
        // the file actually says, and the round-trip check then refuses the apply.
        return { _type: 'block', style: 'normal', _key: `b${index}`, children: [] }
      }
    }
    const previousBlock = old[index]
    const blockKey = previousBlock?._key ?? `b${index}`
    const keyFor = (suffix) => {
      const child = typeof suffix === 'number' ? previousBlock?.children?.[suffix] : undefined
      return child?._key ?? `${blockKey}-${suffix}`
    }

    const raw = chunk.lines.join('\n')
    const defs = []
    const listMatch = /^(\s*)(?:([-*])|(\d+)\.)\s+([\s\S]*)$/.exec(raw)
    const headingMatch = /^(#{1,6})\s+([\s\S]*)$/.exec(raw)
    const quoteMatch = /^>\s+([\s\S]*)$/.exec(raw)

    let style = 'normal'
    let body = raw
    const block = { _type: 'block', _key: blockKey }
    if (listMatch) {
      block.listItem = listMatch[2] ? 'bullet' : 'number'
      block.level = Math.floor(listMatch[1].length / 2) + 1
      body = listMatch[4]
    } else if (headingMatch) {
      style = `h${headingMatch[1].length}`
      body = headingMatch[2]
    } else if (quoteMatch) {
      style = 'blockquote'
      body = quoteMatch[1]
    } else {
      body = raw.split('\n').map(unescapeLeading).join('\n')
    }

    block.style = style
    block.children = parseInline(body, defs, keyFor)
    if (defs.length > 0) block.markDefs = defs
    return block
  })
}

/**
 * Formatting this projection defines as carrying no meaning, removed so it cannot be mistaken for
 * content.
 *
 * Blocks are separated by a blank line; a second blank line says nothing extra, and neither does a
 * trailing space. Inside a verbatim fence the payload is JSON, where whitespace is likewise
 * nothing — so it is re-serialised rather than compared as the author happened to type it.
 *
 * This is the ONLY latitude the round-trip check gives, and it is deliberately about layout, never
 * about text. Measured 02/09 on `tchemdash1`: appending a paragraph after a file that already ended
 * in a newline left two blank lines, and a byte-exact check refused a perfectly good edit. A guard
 * that cries wolf on ordinary typing is a guard people learn to route around, which costs more than
 * it ever saves.
 */
function normalise(markdown) {
  return splitBlocks(markdown)
    .map((chunk) => {
      if (!chunk.verbatim) return chunk.lines.map((line) => line.replace(/\s+$/, '')).join('\n')
      try {
        return `${FENCE}\n${JSON.stringify(JSON.parse(chunk.lines.join('\n')), null, 1)}\n\`\`\``
      } catch {
        // Unparseable stays exactly as typed, so it cannot match a re-render and the check refuses.
        return `${FENCE}\n${chunk.lines.join('\n')}\n\`\`\``
      }
    })
    .join('\n\n')
    .trim()
}

/**
 * Does this Markdown survive a parse and a re-render with nothing lost?
 *
 * The whole safety story rests here. Compared after `normalise` and not one step further: "close
 * enough" on the text itself is how a dropped link becomes a shipped bug.
 */
export function roundTrips(markdown, previous = []) {
  return normalise(toMarkdown(fromMarkdown(markdown, previous))) === normalise(markdown)
}
