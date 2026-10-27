// The `check-image-profile` gate guards the four static files of the fleet image profile. This
// suite checks it by calling the checker functions directly with text broken one invariant at a
// time, rather than spawning tsx over a fixture on disk: Node 24 strips TypeScript types on a
// direct `import`, so the `check*` functions exported from `check-image-profile.ts` run inside
// `node --test` (the glob `pnpm test:workers` uses) with no temporary tree and no build step.
//
// Every invariant, broken ON ITS OWN in a cut-down fixture, must be red with a message naming the
// right row. Nothing here reads the real files: that the repo's REAL files are green is the job of
// the `image-profile` gate in `scripts/check-all.ts`, which runs the same checkers over them in
// `main()`; breaking a real file to test it would be inviting a PR nobody wants.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  checkFleetPatch,
  checkNativeBundlePatch,
  checkCoworkBundlePatch,
  presetIdsOf,
  HOST_SKILL_ROW,
  SHIPPED_PRESETS,
  STANDS_DOWN,
  checkProfilePackage,
  checkEntrypoint,
  checkBundleCopiedIntoImage,
  MODEL_LOCK,
  MODEL_ROW,
  DESKTOP_ONLY,
  APPROVAL_POLICY,
  parsePatch,
  readOrMissing
} from '../check-image-profile.ts'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

// dsh 0.1.7-rc.2's default-on rows Tracy turns off, one `disabled: true` row each — the fleet
// patch and both bundles carry the same list.
const STANDS_DOWN_ROWS = STANDS_DOWN.map((id) => `- id: ${id}\n  disabled: true\n`).join('')
const SHIPPED_PRESET_ROWS = SHIPPED_PRESETS.map((id) => `- id: ${id}\n  disabled: true\n`).join('')
// The host skill row stays down in both bundles: each preset reads its own skills (28/09/2026).
const SKILL_ROW = `- id: ${HOST_SKILL_ROW}\n  disabled: true\n`
// The conversation model lock: the picker down everywhere, the policy plugin inserted by a bundle.
const PICKER_ROW = `- id: ${MODEL_LOCK.picker}\n  disabled: false\n`
const POLICY_INSERT = `- insert:\n    - id: ${MODEL_LOCK.policy}\n      name: '${MODEL_LOCK.policyPackage}'\n`
// Model plan: inserted disabled by the native bundle; the fleet turns it on only with account routing.
const DESKTOP_ONLY_INSERT = `- insert:\n${DESKTOP_ONLY.map((p) => `    - id: ${p.id}\n      name: '${p.package}'\n      disabled: true\n`).join('')}`
// No approval waits on a seat (29/09/2026): the service default and every preset say `never`.
const APPROVAL_ROWS = `- id: approval
  config:
    policy: never
- id: permission
  config:
    presets:
      read-only:
        sandbox: read-only
        approval: never
      workspace-write:
        sandbox: workspace-write
        approval: never
      danger-full-access:
        sandbox: danger-full-access
        approval: never
`

/** The ids a generated `presets.patch.yml` would declare, cut down to two. */
const PRESET_IDS = new Set(['designer-wordpress', 'writer-joomla'])

// ── A minimal fleet patch fixture, shaped like the real one, with every invariant intact ──────
const GOOD_FLEET_PATCH = `
- id: webserver
  config:
    host: 0.0.0.0
    port: 51700

- id: subprocess
  disabled: true
- id: sandbox
  disabled: true

- id: ptc-runtime
  disabled: true
- id: tools
  config:
    mode: native

- id: plugin-manager
  disabled: true
- id: hmr
  disabled: true
${STANDS_DOWN_ROWS}${PICKER_ROW}
- id: dsh-subscriptions
  disabled: true
- id: tracy-model-plan
  disabled: false
- id: tracy-mode-picker
  config:
    accountSubscriptions: true
- insert:
    - id: tracy-sandbox-docker
      name: '@tracy/dsh-sandbox-docker'
    - id: tracy-subprocess-docker
      name: '@tracy/dsh-subprocess-docker'

- id: better-sidebar
  config:
    workspaceFence: true

- id: llm-deepseek
  config:
    reasoningEffort: low
    retryPolicy:
      mode: normal
      retryableCodes: [EMPTY_RESPONSE, RATE_LIMIT, SERVER, TIMEOUT, TRANSPORT, MALFORMED_RESPONSE]
    models:
      - id: deepseek-flash
        systemPromptUpdate: in-history
        toolUpdate: addition-only
`

const GOOD_NATIVE_PATCH = `
- id: directory-picker
  disabled: true

- insert:
    - id: directory-picker-browse
      name: '@deepseek-ai/dsh-host-directory-picker-browse'

- id: ui-brand-official
  disabled: true

- id: agent-preset-registry
  config:
    default: designer-wordpress
${SHIPPED_PRESET_ROWS}${SKILL_ROW}${STANDS_DOWN_ROWS}${PICKER_ROW}${POLICY_INSERT}${DESKTOP_ONLY_INSERT}${APPROVAL_ROWS}
- id: better-sidebar
  config:
    workspaceFence: true
`

const GOOD_COWORK_PATCH = `
- id: agent-preset-registry
  config:
    default: designer-wordpress
${SHIPPED_PRESET_ROWS}${SKILL_ROW}${STANDS_DOWN_ROWS}${PICKER_ROW}${POLICY_INSERT}`

const GOOD_PRESETS = `
- insert:
    - id: preset-designer-wordpress
      name: '@deepseek-ai/dsh-agent-preset'
      config:
        id: designer-wordpress
        plugins:
          - id: tool-fs
            name: '@deepseek-ai/dsh-tool-fs'
    - id: preset-writer-joomla
      name: '@deepseek-ai/dsh-agent-preset'
      config:
        id: writer-joomla
        plugins: []
`

