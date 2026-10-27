/**
 * Classification: for every denominator item and every required edge tag, one of
 *   case — a deterministic case covers it (a spec is returned),
 *   na   — the tag cannot apply, with a reason and a source that proves it,
 *   open — nothing written yet (reason says why). Never counted as covered.
 * The tables below are the only place that decides this; the generator walks them and the runner
 * dispatches on the `assertion` each spec names.
 */
import { ALL_TAGS, CMS_LIST } from './catalogue.mjs'
import { FENCE_TOOLS, GUARD_TEXT } from './fence.mjs'

/** Oracles: the independent statements a requirement is judged against. Quotes are verified by the generator. */
export const ORACLES = Object.freeze({
  'CONTEXT-isolation': { source: 'CONTEXT.md', quote: 'The AI only touches the site it was given' },
  'CONTEXT-visible': { source: 'CONTEXT.md', quote: 'everything it changes shows in Site changes' },
  'SYSTEM-4a-guard': { source: 'SYSTEM.md', quote: 'refuses a `workdir`' },
  'SYSTEM-4a-container': {
    source: 'SYSTEM.md',
    quote: 'runs `docker exec -u www-data|nobody` into `<label>-web-1`'
  },
  'SYSTEM-4a-dotdot': { source: 'SYSTEM.md', quote: "the provider's label and `..` check" },
  'SYSTEM-4b-fence': { source: 'SYSTEM.md', quote: "must lie inside `<sitesRoot>/<the session's label>`" },
  'SYSTEM-4c-apply': { source: 'SYSTEM.md', quote: 'on behalf of the person typing' },
  'SYSTEM-4d-changed': { source: 'SYSTEM.md', quote: 'success to `POST /api/sites/:key/changed`' },
  'SYSTEM-5-turn': { source: 'SYSTEM.md', quote: 'One chat or comment turn: who, what words' },
  'ADR0014-3': {
    source: 'docs/adr/0014-one-dsh-per-host-commands-in-web-container.md',
    quote: 'Files go through the MOUNT, not through exec'
  },
  'MATRIX-union': { source: 'config/mode-matrix.json', quote: 'a real preset = role ∪ platform' },
  'MATRIX-skills': {
    source: 'config/mode-matrix.json',
    quote: 'a skill with a platform column follows the platform; the rest follow the role'
  },
  'NATIVE-approval': {
    source: 'packages/bundle/tracy-native/cordis.patch.yml',
    quote: 'So every preset says `approval: never`'
  },
  'FLEET-container': {
    source: 'packages/fleet/tracy-fleet-operation/dsh/profile/cordis.patch.yml',
    quote: 'The container is the sandbox (Plan 1)'
  },
  'CATALOGUE-surfaces': {
    source: 'apps/tracy-web/src/api-reference/sources/agent-tools.json',
    quote: '"applyDoor": "POST /api/sites/{key}/apply"'
  },
  // The task brief and the master plan are not in the repository: pinned as text, flagged external.
  'PLAN-approval': {
    source: 'qa-suite plan §4 `harness` (outside the repository, translated from Vietnamese)',
    quote:
      'Add no Approve step for the customer. Check `approval: never`, that escalation is refused and that a legacy `ask` session is answered `rejected` without hanging.',
    external: true
  },
  'PLAN-lifecycle': {
    source: 'qa-suite plan §4 `harness` (outside the repository, translated from Vietnamese)',
    quote:
      'Check routing to the right site/CMS, tool schema, traversal/symlink, missing cwd, permission revoked mid-session, retry/cancel, stream errors, provider loss and that Site changes records the right actor/source.',
    external: true
  }
})

const SCRATCH = {
  reads: ['scratch fixture sites', 'scratch host canaries'],
  writes: ['scratch fixture sites'],
  mail: false,
  model: false,
  containers: false
}
const STATIC = {
  reads: ['repository declarations'],
  writes: [],
  mail: false,
  model: false,
  containers: false
}
const PREREQ_RUNTIME = ['dsh-built-submodule', 'tracy-sandbox-docker', 'tracy-subprocess-docker']

const CONFIG_NA = {
  reason:
    'a configuration row has no runtime behaviour of its own; its effect is judged at the tool it switches',
  source: 'config/mode-matrix.json $comment'
}
const DEFAULT_OPEN = 'no deterministic case written for this obligation yet'

/** `fs-fence:glob.pattern` → `fs-fence-glob-pattern`. */
export const keyOf = (id) => id.replace(/[^A-Za-z0-9_]+/g, '-').replace(/^-|-$/g, '')
const k = (toolKey) => toolKey.replace(':', '+')

