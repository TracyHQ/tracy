import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { templateTokens } from '../../../site/tracy-site-build-emdash/src/host/template-design.mjs'
import { designLine } from '../src/host/site-context.mjs'

const theme = new URL('../../../cms/tracy-emdash-theme-business/src/', import.meta.url)
const tokens = templateTokens(
  readFileSync(new URL('styles/tokens.css', theme), 'utf8'),
  readFileSync(new URL('fonts.json', theme), 'utf8')
)

test("an EmDash site's line names its template's colours and stays inside the context budget", () => {
  const line = designLine({
    schemaVersion: 'tracy-site-design/v1',
    id: 'tracy-business',
    source: 'quickstart',
    name: 'Tracy Business',
    bound: true,
    platform: 'emdash',
    tokens
  })
  assert.ok(line)
  assert.match(line, /Design system: Tracy Business \(`tracy-business`, quickstart/)
  assert.match(line, /colour: --color-/)
  assert.match(line, /\+\d+ more/)
  assert.match(line, /Tailwind class/)
  assert.ok(Buffer.byteLength(line) <= 1400, `${Buffer.byteLength(line)} bytes`)
})
