// Replace the words, never the style (spec TracyHQ/tracy#189): the demo's inline tags rebuilt around the new words.
// Fictional templates and businesses of two trades: a bakery and a dental clinic.
import assert from 'node:assert/strict'
import test from 'node:test'
import { applyInlineStyle, inlineStylePattern, keepsInlineStyle, unmarked } from '../domain/inline-style.mjs'

test('plain words carry no pattern', () => {
  assert.equal(inlineStylePattern('Fresh bread every morning'), null)
  assert.equal(inlineStylePattern(''), null)
})

test('markup that is not inline (a link, a picture) is not a style pattern', () => {
  assert.equal(inlineStylePattern('Call <a href="tel:1">us</a> today'), null)
  assert.equal(inlineStylePattern('Our <img src="x.png"> oven'), null)
})

test('a bakery heading: the writer marks its key word and the demo span comes back with its class', () => {
  const pattern = inlineStylePattern('OUR <span class="accent">BREADS</span>')
  assert.ok(pattern)
  assert.equal(pattern.hint, 'OUR [[BREADS]]')
  assert.deepEqual(pattern.positions, ['last'])
  const out = applyInlineStyle(pattern, 'DAILY [[LOAVES]]')
  assert.equal(out.value, 'DAILY <span class="accent">LOAVES</span>')
  assert.equal(out.plain, 'DAILY LOAVES')
  assert.equal(out.by, 'marks')
})

test('a dental clinic heading with a break: the break and the strong come back where the writer put them', () => {
  const pattern = inlineStylePattern('Smile<br><strong>brighter</strong>')
  assert.ok(pattern)
  assert.equal(pattern.hint, 'Smile[[br]][[brighter]]')
  const out = applyInlineStyle(pattern, 'Gentle care[[br]][[for every family]]')
  assert.equal(out.value, 'Gentle care<br><strong>for every family</strong>')
})

test('marks with no break keep the demo break before the styled part', () => {
  const pattern = inlineStylePattern('THE<br/>\r\n<span>MENU</span>')
  assert.ok(pattern)
  assert.equal(applyInlineStyle(pattern, 'OUR [[CAKES]]').value, 'OUR<br/> <span>CAKES</span>')
})

test('no marks: the style goes on by position (the last word, the break before it)', () => {
  const bakery = inlineStylePattern('THE<br/>\r\n<span>MENU</span>')
  assert.ok(bakery)
  const plainOut = applyInlineStyle(bakery, 'WHAT WE BAKE')
  assert.equal(plainOut.value, 'WHAT WE<br/> <span>BAKE</span>')
  assert.equal(plainOut.by, 'position')
  const dental = inlineStylePattern('<b>Healthy</b> smiles start here')
  assert.ok(dental)
  assert.deepEqual(dental.positions, ['first'])
  assert.equal(applyInlineStyle(dental, 'Calm visits for children').value, '<b>Calm</b> visits for children')
})

test('marks that do not fit the pattern fall back to position, never to plain words', () => {
  const pattern = inlineStylePattern('OUR <span class="accent">BREADS</span>')
  assert.ok(pattern)
  const out = applyInlineStyle(pattern, '[[FRESH]] [[SOURDOUGH]] DAILY')
  assert.equal(out.by, 'position')
  assert.equal(out.value, 'FRESH SOURDOUGH <span class="accent">DAILY</span>')
  assert.ok(keepsInlineStyle(pattern, out.value))
})

test('a middle key phrase keeps its place among the words', () => {
  const pattern = inlineStylePattern('Baked <em>with love</em> every day')
  assert.ok(pattern)
  assert.deepEqual(pattern.positions, ['middle'])
  assert.equal(
    applyInlineStyle(pattern, 'Rolls [[made by hand]] each morning').value,
    'Rolls <em>made by hand</em> each morning'
  )
})

test('a break inside a sentence is kept at the same share of the words', () => {
  const pattern = inlineStylePattern('Our ovens are warm before dawn, <br>\r\nso your bread is too')
  assert.ok(pattern)
  assert.equal(pattern.styled.length, 0)
  const out = applyInlineStyle(pattern, 'We open early on weekdays and close late on Fridays')
  // The demo's spaces around the break stay: a narrow screen that hides the break still shows a gap between the words.
  assert.equal(out.value, 'We open early on weekdays <br> and close late on Fridays')
})

