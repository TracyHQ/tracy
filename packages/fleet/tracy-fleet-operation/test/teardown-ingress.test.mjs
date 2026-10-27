#!/usr/bin/env node
/**
 * `provision/teardown.sh` step 1 — the tunnel rule of a torn-down site must go, on the host shape
 * that actually runs it today: tracy-host in a container, a remotely managed tunnel, no
 * `cloudflared` binary and no `/etc/cloudflared/config.yml`.
 *
 * Measured 21/09/2026 on the dev host: the removal was gated on `cloudflared` + the config file, so
 * it was skipped on every teardown there. `business-joomla.tracy.site` kept its rule to
 * 127.0.0.1:52007 after that demo moved off the port, `base-joomla` was provisioned onto 52007, and
 * the Tracy Business demo served Tracy Base. The hostname was wrong as well: the script defaulted
 * the zone to `tracy.ai`, while provision.sh reads `SITE_DOMAIN` (`tracy.site` on the dev host).
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/teardown-ingress.test.mjs
 *
 * The script runs from a scratch copy of `provision/` + `lib/`, with `ingress_api.py` replaced by a
 * stub that records its argv, and `docker` stubbed on PATH so nothing on this machine is touched.
 */
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import {
  appendFileSync,
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const SCRIPTS = fileURLToPath(new URL('../scripts/', import.meta.url))
const LABEL = 'business-joomla'

function stage() {
  const root = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR || tmpdir(), 'teardown-ingress-'))
  mkdirSync(path.join(root, 'fleet', 'provision'), { recursive: true })
  mkdirSync(path.join(root, 'fleet', 'lib'), { recursive: true })
  copyFileSync(
    path.join(SCRIPTS, 'provision', 'teardown.sh'),
    path.join(root, 'fleet', 'provision', 'teardown.sh')
  )
  // Whatever of the two the tree under test has: a script that does not source the second one runs
  // without it, and one that does fails by itself when it is missing.
  for (const lib of ['roots.sh', 'site-lifecycle.sh', 'site-network.sh'])
    if (existsSync(path.join(SCRIPTS, 'lib', lib)))
      copyFileSync(path.join(SCRIPTS, 'lib', lib), path.join(root, 'fleet', 'lib', lib))
  const argvLog = path.join(root, 'ingress-argv.log')
  // Every stand-in call in the order it happened: `ingress <hostname>` and `docker <args>`.
  const orderLog = path.join(root, 'order.log')
  writeFileSync(
    path.join(root, 'fleet', 'provision', 'ingress_api.py'),
    // Exits with the code named for the hostname in STUB_INGRESS_EXIT (`host=code,host=code`), else 0.
    // STUB_REWRITE_LEDGER names a file to overwrite on the first call — the record changing mid-run.
    [
      'import os, sys',
      `with open(${JSON.stringify(argvLog)}, "a") as f:`,
      '    f.write(" ".join(sys.argv[1:]) + "|" + os.environ.get("TRACY_CF_ACCOUNT_ID", "") + "\\n")',
      'host = sys.argv[sys.argv.index("--hostname") + 1]',
      `with open(${JSON.stringify(orderLog)}, "a") as f:`,
      '    f.write("ingress " + host + "\\n")',
      'rewrite = os.environ.get("STUB_REWRITE_LEDGER")',
      'if rewrite:',
      '    open(rewrite, "w").write("evil.example.com\\n")',
      'codes = dict(p.split("=") for p in os.environ.get("STUB_INGRESS_EXIT", "").split(",") if p)',
      'sys.exit(int(codes.get(host, "0")))',
      ''
    ].join('\n')
  )
  const bin = path.join(root, 'bin')
  mkdirSync(bin)
  // docker: every call is logged, and answered from the files in `state` (none there: no network,
  // no container, no volume — a host that has nothing of the site). `state/<name>` switches:
  //   network            the site's network exists; its content is the subnet
  //   project            full ids of the compose project's containers, one per line
  //   lane               names of lane containers, one per line
  //   network-ls-fails · inspect-empty · network-busy · down-fails · down-keeps · ps-fails
  //   lane-ls-fails · rm-fails · rm-keeps (docker rm exits 0 and removes nothing)
  const state = path.join(root, 'state')
  mkdirSync(state)
  writeFileSync(
    path.join(bin, 'docker'),
    `#!/usr/bin/env bash
S=${JSON.stringify(state)}
echo "docker $*" >> ${JSON.stringify(orderLog)}
on() { [ -e "$S/$1" ]; }
drop() { [ -e "$S/$1" ] || return 0; grep -vxF -- "$2" "$S/$1" > "$S/$1.tmp" || true; mv "$S/$1.tmp" "$S/$1"; }
filter=""; prev=""
for a in "$@"; do [ "$prev" = "--filter" ] && filter="$a"; prev="$a"; done
case "$1 $2" in
  "network ls") on network-ls-fails && { echo "Cannot connect to the Docker daemon" >&2; exit 1; }
    on network && echo 0123456789ab; exit 0 ;;
  "network inspect") on network || exit 1; on inspect-empty && exit 0; cat "$S/network"; exit 0 ;;
  "network rm") on network-busy && { echo "Error response from daemon: network has active endpoints" >&2; exit 1; }
    rm -f "$S/network"; exit 0 ;;
  "compose down") on down-fails && { echo "simulated down failure" >&2; exit 1; }
    on down-keeps || rm -f "$S/project"; exit 0 ;;
  "ps -a") on lane-ls-fails && { echo "Cannot connect to the Docker daemon" >&2; exit 1; }
    [ -e "$S/lane" ] && grep -E -- "$\{filter#name=}" "$S/lane"; exit 0 ;;
  "ps -aq") on ps-fails && { echo "Cannot connect to the Docker daemon" >&2; exit 1; }
    [ -e "$S/project" ] && cat "$S/project"; exit 0 ;;
  "rm -f") on rm-fails && { echo "Error response from daemon: cannot remove container" >&2; exit 1; }
    on rm-keeps && exit 0
    drop lane "$3"; drop project "$3"; exit 0 ;;
esac
exit 0
`
  )
  chmodSync(path.join(bin, 'docker'), 0o755)
  for (const dir of ['private', 'sites', 'jobs', 'hooks']) mkdirSync(path.join(root, dir))
  return { root, bin, argvLog, orderLog, state }
}

function teardown({ root, bin }, extraEnv) {
  const env = {
    PATH: `${bin}:${process.env.PATH}`,
    HOME: root,
    TRACY_PRIVATE_ROOT: path.join(root, 'private'),
    TRACY_SITES_ROOT: path.join(root, 'sites'),
    JOBS_DIR: path.join(root, 'jobs'),
    HOOK_LOG_DIR: path.join(root, 'hooks'),
    // A path that does not exist: the file road must never be what makes this pass.
    CF_CONFIG: path.join(root, 'no-cloudflared', 'config.yml'),
    // What tracy-host says for a host with no tunnel configured; the API names, when a test gives
    // them, are the road taken instead. A test of a host that says nothing passes `TRACY_TUNNEL: ''`.
    TRACY_TUNNEL: 'none',
    // No firewall on the machine running the tests; the tests of step 4 put a stand-in on PATH.
    TRACY_EGRESS_FENCE: 'off',
    ...extraEnv
  }
  return spawnSync('bash', [path.join(root, 'fleet', 'provision', 'teardown.sh'), '--label', LABEL], {
    env,
    encoding: 'utf8',
    // Nothing here may wait: a record that is a pipe, or a lock somebody holds, must end the script.
    timeout: 60_000
  })
}

test('API credentials alone remove the rule, under the SITE_DOMAIN zone — no cloudflared, no config file', () => {
  const s = stage()
  try {
    const run = teardown(s, {
      SITE_DOMAIN: 'tracy.site',
      TRACY_CF_API_TOKEN: 'cf-tok',
      TRACY_CF_ACCOUNT_ID: 'acct-1',
      TRACY_TUNNEL_ID: 'tun-1'
    })
    assert.equal(run.status, 0, run.stderr)
    assert.ok(existsSync(s.argvLog), `ingress_api.py was never called:\n${run.stdout}`)
    assert.equal(readFileSync(s.argvLog, 'utf8'), `--hostname ${LABEL}.tracy.site --remove|acct-1\n`)
  } finally {
    rmSync(s.root, { recursive: true, force: true })
  }
})

test('FLEET_ZONE still wins over SITE_DOMAIN, the same order provision.sh reads them in', () => {
  const s = stage()
  try {
    const run = teardown(s, {
      FLEET_ZONE: 'tracy.ai',
      SITE_DOMAIN: 'tracy.site',
      TRACY_CF_API_TOKEN: 'cf-tok',
      TRACY_CF_ACCOUNT_ID: 'acct-1',
      TRACY_TUNNEL_ID: 'tun-1'
    })
    assert.equal(run.status, 0, run.stderr)
    assert.equal(readFileSync(s.argvLog, 'utf8'), `--hostname ${LABEL}.tracy.ai --remove|acct-1\n`)
  } finally {
    rmSync(s.root, { recursive: true, force: true })
  }
})

test('a host DECLARED to have no tunnel has no rule to remove, and the teardown succeeds saying so', () => {
  const s = stage()
  try {
    const run = teardown(s, { SITE_DOMAIN: 'tracy.site', TRACY_TUNNEL: 'none' })
    assert.equal(run.status, 0, run.stderr)
    assert.equal(existsSync(s.argvLog), false)
    assert.match(run.stdout, /declared to have no tunnel \(TRACY_TUNNEL=none\)/)
    assert.match(run.stdout, new RegExp(`^TRACY_RESULT torn_down=1 label=${LABEL}$`, 'm'))
  } finally {
    rmSync(s.root, { recursive: true, force: true })
  }
})

test('no road to the tunnel and nobody saying there is none: refused whole — "cannot look" is not "no rule"', () => {
  for (const said of ['', 'no', 'NONE', '1']) {
    const s = stage()
    try {
      const dir = path.join(s.root, 'private', LABEL)
      mkdirSync(dir, { recursive: true })
      writeFileSync(path.join(dir, 'docker-compose.yml'), 'services: {}\n')
      const run = teardown(s, { SITE_DOMAIN: 'tracy.site', TRACY_TUNNEL: said })
      assert.equal(run.status, 1, `${said}: ${run.stdout}${run.stderr}`)
      assert.match(run.stderr, /no road to the tunnel .* cannot be told — nothing was changed/, said)
      assert.doesNotMatch(run.stdout, /TRACY_RESULT/, said)
      assert.equal(existsSync(s.orderLog), false, `${said}: not one docker or ingress call`)
      assert.equal(existsSync(path.join(dir, 'docker-compose.yml')), true, said)
    } finally {
      rmSync(s.root, { recursive: true, force: true })
    }
  }
})

test("the site's seal and measured facts go with it, and nobody else's do", () => {
  // Measured 23/09/2026 on the local stand: 13 test sites deleted through the delete door left 25 of
  // these files behind — they sit beside the site folders, which is exactly why the folder removal
  // never reached them — and the next site given one of those labels would have inherited them.
  const s = stage()
  try {
    const sites = path.join(s.root, 'sites')
    for (const dir of ['.content-contracts', '.site-facts']) {
      mkdirSync(path.join(sites, dir), { recursive: true })
      writeFileSync(path.join(sites, dir, `${LABEL}.json`), '{}')
      writeFileSync(path.join(sites, dir, 'another-site.json'), '{}')
    }
    mkdirSync(path.join(sites, LABEL))
    const run = teardown(s, { SITE_DOMAIN: 'tracy.site' })
    assert.equal(run.status, 0, run.stderr)
    for (const dir of ['.content-contracts', '.site-facts']) {
      assert.equal(existsSync(path.join(sites, dir, `${LABEL}.json`)), false, `${dir}/${LABEL}.json is gone`)
      assert.equal(
        existsSync(path.join(sites, dir, 'another-site.json')),
        true,
        `another site's ${dir} file is kept`
      )
    }
    assert.equal(existsSync(path.join(sites, LABEL)), false)
  } finally {
    rmSync(s.root, { recursive: true, force: true })
  }
})