test('a well-formed fixture fleet patch holds every invariant', () => {
  assert.deepEqual(checkFleetPatch(GOOD_FLEET_PATCH, 'fixture'), [])
})

test('a well-formed fixture native patch holds every invariant', () => {
  assert.deepEqual(checkNativeBundlePatch(GOOD_NATIVE_PATCH, 'fixture', PRESET_IDS), [])
})

test('a well-formed fixture cowork patch holds every invariant', () => {
  assert.deepEqual(checkCoworkBundlePatch(GOOD_COWORK_PATCH, 'fixture', PRESET_IDS), [])
})

test('presetIdsOf reads config.id of every inserted @deepseek-ai/dsh-agent-preset row', () => {
  assert.deepEqual(presetIdsOf(GOOD_PRESETS, 'fixture'), { ids: PRESET_IDS, problems: [] })
})

test('a presets file declaring no preset row is red, not an empty set every default fails quietly', () => {
  const { ids, problems } = presetIdsOf('- insert: []\n', 'fixture')
  assert.equal(ids.size, 0)
  assert.equal(problems.length, 1)
  assert.match(problems[0].message, /no `@deepseek-ai\/dsh-agent-preset` row/)
})

// ── The two fail-closed paths under the checkers: a missing file, an unparsable patch ─────────
//
// Neither is reachable by mangling GOOD_FLEET_PATCH — every fixture test above starts from text
// that DOES exist and DOES parse. These exercise `readOrMissing` and `parsePatch` directly, the
// same functions `main()` calls before it ever gets to a checker.

test('a missing profile patch is red, naming the path — not a thrown exception', () => {
  const missingPath = join(
    ROOT,
    'packages/fleet/tracy-fleet-operation/dsh/profile/does-not-exist.cordis.patch.yml'
  )
  const { text, problems } = readOrMissing(missingPath, 'fixture-missing-path')
  assert.equal(text, undefined)
  assert.deepEqual(problems, [{ file: 'fixture-missing-path', message: 'file does not exist' }])
})

test('malformed YAML is red, naming the file — not a thrown exception', () => {
  // Unbalanced flow mapping: `js-yaml`'s `load()` throws a YAMLException on this rather than
  // returning anything, which is exactly the branch `parsePatch`'s `catch` exists to convert
  // into a Problem.
  const malformed = '- id: subprocess\n  config: { unbalanced: [1, 2\n'
  const { rows, problems } = parsePatch(malformed, 'fixture-malformed')
  assert.deepEqual(rows, [])
  assert.equal(problems.length, 1)
  assert.equal(problems[0].file, 'fixture-malformed')
  assert.match(problems[0].message, /does not parse as YAML/)
})

// ── Each invariant, broken one at a time ───────────────────────────────────────────────────────

test('subprocess re-enabled is caught', () => {
  const broken = GOOD_FLEET_PATCH.replace(
    '- id: subprocess\n  disabled: true',
    '- id: subprocess\n  disabled: false'
  )
  const problems = checkFleetPatch(broken, 'fixture')
  assert.equal(problems.length, 1)
  assert.match(problems[0].message, /"subprocess".*disabled: true/)
})

test('sandbox re-enabled is caught', () => {
  const broken = GOOD_FLEET_PATCH.replace(
    '- id: sandbox\n  disabled: true',
    '- id: sandbox\n  disabled: false'
  )
  const problems = checkFleetPatch(broken, 'fixture')
  assert.equal(problems.length, 1)
  assert.match(problems[0].message, /"sandbox".*disabled: true/)
})

test('ptc-runtime re-enabled is caught', () => {
  const broken = GOOD_FLEET_PATCH.replace(
    '- id: ptc-runtime\n  disabled: true',
    '- id: ptc-runtime\n  disabled: false'
  )
  const problems = checkFleetPatch(broken, 'fixture')
  assert.equal(problems.length, 1)
  assert.match(problems[0].message, /"ptc-runtime".*disabled: true/)
})

test("plugin-manager re-enabled is caught (it rewrites the whole host's profile)", () => {
  const broken = GOOD_FLEET_PATCH.replace(
    '- id: plugin-manager\n  disabled: true',
    '- id: plugin-manager\n  disabled: false'
  )
  const problems = checkFleetPatch(broken, 'fixture')
  assert.equal(problems.length, 1)
  assert.match(problems[0].message, /"plugin-manager".*disabled: true/)
})

test('hmr re-enabled is caught (it applies a profile edit live)', () => {
  const broken = GOOD_FLEET_PATCH.replace('- id: hmr\n  disabled: true', '- id: hmr\n  disabled: false')
  const problems = checkFleetPatch(broken, 'fixture')
  assert.equal(problems.length, 1)
  assert.match(problems[0].message, /"hmr".*disabled: true/)
})

// ── dsh 0.1.7-rc.2: the preset registry and the four shipped presets ─────────────────────────

for (const id of SHIPPED_PRESETS) {
  test(`${id} enabled again in the native bundle is caught (a shipped preset back in the fleet roster)`, () => {
    const broken = GOOD_NATIVE_PATCH.replace(
      `- id: ${id}\n  disabled: true`,
      `- id: ${id}\n  disabled: false`
    )
    const problems = checkNativeBundlePatch(broken, 'fixture', PRESET_IDS)
    assert.equal(problems.length, 1)
    assert.match(problems[0].message, new RegExp(`"${id}".*disabled: true`))
  })

  test(`${id} enabled again in the cowork bundle is caught`, () => {
    const broken = GOOD_COWORK_PATCH.replace(`- id: ${id}\n  disabled: true\n`, '')
    const problems = checkCoworkBundlePatch(broken, 'fixture', PRESET_IDS)
    assert.equal(problems.length, 1)
    assert.match(problems[0].message, new RegExp(`"${id}" is missing`))
  })
}

