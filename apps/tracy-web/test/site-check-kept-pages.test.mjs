// Which pages the site check opens, and whose words judge a demo heading. Every fixture is invented.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { keptPaths, writtenWords } from '../src/site-check/host-pages.js'
import { findDeadLinks } from '../src/site-check/page-measures.js'
import { checkNoDemoWords, textKey } from '../../tracy-host/src/demo-qa.js'

const inspect = {
  pages: [{ route: 'home' }, { route: 'halls' }, { route: 'old-offers' }, { route: 'pages/users' }]
}

test('with the kept pages on the report, only those are opened, whatever routes the site still lists', () => {
  const report = {
    keptPages: [
      { id: 'page-home', path: '/' },
      { id: 'page-halls', path: '/halls' }
    ]
  }
  assert.deepEqual(keptPaths(inspect, report), ['/', '/halls'])
})

test('a report without them still opens what the site lists', () => {
  assert.deepEqual(keptPaths(inspect, {}), ['/', '/halls', '/old-offers', '/pages/users'])
})

test('a kept page that answers 404 stays red', () => {
  const failures = findDeadLinks([{ path: '/halls', status: 404 }], [])
  assert.equal(failures.length, 1)
  assert.match(failures[0].reason, /kept page does not answer/)
})

test('addresses and markup a run wrote are not words the site says', () => {
  const report = {
    slots: [
      { status: 'written', ordered: 'Rowing for every age' },
      { status: 'written', ordered: '/index.php/halls/lantern-rowing' },
      { status: 'written', ordered: 'https://example.test/lantern-page/' },
      { status: 'written', ordered: 'index.php?option=com_lantern' },
      { status: 'written', ordered: '<link rel="stylesheet" href="https://fonts.example.test/lantern">' },
      { status: 'written', ordered: 'images/tracy-content/lantern.jpg' }
    ]
  }
  const words = writtenWords(report)
  assert.equal(words.briefProse, 'Rowing for every age')
  assert.deepEqual(words.placed, ['images/tracy-content/lantern.jpg'])
})

test('a demo heading whose words the run only wrote in a link address is still demo', () => {
  const report = {
    slots: [
      { status: 'written', ordered: 'Rowing for every age' },
      { status: 'written', ordered: '/index.php/halls/lantern-rowing' }
    ]
  }
  const shown = 'Lantern Rowing'
  const verdict = checkNoDemoWords(
    [
      {
        path: '/halls/one',
        blocks: [{ text: shown, selector: 'div.title-has-highlight', short: true }],
        text: shown
      }
    ],
    {
      baseline: { texts: [textKey(shown)], labels: [] },
      briefProse: writtenWords(report).briefProse,
      briefText: writtenWords(report).briefProse
    }
  )
  assert.equal(verdict.pass, false)
  assert.equal(verdict.detail[0].words, 'lantern rowing')
})