const caseSpec = (scope, variant, assertion, tags, requirement, oracle, invariant, extra = {}) => ({
  id: `QA-HARNESS-${scope}-${variant}`,
  assertion,
  tags,
  requirement,
  oracle: {
    ...(ORACLES[oracle] === undefined ? { source: oracle } : { source: ORACLES[oracle].source }),
    ref: oracle,
    invariant
  },
  effects: extra.effects ?? SCRATCH,
  prerequisites: extra.prerequisites ?? PREREQ_RUNTIME,
  ...(extra.red ? { red: extra.red } : {})
})

const FENCE_TEXT = {
  'happy-inside': [
    "A path inside the session's own site is accepted by the tool and reaches the backend",
    'ADR0014-3',
    'a call naming a file in the session site succeeds and its effect lands in that site'
  ],
  'happy-content': [
    'Content arguments are never judged as paths',
    'SYSTEM-4b-fence',
    'file content or a regex that names host folders is accepted in-site: only path arguments are fenced'
  ],
  empty: [
    'An empty path argument is refused, never passed to the backend',
    'SYSTEM-4b-fence',
    'a path that cannot be shown to lie inside the site is refused (fail closed)'
  ],
  'invalid-type': [
    'A non-string path argument is refused before the backend',
    'SYSTEM-4b-fence',
    'a number where a path is declared never reaches the file backend'
  ],
  'schema-missing': [
    'A missing required path argument is a schema error with no backend call',
    'SYSTEM-4b-fence',
    'dsh validation refuses the call before any fence entry or backend runs'
  ],
  'boundary-prefix-sibling': [
    'A sibling site whose label starts with the session label is outside the site',
    'CONTEXT-isolation',
    'a1x is not a1: containment is by path segment, not by string prefix'
  ],
  'boundary-dotdot-inside': [
    'A ".." that stays inside the site is judged by the resolved path',
    'SYSTEM-4a-dotdot',
    'file tools accept an in-site dotdot; shell providers refuse any ".." in a working directory'
  ],
  'traversal-abs': [
    'An absolute path that climbs out of the site with ".." is refused',
    'CONTEXT-isolation',
    'the resolved path of a/../b is judged, so the climb into site B is refused'
  ],
  'traversal-rel': [
    'A relative path that climbs out of the site is refused',
    'CONTEXT-isolation',
    'a relative ../b1/... resolves against the session workspace and leaves the site'
  ],
  'symlink-file': [
    "A symlink in the site that leads to another site's file is refused",
    'SYSTEM-4b-fence',
    "every path is realpath-ed: a link to site B's canary is outside the site"
  ],
  'symlink-dir-new': [
    'A new file under a symlinked directory that leads out of the site is refused',
    'SYSTEM-4b-fence',
    'a destination that does not exist yet is judged through its nearest existing ancestor'
  ],
  'symlink-inside': [
    'A symlink that stays inside the site is accepted',
    'SYSTEM-4b-fence',
    'realpath of an in-site link is in-site, so the tool works through it'
  ],
  'other-site': [
    'A path in another site is refused while its own session can use it',
    'CONTEXT-isolation',
    "site B's canary is reachable from a session on B and not from a session on A"
  ],
  'host-deskhome': [
    "The host's own folder (seat book, keys) is refused",
    'ADR0014-3',
    'a path under /desk-home is outside every site'
  ],
  'host-outside': [
    'A path outside the sites root is refused',
    'SYSTEM-4b-fence',
    'a file beside the sites root is outside every site'
  ],
  'host-etc': ['A system path is refused', 'SYSTEM-4b-fence', '/etc/hosts exists and is outside the site'],
  'missing-cwd': [
    'A session with no workspace cannot use a path tool',
    'SYSTEM-4b-fence',
    'with nothing to check the path against the call is refused (fail closed)'
  ],
  repeat: [
    'The same refused call is refused identically every time',
    'CONTEXT-isolation',
    'a denial is not a one-shot: a second identical call is denied the same way'
  ],
  escalation: [
    'Asking for a wider sandbox never widens the fence',
    'PLAN-approval',
    'sandbox_permissions: danger-full-access does not make a host path reachable'
  ]
}

