#!/usr/bin/env node
/**
 * The progress console: reading the fleet's raw output into steps people can read.
 *
 * TWO DECISIONS ARE PINNED HERE.
 *
 * 1. **Only steps that HAPPENED are shown.** There is no list of future steps, so no grey line for
 *    a step that never runs. That is exactly the failure `tasks/todo-tracy-add-site.md` D4 describes:
 *    `baseline` only runs when the site keeps per-file history, and a console listing it up front would describe
 *    a step nobody is waiting for. Deriving from real markers gives that filter for free, not a second table
 *    to drift.
 *
 * 2. **Per-platform vocabulary.** Joomla installs a *component*, WordPress installs a *plugin*. A shared
 *    label taught customers the wrong vocabulary once (measured 2026-08-11, `stepLabelKey` in `tracy-desk`).
 *    The "install Cowork" step therefore carries three keys, not one.
 *
 * The markers come from `packages/fleet/tracy-fleet-operation/scripts/provision/*.sh` itself — each milestone
 * is a `==>` line. Change an echo line there and forget this one, and that step silently vanishes from the console,
 * which is why the markers are written as named constants rather than scattered regexes.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { stepsFrom, STEP } from '../src/client/steps.mjs'

test('empty output has no steps yet', () => {
  assert.deepEqual(stepsFrom('', 'joomla'), [])
})

test('each fleet milestone becomes exactly one step, in the order it happens', () => {
  const output = [
    '==> tiem-banh.tracy.ai  →  /srv/tracy/tiem-banh  (port 8081)',
    '==> fetching webroot',
    '==> starting database',
    '==> importing database'
  ].join('\n')
  assert.deepEqual(
    stepsFrom(output, 'joomla').map((step) => step.key),
    [STEP.webroot, STEP.database]
  )
})

test('two lines of the same step do NOT become two steps', () => {
  // `starting database` then `importing database` is one job told in two beats. Counting them as
  // two lines on screen misdescribes what is happening.
  const steps = stepsFrom('==> starting database\n==> importing database', 'wordpress')
  assert.equal(steps.length, 1)
  assert.equal(steps[0].key, STEP.database)
})

test("the platform install step takes each platform's OWN marker", () => {
  assert.equal(stepsFrom('==> waiting for the Joomla auto-install', 'joomla')[0].key, STEP.platform)
  assert.equal(stepsFrom('==> waiting for the WordPress core copy', 'wordpress')[0].key, STEP.platform)
  assert.equal(stepsFrom('==> completing the EmDash first-run setup', 'emdash')[0].key, STEP.platform)
})

test("the Cowork install step carries the platform's vocabulary, not a shared label", () => {
  // Joomla: component. WordPress: plugin. One step, two nouns — because users will look for
  // it in their OWN admin, under the name that admin uses.
  const joomla = stepsFrom('==> reading the component token', 'joomla')[0]
  const wordpress = stepsFrom('==> reading the plugin token', 'wordpress')[0]
  assert.equal(joomla.key, STEP.cowork)
  assert.equal(wordpress.key, STEP.cowork)
  assert.notEqual(joomla.stringKey, wordpress.stringKey)
  assert.ok(joomla.stringKey.endsWith('_joomla'))
  assert.ok(wordpress.stringKey.endsWith('_wordpress'))
})

test('EmDash has no Cowork step of its own — it must NOT be made up', () => {
  // EmDash is born with an agent; there is no component or plugin to install. An "installing
  // Cowork" step here would describe work that does not happen.
  const steps = stepsFrom('==> seeding admins and minting the agent token', 'emdash')
  assert.deepEqual(
    steps.map((s) => s.key),
    [STEP.agent]
  )
})

test('baseline shows only when the fleet REALLY builds it', () => {
  assert.deepEqual(
    stepsFrom('==> fetching webroot', 'joomla').map((s) => s.key),
    [STEP.webroot]
  )
  assert.deepEqual(
    stepsFrom('==> fetching webroot\n==> building the webroot baseline (ADR 0073)', 'joomla').map(
      (s) => s.key
    ),
    [STEP.webroot, STEP.baseline]
  )
})

test('“not publishing” must NOT be read as “publishing”', () => {
  // The two fleet lines differ only by the word `not`, and misreading reports an address that does not exist yet.
  assert.deepEqual(stepsFrom('==> not publishing tiem-banh.tracy.ai — the caller does that', 'joomla'), [])
  assert.deepEqual(
    stepsFrom('==> publishing tiem-banh.tracy.ai', 'joomla').map((s) => s.key),
    [STEP.address]
  )
})

test('the last line is the step RUNNING; the lines before are done', () => {
  const steps = stepsFrom('==> fetching webroot\n==> starting database', 'joomla')
  assert.equal(steps[0].done, true)
  assert.equal(steps[1].done, false)
})

test('TRACY_RESULT closes the last step — nothing is running any more', () => {
  const steps = stepsFrom('==> fetching webroot\nTRACY_RESULT port=8081 label=tiem-banh', 'joomla')
  assert.ok(steps.every((step) => step.done))
})

test('the REAL marker of a job row is `>`, not `==>`', () => {
  // Measured on a real job 31/08: the job row carries `step: "> starting database"`. `provision.sh` prints
  // `==> starting database`, but the fleet strips part of it on the way. The first `stepsFrom` required
  // `==>` and so returned an EMPTY array for every real job — the console showed "Getting a machine ready…"
  // from start to finish while the fleet was narrating each step.
  const real = ['> starting database', '> building the webroot baseline (ADR 0073)'].join('\n')
  assert.deepEqual(
    stepsFrom(real, 'joomla').map((s) => s.key),
    [STEP.database, STEP.baseline]
  )
})

test('an unknown fleet line is skipped, not turned into a nameless step', () => {
  const output = ['some noise', '==> joomla mailer = smtp', '==> fetching webroot'].join('\n')
  assert.deepEqual(
    stepsFrom(output, 'joomla').map((s) => s.key),
    [STEP.webroot]
  )
})

/**
 * 🔒 THE FIXTURE MUST BE WHAT `stage.seen` REALLY CARRIES, NOT WHAT `provision.sh` PRINTS.
 * The console joins `job.step`, and `stepFromLine` (`apps/tracy-host/src/provision.js`) strips the
 * prefix before that value leaves the host — since 19/09/2026 it strips the arrow too, because the arrow was leaking onto the
 * customer's screen as `> fetching webroot`. Every fixture in this file wrote `==>`, so no test
 * ran through the shape the real product goes through.
 *
 * Measured 19/09 on `demoemdash.tracy.test`: provisioning done after 210 seconds, the site answering HTTP 200, and the
 * Add site panel still saying *"Getting a machine ready…"* — `stepsFrom` returned an empty array for every line because the
 * `includes('>')` guard no longer matched anything. Two correct fixes collided in the middle, and neither reported it.
 */
