// The kit pages' components print no English of their own on a site in another language (TCH #1013, LANG-2, K3, g62).
// Measured 11/10/2026 on dev g61-biz-emd-full (Vietnamese), /kit/style-guide: "hero (banner)", "component (main content)",
// "copyright · debug", "H1 · Newsreader 52/1.08", "Ink", "Paper 2", "Line", literals of KitStyleGuide.astro the seed's
// language rows never reach. A component's own words come from `locale-words.ts`; a position name or a type figure (what an
// installer types or sets, the same in every language) is printed as code.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { test } from 'node:test'

import { WORDS } from '../src/lib/locale-words.ts'

const DIR = new URL('../src/components/kit/', import.meta.url)
const seed = JSON.parse(readFileSync(new URL('../seed/seed.json', import.meta.url), 'utf8'))

/** The frontmatter of an Astro file, comments taken out. */
const frontmatter = (text) =>
  (/^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

// A literal that is not words: an import or a path, a hex colour, a heading tag, figures, or class names and identifiers
// (each space-separated piece lowercase, starting with a letter, a digit or "!").
const NOT_WORDS = [/^[@/#]/, /^H\d$/, /^[\d\s.·/em]+$/]
const CLASSY = /^!?[a-z0-9][\w\-[\].:%/!#,]*$/

test('the kit components keep no English literal a visitor reads', () => {
  const left = []
  for (const file of readdirSync(DIR).filter((f) => f.endsWith('.astro'))) {
    const text = readFileSync(new URL(file, DIR), 'utf8')
    const fm = frontmatter(text).replace(/\bspec:\s*'[^']*'/g, '')
    for (const [, lit] of fm.matchAll(/'([^'\n]*)'/g)) {
      if (!/[A-Za-z]{2,}/.test(lit) || NOT_WORDS.some((re) => re.test(lit))) continue
      if (lit.split(/\s+/).every((piece) => CLASSY.test(piece))) continue
      left.push(`${file}: '${lit}'`)
    }
    const body = text.replace(/^---\n[\s\S]*?\n---/, '').replace(/<code\b[^>]*>[\s\S]*?<\/code>/g, '')
    for (const [, run] of body.matchAll(/>([^<>{}]*)</g))
      if (/[A-Za-z]{3,}/.test(run) && !/^\s*[;)]/.test(run)) left.push(`${file}: >${run.trim()}<`)
  }
  assert.deepEqual(left, [])
})

test('the style guide prints its type figures as code', () => {
  const text = readFileSync(new URL('KitStyleGuide.astro', DIR), 'utf8')
  assert.match(text, /<code\b[^>]*>\{t\.spec\}<\/code>/)
})

test('every locale names the style guide’s positions and colours, the colours as its slides sample does', () => {
  const pal = Object.fromEntries(
    seed.content.pages
      .filter((e) => e.slug === 'kit-slides')
      .map((e) => [e.locale ?? 'en', e.data.sample.pal.map((p) => p.n)])
  )
  for (const [locale, words] of Object.entries(WORDS)) {
    const k = words.kit
    for (const key of ['banner', 'mainContent']) assert.ok(k[key]?.trim(), `${locale}.kit.${key}`)
    const s = k.swatches
    for (const key of ['ink', 'paper', 'forest', 'signal', 'line'])
      assert.ok(s?.[key]?.trim(), `${locale}.kit.swatches.${key}`)
    if (pal[locale]) assert.deepEqual([s.ink, s.paper, s.forest, s.signal], pal[locale], locale)
    if (locale !== 'en')
      assert.notDeepEqual(
        [k.banner, k.mainContent, s.line],
        [WORDS.en.kit.banner, WORDS.en.kit.mainContent, WORDS.en.kit.swatches.line],
        locale
      )
  }
})
