import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const css = readFileSync(new URL('../src/client/site-tabs-rules.css', import.meta.url), 'utf8')

test('Site changes: Jump to backup and the Type filter wrap instead of leaving a narrow panel (24/10/2026)', () => {
  // German and Dutch "Typ: Personen und Tracy" ran off the right edge at 390px: the tools never shrank.
  const rule = /\.tracy-site-tabs \.tv-changes-page \.tv-changes-tools \{([^}]*)\}/.exec(css)
  assert.ok(rule, 'a page rule for the tools')
  assert.match(rule[1], /flex: 0 1 auto;/)
  assert.match(rule[1], /flex-wrap: wrap;/)
  assert.match(rule[1], /min-width: 0;/)
  assert.match(rule[1], /max-width: 100%;/)
})
