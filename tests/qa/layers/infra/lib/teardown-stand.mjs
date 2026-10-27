// A throwaway host for provision/teardown.sh: fake docker on PATH (stateful), scratch roots.
// Nothing outside the scratch directory is touched; the real docker is never reached.
import { scratchDir } from './scratch.mjs'
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { LAYER_DIR, REPO } from './harness.mjs'
import { readBytesSync, readTextSync } from '../../../lib/bounded-reader.mjs'

export const FLEET_SCRIPTS = 'packages/fleet/tracy-fleet-operation/scripts'
const FAKE_DOCKER = path.join(REPO, 'tests/qa/fixtures/infra/fake-docker-teardown.sh')
const FAKE_IPTABLES = path.join(REPO, 'tests/qa/fixtures/infra/fake-iptables.sh')

export const LABEL = 'qa-site-1'
export const SIBLING = 'qa-site-12'
export const SUBSTRING_SIBLING = 'other-qa-site-1'
export const ENV_BYTES = 'DB_PASSWORD=qa-only-copy\nHOST_PORT=52011\n'
const OWN_ID = `a${'0'.repeat(63)}`
const LANE_ID = `b${'0'.repeat(63)}`
const SIBLING_ID = `c${'0'.repeat(63)}`
const SUBSTRING_ID = `d${'0'.repeat(63)}`

export const OWN_NET = '10.240.7.0/24'
export const SIBLING_NET = '10.240.8.0/24'
export const ruleFor = (net) => `DOCKER-USER -s ${net} -j TRACY-FLEET-EGRESS`

export function stand({
  volumes = [`${LABEL}_db ${LABEL}`, `${LABEL}_app ${LABEL}`],
  switches = {},
  rules = []
} = {}) {
  const root = scratchDir('qa-infra-teardown-')
  const dir = (...p) => path.join(root, ...p)
  for (const d of ['state', 'bin', 'private', 'sites', 'jobs', 'hooks'])
    mkdirSync(dir(d), { recursive: true })
  writeFileSync(dir('bin/docker'), readBytesSync(FAKE_DOCKER), { mode: 0o755 })
  writeFileSync(dir('bin/iptables'), readBytesSync(FAKE_IPTABLES), { mode: 0o755 })
  writeFileSync(dir('state/rules'), rules.map((r) => `${r}\n`).join(''))
  const rows = (list) => list.map((r) => `${r}\n`).join('')
  writeFileSync(
    dir('state/networks'),
    rows([`${LABEL}_default ${OWN_NET}`, `${SIBLING}_default ${SIBLING_NET}`])
  )
  writeFileSync(dir('state/volumes'), rows([...volumes, `${SIBLING}_db ${SIBLING}`]))
  writeFileSync(
    dir('state/containers'),
    rows([
      `${OWN_ID} ${LABEL}-db-1 ${LABEL}`,
      `${LANE_ID} ${LABEL}-dsh-truoc-20260905 -`,
      `${SIBLING_ID} ${SIBLING}-db-1 ${SIBLING}`,
      `${SUBSTRING_ID} ${SUBSTRING_SIBLING}-dsh -`
    ])
  )
  writeFileSync(dir('state/calls'), '')
  for (const [name, value] of Object.entries(switches)) writeFileSync(dir('state', name), value)
  mkdirSync(dir('private', LABEL), { recursive: true })
  writeFileSync(dir('private', LABEL, 'docker-compose.yml'), 'services: {}\n')
  writeFileSync(dir('private', LABEL, '.env'), ENV_BYTES)
  mkdirSync(dir('sites', LABEL), { recursive: true })
  for (const log of [`provision-${LABEL}.log`, `teardown-${LABEL}.log`])
    writeFileSync(dir('hooks', log), 'earlier run\n')
  return {
    root,
    dir,
    siteDir: dir('private', LABEL),
    table: (name) => readTextSync(dir('state', name)),
    calls: () => readTextSync(dir('state/calls')).split('\n').filter(Boolean),
    teardownLog: () => dir('hooks', `teardown-${LABEL}.log`),
    setSwitch: (name, value = '') => writeFileSync(dir('state', name), value),
    clearSwitch: (name) => rmSync(dir('state', name), { force: true }),
    dispose() {
      try {
        chmodSync(dir('private'), 0o755)
      } catch {}
      rmSync(root, { recursive: true, force: true })
    }
  }
}

/** Run teardown.sh from product tree `tree` against stand `s`. */
export function runTeardown(tree, s, args = ['--label', LABEL]) {
  const script = path.join(tree, FLEET_SCRIPTS, 'provision/teardown.sh')
  const run = spawnSync('bash', [script, ...args], {
    encoding: 'utf8',
    timeout: 60_000,
    env: {
      PATH: `${s.dir('bin')}:${process.env.PATH}`,
      HOME: s.root,
      FAKE_DOCKER_STATE: s.dir('state'),
      TRACY_PRIVATE_ROOT: s.dir('private'),
      TRACY_SITES_ROOT: s.dir('sites'),
      JOBS_DIR: s.dir('jobs'),
      HOOK_LOG_DIR: s.dir('hooks'),
      CF_CONFIG: s.dir('no-cloudflared/config.yml'),
      // The stand has no tunnel; teardown.sh refuses a host that neither has one nor says so.
      TRACY_TUNNEL: 'none'
    }
  })
  if (run.error) throw new Error(`teardown did not finish: ${run.error.message}`)
  return run
}

export const SUCCESS_MARKER = `TRACY_RESULT torn_down=1 label=${LABEL}`
export const exists = existsSync
export { LAYER_DIR }

/** Run go-live.sh from product tree `tree` against stand `s` (platform `none`: no CMS hook). */
export function runGoLive(tree, s, args) {
  const script = path.join(tree, FLEET_SCRIPTS, 'provision/go-live.sh')
  const run = spawnSync('bash', [script, ...args], {
    encoding: 'utf8',
    timeout: 60_000,
    env: {
      PATH: `${s.dir('bin')}:${process.env.PATH}`,
      HOME: s.root,
      FAKE_DOCKER_STATE: s.dir('state'),
      TRACY_PRIVATE_ROOT: s.dir('private'),
      TRACY_SITES_ROOT: s.dir('sites')
    }
  })
  if (run.error) throw new Error(`go-live did not finish: ${run.error.message}`)
  return run
}