test("an imported copy's record of its derived contract goes with it, and nobody else's does", () => {
  // 01/10/2026: `collect-import-contract.mjs` writes `.import-contracts/<label>/manifest.json` beside the site
  // folders, and that record is what gives the agent the derived door; left behind, the next copy given
  // this label would be told about a contract its own plugin never derived.
  const s = stage()
  try {
    const sites = path.join(s.root, 'sites')
    for (const label of [LABEL, 'another-site']) {
      mkdirSync(path.join(sites, '.import-contracts', label), { recursive: true })
      writeFileSync(path.join(sites, '.import-contracts', label, 'manifest.json'), '{}')
    }
    mkdirSync(path.join(sites, LABEL))
    const run = teardown(s, { SITE_DOMAIN: 'tracy.site' })
    assert.equal(run.status, 0, run.stderr)
    assert.equal(existsSync(path.join(sites, '.import-contracts', LABEL)), false)
    assert.equal(existsSync(path.join(sites, '.import-contracts', 'another-site', 'manifest.json')), true)
  } finally {
    rmSync(s.root, { recursive: true, force: true })
  }
})

// ── the customer's own domains: their rules point at this site's port, and go before the folder ──

const CF = {
  SITE_DOMAIN: 'tracy.site',
  TRACY_CF_API_TOKEN: 'cf-tok',
  TRACY_CF_ACCOUNT_ID: 'acct-1',
  TRACY_TUNNEL_ID: 'tun-1'
}

function withDomains(s, { ledger = 'shop.example.com\nwww.example.com\n', env = 'HOST_PORT=52007\n' } = {}) {
  const dir = path.join(s.root, 'private', LABEL)
  mkdirSync(dir, { recursive: true })
  if (env !== null) writeFileSync(path.join(dir, '.env'), env)
  writeFileSync(path.join(dir, '.golive-domains'), ledger)
  return dir
}

test("the site's own domains on record are taken out of the tunnel too, each only when its rule is this site's port", () => {
  const s = stage()
  try {
    const dir = withDomains(s)
    // The second name has moved to another site since: the script says so (3) and leaves it.
    const run = teardown(s, { ...CF, STUB_INGRESS_EXIT: 'www.example.com=3' })
    assert.equal(run.status, 0, run.stderr)
    assert.deepEqual(readFileSync(s.argvLog, 'utf8').trim().split('\n'), [
      `--hostname ${LABEL}.tracy.site --remove|acct-1`,
      // #1037: this site's by its old port, or by its owner record when the rule leads to tracy-web.
      `--hostname shop.example.com --remove --only-port 52007 --owner ${LABEL}|acct-1`,
      `--hostname www.example.com --remove --only-port 52007 --owner ${LABEL}|acct-1`
    ])
    assert.match(run.stdout, /==> ingress: removed shop\.example\.com/)
    assert.match(run.stdout, /==> ingress: www\.example\.com is not routed to this site/)
    assert.equal(existsSync(dir), false, 'with every rule accounted for, the folder goes')
  } finally {
    rmSync(s.root, { recursive: true, force: true })
  }
})

test('an own domain whose rule could not be removed stops the teardown before the folder goes — the port stays taken, the record stays', () => {
  const s = stage()
  try {
    const dir = withDomains(s)
    const run = teardown(s, { ...CF, STUB_INGRESS_EXIT: 'shop.example.com=1' })
    assert.notEqual(run.status, 0, run.stdout)
    assert.match(run.stderr, /the ingress rule of shop\.example\.com .* could not be removed/)
    assert.equal(existsSync(path.join(dir, '.env')), true)
    assert.equal(
      readFileSync(path.join(dir, '.golive-domains'), 'utf8'),
      'shop.example.com\nwww.example.com\n'
    )
    assert.doesNotMatch(readFileSync(s.argvLog, 'utf8'), /www\.example\.com/, 'stopped at the first one')
  } finally {
    rmSync(s.root, { recursive: true, force: true })
  }
})

/** What was called, in order (`ingress <hostname>` · `docker <args>`); empty when nothing was. */
const order = (s) => (existsSync(s.orderLog) ? readFileSync(s.orderLog, 'utf8').trim().split('\n') : [])
/** Whether the stack was brought down — the first step that destroys data. */
const destroyed = (s) => order(s).some((line) => line.startsWith('docker compose down'))

/** A site folder with a compose file, so bringing the stack down is something the script would do. */
function siteDir(s, { env = 'HOST_PORT=52007\n' } = {}) {
  const dir = path.join(s.root, 'private', LABEL)
  mkdirSync(dir, { recursive: true })
  if (env !== null) writeFileSync(path.join(dir, '.env'), env)
  writeFileSync(path.join(dir, 'docker-compose.yml'), 'services: {}\n')
  return dir
}

test('own domains on record but no readable port: the teardown stops before anything is touched — whose rule a name is cannot be told', () => {
  // `link`: a `.env` that is a link to ANOTHER site's — read through it, this teardown would take
  // that site's rules out. `pipe`: a plain open of it would never return. Neither is opened as a file.
  for (const env of [null, 'HOST_PORT=\n', 'HOST_PORT=80; rm -rf /\n', 'link', 'pipe']) {
    const s = stage()
    try {
      const dir = siteDir(s, { env: env === 'link' || env === 'pipe' ? null : env })
      if (env === 'link') {
        writeFileSync(path.join(s.root, 'other.env'), 'HOST_PORT=52999\n')
        symlinkSync(path.join(s.root, 'other.env'), path.join(dir, '.env'))
      }
      if (env === 'pipe') assert.equal(spawnSync('mkfifo', [path.join(dir, '.env')]).status, 0)
      writeFileSync(path.join(dir, '.golive-domains'), 'shop.example.com\n')
      const run = teardown(s, CF)
      assert.notEqual(run.status, 0, String(env))
      assert.match(run.stderr, /cannot read HOST_PORT/, String(env))
      assert.equal(existsSync(path.join(dir, '.golive-domains')), true, String(env))
      assert.deepEqual(order(s), [], `${env}: not one ingress or docker call`)
    } finally {
      rmSync(s.root, { recursive: true, force: true })
    }
  }
})

test('no record, or an empty one, is a site with no own domains: only its Tracy hostname leaves the tunnel', () => {
  for (const kind of ['none', 'empty', 'blank lines']) {
    const s = stage()
    try {
      const dir = siteDir(s)
      if (kind === 'empty') writeFileSync(path.join(dir, '.golive-domains'), '')
      if (kind === 'blank lines') writeFileSync(path.join(dir, '.golive-domains'), '\n\n')
      const run = teardown(s, CF)
      assert.equal(run.status, 0, `${kind}: ${run.stderr}`)
      assert.equal(readFileSync(s.argvLog, 'utf8'), `--hostname ${LABEL}.tracy.site --remove|acct-1\n`, kind)
      assert.equal(existsSync(dir), false, kind)
    } finally {
      rmSync(s.root, { recursive: true, force: true })
    }
  }
})

test('a record that cannot be trusted is NOT "no domains": the teardown refuses before the first destructive step, for every kind of it', () => {
  const kinds = {
    'a link to a file': (file, s) => {
      writeFileSync(path.join(s.root, 'elsewhere'), 'victim.example.com\n')
      symlinkSync(path.join(s.root, 'elsewhere'), file)
    },
    'a dangling link': (file, s) => symlinkSync(path.join(s.root, 'nowhere'), file),
    'a pipe': (file) => assert.equal(spawnSync('mkfifo', [file]).status, 0),
    'a folder': (file) => mkdirSync(file),
    'a file nobody may read': (file) => {
      writeFileSync(file, 'shop.example.com\n')
      chmodSync(file, 0o000)
    },
    'a line that is not a host name': (file) => writeFileSync(file, 'shop.example.com\n--remove\n'),
    'a line with a space in it': (file) => writeFileSync(file, 'shop.example.com extra\n'),
    'an upper-case name': (file) => writeFileSync(file, 'Shop.Example.com\n'),
    'a single label': (file) => writeFileSync(file, 'localhost\n'),
    'a name over 253 characters': (file) => writeFileSync(file, `${'a'.repeat(60)}.`.repeat(5) + 'com\n'),
    'a file far too large to be a record': (file) => writeFileSync(file, 'shop.example.com\n'.repeat(5000))
  }
  for (const [kind, make] of Object.entries(kinds)) {
    const s = stage()
    try {
      const dir = siteDir(s)
      const file = path.join(dir, '.golive-domains')
      make(file, s)
      // Root reads a mode-000 file; there the kind proves nothing and is left out.
      if (kind === 'a file nobody may read' && process.getuid?.() === 0) continue
      const run = teardown(s, CF)
      assert.equal(run.error, undefined, `${kind}: the script must end by itself, never wait`)
      assert.equal(run.status, 1, `${kind}: ${run.stdout}${run.stderr}`)
      assert.match(run.stderr, /cannot be taken out of the tunnel — nothing was changed/, kind)
      assert.deepEqual(order(s), [], `${kind}: not one ingress or docker call`)
      assert.equal(existsSync(path.join(dir, '.env')), true, kind)
      assert.equal(existsSync(path.join(dir, 'docker-compose.yml')), true, kind)
      assert.doesNotMatch(run.stdout, /TRACY_RESULT torn_down=1/, kind)
      if (kind === 'a link to a file')
        assert.equal(readFileSync(path.join(s.root, 'elsewhere'), 'utf8'), 'victim.example.com\n')
    } finally {
      // A mode-000 file inside would stop nothing here (the folder is ours), but say so anyway.
      rmSync(s.root, { recursive: true, force: true })
    }
  }
})

test('domains on record and no road to the tunnel they were added through: refused whole, on a host with no tunnel and on one with only a config file', () => {
  for (const road of ['no tunnel', 'config file']) {
    const s = stage()
    try {
      const dir = siteDir(s)
      writeFileSync(path.join(dir, '.golive-domains'), 'shop.example.com\n')
      const extra = { SITE_DOMAIN: 'tracy.site' }
      if (road === 'config file') {
        writeFileSync(path.join(s.bin, 'cloudflared'), '#!/usr/bin/env bash\nexit 0\n')
        chmodSync(path.join(s.bin, 'cloudflared'), 0o755)
        const config = path.join(s.root, 'cloudflared.yml')
        writeFileSync(config, 'ingress: []\n')
        extra.CF_CONFIG = config
      }
      const run = teardown(s, extra)
      assert.equal(run.status, 1, `${road}: ${run.stdout}${run.stderr}`)
      assert.match(run.stderr, /no Cloudflare API credentials to take them out — nothing was changed/, road)
      assert.deepEqual(order(s), [], road)
      assert.equal(existsSync(path.join(dir, '.golive-domains')), true, road)
    } finally {
      rmSync(s.root, { recursive: true, force: true })
    }
  }
})

test('the door is closed BEFORE the stack and its data go: every rule first, and a rule that cannot be removed leaves the site running', () => {
  // The order of a teardown that goes through.
  const fine = stage()
  try {
    const dir = siteDir(fine)
    writeFileSync(path.join(dir, '.golive-domains'), 'shop.example.com\n')
    const run = teardown(fine, CF)
    assert.equal(run.status, 0, run.stderr)
    const calls = order(fine)
    const down = calls.findIndex((line) => line.startsWith('docker compose down'))
    assert.notEqual(down, -1, calls.join('\n'))
    for (const host of [`${LABEL}.tracy.site`, 'shop.example.com']) {
      const at = calls.indexOf(`ingress ${host}`)
      assert.ok(
        at !== -1 && at < down,
        `${host} leaves the tunnel before the stack goes:\n${calls.join('\n')}`
      )
    }
    assert.match(run.stdout, new RegExp(`^TRACY_RESULT torn_down=1 label=${LABEL}$`, 'm'))
  } finally {
    rmSync(fine.root, { recursive: true, force: true })
  }
  // Each rule that cannot be removed — the Tracy hostname's or an own domain's — stops it there.
  for (const stuck of [`${LABEL}.tracy.site`, 'shop.example.com']) {
    const s = stage()
    try {
      const dir = siteDir(s)
      writeFileSync(path.join(dir, '.golive-domains'), 'shop.example.com\n')
      const run = teardown(s, { ...CF, STUB_INGRESS_EXIT: `${stuck}=1` })
      assert.equal(run.status, 1, `${stuck}: ${run.stdout}`)
      assert.match(run.stderr, /could not be removed/, stuck)
      assert.equal(destroyed(s), false, `${stuck}: the stack was not brought down`)
      assert.equal(existsSync(path.join(dir, 'docker-compose.yml')), true, stuck)
      assert.equal(readFileSync(path.join(dir, '.golive-domains'), 'utf8'), 'shop.example.com\n', stuck)
      assert.doesNotMatch(run.stdout, /TRACY_RESULT torn_down=1/, stuck)
    } finally {
      rmSync(s.root, { recursive: true, force: true })
    }
  }
})

