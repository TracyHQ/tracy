// The markup reader of a written value (ticket #597, `draft-write-tags.mjs`): one tokenizer reads tags and markers for
// both the order check and the write guard, so a value the order check lets through is never refused for its markup at
// the last guard, and a value the guard refuses never passed the order check. Each case below is what a browser runs.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-draft-write-tags.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runsCodeIn } from '../domain/draft-write-markup.mjs'
import { readTags } from '../domain/draft-write-tags.mjs'
import { markupNotDeclared } from '../domain/write-order-check-entries.mjs'

/** [case, value, the rule the guard must report, or null when the value runs nothing]. */
const CASES = [
  ['handler, mixed case', '<span OnClick="x()">a</span>', 'event_handler'],
  ['handler after a slash', '<span/onclick=x()>a</span>', 'event_handler'],
  ['handler after a line break', '<span\nonclick=x()>a</span>', 'event_handler'],
  ['handler after a quoted >', '<img src="x>" onerror=x()>', 'event_handler'],
  ['handler after a single quoted >', "<img src='a>b' onerror=x()>", 'event_handler'],
  ['handler after a quoted > in a span', '<span title="a>" onmouseover="f(1)">a</span>', 'event_handler'],
  ['handler after a backtick value', '<img src=`x` onerror=x()>', 'event_handler'],
  ['handler in an unclosed tag', 'Hello <img src=x onerror=x() ', 'event_handler'],
  ['handler in a marker', '((span onclick=x()))a((/span))', 'event_handler'],
  ['handler in a marker, a ) in its quoted value', '((span onclick="f(1)"))a((/span))', 'event_handler'],
  ['handler after an empty comment', '<!--><img src=x onerror=x()>-->', 'event_handler'],
  ['handler inside a textarea', '<textarea><img src=x onerror=x()></textarea>', 'event_handler'],
  ['handler on a closing tag', '<span>a</span onclick=x()>', 'event_handler'],
  ['javascript: split by a tab', '<a href="java\tscript:x()">a</a>', 'code_address'],
  ['javascript: split by a line break', '<a href="java\nscript:x()">a</a>', 'code_address'],
  ['javascript: split by &Tab;', '<a href="jav&Tab;ascript:x()">a</a>', 'code_address'],
  ['javascript&colon;', '<a href="javascript&colon;x()">a</a>', 'code_address'],
  ['entity with no semicolon', '<a href="&#106avascript:x()">a</a>', 'code_address'],
  ['zero padded hex entity', '<a href="&#x0000006A;avascript:x()">a</a>', 'code_address'],
  ['zero padded decimal entity, no semicolon', '<a href="&#0000106avascript:x()">a</a>', 'code_address'],
  ['leading space and control character', '<a href=" \u0001javascript:x()">a</a>', 'code_address'],
  ['vbscript:', '<a href="vbscript:x">a</a>', 'code_address'],
  ['data: an HTML document', '<a href="data:text/html;base64,PHNjcmlwdD4=">a</a>', 'code_address'],
  ['data: an SVG picture', '<img src="data:image/svg+xml;base64,PHN2Zz4=">', 'code_address'],
  ['javascript: in a marker, parens in its value', '((a href="javascript:x()"))a((/a))', 'code_address'],
  ['style expression(', '<span style="width:expression(x())">a</span>', 'code_in_attribute'],
  [
    'style expression( behind a CSS escape',
    '<span style="width:e\\78pression(x())">a</span>',
    'code_in_attribute'
  ],
  ['style url(javascript:)', '<span style="background:url(javascript:x())">a</span>', 'code_in_attribute'],
  ['srcdoc', '<iframe srcdoc="&lt;script&gt;x()&lt;/script&gt;"></iframe>', 'code_element'],
  ['formaction', '<button formaction="javascript:x()">a</button>', 'code_in_attribute'],
  ['SVG href', '<svg><a href="javascript:x()">a</a></svg>', 'code_element'],
  ['xlink:href', '<a xlink:href="javascript:x()">a</a>', 'code_address'],
  ['meta refresh', '<meta http-equiv="refresh" content="0;url=javascript:x()">', 'code_element'],
  ['base', '<base href="https://example.test/">', 'code_element'],
  [
    'noscript breakout',
    '<noscript><p title="</noscript><img src=x onerror=x()>"></noscript>',
    'event_handler'
  ],
  ['a marker the reader cannot read', 'Fresh ((span onclick=f(1) stems', 'marker_unread'],
  ['a stray closing marker', 'Fresh stems))', 'marker_unread'],
  ['a data: PNG picture', '<img src="data:image/png;base64,AAAA">', null],
  ['an emphasis span', 'Fresh <span class="a">stems</span>', null],
  ['a plain link', '<a href="https://example.test/a">Go</a>', null],
  ['a title holding a >', '<span title="a>b">Go</span>', null],
  ['plain words with "on" and an equals sign', 'Learn the basics: on=time', null]
]

test('the guard reads every case as a browser runs it', () => {
  for (const [name, value, rule] of CASES) {
    const rules = runsCodeIn(value)
    if (rule) assert.ok(rules.includes(rule), `${name}: ${JSON.stringify(rules)}`)
    else assert.deepEqual(rules, [], name)
  }
})

test('the order check refuses every value the guard refuses, in an html field and in a codes field', () => {
  const declared = (write) => ({
    inline: {
      write,
      emphasis: [{ tag: 'span', attrs: '' }, { tag: 'a', attrs: '' }, { tag: 'br' }],
      wrapper: []
    }
  })
  for (const [name, value, rule] of CASES)
    for (const write of ['html', 'codes'])
      if (rule)
        assert.notEqual(markupNotDeclared({ value, declared: declared(write) }), null, `${name} (${write})`)
})

test('a quoted > or ) is part of the value; a marker ends at )) outside quotes', () => {
  const [tag] = readTags('<span title="a>b" class=c>x</span>').tags
  assert.deepEqual(
    tag.attrs.map((a) => [a.name, a.value]),
    [
      ['title', 'a>b'],
      ['class', 'c']
    ]
  )
  const read = readTags('((span title="f(1)"))x((/span))')
  assert.deepEqual(
    read.tags.map((t) => [t.form, t.name, t.close]),
    [
      ['marker', 'span', false],
      ['marker', 'span', true]
    ]
  )
  assert.equal(read.tags[0].attrs[0].value, 'f(1)')
  assert.equal(read.strays, 0)
  assert.equal(readTags('a (( b').strays, 1)
})
