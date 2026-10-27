// Shell-script cases: provision/teardown.sh, provision/go-live.sh and the backup-point verifier,
// each run from a product tree (real tree for GREEN, scratch mutant for RED) against fakes.
import { scratchDir } from './scratch.mjs'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { step } from './harness.mjs'
import {
  ENV_BYTES,
  FLEET_SCRIPTS,
  LABEL,
  OWN_NET,
  SIBLING,
  SIBLING_NET,
  SUBSTRING_SIBLING,
  SUCCESS_MARKER,
  runGoLive,
  runTeardown,
  ruleFor,
  stand
} from './teardown-stand.mjs'
import { readTextSync } from '../../../lib/bounded-reader.mjs'

const TEARDOWN = 'provision/teardown.sh'
const sh = (rel) => `${FLEET_SCRIPTS}/${rel}`

export const SHELL_MUTATIONS = [
  {
    id: 'teardown-network-kept',
    tree: 'fleet',
    file: sh(TEARDOWN),
    find: '  why="$(docker network rm "${LABEL}_default" 2>&1 >/dev/null)" || true\n',
    replace: '  return 0\n'
  },
  {
    id: 'teardown-refuse-off',
    tree: 'fleet',
    file: sh(TEARDOWN),
    find: 'fix the cause and run the teardown again" >&2\n  exit 1\n}',
    replace: 'fix the cause and run the teardown again" >&2\n  :\n}'
  },
  {
    id: 'teardown-prefix-unanchored',
    tree: 'fleet',
    // Two guards keep a neighbour's container: the anchored filter and the name check on each row.
    edits: [
      { file: sh(TEARDOWN), find: '--filter "name=^${prefix}"', replace: '--filter "name=${prefix}"' },
      {
        file: sh(TEARDOWN),
        find: '        "$prefix"|"$prefix"-*) LANE_CONTAINERS=',
        replace: '        *"$prefix"*) LANE_CONTAINERS='
      }
    ]
  },
  {
    id: 'teardown-network-failure-hidden',
    tree: 'fleet',
    file: sh(TEARDOWN),
    find: '  if ! listed="$(docker network ls -q --filter "name=^${LABEL}_default\\$" 2>&1)" || [ -n "$listed" ]; then',
    replace: '  if false; then'
  },
  {
    id: 'teardown-missing-dir-errors',
    tree: 'fleet',
    file: sh(TEARDOWN),
    find: '  echo "==> no compose file at $SITE_DIR — nothing to bring down"',
    replace: '  echo "no compose file" >&2; exit 1'
  },
  {
    id: 'teardown-value-check-off',
    tree: 'fleet',
    file: sh(TEARDOWN),
    find: '      [ $# -ge 2 ] && [ -n "$2" ] && [ "${2#-}" = "$2" ] \\\n        || { echo "$1 needs a value" >&2; exit 2; } ;;',
    replace: '      : ;;'
  },
  {
    id: 'teardown-unknown-flag-ignored',
    tree: 'fleet',
    file: sh(TEARDOWN),
    find: '    *) echo "unknown argument: $1" >&2; exit 2 ;;',
    replace: '    *) shift ;;'
  },
  {
    id: 'teardown-label-check-off',
    tree: 'fleet',
    file: sh(TEARDOWN),
    find: '[ -n "$LABEL" ] || { echo "need --label" >&2; exit 2; }',
    replace: ''
  },
  {
    id: 'teardown-left-behind-forgotten',
    tree: 'fleet',
    file: sh(TEARDOWN),
    find: 'LEFT_BEHIND="$LEFT_BEHIND${LEFT_BEHIND:+ }$target"',
    replace: ':'
  },
  {
    id: 'teardown-smtp-rule-single-delete',
    tree: 'fleet',
    file: sh(TEARDOWN),
    find: '  while :; do\n    rc=0\n    mail_rule_present || rc=$?\n    [ "$rc" -eq 0 ] || break\n    if ! iptables -D DOCKER-USER -s "$SITE_NET" -j TRACY-FLEET-EGRESS; then\n      rc=3\n      break\n    fi\n  done',
    replace: '  iptables -D DOCKER-USER -s "$SITE_NET" -j TRACY-FLEET-EGRESS || true\n  rc=1'
  },
  {
    id: 'golive-live-single-delete',
    tree: 'fleet',
    file: sh('provision/go-live.sh'),
    find: '      exit 1\n    }\n  done\n  # The listing is compared as text, and a listing that spells',
    replace:
      '      exit 1\n    }\n    break\n  done\n  # The listing is compared as text, and a listing that spells'
  },
  {
    id: 'golive-draft-not-idempotent',
    tree: 'fleet',
    file: sh('provision/go-live.sh'),
    find: '  if ! mail_rule_present; then\n    iptables -I',
    replace: '  if true; then\n    iptables -I'
  },
  {
    id: 'golive-subnet-check-off',
    tree: 'fleet',
    file: sh('provision/go-live.sh'),
    find: 'if [ -z "$SITE_NET" ]; then',
    replace: 'if false; then'
  },
  {
    id: 'golive-label-check-off',
    tree: 'fleet',
    file: sh('provision/go-live.sh'),
    find: '[ -n "$LABEL" ] || { echo "need --label" >&2; exit 2; }',
    replace: ''
  },
  {
    id: 'golive-site-dir-check-off',
    tree: 'fleet',
    file: sh('provision/go-live.sh'),
    find: '[ -d "$SITE_DIR" ] || { echo "no such site: $SITE_DIR" >&2; exit 2; }',
    replace: ''
  },
  {
    id: 'backup-ok-never',
    tree: 'fleet',
    file: sh('lib/backup_points.py'),
    find: 'return {**out, "ok": True}, facts',
    replace: 'return {**out, "ok": False, "reason": "mismatch"}, facts'
  },
  {
    id: 'golive-op-check-off',
    tree: 'fleet',
    file: sh('provision/go-live.sh'),
    find: 'case "$OP" in live|draft|drop-domain) ;; *) echo "need --op live|draft|drop-domain" >&2; exit 2 ;; esac',
    replace: ''
  },
  {
    id: 'backup-verify-off',
    tree: 'fleet',
    file: sh('lib/backup_points.py'),
    find: 'if os.path.getsize(path) != int(fields.get("size", -1)) or sha256(path) != fields.get("sha256"):',
    replace: 'if False:'
  },
  {
    id: 'backup-missing-reads-ok',
    tree: 'fleet',
    file: sh('lib/backup_points.py'),
    find: 'return "missing"',
    replace: 'return "ok"'
  },
  {
    id: 'backup-retention-not-reported',
    tree: 'fleet',
    file: sh('lib/backup_points.py'),
    find: 'state = "removed"',
    replace: 'state = "missing"'
  },
  {
    id: 'backup-no-trailer-reads-ok',
    tree: 'fleet',
    file: sh('lib/backup_points.py'),
    find: 'return None, {"kind": None, "tables": None}',
    replace: 'return {"ok": True}, {"kind": None, "tables": None}'
  }
]

