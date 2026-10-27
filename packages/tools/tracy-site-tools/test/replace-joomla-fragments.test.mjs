/**
 * Words a block prints split over styled fragments: one heading whose accent word is its own slot
 * (`<h4>Sign up for the <span>Boxing</span> newsletter</h4>` is three text-node slots of one module
 * field). A customer quotes the line as they read it; the replace job must find it on the first ask
 * and keep every fragment non-empty, so the accent span keeps a word.
 *
 * Measured on JA Boxing 1.0.4 (accept-boxing-104, 25/10/2026): "Change 'Sign up for the Boxing
 * newsletter' to 'Get our weekly training tips'" was answered "the label built into the newsletter
 * form", nothing written.
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { fragmentGroups, spreadOverFragments } from '../src/host/fragment-groups.mjs'
import { replaceOnJoomla } from '../src/host/replace-joomla.mjs'
import { planReplace } from '../src/host/replace.mjs'

/** One text slot of a module field, as the content map declares it. */
const slot = (key, current, xpath, jsonPath = ['introtext'], max = 60) => ({
  key,
  entity: key.replace(/\.\d+$/, ''),
  column: 'params',
  type: 'text',
  sample: current,
  current,
  maxCharacters: max,
  requiresEvidence: false,
  jsonPath,
  xpath,
  label: 'Block / field',
  customize: 'keep'
})

const SNAP = {
  ok: true,
  contract: 'ja-boxing/j6/1.0.4',
  revision: 'rev-1',
  languages: [],
  slots: [
    slot('module-169.0', 'Sign up for the ', '/html/body/div/h4/text()[1]'),
    slot('module-169.1', 'Boxing', '/html/body/div/h4/span/text()'),
    slot('module-169.2', ' newsletter', '/html/body/div/h4/text()[2]'),
    slot(
      'module-169.3',
      'These routines are designed to help you stay in shape.',
      '/html/body/div/p/text()',
      ['introtext'],
      200
    ),
    slot('module-157.20', 'THE', '/html/body/div/text()[1]', ['main-section']),
    slot('module-157.21', 'WORKOUT', '/html/body/div/span/text()', ['main-section']),
    slot('module-160.4', 'Join over ', '/html/body/div/div/div/text()[1]', ['top-desc']),
    slot('module-160.5', '100k', '/html/body/div/div/div/span/text()', ['top-desc']),
    slot('module-160.6', ' of inspiring creatives', '/html/body/div/div/div/text()[2]', ['top-desc'])
  ],
  pages: [
    {
      entity: 'menuItem-101',
      route: 'home',
      link: 'index.php?option=com_content&view=featured',
      assignedModules: ['module-169', 'module-157', 'module-160'].map((entity, k) => ({
        entity,
        assignmentMode: 'all',
        menuIds: [0],
        position: ['footinfo-2', 'section', 'section'][k],
        published: '1',
        access: '1',
        language: '*'
      }))
    }
  ]
}

const HOME = `<!doctype html><html lang="en-gb"><head><title>Home</title></head>
<body class="site-default view-featured item-101"><main>
<div class="t4-module module" id="Mod157"><div class="module-inner"><div class="module-ct"><div class="sec-title">THE<br/><span>WORKOUT</span></div></div></div></div>
<div class="t4-module module" id="Mod160"><div class="module-inner"><div class="module-ct"><div><div><div class="desc">Join over <span class="text-primary">100k</span> of inspiring creatives</div></div></div></div></div></div>
</main><footer>
<div class="t4-module module" id="Mod169"><div class="module-inner"><div class="module-ct"><div class="acym_module"><form method="POST" action="/subscribe"><div class="acym_module_form"><div class="acym_introtext"><h4>Sign up for the <span>Boxing</span> newsletter</h4>
<p>These routines are designed to help you stay in shape.</p></div><input type="email" name="user[email]"></div></form></div></div></div></div>
</footer></body></html>`

