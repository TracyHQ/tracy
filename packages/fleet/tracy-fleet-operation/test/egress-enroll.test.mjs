import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const provision = path.join(here, '../scripts/provision')
const script = path.join(provision, 'egress-enroll.sh')
const read = (name) => readFileSync(path.join(provision, name), 'utf8')

// Fake docker / iptables / netfilter-persistent: networks come from NETS ("id subnet name" lines),
// DOCKER-USER rules live in a state file, every save is appended to a log.
function rig({ nets, enrolled = [], chain = true, saveFails = false }) {
  const dir = mkdtempSync(path.join(tmpdir(), 'egress-'))
  const state = path.join(dir, 'rules')
  const saves = path.join(dir, 'saves')
  writeFileSync(state, enrolled.map((s) => `${s}\n`).join(''))
  writeFileSync(saves, '')
  writeFileSync(path.join(dir, 'nets'), nets.map((n) => n.join(' ')).join('\n') + '\n')
  const bin = (name, body) => {
    writeFileSync(path.join(dir, name), `#!/usr/bin/env bash\n${body}\n`)
    chmodSync(path.join(dir, name), 0o755)
  }
  bin(
    'docker',
    `NETS="${dir}/nets"
if [ "$1 $2" = "network ls" ]; then awk '{print $1}' "$NETS"; exit 0; fi
if [ "$1 $2" = "network inspect" ]; then
  id="\${@: -1}"
  case "$4" in *Subnet*) awk -v i="$id" '$1==i{print $2" "}' "$NETS" ;; *) awk -v i="$id" '$1==i{print $3}' "$NETS" ;; esac
  exit 0
fi
exit 1`
  )
  bin(
    'iptables',
    `S="${state}"
case "$1" in
  -L) ${chain ? 'exit 0' : 'echo "No chain" >&2; exit 1'} ;;
  -C) grep -qx "$4" "$S" ;;
  -I) echo "$4" >> "$S" ;;
  *) exit 1 ;;
esac`
  )
  bin('netfilter-persistent', saveFails ? 'exit 1' : `echo save >> "${saves}"`)
  const run = () =>
    spawnSync('bash', [script], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}` }
    })
  const rules = () => readFileSync(state, 'utf8').split('\n').filter(Boolean)
  const saveCount = () => readFileSync(saves, 'utf8').split('\n').filter(Boolean).length
  return { run, rules, saveCount, done: () => rmSync(dir, { recursive: true, force: true }) }
}

test('a site network missing from DOCKER-USER after a reboot is enrolled and the ruleset saved', () => {
  const r = rig({
    nets: [
      ['n1', '10.240.1.0/24', 'kept_default'],
      ['n2', '10.240.2.0/24', 'lost_default'],
      ['n3', '172.30.0.0/24', 'tracy_tracy']
    ],
    enrolled: ['10.240.1.0/24']
  })
  try {
    const out = r.run()
    assert.equal(out.status, 0, out.stderr)
    assert.deepEqual(r.rules().sort(), ['10.240.1.0/24', '10.240.2.0/24'])
    assert.match(out.stdout, /enrolled 10\.240\.2\.0\/24 \(lost_default\)/)
    assert.equal(r.saveCount(), 1)
  } finally {
    r.done()
  }
})

test('nothing missing: no rule added, no save, silent', () => {
  const r = rig({ nets: [['n1', '10.240.1.0/24', 'a_default']], enrolled: ['10.240.1.0/24'] })
  try {
    const out = r.run()
    assert.equal(out.status, 0)
    assert.equal(out.stdout, '')
    assert.equal(r.saveCount(), 0)
  } finally {
    r.done()
  }
})

test('a failed save or a missing chain is an error, never success', () => {
  const failing = rig({ nets: [['n1', '10.240.9.0/24', 'x_default']], saveFails: true })
  const noChain = rig({ nets: [['n1', '10.240.9.0/24', 'x_default']], chain: false })
  try {
    assert.notEqual(failing.run().status, 0)
    const out = noChain.run()
    assert.notEqual(out.status, 0)
    assert.match(out.stderr, /bootstrap\.sh/)
    assert.deepEqual(noChain.rules(), [])
  } finally {
    failing.done()
    noChain.done()
  }
})

test('bootstrap installs the script and enables the timer; the timer runs at boot and every 5 minutes', () => {
  const b = read('bootstrap.sh')
  assert.match(b, /install -m 0700 "\$HERE\/egress-enroll\.sh" \/usr\/local\/sbin\/tracy-egress-enroll\.sh/)
  assert.match(b, /systemctl enable --now tracy-egress-enroll\.timer/)
  const unit = read('tracy-egress-enroll.service')
  assert.match(unit, /ExecStart=\/usr\/local\/sbin\/tracy-egress-enroll\.sh/)
  assert.match(unit, /After=docker\.service/)
  const timer = read('tracy-egress-enroll.timer')
  assert.match(timer, /OnBootSec=/)
  assert.match(timer, /OnUnitActiveSec=5min/)
})

test('provision.sh no longer swallows a failed save', () => {
  assert.doesNotMatch(read('provision.sh'), /netfilter-persistent save >\/dev\/null 2>&1 \|\| true/)
})
