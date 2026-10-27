// `literal()` (scripts/qa/lib/literal.mjs): the one gate every untrusted string (a PR quote, a model's
// observation, test output, a PR title) passes before it lands in a GitHub issue or the nightly report.
// Whatever goes in, the result must parse as exactly ONE fenced code block: no link, no image, no
// mention, no HTML can escape it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { literal, literalInline, sanitize } from '../qa/lib/literal.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

/**
 * A minimal CommonMark fenced-code-block reader (spec 0.31, section 4.5): an opening fence is up to
 * three spaces then three or more backticks or tildes; the block ends at the first line that is up
 * to three spaces then a run of the SAME character at least as long, followed only by spaces.
 * Returns the blocks found, plus whether any non-blank text sits outside them.
 */
function fencedBlocks(markdown) {
  const lines = markdown.split('\n')
  const blocks = []
  let outside = false
  for (let i = 0; i < lines.length; i++) {
    const open = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(lines[i])
    if (!open) {
      if (lines[i].trim() !== '') outside = true
      continue
    }
    const ch = open[1][0]
    if (ch === '`' && open[2].includes('`')) {
      outside = true // not a fence: a backtick info string makes it an inline code span
      continue
    }
    const close = new RegExp(`^ {0,3}\\${ch}{${open[1].length},} *$`)
    let j = i + 1
    while (j < lines.length && !close.test(lines[j])) j++
    blocks.push({ start: i, end: j, content: lines.slice(i + 1, j) })
    i = j
  }
  return { blocks, outside }
}

/** The real `marked` (a CommonMark/GFM parser) when the pnpm store holds it; tests skip it otherwise. */
async function loadMarked() {
  const store = join(ROOT, 'node_modules', '.pnpm')
  if (!existsSync(store)) return null
  const dir = readdirSync(store).find((d) => d.startsWith('marked@'))
  if (!dir) return null
  const file = join(store, dir, 'node_modules', 'marked', 'lib', 'marked.esm.js')
  if (!existsSync(file)) return null
  return (await import(pathToFileURL(file).href)).marked
}

const NASTY = [
  'plain text',
  '```\nclosed early\n```\n[link](https://evil.example) @lee',
  '````\nfour\n````\n~~~\ntilde\n~~~',
  '~~~~ tilde fence ~~~ and ~ alone',
  '@leeknowsai please look, cc @TracyHQ/team',
  '[click me](https://evil.example/steal?c=1) and <https://auto.example>',
  '![img](https://evil.example/pixel.png)',
  '<img src=x onerror=alert(1)><script>alert(1)</script><a href="x">a</a>',
  'ctrl \u0000\u0007\u001b[31mred\u001b[0m\r\nwin line\rmac sep',
  'Tiếng Việt có dấu — em dash, “quotes”, emoji 🎉, zero​width, RTL ‮evil',
  '    indented four\n\ttabbed\n> quote\n# heading\n- list\n| a | b |',
  'x'.repeat(10000),
  Array.from({ length: 500 }, (_, i) => `line ${i}`).join('\n'),
  '',
  '`',
  '```',
  '\n\n\n'
]

test('sanitize keeps printable ASCII only, folds accents, turns backtick and tilde into a quote', () => {
  assert.equal(sanitize('a`b~c'), "a'b'c")
  assert.equal(sanitize('Tiếng Việt'), 'Tieng Viet')
  assert.equal(sanitize('x\u0000y\u001bz‮w'), 'xyzw')
  assert.equal(sanitize('a\r\nb\rc\td'), 'a\nb\nc  d')
  assert.equal(sanitize('🎉ok'), 'ok')
})

test('every nasty input becomes exactly one fenced block with nothing outside it', () => {
  for (const input of NASTY) {
    const out = literal(input)
    const { blocks, outside } = fencedBlocks(out)
    assert.equal(blocks.length, 1, `one block for ${JSON.stringify(input.slice(0, 40))}:\n${out}`)
    assert.equal(outside, false, `nothing outside the block for ${JSON.stringify(input.slice(0, 40))}`)
    assert.equal(blocks[0].end, out.split('\n').length - 1, 'the block closes on the last line')
    for (const line of blocks[0].content) assert.match(line, /^[\x20-\x7e]*$/, 'printable ASCII only')
  }
})

test('length and line count are capped, and the cut is said', () => {
  const long = literal('x'.repeat(10000), { maxChars: 100 })
  assert.ok(long.length < 200)
  assert.match(long, /truncated/)
  const many = literal(Array.from({ length: 500 }, (_, i) => `l${i}`).join('\n'), { maxLines: 10 })
  assert.ok(many.split('\n').length <= 13)
  assert.match(many, /truncated/)
})

test('the indent option keeps the block inside a list item', () => {
  const out = literal('[x](y) @z', { indent: '  ' })
  for (const line of out.split('\n')) assert.ok(line.startsWith('  '))
})

test('literalInline is one code span on one line; in a table cell the pipe is escaped', () => {
  assert.equal(literalInline('a\nb `c` [d](e)'), "`a b 'c' [d](e)`")
  assert.equal(literalInline('a|b', { table: true }), '`a\\|b`')
  assert.equal(literalInline(''), '`-`')
  assert.ok(literalInline('x'.repeat(1000)).length < 260)
})

test('a real CommonMark parser agrees: one code token, no link, image, mention or HTML', async (t) => {
  const marked = await loadMarked()
  if (!marked) {
    t.skip('marked is not in the pnpm store here')
    return
  }
  for (const input of NASTY) {
    const out = literal(input)
    const tokens = marked.lexer(out).filter((tk) => tk.type !== 'space')
    assert.equal(tokens.length, 1, `one token for ${JSON.stringify(input.slice(0, 40))}`)
    assert.equal(tokens[0].type, 'code')
    const html = marked.parse(out)
    assert.match(html, /^<pre><code>[\s\S]*<\/code><\/pre>\s*$/)
    assert.doesNotMatch(html, /<a |<img |<script/)
    // The paragraph around a table row still holds the span as code, never as a link.
    const cell = marked.parse(`| a |\n|---|\n| ${literalInline(input, { table: true })} |`)
    assert.doesNotMatch(cell, /<a |<img |<script/)
    assert.equal((cell.match(/<td>/g) ?? []).length, 1, 'one cell: the pipe did not split it')
  }
})