test('JA ACM marker fields stay in marker form, so the contract door takes them as words', () => {
  const pattern = inlineStylePattern('((span))BEST((/span)) BAKERY in town')
  assert.ok(pattern)
  assert.equal(pattern.form, 'acm')
  assert.equal(pattern.hint, '[[BEST]] BAKERY in town')
  const out = applyInlineStyle(pattern, '[[WARM]] LOAVES every morning')
  assert.equal(out.value, '((span))WARM((/span)) LOAVES every morning')
  assert.doesNotMatch(out.value, /[<>]/)
  assert.equal(
    applyInlineStyle(pattern, 'Friendly dentists near you').value,
    '((span))Friendly((/span)) dentists near you'
  )
})

test('a malicious marker or markup from the writer is escaped or dropped: only the demo tags are written', () => {
  const pattern = inlineStylePattern('OUR <span class="accent">BREADS</span>')
  assert.ok(pattern)
  const out = applyInlineStyle(
    pattern,
    'OUR [[<img src=x onerror=alert(1)>CAKES" onclick="x]] <script>alert(2)</script>'
  )
  assert.doesNotMatch(out.value, /<img|<script|onerror/i)
  assert.match(out.value, /<span class="accent">CAKES&quot; onclick=&quot;x<\/span>/)
  const tags = [...out.value.matchAll(/<\/?([a-z]+)/gi)].map((m) => m[1].toLowerCase())
  assert.ok(tags.every((t) => t === 'span'))
  const acm = inlineStylePattern('((span))BEST((/span)) BAKERY')
  assert.ok(acm)
  const sneaky = applyInlineStyle(acm, '[[((script))x((/script))]] <b>BAKERY</b>')
  assert.doesNotMatch(sneaky.value, /script|<|\(\(b\)\)/)
})

test('unmarked reads the words a visitor sees', () => {
  assert.equal(unmarked('WHAT WE [[br]][[BAKE]]'), 'WHAT WE BAKE')
  assert.equal(unmarked('Fresh <b>rolls</b>'), 'Fresh rolls')
})

test('keepsInlineStyle tells a stored value that lost the style', () => {
  const pattern = inlineStylePattern('Smile<br><strong>brighter</strong>')
  assert.ok(pattern)
  assert.equal(keepsInlineStyle(pattern, 'Gentle care for every family'), false)
  assert.equal(keepsInlineStyle(pattern, 'Gentle care<br><strong>for every family</strong>'), true)
})

test('C20: a styled slot whose stored value lost the style is reported; one that kept it, or was not read back, is not', async () => {
  const { checkDemoLeftovers } = await import('../domain/demo-leftovers.mjs')
  const bakery = inlineStylePattern('OUR<br/><span class="accent">BREADS</span>')
  const dental = inlineStylePattern('Smile<br><strong>brighter</strong>')
  const contentMap = {
    slots: [
      { key: 'module-7.0', entity: 'module-7', type: 'text', sample: 'OUR BREADS', inlineStyle: bakery },
      {
        key: 'article-9.0',
        entity: 'article-9',
        type: 'text',
        sample: 'Smile brighter',
        inlineStyle: dental
      },
      { key: 'module-8.0', entity: 'module-8', type: 'text', sample: 'Since 1990', inlineStyle: bakery }
    ],
    pages: [{ entity: 'menuItem-1', route: 'home', assignedModules: [{ entity: 'module-7' }] }]
  }
  const report = checkDemoLeftovers({
    pages: [{ path: '/', status: 200, html: '<h2>FRESH LOAVES</h2>' }],
    contentMap,
    styleReadback: {
      'module-7.0': 'FRESH LOAVES',
      'article-9.0': 'Gentle care<br><strong>for every family</strong>'
    }
  })
  const c20 = report.findings.filter((f) => f.kind === 'C20')
  assert.deepEqual(c20, [{ kind: 'C20', page: '/home', place: 'module-7.0', found: 'FRESH LOAVES' }])
  assert.equal(report.counts.C20, 1)
})

test('a marked run before a comma or a full stop leaves no space before it', () => {
  const pattern = inlineStylePattern('((span))FRESH((/span)) BREAD in Ashby')
  const out = applyInlineStyle(pattern, 'One bakery for the [[whole street]], in Ashby')
  assert.equal(out.value, 'One bakery for the ((span))whole street((/span)), in Ashby')
  assert.equal(out.plain, 'One bakery for the whole street, in Ashby')
  assert.equal(unmarked('Baked by [[hand]].'), 'Baked by hand.')
  const html = applyInlineStyle(inlineStylePattern('OUR <em>BREADS</em>'), 'Our [[loaves]]; warm')
  assert.equal(html.value, 'Our <em>loaves</em>; warm')
})
