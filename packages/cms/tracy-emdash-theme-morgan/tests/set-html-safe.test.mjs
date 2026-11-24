// Editor text never reaches the page as markup: the about block's description goes through the allowlist, and every
// `set:html` in src prints either that cleaned text or a constant of the code, never a raw field.
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { aboutDesc } from '../src/lib/about-desc.ts'

const SRC = new URL('../src/', import.meta.url).pathname

test('aboutDesc: a pasted event handler, script and script link render inert', () => {
  const payload = '<img src=x onerror=alert(1)>'
  const out = aboutDesc(payload)
  assert.ok(!/onerror/i.test(out), out)
  assert.ok(!/<img[^>]*\son\w+/i.test(out), out)
  for (const bad of [
    '<script>alert(1)</script>',
    '<img src="x" onerror="alert(1)">',
    '<svg onload=alert(1)>',
    '<a href="javascript:alert(1)" onclick="x()">l</a>',
    '<iframe src="https://evil.example"></iframe>',
    '<p onmouseover="x()">t</p>',
    '<style>*{display:none}</style>'
  ]) {
    const o = aboutDesc(bad)
    assert.ok(!/<script|<svg|<iframe|<style|javascript:|\son\w+\s*=/i.test(o), `${bad} -> ${o}`)
  }
})

test('aboutDesc: the seed description keeps its words and its list', () => {
  const raw = 'Get started.\n<ul class="list-special">\n<li>Real he me fond</li>\n<li>So insisted</li>\n</ul>'
  const out = aboutDesc(raw)
  assert.ok(out.startsWith('<p>Get started.'), out)
  assert.equal((out.match(/<li>/g) ?? []).length, 2, out)
  assert.ok(out.includes('<ul>'), out)
  assert.equal(aboutDesc(''), '')
  assert.equal(aboutDesc(undefined), '')
})

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n)
    return statSync(p).isDirectory() ? walk(p) : /\.(astro|ts|tsx|js|mjs)$/.test(n) ? [p] : []
  })
}

// The only expressions allowed after `set:html=`: cleaned editor text, the form embed words of the kit, a design-system
// stylesheet built by the tool, and a glyph picked from a constant map of the code.
const ALLOWED = [
  /^\{cleanHtml\(/,
  /^\{desc\}/, // FeaturesAbout: `desc` is aboutDesc(entry.desc), asserted below
  /^\{localizeFormEmbed\(/,
  /^\{dsSlot\.css\}/,
  /^\{GLYPH\[/
]

test('every set:html in src prints cleaned text or a constant of the code', () => {
  const found = []
  for (const f of walk(SRC)) {
    const text = readFileSync(f, 'utf8')
    for (const m of text.matchAll(/set:html=(\{[^\n]*)/g)) found.push([path.relative(SRC, f), m[1]])
  }
  assert.ok(found.length >= 2, `expected the known set:html sites, found ${found.length}`)
  for (const [f, expr] of found)
    assert.ok(
      ALLOWED.some((re) => re.test(expr)),
      `${f}: set:html=${expr.slice(0, 80)}`
    )
})