function fenceItem(item) {
  const { tool, arg } = item.meta
  const toolKey = tool === 'glob' && arg === 'pattern' ? 'glob:pattern' : tool
  const tk = k(toolKey)
  const scope = keyOf(item.id)
  const spec = FENCE_TOOLS[toolKey]
  const plan = {}
  const add = (tag, specs) => (plan[tag] = { status: 'case', specs: [].concat(specs) })
  const fence = (variant, tag, extra = {}) => {
    const [req, oracle, invariant] = FENCE_TEXT[variant]
    return caseSpec(
      scope,
      variant,
      `harness.fence.${tk}.${variant}`,
      [tag],
      `${tool}.${arg}: ${req}`,
      oracle,
      invariant,
      extra
    )
  }
  const meta = item.meta
  add('happy', [
    fence('happy-inside', 'happy'),
    ...(spec?.content !== undefined ? [fence('happy-content', 'happy')] : [])
  ])
  add('empty', fence('empty', 'empty'))
  add('invalid', fence('invalid-type', 'invalid'))
  plan['schema-invalid'] =
    meta.required === true
      ? { status: 'case', specs: [fence('schema-missing', 'schema-invalid')] }
      : meta.required === false
        ? {
            status: 'na',
            reason: `${arg} is optional in the live ${tool} schema: omitting it is a valid call`,
            source: 'live tool registry (ctx.tools.schemas()) — `required` of ' + tool
          }
        : { status: 'open', reason: 'the live tool schema was not extracted' }
  add('boundary', [fence('boundary-prefix-sibling', 'boundary'), fence('boundary-dotdot-inside', 'boundary')])
  add('traversal', [fence('traversal-abs', 'traversal'), fence('traversal-rel', 'traversal')])
  add('symlink', [
    fence('symlink-file', 'symlink'),
    fence('symlink-dir-new', 'symlink'),
    fence('symlink-inside', 'symlink')
  ])
  add('other-site', fence('other-site', 'other-site'))
  add('host-path', [
    fence('host-deskhome', 'host-path'),
    fence('host-outside', 'host-path'),
    fence('host-etc', 'host-path')
  ])
  add('missing-cwd', fence('missing-cwd', 'missing-cwd'))
  add('repeat', fence('repeat', 'repeat'))
  plan['permission-escalation'] = meta.escalation
    ? { status: 'case', specs: [fence('escalation', 'permission-escalation')] }
    : {
        status: 'na',
        reason: `the live ${tool} schema has no sandbox_permissions property, so a call cannot ask for a wider mode`,
        source: 'live tool registry (ctx.tools.schemas()) — properties of ' + tool
      }
  add(
    'audit-effect',
    caseSpec(
      scope,
      'audit',
      `harness.audit.${tk}`,
      ['audit-effect'],
      `${tool}.${arg}: an allowed call leaves the turn record (opened, closed, signed as the person who typed)`,
      'SYSTEM-5-turn',
      'the host opens the turn and closes its moment with actor, label and source=panel'
    )
  )
  // routing
  if (['read', 'grep', 'write'].includes(toolKey) || toolKey === 'glob')
    add(
      'routing',
      caseSpec(
        scope,
        'routing',
        `harness.route.files.${tool}`,
        ['routing'],
        `${tool}: a relative path resolves inside the session's OWN site`,
        'CONTEXT-isolation',
        'two sessions on two sites using the same relative path each get their own site'
      )
    )
  else if (toolKey === 'bash') add('routing', routeShellSpecs())
  else
    plan.routing = {
      status: 'open',
      reason: spec?.fixture
        ? 'pwsh / terminal_open are not loaded on this host: a fixture backend stands behind the real hooks, so routing to a real backend is not exercised'
        : 'a relative-path routing check for this tool is not written (str_replace_editor demands an absolute path; edit/read_image not written)'
    }
  // dependency / failure
  if (toolKey === 'bash') {
    add(
      'dependency-failure',
      dispatchSpec(
        'docker-down',
        'harness.dispatch.docker-down',
        ['dependency-failure'],
        'The docker daemon is unreachable: bounded and visible',
        'settles, error visible, bounded attempts'
      )
    )
    add(
      'tool-failure',
      dispatchSpec(
        'tool-failure-shell-exit',
        'harness.dispatch.tool-failure.shell-exit',
        ['tool-failure'],
        'A failing shell command is reported once, not retried, and the session continues',
        'one docker exec, the failure visible, the next call works'
      )
    )
    add(
      'cancel',
      dispatchSpec(
        'cancel-shell-hang',
        'harness.dispatch.cancel.shell-hang',
        ['cancel'],
        'Cancelling a long shell command ends it and leaves no process behind',
        'the turn settles in bounded time and the spawned child is gone'
      )
    )
  } else if (toolKey === 'read') {
    plan['dependency-failure'] = {
      status: 'na',
      reason:
        'file tools run inside the dsh process on a mount (no container, daemon or network between the call and the file)',
      source:
        'SYSTEM.md §4b: "run **inside the `tracy-dsh` process**, on the `/site/<label>` mount, not through `exec`"'
    }
    add(
      'tool-failure',
      dispatchSpec(
        'tool-failure-missing-file',
        'harness.dispatch.tool-failure.missing-file',
        ['tool-failure'],
        'A missing file is an error result, not a crash or a fence denial, and the session continues',
        'isError result that is not a fence message; the next call works'
      )
    )
  } else if (spec?.fixture) {
    plan['dependency-failure'] = {
      status: 'open',
      reason: 'fixture backend: no real daemon path is exercised for this tool'
    }
  } else {
    plan['dependency-failure'] = {
      status: 'na',
      reason:
        'file tools run inside the dsh process on a mount (no container, daemon or network between the call and the file)',
      source:
        'SYSTEM.md §4b: "run **inside the `tracy-dsh` process**, on the `/site/<label>` mount, not through `exec`"'
    }
  }
  plan['unknown-tool'] = {
    status: 'na',
    reason:
      'name resolution happens before any argument is read: an unregistered name never reaches a fence entry',
    source: 'case QA-HARNESS-dispatcher-session-loop-unknown-tool (the dispatcher item)'
  }
  plan['stream-failure'] = {
    status: 'na',
    reason: 'a broken model stream ends the turn independent of which tool or argument was named',
    source: 'cases QA-HARNESS-dispatcher-session-loop-stream-* (the dispatcher item)'
  }
  plan.cleanup = { status: 'case', specs: [cleanupSpec()] }
  return plan
}

