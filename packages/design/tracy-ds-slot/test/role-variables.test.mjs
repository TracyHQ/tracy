// The standard role variables (src/role-variables.mjs): one list, the slot's own names, no spacing.
import assert from 'node:assert/strict'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { emdashCss } from '../src/emit.mjs'
import { loadContract, loadProfile } from '../src/library.mjs'
import {
  NOT_ROLE_VARIABLE,
  REQUIRED_ROLE_VARIABLES,
  ROLE_VARIABLE_NAMES,
  ROLE_VARIABLES,
  isRoleVariable,
  missingRoleVariables,
  roleVariable
} from '../src/role-variables.mjs'
import { COLOUR_TOKENS, STATUS_ROLES } from '../src/tokens56.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')

test('every entry is a well-formed --ds-* role, named once', () => {
  assert.equal(new Set(ROLE_VARIABLE_NAMES).size, ROLE_VARIABLE_NAMES.length, 'a name is listed twice')
  for (const r of ROLE_VARIABLES) {
    assert.match(r.name, /^--ds-[a-z0-9-]+$/, r.name)
    assert.ok(['color', 'radius', 'font'].includes(r.kind), `${r.name}: kind ${r.kind}`)
    assert.equal(typeof r.required, 'boolean', r.name)
    assert.ok(r.role.length > 10 && r.role.endsWith('.'), `${r.name}: role is one sentence`)
    assert.deepEqual([...r.schemes], r.kind === 'color' ? ['light', 'dark'] : ['light'], r.name)
    assert.ok(!NOT_ROLE_VARIABLE.test(r.name), `${r.name} is spacing or layout, not a role`)
    assert.ok(Object.isFrozen(r), `${r.name} is mutable`)
  }
})

test('the colour names are the slot own names, not a parallel scheme', () => {
  // the 16 tokens a template is tokenized against, the ink pair and the readable accent all stay as they are
  for (const n of [...COLOUR_TOKENS, 'ink', 'on-ink', 'accent-text', 'accent-text-hover'])
    assert.ok(isRoleVariable(`--ds-c-${n}`), `--ds-c-${n} missing`)
  for (const s of STATUS_ROLES) assert.ok(isRoleVariable(`--ds-c-${s}-text`), `--ds-c-${s}-text missing`)
})

test('a name marked emitted is one the slot emitter writes today', () => {
  // read off the emitter's output, not its source: every role reaches a worn EmDash side
  const vars = emdashCss(
    loadProfile(ROOT, 'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0'),
    loadContract('emdash-tracy-business-roles')
  ).vars
  for (const r of ROLE_VARIABLES.filter((x) => x.emitted))
    assert.ok(vars[r.name], `${r.name} is marked emitted but no emitter writes it`)
})

test('the required set covers every role a design system must reach', () => {
  for (const n of [
    '--ds-c-bg',
    '--ds-c-surface',
    '--ds-c-surface-warm',
    '--ds-c-ink',
    '--ds-c-fg',
    '--ds-c-muted',
    '--ds-c-heading',
    '--ds-c-accent',
    '--ds-c-accent-on',
    '--ds-c-accent-hover',
    '--ds-c-accent-text',
    '--ds-c-border',
    '--ds-c-border-soft',
    '--ds-c-focus-ring',
    '--ds-c-disabled-bg',
    '--ds-c-disabled-fg',
    ...['success', 'warn', 'danger', 'info'].flatMap((s) => [
      `--ds-c-${s}`,
      `--ds-c-${s}-bg`,
      `--ds-c-${s}-text`
    ]),
    '--ds-btn-radius',
    '--ds-card-radius',
    '--ds-input-radius',
    '--ds-pill-radius',
    '--ds-font-display',
    '--ds-font-body'
  ])
    assert.ok(REQUIRED_ROLE_VARIABLES.includes(n), `${n} is not required`)
})

test('spacing and layout are never roles', () => {
  for (const n of ['--ds-btn-pad-x', '--ds-btn-pad-y', '--ds-container', '--ds-section-y', '--ds-gap'])
    assert.ok(NOT_ROLE_VARIABLE.test(n) && !isRoleVariable(n), n)
})

test('missingRoleVariables names the required roles a template does not declare, in order', () => {
  assert.deepEqual(missingRoleVariables(REQUIRED_ROLE_VARIABLES), [])
  const declared = REQUIRED_ROLE_VARIABLES.filter((n) => n !== '--ds-c-heading' && n !== '--ds-pill-radius')
  assert.deepEqual(missingRoleVariables([...declared, '--ds-not-a-role']), [
    '--ds-c-heading',
    '--ds-pill-radius'
  ])
  assert.equal(roleVariable('--ds-c-bg')?.kind, 'color')
  assert.equal(roleVariable('--ds-nope'), null)
})
