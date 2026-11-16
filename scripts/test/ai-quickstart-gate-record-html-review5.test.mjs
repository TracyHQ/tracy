// The review page says no more than was measured (ticket #586, review 5, the lines it found misleading on run 5), on
// invented records: a place reached by one probe is not a place tested with every probe, and the pairs never tried
// are counted; places untested by a finding say so; a page that judged a finding is named, never "isolated by
// trials"; a build refusal names the value its refusal names; the hidden variant says which unplanned links reach
// the category list of a hidden page.
import assert from 'node:assert/strict'
import test from 'node:test'
import { measurementLines, measurementsHtml } from '../ai-quickstart/gate/record-html-measures.mjs'

const lineOf = (key, m) => measurementLines({ [key]: m }).find((l) => l.key === key).line
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
const WS = {
  status: 'failed',
  places: { written: 6, probed: 4, tested: 3 },
  passes: [{ pass: 1 }, { pass: 2 }],
  missing: [
    { place: 'a', probe: 'tag' },
    { place: 'a', probe: 'empty' },
    { place: 'b', probe: 'tag' }
  ],
  findings: [
    {
      kind: 'markup_injected',
      probe: 'loadposition',
      place: 'b',
      page: 'news-post',
      storeBlock: 'news-post',
      field: 'heading',
      location: { op: 'article:post-7', slot: 'article-6.1' },
      evidence: 'page',
      judgedOn: 'news-post',
      pass: 1
    },
    {
      kind: 'refused_by_build',
      code: 'page_copy_check',
      probe: 'tag',
      place: 'c',
      page: 'home',
      field: 'heading',
      evidence: 'named_alone',
      pass: 1
    },
    {
      kind: 'door_refused',
      probe: 'link-quote',
      place: 'd',
      page: 'home',
      field: 'button-link',
      location: { op: 'contract:store:module-2', slot: 'module-2.0' },
      evidence: 'named_alone',
      pass: 2
    }
  ],
  ends: { tested: 3, refused: 0, untested: [{ place: 'd', why: 'probes_left' }], parkedTested: 2 }
}

test('review 5: one probe reaching a place is not every probe tried there, and the untried pairs are counted', () => {
  const line = lineOf('writeSafety', WS)
  assert.doesNotMatch(line, /values reached the site at 3 of 4 places given a probe/)
  assert.match(line, /3 of 4 places given a probe had at least one probe reach the site/)
  // Review 7 S6: pairs are counted by the class they ended in; this record keeps no ledger, so only the untried ones.
  assert.doesNotMatch(line, /had a result for every probe/)
  assert.match(line, /3 \(place, probe\) pairs never tried, at 2 places/)
  assert.match(line, /1 place untested \(1 named by a finding, its other probes never tried\)/)
  assert.match(line, /2 tested places set aside in a later pass, their later probes never tried/)
})

test('review 5: a finding judged on a page names the page; a build refusal names the value its refusal names', () => {
  const html = text(measurementsHtml({ writeSafety: WS }))
  assert.doesNotMatch(html, /isolated by trials/)
  assert.match(html, /seen on the page news-post/)
  assert.match(html, /the only probed value the refusal names/)
  assert.match(html, /the only probed value stored where the site stopped/)
})

test('Z6: the hidden variant says which unplanned links reach a category list or a doubled address', () => {
  const v = {
    status: 'passed',
    broken: [],
    unplanned: [
      { href: '/index.php?view=category&id=8' },
      { href: '/index.php?view=category&id=9' },
      { href: '/index.php/index.php/qxabc/author/admin' }
    ]
  }
  const line = lineOf('structure', { status: 'passed', linkCheck: { status: 'passed' }, hidden: v })
  assert.match(line, /no link leads to a hidden page's own address/)
  assert.match(
    line,
    /3 links reach a page the plan has not got \(recorded only: 2 a category list, which hiding a page does not hide; 1 a doubled index\.php address\)/
  )
})
