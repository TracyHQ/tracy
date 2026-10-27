import test from 'node:test'
import assert from 'node:assert/strict'
import {
  convertHtml,
  htmlToBlocks,
  checkBlockMarkup,
  rewriteImageSrc,
  SLOT_BLOCK
} from '../lib/html-to-blocks.mjs'

const block = (markup, name) =>
  (markup.match(new RegExp(`<!-- wp:${name}( \\{[^\\n]*\\})? -->`, 'g')) ?? []).length

test('html-to-blocks: paragraph, heading levels, list items, image, quote, separator', () => {
  const markup = htmlToBlocks(
    '<p>Hi <strong>there</strong> <a href="/x">link</a><br>next</p><h1>One</h1><h2>Two</h2><h3>Three</h3>' +
      '<ul><li>a</li><li>b</li></ul><ol><li>c</li></ol><img src="images/demo/pic.png" alt="Pic">' +
      '<blockquote><p>quote</p><cite>who</cite></blockquote><hr>'
  )
  assert.equal(block(markup, 'paragraph'), 2, 'one from <p>, one inside the quote')
  // A space goes in front of the break: it draws nothing, and a reader that strips tags instead
  // of laying them out (WordPress's excerpt, a meta description) keeps "link" and "next" apart.
  assert.match(
    markup,
    /<!-- wp:paragraph -->\n<p>Hi <strong>there<\/strong> <a href="\/x">link<\/a> <br>next<\/p>\n<!-- \/wp:paragraph -->/
  )
  assert.match(markup, /<!-- wp:heading \{"level":1\} -->\n<h1 class="wp-block-heading">One<\/h1>/)
  assert.match(
    markup,
    /<!-- wp:heading -->\n<h2 class="wp-block-heading">Two<\/h2>/,
    'level 2 is the default and is not serialised'
  )
  assert.match(markup, /<!-- wp:heading \{"level":3\} -->/)
  assert.equal(block(markup, 'list'), 2)
  assert.match(markup, /<!-- wp:list \{"ordered":true\} -->\n<ol class="wp-block-list">/)
  assert.equal(block(markup, 'list-item'), 3)
  assert.match(
    markup,
    /<!-- wp:image \{"sizeSlug":"full"\} -->\n<figure class="wp-block-image size-full"><img src="\/wp-content\/uploads\/pic.png" alt="Pic"\/><\/figure>/
  )
  assert.match(
    markup,
    /<!-- wp:quote -->\n<blockquote class="wp-block-quote">[\s\S]*<cite>who<\/cite><\/blockquote>\n<!-- \/wp:quote -->/
  )
  assert.match(markup, /<!-- wp:separator -->/)
  assert.deepEqual(checkBlockMarkup(markup), { ok: true, problems: [], blocks: 13 })
})

test('html-to-blocks: wrappers become groups, empty wrappers vanish, inline-only wrappers are paragraphs', () => {
  const markup = htmlToBlocks(
    '<div class="wrap"><section><h2>T</h2><p>x</p></section><div></div><div>just <em>text</em></div></div>'
  )
  assert.equal(block(markup, 'group'), 2, 'outer div + section; the empty div is dropped')
  assert.match(
    markup,
    /<!-- wp:group \{"layout":\{"type":"constrained"\},"className":"wrap"\} -->\n<div class="wp-block-group wrap">/
  )
  assert.match(markup, /<p>just <em>text<\/em><\/p>/)
  assert.ok(checkBlockMarkup(markup).ok)
})

test('html-to-blocks: {loadposition} becomes a self-closing slot marker, mixed text splits around it', () => {
  const { markup, slots } = convertHtml(
    '<p>before {loadposition about-page} after</p>{loadmodule mod_custom,Footer}'
  )
  assert.deepEqual(slots, ['about-page', 'mod_custom,Footer'])
  assert.equal(
    (markup.match(new RegExp(`<!-- wp:${SLOT_BLOCK} \\{"position":"[^"]+"\\} /-->`, 'g')) ?? []).length,
    2
  )
  const lines = markup.split('\n').filter((l) => l.startsWith('<!-- wp:') || l.startsWith('<p'))
  assert.deepEqual(lines, [
    '<!-- wp:paragraph -->',
    '<p>before</p>',
    `<!-- wp:${SLOT_BLOCK} {"position":"about-page"} /-->`,
    '<!-- wp:paragraph -->',
    '<p>after</p>',
    `<!-- wp:${SLOT_BLOCK} {"position":"mod_custom,Footer"} /-->`
  ])
  assert.equal(
    htmlToBlocks('{loadposition x}'),
    `<!-- wp:${SLOT_BLOCK} {"position":"x"} /-->`,
    'a bare marker is the whole body'
  )
})