/** Cases whose scope is the dispatcher, shared by every item that depends on them (one case, many items). */
const dispatchSpec = (variant, assertion, tags, requirement, invariant) =>
  caseSpec('dispatcher-session-loop', variant, assertion, tags, requirement, 'PLAN-lifecycle', invariant)
const SHELL_LABEL = { wordpress: 'a1', joomla: 'b1', emdash: 'c1' }
const routeShellSpecs = () =>
  CMS_LIST.map((cms) =>
    caseSpec(
      'dispatcher-session-loop',
      `routing-${cms}`,
      `harness.route.shell.${SHELL_LABEL[cms]}`,
      ['routing'],
      `A shell command on a ${cms} site runs in that site's own container as the mode's user, beside a session on another site`,
      'SYSTEM-4a-container',
      "docker exec -u www-data into <label>-web-1, workdir /site/<label>, never the other session's container"
    )
  )

const cleanupSpec = () =>
  caseSpec(
    'GROUP-runtime',
    'cleanup',
    'harness.cleanup.runtime',
    ['cleanup'],
    'Disposing the runtime leaves no child process, restores the environment and the scratch folder is removable',
    'PLAN-lifecycle',
    'no fake-docker child alive, TRACY_SITES_ROOT/MCP_TRACY_ORIGIN/DSH_HOME restored, scratch removed'
  )

function guardItem(item) {
  const { tool, arg } = item.meta
  const scope = keyOf(item.id)
  const plan = {}
  const g = (variant, tag, req, invariant) =>
    caseSpec(
      scope,
      variant,
      `harness.guard.${tool}.${variant}`,
      [tag],
      `${tool}.${arg}: ${req}`,
      'SYSTEM-4a-guard',
      invariant
    )
  plan.happy = {
    status: 'case',
    specs: [
      g(
        'happy-inside',
        'happy',
        'a working directory inside the session site passes the workdir guard',
        'the call reaches its backend'
      )
    ]
  }
  plan['other-site'] = {
    status: 'case',
    specs: [
      g(
        'other-site',
        'other-site',
        "another site's directory is refused BY THE GUARD (its own sentence, not the fence's)",
        'message says the directory belongs to another site'
      )
    ]
  }
  plan.boundary = {
    status: 'case',
    specs: [
      g(
        'boundary-prefix-sibling',
        'boundary',
        'a sibling label that starts with the session label is another site',
        'message says it belongs to another site'
      )
    ]
  }
  plan.traversal = {
    status: 'case',
    specs: [
      g(
        'traversal-abs',
        'traversal',
        'a ".." segment is refused outright, even one that stays in the site',
        'message says the ".." segment leaves the site folder'
      )
    ]
  }
  plan['host-path'] = {
    status: 'case',
    specs: [
      g(
        'host-outside',
        'host-path',
        'a directory outside the sites root is refused',
        'message says the cwd is outside the sites root'
      ),
      g(
        'host-deskhome',
        'host-path',
        "the host's own folder is refused",
        'message says the cwd is outside the sites root'
      )
    ]
  }
  plan['missing-cwd'] = {
    status: 'case',
    specs: [
      g(
        'missing-cwd',
        'missing-cwd',
        'a session with no workspace has nothing to check an absolute workdir against, so it is refused',
        'message says there is no session workspace'
      )
    ]
  }
  const na = {
    status: 'na',
    reason:
      'the guard returns "allow" for a relative, absent or non-string workdir (the tool or the path fence judges it)',
    source:
      'packages/tools/tracy-subprocess-docker/src/route.mjs workdirDecision docstring: "A relative or absent directory is the tool\'s own business"'
  }
  for (const tag of ['empty', 'invalid', 'schema-invalid', 'symlink']) plan[tag] = na
  plan['permission-escalation'] = {
    status: 'na',
    reason:
      'the guard compares site labels only; mode escalation is judged by the approval items and fs-fence escalation cases',
    source: 'route.mjs workdirDecision (pure label comparison, no mode input)'
  }
  plan.cleanup = { status: 'case', specs: [cleanupSpec()] }
  for (const tag of ['unknown-tool', 'stream-failure'])
    plan[tag] = {
      status: 'na',
      reason: 'a guard decision does not depend on the tool name resolution or the model stream',
      source: 'dispatcher item cases'
    }
  return plan
}

