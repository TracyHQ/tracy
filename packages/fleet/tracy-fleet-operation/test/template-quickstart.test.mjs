/**
 * A TEMPLATE quickstart through provision — an entry that names a `template`, the shape a finished
 * site on Design inspiration has (`tracy-business/j6`, `tracy-business/emdash`) — as behaviour.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/template-quickstart.test.mjs
 *
 * `quickstart.py --field template.id` is RUN: its answer is the only thing the shell branches on
 * (a finished site names its template; a build base carries a `contract` instead). And
 * `provision.sh` is RUN with a floor that is not a version.
 *
 * What the shell scripts must merely CONTAIN — the template road taken before a contract is
 * demanded, the marker written before the bind, the refusal before the install — is a cross-file
 * rule about line order and lives in gate `infra-contracts` (`scripts/check-infra-contracts.ts`).
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const PROVISION = fileURLToPath(new URL('../scripts/provision/', import.meta.url))
const py = (...args) =>
  spawnSync('python3', [`${PROVISION}quickstart.py`, ...args], {
    encoding: 'utf8',
    env: { ...process.env, TRACY_RELEASES_GITHUB_TOKEN: '' }
  })

const catalog = JSON.parse(readFileSync(`${PROVISION}quickstarts.json`, 'utf8'))
const templated = Object.entries(catalog).filter(([, entry]) => entry.template)
const bases = Object.entries(catalog).filter(([, entry]) => !entry.template)

test('the catalogue has both kinds of entry, so the two tables below mean something', () => {
  assert.ok(templated.length > 0, 'no entry names a template')
  assert.ok(bases.length > 0, 'no entry is a build base')
})

for (const [id, entry] of templated) {
  test(`template.id: ${id} answers the template its entry names`, () => {
    const answer = py('--id', id, '--field', 'template.id')
    assert.equal(answer.status, 0, answer.stderr)
    assert.equal(answer.stdout.trim(), entry.template.id)
  })
}

for (const [id] of bases) {
  test(`template.id: ${id} is a build base and names no template`, () => {
    assert.notEqual(py('--id', id, '--field', 'template.id').status, 0)
  })
}

test('provision.sh refuses a --cowork-min-version that is not a version, rather than reading it as no floor', () => {
  const run = spawnSync(
    'bash',
    [`${PROVISION}provision.sh`, '--site', 'x.test', '--label', 'xlabel', '--cowork-min-version', 'bogus'],
    { encoding: 'utf8' }
  )
  assert.equal(run.status, 2)
  assert.match(run.stderr, /--cowork-min-version is not a version: bogus/)
})