/** One replace call against fake doors that record the apply. */
async function run(call) {
  const applies = []
  const r = await replaceOnJoomla({
    plan: planReplace(call),
    snapshot: async () => SNAP,
    apply: async (params) => {
      applies.push(params)
      return { ok: true }
    },
    pageHtml: async () => ({ ok: true, status: 200, html: HOME }),
    evidenceText: null,
    mint: (prefix) => `${prefix}-test-${applies.length}`,
    verify: false,
    env: {}
  })
  return { r, changes: applies[0]?.changes ?? null }
}

test('fragmentGroups: consecutive text slots of one field under one block element are one group', () => {
  const groups = fragmentGroups(
    SNAP.slots.map((s) => ({ at: s.key, entity: s.entity, raw: s.current, slot: s }))
  )
  assert.deepEqual(
    groups.map((g) => g.map((u) => u.at)),
    [
      ['module-169.0', 'module-169.1', 'module-169.2'],
      ['module-157.20', 'module-157.21'],
      ['module-160.4', 'module-160.5', 'module-160.6']
    ]
  )
})

test('spreadOverFragments: new words spread over every fragment, none left empty, spacing kept', () => {
  const raws = ['Sign up for the ', 'Boxing', ' newsletter']
  assert.deepEqual(
    spreadOverFragments(raws, 'Sign up for the Boxing newsletter', 'Get our weekly training tips'),
    ['Get our weekly ', 'training', ' tips']
  )
  // the accent word kept by the new words keeps its span
  assert.deepEqual(spreadOverFragments(raws, 'Sign up for the Boxing newsletter', 'Get the Boxing tips'), [
    'Get the ',
    'Boxing',
    ' tips'
  ])
  // a change inside one fragment leaves the others' stored bytes alone
  assert.deepEqual(
    spreadOverFragments(raws, 'Sign up for the Boxing newsletter', 'Sign up for the Boxing digest'),
    ['Sign up for the ', 'Boxing', ' digest']
  )
  // no space between the fragments (a <br>): none is added
  assert.deepEqual(spreadOverFragments(['THE', 'WORKOUT'], 'THE WORKOUT', 'OUR TRAINING'), [
    'OUR',
    'TRAINING'
  ])
  // part of the line quoted: the words outside the quote stay
  assert.deepEqual(
    spreadOverFragments(
      ['Join over ', '100k', ' of inspiring creatives'],
      'over 100k of inspiring',
      'more than 200k of great'
    ),
    ['Join more than ', '200k', ' of great creatives']
  )
  // fewer new words than fragments: no way to keep each one non-empty
  assert.equal(spreadOverFragments(raws, 'Sign up for the Boxing newsletter', 'Hi'), null)
})

test('a quoted heading split by an accent span is written on the first ask, the span keeping a word', async () => {
  const { r, changes } = await run({
    find: 'Sign up for the Boxing newsletter',
    replace: 'Get our weekly training tips'
  })
  assert.equal(r.ok, true, JSON.stringify(r))
  assert.deepEqual(changes, {
    'module-169.0': 'Get our weekly ',
    'module-169.1': 'training',
    'module-169.2': ' tips'
  })
})

test('a two-fragment heading on two lines and a three-fragment line quoted whole', async () => {
  const workout = await run({ find: 'THE WORKOUT', replace: 'OUR TRAINING' })
  assert.equal(workout.r.ok, true, JSON.stringify(workout.r))
  assert.deepEqual(workout.changes, { 'module-157.20': 'OUR', 'module-157.21': 'TRAINING' })
  const join = await run({
    find: 'Join over 100k of inspiring creatives',
    replace: 'Join our growing community'
  })
  assert.equal(join.r.ok, true, JSON.stringify(join.r))
  const v = join.changes
  assert.equal(
    `${v['module-160.4'] ?? 'Join over '}${v['module-160.5'] ?? '100k'}${v['module-160.6'] ?? ' of inspiring creatives'}`,
    'Join our growing community'
  )
  for (const k of Object.keys(v)) assert.ok(v[k].trim() !== '', k)
})

test('words inside one fragment still take the ordinary road', async () => {
  const { r, changes } = await run({ find: 'newsletter', replace: 'digest' })
  assert.equal(r.ok, true, JSON.stringify(r))
  assert.deepEqual(changes, { 'module-169.2': ' digest' })
})
