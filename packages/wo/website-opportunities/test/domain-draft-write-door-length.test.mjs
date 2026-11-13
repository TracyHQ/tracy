// The door's own length (ticket #597): `doorLength` gives what the Claude Cowork plugin's PHP gives
// (`SlotFit::slotLength`), on hand picked cases and on a generated corpus whose lengths the plugin printed
// (`fixtures/draft-write-door-length.json`, with the plugin version it was taken from). A guard that counted fewer
// would pass a value the door refuses; one that counted more would refuse a value the door takes.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-draft-write-door-length.test.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { doorLength, phpEntityDecode } from '../domain/draft-write-door-length.mjs'

const text = { type: 'text', column: 'introtext' }
const raw = { type: 'text', column: 'title' }

/** [case, value, the plugin's count for a text slot] as the plugin's PHP printed them. */
const CASES = [
  ['an HTML5 name missing from a short table', 'We &hearts; roses', 10],
  ['an arrow', 'Next &rarr;', 6],
  ['a fraction', '&frac12; price', 7],
  ['an upper case quote name', '&QUOT;hi&QUOT;', 4],
  ['a legacy name without its semicolon stays', 'Fish &amp chips', 15],
  ['NUL by number stays', 'x&#0;y', 6],
  ['a C1 control by number stays', 'x&#128;y', 8],
  ['a surrogate by number stays', 'x&#xD800;y', 10],
  ['a made up letter name stays', 'q&qacute;x', 10],
  ['a no-break space inside a tag: not a tag to PHP', 'Big <span class="a">bloom</span>', 25],
  ['an em space inside a tag', 'a<br />b', 8],
  ['a run of em spaces is one space', 'a   b', 3],
  ['a run of ideographic spaces', '花 　 店', 3],
  ['a byte order mark stays', '﻿Hello', 6],
  ['a next line is white space', 'a\u0085b', 3],
  ['tags out, an inline one adds nothing', 'Big <span class="a">bloom</span><br>today', 15],
  ['markers out', 'Big ((span))bloom((/span))((br))today', 15]
]

test('doorLength counts the hand picked cases as the plugin does', () => {
  for (const [name, value, want] of CASES) assert.equal(doorLength(text, value), want, name)
  assert.equal(doorLength(raw, 'Fish &amp; chips'), 16)
  assert.equal(doorLength({ type: 'link', column: 'params' }, '&hearts;'), 8)
})

test('doorLength agrees with the plugin on every string of the generated corpus', () => {
  const fixture = JSON.parse(
    readFileSync(new URL('./fixtures/draft-write-door-length.json', import.meta.url))
  )
  assert.match(fixture.plugin, /0\.24\.85/)
  assert.ok(fixture.cases.length >= 300)
  const differ = fixture.cases.filter(
    ([column, type, value, length]) => doorLength({ type, column }, value) !== length
  )
  assert.deepEqual(differ, [])
})

test('phpEntityDecode reads a reference only with its semicolon and only a character HTML5 allows', () => {
  assert.equal(phpEntityDecode('&#65;&#x41;&#0065;&#X41;'), 'AAAA')
  for (const kept of [
    '&#65',
    '&# 65;',
    '&#x;',
    '&Amp;',
    '&#13;',
    '&#127;',
    '&#xFFFE;',
    '&#99999999999999999999;'
  ])
    assert.equal(phpEntityDecode(kept), kept)
  assert.equal(phpEntityDecode('&NotEqualTilde;').length, 2)
})
