import assert from 'node:assert/strict'
import { test } from 'node:test'
import { pageSlots } from '../scripts/capture-contract.mjs'
import { markupProblem, notationOf, wordsOf } from '../scripts/inline-markup.mjs'

const block = (type, name, inner, extra = '') =>
  `<!-- wp:${type} {"metadata":{"name":"${name}"}${extra}} -->\n${inner}\n<!-- /wp:${type} -->`
const para = (name, html, cls = '') =>
  block('paragraph', name, `<p${cls ? ` class="${cls}"` : ''}>${html}</p>`)
const heading = (name, html) => block('heading', name, `<h2 class="wp-block-heading">${html}</h2>`)

test('inner HTML reads in the content map notation, as the Claude Cowork plugin reads it', () => {
  assert.equal(
    notationOf('Lemon Rice Bowl <span class="price">$12</span>'),
    'Lemon Rice Bowl ((span class="price"))$12((/span))'
  )
  assert.equal(
    notationOf('Our <span class="text-accent">Menu</span><br>this season'),
    'Our ((span class="text-accent"))Menu((/span))((br/))this season'
  )
  assert.equal(
    notationOf('Book <a class="btn-link" href="/book/?a=1&amp;b=2">now</a> &amp; save'),
    'Book ((a class="btn-link" href="/book/?a=1&b=2"))now((/a)) & save'
  )
  assert.equal(
    notationOf('A <em title=\'x "y"\'>word</em><br />'),
    'A ((em title="x &quot;y&quot;"))word((/em))((br/))'
  )
  assert.equal(
    wordsOf('Our ((span class="text-accent"))Menu((/span))((br/))this season'),
    'Our Menuthis season'
  )
})

test('only what the plugin writes back is a marked-up value', () => {
  assert.equal(markupProblem('Bowl ((span class="price"))$12((/span))'), null)
  assert.equal(
    markupProblem(
      '((strong))A((/strong)) ((em))b((/em)) ((b))c((/b)) ((i))d((/i)) x((sup))2((/sup))((sub))3((/sub))((br/))'
    ),
    null
  )
  assert.equal(
    markupProblem('((a href="https://example.com/x" target="_blank" rel="noopener"))go((/a))'),
    null
  )
  assert.equal(markupProblem('((div))x((/div))'), 'tag div')
  assert.equal(markupProblem('((span style="color:red"))x((/span))'), 'attribute style on span')
  assert.equal(markupProblem('((strong class="big"))x((/strong))'), 'attribute class on strong')
  assert.equal(markupProblem('((a href="javascript:void"))x((/a))'), 'link javascript:void')
  assert.equal(markupProblem('((a href="/x" target="_top"))x((/a))'), 'target _top')
  assert.equal(markupProblem('((a href="/x"))x((/a))', { button: true }), 'link inside a link')
  assert.equal(markupProblem('((span))x'), 'unbalanced')
  assert.equal(markupProblem('x ((span title="a (b)"))'), 'unreadable')
})

test('--inline-markup makes a marked-up named block a slot that keeps its markup; off, it stays left out', () => {
  const content = [
    heading('menu.title', 'Our <span class="text-accent">Menu</span><br>this season'),
    para('dish.one', 'Lemon Rice Bowl <span class="price">$12</span>', 'dish'),
    para('menu.cta', 'Book a table <a class="btn-link" href="/reservation/">today</a>.'),
    para('menu.styled', 'Big <span style="font-size:3em">deal</span>'),
    para('menu.note', 'Open daily.')
  ].join('\n\n')
  const off = pageSlots({ content, entityKey: 'page-menu', prefix: 'menu' })
  assert.deepEqual(
    off.slots.map((s) => s.key),
    ['menu.menu.note']
  )
  assert.equal(off.skipped.filter((s) => /inline markup/.test(s)).length, 4)

  const on = pageSlots({ content, entityKey: 'page-menu', prefix: 'menu', inlineMarkup: true })
  assert.deepEqual(
    on.slots.map((s) => [s.key, s.type, s.markup ?? null, s.sample]),
    [
      [
        'menu.menu.title',
        'text',
        'inline',
        'Our ((span class="text-accent"))Menu((/span))((br/))this season'
      ],
      ['menu.dish.one', 'text', 'inline', 'Lemon Rice Bowl ((span class="price"))$12((/span))'],
      [
        'menu.menu.cta',
        'text',
        'inline',
        'Book a table ((a class="btn-link" href="/reservation/"))today((/a)).'
      ],
      ['menu.menu.note', 'text', null, 'Open daily.']
    ]
  )
  assert.equal(
    on.slots[1].maxCharacters,
    Math.max(80, 'Lemon Rice Bowl $12'.length * 2 + 20),
    'the limit is counted on the words'
  )
  assert.deepEqual(on.skipped, [
    'page-menu:menu.styled (inline markup the plugin cannot write: attribute style on span)'
  ])
})
