/**
 * `personFace` — the one rule for a person's letter and colour
 * (`tasks/evidence/team-badge-count/contract.md` § 1 and § 3). The fixture's expected values were
 * computed by the same formula the sidebar fork used client-side, so a face does not change with the
 * move to the server.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AUTHOR_COLOURS, fnv1a32, personFace } from '../src/lib/person-face.js'

const FIXTURE = [
  { id: 'acc-lee', display_name: null, email: 'lee@example.com', initial: 'L', color: '#4f46e5' },
  {
    id: 'acc-sam-1',
    display_name: 'Sam Tester',
    email: 'sam.one@example.com',
    initial: 'S',
    color: '#db2777'
  },
  {
    id: 'acc-sam-2',
    display_name: 'Sam Tester',
    email: 'sam.two@example.com',
    initial: 'S',
    color: '#c026d3'
  },
  { id: 'acc-invited', display_name: null, email: 'new@example.com', initial: 'N', color: '#7c3aed' },
  { id: 'acc-asked', display_name: null, email: 'asked@example.com', initial: 'A', color: '#059669' },
  { id: 'acc-revoked', display_name: null, email: 'gone@example.com', initial: 'G', color: '#0284c7' }
]

for (const row of FIXTURE) {
  test(`fixture: ${row.id} → ${row.initial} on ${row.color}`, () => {
    const { initial, color, ...account } = row
    assert.deepEqual(personFace({ ...account, avatar_url: null }), { initial, color, avatarUrl: null })
  })
}

test('two people of one name keep their own colours — no namesake step moves either', () => {
  const [a, b] = FIXTURE.filter((r) => r.display_name === 'Sam Tester')
  assert.notEqual(personFace(a).color, personFace(b).color)
  assert.equal(personFace(a).color, '#db2777')
  assert.equal(personFace(b).color, '#c026d3')
})

test('the colour is keyed by the account, not the name or the email', () => {
  const base = { id: 'acc-lee', email: 'lee@example.com' }
  assert.equal(personFace({ ...base, display_name: 'Renamed' }).color, personFace(base).color)
  assert.equal(personFace({ ...base, email: 'other@example.com' }).color, personFace(base).color)
})

test('avatarUrl: null or missing → null', () => {
  assert.equal(personFace({ id: 'x', email: 'x@y.z', avatar_url: null }).avatarUrl, null)
  assert.equal(personFace({ id: 'x', email: 'x@y.z' }).avatarUrl, null)
})

test('avatarUrl: a stored provider picture is served through Tracy, never handed out as the provider address', () => {
  const google = 'https://lh3.googleusercontent.com/a/ACg8ocL=s96-c'
  const github = 'https://avatars.githubusercontent.com/u/4242?v=4'
  const a = personFace({ id: 'acc-1', email: 'x@y.z', avatar_url: google }).avatarUrl
  const b = personFace({ id: 'acc-1', email: 'x@y.z', avatar_url: github }).avatarUrl
  assert.match(a, /^\/auth\/avatar\/acc-1\?v=[0-9a-f]{8}$/)
  assert.match(b, /^\/auth\/avatar\/acc-1\?v=[0-9a-f]{8}$/)
  // A new picture is a new address, so a browser holding the old one asks again.
  assert.notEqual(a, b)
  assert.ok(!a.includes('googleusercontent'))
})

test('avatarUrl: a stored address outside the picture hosts Tracy fetches from → null (the letter)', () => {
  for (const url of [
    'https://cdn.example.com/a/b.png?s=64',
    'http://lh3.googleusercontent.com/a/x',
    'https://googleusercontent.com.evil.test/a',
    'javascript:alert(1)',
    'not a url'
  ]) {
    assert.equal(personFace({ id: 'x', email: 'x@y.z', avatar_url: url }).avatarUrl, null, url)
  }
})

test('initial: the display name first, trimmed, upper case, a whole code point; ? for nobody', () => {
  assert.equal(personFace({ id: 'x', email: 'zed@y.z', display_name: '  mai ' }).initial, 'M')
  assert.equal(personFace({ id: 'x', email: 'zed@y.z', display_name: '' }).initial, 'Z')
  assert.equal(personFace({ id: 'x', email: 'ánh@y.z' }).initial, 'Á')
  assert.equal(personFace({ id: 'x', email: null, display_name: null }).initial, '?')
  assert.equal(personFace({ id: 'x', email: '   ' }).initial, '?')
  assert.equal(personFace({ id: 'x', display_name: '𝒜lice' }).initial, '𝒜')
})

test('fnv1a32 and the palette: the published constants', () => {
  assert.equal(fnv1a32(''), 0x811c9dc5)
  assert.equal(fnv1a32('a'), 0xe40c292c)
  assert.equal(AUTHOR_COLOURS.length, 8)
  assert.ok(!AUTHOR_COLOURS.includes('#bf5b3d'), 'never the primary terracotta')
  assert.ok(Object.isFrozen(AUTHOR_COLOURS))
})