function toolSurfaceItem(item) {
  const { tool, surface, applies } = item.meta
  const scope = keyOf(item.id)
  const plan = {}
  if (!applies) {
    const source = `apps/tracy-web/src/api-reference/sources/agent-tools.json — platforms of ${tool}`
    for (const tag of ALL_TAGS)
      plan[tag] = {
        status: 'na',
        reason: `${tool} is not offered on the ${item.meta.platform} platform (surface ${surface})`,
        source
      }
    return plan
  }
  const dispatchable =
    tool === 'tracy_site' && ['wordpress', 'joomla', 'joomla-sealed', 'emdash'].includes(surface)
  if (tool === 'tracy_site') {
    plan.happy = {
      status: 'case',
      specs: [
        caseSpec(
          scope,
          'compat',
          `harness.surface.compat.${surface}`,
          ['happy'],
          `tracy_site on ${surface}: the actions the code offers equal the pinned catalogue's`,
          'CATALOGUE-surfaces',
          'SURFACE_ACTIONS and the action enum of siteToolParameters match the pinned agent-tools.json for this surface',
          { effects: STATIC, prerequisites: [] }
        ),
        ...(dispatchable
          ? [
              caseSpec(
                scope,
                'dispatch',
                `harness.surface.dispatch.${surface}`,
                ['happy', 'invalid', 'routing', 'audit-effect'],
                `tracy_site on a ${surface} site: listed relay actions are accepted, unlisted ones are refused before the Apply door`,
                'CATALOGUE-surfaces',
                'every catalogue relay action is not refused as off-surface; every other known action is refused with no Apply call; the Apply call carries the site label and the typist'
              )
            ]
          : [])
      ]
    }
    if (dispatchable) {
      const d = plan.happy.specs[1]
      plan.invalid = { status: 'case', specs: [d] }
      plan.routing = { status: 'case', specs: [d] }
      plan['audit-effect'] = { status: 'case', specs: [d] }
    } else {
      for (const tag of ['invalid', 'routing', 'audit-effect'])
        plan[tag] = {
          status: 'open',
          reason: `no site fixture for the ${surface} surface (needs the ${surface.includes('derived') ? 'host-owned import record' : 'bound contract marker'}); only the static catalogue comparison runs`
        }
    }
  } else if (tool === 'tracy_emdash') {
    const spec = writePathMain('changed', 'emdash')
    plan.happy = { status: 'case', specs: [spec], shared: 'write-path:changed@emdash' }
    plan['audit-effect'] = { status: 'case', specs: [spec], shared: 'write-path:changed@emdash' }
  }
  for (const tag of ALL_TAGS)
    if (plan[tag] === undefined)
      plan[tag] = {
        status: 'open',
        reason:
          tool === 'tracy_site' || tool === 'tracy_emdash'
            ? DEFAULT_OPEN
            : `plugin ${item.meta.plugin} is not loaded in the harness QA composition; calling it needs that plugin's own backend`
      }
  return plan
}

function writePathMain(kind, cms) {
  const label = { wordpress: 'a1', joomla: 'b1', emdash: 'c1' }[cms]
  const doc = {
    shell: [
      'SYSTEM-4a-container',
      "a shell command runs in the site's own container and the turn is recorded"
    ],
    'file-tool': [
      'SYSTEM-4b-fence',
      'a dsh file tool writes inside the site folder and the turn is recorded'
    ],
    apply: [
      'SYSTEM-4c-apply',
      cms === 'emdash'
        ? 'EmDash content is not written through Apply: the door is never reached'
        : 'tracy_site relays the write to the Apply door as the typist, carrying site, session and turn'
    ],
    changed: [
      'SYSTEM-4d-changed',
      cms === 'emdash'
        ? 'a tracy_emdash write is reported to /changed (via emdash-mcp) as the typist'
        : 'a look write by file tool is reported to /changed (via file-look) as the typist'
    ]
  }[kind]
  return caseSpec(
    `write-path-${kind}-${cms}`,
    'record',
    `harness.writepath.${kind}.${cms}`,
    ['happy', 'routing', 'audit-effect'],
    `${kind} write path on ${cms} (${label}): ${doc[1]}`,
    doc[0],
    `${doc[1]}; canaries in the other sites and on the host stay unchanged`
  )
}