test('the record is read once: a name written into it while the teardown runs is not acted on', () => {
  const s = stage()
  try {
    const dir = siteDir(s)
    const file = path.join(dir, '.golive-domains')
    writeFileSync(file, 'shop.example.com\n')
    const run = teardown(s, { ...CF, STUB_REWRITE_LEDGER: file })
    assert.equal(run.status, 0, run.stderr)
    assert.deepEqual(
      order(s).filter((line) => line.startsWith('ingress ')),
      [`ingress ${LABEL}.tracy.site`, 'ingress shop.example.com']
    )
  } finally {
    rmSync(s.root, { recursive: true, force: true })
  }
})

// ── one lifecycle script per site ────────────────────────────────────────────────────────────────

/** Hold the site's lifecycle lock from another process, as a running go-live.sh does. */
function holdLifecycleLock(s) {
  const file = path.join(s.root, 'private', `.go-live-${LABEL}.lock`)
  const holder = spawn(
    'python3',
    [
      '-c',
      'import fcntl, sys, time\nf = open(sys.argv[1], "a")\nfcntl.flock(f, fcntl.LOCK_EX)\nprint("held", flush=True)\ntime.sleep(120)',
      file
    ],
    { stdio: ['ignore', 'pipe', 'inherit'] }
  )
  const held = new Promise((resolve, reject) => {
    holder.stdout.once('data', () => resolve())
    holder.once('exit', (code) => reject(new Error(`the lock holder ended early (${code})`)))
  })
  const closed = new Promise((resolve) => holder.once('close', () => resolve()))
  // Safe to call twice: the second call finds the holder already gone.
  const release = () => {
    holder.kill('SIGKILL')
    return closed
  }
  return { held, release, file }
}

test('a teardown beside a running go-live of the same site ends at once, having changed nothing — and runs once that one has ended', async () => {
  const s = stage()
  const lock = holdLifecycleLock(s)
  try {
    const dir = siteDir(s)
    writeFileSync(path.join(dir, '.golive-domains'), 'shop.example.com\n')
    await lock.held
    const busy = teardown(s, CF)
    assert.equal(busy.status, 75, `${busy.stdout}${busy.stderr}`)
    assert.match(busy.stderr, /a go-live or another teardown of it is running — nothing was changed/)
    assert.deepEqual(order(s), [])
    assert.equal(existsSync(path.join(dir, 'docker-compose.yml')), true)
    // The holder is killed, not asked to let go: the lock is the kernel's, gone with the process.
    await lock.release()
    const after = teardown(s, CF)
    assert.equal(after.status, 0, after.stderr)
    assert.equal(existsSync(dir), false)
    assert.equal(existsSync(lock.file), false, "the lock's file goes with the site")
  } finally {
    await lock.release()
    rmSync(s.root, { recursive: true, force: true })
  }
})

test('a lifecycle lock that cannot be taken is not a free one: a link under its name, or no private root, stops the teardown', () => {
  const linked = stage()
  try {
    siteDir(linked)
    appendFileSync(path.join(linked.root, 'elsewhere'), '')
    symlinkSync(
      path.join(linked.root, 'elsewhere'),
      path.join(linked.root, 'private', `.go-live-${LABEL}.lock`)
    )
    const run = teardown(linked, CF)
    assert.equal(run.status, 1, `${run.stdout}${run.stderr}`)
    assert.match(run.stderr, /lifecycle lock could not be taken — nothing was changed/)
    assert.deepEqual(order(linked), [])
  } finally {
    rmSync(linked.root, { recursive: true, force: true })
  }
  // A link to nowhere (an open that follows it would make the file) and a pipe (a plain open would
  // wait for ever): refused for what was opened, with nothing made and nothing waited for.
  for (const what of ['a dangling link', 'a pipe']) {
    const s = stage()
    try {
      siteDir(s)
      const file = path.join(s.root, 'private', `.go-live-${LABEL}.lock`)
      if (what === 'a pipe') assert.equal(spawnSync('mkfifo', [file]).status, 0)
      else symlinkSync(path.join(s.root, 'nowhere'), file)
      const run = teardown(s, CF)
      assert.equal(run.status, 1, `${what}: ${run.stdout}${run.stderr}`)
      assert.match(run.stderr, /lifecycle lock could not be taken — nothing was changed/, what)
      assert.deepEqual(order(s), [], what)
      assert.equal(existsSync(path.join(s.root, 'nowhere')), false, what)
    } finally {
      rmSync(s.root, { recursive: true, force: true })
    }
  }
  const rootless = stage()
  try {
    const run = teardown(rootless, { ...CF, TRACY_PRIVATE_ROOT: path.join(rootless.root, 'no-such-root') })
    assert.equal(run.status, 1, `${run.stdout}${run.stderr}`)
    assert.deepEqual(order(rootless), [])
  } finally {
    rmSync(rootless.root, { recursive: true, force: true })
  }
})

// ── the closing line is a confirmation: every required step, on every road, seen to have happened ──

const RESULT = new RegExp(`^TRACY_RESULT torn_down=1 label=${LABEL}$`, 'm')
const put = (s, name, content = '') => writeFileSync(path.join(s.state, name), content)
const has = (s, name) => existsSync(path.join(s.state, name))
const SUBNET = '10.240.7.0/24'
const RULE = `-A DOCKER-USER -s ${SUBNET} -j TRACY-FLEET-EGRESS`
const ID = (n) => `${n}`.repeat(64)

/**
 * The host tools of the config-file road and of step 4, as stand-ins on PATH that log to the order
 * log and answer from `state`: `cloudflared`, `systemctl`, `flock`, `iptables`,
 * `netfilter-persistent`, and `ingress.py` beside the script. Switches: `ingress-py-fails`,
 * `validate-fails`, `restart-fails`, `rules` (the chain's listing), `chain-unreadable`,
 * `chain-unreadable-later` (readable once, then not), `delete-fails`, `rule-hidden` (`-C` finds a
 * rule the listing does not show), `save-fails`.
 */
function hostTools(s, names) {
  const tool = (name, body) => {
    writeFileSync(
      path.join(s.bin, name),
      `#!/usr/bin/env bash\nS=${JSON.stringify(s.state)}\necho "${name} $*" >> ${JSON.stringify(s.orderLog)}\n${body}\n`
    )
    chmodSync(path.join(s.bin, name), 0o755)
  }
  const bodies = {
    cloudflared: '[ -e "$S/validate-fails" ] && exit 1; exit 0',
    systemctl: '[ -e "$S/restart-fails" ] && exit 1; exit 0',
    flock: 'exit 0',
    'netfilter-persistent': '[ -e "$S/save-fails" ] && exit 1; exit 0',
    iptables: `case "$1" in
  -S) [ -e "$S/chain-unreadable" ] && { echo "iptables: Permission denied" >&2; exit 4; }
      if [ -e "$S/chain-unreadable-later" ]; then
        [ -e "$S/chain-read-once" ] && { echo "iptables: Permission denied" >&2; exit 4; }
        : > "$S/chain-read-once"
      fi
      [ -e "$S/rules" ] && cat "$S/rules"; exit 0 ;;
  -D) [ -e "$S/delete-fails" ] && { echo "iptables: Bad rule" >&2; exit 1; }
      # One copy per call, as the real one does.
      awk -v r="-A DOCKER-USER -s $4 -j $6" 'r != $0 || done { print; next } { done = 1 }' "$S/rules" > "$S/rules.tmp"
      mv "$S/rules.tmp" "$S/rules"; exit 0 ;;
  -C) [ -e "$S/rule-hidden" ] && exit 0
      [ -e "$S/rules" ] && grep -qxF -- "-A DOCKER-USER -s $4 -j $6" "$S/rules" && exit 0; exit 1 ;;
esac
exit 2`
  }
  for (const name of names) tool(name, bodies[name])
  if (names.includes('cloudflared')) {
    writeFileSync(
      path.join(s.root, 'fleet', 'provision', 'ingress.py'),
      [
        'import os, sys',
        `with open(${JSON.stringify(s.orderLog)}, "a") as f:`,
        '    f.write("ingress.py " + " ".join(sys.argv[1:]) + "\\n")',
        `sys.exit(1 if os.path.exists(${JSON.stringify(path.join(s.state, 'ingress-py-fails'))}) else 0)`,
        ''
      ].join('\n')
    )
    writeFileSync(path.join(s.root, 'cloudflared.yml'), 'ingress: []\n')
  }
}

/** The environment of a host whose tunnel is a config file this script edits. */
const fileRoad = (s) => ({
  SITE_DOMAIN: 'tracy.site',
  TRACY_TUNNEL: '',
  CF_CONFIG: path.join(s.root, 'cloudflared.yml'),
  TRACY_INGRESS_LOCK: path.join(s.root, 'ingress.lock')
})

/** Refused with the site whole: no closing line, the stack never brought down, the folder there. */
function assertWhole(s, dir, run, why) {
  assert.equal(run.status, 1, `${why}: ${run.stdout}${run.stderr}`)
  assert.doesNotMatch(run.stdout, RESULT, why)
  assert.equal(destroyed(s), false, `${why}: the stack was brought down`)
  assert.equal(existsSync(path.join(dir, 'docker-compose.yml')), true, why)
}

test('config-file road: the rule out of the file, the file valid and the tunnel restarted — all three, or the site stays whole', () => {
  for (const [fails, said] of [
    ['ingress-py-fails', /could not be removed from .*cloudflared\.yml — nothing else was changed/],
    ['validate-fails', /could not be removed from .*cloudflared\.yml — nothing else was changed/],
    ['restart-fails', /cloudflared could not be restarted, so the running tunnel still has the rule/]
  ]) {
    const s = stage()
    try {
      const dir = siteDir(s)
      hostTools(s, ['cloudflared', 'systemctl', 'flock'])
      put(s, fails)
      const run = teardown(s, fileRoad(s))
      assertWhole(s, dir, run, fails)
      assert.match(run.stderr, said, fails)
    } finally {
      rmSync(s.root, { recursive: true, force: true })
    }
  }
  const s = stage()
  try {
    const dir = siteDir(s)
    hostTools(s, ['cloudflared', 'systemctl', 'flock'])
    const run = teardown(s, fileRoad(s))
    assert.equal(run.status, 0, run.stderr)
    assert.match(run.stdout, RESULT)
    const did = order(s)
    const at = (start) => did.findIndex((line) => line.startsWith(start))
    assert.ok(
      at(`ingress.py --config`) >= 0 &&
        did[at('ingress.py --config')].includes(`${LABEL}.tracy.site --remove`)
    )
    assert.ok(at('cloudflared tunnel') > at('ingress.py --config'), did.join('\n'))
    assert.ok(at('systemctl restart cloudflared') > at('cloudflared tunnel'), did.join('\n'))
    assert.ok(
      at('docker compose down') > at('systemctl restart cloudflared'),
      'the door first, then the stack'
    )
    assert.equal(existsSync(dir), false)
  } finally {
    rmSync(s.root, { recursive: true, force: true })
  }
})