test('preset-cordis enabled is red in the native bundle — it carries tool-plugin-manager', () => {
  const broken = GOOD_NATIVE_PATCH.replace(
    '- id: preset-cordis\n  disabled: true',
    '- id: preset-cordis\n  disabled: false'
  )
  assert.notDeepEqual(checkNativeBundlePatch(broken, 'fixture', PRESET_IDS), [])
})

test('a registry default no generated preset declares is caught (new sessions would fail to create)', () => {
  const broken = GOOD_NATIVE_PATCH.replace('default: designer-wordpress', 'default: standard')
  const problems = checkNativeBundlePatch(broken, 'fixture', PRESET_IDS)
  assert.equal(problems.length, 1)
  assert.match(problems[0].message, /"agent-preset-registry".*config\.default.*"standard"/)
})

test('agent-preset-registry row missing from the native patch is caught', () => {
  const broken = GOOD_NATIVE_PATCH.replace(
    /- id: agent-preset-registry\n  config:\n    default: designer-wordpress\n/,
    ''
  )
  const problems = checkNativeBundlePatch(broken, 'fixture', PRESET_IDS)
  assert.equal(problems.length, 1)
  assert.match(problems[0].message, /"agent-preset-registry" is missing/)
})

test('an empty generated preset set makes any default red', () => {
  const problems = checkNativeBundlePatch(GOOD_NATIVE_PATCH, 'fixture', new Set())
  assert.equal(problems.length, 1)
  assert.match(problems[0].message, /"agent-preset-registry"/)
})

// ── dsh 0.1.7-rc.2: default-on rows that stand down, in all three files ─────────────────────

for (const id of STANDS_DOWN) {
  test(`${id} re-enabled in the fleet patch is caught`, () => {
    const broken = GOOD_FLEET_PATCH.replace(`- id: ${id}\n  disabled: true`, `- id: ${id}\n  disabled: false`)
    const problems = checkFleetPatch(broken, 'fixture')
    assert.equal(problems.length, 1)
    assert.match(problems[0].message, new RegExp(`"${id}".*disabled: true`))
  })

  test(`${id} missing from the native bundle is caught`, () => {
    const broken = GOOD_NATIVE_PATCH.replace(`- id: ${id}\n  disabled: true\n`, '')
    const problems = checkNativeBundlePatch(broken, 'fixture', PRESET_IDS)
    assert.equal(problems.length, 1)
    assert.match(problems[0].message, new RegExp(`"${id}" is missing`))
  })

  test(`${id} re-enabled in the cowork bundle is caught`, () => {
    const broken = GOOD_COWORK_PATCH.replace(
      `- id: ${id}\n  disabled: true`,
      `- id: ${id}\n  disabled: false`
    )
    const problems = checkCoworkBundlePatch(broken, 'fixture', PRESET_IDS)
    assert.equal(problems.length, 1)
    assert.match(problems[0].message, new RegExp(`"${id}".*disabled: true`))
  })
}

// ── The conversation model lock (28/09/2026), in all three files ─────────────────────────────

/** The three patches, each with its own checker and fixture. */
const LOCKED_PATCHES = [
  ['fleet patch', GOOD_FLEET_PATCH, (/** @type {string} */ text) => checkFleetPatch(text, 'fixture'), false],
  [
    'native bundle',
    GOOD_NATIVE_PATCH,
    (/** @type {string} */ text) => checkNativeBundlePatch(text, 'fixture', PRESET_IDS),
    true
  ],
  [
    'cowork bundle',
    GOOD_COWORK_PATCH,
    (/** @type {string} */ text) => checkCoworkBundlePatch(text, 'fixture', PRESET_IDS),
    true
  ]
]

