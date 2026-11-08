/**
 * TracyHQ/tracy#459: an address held inside an inline-markup text slot is the slot's address.
 *
 * A WordPress button or sentence slot with `markup: "inline"` carries its link in the sample's notation
 * (`((a class="btn" href="/about"))Book((/a))`), and the Claude Cowork plugin writes the whole value, href included.
 * The page prints that href as a link, so the audit must find it in the slot instead of reporting a hole.
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { loadContract } from '../content-coverage/lib/contract.mjs'
import { createMatcher } from '../content-coverage/lib/match.mjs'

function contractDir(slots) {
  const dir = mkdtempSync(path.join(tmpdir(), 'cov-inline-'))
  mkdirSync(dir, { recursive: true })
  const put = (n, v) => writeFileSync(path.join(dir, n), JSON.stringify(v))
  put('manifest.json', { id: 'demo/wp7/1.0.0', platform: 'wordpress', theme: 'wp-demo', quickstart: {} })
  put('content-map.json', { entities: [], slots })
  put('presentation-lock.json', { files: {}, entities: {} })
  return dir
}

test('the href inside an inline markup slot matches the link the page prints', () => {
  const dir = contractDir([
    {
      key: 'home.book',
      entity: 'page-home',
      type: 'text',
      markup: 'inline',
      sample: '((a class="btn btn-primary" href="/about-us"))Book a Table((/a))'
    }
  ])
  const site = 'http://tea.invalid/'
  const match = createMatcher(loadContract(dir, site), site)
  const got = match({ kind: 'link', value: '/about-us' })
  assert.equal(got.status, 'matched')
  assert.deepEqual(got.slots, ['home.book'])
  assert.equal(match({ kind: 'link', value: 'https://elsewhere.invalid/x' }).status, 'hole')
})