test('config-file road without the tools to change the file safely is refused before anything is touched', () => {
  for (const missing of ['flock', 'systemctl']) {
    const s = stage()
    try {
      const dir = siteDir(s)
      hostTools(
        s,
        ['cloudflared', 'systemctl', 'flock'].filter((name) => name !== missing)
      )
      // Only this test's stand-ins and the system's own tools: a `flock` or `systemctl` installed
      // on the machine running the tests must not be what the script finds.
      const run = teardown(s, { ...fileRoad(s), PATH: `${s.bin}:/usr/bin:/bin` })
      if (spawnSync('bash', ['-c', `PATH=/usr/bin:/bin command -v ${missing}`]).status === 0) continue
      assertWhole(s, dir, run, missing)
      assert.match(run.stderr, new RegExp(`there is no ${missing} here to change it safely`), missing)
      assert.deepEqual(order(s), [], missing)
    } finally {
      rmSync(s.root, { recursive: true, force: true })
    }
  }
})

test('the stack: whatever compose down said, docker is asked what is left — a container that stays, or a docker that cannot say, keeps the site and its folder', () => {
  for (const [why, setup, said] of [
    [
      'down fails and the container cannot be removed',
      ['down-fails', 'rm-fails'],
      /could not remove container 1{64} of compose project/
    ],
    [
      'down exits 0 but keeps the container, and rm removes nothing',
      ['down-keeps', 'rm-keeps'],
      /still there after docker rm: 1{64}/
    ],
    [
      'docker cannot list the containers',
      ['ps-fails'],
      /cannot ask docker which containers of compose project .* remain/
    ]
  ]) {
    const s = stage()
    try {
      const dir = siteDir(s)
      put(s, 'project', `${ID(1)}\n`)
      for (const name of setup) put(s, name)
      const run = teardown(s, CF)
      assert.equal(run.status, 1, `${why}: ${run.stdout}${run.stderr}`)
      assert.doesNotMatch(run.stdout, RESULT, why)
      assert.match(run.stderr, said, why)
      assert.equal(existsSync(dir), true, `${why}: the folder (and the port it holds) stays`)
    } finally {
      rmSync(s.root, { recursive: true, force: true })
    }
  }
  // A failed `down` whose leftovers CAN be removed is a finished teardown.
  const s = stage()
  try {
    const dir = siteDir(s)
    put(s, 'project', `${ID(1)}\n${ID(2)}\n`)
    put(s, 'down-fails')
    const run = teardown(s, CF)
    assert.equal(run.status, 0, run.stderr)
    assert.match(run.stdout, RESULT)
    assert.equal(readFileSync(path.join(s.state, 'project'), 'utf8'), '')
    assert.equal(existsSync(dir), false)
  } finally {
    rmSync(s.root, { recursive: true, force: true })
  }
})

test('the lane containers: listed, removed and listed again — one that stays, or a docker that cannot list them, keeps the site', () => {
  const lanes = `${LABEL}-dsh\n${LABEL}-dsh-truoc-20260905-055255\n${LABEL}-agent\n${LABEL}-dshop\n`
  for (const [why, setup, said] of [
    [
      'a lane container cannot be removed',
      ['rm-fails'],
      /could not remove the lane container business-joomla-dsh of/
    ],
    [
      'docker rm exits 0 and the container is still there',
      ['rm-keeps'],
      /lane container\(s\) .* are still there after docker rm/
    ],
    ['docker cannot list them', ['lane-ls-fails'], /cannot ask docker which lane containers of .* remain/]
  ]) {
    const s = stage()
    try {
      const dir = siteDir(s)
      put(s, 'lane', lanes)
      for (const name of setup) put(s, name)
      const run = teardown(s, CF)
      assert.equal(run.status, 1, `${why}: ${run.stdout}${run.stderr}`)
      assert.doesNotMatch(run.stdout, RESULT, why)
      assert.match(run.stderr, said, why)
      assert.equal(existsSync(dir), true, why)
    } finally {
      rmSync(s.root, { recursive: true, force: true })
    }
  }
  const s = stage()
  try {
    siteDir(s)
    put(s, 'lane', lanes)
    const run = teardown(s, CF)
    assert.equal(run.status, 0, run.stderr)
    assert.match(run.stdout, RESULT)
    // The neighbour whose name only begins like a lane of this site is not this site's.
    assert.equal(readFileSync(path.join(s.state, 'lane'), 'utf8'), `${LABEL}-dshop\n`)
  } finally {
    rmSync(s.root, { recursive: true, force: true })
  }
})

test("the mail rule of the site's subnet: a chain that cannot be read is refused up front; a rule that will not go, cannot be confirmed or cannot be saved ends without the closing line and keeps the network", () => {
  // Up front, with the site whole.
  for (const why of ['chain-unreadable', 'no iptables at all']) {
    const s = stage()
    try {
      const dir = siteDir(s)
      put(s, 'network', `${SUBNET}\n`)
      if (why === 'chain-unreadable') {
        hostTools(s, ['iptables', 'netfilter-persistent'])
        put(s, 'chain-unreadable')
      }
      const run = teardown(s, {
        ...CF,
        TRACY_EGRESS_FENCE: 'on',
        ...(why === 'chain-unreadable' ? {} : { PATH: `${s.bin}:/usr/bin:/bin` })
      })
      assertWhole(s, dir, run, why)
      assert.match(run.stderr, /firewall chain DOCKER-USER cannot be read here .* nothing was changed/, why)
      assert.equal(existsSync(s.argvLog), false, `${why}: not even the tunnel was touched`)
    } finally {
      rmSync(s.root, { recursive: true, force: true })
    }
  }
  // After the site is down: said, the network kept, no closing line.
  for (const [why, setup, said, networkKept] of [
    [
      'the rule cannot be deleted',
      ['delete-fails'],
      /mail rule of 10\.240\.7\.0\/24 could not be removed/,
      true
    ],
    [
      'the chain stops answering',
      ['chain-unreadable-later'],
      /could not be read, so the mail rule of 10\.240\.7\.0\/24 may still be in it/,
      true
    ],
    [
      'the listing does not show a rule -C finds',
      ['rule-hidden'],
      /still has the mail rule of 10\.240\.7\.0\/24/,
      true
    ],
    [
      'the rules cannot be saved',
      ['save-fails'],
      /could not be saved — a reboot would bring the mail rule/,
      false
    ]
  ]) {
    const s = stage()
    try {
      siteDir(s)
      put(s, 'network', `${SUBNET}\n`)
      hostTools(s, ['iptables', 'netfilter-persistent'])
      put(s, 'rules', `${RULE}\n-A DOCKER-USER -s 10.240.8.0/24 -j TRACY-FLEET-EGRESS\n${RULE}\n`)
      if (setup.includes('rule-hidden')) put(s, 'rules', '')
      for (const name of setup) put(s, name)
      const run = teardown(s, { ...CF, TRACY_EGRESS_FENCE: 'on' })
      assert.equal(run.status, 1, `${why}: ${run.stdout}${run.stderr}`)
      assert.doesNotMatch(run.stdout, RESULT, why)
      assert.match(run.stderr, said, why)
      assert.match(run.stderr, /teardown of business-joomla did not finish: /, why)
      assert.equal(
        has(s, 'network'),
        networkKept,
        `${why}: the subnet is not handed out with its rule standing`
      )
    } finally {
      rmSync(s.root, { recursive: true, force: true })
    }
  }
  // Every copy out, the neighbour's left, saved, and only then the network.
  const s = stage()
  try {
    siteDir(s)
    put(s, 'network', `${SUBNET}\n`)
    hostTools(s, ['iptables', 'netfilter-persistent'])
    put(s, 'rules', `${RULE}\n-A DOCKER-USER -s 10.240.8.0/24 -j TRACY-FLEET-EGRESS\n${RULE}\n`)
    const run = teardown(s, { ...CF, TRACY_EGRESS_FENCE: 'on' })
    assert.equal(run.status, 0, run.stderr)
    assert.match(run.stdout, RESULT)
    assert.equal(
      readFileSync(path.join(s.state, 'rules'), 'utf8'),
      '-A DOCKER-USER -s 10.240.8.0/24 -j TRACY-FLEET-EGRESS\n'
    )
    const did = order(s)
    assert.ok(
      did.indexOf('netfilter-persistent save') < did.indexOf(`docker network rm ${LABEL}_default`),
      did.join('\n')
    )
    assert.equal(has(s, 'network'), false)
  } finally {
    rmSync(s.root, { recursive: true, force: true })
  }
})

test("the site's network: one docker will not remove, or cannot be asked about, is a teardown that did not finish — and the next run takes it", () => {
  const s = stage()
  try {
    siteDir(s)
    put(s, 'network', `${SUBNET}\n`)
    put(s, 'network-busy')
    const run = teardown(s, CF)
    assert.equal(run.status, 1, `${run.stdout}${run.stderr}`)
    assert.doesNotMatch(run.stdout, RESULT)
    assert.match(run.stderr, /could not remove the site network business-joomla_default: .*active endpoints/)
    assert.match(run.stderr, /did not finish: the site network business-joomla_default is still on this host/)
    // Whatever held it has let go: the same teardown again finishes, with the folder already gone.
    rmSync(path.join(s.state, 'network-busy'))
    const again = teardown(s, CF)
    assert.equal(again.status, 0, again.stderr)
    assert.match(again.stdout, RESULT)
    assert.equal(has(s, 'network'), false)
  } finally {
    rmSync(s.root, { recursive: true, force: true })
  }
  for (const [why, setup, said] of [
    [
      'docker cannot say whether the network exists',
      ['network-ls-fails'],
      /cannot ask docker for the network of business-joomla: .* nothing was changed/
    ],
    [
      'the network exists and docker will not say its subnet',
      ['network', 'inspect-empty'],
      /would not say its subnet/
    ]
  ]) {
    const t = stage()
    try {
      const dir = siteDir(t)
      for (const name of setup) put(t, name)
      const run = teardown(t, CF)
      assertWhole(t, dir, run, why)
      assert.match(run.stderr, said, why)
    } finally {
      rmSync(t.root, { recursive: true, force: true })
    }
  }
})

// ── ingress_api.py itself, against a provider this test owns ─────────────────────────────────────
// The REAL script (not the argv-recording stand-in above), pointed with TRACY_CF_API_BASE at an HTTP
// server in this process that keeps one tunnel's ingress in memory. No call leaves this machine.

/** A stand-in for the provider's tunnel-configuration API: `{ url, rules, calls, answer, close }`. */
async function fakeProvider(initial = []) {
  const { createServer } = await import('node:http')
  const state = { rules: initial.map((r) => ({ ...r })), calls: [], answer: null }
  const server = createServer((req, res) => {
    let raw = ''
    req.on('data', (chunk) => (raw += chunk))
    req.on('end', () => {
      state.calls.push(`${req.method} ${req.url}`)
      // `answer(req, n)` may take the call over: `{ status, body, type }`, or `'hang'`.
      const special = state.answer?.(req, state.calls.length)
      if (special === 'hang') return
      if (special) {
        res.writeHead(special.status, { 'content-type': special.type ?? 'application/json' })
        return res.end(special.body)
      }
      if (req.method === 'PUT') {
        const sent = JSON.parse(raw)
        if (!state.dropWrites) state.rules = sent.config.ingress
      }
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ success: true, result: { config: { ingress: state.rules } } }))
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  state.url = `http://127.0.0.1:${server.address().port}/client/v4`
  state.close = () => new Promise((resolve) => server.close(resolve))
  server.unref()
  return state
}

/** Run the real `ingress_api.py`; resolves `{ code, out }`. Async: the provider is in this process. */
function ingressApi(provider, args, extraEnv = {}) {
  const dir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR || tmpdir(), 'ingress-api-'))
  return new Promise((resolve) => {
    const child = spawn('python3', [path.join(SCRIPTS, 'provision', 'ingress_api.py'), ...args], {
      env: {
        PATH: process.env.PATH,
        TRACY_CF_API_BASE: provider.url,
        TRACY_CF_API_TOKEN: 'test-token',
        TRACY_CF_ACCOUNT_ID: 'acct-test',
        TRACY_TUNNEL_ID: 'tunnel-test',
        TRACY_INGRESS_LOCK: path.join(dir, 'ingress.lock'),
        ...extraEnv
      }
    })
    let out = ''
    child.stdout.on('data', (chunk) => (out += chunk))
    child.stderr.on('data', (chunk) => (out += chunk))
    const timer = setTimeout(() => child.kill('SIGKILL'), 20_000)
    child.on('close', (code) => {
      clearTimeout(timer)
      rmSync(dir, { recursive: true, force: true })
      resolve({ code, out })
    })
  })
}