for (const [name, good, check, bundle] of LOCKED_PATCHES) {
  test(`the model picker disabled in the ${name} is caught`, () => {
    const problems = check(good.replace(PICKER_ROW, `- id: ${MODEL_LOCK.picker}\n  disabled: true\n`))
    assert.equal(problems.length, 1)
    assert.match(problems[0].message, /"ui-model-selection" must not be disabled/)
  })

  test(`the model picker row missing from the ${name} is caught`, () => {
    const problems = check(good.replace(PICKER_ROW, ''))
    assert.equal(problems.length, 1)
    assert.match(problems[0].message, /"ui-model-selection" is missing/)
  })

  test(`a second model picker row in the ${name} is caught, not read past`, () => {
    const problems = check(`${good}\n- id: ${MODEL_LOCK.picker}\n  disabled: false\n`)
    assert.equal(problems.length, 1)
    assert.match(problems[0].message, /"ui-model-selection" is declared 2 times/)
  })

  test(`the model picker inserted again under another id in the ${name} is caught`, () => {
    const problems = check(
      `${good}\n- insert:\n    - id: model-chip\n      name: '${MODEL_LOCK.pickerPackage}'\n`
    )
    assert.equal(problems.length, 1)
    assert.match(problems[0].message, /"model-chip" loads @deepseek-ai\/dsh-client-ui-model-selection again/)
  })

  test(`the model policy plugin disabled in the ${name} is caught`, () => {
    for (const value of ['true', "'yes'", '1']) {
      const problems = check(`${good}\n- id: ${MODEL_LOCK.policy}\n  disabled: ${value}\n`)
      assert.equal(problems.length, 1, value)
      assert.match(problems[0].message, /"tracy-mode-picker" must not be disabled/)
    }
    assert.deepEqual(check(`${good}\n- id: ${MODEL_LOCK.policy}\n  disabled: false\n`), [])
  })

  test(`customer plan routes on the model policy in the ${name} are caught, as a row or as an insert`, () => {
    const routes = `  config:\n    customerRoutes:\n      - provider: claude\n        model: claude-sonnet-5\n`
    const asRow = check(`${good}\n- id: ${MODEL_LOCK.policy}\n${routes}`)
    assert.equal(asRow.length, 1)
    assert.match(asRow[0].message, /"tracy-mode-picker" carries `customerRoutes`/)
    const asInsert = check(
      `${good}\n- insert:\n    - id: plan-policy\n      name: '${MODEL_LOCK.policyPackage}'\n      config:\n        customerRoutes:\n          - provider: claude\n            model: claude-sonnet-5\n`
    )
    assert.ok(
      asInsert.some((p) => /carries `customerRoutes`/.test(p.message)),
      JSON.stringify(asInsert)
    )
    // An empty config is not a plan.
    assert.deepEqual(check(`${good}\n- id: ${MODEL_LOCK.policy}\n  config: {}\n`), [])
  })

  test(`the deployment default disabled in the ${name} is caught`, () => {
    const problems = check(`${good}\n- id: ${MODEL_LOCK.defaultModel}\n  disabled: true\n`)
    assert.equal(problems.length, 1)
    assert.match(problems[0].message, /"agent-default-model" must not be disabled/)
  })

  if (bundle) {
    test(`the model policy plugin missing from the ${name} is caught`, () => {
      const problems = check(good.replace(POLICY_INSERT, ''))
      assert.equal(problems.length, 1)
      assert.match(problems[0].message, /no `insert:` row with id "tracy-mode-picker"/)
    })

    test(`the model policy inserted but disabled in the ${name} is caught`, () => {
      const problems = check(good.replace(POLICY_INSERT, `${POLICY_INSERT}      disabled: true\n`))
      assert.equal(problems.length, 1)
      assert.match(problems[0].message, /insert row "tracy-mode-picker" must not be disabled/)
    })

    test(`the model policy row naming another package in the ${name} is caught`, () => {
      const problems = check(good.replace(`'${MODEL_LOCK.policyPackage}'`, "'@tracy/dsh-something-else'"))
      assert.equal(problems.length, 1)
      assert.match(problems[0].message, /insert row "tracy-mode-picker" names/)
    })
  }
}

test('any stand-down row declared twice is caught, whichever of the two says what', () => {
  for (const id of ['sandbox', 'config-editor']) {
    const problems = checkFleetPatch(`${GOOD_FLEET_PATCH}\n- id: ${id}\n  disabled: false\n`, 'fixture')
    assert.equal(problems.length, 1, id)
    assert.match(problems[0].message, new RegExp(`"${id}" is declared 2 times`))
  }
})

test('an empty patch file is red, not green for want of rows', () => {
  for (const text of ['', '# only a comment\n', '{}\n']) {
    const problems = checkFleetPatch(text, 'fixture')
    assert.equal(problems.length, 1, JSON.stringify(text))
    assert.match(problems[0].message, /not a list of rows|does not parse as YAML/)
  }
})

test('the Models settings page stands down everywhere: no LLM sign-in on a shared host', () => {
  // `ui-settings-models` is dsh's own Models section; on a fleet host one dsh serves every seat, so
  // a sign-in there would be a credential of the whole host (tasks/todo-desktop-surface.md, ADR 0014).
  assert.equal(STANDS_DOWN.includes('ui-settings-models'), true)
  assert.equal(STANDS_DOWN.includes('authorization'), true)
})

test('Settings › Model plan is a desktop-app-only plugin', () => {
  assert.deepEqual(DESKTOP_ONLY, [{ id: 'tracy-model-plan', package: '@tracy/dsh-model-plan' }])
})

test('the native bundle inserting the Model plan section without `disabled: true` is red', () => {
  const broken = GOOD_NATIVE_PATCH.replace(
    "      name: '@tracy/dsh-model-plan'\n      disabled: true\n",
    "      name: '@tracy/dsh-model-plan'\n"
  )
  const problems = checkNativeBundlePatch(broken, 'fixture', PRESET_IDS)
  assert.equal(problems.length, 1)
  assert.match(problems[0].message, /insert row "tracy-model-plan" must carry `disabled: true`/)
})

test('the native bundle not inserting the Model plan section is red (the app could not turn it on)', () => {
  const broken = GOOD_NATIVE_PATCH.replace(DESKTOP_ONLY_INSERT, '')
  const problems = checkNativeBundlePatch(broken, 'fixture', PRESET_IDS)
  assert.equal(problems.length, 1)
  assert.match(problems[0].message, /no `insert:` row with id "tracy-model-plan"/)
})

test('the Model plan section switched back on by a later row is red, in the native bundle and in the fleet patch', () => {
  const on = '- id: tracy-model-plan\n  disabled: false\n'
  const native = checkNativeBundlePatch(`${GOOD_NATIVE_PATCH}${on}`, 'fixture', PRESET_IDS)
  assert.equal(native.length, 1)
  assert.match(native[0].message, /row "tracy-model-plan" must not switch the desktop-only plugin on/)
  const fleet = checkFleetPatch(
    GOOD_FLEET_PATCH.replace('accountSubscriptions: true', 'accountSubscriptions: false'),
    'fixture'
  )
  assert.equal(fleet.length, 1)
  assert.match(fleet[0].message, /requires the account-scoped model policy/)
})

test('the fleet patch without its own Model plan stand-down is red', () => {
  const problems = checkFleetPatch(
    GOOD_FLEET_PATCH.replace('- id: tracy-model-plan\n  disabled: false\n', ''),
    'fixture'
  )
  assert.equal(problems.length, 1)
  assert.match(problems[0].message, /requires the account-scoped model policy/)
})

