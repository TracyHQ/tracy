// Tests for the section library's generator: one source per section in WordPress block markup
// with Tailwind utilities, one inline-theme input, one hand-written remainder — out come WordPress
// patterns with a rewritten stylesheet, and Joomla HTML snippets with the block comments stripped
// and the theme's asset path swapped. Tailwind runs here, once, never on a customer's site.
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  ORDER,
  candidatesOf,
  compileUtilities,
  plan,
  readmeTable,
  sectionMeta,
  stale,
  stripBlocks
} from '../scripts/build.mjs'

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const TAILWIND = readFileSync(path.join(PKG, 'tailwind.css'), 'utf8')

function fixtureSource() {
  const dir = mkdtempSync(path.join(tmpdir(), 'sections-'))
  mkdirSync(path.join(dir, 'sections'))
  writeFileSync(
    path.join(dir, 'sections', 'hero.html'),
    '<!-- wp:group {"className":"tracy-hero bg-accent p-4"} -->\n<!-- tracy:section {"title":"Hero","kind":"landing","class":".tracy-hero","holds":["headline"]} -->\n<section class="wp-block-group tracy-hero bg-accent p-4">\n<!-- wp:paragraph -->\n<p>Hi</p>\n<!-- /wp:paragraph -->\n<img src="/wp-content/themes/tracy/assets/img/hero-placeholder.svg" alt="">\n</section>\n<!-- /wp:group -->\n'
  )
  writeFileSync(
    path.join(dir, 'sections', 'faq.html'),
    '<!-- wp:group {"className":"tracy-faq m-0 lg:grid-cols-3"} -->\n<!-- tracy:section {"title":"FAQ","kind":"landing","class":".tracy-faq","holds":["questions"]} -->\n<section class="wp-block-group tracy-faq m-0 lg:grid-cols-3">\n<!-- wp:paragraph -->\n<p>Why</p>\n<!-- /wp:paragraph -->\n</section>\n<!-- /wp:group -->\n'
  )
  writeFileSync(path.join(dir, 'tailwind.css'), TAILWIND)
  writeFileSync(
    path.join(dir, 'sections.css'),
    '.tracy-faq summary::after { content: "+"; color: var(--accent); }\n'
  )
  mkdirSync(path.join(dir, 'assets'))
  writeFileSync(
    path.join(dir, 'assets', 'hero-placeholder.svg'),
    '<svg xmlns="http://www.w3.org/2000/svg"/>\n'
  )
  return dir
}

test('stripBlocks removes every block comment and collapses the blank lines it leaves', () => {
  const html = stripBlocks(
    '<!-- wp:group {"a":1} -->\n<div>\n<!-- wp:paragraph -->\n<p>x</p>\n<!-- /wp:paragraph -->\n</div>\n<!-- /wp:group -->\n'
  )
  assert.equal(html, '<div>\n<p>x</p>\n</div>\n')
  assert.doesNotMatch(html, /wp:/)
})

test('candidatesOf collects every class name once, in first-seen order', () => {
  const c = candidatesOf(['<a class="tracy-x p-4 p-4"><b class="grid  p-4 md:flex"/>', '<i class="p-4 z"/>'])
  assert.deepEqual(c, ['tracy-x', 'p-4', 'grid', 'md:flex', 'z'])
})