const CATCH_ALL = { service: 'http_status:404' }
const rule = (hostname, port) => ({ hostname, service: `http://127.0.0.1:${port}` })

test('ingress_api.py: adds a rule and removes it, read back from the provider each time — and writes nothing that is already so', async () => {
  const provider = await fakeProvider([rule('other.example.org', 9001), CATCH_ALL])
  try {
    const added = await ingressApi(provider, ['--hostname', 'shop.example.com', '--port', '8123'])
    assert.equal(added.code, 0, added.out)
    assert.deepEqual(provider.rules, [
      rule('other.example.org', 9001),
      rule('shop.example.com', 8123),
      CATCH_ALL
    ])
    assert.deepEqual(
      provider.calls.map((c) => c.split(' ')[0]),
      ['GET', 'PUT', 'GET'],
      'read, written, read back'
    )

    // The same add again: the rule stands, so nothing is written a second time.
    provider.calls.length = 0
    const again = await ingressApi(provider, ['--hostname', 'shop.example.com', '--port', '8123'])
    assert.equal(again.code, 0, again.out)
    assert.deepEqual(
      provider.calls.map((c) => c.split(' ')[0]),
      ['GET']
    )

    provider.calls.length = 0
    const removed = await ingressApi(provider, [
      '--hostname',
      'shop.example.com',
      '--remove',
      '--only-port',
      '8123'
    ])
    assert.equal(removed.code, 0, removed.out)
    assert.deepEqual(provider.rules, [rule('other.example.org', 9001), CATCH_ALL])
    assert.equal(provider.calls.filter((c) => c.startsWith('PUT')).length, 1)

    // Removed already (the retry of a cleanup that failed further on): no second write.
    provider.calls.length = 0
    const gone = await ingressApi(provider, [
      '--hostname',
      'shop.example.com',
      '--remove',
      '--only-port',
      '8123'
    ])
    assert.equal(gone.code, 0, gone.out)
    assert.deepEqual(
      provider.calls.map((c) => c.split(' ')[0]),
      ['GET'],
      'the finished half is not done twice'
    )
  } finally {
    await provider.close()
  }
})

test("ingress_api.py --only-port: a name that is another site's rule by now is left standing, exit 3, nothing written", async () => {
  const provider = await fakeProvider([rule('shop.example.com', 9555), CATCH_ALL])
  try {
    const result = await ingressApi(provider, [
      '--hostname',
      'shop.example.com',
      '--remove',
      '--only-port',
      '8123'
    ])
    assert.equal(result.code, 3, result.out)
    assert.match(result.out, /left alone/)
    assert.deepEqual(provider.rules, [rule('shop.example.com', 9555), CATCH_ALL])
    assert.equal(provider.calls.filter((c) => c.startsWith('PUT')).length, 0)
  } finally {
    await provider.close()
  }
})

test("ingress_api.py: an add never takes over a rule that leads to another port — exit 3, nothing written; only --replace, for a hostname that is the site's by name, does", async () => {
  const provider = await fakeProvider([rule('shop.example.com', 9555), CATCH_ALL])
  try {
    const result = await ingressApi(provider, ['--hostname', 'shop.example.com', '--port', '8123'])
    assert.equal(result.code, 3, result.out)
    assert.match(result.out, /left alone/)
    assert.doesNotMatch(result.out, /ingress updated/)
    assert.deepEqual(provider.rules, [rule('shop.example.com', 9555), CATCH_ALL])
    assert.equal(provider.calls.filter((c) => c.startsWith('PUT')).length, 0)

    // Two rules under the name, one of them elsewhere: still somebody else's.
    provider.rules = [rule('shop.example.com', 8123), rule('shop.example.com', 9555), CATCH_ALL]
    const mixed = await ingressApi(provider, ['--hostname', 'shop.example.com', '--port', '8123'])
    assert.equal(mixed.code, 3, mixed.out)
    assert.equal(provider.calls.filter((c) => c.startsWith('PUT')).length, 0)

    provider.rules = [rule('shop.example.com', 9555), CATCH_ALL]
    const replaced = await ingressApi(provider, [
      '--hostname',
      'shop.example.com',
      '--port',
      '8123',
      '--replace'
    ])
    assert.equal(replaced.code, 0, replaced.out)
    assert.deepEqual(provider.rules, [rule('shop.example.com', 8123), CATCH_ALL])
  } finally {
    await provider.close()
  }
})

test('ingress_api.py: an answer that does not SHOW the list of rules is not an empty list — a removal is never reported on it and nothing is written; only an add reads a tunnel with no configuration yet as no rules', async () => {
  const ok = (result) => ({ status: 200, body: JSON.stringify({ success: true, result }) })
  /** `[what, result, an add may read it as "no rules yet"]` */
  const RESULTS = [
    ['no config at all', {}, false],
    ['config null', { config: null }, true],
    ['config without ingress', { config: {} }, true],
    ['ingress null', { config: { ingress: null } }, true],
    ['config that is a list', { config: [] }, false],
    ['ingress that is an object', { config: { ingress: {} } }, false],
    ['a rule that is not an object', { config: { ingress: ['x'] } }, false],
    ['a rule without a service', { config: { ingress: [{ hostname: 'gone.example.com' }] } }, false],
    [
      'a service that is not text',
      { config: { ingress: [{ hostname: 'a.example.com', service: 1 }] } },
      false
    ],
    [
      'a hostname that is not text',
      { config: { ingress: [{ hostname: 7, service: 'http_status:404' }] } },
      false
    ],
    [
      'a hostname that is null',
      { config: { ingress: [{ hostname: null, service: 'http_status:404' }] } },
      false
    ]
  ]
  for (const [what, result, addReadsEmpty] of RESULTS) {
    // The first read is the short answer; the rest of the provider behaves.
    const first = (_req, n) => (n === 1 ? ok(result) : null)
    const removing = await fakeProvider([rule('gone.example.com', 8123), CATCH_ALL])
    removing.answer = first
    try {
      for (const extra of [[], ['--only-port', '8123']]) {
        removing.calls.length = 0
        removing.answer = (_req, n) => (n === 1 ? ok(result) : null)
        const removed = await ingressApi(removing, ['--hostname', 'gone.example.com', '--remove', ...extra])
        const how = `${what} (remove ${extra.join(' ')})`
        assert.notEqual(removed.code, 0, `${how}: ${removed.out}`)
        assert.notEqual(removed.code, 3, how)
        assert.doesNotMatch(removed.out, /ingress updated|Traceback/, how)
        assert.equal(removing.calls.filter((c) => c.startsWith('PUT')).length, 0, how)
      }
      assert.deepEqual(removing.rules, [rule('gone.example.com', 8123), CATCH_ALL], what)
    } finally {
      await removing.close()
    }
    const adding = await fakeProvider([])
    adding.answer = first
    try {
      const added = await ingressApi(adding, ['--hostname', 'shop.example.com', '--port', '8123'])
      assert.doesNotMatch(added.out, /Traceback/, what)
      if (addReadsEmpty) {
        assert.equal(added.code, 0, `${what} (add): ${added.out}`)
        assert.deepEqual(adding.rules, [rule('shop.example.com', 8123), CATCH_ALL], what)
      } else {
        assert.notEqual(added.code, 0, `${what} (add): ${added.out}`)
        assert.equal(adding.calls.filter((c) => c.startsWith('PUT')).length, 0, what)
      }
    } finally {
      await adding.close()
    }
    // The same short answer on the READ BACK: what was written is not confirmed by it.
    for (const args of [
      ['--hostname', 'shop.example.com', '--port', '8123'],
      ['--hostname', 'gone.example.com', '--remove']
    ]) {
      const back = await fakeProvider([rule('gone.example.com', 8123), CATCH_ALL])
      back.answer = (_req, n) => (n === 3 ? ok(result) : null)
      try {
        const run = await ingressApi(back, args)
        assert.notEqual(run.code, 0, `${what} (read back): ${run.out}`)
        assert.doesNotMatch(run.out, /ingress updated|Traceback/, what)
      } finally {
        await back.close()
      }
    }
  }
})

test('ingress_api.py: a write the provider says succeeded but does not show is a failure — added or removed is only what was read back', async () => {
  const provider = await fakeProvider([rule('shop.example.com', 8123), CATCH_ALL])
  provider.dropWrites = true
  try {
    const removed = await ingressApi(provider, ['--hostname', 'shop.example.com', '--remove'])
    assert.notEqual(removed.code, 0)
    assert.notEqual(removed.code, 3)
    assert.match(removed.out, /still has a rule for shop\.example\.com/)
    const added = await ingressApi(provider, ['--hostname', 'new.example.com', '--port', '8123'])
    assert.notEqual(added.code, 0)
    assert.match(added.out, /does not show new\.example\.com/)
  } finally {
    await provider.close()
  }
})

test('ingress_api.py: every answer that is not the provider saying "success" ends non-zero with a reason — never a traceback, never "done", never exit 3', async () => {
  const html = { status: 502, body: '<html><body>Bad gateway</body></html>', type: 'text/html' }
  /** `[what, answer]` — what the provider (or something in front of it) may say instead. */
  const ANSWERS = [
    ['a 502 page in HTML', () => html],
    ['a 429 in HTML', () => ({ status: 429, body: '<html>slow down</html>', type: 'text/html' })],
    ['a 200 that is HTML', () => ({ status: 200, body: '<html>login</html>', type: 'text/html' })],
    ['an empty 200', () => ({ status: 200, body: '' })],
    ['JSON that is a list', () => ({ status: 200, body: '[]' })],
    ['JSON null', () => ({ status: 200, body: 'null' })],
    ['an object without success', () => ({ status: 200, body: '{"result":{}}' })],
    ['success that is the string "true"', () => ({ status: 200, body: '{"success":"true","result":{}}' })],
    ['success without a result', () => ({ status: 200, body: '{"success":true}' })],
    [
      'a refusal with a message',
      () => ({ status: 403, body: '{"success":false,"errors":[{"message":"no"}]}' })
    ],
    [
      'a refusal whose errors are not a list',
      () => ({ status: 500, body: '{"success":false,"errors":"x"}' })
    ],
    [
      'an ingress that is not a list',
      () => ({ status: 200, body: '{"success":true,"result":{"config":{"ingress":"x"}}}' })
    ],
    ['a result that is not an object', () => ({ status: 200, body: '{"success":true,"result":[]}' })],
    // The read succeeds, the write is what fails.
    ['a 500 on the write', (req) => (req.method === 'PUT' ? html : null)],
    // The read and the write succeed, the read-back fails.
    ['a 502 on the read back', (req, n) => (n === 3 ? html : null)]
  ]
  for (const [what, answer] of ANSWERS) {
    for (const args of [
      ['--hostname', 'shop.example.com', '--port', '8123'],
      ['--hostname', 'gone.example.com', '--remove', '--only-port', '8123']
    ]) {
      const provider = await fakeProvider([rule('gone.example.com', 8123), CATCH_ALL])
      provider.answer = answer
      try {
        const result = await ingressApi(provider, args)
        const how = `${what} (${args.includes('--remove') ? 'remove' : 'add'})`
        assert.notEqual(result.code, 0, `${how}: ${result.out}`)
        assert.notEqual(result.code, 3, `${how}: never read as "another site's rule"`)
        assert.doesNotMatch(result.out, /Traceback/, how)
        assert.doesNotMatch(result.out, /ingress updated/, how)
        assert.notEqual(result.out.trim(), '', `${how}: says why`)
      } finally {
        await provider.close()
      }
    }
  }
})

