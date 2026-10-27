// The readable accent on the ink band (--ds-c-accent-on-ink): the accent words a template sets on its
// inverse ground (Tracy Business's hero line and ink-card kickers) read 4.5:1 there, from any system.
import assert from 'node:assert/strict'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { contrast } from '../src/colour.mjs'
import { emdashCss } from '../src/emit.mjs'
import { loadContract, loadProfile } from '../src/library.mjs'
import { roleVariableValues } from '../src/role-values.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const SYSTEMS = [
  'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0',
  'refero:5fd3b3b4-02ab-456a-87aa-e4395636b671',
  'od:stripe',
  'od:spotify'
]

test('an accent that vanishes on its own ink band is moved until it reads 4.5:1 there', () => {
  // a pink accent on a pink ink hero (Toggl Track) read 1:1 when the hero used the page's accent text
  const v = roleVariableValues({
    bg: '#ffffff',
    fg: '#1a1a1a',
    ink: '#e57cd8',
    onInk: '#1a1a1a',
    accent: '#e57cd8',
    accentText: '#e57cd8',
    accentOn: '#1a1a1a'
  })
  const ink = v['--ds-c-ink']
  assert.ok(contrast(v['--ds-c-accent-on-ink'], ink) >= 4.5, `${v['--ds-c-accent-on-ink']} on ${ink}`)
  // an accent that already reads on the ink stays itself
  const kept = roleVariableValues({
    bg: '#ffffff',
    fg: '#111111',
    ink: '#111111',
    onInk: '#ffffff',
    accent: '#f5a623',
    accentText: '#f5a623',
    accentOn: '#111111'
  })
  assert.equal(kept['--ds-c-accent-on-ink'], '#f5a623')
})

test('a light accent that reads on the ink band is worn as it is, not the dull walk from its page text', () => {
  // Mailchimp: yellow accent, its page accent text a dark olive; on its near-black ink the yellow reads
  // ~13:1, so the band wears the yellow (the walk from the olive text gave #93863d)
  const v = roleVariableValues({
    bg: '#ffffff',
    fg: '#241c15',
    ink: '#231e15',
    onInk: '#ffffff',
    accent: '#ffe01b',
    accentText: '#7f6f18',
    accentOn: '#231e15'
  })
  assert.equal(v['--ds-c-accent-on-ink'], '#ffe01b')
  assert.ok(contrast(v['--ds-c-accent-on-ink'], v['--ds-c-ink']) >= 4.5)
})

test('a dark accent that fails on the ink band is still moved until it reads 4.5:1 there', () => {
  const v = roleVariableValues({
    bg: '#ffffff',
    fg: '#111111',
    ink: '#111111',
    onInk: '#ffffff',
    accent: '#1a3d8f',
    accentText: '#1a3d8f',
    accentOn: '#ffffff'
  })
  const ink = v['--ds-c-ink']
  assert.notEqual(v['--ds-c-accent-on-ink'], '#1a3d8f')
  assert.ok(contrast(v['--ds-c-accent-on-ink'], ink) >= 4.5, `${v['--ds-c-accent-on-ink']} on ${ink}`)
})

test('every system writes an accent that reads 4.5:1 on its ink band, both sides', () => {
  const c = loadContract('emdash-tracy-business-roles')
  for (const id of SYSTEMS) {
    const r = emdashCss(loadProfile(ROOT, id), c)
    for (const vars of [r.vars, r.derivedVars]) {
      const k = contrast(vars['--ds-c-accent-on-ink'], vars['--ds-c-ink'])
      assert.ok(k >= 4.5, `${id}: ${vars['--ds-c-accent-on-ink']} on ${vars['--ds-c-ink']} ${k?.toFixed(2)}`)
    }
  }
})