test('a job row carries no arrow, and the console still reads every step', () => {
  // Exactly what `job.step` carried on that EmDash run, in the order the fleet narrated it.
  const seen = [
    'completing the EmDash first-run setup',
    'seeding admins and minting the agent token',
    'building the site folder'
  ].join('\n')
  const steps = stepsFrom(seen, 'emdash')
  assert.deepEqual(
    steps.map((s) => s.key),
    ['platform', 'agent'],
    'the console read nothing from a real job row'
  )
  // `building the site folder` matches NO marker — and that is right: the console only narrates milestones it understands.
  assert.ok(!steps.some((s) => s.key === 'baseline'))
})

test('the same steps are read whether the arrow survived or not', () => {
  // Control: the two shapes must give the same result, because the marker is the WORDS, not the arrow.
  const withArrows = '==> fetching webroot\n==> starting database'
  const stripped = 'fetching webroot\nstarting database'
  assert.deepEqual(
    stepsFrom(stripped, 'wordpress').map((s) => s.key),
    stepsFrom(withArrows, 'wordpress').map((s) => s.key)
  )
  // And the half-way form of 31/08 (`> starting database`) too.
  assert.deepEqual(
    stepsFrom('> fetching webroot\n> starting database', 'wordpress').map((s) => s.key),
    stepsFrom(withArrows, 'wordpress').map((s) => s.key)
  )
})

test('installing a quickstart is a step of its own, and pairing it is still the Cowork step', () => {
  const output = [
    'fetching the quickstart package (quickstart-installer)',
    "building the quickstart with Joomla's own CLI installer",
    'pairing the quickstart with its private Cowork token',
    'quickstart Cowork pairing verified (template, baseline none)'
  ].join('\n')
  assert.deepEqual(
    stepsFrom(output, 'joomla').map((s) => s.key),
    [STEP.quickstart, STEP.cowork]
  )
  assert.deepEqual(
    stepsFrom('EmDash image (quickstart tracy-business/emdash-0.x): tracy/x:1.1.0', 'emdash').map(
      (s) => s.key
    ),
    [STEP.quickstart]
  )
  // WordPress: the restored site is waited for BEFORE Cowork installs, so the order reads right.
  const wp = ['waiting for the restored site', 'installing cowork', 'reading the plugin token'].join('\n')
  assert.deepEqual(
    stepsFrom(wp, 'wordpress').map((s) => s.key),
    [STEP.quickstart, STEP.cowork]
  )
})

test('EmDash narrates its quickstart road in its own words, and the console follows it', () => {
  // The `==>` lines of a real run (tbemdash1.tracy.test, 21/09), in order.
  const output = [
    'template quickstart tracy-business/emdash-0.x: installed as released, no content contract',
    'fetching the packed template of tracy-business/emdash-0.x',
    'docker build tracy/tracy-business-emdash:1.1.0',
    'restoring the state snapshot',
    'EmDash image (quickstart tracy-business/emdash-0.x): tracy/tracy-business-emdash:1.1.0',
    'installing Tracy Business content, media and forms',
    'minting the agent admin + token',
    'building the site folder'
  ].join('\n')
  assert.deepEqual(
    stepsFrom(output, 'emdash').map((s) => s.key),
    [STEP.quickstart, STEP.agent]
  )
})

test('the Customize answers being written are a step of their own, after the starting point, on every CMS', () => {
  // 16/10/2026, Joomla: the poll door said "writing your text and pictures" for minutes and the console
  // kept "Recording a starting point" spinning, because no marker read the brief's own words.
  for (const platform of ['wordpress', 'joomla', 'emdash']) {
    const output = [
      'fetching webroot',
      'building the webroot baseline',
      'writing your text and pictures',
      'placing your text and pictures on the site'
    ].join('\n')
    const steps = stepsFrom(output, platform)
    assert.deepEqual(
      steps.map((s) => s.key),
      [STEP.webroot, STEP.baseline, STEP.writing, STEP.placing],
      platform
    )
    assert.deepEqual(steps.map((s) => s.stringKey).slice(-2), ['step_writing', 'step_placing'])
    // the starting point is done; the last line is the one still running
    assert.deepEqual(
      steps.map((s) => s.done),
      [true, true, true, false]
    )
  }
})
