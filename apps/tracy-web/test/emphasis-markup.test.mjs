// The two forms of a heading's emphasis (lib/site-copy/emphasis-markup.js): real tags where the site stores HTML, codes where
// the template reads them itself. Slots and words are invented.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  codesToHtml,
  hasEmphasisCodes,
  showsRawCodes,
  storageOf,
  tagsToCodes,
  visibleText
} from '../src/lib/site-copy/emphasis-markup.js'

test('a slot inside an HTML value stores tags, one in ACM data stores codes, any other is not known', () => {
  const html = { key: 'module-7.0', column: 'params', jsonPath: ['main-section'], xpath: '/html/body/div' }
  const masthead = { key: 'module-8.2', jsonPath: ['menuitem_config', 'title', 0], xpath: '/html/body/div' }
  const acm = { key: 'module-9.0', jsonPath: ['intro', 'intro[title]', 0], nestedJson: 'jatools-config' }
  assert.equal(storageOf(html), 'html')
  assert.equal(storageOf(masthead), 'html')
  assert.equal(storageOf(acm), 'codes')
  assert.equal(storageOf({ key: 'article-3.4', column: 'attribs', jsonPath: ['sub-title'] }), 'unknown')
  assert.equal(storageOf({ key: 'module-7.1', xpath: '/html/body/div/img/@alt' }), 'unknown')
  assert.equal(storageOf({ ...acm, xpath: '/html/body/div' }), 'unknown')
  assert.equal(storageOf(undefined), 'unknown')
})

test('codes become the demo tags, and only the tags are markup', () => {
  assert.equal(codesToHtml('Lift with((br/))((span))purpose((/span))'), 'Lift with<br/><span>purpose</span>')
  assert.equal(
    codesToHtml('((span class="hl"))Calm((/span)) mornings((br class="d-none d-md-block"/))here'),
    '<span class="hl">Calm</span> mornings<br class="d-none d-md-block"/>here'
  )
  assert.equal(
    codesToHtml('Fish & chips <b>((br/))((span))Tom & Jo((/span))'),
    'Fish &amp; chips &lt;b&gt;<br/><span>Tom &amp; Jo</span>'
  )
  // A code that is not emphasis stays text.
  assert.equal(codesToHtml('((p))One((/p))'), '((p))One((/p))')
})

test('tags read back as the codes they were made from', () => {
  const codes = 'Lift with((br/))((span class="hl"))purpose((/span))'
  assert.equal(tagsToCodes(codesToHtml(codes)), codes)
  assert.equal(tagsToCodes('Our <br><span>coaches</span>'), 'Our ((br/))((span))coaches((/span))')
})

test('the visible text keeps no tag when removing one joins the pieces around it into another', () => {
  assert.equal(visibleText('<scr<script>ipt>alert(1)'), 'alert(1)')
  assert.equal(visibleText('a<scr<b>ipt>b'), 'ab')
  assert.ok(!visibleText('<scr<script>ipt>x</scr</script>ipt>').toLowerCase().includes('script'))
})

test('the visible text leaves codes and tags out and reads a break as a space', () => {
  assert.equal(visibleText('Lift with((br/))((span))purpose((/span))'), 'Lift with purpose')
  assert.equal(visibleText('Lift with<br/><span>purpose</span>'), 'Lift with purpose')
  assert.equal(visibleText('$90.00((span))/class((/span))'), '$90.00/class')
  assert.equal(visibleText('Fish &amp; chips'), 'Fish & chips')
  assert.ok(hasEmphasisCodes('A((br/))b'))
  assert.ok(!hasEmphasisCodes('Plain words'))
  assert.ok(showsRawCodes('LIFT WITH((BR/))((SPAN))PURPOSE((/SPAN))'))
  assert.ok(!showsRawCodes('Lift with purpose (since 2010)'))
})
