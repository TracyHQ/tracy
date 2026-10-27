// Cases that cannot be decided without something this layer does not own: a live stand (W6), a
// PostgreSQL database, a Linux host, a local image. Each carries `requires` (a probe that turns a
// missing dependency into ENV with the probe result) and `pending` (the reason it stays PENDING
// once the dependency is present, because no adapter or oracle exists for it yet).
// The legacy cases wrap the existing suites; they are PENDING by construction (oracle unbound).
import { LEGACY_SUITES, PYTHON_SUITES } from './legacy.mjs'

const base = (item, extra) => ({
  itemIds: [item],
  targets: ['local'],
  effects: { reads: [], writes: [], mail: false, model: false, containers: false },
  prerequisites: [],
  legacyIds: [],
  assertionIds: [],
  mutation: null,
  redAssertion: null,
  ...extra
})

export function miscCases() {
  const cases = []
  const S = 'script:packages/fleet/tracy-fleet-operation/scripts'
  const lifecycle = [
    [
      'provision-ready',
      'a fixture site provisions to ready on the stand and answers',
      [`${S}/provision/provision.sh`]
    ],
    [
      'go-live-live',
      'go-live flips the stand site live: egress open, ingress rule present',
      [`${S}/provision/go-live.sh`]
    ],
    [
      'back-to-draft',
      'the live site goes back to draft: egress blocked again, ingress rule removed',
      [`${S}/provision/go-live.sh`]
    ],
    [
      'teardown-leaves-nothing',
      'teardown leaves no container, volume, network, directory or egress rule of the site, and no sibling site changed',
      [`${S}/provision/teardown.sh`]
    ],
    [
      'backup-restore-bytes-and-rows',
      'a backup restores the file bytes (compared by hash) AND the database rows (compared by query), independently of the "done" status',
      [`${S}/webroot/webroot-backup.sh`]
    ]
  ]
  for (const [key, text, items] of lifecycle) {
    cases.push(
      base(items[0], {
        itemIds: items,
        id: `QA-INFRA-lifecycle-${key}`,
        requirement: `Live stand: ${text}`,
        oracle: 'stand-lifecycle',
        edgeTags: key.startsWith('teardown')
          ? ['cleanup', 'resource-leak']
          : key.startsWith('backup')
            ? ['restore']
            : ['cold-warm'],
        effects: {
          reads: ['stand'],
          writes: ['stand fixture site'],
          mail: false,
          model: false,
          containers: true
        },
        requires: ['stand', 'stand-fixture'],
        prerequisites: [
          'QA_STAND_URL (a stand from the flows layer)',
          'QA_STAND_FIXTURE_LABEL and QA_STAND_CREDENTIAL (the fixture the stand owner grants)'
        ],
        pending:
          'the stand answers HTTP and a fixture is granted, but no fixture-ownership contract (which doors provision/go-live/teardown/backup are called through, and what the fixture may touch) exists in the repo or the plan, so the lifecycle adapter cannot be written without inventing it; this layer runs nothing against a stand it did not bring up'
      })
    )
  }

  for (const [script, item] of [
    ['teardown', 'script:packages/fleet/tracy-fleet-operation/scripts/provision/teardown.sh'],
    ['go-live', 'script:packages/fleet/tracy-fleet-operation/scripts/provision/go-live.sh'],
    ['provision', 'script:packages/fleet/tracy-fleet-operation/scripts/provision/provision.sh']
  ]) {
    cases.push(
      base(item, {
        id: `QA-INFRA-${script}-linux-fence-kernel`,
        requirement: `${script}.sh: the iptables rules it adds/removes actually block/open the site's mail egress in the Linux kernel (rule bookkeeping is covered by the fake-iptables cases; the kernel behaviour is not)`,
        oracle: 'linux-fence',
        edgeTags: ['cold-warm'],
        prerequisites: ['a Linux host with iptables and the privileges to run it'],
        pending:
          'proof needs a Linux test host with CAP_NET_ADMIN; macOS cannot show iptables or network-namespace behaviour'
      })
    )
  }

  cases.push(
    base('script:packages/fleet/tracy-fleet-operation/scripts/webroot/webroot-backup.sh', {
      id: 'QA-INFRA-webroot-backup-restore-everything-live',
      requirement:
        'webroot-backup.sh --op restore-everything restores files and database to a point, takes a Before-restore backup first, and rolls back when the database load fails',
      oracle: 'backup-full-needs-hash',
      edgeTags: ['restore', 'partial-failure', 'rollback'],
      requires: ['docker'],
      effects: { reads: [], writes: ['scratch site'], mail: false, model: false, containers: true },
      prerequisites: ['a Docker daemon and a database image (the restore swaps a real database)'],
      pending:
        'needs a real database server; the layer blocks self-started containers, so this waits for a stand-provided database'
    }),
    base('script:packages/fleet/tracy-fleet-operation/scripts/provision/restore.sh', {
      id: 'QA-INFRA-restore-snapshot-live',
      requirement:
        'provision/restore.sh (S3 snapshot restore) is a different path from the Backup feature; restoring a snapshot reproduces file bytes and database rows',
      oracle: 'backup-full-needs-hash',
      edgeTags: ['restore'],
      requires: ['docker'],
      prerequisites: ['a Docker daemon, an S3-compatible store (MinIO) and a database'],
      pending:
        'S3 snapshot restore has no oracle in SYSTEM.md/ADR 0024 (they describe the Backup feature); not claimed'
    }),
    base('cron-timer:inventory', {
      id: 'QA-INFRA-cron-reconcile-db-concurrency',
      requirement:
        'two replicas reconciling concurrently produce exactly the deficit; an intent stranded in `running` by a dead replica is taken back; leases are honoured before / at / after expiry',
      oracle: 'inventory-reconcile-schedule',
      edgeTags: ['concurrent', 'stale-lock', 'time-boundary'],
      requires: ['database'],
      prerequisites: ['TEST_DATABASE_URL (PostgreSQL)'],
      pending:
        'locking and atomicity are PostgreSQL semantics; the fake pool in the schedule cases cannot prove them. The existing apps/tracy-web/test/inventory-reconcile.test.mjs covers them when a database is given, but its expectations are not yet bound to an oracle'
    }),
    base('cron-timer:sync', {
      id: 'QA-INFRA-cron-provision-settle-db',
      requirement:
        'a provision finished while nobody polled is settled by the sweep, exactly once, even across replicas',
      oracle: 'cron-lifecycle',
      edgeTags: ['concurrent', 'restart'],
      requires: ['database'],
      prerequisites: ['TEST_DATABASE_URL (PostgreSQL)'],
      pending:
        'PostgreSQL semantics; see apps/tracy-web/test/provision-settles.test.mjs (oracle not yet bound)'
    }),
    base('script:deploy/scripts/deploy-tracy-stack.sh', {
      id: 'QA-INFRA-deploy-stack-same-tag-and-rollback',
      requirement:
        'deploy-tracy-stack.sh: a same-tag deploy keeps the rollback target, a failed health check puts the previous tag back, and the drain marker is cleared on exit',
      oracle: 'deploy-drain',
      edgeTags: ['idempotent', 'rollback', 'version-mismatch', 'partial-failure'],
      requires: ['bash'],
      pending:
        'this layer has no fake-compose harness for the 570-line deploy script yet; packages/fleet/tracy-fleet-operation/test/deploy-same-tag.test.mjs and deploy-stack-*.test.mjs exercise it with stubs (oracle not yet bound)'
    }),
    base('script:packages/fleet/tracy-fleet-operation/dsh/deploy-host-dsh.sh', {
      id: 'QA-INFRA-deploy-host-dsh-same-tag',
      requirement:
        'deploy-host-dsh.sh does nothing to the host when tag, running image and compose hash are unchanged, and deploys when any of the three moved',
      oracle: 'deploy-drain',
      edgeTags: ['idempotent', 'version-mismatch'],
      requires: ['bash'],
      pending:
        'covered only by the legacy stub suite deploy-same-tag.test.mjs (oracle not yet bound); no own harness'
    }),
    base('script:deploy/scripts/check-local.sh', {
      id: 'QA-INFRA-check-local-stand-probe',
      requirement:
        'deploy/scripts/check-local.sh reports every service of the local compose stack and fails when one is down',
      oracle: 'stand-lifecycle',
      edgeTags: ['dependency-failure'],
      requires: ['stand'],
      pending:
        'the stand answers HTTP, but check-local.sh probes the local compose project by name, not the stand at QA_STAND_URL; no mapping between the two is defined, so no verdict is claimed'
    }),
    base('script:packages/fleet/tracy-fleet-operation/scripts/webroot/webroot-backup.sh', {
      id: 'QA-INFRA-dockerfile-image-build-umask077',
      requirement:
        'a scratch build context created under umask 077 builds an image whose runtime user can still read every copied file (real `docker build`)',
      oracle: 'dockerfile-copy-semantics',
      edgeTags: ['disk-permission'],
      itemIds: ['dockerfile:apps/tracy-web/Dockerfile'],
      requires: ['docker-image:node:24-slim'],
      prerequisites: ['a local node:24-slim image (no pull is made)'],
      pending:
        'a build of the product image needs build outputs and registries this machine cannot provide from a scratch umask-077 context; even with the base image local the verdict stays PENDING. The scratch-context analysis in the dockerfile-*-disk-permission cases covers only the resolved COPY sources'
    })
  )

  for (const suite of LEGACY_SUITES) {
    cases.push(
      base(`legacy-suite:${suite.key}`, {
        id: `QA-INFRA-legacy-${suite.key}`,
        requirement: `Existing suite ${suite.label} runs to the end with no failure; each skip and each failure is listed. Its expected values are not bound to an independent oracle, so it is evidence, not a PASS`,
        oracle: 'legacy-unbound',
        edgeTags: ['happy'],
        requires: suite.requires ? ['database'] : [],
        legacy: suite.key,
        pending:
          'legacy suite: expected values not bound to an independent oracle (plan §2); see legacy/*.tap in the output directory when QA_INFRA_LEGACY=1'
      })
    )
  }
  cases.push(
    base('legacy-suite:python', {
      id: 'QA-INFRA-legacy-python',
      requirement: `The two Python suites (${PYTHON_SUITES.map((f) => f.split('/').pop()).join(', ')}) run when python3 is present`,
      oracle: 'legacy-unbound',
      edgeTags: ['happy'],
      requires: ['python3'],
      legacy: 'python',
      pending: 'legacy suite: expected values not bound to an independent oracle'
    })
  )
  return cases
}
