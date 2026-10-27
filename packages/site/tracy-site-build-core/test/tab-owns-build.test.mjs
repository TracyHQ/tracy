/**
 * Who owns a build the customer just answered: the Build tab, always.
 *
 * The press creates a NEW site and only the tab knows that site's key — it gets it back from the
 * fleet. The agent's `start` carries no key at all, and its job is to JOIN what the tab started.
 * That works while the tab starts first, and the tab cannot: it must wait out the site's install.
 *
 * Measured 09/09 on a local lane. A Joomla site takes minutes to install; the customer's answers
 * reached the agent seconds after the press, the agent called `start`, and — no job running yet —
 * built a job with no target. Its first stage read the SESSION's own site, found WordPress, and
 * failed with "This site runs WordPress; a Joomla site is a new site — use Add site." A sentence
 * aimed at somebody who did exactly the right thing, about a site nobody asked to build on.
 *
 * The form on disk is the signal, and it is already maintained: `ask.json` is written when the
 * agent sends the form and removed by the tab's own `start`. Still there = the tab still owes the
 * build a site, and the agent waits rather than builds. Since 09/09 that is the whole story: the
 * agent NEVER builds, whatever the platform — `host.ts` has no other road.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { joinsTabBuild, tabStillOwes } from '../src/host/host.ts'

/** A build folder, with the agent's form still on it when asked for. */
function folderAt({ ask }) {
  const root = mkdtempSync(path.join(tmpdir(), 'tab-owns-'))
  if (ask) {
    mkdirSync(path.join(root, 'docs', 'agents', 'build'), { recursive: true })
    writeFileSync(path.join(root, 'docs', 'agents', 'build', 'ask.json'), '{}')
  }
  return root
}

test('a form still on disk: the tab has not started, so the agent has nothing to join yet', () => {
  assert.equal(tabStillOwes(folderAt({ ask: true })), true)
})

test('the tab already started: its own start removed the form', () => {
  assert.equal(tabStillOwes(folderAt({ ask: false })), false)
})

test('only a job carrying the site key the tab got back is one the agent joins', () => {
  assert.equal(
    joinsTabBuild(
      { inspiration: 'airbnb', platform: 'joomla', targetSiteKey: 'x.example' },
      'airbnb',
      'joomla'
    ),
    true
  )
  assert.equal(joinsTabBuild({ inspiration: 'airbnb', platform: 'joomla' }, 'airbnb', 'joomla'), false)
  assert.equal(
    joinsTabBuild(
      { inspiration: 'apple', platform: 'joomla', targetSiteKey: 'x.example' },
      'airbnb',
      'joomla'
    ),
    false
  )
  assert.equal(joinsTabBuild(null, 'airbnb', 'joomla'), false)
})