test('html-to-blocks: images are rewritten to the uploads basename and reported; alt survives', () => {
  const { markup, images } = convertHtml(
    '<figure><img src="images/tracy-demo/studio.png#joomlaImage://local-images/studio.png?width=1&height=1" alt="A &amp; B"><figcaption>cap</figcaption></figure>'
  )
  assert.deepEqual(images, [
    {
      src: '/wp-content/uploads/studio.png',
      file: 'studio.png',
      original: 'images/tracy-demo/studio.png',
      alt: 'A & B'
    }
  ])
  assert.match(markup, /alt="A &amp; B"/)
  assert.match(markup, /<figcaption class="wp-element-caption">cap<\/figcaption>/)
  assert.deepEqual(rewriteImageSrc('/a/b/c.jpg?x=1', '/u/'), {
    src: '/u/c.jpg',
    file: 'c.jpg',
    original: '/a/b/c.jpg'
  })
  const classed = convertHtml('<img class="benefit__img  wide" src="images/b.png" alt="">').markup
  assert.match(
    classed,
    /<!-- wp:image \{"sizeSlug":"full","className":"benefit__img wide"\} -->\n<figure class="wp-block-image size-full benefit__img wide"><img src="\/wp-content\/uploads\/b.png" alt=""\/><\/figure>/,
    'the image class is the block className, on the figure'
  )
  assert.ok(checkBlockMarkup(classed).ok)
})

test('html-to-blocks: unknown or inline-styled markup falls back to core/html, never a lossy group', () => {
  const table = htmlToBlocks('<table><tr><td>x</td></tr></table>')
  assert.match(table, /^<!-- wp:html -->\n<table>[\s\S]*<\/table>\n<!-- \/wp:html -->$/)
  const styled = htmlToBlocks(
    '<section class="wrap"><div style="max-width:860px"><h1>Hero</h1></div></section>'
  )
  assert.equal(block(styled, 'html'), 1)
  assert.equal(block(styled, 'group'), 0)
  assert.match(styled, /style="max-width:860px"/)
})

test('html-to-blocks: link rewriter is applied to href only; output is deterministic', () => {
  const html = '<p><a href="index.php?Itemid=5" title="index.php?Itemid=5">x</a></p>'
  const link = (h) => h.replace(/^index\.php\?Itemid=(\d+)$/, '/item-$1')
  const a = htmlToBlocks(html, { link })
  assert.match(a, /<a href="\/item-5" title="index.php\?Itemid=5">x<\/a>/)
  assert.equal(a, htmlToBlocks(html, { link }))
})

test('html-to-blocks: source breaks in all three spellings become line breaks', () => {
  for (const spelling of ['</br>', '<br>', '<br/>']) {
    const markup = htmlToBlocks(`<p>before${spelling}after</p>`)
    assert.match(markup, /<p>before <br>after<\/p>/, spelling)
    assert.doesNotMatch(markup, /&lt;\/?br/, spelling)
  }
})

test('html-to-blocks: links and list items retain their classes', () => {
  const markup = htmlToBlocks('<p><a class="nav-link" href="/x">Link</a></p><ul><li class="feature-item">Text</li></ul>')
  assert.match(markup, /<a href="\/x" class="nav-link">Link<\/a>/)
  assert.match(markup, /<!-- wp:list-item \{"className":"feature-item"\} -->\n<li class="feature-item">Text<\/li>/)
  assert.ok(checkBlockMarkup(markup).ok)
})

test('checkBlockMarkup: catches an unbalanced closer, a stray opener and bad attribute JSON', () => {
  assert.deepEqual(checkBlockMarkup('<!-- wp:paragraph --><p>a</p><!-- /wp:heading -->').problems, [
    'closer core/heading does not match opener core/paragraph'
  ])
  assert.deepEqual(
    checkBlockMarkup('<!-- wp:group --><!-- wp:paragraph --><p>a</p><!-- /wp:paragraph -->').problems,
    ['unclosed block core/group']
  )
  assert.match(
    checkBlockMarkup('<!-- wp:tracy-base/slot {"position":} /-->').problems[0],
    /invalid attribute JSON on tracy-base\/slot/
  )
  assert.ok(
    checkBlockMarkup('<!-- wp:more -->\n<!--more-->\n<!-- /wp:more -->').ok,
    'the more block wraps a plain comment'
  )
})

test('html-to-blocks: a list keeps the class of its <ul>/<ol> in the block attributes and the markup', () => {
  const markup = htmlToBlocks('<ul class="my-4 list-special"><li>Benefit</li></ul><ol class="steps"><li>One</li></ol><ul><li>Plain</li></ul>')
  assert.match(markup, /<!-- wp:list \{"className":"my-4 list-special"\} -->\n<ul class="wp-block-list my-4 list-special">/)
  assert.match(markup, /<!-- wp:list \{"ordered":true,"className":"steps"\} -->\n<ol class="wp-block-list steps">/)
  assert.match(markup, /<!-- wp:list -->\n<ul class="wp-block-list">\n<!-- wp:list-item -->\n<li>Plain<\/li>/, 'no class, no attribute')
  assert.ok(checkBlockMarkup(markup).ok)
})