function writePathItem(item) {
  const { path: kind, cms } = item.meta
  const scope = keyOf(item.id)
  const main = writePathMain(kind, cms)
  const plan = {}
  plan.happy = { status: 'case', specs: [main] }
  plan.routing = { status: 'case', specs: [main] }
  plan['audit-effect'] = { status: 'case', specs: [main] }
  if (kind === 'file-tool' && cms === 'wordpress')
    plan['dependency-failure'] = {
      status: 'case',
      specs: [
        caseSpec(
          scope,
          'door-down',
          'harness.writepath.record-failure',
          ['dependency-failure'],
          'a failing Site changes door never blocks the write or the turn; retries are bounded',
          'CONTEXT-visible',
          'the file still lands, the turn settles, at most three close attempts'
        )
      ]
    }
  plan.cleanup = { status: 'case', specs: [cleanupSpec()] }
  if (kind === 'changed')
    plan['tool-failure'] = {
      status: 'open',
      reason:
        'a refused write not being reported is checked inside the main case; a failing write tool is not separately scripted'
    }
  for (const tag of ['unknown-tool', 'schema-invalid', 'symlink', 'traversal', 'missing-cwd'])
    plan[tag] = {
      status: 'na',
      reason:
        'a write PATH is a route through the system, not a call: path-argument edges belong to the fs-fence items of the tool that carries it',
      source:
        'SYSTEM.md §4 ("This is **not** one straight path. Each branch has its own way of being blocked")'
    }
  return plan
}

function modeMatrixItem(item) {
  const [, group, id] = item.id.split(':')
  const scope = keyOf(item.id)
  const assertion = group === 'tool' ? `harness.matrix.tool.${id}` : `harness.matrix.skill.${id}`
  const oracle = group === 'tool' ? 'MATRIX-union' : 'MATRIX-skills'
  const plan = {}
  const main = caseSpec(
    scope,
    'presets',
    assertion,
    ['happy', 'boundary'],
    `mode-matrix ${group} row ${id}: every role × platform preset carries it exactly when the matrix says`,
    oracle,
    group === 'tool'
      ? 'expected = role ∪ platform, computed from the matrix, compared with each generated preset'
      : 'expected = platform column when the row names one, else role column, compared with each skill set',
    { effects: STATIC, prerequisites: [] }
  )
  plan.happy = { status: 'case', specs: [main] }
  plan.boundary = { status: 'case', specs: [main] }
  for (const tag of ALL_TAGS) if (plan[tag] === undefined) plan[tag] = { status: 'na', ...CONFIG_NA }
  return plan
}

function nativeRowItem(item) {
  const row = item.meta.row
  const scope = keyOf(item.id)
  const oracle = ['approval', 'permission'].includes(row) ? 'NATIVE-approval' : 'FLEET-container'
  const main = caseSpec(
    scope,
    'row',
    `harness.profile.${row}`,
    ['happy', ...(['approval', 'permission'].includes(row) ? ['permission-escalation'] : [])],
    `profile row ${row}: the boundary-rule value is in force`,
    oracle,
    'the row has the value the boundary rules and the comments of the profile require',
    { effects: STATIC, prerequisites: [] }
  )
  const plan = { happy: { status: 'case', specs: [main] } }
  if (['approval', 'permission'].includes(row))
    plan['permission-escalation'] = { status: 'case', specs: [main] }
  for (const tag of ALL_TAGS) if (plan[tag] === undefined) plan[tag] = { status: 'na', ...CONFIG_NA }
  return plan
}

function dshToolRowItem(item) {
  const plan = {}
  const row = item.meta.row
  const offered = item.meta.offered
  for (const tag of ALL_TAGS) {
    if (offered === false)
      plan[tag] = {
        status: 'na',
        reason: `${row} is switched off for every role and platform in the mode matrix: no customer session carries it`,
        source: 'config/mode-matrix.json tools row ' + row
      }
    else
      plan[tag] = {
        status: 'open',
        reason: `${row}'s backend plugin is not loaded in the harness QA composition`
      }
  }
  return plan
}

