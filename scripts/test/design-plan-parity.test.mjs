/**
 * The two halves that decide which design a Joomla site is built with must give the same answer.
 *
 * `apps/tracy-web` resolves it in JavaScript to show the customer a notice before they press, and
 * `scripts/provision/design-plan.py` resolves it again in Python on the fleet host, from the same
 * registry file, to decide what actually gets installed. Neither can import the other, so nothing
 * but a test makes them agree — and a disagreement is the worst shape available: the form promises
 * one design, the site is built with another, and both halves report success.
 *
 * Run against every id in the library, not a sample: the interesting cases are the ones nobody
 * thought to list, and the whole file is 152 short strings.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { loadDesignRegistry, resolveDesignPlan } from '../../apps/tracy-web/src/sites/design-plan.js'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const PROVISION = path.join(ROOT, 'packages/fleet/tracy-fleet-operation/scripts/provision')
const CANONICAL = path.join(PROVISION, 'design-templates.json')

/** What the fleet half answers for one design, as a plan object. */
function fleetPlan(design, revision) {
  const dir = mkdtempSync(path.join(tmpdir(), 'tracy-plan-'))
  try {
    const out = path.join(dir, 'plan.json')
    const args = ['design-plan.py', '--design', design, '--out', out]
    if (revision) args.push('--revision', revision)
    execFileSync('python3', args, { cwd: PROVISION, encoding: 'utf8' })
    return JSON.parse(readFileSync(out, 'utf8'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('both halves resolve the same registry to the same revision', () => {
  const web = loadDesignRegistry()
  const fleet = createHash('sha256').update(readFileSync(CANONICAL)).digest('hex')
  // The web half reads the mirror the image carries; the fleet half reads the canonical file. The
  // revision is what pins a create call to the plan a form displayed, so equal bytes are not a
  // tidiness preference — unequal ones make every site creation fail with a message about the
  // registry rather than about the design.
  assert.equal(web.revision, fleet)
})

test('both halves resolve every design in the library identically', () => {
  const web = loadDesignRegistry()
  for (const id of web.registry.library.ids) {
    const here = resolveDesignPlan(web, id)
    const there = fleetPlan(id)
    assert.ok(here, `${id} resolved to nothing in the web half`)
    for (const field of [
      'requestedDesign',
      'effectiveDesign',
      'effectiveDesignName',
      'baseQuickstart',
      'baseVersion',
      'contractProfile',
      'coworkMinVersion',
      'fallback',
      'registryRevision'
    ])
      assert.deepEqual(there[field], here[field], `${id}.${field} disagrees between the two halves`)
    assert.deepEqual(there.template, here.template, `${id}.template disagrees between the two halves`)
    assert.equal(there.fallbackReason ?? null, here.fallbackReason ?? null, `${id}.fallbackReason disagrees`)
  }
})

test('the fleet half refuses an id the web half refuses', () => {
  const web = loadDesignRegistry()
  for (const bad of ['not-a-design', 'APPLE', 'apple/j6', '..']) {
    assert.equal(resolveDesignPlan(web, bad), null)
    assert.throws(() => fleetPlan(bad), `expected the fleet half to refuse ${bad}`)
  }
})

test('the fleet half refuses a revision that is not the registry it holds', () => {
  const web = loadDesignRegistry()
  // The same revision passes, so the refusal below is about the value and not about the flag.
  assert.equal(fleetPlan('apple', web.revision).effectiveDesign, 'apple')
  assert.throws(() => fleetPlan('apple', 'f'.repeat(64)))
})

test('a served design carries everything the fleet needs to install it; a bundled one carries none of it', () => {
  const web = loadDesignRegistry()
  for (const [id, design] of Object.entries(web.registry.designs)) {
    if (design.state !== 'served') continue
    const plan = fleetPlan(id)
    if (design.template.source === 'artifact') {
      // Without these two the provisioner would have a design it cannot install and a package it
      // cannot activate — and the site would stand with the base design under the wrong name.
      assert.ok(plan.artifact?.sha256, `${id} names no package checksum`)
      assert.ok(plan.activation?.styles?.length, `${id} names no activation recipe`)
    } else {
      assert.equal(plan.artifact, undefined, `${id} is bundled but names a download`)
      assert.equal(plan.activation, undefined, `${id} is bundled but names an activation`)
    }
  }
})
