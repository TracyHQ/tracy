// Where the documentation sends a person for a seat key (#795, F-S2-001).
//
// The cowork host has no "Settings › API keys" screen: no client of any surface calls
// `/api/me/keys`. The Bruno README, the error table and the API reference still named that screen,
// so a reader followed them to something that is not there. What exists is the door
// (`src/keys/route.js`), and that is the only place the guidance may point.
//
// These tests read the three sources as they are served: the README file, `ERROR_DOCS`, and every
// document `buildOpenApi` builds (cowork, internal, api host). Nothing is fetched and no database
// is involved; whether a deployment serves these documents unchanged is not measured here.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { ERROR_DOCS } from '../src/api-reference/errors.js'
import { buildOpenApi } from '../src/api-reference/spec.js'
import { APPLY_ACTIONS, applyToolsetLabel } from '../src/sites/route.js'

/** "Settings › API keys", "Settings → API keys", "Settings > API keys", "Settings / API keys". */
const SCREEN = /settings\s*(?:›|→|»|>|&gt;|\/|-+>?|,)?\s*api[\s-]*keys?/i
const DOOR = 'POST /api/me/keys'

const README = readFileSync(new URL('../bruno/README.md', import.meta.url), 'utf8')
const documents = {
  cowork: {},
  internal: { internal: true },
  'api host': { publicApi: true }
}
const built = (variant) =>
  JSON.stringify(
    buildOpenApi({
      origin: 'https://tracy.example',
      applyActions: APPLY_ACTIONS,
      toolsetOf: applyToolsetLabel,
      ...variant
    })
  )

test('F-S2-001: the pattern recognises every way the screen was written', () => {
  for (const said of [
    'Settings › API keys',
    'Settings → API keys',
    'Settings > API keys',
    'settings &gt; API key',
    'Settings -> API keys',
    'Settings, API keys'
  ])
    assert.match(said, SCREEN, said)
  for (const said of ['POST /api/me/keys', 'the viewer’s API keys', 'enable API keys'])
    assert.doesNotMatch(said, SCREEN, said)
})

test('F-S2-001: the Bruno README mints a seat key through the door, not a screen that does not exist', () => {
  assert.doesNotMatch(README, SCREEN)
  assert.ok(README.includes(DOOR), 'the README still says how to mint a key')
  // The door is a cookie door on the cowork host: the README has to say what the call needs.
  const section = README.slice(README.indexOf('## The `/v1` folder'))
  assert.match(section, /cowork host/)
  assert.match(section, /signed[\s-]in|session/i)
  assert.match(section, /Origin/)
})

test('F-S2-001: no refusal in the error table sends the caller to that screen', () => {
  for (const doc of ERROR_DOCS)
    for (const field of ['meaning', 'next'])
      assert.doesNotMatch(String(doc[field] ?? ''), SCREEN, `${doc.code}.${field}`)
  const invalid = ERROR_DOCS.find((doc) => doc.code === 'KEY_INVALID')
  assert.ok(invalid, 'KEY_INVALID is documented')
  assert.ok(invalid.next.includes(DOOR), `KEY_INVALID says where a key is minted: ${invalid.next}`)
  // The list door answers ids and hints only (`listKeys` in src/lib/api-key.js): guidance that
  // names it must not read as a way to check, or get back, a secret.
  for (const doc of ERROR_DOCS)
    for (const field of ['meaning', 'next']) {
      const said = String(doc[field] ?? '')
      if (!said.includes('GET /api/me/keys')) continue
      assert.match(said, /never the secret/, `${doc.code}.${field} says the list has no secret`)
      assert.match(said, /cannot be read back/, `${doc.code}.${field} says a lost secret is gone`)
      assert.doesNotMatch(said, /check the key against/i, `${doc.code}.${field}`)
    }
  assert.ok(invalid.next.includes('GET /api/me/keys'), 'KEY_INVALID still names the list door')
})

for (const [name, variant] of Object.entries(documents)) {
  test(`F-S2-001: the ${name} API reference names the door and not the screen`, () => {
    const text = built(variant)
    assert.doesNotMatch(text, SCREEN)
    assert.ok(text.includes(DOOR), `${name}: the document still says how a seat key is minted`)
  })
}
