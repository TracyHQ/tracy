// The site part reads every page the capture shot unless a cap is asked for: a silent cap left pages without their
// main heading, so their title slots read as "the site part did not read this page".
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { pagesToRead } from '../template-kit/site-cli.mjs'

const capture = {
  pages: Array.from({ length: 85 }, (_, i) => ({
    path: i ? `/page-${i}` : '/',
    slug: i ? `page-${i}` : 'home'
  }))
}

test('the site part reads all 85 captured pages by default, as the capture does', () => {
  assert.equal(pagesToRead({}, capture).length, 85)
})

test('an asked cap still cuts the list', () => {
  assert.equal(pagesToRead({}, capture, 60).length, 60)
})