test('ingress_api.py: a provider that cannot be reached at all ends non-zero saying so, and one that does not answer is not waited on for ever by the next caller', async () => {
  const provider = await fakeProvider([CATCH_ALL])
  const url = provider.url
  await provider.close()
  const result = await ingressApi({ url }, ['--hostname', 'shop.example.com', '--port', '8123'])
  assert.notEqual(result.code, 0)
  assert.notEqual(result.code, 3)
  assert.match(result.out, /gave no answer/)
  assert.doesNotMatch(result.out, /Traceback/)
})

test('ingress_api.py: an API base that is not an http(s) address, or a lock that is a link, ends the script before any call — never a fall back to the real API or an unlocked write', async () => {
  const provider = await fakeProvider([CATCH_ALL])
  try {
    for (const base of ['file:///etc/passwd', 'ftp://example.com/x', 'not a url', 'javascript:alert(1)']) {
      const result = await ingressApi(provider, ['--hostname', 'shop.example.com', '--port', '8123'], {
        TRACY_CF_API_BASE: base
      })
      assert.notEqual(result.code, 0, base)
      assert.match(result.out, /TRACY_CF_API_BASE/, base)
    }
    const dir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR || tmpdir(), 'ingress-lock-'))
    const elsewhere = path.join(dir, 'elsewhere')
    writeFileSync(elsewhere, 'kept')
    symlinkSync(elsewhere, path.join(dir, 'link.lock'))
    symlinkSync(path.join(dir, 'nowhere'), path.join(dir, 'dangling.lock'))
    mkdirSync(path.join(dir, 'folder.lock'))
    // A pipe under the lock's name: opened without waiting for its other end, then refused for
    // what it is — the descriptor is looked at, not the name.
    assert.equal(spawnSync('mkfifo', [path.join(dir, 'pipe.lock')]).status, 0)
    for (const name of ['link.lock', 'dangling.lock', 'folder.lock', 'pipe.lock']) {
      const result = await ingressApi(provider, ['--hostname', 'shop.example.com', '--port', '8123'], {
        TRACY_INGRESS_LOCK: path.join(dir, name)
      })
      assert.notEqual(result.code, 0, name)
      assert.match(result.out, /cannot open the ingress lock/, name)
    }
    assert.equal(readFileSync(elsewhere, 'utf8'), 'kept', 'nothing was written through the link')
    assert.equal(existsSync(path.join(dir, 'nowhere')), false, 'nothing was made through the dangling link')
    assert.equal(provider.calls.length, 0, 'the provider was never called')
    rmSync(dir, { recursive: true, force: true })
  } finally {
    await provider.close()
  }
})

test('ingress_api.py: two changes to one tunnel at the same moment both land — neither read-modify-write drops the other', async () => {
  const provider = await fakeProvider([CATCH_ALL])
  const dir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR || tmpdir(), 'ingress-two-'))
  const lock = { TRACY_INGRESS_LOCK: path.join(dir, 'shared.lock') }
  try {
    const names = Array.from({ length: 6 }, (_, i) => `site${i}.example.com`)
    const results = await Promise.all(
      names.map((name, i) => ingressApi(provider, ['--hostname', name, '--port', String(8200 + i)], lock))
    )
    for (const result of results) assert.equal(result.code, 0, result.out)
    assert.deepEqual(
      provider.rules
        .map((r) => r.hostname)
        .filter(Boolean)
        .sort(),
      names,
      'every rule is there'
    )
  } finally {
    await provider.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

// ── #1037: a customer's own domain is routed to tracy-web, with its owner on record ──────────────
// The real `ingress_api.py` against the provider stand-in above, with the owner records kept in a
// directory of the test's own.

const WEB = 'http://127.0.0.1:51710'
const toWeb = (hostname) => ({ hostname, service: WEB })
/** A place for owner records that outlives one call of the script, and a way to run with it. */
function ownersBed() {
  const dir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR || tmpdir(), 'ingress-owners-'))
  const owners = path.join(dir, 'owners')
  const record = (hostname) => {
    try {
      return JSON.parse(readFileSync(path.join(owners, hostname), 'utf8'))
    } catch {
      return null
    }
  }
  const put = (hostname, value) => {
    mkdirSync(owners, { recursive: true })
    writeFileSync(path.join(owners, hostname), typeof value === 'string' ? value : JSON.stringify(value))
  }
  return {
    dir,
    owners,
    record,
    put,
    run: (provider, args) => ingressApi(provider, args, { TRACY_INGRESS_OWNERS: owners }),
    close: () => rmSync(dir, { recursive: true, force: true })
  }
}
const add = (hostname, label, gen, extra = []) => [
  '--hostname',
  hostname,
  '--service',
  WEB,
  '--owner',
  label,
  '--owner-gen',
  String(gen),
  ...extra
]
const drop = (hostname, label, gen, extra = ['--service', WEB]) => [
  '--hostname',
  hostname,
  '--remove',
  '--only-port',
  '8123',
  '--owner',
  label,
  ...(gen === null ? [] : ['--owner-gen', String(gen)]),
  ...extra
]
const methods = (provider) => provider.calls.map((c) => c.split(' ')[0])

test("#1037 ingress_api.py: an own domain's rule leads to tracy-web and its owner is on record; the same add again writes nothing; the site's own old rule is replaced, another site's is not", async () => {
  const provider = await fakeProvider([
    rule('old.example.com', 8123),
    rule('theirs.example.com', 9555),
    CATCH_ALL
  ])
  const bed = ownersBed()
  try {
    const added = await bed.run(provider, add('shop.example.com', 'lantern', 5))
    assert.equal(added.code, 0, added.out)
    assert.ok(provider.rules.some((r) => r.hostname === 'shop.example.com' && r.service === WEB))
    assert.deepEqual(bed.record('shop.example.com'), { gen: 5, label: 'lantern', service: WEB })
    assert.deepEqual(methods(provider), ['GET', 'PUT', 'GET'])
    assert.match(added.out, /ingress updated: shop\.example\.com → 127\.0\.0\.1:51710/)

    provider.calls.length = 0
    const again = await bed.run(provider, add('shop.example.com', 'lantern', 5))
    assert.equal(again.code, 0, again.out)
    assert.deepEqual(methods(provider), ['GET'], 'the rule stands: nothing is written again')

    // The site's own rule from before #1037 is its own by the port, and is replaced.
    const moved = await bed.run(provider, add('old.example.com', 'lantern', 6, ['--takeover-port', '8123']))
    assert.equal(moved.code, 0, moved.out)
    assert.deepEqual(
      provider.rules.filter((r) => r.hostname === 'old.example.com'),
      [toWeb('old.example.com')]
    )
    assert.deepEqual(bed.record('old.example.com'), { gen: 6, label: 'lantern', service: WEB })

    // Another site's port: left standing, exit 3, nothing written, no record.
    provider.calls.length = 0
    const refused = await bed.run(
      provider,
      add('theirs.example.com', 'lantern', 7, ['--takeover-port', '8123'])
    )
    assert.equal(refused.code, 3, refused.out)
    assert.deepEqual(methods(provider), ['GET'])
    assert.ok(provider.rules.some((r) => r.hostname === 'theirs.example.com' && r.service.endsWith(':9555')))
    assert.equal(bed.record('theirs.example.com'), null)
    // Without --takeover-port even the site's own old port is not taken over.
    provider.rules.unshift(rule('plain.example.com', 8123))
    assert.equal((await bed.run(provider, add('plain.example.com', 'lantern', 8))).code, 3)
  } finally {
    bed.close()
    await provider.close()
  }
})

test('#1037 ingress_api.py: the newer generation wins, whichever site it is — an older add changes nothing, and a removal by another site or by an older run of the same site leaves the route standing', async () => {
  const provider = await fakeProvider([CATCH_ALL])
  const bed = ownersBed()
  const has = () => provider.rules.some((r) => r.hostname === 'shop.example.com' && r.service === WEB)
  try {
    assert.equal((await bed.run(provider, add('shop.example.com', 'beta', 9))).code, 0)
    // An add that reaches the host late, from before the route on record.
    provider.calls.length = 0
    const stale = await bed.run(provider, add('shop.example.com', 'lantern', 5))
    assert.equal(stale.code, 3, stale.out)
    assert.deepEqual(methods(provider), ['GET'])
    assert.deepEqual(bed.record('shop.example.com'), { gen: 9, label: 'beta', service: WEB })

    // The name moved to another site (tracy-web's book says so: a later generation).
    assert.equal((await bed.run(provider, add('shop.example.com', 'lantern', 12))).code, 0)
    assert.deepEqual(bed.record('shop.example.com'), { gen: 12, label: 'lantern', service: WEB })

    for (const [what, args] of [
      ['the site that had it before: not its route any more', drop('shop.example.com', 'beta', 20)],
      ['the same site, a run older than the route', drop('shop.example.com', 'lantern', 11)],
      ['a teardown of the other site (no generation)', drop('shop.example.com', 'beta', null)],
      ['the other site, not saying where tracy-web is', drop('shop.example.com', 'beta', 20, [])]
    ]) {
      provider.calls.length = 0
      const left = await bed.run(provider, args)
      assert.equal(left.code, 3, `${what}: ${left.out}`)
      assert.deepEqual(methods(provider), ['GET'], what)
      assert.equal(has(), true, what)
      assert.deepEqual(bed.record('shop.example.com'), { gen: 12, label: 'lantern', service: WEB }, what)
    }

    // Its own run, the same generation or a later one: out, and the record with it. The record
    // names the service its rule leads to, so the caller need not know where tracy-web listens.
    const gone = await bed.run(provider, drop('shop.example.com', 'lantern', 12, []))
    assert.equal(gone.code, 0, gone.out)
    assert.equal(has(), false)
    assert.equal(bed.record('shop.example.com'), null)
    // Again: nothing there, nothing written, still "done".
    provider.calls.length = 0
    assert.equal((await bed.run(provider, drop('shop.example.com', 'lantern', 12))).code, 0)
    assert.deepEqual(methods(provider), ['GET'])

    // A teardown names no generation: every route on record for its label goes.
    assert.equal((await bed.run(provider, add('shop.example.com', 'lantern', 30))).code, 0)
    assert.equal((await bed.run(provider, drop('shop.example.com', 'lantern', null))).code, 0)
    assert.equal(has(), false)
    assert.equal(bed.record('shop.example.com'), null)

    // The site's own old rule goes by its port, with or without a record.
    provider.rules.unshift(rule('legacy.example.com', 8123))
    assert.equal((await bed.run(provider, drop('legacy.example.com', 'lantern', 40))).code, 0)
    assert.deepEqual(provider.rules, [CATCH_ALL])
  } finally {
    bed.close()
    await provider.close()
  }
})

