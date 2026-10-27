import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  parseBlocks,
  serializeBlocks,
  checkMarkup,
  findBlock,
  removeBlock,
  setText,
  setHref,
  setImage,
  setClasses,
  setLevel,
  setSummary,
  setRootAttr,
  setListItems,
  repeatItems,
  pruneEmptyContainers,
  fillFromLibrary,
  blockName
} from '../lib/block-fill.mjs'

const fixture = (name) => readFileSync(new URL(`./fixtures/block-fill/${name}`, import.meta.url), 'utf8')

test('block-fill: parse and serialize round-trip byte for byte, including the -- escape', () => {
  const src = fixture('acm-pattern.html')
  assert.equal(serializeBlocks(parseBlocks(src)), src)
  const blocks = parseBlocks(src)
  const btn = findBlock(blocks, 'demo.btn')
  assert.equal(btn.attrs.className, 'tracy-btn tracy-btn--primary', 'the escape is decoded on parse')
  assert.match(serializeBlocks([btn]), /tracy-btn\\u002d\\u002dprimary/, 'and written back on serialize')
})

test('block-fill: checkMarkup rejects an unbalanced tree and bad attribute JSON', () => {
  assert.equal(
    checkMarkup(
      '<!-- wp:group --><div><!-- wp:paragraph --><p>x</p><!-- /wp:paragraph --></div><!-- /wp:group -->'
    ),
    true
  )
  assert.equal(
    checkMarkup('<!-- wp:group --><div><!-- wp:paragraph --><p>x</p></div><!-- /wp:group -->'),
    false
  )
  assert.equal(checkMarkup('<!-- wp:paragraph {"a":} --><p>x</p><!-- /wp:paragraph -->'), false)
})