test('shortcuts and job-controller are NOT required off (ui-layout needs one, the sidebar the other)', () => {
  assert.equal(STANDS_DOWN.includes('shortcuts'), false)
  assert.equal(STANDS_DOWN.includes('job-controller'), false)
})

test('tools.config.mode drifting off native is caught', () => {
  const broken = GOOD_FLEET_PATCH.replace('mode: native', 'mode: subagent')
  const problems = checkFleetPatch(broken, 'fixture')
  assert.equal(problems.length, 1)
  assert.match(problems[0].message, /"tools".*mode: native/)
})

test('tools row missing entirely is caught', () => {
  const broken = GOOD_FLEET_PATCH.replace('- id: tools\n  config:\n    mode: native\n', '')
  const problems = checkFleetPatch(broken, 'fixture')
  assert.equal(problems.length, 1)
  assert.match(problems[0].message, /"tools" is missing/)
})

test('webserver host drifting off 0.0.0.0 is caught', () => {
  const broken = GOOD_FLEET_PATCH.replace('host: 0.0.0.0', 'host: 127.0.0.1')
  const problems = checkFleetPatch(broken, 'fixture')
  assert.equal(problems.length, 1)
  assert.match(problems[0].message, /"webserver".*config\.host/)
})

test('webserver port drifting off 51700 is caught', () => {
  const broken = GOOD_FLEET_PATCH.replace('port: 51700', 'port: 8080')
  const problems = checkFleetPatch(broken, 'fixture')
  assert.equal(problems.length, 1)
  assert.match(problems[0].message, /"webserver".*config\.port/)
})

test('a missing tracy-sandbox-docker insert row is caught', () => {
  const broken = GOOD_FLEET_PATCH.replace(
    "    - id: tracy-sandbox-docker\n      name: '@tracy/dsh-sandbox-docker'\n",
    ''
  )
  const problems = checkFleetPatch(broken, 'fixture')
  assert.equal(problems.length, 1)
  assert.match(problems[0].message, /insert:` row with id "tracy-sandbox-docker"/)
})

test('a missing tracy-subprocess-docker insert row is caught', () => {
  const broken = GOOD_FLEET_PATCH.replace(
    "    - id: tracy-subprocess-docker\n      name: '@tracy/dsh-subprocess-docker'\n",
    ''
  )
  const problems = checkFleetPatch(broken, 'fixture')
  assert.equal(problems.length, 1)
  assert.match(problems[0].message, /insert:` row with id "tracy-subprocess-docker"/)
})

test('an inserted row renamed to the wrong package is caught', () => {
  const broken = GOOD_FLEET_PATCH.replace(
    "name: '@tracy/dsh-sandbox-docker'",
    "name: '@tracy/dsh-sandbox-docker-v2'"
  )
  const problems = checkFleetPatch(broken, 'fixture')
  assert.equal(problems.length, 1)
  assert.match(
    problems[0].message,
    /names "@tracy\/dsh-sandbox-docker-v2", expected "@tracy\/dsh-sandbox-docker"/
  )
})

// dsh-better-sidebar 0.21 removed the Terminal tab and tab seeding, so the old four-key row
// (`shell`, `seedTabs`, `seedFilesTab`, `tabsEnabled.terminal`) configured nothing. What the gate
// holds now: the fence is stated in BOTH layers, and no removed key survives to read as a decision.
test('better-sidebar losing workspaceFence is caught, in the fleet patch and in the native bundle', () => {
  const fleet = checkFleetPatch(GOOD_FLEET_PATCH.replace('    workspaceFence: true\n', ''), 'fixture')
  assert.equal(fleet.length, 1)
  assert.match(fleet[0].message, /"better-sidebar".*workspaceFence: true/)
  const native = checkNativeBundlePatch(
    GOOD_NATIVE_PATCH.replace('    workspaceFence: true\n', '    workspaceFence: false\n'),
    'fixture',
    PRESET_IDS
  )
  assert.equal(native.length, 1)
  assert.match(native[0].message, /"better-sidebar".*workspaceFence: true/)
})

test('a better-sidebar row missing entirely is caught in the native bundle', () => {
  const broken = GOOD_NATIVE_PATCH.replace('- id: better-sidebar\n  config:\n    workspaceFence: true\n', '')
  const problems = checkNativeBundlePatch(broken, 'fixture', PRESET_IDS)
  assert.equal(problems.length, 1)
  assert.match(problems[0].message, /"better-sidebar" is missing/)
})

for (const [key, yaml] of [
  ['shell', '    shell: /bin/bash\n'],
  ['seedTabs', '    seedTabs: []\n'],
  ['seedFilesTab', '    seedFilesTab: false\n'],
  ['openByDefault', '    openByDefault: true\n'],
  ['browserNoSandbox', '    browserNoSandbox: true\n'],
  ['tabsEnabled.terminal', '    tabsEnabled:\n      terminal: false\n']
]) {
  test(`a better-sidebar row carrying the removed key ${key} is caught`, () => {
    const broken = GOOD_FLEET_PATCH.replace('    workspaceFence: true\n', `    workspaceFence: true\n${yaml}`)
    const problems = checkFleetPatch(broken, 'fixture')
    assert.equal(problems.length, 1, JSON.stringify(problems))
    assert.match(
      problems[0].message,
      new RegExp(`"better-sidebar" carries \\\`config\\.${key.replace('.', '\\.')}`)
    )
  })
}

test('tabsEnabled for a tab that still exists is not flagged', () => {
  const ok = GOOD_FLEET_PATCH.replace(
    '    workspaceFence: true\n',
    '    workspaceFence: true\n    tabsEnabled:\n      editor: true\n'
  )
  assert.deepEqual(checkFleetPatch(ok, 'fixture'), [])
})