test('#1037 ingress_api.py: an owner record that cannot be read or is not one is NOT "no record" — add and remove both end non-zero (never 3, never done) and the tunnel is not written', async () => {
  const { symlinkSync, mkdirSync: mkdir } = await import('node:fs')
  const { execFileSync } = await import('node:child_process')
  const kinds = [
    ['empty', (bed) => bed.put('shop.example.com', '')],
    ['not JSON', (bed) => bed.put('shop.example.com', '{"label":')],
    ['a list', (bed) => bed.put('shop.example.com', '[]')],
    ['no label', (bed) => bed.put('shop.example.com', { gen: 3 })],
    ['a label that is not one', (bed) => bed.put('shop.example.com', { label: '../x', gen: 3 })],
    ['no generation', (bed) => bed.put('shop.example.com', { label: 'lantern' })],
    ['a generation that is text', (bed) => bed.put('shop.example.com', { label: 'lantern', gen: '3' })],
    ['a generation that is true', (bed) => bed.put('shop.example.com', { label: 'lantern', gen: true })],
    ['a negative generation', (bed) => bed.put('shop.example.com', { label: 'lantern', gen: -1 })],
    ['no service', (bed) => bed.put('shop.example.com', { label: 'lantern', gen: 3 })],
    [
      'a service that is not one',
      (bed) => bed.put('shop.example.com', { label: 'lantern', gen: 3, service: 'https://x/y' })
    ],
    [
      'a service that is a number',
      (bed) => bed.put('shop.example.com', { label: 'lantern', gen: 3, service: 8080 })
    ],
    [
      'too large',
      (bed) =>
        bed.put(
          'shop.example.com',
          JSON.stringify({ label: 'lantern', gen: 1, service: WEB, pad: 'x'.repeat(5000) })
        )
    ],
    [
      'a link to another record',
      (bed) => {
        bed.put('other.example.com', { label: 'lantern', gen: 1, service: WEB })
        symlinkSync(path.join(bed.owners, 'other.example.com'), path.join(bed.owners, 'shop.example.com'))
      }
    ],
    [
      'a folder under its name',
      (bed) => {
        mkdir(path.join(bed.owners, 'shop.example.com'), { recursive: true })
      }
    ],
    [
      'a pipe under its name',
      (bed) => {
        mkdir(bed.owners, { recursive: true })
        execFileSync('mkfifo', [path.join(bed.owners, 'shop.example.com')])
      }
    ],
    [
      'the directory is a file',
      (bed) => {
        writeFileSync(bed.owners, 'not a directory')
      }
    ],
    [
      'the directory is a link',
      (bed) => {
        mkdir(path.join(bed.dir, 'elsewhere'))
        symlinkSync(path.join(bed.dir, 'elsewhere'), bed.owners)
      }
    ]
  ]
  for (const [what, arrange] of kinds) {
    for (const [op, args] of [
      ['add', add('shop.example.com', 'lantern', 50, ['--takeover-port', '8123'])],
      ['remove', drop('shop.example.com', 'lantern', 50)]
    ]) {
      const provider = await fakeProvider([toWeb('shop.example.com'), CATCH_ALL])
      const bed = ownersBed()
      try {
        arrange(bed)
        const result = await bed.run(provider, args)
        assert.notEqual(result.code, 0, `${what}, ${op}: ${result.out}`)
        assert.notEqual(result.code, 3, `${what}, ${op}: not "somebody else's" either`)
        assert.doesNotMatch(result.out, /Traceback/, `${what}, ${op}`)
        assert.doesNotMatch(result.out, /ingress updated/, `${what}, ${op}`)
        assert.equal(provider.calls.filter((c) => c.startsWith('PUT')).length, 0, `${what}, ${op}`)
        assert.deepEqual(provider.rules, [toWeb('shop.example.com'), CATCH_ALL], `${what}, ${op}`)
      } finally {
        bed.close()
        await provider.close()
      }
    }
  }
})

test('#1037 ingress_api.py: a record that cannot be written is not a route installed — non-zero, no "updated" line; and the arguments of an own-domain change are refused when they do not go together', async () => {
  const { chmodSync } = await import('node:fs')
  const provider = await fakeProvider([CATCH_ALL])
  const bed = ownersBed()
  try {
    if (process.getuid?.() !== 0) {
      mkdirSync(bed.owners, { recursive: true })
      chmodSync(bed.owners, 0o500)
      const result = await bed.run(provider, add('shop.example.com', 'lantern', 5))
      chmodSync(bed.owners, 0o700)
      assert.notEqual(result.code, 0, result.out)
      assert.notEqual(result.code, 3)
      assert.doesNotMatch(result.out, /ingress updated/)
      assert.equal(bed.record('shop.example.com'), null)
      // 🔒 The record comes first: with nowhere to write it, no rule is written either — a rule to
      // tracy-web never stands without a record of whose it is.
      assert.deepEqual(methods(provider), ['GET'])
      assert.deepEqual(provider.rules, [CATCH_ALL])
      provider.calls.length = 0
      const retry = await bed.run(provider, add('shop.example.com', 'lantern', 5))
      assert.equal(retry.code, 0, retry.out)
      assert.deepEqual(methods(provider), ['GET', 'PUT', 'GET'])
      assert.deepEqual(bed.record('shop.example.com'), { gen: 5, label: 'lantern', service: WEB })
    }
    provider.calls.length = 0
    for (const args of [
      ['--hostname', 'a.example.com', '--service', WEB],
      ['--hostname', 'a.example.com', '--owner', 'lantern', '--port', '8123'],
      ['--hostname', 'a.example.com', '--service', WEB, '--owner', 'lantern', '--port', '8123'],
      ['--hostname', 'a.example.com', '--service', 'https://127.0.0.1:51710', '--owner', 'lantern'],
      ['--hostname', 'a.example.com', '--service', 'http://127.0.0.1:51710/x', '--owner', 'lantern'],
      ['--hostname', 'a.example.com', '--service', WEB, '--owner', 'Lantern'],
      ['--hostname', 'a.example.com', '--service', WEB, '--owner', '../x'],
      ['--hostname', 'a.example.com', '--service', WEB, '--owner', 'lantern', '--owner-gen', '-1'],
      ['--hostname', 'a.example.com', '--service', WEB, '--owner', 'lantern', '--owner-gen', 'x'],
      ['--hostname', 'a.example.com', '--port', '8123', '--takeover-port', '8123'],
      ['--hostname', 'a.example.com', '--remove', '--service', WEB],
      ['--hostname', 'a.example.com', '--remove', '--owner-gen', '3'],
      ['--hostname', '../../etc/x', '--service', WEB, '--owner', 'lantern'],
      ['--hostname', 'A.example.com', '--service', WEB, '--owner', 'lantern'],
      ['--hostname', '.hidden', '--remove', '--owner', 'lantern', '--service', WEB]
    ]) {
      const result = await bed.run(provider, args)
      assert.notEqual(result.code, 0, args.join(' '))
      assert.notEqual(result.code, 3, args.join(' '))
      assert.doesNotMatch(result.out, /Traceback/, args.join(' '))
    }
    assert.deepEqual(provider.calls, [], 'a refused change never reaches the provider')
  } finally {
    bed.close()
    await provider.close()
  }
})

test("#1037 ingress_api.py: ownership is the record whole — the service it names, the label and the generation; a rule with no record is nobody's to remove, and a run cut after the provider write leaves a record, never an orphan", async () => {
  const WEB2 = 'http://127.0.0.1:52000'
  const at = (provider, hostname) =>
    provider.rules.filter((r) => r.hostname === hostname).map((r) => r.service)
  const provider = await fakeProvider([CATCH_ALL])
  const bed = ownersBed()
  const run2 = (args) =>
    bed.run(
      provider,
      args.map((a) => (a === WEB ? WEB2 : a))
    )
  try {
    // tracy-web moves to another local address: the site's next publish brings its own route over —
    // by the service ON RECORD — instead of refusing its own rule as a stranger's.
    assert.equal((await bed.run(provider, add('shop.example.com', 'lantern', 5))).code, 0)
    const moved = await run2(add('shop.example.com', 'lantern', 6))
    assert.equal(moved.code, 0, moved.out)
    assert.deepEqual(at(provider, 'shop.example.com'), [WEB2])
    assert.deepEqual(bed.record('shop.example.com'), { gen: 6, label: 'lantern', service: WEB2 })
    // An older operation, wherever it thinks tracy-web is, changes nothing.
    for (const stale of [add('shop.example.com', 'lantern', 5), add('shop.example.com', 'beta', 4)]) {
      assert.equal((await bed.run(provider, stale)).code, 3)
      assert.deepEqual(at(provider, 'shop.example.com'), [WEB2])
    }
    // A removal is judged by the recorded service: a caller still told the OLD address, the new
    // one, or none removes its own route; another site, or an older run, does not.
    for (const args of [
      drop('shop.example.com', 'beta', 9),
      drop('shop.example.com', 'beta', 9, ['--service', WEB2]),
      drop('shop.example.com', 'lantern', 5, ['--service', WEB2])
    ]) {
      assert.equal((await bed.run(provider, args)).code, 3, args.join(' '))
      assert.deepEqual(at(provider, 'shop.example.com'), [WEB2])
    }
    const out = await bed.run(provider, drop('shop.example.com', 'lantern', 7))
    assert.equal(out.code, 0, out.out)
    assert.deepEqual(at(provider, 'shop.example.com'), [])
    assert.equal(bed.record('shop.example.com'), null)

    // 🔒 A rule to tracy-web with NO record (the records were lost) is not the caller's on that
    // absence: every removal leaves it — it opens nothing, tracy-web serves only a name a site
    // holds — and the next connect claims it without writing the tunnel again.
    provider.rules.unshift(toWeb('loose.example.com'))
    for (const args of [
      drop('loose.example.com', 'lantern', 40),
      drop('loose.example.com', 'lantern', null),
      drop('loose.example.com', 'beta', 99)
    ]) {
      provider.calls.length = 0
      const left = await bed.run(provider, args)
      assert.equal(left.code, 3, left.out)
      assert.match(left.out, /no owner on record/)
      assert.deepEqual(methods(provider), ['GET'])
      assert.deepEqual(at(provider, 'loose.example.com'), [WEB])
    }
    provider.calls.length = 0
    assert.equal((await bed.run(provider, add('loose.example.com', 'lantern', 41))).code, 0)
    assert.deepEqual(methods(provider), ['GET'], 'claimed: the rule stood, only the record is written')
    assert.deepEqual(bed.record('loose.example.com'), { gen: 41, label: 'lantern', service: WEB })
    assert.equal((await bed.run(provider, drop('loose.example.com', 'lantern', 41))).code, 0)
    // An unrecorded rule at some OTHER address is not the shared service: an add leaves it too.
    provider.rules.unshift({ hostname: 'odd.example.com', service: WEB2 })
    assert.equal((await bed.run(provider, add('odd.example.com', 'lantern', 50))).code, 3)
    assert.deepEqual(at(provider, 'odd.example.com'), [WEB2])
    provider.rules.shift()

    // 🔒 A run that dies after the provider took the rule: the record was written BEFORE the write,
    // so the rule is never an orphan — it is this operation's, an older one is turned away, and the
    // site's own retry or removal finishes the job.
    for (const failure of [
      { status: 502, body: '<html>bad gateway</html>', type: 'text/html' },
      { status: 200, body: JSON.stringify({ success: false, errors: [{ message: 'no' }] }) }
    ]) {
      const cut = await fakeProvider([CATCH_ALL])
      const cutBed = ownersBed()
      try {
        // The provider applies the PUT and then the answer is lost.
        cut.answer = (req) => {
          if (req.method !== 'PUT') return null
          cut.rules = [toWeb('shop.example.com'), CATCH_ALL]
          return failure
        }
        const died = await cutBed.run(cut, add('shop.example.com', 'lantern', 5))
        assert.notEqual(died.code, 0, died.out)
        assert.notEqual(died.code, 3)
        assert.doesNotMatch(died.out, /ingress updated|Traceback/)
        assert.deepEqual(cutBed.record('shop.example.com'), {
          gen: 5,
          label: 'lantern',
          service: WEB,
          state: 'writing'
        })
        cut.answer = null
        assert.equal((await cutBed.run(cut, add('shop.example.com', 'beta', 4))).code, 3, 'an older add')
        assert.equal((await cutBed.run(cut, drop('shop.example.com', 'beta', 9))).code, 3, 'another site')
        assert.deepEqual(at(cut, 'shop.example.com'), [WEB])
        // The retry finds its rule standing and settles the record; then its removal takes both out.
        cut.calls.length = 0
        assert.equal((await cutBed.run(cut, add('shop.example.com', 'lantern', 5))).code, 0)
        assert.deepEqual(methods(cut), ['GET'])
        assert.deepEqual(cutBed.record('shop.example.com'), { gen: 5, label: 'lantern', service: WEB })
        assert.equal((await cutBed.run(cut, drop('shop.example.com', 'lantern', 6))).code, 0)
        assert.deepEqual(cut.rules, [CATCH_ALL])
        assert.equal(cutBed.record('shop.example.com'), null)
      } finally {
        cutBed.close()
        await cut.close()
      }
    }
    // The same cut where the provider did NOT take the rule: the record alone stands. The site's
    // own removal has nothing to take out and clears it; nobody else's does.
    const dry = await fakeProvider([CATCH_ALL])
    const dryBed = ownersBed()
    try {
      dry.answer = (req) => (req.method === 'PUT' ? { status: 500, body: 'no', type: 'text/plain' } : null)
      assert.notEqual((await dryBed.run(dry, add('shop.example.com', 'lantern', 5))).code, 0)
      dry.answer = null
      assert.equal((await dryBed.run(dry, drop('shop.example.com', 'beta', 9))).code, 0, 'nothing there')
      assert.equal(dryBed.record('shop.example.com').label, 'lantern', "another site's run keeps the record")
      assert.equal((await dryBed.run(dry, drop('shop.example.com', 'lantern', 5))).code, 0)
      assert.equal(dryBed.record('shop.example.com'), null)
    } finally {
      dryBed.close()
      await dry.close()
    }
  } finally {
    bed.close()
    await provider.close()
  }
})