test('html-to-blocks: an <img> inside a list item stays in that item, in order, and is reported with its alt and size', () => {
  const { markup, images } = convertHtml(
    '<ul class="list-special">' +
      '<li><img src="images/icons/layers.png" loading="lazy" width="24" height="25" alt="">Layers first</li>' +
      '<li><a href="/x"><img class="ico" src="images/icons/globe.png" alt="Globe"></a> Linked <span>after</span></li>' +
      '<li><p><span><img src="images/icons/fi.png" width="24" height="25"></span>Wrapped deep</p></li>' +
      '<li>Text only</li>' +
      '</ul><p>After the list</p>'
  )
  const items = [...markup.matchAll(/<!-- wp:list-item -->\n(<li>[^\n]*<\/li>)\n<!-- \/wp:list-item -->/g)].map((m) => m[1])
  assert.equal(items.length, 4, markup)
  assert.equal(items[0], '<li><img src="/wp-content/uploads/layers.png" alt="" width="24" height="25">Layers first</li>', 'the icon opens its item')
  assert.equal(items[1], '<li><a href="/x"><img class="ico" src="/wp-content/uploads/globe.png" alt="Globe"></a> Linked <span>after</span></li>', 'an image inside a link stays inside it')
  assert.equal(items[2], '<li><span><img src="/wp-content/uploads/fi.png" alt="" width="24" height="25"></span>Wrapped deep</li>', 'a wrapped image is not lost')
  assert.equal(items[3], '<li>Text only</li>')
  assert.deepEqual(
    images.map((i) => [i.file, i.original, i.alt, i.width ?? null, i.height ?? null]),
    [
      ['layers.png', 'images/icons/layers.png', '', '24', '25'],
      ['globe.png', 'images/icons/globe.png', 'Globe', null, null],
      ['fi.png', 'images/icons/fi.png', '', '24', '25']
    ],
    'every list image is in the inventory, in document order'
  )
  assert.equal(block(markup, 'image'), 0, 'no stray core/image after the list')
  assert.match(markup, /<!-- wp:paragraph -->\n<p>After the list<\/p>/)
  assert.ok(checkBlockMarkup(markup).ok)
})

test('html-to-blocks: a percent-encoded image URL names the file on disk once decoded; the uploads src stays a URL (#18 item 2)', async () => {
  assert.deepEqual(rewriteImageSrc('images/joomlart/services/icons/paint%20bucket.png'), {
    src: '/wp-content/uploads/paint%20bucket.png',
    file: 'paint bucket.png',
    original: 'images/joomlart/services/icons/paint bucket.png'
  })
  assert.deepEqual(rewriteImageSrc('/images/caf%C3%A9.png?v=2#x'), {
    src: '/wp-content/uploads/caf%C3%A9.png',
    file: 'café.png', // language-allow: data: accented file name
    original: '/images/café.png' // language-allow: data: accented file name
  }, 'UTF-8 escapes decode; query and fragment go first')
  assert.deepEqual(rewriteImageSrc('images/100%2525.png'), {
    src: '/wp-content/uploads/100%2525.png',
    file: '100%25.png',
    original: 'images/100%25.png'
  }, 'decoded exactly once: an encoded percent stays a percent')
  assert.deepEqual(rewriteImageSrc('images/a b.png'), { src: '/wp-content/uploads/a%20b.png', file: 'a b.png', original: 'images/a b.png' })
  assert.deepEqual(rewriteImageSrc('images/50%zz.png'), {
    src: '/wp-content/uploads/50%25zz.png',
    file: '50%zz.png',
    original: 'images/50%zz.png'
  }, 'a broken escape is a literal name, kept as written')
  assert.equal(rewriteImageSrc('images/a%2Fb.png').original, 'images/a%2Fb.png', 'an encoded slash would move the file: kept as written')
  assert.equal(rewriteImageSrc('images/%2e%2e/x.png').original, 'images/%2e%2e/x.png', 'an encoded dot segment would leave the tree: kept as written')
  const { decodeUrlPath } = await import('../lib/html-to-blocks.mjs')
  assert.equal(decodeUrlPath?.('images/x%20y/z%23.png'), 'images/x y/z#.png')
  const { images, markup } = convertHtml('<ul><li><img src="images/joomlart/services/icons/paint%20bucket.png" width="24" height="25">Sed ut</li></ul>')
  assert.deepEqual(images.map((i) => [i.file, i.original]), [['paint bucket.png', 'images/joomlart/services/icons/paint bucket.png']])
  assert.match(markup, /src="\/wp-content\/uploads\/paint%20bucket\.png"/)
})