test('a !!js tag anywhere in the fleet patch is caught', () => {
  const broken = `${GOOD_FLEET_PATCH}\n# not real: !!js/function 'function () { return 1 }'\n`
  const problems = checkFleetPatch(broken, 'fixture')
  assert.equal(problems.length, 1)
  assert.match(problems[0].message, /!!js/)
})

test('directory-picker re-enabled in the native bundle patch is caught', () => {
  const broken = GOOD_NATIVE_PATCH.replace(
    '- id: directory-picker\n  disabled: true',
    '- id: directory-picker\n  disabled: false'
  )
  const problems = checkNativeBundlePatch(broken, 'fixture', PRESET_IDS)
  assert.equal(problems.length, 1)
  assert.match(problems[0].message, /"directory-picker".*disabled: true/)
})

test('a missing directory-picker-browse insert row is caught', () => {
  const broken = GOOD_NATIVE_PATCH.replace(
    "    - id: directory-picker-browse\n      name: '@deepseek-ai/dsh-host-directory-picker-browse'\n",
    ''
  )
  const problems = checkNativeBundlePatch(broken, 'fixture', PRESET_IDS)
  assert.equal(problems.length, 1)
  assert.match(problems[0].message, /insert:` row with id "directory-picker-browse"/)
})

test('no ui-directory-picker-browse row is required: a workspace is a site, made by Add site only', () => {
  assert.equal(GOOD_NATIVE_PATCH.includes('ui-directory-picker-browse'), false)
  assert.deepEqual(checkNativeBundlePatch(GOOD_NATIVE_PATCH, 'fixture', PRESET_IDS), [])
})

test('ui-brand-official re-enabled in the native bundle patch is caught', () => {
  const broken = GOOD_NATIVE_PATCH.replace(
    '- id: ui-brand-official\n  disabled: true',
    '- id: ui-brand-official\n  disabled: false'
  )
  const problems = checkNativeBundlePatch(broken, 'fixture', PRESET_IDS)
  assert.equal(problems.length, 1)
  assert.match(problems[0].message, /"ui-brand-official".*disabled: true/)
})

test('a !!js tag anywhere in the native bundle patch is caught', () => {
  const broken = `${GOOD_NATIVE_PATCH}\n# not real: !!js/function 'function () { return 1 }'\n`
  const problems = checkNativeBundlePatch(broken, 'fixture', PRESET_IDS)
  assert.equal(problems.length, 1)
  assert.match(problems[0].message, /!!js/)
})

test('profile/package.json bundles drifting from the expected five is caught', () => {
  const good = JSON.stringify({
    dsh: {
      profile: {
        bundles: [
          '@deepseek-ai/dsh-base',
          '@deepseek-ai/dsh-web-app',
          'dsh-better-sidebar',
          '@goodandready/dsh-subscriptions',
          '@tracy/dsh-native-bundle'
        ]
      }
    }
  })
  assert.deepEqual(checkProfilePackage(good, 'fixture'), [])

  const missingOne = JSON.stringify({
    dsh: {
      profile: {
        bundles: [
          '@deepseek-ai/dsh-base',
          '@deepseek-ai/dsh-web-app',
          'dsh-better-sidebar',
          '@goodandready/dsh-subscriptions'
        ]
      }
    }
  })
  const problems = checkProfilePackage(missingOne, 'fixture')
  assert.equal(problems.length, 1)
  assert.match(problems[0].message, /dsh\.profile\.bundles must be exactly/)

  const extraOne = JSON.stringify({
    dsh: {
      profile: {
        bundles: [
          '@deepseek-ai/dsh-base',
          '@deepseek-ai/dsh-web-app',
          'dsh-better-sidebar',
          '@goodandready/dsh-subscriptions',
          '@tracy/dsh-native-bundle',
          '@tracy/dsh-extra-bundle'
        ]
      }
    }
  })
  assert.equal(checkProfilePackage(extraOne, 'fixture').length, 1)
})

test('entrypoint.sh missing the MCP_GATEWAY_SSH_ENDPOINTS write is caught', () => {
  const good =
    'MCP_GATEWAY_SSH_ENDPOINTS=owner:ws:/sidebar/ws/terminal,owner:ws:/sidebar/ws/agent-terminals\nrequired "$DSH_HOME/profiles/native/node_modules/@tracy/dsh-native-bundle/package.json"\n'
  assert.deepEqual(checkEntrypoint(good, 'fixture'), [])

  const broken = good.replace(
    'MCP_GATEWAY_SSH_ENDPOINTS=owner:ws:/sidebar/ws/terminal,owner:ws:/sidebar/ws/agent-terminals\n',
    ''
  )
  const problems = checkEntrypoint(broken, 'fixture')
  assert.equal(problems.length, 1)
  assert.match(problems[0].message, /MCP_GATEWAY_SSH_ENDPOINTS/)
})

test('entrypoint.sh missing the profile-masked guard is caught', () => {
  const good =
    'MCP_GATEWAY_SSH_ENDPOINTS=owner:ws:/sidebar/ws/terminal,owner:ws:/sidebar/ws/agent-terminals\nrequired "$DSH_HOME/profiles/native/node_modules/@tracy/dsh-native-bundle/package.json"\n'
  const broken = good.replace(
    'required "$DSH_HOME/profiles/native/node_modules/@tracy/dsh-native-bundle/package.json"\n',
    ''
  )
  const problems = checkEntrypoint(broken, 'fixture')
  assert.equal(problems.length, 1)
  assert.match(problems[0].message, /profile-masked guard/)
})

test('both entrypoint markers missing produces two problems, not a crash', () => {
  const problems = checkEntrypoint('#!/bin/sh\necho hi\n', 'fixture')
  assert.equal(problems.length, 2)
})

// ---- The bundle names a plugin the image never copies --------------------------------------

test('a plugin in the bundle with no COPY line is caught — the failure of 08/09, exactly', () => {
  // The real shape of it: `@tracy/dsh-site-build` arrived in the bundle with the merge of `main`,
  // the Dockerfile's COPY list did not gain a line, and every gate stayed green while `tracy-dsh`
  // crash-looped fourteen times on a host.
  const bundle = JSON.stringify({
    dependencies: { '@tracy/dsh-site-tabs': 'workspace:^', '@tracy/dsh-site-build': 'workspace:^' }
  })
  const docker =
    'COPY packages/site/tracy-site-tabs /desk-home/profiles/native/node_modules/@tracy/dsh-site-tabs\n'
  const problems = checkBundleCopiedIntoImage(bundle, docker, 'fixture')
  assert.equal(problems.length, 1)
  assert.match(problems[0].message, /dsh-site-build/)
  assert.match(problems[0].message, /Cannot find package/)
})

test('the name is read from the COPY DESTINATION, not the source directory', () => {
  // They are not required to match, and twice they have not: `packages/design/tracy-design-system`
  // lands as `@tracy/dsh-design-inspiration`. A check written against the source path would call
  // a correctly copied plugin missing, and the gate would be red for a reason that is not true.
  const bundle = JSON.stringify({ dependencies: { '@tracy/dsh-design-inspiration': 'workspace:^' } })
  const docker =
    'COPY packages/design/tracy-design-inspiration /desk-home/profiles/native/node_modules/@tracy/dsh-design-inspiration\n'
  assert.deepEqual(checkBundleCopiedIntoImage(bundle, docker, 'fixture'), [])
})

test('a bundle whose JSON does not parse is one problem, not a crash', () => {
  const problems = checkBundleCopiedIntoImage('{ not json', 'COPY x\n', 'fixture')
  assert.equal(problems.length, 1)
  assert.match(problems[0].message, /unreadable JSON/)
})

test('a bundle naming nothing @tracy is green — nothing to copy is not a fault', () => {
  const bundle = JSON.stringify({ dependencies: { cordis: '^3', 'js-yaml': '^4' } })
  assert.deepEqual(checkBundleCopiedIntoImage(bundle, '', 'fixture'), [])
})

// ── 28/09/2026: the host skill row stays down, so each preset's skills are its own ────────────

test('the host skill-filesystem row switched back on is caught in both bundles (every preset would get every skill)', () => {
  const on = (/** @type {string} */ patch) =>
    patch.replace(
      `- id: ${HOST_SKILL_ROW}\n  disabled: true`,
      `- id: ${HOST_SKILL_ROW}\n  disabled: false\n  config:\n    customSkillDirs:\n      - /opt/tracy/skills`
    )
  const native = checkNativeBundlePatch(on(GOOD_NATIVE_PATCH), 'fixture', PRESET_IDS)
  assert.equal(native.length, 1)
  assert.match(native[0].message, /"skill-filesystem".*disabled: true/)
  const cowork = checkCoworkBundlePatch(on(GOOD_COWORK_PATCH), 'fixture', PRESET_IDS)
  assert.equal(cowork.length, 1)
  assert.match(cowork[0].message, /"skill-filesystem".*disabled: true/)
  // Missing is red too: `dsh-web-app` disables it today, but the decision must be the bundle's own.
  const gone = checkNativeBundlePatch(GOOD_NATIVE_PATCH.replace(SKILL_ROW, ''), 'fixture', PRESET_IDS)
  assert.equal(gone.length, 1)
  assert.match(gone[0].message, /"skill-filesystem" is missing/)
})

// ── Approvals: no session waits on a question no seat can see (29/09/2026) ──────────────────────

test("the approval decision names dsh-base's three presets and the never policy", () => {
  assert.equal(APPROVAL_POLICY.policy, 'never')
  assert.deepEqual([...APPROVAL_POLICY.presets], ['read-only', 'workspace-write', 'danger-full-access'])
})

test('the native bundle without its approval row is red', () => {
  const broken = GOOD_NATIVE_PATCH.replace('- id: approval\n  config:\n    policy: never\n', '')
  const problems = checkNativeBundlePatch(broken, 'fixture', PRESET_IDS)
  assert.equal(problems.length, 1, JSON.stringify(problems))
  assert.match(problems[0].message, /"approval" is missing/)
})

test("the native bundle's approval row back on dsh's `ask` is red", () => {
  const broken = GOOD_NATIVE_PATCH.replace('    policy: never\n', '    policy: ask\n')
  const problems = checkNativeBundlePatch(broken, 'fixture', PRESET_IDS)
  assert.equal(problems.length, 1, JSON.stringify(problems))
  assert.match(problems[0].message, /"approval" must carry `config\.policy: never`, found "ask"/)
})

test('one preset saying `ask` is red — a new session is pinned its preset, not the service default', () => {
  const broken = GOOD_NATIVE_PATCH.replace(
    '        sandbox: workspace-write\n        approval: never\n',
    '        sandbox: workspace-write\n        approval: ask\n'
  )
  const problems = checkNativeBundlePatch(broken, 'fixture', PRESET_IDS)
  assert.equal(problems.length, 1, JSON.stringify(problems))
  assert.match(problems[0].message, /preset "workspace-write" must carry `approval: never`, found "ask"/)
})

test('an extra preset is held to the same policy', () => {
  const broken = GOOD_NATIVE_PATCH.replace(
    '      danger-full-access:\n',
    '      review:\n        sandbox: read-only\n        approval: ask\n      danger-full-access:\n'
  )
  const problems = checkNativeBundlePatch(broken, 'fixture', PRESET_IDS)
  assert.equal(problems.length, 1, JSON.stringify(problems))
  assert.match(problems[0].message, /preset "review" must carry `approval: never`/)
})

test('the workspace-write preset dropped, or given another mode, is red — no default would match at boot', () => {
  const dropped = GOOD_NATIVE_PATCH.replace(
    '      workspace-write:\n        sandbox: workspace-write\n        approval: never\n',
    ''
  )
  const gone = checkNativeBundlePatch(dropped, 'fixture', PRESET_IDS)
  assert.equal(gone.length, 1, JSON.stringify(gone))
  assert.match(gone[0].message, /must keep preset "workspace-write" with `sandbox: workspace-write`/)
  const moved = GOOD_NATIVE_PATCH.replace(
    '      workspace-write:\n        sandbox: workspace-write\n',
    '      workspace-write:\n        sandbox: danger-full-access\n'
  )
  const wrong = checkNativeBundlePatch(moved, 'fixture', PRESET_IDS)
  assert.equal(wrong.length, 1, JSON.stringify(wrong))
  assert.match(wrong[0].message, /must keep preset "workspace-write" with `sandbox: workspace-write`/)
})

test('a permission row without its presets table is red — a patch by id replaces the whole config', () => {
  const broken = GOOD_NATIVE_PATCH.replace(
    /- id: permission\n {2}config:\n {4}presets:\n(?: {6}.*\n)+/,
    '- id: permission\n  config: {}\n'
  )
  const problems = checkNativeBundlePatch(broken, 'fixture', PRESET_IDS)
  assert.equal(problems.length, 1, JSON.stringify(problems))
  assert.match(problems[0].message, /"permission" must carry `config\.presets`/)
})

test('the approval row disabled or declared twice is red', () => {
  const disabled = GOOD_NATIVE_PATCH.replace(
    '- id: approval\n  config:\n    policy: never\n',
    '- id: approval\n  disabled: true\n'
  )
  const off = checkNativeBundlePatch(disabled, 'fixture', PRESET_IDS)
  assert.equal(off.length, 1, JSON.stringify(off))
  assert.match(off[0].message, /"approval" must not be disabled/)
  const twice = checkNativeBundlePatch(
    `${GOOD_NATIVE_PATCH}- id: approval\n  config:\n    policy: never\n`,
    'fixture',
    PRESET_IDS
  )
  assert.equal(twice.length, 1, JSON.stringify(twice))
  assert.match(twice[0].message, /"approval" is declared 2 times/)
})

test('the fleet patch need not restate the approval rows, but a restated `ask` is red', () => {
  assert.deepEqual(checkFleetPatch(`${GOOD_FLEET_PATCH}${APPROVAL_ROWS}`, 'fixture'), [])
  const asks = checkFleetPatch(`${GOOD_FLEET_PATCH}- id: approval\n  config:\n    policy: ask\n`, 'fixture')
  assert.equal(asks.length, 1, JSON.stringify(asks))
  assert.match(asks[0].message, /"approval" must carry `config\.policy: never`/)
  const presetAsks = checkFleetPatch(
    `${GOOD_FLEET_PATCH}${APPROVAL_ROWS.replace(
      '        sandbox: read-only\n        approval: never\n',
      '        sandbox: read-only\n        approval: ask\n'
    )}`,
    'fixture'
  )
  assert.equal(presetAsks.length, 1, JSON.stringify(presetAsks))
  assert.match(presetAsks[0].message, /preset "read-only" must carry `approval: never`/)
})

test('the cowork bundle is not held to it: its owner sees the question, and a wider mode is real there', () => {
  assert.deepEqual(checkCoworkBundlePatch(GOOD_COWORK_PATCH, 'fixture', PRESET_IDS), [])
})

test('the host-wide subscription adapter cannot be enabled beside account routing', () => {
  const problems = checkFleetPatch(
    GOOD_FLEET_PATCH.replace(
      '- id: dsh-subscriptions\n  disabled: true',
      '- id: dsh-subscriptions\n  disabled: false'
    ),
    'fixture'
  )
  assert.equal(problems.length, 1)
  assert.match(problems[0].message, /dsh-subscriptions/)
})

test("the fleet model row losing the catalogue row's toolUpdate is red (every tool change drops the prefix cache)", () => {
  const broken = GOOD_FLEET_PATCH.replace('        toolUpdate: addition-only\n', '')
  const problems = checkFleetPatch(broken, 'fixture')
  assert.equal(problems.length, 1)
  assert.match(problems[0].message, /model "deepseek-flash" must carry `toolUpdate: addition-only`/)
})

test("a fleet retryable-code list without one of dsh's defaults is red (the list replaces them)", () => {
  const broken = GOOD_FLEET_PATCH.replace('RATE_LIMIT, ', '')
  const problems = checkFleetPatch(broken, 'fixture')
  assert.equal(problems.length, 1)
  assert.match(problems[0].message, /without dsh's default RATE_LIMIT/)
  assert.deepEqual(MODEL_ROW.defaultRetryable, [
    'EMPTY_RESPONSE',
    'RATE_LIMIT',
    'SERVER',
    'TIMEOUT',
    'TRANSPORT'
  ])
})

test('the fleet model row without the measured reasoning effort is red (PR #1026)', () => {
  const broken = GOOD_FLEET_PATCH.replace('    reasoningEffort: low\n', '')
  const problems = checkFleetPatch(broken, 'fixture')
  assert.equal(problems.length, 1)
  assert.match(problems[0].message, /must set `reasoningEffort: low`/)
})