test('block-fill: text, link, image, classes, level, summary and list items are set by metadata.name', () => {
  const blocks = parseBlocks(fixture('acm-pattern.html'))
  setText(findBlock(blocks, 'demo.eyebrow'), 'A & B <c>')
  setLevel(findBlock(blocks, 'demo.heading'), 'h3')
  setText(findBlock(blocks, 'demo.heading'), 'Title')
  setText(findBlock(blocks, 'demo.btn'), 'Go')
  setHref(findBlock(blocks, 'demo.btn'), '/go')
  setText(findBlock(blocks, 'demo.action'), 'Read more')
  setHref(findBlock(blocks, 'demo.action'), '/more')
  setImage(findBlock(blocks, 'demo.media'), { src: '/uploads/a.jpg', alt: 'Alt', id: 12 })
  setClasses(blocks[0], { add: ['bg-bg'], remove: ['bg-surface', 'border-y'] })
  setSummary(findBlock(blocks, 'demo.item.1'), 'Q?', { open: false })
  setRootAttr(findBlock(blocks, 'demo.item.1'), 'name', null)
  setListItems(findBlock(blocks, 'demo.list'), ['one', 'two'])
  const out = serializeBlocks(blocks)
  assert.equal(checkMarkup(out), true)
  assert.match(out, /<p class="tracy-eyebrow">A &amp; B &lt;c&gt;<\/p>/)
  assert.match(out, /<!-- wp:heading \{"level":3,[^\n]*\n<h3 class="wp-block-heading">Title<\/h3>/)
  assert.match(out, /<a class="wp-block-button__link wp-element-button" href="\/go">Go<\/a>/)
  assert.match(
    out,
    /<p class="action"><a href="\/more">Read more<\/a><\/p>/,
    'a paragraph wrapping one link writes into the link'
  )
  assert.match(
    out,
    /<!-- wp:image \{"sizeSlug":"medium",[^\n]*"id":12\} -->\n<figure[^>]*><img src="\/uploads\/a.jpg" alt="Alt" class="wp-image-12"\/?><\/figure>/
  )
  assert.match(
    out,
    /^<!-- wp:group \{"tagName":"section","className":"tracy-section demo bg-bg"\} -->\n<section class="wp-block-group tracy-section demo bg-bg">/
  )
  assert.match(
    out,
    /<details class="wp-block-details item"><summary>Q\?<\/summary>/,
    'open and name attributes removed'
  )
  assert.doesNotMatch(out, /"showContent":true/)
  assert.equal((out.match(/<!-- wp:list-item -->/g) ?? []).length, 2)
  assert.match(out, /<li>one<\/li>[\s\S]*<li>two<\/li>/)
})

test('block-fill: repeatItems clones the richest wrapper, renumbers names and drops item-1-only blocks from clones', () => {
  const blocks = parseBlocks(fixture('acm-pattern.html'))
  const fresh = repeatItems(blocks, 'demo', 3)
  assert.equal(fresh.length, 3)
  assert.deepEqual(
    fresh.map((b) => blockName(b)),
    ['demo.item.1', 'demo.item.2', 'demo.item.3']
  )
  assert.ok(findBlock(blocks, 'demo.answer.3'), 'inner names follow the index')
  assert.equal(
    findBlock(blocks, 'demo.answer.2').innerContent.join(''),
    findBlock(blocks, 'demo.answer.1').innerContent.join(''),
    'clone of the same template'
  )
  assert.equal(checkMarkup(serializeBlocks(blocks)), true)
  const one = repeatItems(parseBlocks(fixture('acm-pattern.html')), 'demo', 1)
  assert.equal(one.length, 1)
})

test('block-fill: removeBlock drops the placeholder and pruneEmptyContainers the empty wrapper', () => {
  const blocks = parseBlocks(fixture('acm-pattern.html'))
  removeBlock(blocks, findBlock(blocks, 'demo.btn'))
  const before = serializeBlocks(blocks)
  assert.equal(checkMarkup(before), true)
  assert.match(before, /<!-- wp:buttons -->\n<div class="wp-block-buttons">\n<\/div>\n<!-- \/wp:buttons -->/)
  pruneEmptyContainers(blocks)
  const after = serializeBlocks(blocks)
  assert.doesNotMatch(after, /wp:buttons/)
  assert.equal(checkMarkup(after), true)
})

test('block-fill: fillFromLibrary aligns leaves by kind and grows a repeated group to the module count', () => {
  const report = {}
  const out = fillFromLibrary(fixture('library-faq.html'), fixture('module-faq.html'), report)
  assert.ok(out, report.failure)
  assert.equal(checkMarkup(out), true)
  assert.deepEqual(report.patternShape, ['text', 'heading', '2×[summary text]'])
  assert.deepEqual(report.moduleShape, ['text', 'heading', '3×[summary text]'])
  assert.equal((out.match(/<!-- wp:details/g) ?? []).length, 3)
  assert.match(
    out,
    /<p class="tracy-eyebrow has-text-align-center">Before we begin<\/p>/,
    'the module head is .section-head, which OpenDesign centres'
  )
  assert.match(out, /<h2 class="wp-block-heading has-text-align-center">A few answers\.<\/h2>/)
  assert.match(out, /<summary>Third\?<\/summary><!-- wp:paragraph[^\n]*\n<p class="a">Yes\.<\/p>/)
  assert.deepEqual(report.removed, [])
  assert.deepEqual(report.inserted, [])
})

test('block-fill: fillFromLibrary removes pattern-only leaves, inserts module-only texts, keeps images by order', () => {
  const report = {}
  const out = fillFromLibrary(fixture('library-hero.html'), fixture('module-hero.html'), report)
  assert.ok(out, report.failure)
  assert.equal(checkMarkup(out), true)
  assert.deepEqual(report.removed, ['text: Eyebrow'], 'the pattern eyebrow has no module counterpart')
  assert.deepEqual(report.inserted, ['text: Extra line'])
  assert.match(
    out,
    /<h1 class="wp-block-heading has-text-align-center">Big title<\/h1>/,
    'the module root has text-align:center'
  )
  assert.match(out, /href="\/start">Start<\/a>/)
  assert.match(out, /<p>Extra line<\/p>/)
  assert.match(out, /<img src="\/images\/pic.png" alt="Pic"/)
  assert.match(out, /<p class="tracy-meta has-text-align-center">No card needed<\/p>/)
  assert.doesNotMatch(out, /Eyebrow/)
})

test('block-fill: fillFromLibrary returns null when the module has a heading the pattern cannot hold', () => {
  const report = {}
  const out = fillFromLibrary(
    fixture('library-hero.html'),
    '<section><h2>Only a heading</h2><h3>And another</h3><p>x</p></section>',
    report
  )
  assert.equal(out, null)
  assert.match(report.failure, /heading "And another"/)
})

test('block-fill: fillFromLibrary carries inline svg visuals, drops empty image slots and centres what the module centres', () => {
  const pattern = [
    '<!-- wp:group {"tagName":"section","className":"tracy-section tracy-features"} -->',
    '<section class="wp-block-group tracy-section tracy-features">',
    '<!-- wp:group {"className":"tracy-section__head"} -->',
    '<div class="wp-block-group tracy-section__head">',
    '<!-- wp:heading {"level":2} -->',
    '<h2 class="wp-block-heading">Head</h2>',
    '<!-- /wp:heading -->',
    '<!-- wp:paragraph {"className":"tracy-lead"} -->',
    '<p class="tracy-lead">Lead</p>',
    '<!-- /wp:paragraph -->',
    '</div>',
    '<!-- /wp:group -->',
    '<!-- wp:group {"className":"tracy-zig"} -->',
    '<div class="wp-block-group tracy-zig">',
    '<!-- wp:heading {"level":3} -->',
    '<h3 class="wp-block-heading">One</h3>',
    '<!-- /wp:heading -->',
    '<!-- wp:image {"className":"tracy-zig__visual"} -->',
    '<figure class="wp-block-image tracy-zig__visual"><img src="/placeholder.svg" alt=""/></figure>',
    '<!-- /wp:image -->',
    '</div>',
    '<!-- /wp:group -->',
    '<!-- wp:group {"className":"tracy-zig"} -->',
    '<div class="wp-block-group tracy-zig">',
    '<!-- wp:heading {"level":3} -->',
    '<h3 class="wp-block-heading">Two</h3>',
    '<!-- /wp:heading -->',
    '<!-- wp:image {"className":"tracy-zig__visual"} -->',
    '<figure class="wp-block-image tracy-zig__visual"><img src="/placeholder.svg" alt=""/></figure>',
    '<!-- /wp:image -->',
    '</div>',
    '<!-- /wp:group -->',
    '</section>',
    '<!-- /wp:group -->'
  ].join('\n')
  const module = `<section><div class="section-head"><h2>Centred head</h2><p>Centred lead</p></div>
    <div class="zig"><div><h3>First</h3></div><div class="zig-visual" style="border:1px solid"><svg viewBox="0 0 4 4"><path d="M0 0h4"/></svg><div style="height:4px"></div></div></div>
    <div class="zig"><div><h3>Second</h3></div></div></section>`
  const report = {}
  const out = fillFromLibrary(pattern, module, report)
  assert.ok(out, report.failure)
  assert.equal(checkMarkup(out), true)
  assert.deepEqual(report.visuals, { filled: 0, svg: 1, removed: 1, prepended: 0, dropped: 0 })
  assert.match(
    out,
    /<!-- wp:html -->\n<figure class="wp-block-image tracy-zig__visual"><div class="zig-visual" style="border:1px solid"><svg viewBox="0 0 4 4"><path d="M0 0h4"><\/path><\/svg>/,
    'the svg and its wordless box travel verbatim, inside the pattern figure classes'
  )
  assert.doesNotMatch(
    out,
    /placeholder\.svg/,
    'a slot with nothing to show is removed, not shipped as a placeholder'
  )
  assert.match(
    out,
    /<!-- wp:heading \{"level":2,"textAlign":"center"\} -->\n<h2 class="wp-block-heading has-text-align-center">Centred head<\/h2>/
  )
  assert.match(
    out,
    /<!-- wp:paragraph \{"className":"tracy-lead","align":"center"\} -->\n<p class="tracy-lead has-text-align-center">Centred lead<\/p>/
  )
  assert.match(
    out,
    /<h3 class="wp-block-heading">First<\/h3>/,
    'a card heading the module does not centre stays as it was'
  )
})

test('block-fill: an svg left over inside a paired run item is prepended to that item', () => {
  const pattern = [
    '<!-- wp:group {"className":"tracy-grid"} -->',
    '<div class="wp-block-group tracy-grid">',
    '<!-- wp:group {"className":"tracy-pillar"} -->',
    '<div class="wp-block-group tracy-pillar">',
    '<!-- wp:heading {"level":3} -->',
    '<h3 class="wp-block-heading">A</h3>',
    '<!-- /wp:heading -->',
    '<!-- wp:paragraph -->',
    '<p>a</p>',
    '<!-- /wp:paragraph -->',
    '</div>',
    '<!-- /wp:group -->',
    '<!-- wp:group {"className":"tracy-pillar"} -->',
    '<div class="wp-block-group tracy-pillar">',
    '<!-- wp:heading {"level":3} -->',
    '<h3 class="wp-block-heading">B</h3>',
    '<!-- /wp:heading -->',
    '<!-- wp:paragraph -->',
    '<p>b</p>',
    '<!-- /wp:paragraph -->',
    '</div>',
    '<!-- /wp:group -->',
    '</div>',
    '<!-- /wp:group -->'
  ].join('\n')
  const module = `<section><div class="pillars">
    <div class="card"><div class="icon"><svg viewBox="0 0 1 1"><path d="M0 0"/></svg></div><h3>X</h3><p>x text</p></div>
    <div class="card"><div class="icon"><svg viewBox="0 0 2 2"><path d="M1 1"/></svg></div><h3>Y</h3><p>y text</p></div></div></section>`
  const report = {}
  const out = fillFromLibrary(pattern, module, report)
  assert.ok(out, report.failure)
  assert.equal(checkMarkup(out), true)
  assert.equal(report.visuals.prepended, 2)
  assert.match(
    out,
    /<div class="wp-block-group tracy-pillar">\n<!-- wp:html -->\n<figure class="tracy-visual"><div class="icon"><svg viewBox="0 0 1 1">[\s\S]*?<h3 class="wp-block-heading">X<\/h3>/
  )
  assert.match(
    out,
    /<figure class="tracy-visual"><div class="icon"><svg viewBox="0 0 2 2">[\s\S]*?<h3 class="wp-block-heading">Y<\/h3>/
  )
})

test('block-fill: richText keeps the source\'s inline emphasis in a field the spec holds as plain text', async () => {
  const { richText } = await import('../lib/block-fill.mjs')
  const html = `<section><h1 style="x"><span class="sc-interp">Building the groundwork for</span><br><em style="color: rgb(218, 90, 42);"><span class="sc-interp">next-generation plants</span></em></h1>
    <p><span>Plain</span> intro with <strong>bold</strong> and <a href="/x">a link</a></p><p>Nothing here</p></section>`
  // The heading: the <em> survives without its attributes, the <br> is a break, the spans go.
  // A space stays in front of the break, so a reader that strips tags keeps the words apart:
  // WordPress's own excerpt read "groundwork fornext-generation plants" without it.
  assert.equal(richText(html, 'Building the groundwork for next-generation plants'), 'Building the groundwork for <br><em>next-generation plants</em>')
  assert.equal(
    richText(html, 'Building the groundwork for next-generation plants').replace(/<[^>]+>/g, ''),
    'Building the groundwork for next-generation plants'
  )
  // The intro: <strong> stays, the link is unwrapped (a pattern field is text, not navigation).
  assert.equal(richText(html, 'Plain intro with bold and a link'), 'Plain intro with <strong>bold</strong> and a link')
  // A field without emphasis is null: the caller writes plain text and escapes it.
  assert.equal(richText(html, 'Nothing here'), null)
  assert.equal(richText(html, 'Not in the source'), null)
  assert.equal(richText('', 'x'), null)
  // Text is escaped inside the kept tags.
  assert.equal(richText('<p><em>A &amp; B <c></em> done</p>', 'A & B done'), '<em>A &amp; B</em> done')
  // A break alone is emphasis enough: a postal address broken street / district is content, and
  // the spec field flattened it to one run ("plot 12 Borovsk District").
  const address = '<div><span>Vorsino Industrial Park, plot 12</span><br data-dc-tpl="447"><span>Borovsk District, Kaluga Region, 249020</span></div>'
  assert.equal(
    richText(address, 'Vorsino Industrial Park, plot 12 Borovsk District, Kaluga Region, 249020'),
    'Vorsino Industrial Park, plot 12 <br>Borovsk District, Kaluga Region, 249020'
  )
  // An element with no markup at all is still null: the caller writes plain text.
  assert.equal(richText('<div><span>One line only</span></div>', 'One line only'), null)
})

test('block-fill: all bare break spellings, including a stray closing break, become markup', async () => {
  const { breaksAsMarkup } = await import('../lib/block-fill.mjs')
  assert.equal(breaksAsMarkup('a</br>b'), 'a <br>b')
  assert.equal(breaksAsMarkup('a<br>b</br>c<br/>d'), 'a <br>b <br>c <br>d')
})