test('a utility compiles to the token itself, a utility without a token compiles to nothing', async () => {
  const css = await compileUtilities(TAILWIND, [
    'bg-accent',
    'p-4',
    'p-7',
    'text-red-500',
    'lg:grid-cols-3',
    'max-w-page',
    'py-section-phone'
  ])
  assert.match(css, /\.bg-accent \{\s*background-color: var\(--accent\);/)
  assert.match(css, /\.p-4 \{\s*padding: var\(--space-4\);/)
  assert.match(css, /\.max-w-page \{\s*max-width: var\(--container-max\);/)
  assert.match(css, /\.py-section-phone \{\s*padding-block: var\(--section-y-phone\);/)
  assert.match(css, /@media \(width >= 64rem\)[\s\S]*grid-cols-3/)
  assert.doesNotMatch(css, /\.p-7/)
  assert.doesNotMatch(css, /red/)
  assert.doesNotMatch(css, /:root/)
  assert.doesNotMatch(css, /@layer/)
})

test('every section becomes a WordPress pattern and a Joomla snippet; the order is the landing order', async () => {
  const src = fixtureSource()
  const { files, order } = await plan({ srcDir: src, order: ['hero', 'faq'] })
  assert.deepEqual(order, ['hero', 'faq'])
  const pattern = files.get('wordpress/patterns/section-hero.php')
  assert.match(pattern, /^<\?php\n\/\*\*\n \* Title: Hero\n \* Slug: tracy\/section-hero\n/)
  assert.match(pattern, /\?>\n<!-- wp:group \{"className":"tracy-hero bg-accent p-4"\} -->/)
  const snippet = files.get('joomla/sections/hero.html')
  assert.doesNotMatch(snippet, /wp:/)
  assert.match(snippet, /src="\/media\/templates\/site\/tpl_tracy\/images\/hero-placeholder\.svg"/)
  assert.match(files.get('joomla/sections/faq.html'), /<p>Why<\/p>/)
})

test('the landing composite lists the sections in order — WordPress by pattern slug, Joomla as concatenated markup without the hero', async () => {
  const src = fixtureSource()
  const { files } = await plan({ srcDir: src, order: ['hero', 'faq'] })
  const landing = files.get('wordpress/patterns/landing.php')
  assert.match(
    landing,
    /wp:pattern \{"slug":"tracy\/section-hero"\} \/-->\n<!-- wp:pattern \{"slug":"tracy\/section-faq"\} \/-->/
  )
  const joomla = files.get('joomla/sections/landing.html')
  assert.match(joomla, /tracy-faq/)
  assert.match(joomla, /tracy-hero/)
})

test('the stylesheet is utilities plus the remainder: Joomla on the raw tokens, WordPress on its own variables', async () => {
  const src = fixtureSource()
  const { files } = await plan({ srcDir: src, order: ['hero', 'faq'] })
  const joomla = files.get('joomla/media/css/sections.css')
  assert.match(joomla, /\.bg-accent \{\s*background-color: var\(--accent\);/)
  assert.match(joomla, /\.tracy-faq summary::after \{ content: "\+"; color: var\(--accent\); \}/)
  assert.match(joomla, /\.m-0 \{\s*margin: 0px;/)
  const wp = files.get('wordpress/assets/css/sections.css')
  assert.match(wp, /\.bg-accent \{\s*background-color: var\(--wp--preset--color--accent\);/)
  assert.match(wp, /\.p-4 \{\s*padding: var\(--wp--preset--spacing--4\);/)
  assert.match(wp, /summary::after \{ content: "\+"; color: var\(--wp--preset--color--accent\); \}/)
  assert.doesNotMatch(wp, /var\(--accent\)/)
})

test('a utility with no token behind it stops the build and is named', async () => {
  const src = fixtureSource()
  writeFileSync(
    path.join(src, 'sections', 'faq.html'),
    '<!-- wp:group {"className":"tracy-faq p-7 sm:text-red-500"} -->\n<!-- tracy:section {"title":"FAQ","kind":"landing","class":".tracy-faq","holds":["q"]} -->\n<section class="wp-block-group tracy-faq p-7 sm:text-red-500"></section>\n<!-- /wp:group -->\n'
  )
  await assert.rejects(
    () => plan({ srcDir: src, order: ['hero', 'faq'] }),
    /compiled to nothing.*p-7, sm:text-red-500/
  )
})

test('a remainder that references a token outside the contract stops the build', async () => {
  const src = fixtureSource()
  writeFileSync(path.join(src, 'sections.css'), '.x { color: var(--brand-pink); }\n')
  await assert.rejects(() => plan({ srcDir: src, order: ['hero', 'faq'] }), /--brand-pink/)
})

test('a section named in the order but missing on disk stops the build', async () => {
  const src = fixtureSource()
  await assert.rejects(() => plan({ srcDir: src, order: ['hero', 'ghost'] }), /ghost/)
})

test('the placeholder image lands in both themes', async () => {
  const src = fixtureSource()
  const { files } = await plan({ srcDir: src, order: ['hero', 'faq'] })
  assert.ok(files.has('wordpress/assets/img/hero-placeholder.svg'))
  assert.ok(files.has('joomla/media/images/hero-placeholder.svg'))
})

test('stale reports planned files that differ on disk, and orphan patterns or snippets', async () => {
  const src = fixtureSource()
  const { files } = await plan({ srcDir: src, order: ['hero', 'faq'] })
  const wp = mkdtempSync(path.join(tmpdir(), 'wp-'))
  const joomla = mkdtempSync(path.join(tmpdir(), 'j-'))
  mkdirSync(path.join(wp, 'patterns'), { recursive: true })
  mkdirSync(path.join(joomla, 'sections'), { recursive: true })
  writeFileSync(
    path.join(wp, 'patterns', 'section-hero.php'),
    files.get('wordpress/patterns/section-hero.php')
  )
  writeFileSync(path.join(wp, 'patterns', 'section-ghost.php'), '<?php')
  writeFileSync(path.join(joomla, 'sections', 'ghost.html'), '<p/>')
  const report = stale(files, { wordpress: wp, joomla })
  assert.ok(!report.includes('wordpress/patterns/section-hero.php'))
  assert.ok(report.includes('wordpress/patterns/section-faq.php'))
  assert.ok(report.includes('wordpress/patterns/section-ghost.php'))
  assert.ok(report.includes('joomla/sections/ghost.html'))
})

test('the real library plans every section once, landing sections before page ones, each with a token per utility', async () => {
  // plan() itself refuses a silent utility, so reaching the assertions is the second half of the test.
  const { order, files, candidates, sections } = await plan({ srcDir: PKG })
  assert.equal(new Set(order).size, order.length, 'no section is planned twice')
  const kinds = order.map((name) => sections[name].kind)
  assert.deepEqual(kinds, [...kinds].sort(), 'every landing section precedes every page section')
  assert.equal(
    [...files.keys()].filter((f) => f.startsWith('wordpress/patterns/section-')).length,
    order.length
  )
  assert.ok(candidates.length > 0)
  assert.doesNotMatch(files.get('joomla/media/css/sections.css'), /:root/)
})

test('the landing composite carries only the landing sections, on both sides', async () => {
  const { files, standalone: STANDALONE, order, sections } = await plan({ srcDir: PKG })
  assert.deepEqual(
    STANDALONE,
    order.filter((name) => sections[name].kind === 'page'),
    'a section is standalone exactly when its marker says kind page'
  )
  // The two composites are assembled by different code paths — the WordPress one lists pattern
  // slugs, the Joomla one concatenates markup — so they can disagree. They did: the exclusion was
  // written inline in both places, and adding a standalone section to one list left the other
  // pouring an archive index into the landing page.
  const wp = [...files.get('wordpress/patterns/landing.php').matchAll(/section-([a-z-]+)/g)].map((m) => m[1])
  const joomla = files.get('joomla/sections/landing.html')

  for (const name of STANDALONE) {
    assert.ok(!wp.includes(name), `${name} is standalone but appears in the WordPress landing`)
    assert.doesNotMatch(
      joomla,
      new RegExp(`tracy-${name}\\b`),
      `${name} is standalone but appears in the Joomla landing`
    )
  }
  assert.equal(wp.length, ORDER.length - STANDALONE.length)
})

test('regions.json describes every section, and states nothing the markup did not', async () => {
  const { files, standalone: STANDALONE } = await plan({ srcDir: PKG })
  const regions = JSON.parse(files.get('self/regions.json'))

  assert.equal(Object.keys(regions.sections).length, ORDER.length)
  assert.deepEqual(regions.standalone, [...STANDALONE])

  // The whole point of the map is that it carries NO framework: a T4 template reading it must not
  // find Tailwind utilities or WordPress block classes, or it will paste them into a Bootstrap page.
  // Scoped to the PAYLOAD — the metadata legitimately names the package it came from, and asserting
  // over the whole document failed on `tracy-cms-regions/v1` rather than on anything real.
  // `class` is the one field that NAMES the role class (the README's Class column), on purpose;
  // the shape fields must still carry no framework and no class.
  const serialized = JSON.stringify(
    Object.fromEntries(Object.entries(regions.sections).map(([n, { class: _cls, ...shape }]) => [n, shape]))
  )
  assert.doesNotMatch(serialized, /wp-block|grid-cols-|sm:|lg:|tracy-/)

  // A grid section states its columns; a bespoke one states only its root rather than guessing.
  assert.deepEqual(regions.sections.team.body.cols, { phone: 1, tablet: 2, desktop: 4 })
  assert.deepEqual(regions.sections.team.body.item.parts, ['photo', 'name', 'role', 'bio'])
  assert.equal(regions.sections.hero.body, undefined)
})

// A section declares itself on line 2 (29/09/2026): title, kind, class, what it holds. Everything
// that describes a section — the README table, regions.json, the landing composite's membership —
// is generated from that marker, so none of it can drift from the section again.
test('sectionMeta reads the marker on line 2 and hands back the markup without it', () => {
  const src =
    '<!-- wp:group {"className":"tracy-x"} -->\n<!-- tracy:section {"title":"X","kind":"page","class":".tracy-x","holds":["a","b"]} -->\n<section class="tracy-x"></section>\n<!-- /wp:group -->\n'
  const { meta, markup } = sectionMeta(src, 'x')
  assert.deepEqual(meta, { title: 'X', kind: 'page', class: '.tracy-x', holds: ['a', 'b'] })
  assert.equal(
    markup,
    '<!-- wp:group {"className":"tracy-x"} -->\n<section class="tracy-x"></section>\n<!-- /wp:group -->\n'
  )
})

test('a section without a marker, or with a half-written one, stops the build and is named', () => {
  const head = '<!-- wp:group {"className":"tracy-x"} -->\n'
  assert.throws(
    () => sectionMeta(`${head}<section></section>\n`, 'x'),
    /sections\/x\.html has no marker on line 2/
  )
  assert.throws(
    () =>
      sectionMeta(
        `${head}<!-- tracy:section {"title":"X","kind":"band","class":".tracy-x","holds":["a"]} -->\n`,
        'x'
      ),
    /kind must be landing or page/
  )
  assert.throws(
    () =>
      sectionMeta(
        `${head}<!-- tracy:section {"title":"X","kind":"page","class":"x","holds":["a"]} -->\n`,
        'x'
      ),
    /class must name/
  )
  assert.throws(
    () =>
      sectionMeta(
        `${head}<!-- tracy:section {"title":"X","kind":"page","class":".tracy-x","holds":[]} -->\n`,
        'x'
      ),
    /holds must be/
  )
  assert.throws(() => sectionMeta(`${head}<!-- tracy:section {not json} -->\n`, 'x'), /not valid JSON/)
})

test('the marker reaches neither theme: the pattern and the snippet are the markup without it', async () => {
  const { files } = await plan({ srcDir: fixtureSource(), order: ['hero', 'faq'] })
  for (const key of [
    'wordpress/patterns/section-hero.php',
    'joomla/sections/hero.html',
    'joomla/sections/landing.html'
  ])
    assert.doesNotMatch(files.get(key), /tracy:section/, key)
})

test('the README table and regions.json are generated from the markers: one row per section carrying its class and holds', async () => {
  const { files, sections, order } = await plan({ srcDir: PKG })
  const readme = files.get('self/README.md')
  const table = readme.slice(
    readme.indexOf('<!-- sections:begin -->'),
    readme.indexOf('<!-- sections:end -->')
  )
  const rows = table.split('\n').filter((l) => /^\| `[a-z-]+` \|/.test(l))
  assert.equal(rows.length, order.length)
  order.forEach((name, i) => {
    assert.ok(rows[i].startsWith(`| \`${name}\` | \`${sections[name].class}\` |`), name)
    assert.ok(rows[i].endsWith(`| ${sections[name].holds.join(' · ')} |`), name)
  })
  assert.equal(readmeTable(['hero'], { hero: sections.hero }).split('\n').length, 3)
  const regions = JSON.parse(files.get('self/regions.json'))
  for (const name of order) {
    const { kind, class: cls, holds } = sections[name]
    assert.deepEqual(
      {
        kind: regions.sections[name].kind,
        class: regions.sections[name].class,
        holds: regions.sections[name].holds
      },
      { kind, class: cls, holds },
      name
    )
  }
  // `stale` sees a README whose table was edited by hand.
  const dir = mkdtempSync(path.join(tmpdir(), 'sections-readme-'))
  const wp = path.join(dir, 'wp')
  const joomla = path.join(dir, 'joomla')
  for (const [key, content] of files) {
    const [side, ...rest] = key.split('/')
    const abs =
      side === 'self' ? path.join(PKG, ...rest) : path.join(side === 'wordpress' ? wp : joomla, ...rest)
    if (side === 'self') continue
    mkdirSync(path.dirname(abs), { recursive: true })
    writeFileSync(abs, content)
  }
  assert.ok(
    !stale(files, { wordpress: wp, joomla }).some((k) => k !== 'self/README.md' && k !== 'self/regions.json')
  )
})