const NEIGHBOUR_ID_HEAD = 'c' // sibling container id prefix used by the stand
const assertSiblingIntact = (s, why) => {
  assert.match(
    s.table('networks'),
    new RegExp(`^${SIBLING}_default `, 'm'),
    `${why}: sibling network removed`
  )
  assert.match(s.table('volumes'), new RegExp(`^${SIBLING}_db `, 'm'), `${why}: sibling volume removed`)
  assert.match(
    s.table('containers'),
    new RegExp(`^${NEIGHBOUR_ID_HEAD}0+ ${SIBLING}-db-1 `, 'm'),
    `${why}: sibling container removed`
  )
  assert.match(
    s.table('rules'),
    new RegExp(ruleFor(SIBLING_NET).replace(/[./]/g, '\\$&')),
    `${why}: sibling egress rule removed`
  )
}
const ownRule = ruleFor(OWN_NET)
const withStand = (options, fn) => {
  const s = stand(options)
  try {
    return fn(s)
  } finally {
    s.dispose()
  }
}
const goneFromHost = (s) => {
  assert.equal(existsSync(s.siteDir), false, 'private site directory still exists')
  assert.equal(existsSync(s.dir('sites', LABEL)), false, 'site folder still exists')
  assert.doesNotMatch(s.table('volumes'), new RegExp(`^${LABEL}_`, 'm'), 'site volumes remain')
  assert.doesNotMatch(s.table('containers'), new RegExp(` ${LABEL}-`, 'm'), 'site containers remain')
}

