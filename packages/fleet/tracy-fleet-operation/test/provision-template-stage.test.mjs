/**
 * The first line a template quickstart's provision says (`provision.sh`, `BUILD_WORKFLOW=template`).
 * A card a profile seals carries `contract`, and the platform file binds it after the install, with
 * the showcase phase (JA Fresco j6, bound to `ja-fresco/j6/1.0.4`, said "no content contract" and then
 * ran that phase). So "no content contract" is said only for a card that names none.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/provision-template-stage.test.mjs
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const SRC = readFileSync(fileURLToPath(new URL('../scripts/provision/provision.sh', import.meta.url)), 'utf8')
// The template road's block, from where it reads BUILD_WORKFLOW to the `fi` that closes it.
const from = SRC.indexOf('BUILD_WORKFLOW="${BUILD_WORKFLOW:-}"')
const BLOCK = SRC.slice(from, SRC.indexOf('\nfi\n', from) + 4)

const said = (t, contract) => {
  const here = mkdtempSync(join(tmpdir(), 'template-stage-'))
  t.after(() => rmSync(here, { recursive: true, force: true }))
  // quickstart.py stub: `template.id` names a template; `contract` answers what the entry carries,
  // exit 4 "quickstart has no contract" when it carries none.
  writeFileSync(
    join(here, 'quickstart.py'),
    `import sys\nfield = sys.argv[sys.argv.index('--field') + 1]\nif field == 'template.id': print('ja-fresco'); sys.exit(0)\n` +
      `if field == 'contract' and ${JSON.stringify(contract)}: print(${JSON.stringify(contract)}); sys.exit(0)\n` +
      `print('quickstart has no contract', file=sys.stderr); sys.exit(4)\n`
  )
  chmodSync(join(here, 'quickstart.py'), 0o755)
  const r = spawnSync(
    'bash',
    ['-c', `set -euo pipefail\nstage() { echo "STAGE $*"; }\n${BLOCK}\necho "WORKFLOW $BUILD_WORKFLOW"`],
    {
      env: { ...process.env, HERE: here, QUICKSTART: 'quickstart/ja-fresco/j6', BUILD_WORKFLOW: '' },
      encoding: 'utf8'
    }
  )
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /^WORKFLOW template$/m)
  return r.stdout.split('\n').filter((l) => l.startsWith('STAGE '))
}

test('a template card a profile seals says the contract it is bound to, never "no content contract"', (t) => {
  assert.ok(
    from > 0 && BLOCK.includes('stage "template quickstart'),
    'the template block is where this test reads it'
  )
  assert.deepEqual(said(t, 'ja-fresco/j6/1.0.4'), [
    'STAGE template quickstart quickstart/ja-fresco/j6: installed as released, then sealed by ja-fresco/j6/1.0.4'
  ])
})

test('a template card that names no contract says so', (t) => {
  assert.deepEqual(said(t, ''), [
    'STAGE template quickstart quickstart/ja-fresco/j6: installed as released, no content contract'
  ])
})