function dshToolItem(item, fenceByTool) {
  const name = item.id.split(':')[1]
  const scope = keyOf(item.id)
  const plan = {}
  const required = item.meta.required ?? []
  if (required.length > 0)
    plan['schema-invalid'] = {
      status: 'case',
      specs: [
        caseSpec(
          scope,
          'schema',
          `harness.dispatch.schema-invalid.${name}`,
          ['schema-invalid'],
          `${name}: empty, wrong-typed and non-JSON arguments are refused with no backend call`,
          'PLAN-lifecycle',
          'every malformed call is an error/refusal and nothing reaches the backend'
        )
      ]
    }
  else
    plan['schema-invalid'] = {
      status: 'na',
      reason: 'the live schema has no required property, so no call shape is invalid by omission',
      source: 'live tool registry (ctx.tools.schemas())'
    }
  const needsSite = ['bash', 'read', 'write', 'tracy_site'].includes(name)
  if (needsSite)
    plan['missing-cwd'] = {
      status: 'case',
      specs: [
        caseSpec(
          scope,
          'no-cwd',
          `harness.dispatch.missing-cwd.${name}`,
          ['missing-cwd'],
          `${name}: with no session workspace nothing runs and nothing is written`,
          'SYSTEM-4b-fence',
          'refused, backend untouched, the same call works with a site'
        )
      ]
    }
  plan['unknown-tool'] = {
    status: 'na',
    reason: "the tool is registered; an unregistered name is the dispatcher item's case",
    source: 'case QA-HARNESS-dispatcher-session-loop-unknown-tool'
  }
  for (const [tag, specs] of Object.entries(fenceByTool[name] ?? {}))
    if (plan[tag] === undefined) plan[tag] = { status: 'case', specs, shared: 'fs-fence' }
  plan.cleanup = { status: 'case', specs: [cleanupSpec()] }
  for (const tag of ALL_TAGS)
    if (plan[tag] === undefined) plan[tag] = { status: 'open', reason: DEFAULT_OPEN }
  return plan
}

function approvalItem(item) {
  const which = item.id.split(':')[1]
  const plan = {}
  if (which === 'never' || which === 'escalation-denied') {
    const specs = ['bash', 'write'].map((t) =>
      caseSpec(
        'approval-never',
        `never-${t}`,
        `harness.approval.never.${t}`,
        ['happy', 'permission-escalation'],
        `a new session is pinned approval: never; a ${t} escalation is refused with no question to any customer`,
        'PLAN-approval',
        'policy never, escalation refused, nothing forwarded to browsers, no effect'
      )
    )
    plan.happy = { status: 'case', specs }
    plan['permission-escalation'] = { status: 'case', specs }
  } else {
    const specs = ['bash', 'write'].map((t) =>
      caseSpec(
        'approval-legacy-ask',
        `legacy-${t}`,
        `harness.approval.legacy.${t}`,
        ['happy', 'permission-escalation', 'dependency-failure'],
        `a legacy session pinned ask is answered rejected at once by ${t} escalation, with silent browsers`,
        'PLAN-approval',
        'rejected within the deadline, audited as rejected, never forwarded to a browser, no effect',
        { red: 'approval-hang' }
      )
    )
    plan.happy = { status: 'case', specs }
    plan['permission-escalation'] = { status: 'case', specs }
    plan['dependency-failure'] = { status: 'case', specs }
  }
  plan.cleanup = { status: 'case', specs: [cleanupSpec()] }
  for (const tag of ALL_TAGS)
    if (plan[tag] === undefined) plan[tag] = { status: 'open', reason: DEFAULT_OPEN }
  return plan
}

