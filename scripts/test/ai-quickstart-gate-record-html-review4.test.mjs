// The review page tells the truth about what run 4 of JA Boxing showed it saying wrong (ticket #586, review 4), on
// invented records: a write safety that failed and then ran out of site steps says both, with the stop it left
// untraced and the places it left untested; each finding names its item and where it was stored (X7).
import assert from 'node:assert/strict'
import test from 'node:test'
import { measurementLines, measurementsHtml } from '../ai-quickstart/gate/record-html-measures.mjs'

const lineOf = (key, m) => measurementLines({ [key]: m }).find((l) => l.key === key).line
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
const FAILED_SHORT = {
  status: 'failed',
  incomplete: 'steps',
  places: { written: 40, probed: 30, tested: 0 },
  passes: [{ pass: 1 }],
  findings: [
    {
      kind: 'door_refused',
      probe: 'other-scripts',
      place: 'service-6.name',
      page: 'home',
      block: 'home-b6',
      storeBlock: 'block-160',
      field: 'name',
      item: '2',
      location: { op: 'article:service-6', column: 'title', slot: 'article-14.4' },
      evidence: 'named_alone',
      pass: 1
    },
    {
      kind: 'stop_not_traced',
      class: 'door_refused',
      code: 'read_back_mismatch',
      op: 'article:post-8',
      culprit: 'not_traced',
      suspects: 12,
      why: 'steps',
      pass: 1
    }
  ],
  ends: {
    tested: 0,
    refused: 1,
    untested: [
      ...Array.from({ length: 12 }, (_, i) => ({ place: 's' + i, why: 'suspect_of_untraced_stop' })),
      ...Array.from({ length: 17 }, (_, i) => ({ place: 'p' + i, why: 'no_pass_reached_it' }))
    ]
  }
}

test('X4: a failed write safety that ran out of steps says so, with its untraced stop as a floor', () => {
  const ws = lineOf('writeSafety', FAILED_SHORT)
  assert.match(ws, /^Failed: /)
  assert.match(
    ws,
    /at least 2 values a customer could type broke a page or the site refused it \(1 traced to a field, 1 stop left untraced\)/
  )
  assert.match(
    ws,
    /29 places untested \(12 set aside as suspects of a stop no step was left to trace, 17 no pass reached them\)/
  )
  assert.match(ws, /the measurement then stopped: it ran out of site steps/)
})

test('X7: a write safety finding names its item and where it was stored; an untraced stop names its operation', () => {
  const page = text(measurementsHtml({ writeSafety: FAILED_SHORT }))
  assert.match(page, /Item Stored at/)
  assert.match(
    page,
    /home block-160 name 2 article:service-6 article-14\.4 other-scripts The site refused it the only probed value stored where the site stopped/
  )
  assert.match(
    page,
    /article:post-8 not traced \(12 suspects\) The write stopped here; no step was left to name the field \(The site refused it\)/
  )
})

test('X1 and line 3: structure says planned articles at another address apart, and a variant that did not finish says what it read', () => {
  const st = lineOf('structure', {
    status: 'failed',
    linkCheck: {
      status: 'incomplete',
      reason: 'items_not_at_shape',
      broken: [],
      unplanned: [{ href: '/index.php/x' }],
      elsewhere: Array.from({ length: 22 }, () => ({ href: '/index.php/a/b' }))
    },
    minItems: { status: 'passed', broken: [], errors: [], elsewhere: [{ href: '/index.php/c/d' }] },
    hidden: { status: 'failed', broken: [{ href: '/index.php/qxatg', target: 'news' }] }
  })
  assert.match(
    st,
    /all items: not finished, .*; 1 link reaches a page the plan has not got \(recorded only\); 22 links reach a planned page at another menu address \(recorded only\)/
  )
  assert.match(
    st,
    /fewest items: every page answers and no link is broken; 1 link reaches a planned page at another menu address/
  )
  const page = text(
    measurementsHtml({
      structure: {
        status: 'failed',
        hidden: {
          status: 'failed',
          broken: [
            {
              page: 'home',
              href: '/index.php/qxatg',
              kind: 'missing_page',
              target: 'news',
              hidden: ['news', 'about']
            }
          ]
        }
      }
    })
  )
  assert.match(page, /home \/index\.php\/qxatg news news, about/)
})

test('lines 5 to 7: leaks and requests in their own units, the allowed secrets listed, and the blank site 500s said', async () => {
  const { recordHtml } = await import('../ai-quickstart/gate/record-html.mjs')
  const { blankControlOf } = await import('../ai-quickstart/gate/verdict.mjs')
  const request = (host) => ({ group: 'outside_request', value: 'https://' + host + '/x', page: 'home' })
  const blank = blankControlOf([
    { path: 'index.php', status: 404 },
    { path: 'index.php?option=com_users&view=login', status: 500 },
    { path: 'index.php?option=com_finder&view=search', status: 500 },
    { path: 'index.php/qx-no-such-page', status: 404, expected: 404 }
  ])
  assert.match(blank.reason, /not judged/)
  assert.match(blank.reason, /2 addresses answer a server error \(500\)/)
  assert.doesNotMatch(blank.reason, /serves no page by design/)
  const page = text(
    recordHtml({
      verdict: { pass: false, failing: ['leaks'], notRun: [], leaks: 3, demoFindings: 0, unexplained: 0 },
      universe: {},
      markerTest: {
        groups: [{ group: 'unmarked_text' }, { group: 'outside_request' }, { group: 'outside_request' }],
        findings: [
          { group: 'unmarked_text' },
          request('fonts.example'),
          request('fonts.example'),
          request('cdn.example')
        ],
        notSeen: []
      },
      demoScan: { controls: { blank } },
      measurements: {
        secrets: {
          status: 'passed',
          findings: [],
          allowed: [
            {
              file: 'kit/blank-site-contract/presentation-lock.json',
              at: 'line:12',
              rule: 'gitleaks:generic-api-key',
              fingerprint: 'abcdefabcdef',
              why: 'a file hash, no secret'
            }
          ],
          control: { status: 'right' }
        }
      }
    })
  )
  assert.match(
    page,
    /3 leak\(s\) in 1 group\(s\), plus 2 group\(s\) of requests to other sites \(3 request\(s\)\)/
  )
  assert.match(page, /1 finding the kit(?:'|&#39;)s allow file allows, listed below with its reason/)
  assert.match(
    page,
    /kit\/blank-site-contract\/presentation-lock\.json line:12 gitleaks:generic-api-key abcdefabcdef a file hash, no secret/
  )
})