test("#1037 ingress_api.py: a change of service the provider refuses leaves a record that names BOTH ends — the rule, still at the old service, is this site's to retry or to remove, and nobody else's", async () => {
  const WEB2 = 'http://127.0.0.1:52000'
  const WEB3 = 'http://127.0.0.1:53000'
  const DIRECT = 'http://127.0.0.1:8123'
  const at = (provider, hostname) =>
    provider.rules.filter((r) => r.hostname === hostname).map((r) => r.service)
  const to = (service) => (args) => args.map((a) => (a === WEB ? service : a))
  const refuse = (req) => (req.method === 'PUT' ? { status: 500, body: 'no', type: 'text/plain' } : null)
  // Each way the rule can be somewhere else than the service being written: tracy-web moved, and
  // the site's own direct rule from before #1037 being taken over.
  const starts = [
    [
      'tracy-web moved',
      async (bed, provider) => bed.run(provider, add('shop.example.com', 'lantern', 5)),
      WEB,
      []
    ],
    [
      'the old direct rule',
      async (_bed, provider) => {
        provider.rules.unshift({ hostname: 'shop.example.com', service: DIRECT })
        return { code: 0 }
      },
      DIRECT,
      ['--takeover-port', '8123']
    ]
  ]
  for (const [what, start, old, extra] of starts) {
    for (const ending of ['retry', 'remove', 'remove told the old address', 'moved again']) {
      const provider = await fakeProvider([CATCH_ALL])
      const bed = ownersBed()
      const note = `${what}, then ${ending}`
      try {
        assert.equal((await start(bed, provider)).code, 0, note)
        provider.answer = refuse
        const failed = await bed.run(provider, to(WEB2)(add('shop.example.com', 'lantern', 6, extra)))
        assert.notEqual(failed.code, 0, note)
        assert.notEqual(failed.code, 3, note)
        assert.doesNotMatch(failed.out, /ingress updated|Traceback/, note)
        // The tunnel was not written; the record says where the rule may still be.
        assert.deepEqual(at(provider, 'shop.example.com'), [old], note)
        assert.deepEqual(
          bed.record('shop.example.com'),
          { gen: 6, label: 'lantern', previous: [old], service: WEB2, state: 'writing' },
          note
        )
        provider.answer = null
        // Not another site's, and not an older run's, on either side of the failed write.
        for (const args of [
          drop('shop.example.com', 'beta', 9, ['--service', WEB2]),
          drop('shop.example.com', 'beta', 9, ['--service', old]),
          to(WEB2)(add('shop.example.com', 'beta', 4))
        ]) {
          // `drop` names port 8123: for the direct rule that alone is the site's proof, so the
          // other site is asked with another port.
          const asked = args.map((a) => (a === '8123' && !args.includes('--takeover-port') ? '8999' : a))
          assert.equal((await bed.run(provider, asked)).code, 3, `${note}: ${asked.join(' ')}`)
          assert.deepEqual(at(provider, 'shop.example.com'), [old], note)
        }
        if (ending === 'retry') {
          const again = await bed.run(provider, to(WEB2)(add('shop.example.com', 'lantern', 6, extra)))
          assert.equal(again.code, 0, `${note}: ${again.out}`)
          assert.deepEqual(at(provider, 'shop.example.com'), [WEB2], note)
          assert.deepEqual(bed.record('shop.example.com'), { gen: 6, label: 'lantern', service: WEB2 }, note)
        } else if (ending === 'moved again') {
          // A second refused write to a third address keeps every place the rule may be.
          provider.answer = refuse
          assert.notEqual(
            (await bed.run(provider, to(WEB3)(add('shop.example.com', 'lantern', 7, extra)))).code,
            0,
            note
          )
          assert.deepEqual(bed.record('shop.example.com').previous, [old, WEB2].sort(), note)
          provider.answer = null
          const out = await bed.run(
            provider,
            drop('shop.example.com', 'lantern', 8, ['--service', WEB3]).map((a) =>
              a === '8123' ? '8999' : a
            )
          )
          assert.equal(out.code, 0, `${note}: ${out.out}`)
          assert.deepEqual(at(provider, 'shop.example.com'), [], note)
          assert.equal(bed.record('shop.example.com'), null, note)
        } else {
          // The site's own removal — told the new address or the old one, and with a port that
          // proves nothing — takes the rule out where it is and clears the record.
          const told = ending === 'remove' ? WEB2 : old === DIRECT ? WEB : old
          const out = await bed.run(
            provider,
            drop('shop.example.com', 'lantern', 7, ['--service', told]).map((a) =>
              a === '8123' ? '8999' : a
            )
          )
          assert.equal(out.code, 0, `${note}: ${out.out}`)
          assert.deepEqual(at(provider, 'shop.example.com'), [], note)
          assert.equal(bed.record('shop.example.com'), null, note)
        }
      } finally {
        bed.close()
        await provider.close()
      }
    }
  }
  // A record whose `previous` is not a list of service addresses is not a record.
  const provider = await fakeProvider([toWeb('shop.example.com'), CATCH_ALL])
  const bed = ownersBed()
  try {
    for (const previous of ['http://127.0.0.1:1', [7], ['not a service'], { a: 1 }]) {
      bed.put('shop.example.com', { label: 'lantern', gen: 5, service: WEB, state: 'writing', previous })
      provider.calls.length = 0
      for (const args of [add('shop.example.com', 'lantern', 6), drop('shop.example.com', 'lantern', 6)]) {
        const res = await bed.run(provider, args)
        assert.notEqual(res.code, 0, JSON.stringify(previous))
        assert.notEqual(res.code, 3, JSON.stringify(previous))
        assert.doesNotMatch(res.out, /Traceback/)
      }
      assert.ok(!methods(provider).includes('PUT'), 'the tunnel is not written')
    }
  } finally {
    bed.close()
    await provider.close()
  }
})

test("#1037 ingress_api.py: once a record stands for the hostname the port alone proves nothing — an older run's removal, another site's and one that names no owner all leave the direct rule a refused takeover left behind; the record's own run removes it", async () => {
  const DIRECT = 'http://127.0.0.1:8123'
  const at = (provider, hostname) =>
    provider.rules.filter((r) => r.hostname === hostname).map((r) => r.service)
  const byPort = ['--hostname', 'shop.example.com', '--remove', '--only-port', '8123']
  const refuse = (req) => (req.method === 'PUT' ? { status: 500, body: 'no', type: 'text/plain' } : null)
  // How the record comes to stand beside a rule that still leads straight to the site's port: the
  // takeover's write was refused (`state: writing`), or the rule was put back by hand afterwards.
  const records = [
    [
      'a refused takeover',
      async (bed, provider) => {
        provider.answer = refuse
        const failed = await bed.run(
          provider,
          add('shop.example.com', 'lantern', 6, ['--takeover-port', '8123'])
        )
        provider.answer = null
        assert.notEqual(failed.code, 0)
        assert.notEqual(failed.code, 3)
        assert.equal(bed.record('shop.example.com').state, 'writing')
      }
    ],
    [
      'a finished record',
      async (bed) => bed.put('shop.example.com', { label: 'lantern', gen: 6, service: WEB })
    ]
  ]
  for (const [what, make] of records) {
    const provider = await fakeProvider([{ hostname: 'shop.example.com', service: DIRECT }, CATCH_ALL])
    const bed = ownersBed()
    try {
      await make(bed, provider)
      assert.deepEqual(at(provider, 'shop.example.com'), [DIRECT], what)
      const kept = bed.record('shop.example.com')
      for (const args of [
        drop('shop.example.com', 'lantern', 5),
        drop('shop.example.com', 'lantern', 5, []),
        drop('shop.example.com', 'beta', 9),
        byPort
      ]) {
        provider.calls.length = 0
        const res = await bed.run(provider, args)
        assert.equal(res.code, 3, `${what}: ${args.join(' ')}: ${res.out}`)
        assert.match(res.out, /left alone/, what)
        assert.doesNotMatch(res.out, /ingress updated/, what)
        assert.ok(!methods(provider).includes('PUT'), `${what}: the tunnel is not written`)
        assert.deepEqual(at(provider, 'shop.example.com'), [DIRECT], what)
        assert.deepEqual(bed.record('shop.example.com'), kept, `${what}: the record stands`)
      }
      // The run the record names — or a newer one of the same site — takes the rule out.
      const out = await bed.run(provider, drop('shop.example.com', 'lantern', 6))
      assert.equal(out.code, 0, `${what}: ${out.out}`)
      assert.deepEqual(at(provider, 'shop.example.com'), [], what)
      assert.equal(bed.record('shop.example.com'), null, what)
    } finally {
      bed.close()
      await provider.close()
    }
  }
  // With no record the port is still the proof, as before #1037 — with or without an owner named.
  for (const args of [byPort, drop('shop.example.com', 'lantern', 5)]) {
    const provider = await fakeProvider([{ hostname: 'shop.example.com', service: DIRECT }, CATCH_ALL])
    const bed = ownersBed()
    try {
      const out = await bed.run(provider, args)
      assert.equal(out.code, 0, out.out)
      assert.deepEqual(at(provider, 'shop.example.com'), [])
    } finally {
      bed.close()
      await provider.close()
    }
  }
})

test("#1037 teardown.sh: the site's own domains are taken out as this site's, and told where tracy-web listens when the host says so", () => {
  for (const [extra, tail] of [
    [{}, ''],
    [{ TRACY_OWN_DOMAIN_SERVICE: WEB }, ` --service ${WEB}`],
    [{ TRACY_WEB_ORIGIN: `${WEB}/` }, ` --service ${WEB}`],
    [{ TRACY_WEB_ORIGIN: 'https://cowork.tracy.ai' }, '']
  ]) {
    const s = stage()
    try {
      withDomains(s, { ledger: 'shop.example.com\n' })
      const run = teardown(s, { ...CF, ...extra })
      assert.equal(run.status, 0, run.stderr)
      assert.deepEqual(readFileSync(s.argvLog, 'utf8').trim().split('\n').slice(1), [
        `--hostname shop.example.com --remove --only-port 52007 --owner ${LABEL}${tail}|acct-1`
      ])
    } finally {
      rmSync(s.root, { recursive: true, force: true })
    }
  }
  // A service that is not one stops the teardown before any own domain is touched.
  const s = stage()
  try {
    const dir = withDomains(s, { ledger: 'shop.example.com\n' })
    const run = teardown(s, { ...CF, TRACY_OWN_DOMAIN_SERVICE: 'http://x:80;id' })
    assert.notEqual(run.status, 0)
    assert.equal(existsSync(dir), true, 'the folder stays')
  } finally {
    rmSync(s.root, { recursive: true, force: true })
  }
})

test('a catch-all host (a shard) tears down a site with own domains on record: no rule to take out, no tunnel call', () => {
  const s = stage()
  try {
    const dir = withDomains(s)
    const run = teardown(s, { SITE_DOMAIN: 'tracy.site', TRACY_TUNNEL: 'catch-all' })
    assert.equal(run.status, 0, `${run.stdout}${run.stderr}`)
    assert.equal(existsSync(s.argvLog), false, 'ingress_api.py was never called')
    assert.match(run.stdout, /answers every name with tracy-web \(TRACY_TUNNEL=catch-all\)/)
    assert.match(run.stdout, new RegExp(`^TRACY_RESULT torn_down=1 label=${LABEL}$`, 'm'))
    assert.equal(existsSync(dir), false)
  } finally {
    rmSync(s.root, { recursive: true, force: true })
  }
})