export function shellCases() {
  const cases = []
  const common = {
    targets: ['local'],
    effects: { reads: [], writes: ['scratch tmp dir'], mail: false, model: false, containers: false },
    prerequisites: ['bash'],
    legacyIds: []
  }
  const td = {
    ...common,
    itemIds: ['script:packages/fleet/tracy-fleet-operation/scripts/provision/teardown.sh']
  }
  const gl = {
    ...common,
    itemIds: ['script:packages/fleet/tracy-fleet-operation/scripts/provision/go-live.sh']
  }
  const bp = {
    ...common,
    itemIds: ['script:packages/fleet/tracy-fleet-operation/scripts/lib/backup_points.py'],
    prerequisites: ['python3', 'git']
  }

  // ── teardown.sh ──────────────────────────────────────────────────────────────────────────
  cases.push({
    ...td,
    id: 'QA-INFRA-teardown-cold-warm-cleanup',
    requirement:
      "teardown removes the site's directory, volumes, containers (lane containers by exact prefix), egress rule and its own network, and leaves a sibling site's resources alone",
    oracle: 'teardown-footprint',
    edgeTags: ['cleanup', 'resource-leak', 'cold-warm'],
    assertionIds: ['exit-and-marker', 'site-gone', 'network-gone', 'sibling-intact'],
    mutation: 'teardown-network-kept',
    redAssertion: 'network-gone',
    async run({ root }) {
      withStand({ rules: [ownRule, ruleFor(SIBLING_NET)] }, (s) => {
        const run = runTeardown(root, s)
        step('exit-and-marker', () => {
          assert.equal(run.status, 0, run.stdout + run.stderr)
          assert.ok(run.stdout.includes(SUCCESS_MARKER), run.stdout)
        })
        step('site-gone', () => goneFromHost(s))
        step('network-gone', () =>
          assert.doesNotMatch(
            s.table('networks'),
            new RegExp(`^${LABEL}_default `, 'm'),
            'the site network was left on the host'
          )
        )
        step('sibling-intact', () => assertSiblingIntact(s, 'teardown'))
      })
    }
  })

  cases.push({
    ...td,
    id: 'QA-INFRA-teardown-resource-leak-prefix-sibling',
    requirement:
      'lane containers are matched by exact prefix: a container whose name merely CONTAINS the label belongs to another site and survives',
    oracle: 'teardown-footprint',
    edgeTags: ['resource-leak', 'cleanup'],
    assertionIds: ['lane-removed', 'lookalike-kept'],
    mutation: 'teardown-prefix-unanchored',
    redAssertion: 'lookalike-kept',
    async run({ root }) {
      withStand({}, (s) => {
        const run = runTeardown(root, s)
        assert.equal(run.status, 0, run.stdout + run.stderr)
        step('lane-removed', () =>
          assert.doesNotMatch(
            s.table('containers'),
            new RegExp(`${LABEL}-dsh-truoc`),
            'the parked lane container survived'
          )
        )
        step('lookalike-kept', () =>
          assert.match(
            s.table('containers'),
            new RegExp(` ${SUBSTRING_SIBLING}-dsh `),
            `a container of another site was removed; calls: ${s.calls().join(' | ')}`
          )
        )
      })
    }
  })

  cases.push({
    ...td,
    id: 'QA-INFRA-teardown-idempotent-rerun',
    requirement: 'a second teardown of an already-gone site succeeds and removes nothing else',
    oracle: 'teardown-footprint',
    edgeTags: ['idempotent', 'repeat', 'cold-warm'],
    assertionIds: ['second-run-ok', 'sibling-intact-after-rerun'],
    mutation: 'teardown-missing-dir-errors',
    redAssertion: 'second-run-ok',
    async run({ root }) {
      withStand({ rules: [ruleFor(SIBLING_NET)] }, (s) => {
        const first = runTeardown(root, s)
        assert.equal(first.status, 0, first.stdout + first.stderr)
        const second = runTeardown(root, s)
        step('second-run-ok', () => {
          assert.equal(second.status, 0, second.stdout + second.stderr)
          assert.ok(second.stdout.includes(SUCCESS_MARKER))
          assert.equal(existsSync(s.siteDir), false)
        })
        step('sibling-intact-after-rerun', () => assertSiblingIntact(s, 'second teardown'))
      })
    }
  })

  cases.push({
    ...td,
    id: 'QA-INFRA-teardown-partial-failure-keeps-key',
    requirement:
      "when compose down fails and a volume cannot be removed, teardown stops, exits non-zero, and keeps the directory, its .env (the volume's only key) and the log",
    oracle: 'teardown-footprint',
    edgeTags: ['partial-failure', 'dependency-failure'],
    assertionIds: ['refused', 'key-kept'],
    mutation: 'teardown-refuse-off',
    redAssertion: 'refused',
    async run({ root }) {
      withStand(
        { rules: [ruleFor(SIBLING_NET)], switches: { 'down-fails': '', stuck: `${LABEL}_db\n` } },
        (s) => {
          const run = runTeardown(root, s)
          step('refused', () => {
            assert.equal(run.status, 1, run.stdout + run.stderr)
            assert.ok(!run.stdout.includes(SUCCESS_MARKER), 'success was claimed')
            assert.match(run.stderr, new RegExp(`teardown of ${LABEL} stopped`))
          })
          step('key-kept', () => {
            assert.equal(readTextSync(path.join(s.siteDir, '.env')), ENV_BYTES)
            assert.ok(existsSync(s.teardownLog()), 'the teardown log was removed')
            assert.match(s.table('volumes'), new RegExp(`^${LABEL}_db `, 'm'))
          })
          step('key-kept', () => assertSiblingIntact(s, 'failed teardown'))
        }
      )
    }
  })

  cases.push({
    ...td,
    id: 'QA-INFRA-teardown-retry-after-failure',
    requirement: 'after a failed teardown (volume stuck) is fixed, running it again finishes the job',
    oracle: 'teardown-footprint',
    edgeTags: ['retry', 'partial-failure'],
    assertionIds: ['first-run-kept-everything', 'retry-finishes'],
    mutation: 'teardown-refuse-off',
    redAssertion: 'first-run-kept-everything',
    async run({ root }) {
      withStand({ switches: { 'down-fails': '', stuck: `${LABEL}_db\n` } }, (s) => {
        const first = runTeardown(root, s)
        step('first-run-kept-everything', () => {
          assert.equal(first.status, 1, first.stdout + first.stderr)
          assert.equal(readTextSync(path.join(s.siteDir, '.env')), ENV_BYTES)
        })
        s.clearSwitch('down-fails')
        s.clearSwitch('stuck')
        const second = runTeardown(root, s)
        step('retry-finishes', () => {
          assert.equal(second.status, 0, second.stdout + second.stderr)
          assert.ok(second.stdout.includes(SUCCESS_MARKER))
          goneFromHost(s)
        })
      })
    }
  })

  cases.push({
    ...td,
    id: 'QA-INFRA-teardown-dependency-failure-network-busy',
    requirement:
      'a site network that something still uses is reported by name, never reported as removed, and does not block the rest of the teardown',
    oracle: 'teardown-footprint',
    edgeTags: ['dependency-failure', 'resource-leak'],
    assertionIds: ['busy-network-reported', 'rest-still-cleaned'],
    mutation: 'teardown-network-failure-hidden',
    redAssertion: 'busy-network-reported',
    async run({ root }) {
      withStand({ switches: { 'net-busy': '' } }, (s) => {
        const run = runTeardown(root, s)
        step('busy-network-reported', () => {
          assert.match(
            s.table('networks'),
            new RegExp(`^${LABEL}_default `, 'm'),
            'fixture: the busy network should still exist'
          )
          assert.ok(
            !run.stdout.includes(`removed the site network ${LABEL}_default`),
            'teardown claimed it removed a network that is still there'
          )
          assert.ok(
            run.stderr.includes(`${LABEL}_default`),
            `the leftover network is not named: ${run.stderr}`
          )
        })
        step('rest-still-cleaned', () => {
          assert.equal(existsSync(s.siteDir), false)
          assert.doesNotMatch(s.table('volumes'), new RegExp(`^${LABEL}_`, 'm'))
        })
      })
    }
  })

  const badArgs = [
    ['no-label', []],
    ['flag-without-value', ['--label']],
    ['flag-swallows-next-flag', ['--label', '--root']],
    ['empty-root', ['--label', LABEL, '--root', '']],
    ['unknown-flag', ['--label', LABEL, '--force']]
  ]
  for (const [name, args] of badArgs) {
    cases.push({
      ...td,
      id: `QA-INFRA-teardown-invalid-args-${name}`,
      requirement: `teardown with arguments ${JSON.stringify(args)} exits 2 and touches neither docker nor the disk`,
      oracle: 'teardown-footprint',
      edgeTags: ['invalid', 'empty'],
      assertionIds: ['exit-2', 'no-effect'],
      mutation:
        { 'no-label': 'teardown-label-check-off', 'unknown-flag': 'teardown-unknown-flag-ignored' }[name] ??
        'teardown-value-check-off',
      redAssertion: 'exit-2',
      async run({ root }) {
        withStand({}, (s) => {
          const run = runTeardown(root, s, args)
          step('exit-2', () => assert.equal(run.status, 2, `${run.status}: ${run.stdout}${run.stderr}`))
          step('no-effect', () => {
            assert.deepEqual(s.calls(), [], 'docker was called')
            assert.ok(
              existsSync(s.siteDir) && existsSync(s.dir('sites', LABEL)),
              'a site directory was removed'
            )
          })
        })
      }
    })
  }

  cases.push({
    ...td,
    id: 'QA-INFRA-teardown-disk-permission-left-behind',
    requirement:
      'a directory teardown cannot delete (read-only parent) is named, the teardown exits non-zero and does not print the torn-down marker',
    oracle: 'teardown-footprint',
    edgeTags: ['disk-permission', 'partial-failure'],
    assertionIds: ['no-false-success', 'leftover-named'],
    prerequisites: ['bash', 'non-root user (a root process ignores directory modes)'],
    probe: 'non-root',
    mutation: 'teardown-left-behind-forgotten',
    redAssertion: 'no-false-success',
    async run({ root }) {
      withStand({}, (s) => {
        // The lifecycle lock lives beside the site directory: left by an earlier run, it can still
        // be taken once its folder is read-only; creating it there could not.
        writeFileSync(s.dir('private', `.go-live-${LABEL}.lock`), '')
        chmodSync(s.dir('private'), 0o555)
        const run = runTeardown(root, s)
        chmodSync(s.dir('private'), 0o755)
        step('no-false-success', () => {
          assert.ok(existsSync(s.siteDir), 'fixture: the directory should have been undeletable')
          assert.notEqual(run.status, 0, 'teardown exited 0 while the site directory is still on disk')
          assert.ok(!run.stdout.includes(SUCCESS_MARKER), 'torn-down marker printed')
        })
        step('leftover-named', () => assert.ok(run.stderr.includes(s.siteDir), run.stderr))
      })
    }
  })

  cases.push({
    ...td,
    id: 'QA-INFRA-teardown-resource-leak-smtp-rule-duplicates',
    requirement:
      "every duplicate egress rule of the torn-down site is removed (iptables -D removes one at a time); the sibling's rule stays",
    oracle: 'teardown-footprint',
    edgeTags: ['resource-leak', 'repeat'],
    assertionIds: ['all-copies-removed', 'sibling-rule-kept'],
    mutation: 'teardown-smtp-rule-single-delete',
    redAssertion: 'all-copies-removed',
    async run({ root }) {
      withStand({ rules: [ownRule, ownRule, ownRule, ruleFor(SIBLING_NET)] }, (s) => {
        const run = runTeardown(root, s)
        step('all-copies-removed', () => {
          assert.ok(!s.table('rules').includes(OWN_NET), `rules left: ${s.table('rules')}`)
          assert.equal(run.status, 0, run.stdout + run.stderr)
        })
        step('sibling-rule-kept', () => assert.ok(s.table('rules').includes(SIBLING_NET)))
      })
    }
  })

  // ── go-live.sh ───────────────────────────────────────────────────────────────────────────
  const live = ['--label', LABEL, '--op', 'live', '--platform', 'none']
  const draft = ['--label', LABEL, '--op', 'draft', '--platform', 'none']
  const countRule = (s, rule) =>
    s
      .table('rules')
      .split('\n')
      .filter((l) => l === rule).length

  cases.push({
    ...gl,
    id: 'QA-INFRA-go-live-happy-live-opens-egress',
    requirement: "go-live --op live removes every copy of the site's mail-egress block and no other site's",
    oracle: 'go-live-switch',
    edgeTags: ['happy', 'repeat'],
    assertionIds: ['live-ok', 'blocks-removed', 'sibling-block-kept'],
    mutation: 'golive-live-single-delete',
    redAssertion: 'blocks-removed',
    async run({ root }) {
      withStand({ rules: [ownRule, ownRule, ruleFor(SIBLING_NET)] }, (s) => {
        const run = runGoLive(root, s, live)
        step('live-ok', () => {
          assert.equal(run.status, 0, run.stdout + run.stderr)
          assert.ok(run.stdout.includes(`TRACY_RESULT go_live=live label=${LABEL}`))
        })
        step('blocks-removed', () => assert.equal(countRule(s, ownRule), 0, `rules: ${s.table('rules')}`))
        step('sibling-block-kept', () => assert.equal(countRule(s, ruleFor(SIBLING_NET)), 1))
      })
    }
  })

  cases.push({
    ...gl,
    id: 'QA-INFRA-go-live-rollback-back-to-draft',
    requirement:
      'go-live --op draft puts the egress block back exactly once, even when run twice (live → draft → draft)',
    oracle: 'go-live-switch',
    edgeTags: ['rollback', 'idempotent', 'repeat'],
    assertionIds: ['draft-blocks-once'],
    mutation: 'golive-draft-not-idempotent',
    redAssertion: 'draft-blocks-once',
    async run({ root }) {
      withStand({ rules: [] }, (s) => {
        assert.equal(runGoLive(root, s, live).status, 0)
        const first = runGoLive(root, s, draft)
        const second = runGoLive(root, s, draft)
        step('draft-blocks-once', () => {
          assert.equal(first.status, 0, first.stdout + first.stderr)
          assert.equal(second.status, 0, second.stdout + second.stderr)
          assert.equal(countRule(s, ownRule), 1, `rules: ${s.table('rules')}`)
        })
      })
    }
  })

  cases.push({
    ...gl,
    id: 'QA-INFRA-go-live-partial-failure-no-subnet',
    requirement: "when the site network's subnet cannot be read, go-live exits 1 before changing any rule",
    oracle: 'go-live-switch',
    edgeTags: ['partial-failure', 'dependency-failure'],
    assertionIds: ['refused-unchanged'],
    mutation: 'golive-subnet-check-off',
    redAssertion: 'refused-unchanged',
    async run({ root }) {
      withStand({ rules: [ownRule] }, (s) => {
        writeFileSync(s.dir('state/networks'), '')
        const before = s.table('rules')
        const run = runGoLive(root, s, live)
        step('refused-unchanged', () => {
          assert.equal(run.status, 1, run.stdout + run.stderr)
          assert.equal(s.table('rules'), before, 'rules changed although go-live failed')
          assert.ok(!run.stdout.includes('TRACY_RESULT go_live'))
        })
      })
    }
  })

  for (const [name, args, expected] of [
    ['missing-label', ['--op', 'live', '--platform', 'none'], 2],
    ['bad-op', ['--label', LABEL, '--op', 'maybe', '--platform', 'none'], 2],
    ['unknown-site', ['--label', 'no-such-site', '--op', 'live', '--platform', 'none'], 2]
  ]) {
    cases.push({
      ...gl,
      id: `QA-INFRA-go-live-invalid-args-${name}`,
      requirement: `go-live with ${name.replace(/-/g, ' ')} exits ${expected} and changes no rule`,
      oracle: 'go-live-switch',
      edgeTags: ['invalid'],
      assertionIds: ['exit-code', 'rules-unchanged'],
      mutation: {
        'bad-op': 'golive-op-check-off',
        'missing-label': 'golive-label-check-off',
        'unknown-site': 'golive-site-dir-check-off'
      }[name],
      redAssertion: 'exit-code',
      async run({ root }) {
        withStand({ rules: [ownRule] }, (s) => {
          const before = s.table('rules')
          const run = runGoLive(root, s, args)
          step('exit-code', () => assert.equal(run.status, expected, run.stdout + run.stderr))
          step('rules-unchanged', () => assert.equal(s.table('rules'), before))
        })
      }
    })
  }

  // ── backup_points.py: a point is `full` only when the dump exists and hashes to the trailer ───
  const mkPoint = (
    root,
    { bytes, trailerSha, trailerSize, kind = 'mysql', trailer = true, expired = false, withFile = true }
  ) => {
    const base = scratchDir('qa-infra-backup-')
    const repo = path.join(base, 'repo.git')
    const backups = path.join(base, 'backups')
    mkdirSync(backups, { recursive: true })
    const git = (...args) => {
      const r = spawnSync(
        'git',
        ['--git-dir', repo, '-c', 'user.name=qa', '-c', 'user.email=qa@example.test', ...args],
        { encoding: 'utf8' }
      )
      if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`)
      return r.stdout.trim()
    }
    spawnSync('git', ['init', '--bare', '-q', repo])
    const tree = git('mktree', '--missing') || git('hash-object', '-t', 'tree', '/dev/null')
    const commit = git('commit-tree', tree, '-m', 'point')
    const sha = createHash('sha256').update(bytes).digest('hex')
    const lines = ['Backup one', '', 'notes']
    if (trailer)
      lines.push(
        '',
        `Tracy-Database: sha256:${trailerSha ?? sha} size:${trailerSize ?? bytes.length} kind:${kind} tables:3`
      )
    git('tag', '-a', 'tracy-release/v1', commit, '-m', lines.join('\n'))
    if (withFile) writeFileSync(path.join(backups, `v1.${kind}.gz`), bytes)
    if (expired) writeFileSync(path.join(backups, 'v1.expired'), '')
    const script = path.join(root, sh('lib/backup_points.py'))
    const run = spawnSync('python3', [script, 'point', repo, 'tracy-release', backups, '1'], {
      encoding: 'utf8'
    })
    rmSync(base, { recursive: true, force: true })
    if (run.status !== 0) throw new Error(`backup_points.py failed: ${run.stderr}`)
    return { point: JSON.parse(run.stdout.trim().split('\n').at(-1)), sha }
  }
  const dump = Buffer.from('-- qa dump\nINSERT INTO t VALUES (1),(2),(3);\n'.repeat(40))
  const flipped = Buffer.from(dump)
  flipped[7] ^= 0xff

  const backupCase = (name, requirement, redMutation, build, check, tags = ['bad-hash']) =>
    cases.push({
      ...bp,
      id: `QA-INFRA-backup-point-${name}`,
      requirement,
      oracle: 'backup-full-needs-hash',
      edgeTags: tags,
      assertionIds: ['database-verdict'],
      mutation: redMutation,
      redAssertion: 'database-verdict',
      async run({ root }) {
        const { point, sha } = mkPoint(root, build())
        step('database-verdict', () => check(point, sha))
      }
    })

  backupCase(
    'intact-dump-is-full',
    'a point whose dump is present and matches the trailer hash is reported ok (control)',
    'backup-ok-never',
    () => ({ bytes: dump }),
    (point, sha) => {
      assert.equal(point.database.ok, true)
      assert.equal(point.database.sha256, sha)
    },
    ['happy']
  )
  // The control above must not be satisfied by a verifier that says "ok" for everything; the
  // negative variants below pin the other side.
  backupCase(
    'flipped-byte-same-size',
    'a dump with one flipped byte (same size) is not ok: mismatch',
    'backup-verify-off',
    () => ({
      bytes: flipped,
      trailerSha: createHash('sha256').update(dump).digest('hex'),
      trailerSize: dump.length
    }),
    (point) => {
      assert.equal(point.database.ok, false, JSON.stringify(point.database))
      assert.equal(point.database.reason, 'mismatch')
    }
  )
  backupCase(
    'truncated-dump',
    'a truncated dump is not ok: mismatch',
    'backup-verify-off',
    () => ({
      bytes: dump.subarray(0, 100),
      trailerSha: createHash('sha256').update(dump).digest('hex'),
      trailerSize: dump.length
    }),
    (point) => {
      assert.equal(point.database.ok, false, JSON.stringify(point.database))
      assert.equal(point.database.reason, 'mismatch')
    },
    ['bad-hash', 'partial-failure']
  )
  backupCase(
    'missing-dump',
    'a point whose dump file is gone is not ok: missing',
    'backup-missing-reads-ok',
    () => ({ bytes: dump, withFile: false }),
    (point) => {
      assert.equal(point.database.ok, false, JSON.stringify(point.database))
      assert.equal(point.database.reason, 'missing')
    },
    ['missing-asset', 'restore']
  )
  backupCase(
    'retention-expired-dump',
    'a dump removed by retention (expired marker) is reported removed, not missing',
    'backup-retention-not-reported',
    () => ({ bytes: dump, withFile: false, expired: true }),
    (point) => {
      assert.equal(point.database.ok, false)
      assert.equal(point.database.reason, 'removed')
    },
    ['missing-asset']
  )
  backupCase(
    'no-trailer-pre-adr-point',
    'a point with no Tracy-Database trailer carries database: null (never reported as restorable)',
    'backup-no-trailer-reads-ok',
    () => ({ bytes: dump, trailer: false }),
    (point) => {
      assert.equal(point.database, null)
    },
    ['empty', 'upgrade-compat']
  )

  return cases
}
