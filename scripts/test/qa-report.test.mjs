// `renderReport` (scripts/qa/lib/report.mjs): the nightly report, from a sample night (JSON) to the
// Markdown the owner reads. The expected file is written by hand; the sample carries hostile text that must
// stay inside its code span. Vietnamese text lives only in the template, the labels and the fixtures.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { fill, fmt, loadLabels, renderReport } from '../qa/lib/report.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const FIXTURES = join(ROOT, 'scripts', 'qa', 'templates', 'fixtures')
const sample = () => JSON.parse(readFileSync(join(FIXTURES, 'report-sample.json'), 'utf8'))

async function loadMarked() {
  const store = join(ROOT, 'node_modules', '.pnpm')
  if (!existsSync(store)) return null
  const dir = readdirSync(store).find((d) => d.startsWith('marked@'))
  const file = dir && join(store, dir, 'node_modules', 'marked', 'lib', 'marked.esm.js')
  return file && existsSync(file) ? (await import(pathToFileURL(file).href)).marked : null
}

test('the sample night renders exactly the hand-written report', () => {
  const expected = readFileSync(join(FIXTURES, 'report-sample.expected.md'), 'utf8')
  assert.equal(renderReport(sample()), expected)
})

test('the hostile quote stays one code span inside its table cell', () => {
  const out = renderReport(sample())
  const row = out.split('\n').find((l) => l.startsWith('| #745 '))
  assert.ok(row)
  // Nine cells: the '|' in the quote was escaped, the newline folded, the backticks neutralised.
  assert.equal(row.split(/(?<!\\)\|/).length - 2, 9)
  assert.doesNotMatch(row, /```/)
})

test('a real CommonMark/GFM parser sees no link, image, mention or HTML anywhere in the report', async (t) => {
  const marked = await loadMarked()
  if (!marked) {
    t.skip('marked is not in the pnpm store here')
    return
  }
  const html = marked.parse(renderReport(sample()))
  assert.doesNotMatch(html, /<a |<img |<script|<\/td>\s*@/)
  const row = html.split('<tr>').find((r) => r.includes('pr745-k3'))
  assert.equal((row.match(/<td>/g) ?? []).length, 9)
  assert.match(
    row,
    /<code>&#39;&#39;&#39; &lt;\/td&gt; @TracyHQ\/all \[x\]\(https:\/\/evil\.example\) \| &lt;img src=x&gt;<\/code>/
  )
})

test('an empty night still renders every section, each saying none', () => {
  const L = loadLabels()
  const out = renderReport({ runId: '20261004a', range: {}, stand: {}, prCount: 0 })
  assert.doesNotMatch(out, /\{\{|\{\w+\}/, 'no placeholder left behind')
  assert.ok(out.split(L.none).length - 1 >= 10)
  assert.match(out, new RegExp(L.notReconciled))
})

test('fill throws on a placeholder without a value; fmt leaves unknown names alone', () => {
  assert.throws(() => fill('a {{b}}', {}), /placeholder without a value: b/)
  assert.equal(fill('{{a}}-{{a}}', { a: 1 }), '1-1')
  assert.equal(fmt('{x} and {y}', { x: 2 }), '2 and {y}')
})

test('the code holds no Vietnamese: every display word comes from the template or the labels', () => {
  for (const f of ['report.mjs', 'issues.mjs', 'literal.mjs']) {
    const src = readFileSync(join(ROOT, 'scripts', 'qa', 'lib', f), 'utf8')
    const vi = src.match(/[ăâđêôơưĂÂĐÊÔƠƯàáảãạầấẩẫậằắẳẵặèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/g)
    assert.equal(vi, null, `${f} has Vietnamese letters`)
  }
})