function dispatcherItem() {
  const scope = 'dispatcher-session-loop'
  const c = (variant, assertion, tags, req, inv) =>
    caseSpec(scope, variant, assertion, tags, req, 'PLAN-lifecycle', inv)
  const plan = {}
  plan['unknown-tool'] = {
    status: 'case',
    specs: [
      c(
        'unknown-tool',
        'harness.dispatch.unknown-tool',
        ['unknown-tool'],
        'An unregistered tool name is an error result, never a backend call',
        'unknown tool error, backend untouched, the next valid call works'
      )
    ]
  }
  plan['schema-invalid'] = {
    status: 'case',
    specs: [
      c(
        'schema-invalid',
        'harness.dispatch.schema-invalid.read',
        ['schema-invalid'],
        'Malformed arguments are refused before the backend (representative: read)',
        'error results, backend untouched'
      )
    ]
  }
  plan['missing-cwd'] = {
    status: 'case',
    specs: [
      c(
        'missing-cwd-bash',
        'harness.dispatch.missing-cwd.bash',
        ['missing-cwd'],
        'A session with no workspace runs no shell',
        'refused, no docker exec'
      ),
      c(
        'missing-cwd-read',
        'harness.dispatch.missing-cwd.read',
        ['missing-cwd'],
        'A session with no workspace reads no file',
        'refused, no fs access'
      )
    ]
  }
  plan['stream-failure'] = {
    status: 'case',
    specs: ['provider-error', 'broken-stream', 'broken-after-tool'].map((v) =>
      c(
        `stream-${v}`,
        `harness.dispatch.stream.${v}`,
        ['stream-failure', 'dependency-failure'],
        `The model/provider fails (${v}): the turn settles in bounded time and nothing runs after quiescence`,
        'turn ended, no late write, no new docker exec, session usable afterwards'
      )
    )
  }
  plan['dependency-failure'] = {
    status: 'case',
    specs: [
      ...plan['stream-failure'].specs,
      c(
        'docker-down',
        'harness.dispatch.docker-down',
        ['dependency-failure'],
        'The docker daemon is unreachable: bounded and visible',
        'settles, error visible, bounded attempts'
      )
    ]
  }
  plan.cancel = {
    status: 'case',
    specs: ['model-hang', 'tool-write', 'shell-hang'].map((v) =>
      c(
        `cancel-${v}`,
        `harness.dispatch.cancel.${v}`,
        ['cancel'],
        `Cancelling during ${v} settles the turn and nothing writes afterwards`,
        'settles in bounded time, no write after quiescence, no child left'
      )
    )
  }
  plan['tool-failure'] = {
    status: 'case',
    specs: ['tool-throws', 'missing-file', 'shell-exit'].map((v) =>
      c(
        `tool-failure-${v}`,
        `harness.dispatch.tool-failure.${v}`,
        ['tool-failure'],
        `A tool failure (${v}) is preserved in the result and the session continues`,
        'error visible, session usable afterwards'
      )
    )
  }
  plan['permission-escalation'] = {
    status: 'case',
    specs: [
      c(
        'permission-revoked',
        'harness.dispatch.permission-revoked',
        ['permission-escalation'],
        'A mode lowered mid-session takes effect for the next call',
        'later write refused, later shell runs as the read-only user'
      )
    ]
  }
  plan['audit-effect'] = {
    status: 'case',
    specs: [
      c(
        'record-failure',
        'harness.writepath.record-failure',
        ['audit-effect', 'dependency-failure'],
        'A failing record door never blocks the turn',
        'turn settles, write lands, bounded attempts'
      )
    ]
  }
  plan.routing = { status: 'case', specs: routeShellSpecs() }
  plan.cleanup = { status: 'case', specs: [cleanupSpec()] }
  for (const tag of ALL_TAGS)
    if (plan[tag] === undefined) plan[tag] = { status: 'open', reason: DEFAULT_OPEN }
  return plan
}

/**
 * The plan of one item: for every tag, a status and its specs.
 * @param {{ id: string, kind: string, meta: any }} item
 * @param {Record<string, Record<string, any[]>>} fenceByTool - fs-fence specs grouped by tool then tag (feeds the dsh-tool items).
 */
export function planItem(item, fenceByTool = {}) {
  let plan
  switch (item.kind) {
    case 'fs-fence':
      plan = fenceItem(item)
      break
    case 'workdir-guard':
      plan = guardItem(item)
      break
    case 'tool-surface':
      plan = toolSurfaceItem(item)
      break
    case 'write-path':
      plan = writePathItem(item)
      break
    case 'mode-matrix':
      plan = modeMatrixItem(item)
      break
    case 'native-row':
      plan = nativeRowItem(item)
      break
    case 'dsh-tool-row':
      plan = dshToolRowItem(item)
      break
    case 'dsh-tool':
      plan = dshToolItem(item, fenceByTool)
      break
    case 'approval':
      plan = approvalItem(item)
      break
    case 'dispatcher':
      plan = dispatcherItem()
      break
    default:
      plan = {}
  }
  // A case at the seam (fake docker argv, the HTTP recorder's request with its actor/source/correlation)
  // is credited to `audit-seam`. `audit-effect` is the end-to-end effect (CMS readback, a site_write row,
  // a Site changes entry) which nothing here reads back: it stays open for every item.
  const effect = plan['audit-effect']
  if (effect?.status === 'case') {
    plan['audit-seam'] = effect
    plan['audit-effect'] = { status: 'open', reason: AUDIT_END_TO_END }
  } else if (effect !== undefined) plan['audit-seam'] ??= effect
  for (const tag of ALL_TAGS) plan[tag] ??= { status: 'open', reason: DEFAULT_OPEN }
  return plan
}

const AUDIT_END_TO_END =
  'PENDING: the end-to-end effect (CMS readback, site_write row, Site changes entry with actor and source) is not measured — the harness has a fake docker and an HTTP recorder only; owner: the stand-adapter layer (QA_STAND_URL); needs an adapter on a stand (ENV when its probe fails)'

export { GUARD_TEXT }
