// The secret scan as a measurement (ticket #586) on an invented florist kit and invented installer archives made in a
// temporary folder: what it reads (kit files, archive entries, the demo data), the allow file, the negative control
// on the human installer, gitleaks (a stand-in binary that reports nothing, or none at all), and that no planted value
// reaches the result, the record page or the command's output.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { crc32 } from 'node:zlib'
import { recordHtml } from '../ai-quickstart/gate/record-html.mjs'
import { pinnedGitleaks } from '../ai-quickstart/gate/secret-gitleaks.mjs'
import { fingerprintOf } from '../ai-quickstart/gate/secret-rules.mjs'
import { filesOfArgs, readAllow, secretScan } from '../ai-quickstart/gate/secret-scan.mjs'
import { PLANTED } from './fixtures/ai-quickstart-gate/planted-secrets.mjs'

const CLI = fileURLToPath(new URL('../ai-quickstart/gate/secret-scan.mjs', import.meta.url))
const DUMP = 'installation/sql/mysql/custom.sql'

/** A plain zip of stored entries. */
function zipOf(entries) {
  const locals = []
  const centrals = []
  let offset = 0
  for (const [name, text] of Object.entries(entries)) {
    const data = Buffer.from(text)
    const n = Buffer.from(name)
    const head = Buffer.alloc(30)
    head.writeUInt32LE(0x04034b50, 0)
    head.writeUInt32LE(crc32(data), 14)
    head.writeUInt32LE(data.length, 18)
    head.writeUInt32LE(data.length, 22)
    head.writeUInt16LE(n.length, 26)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt32LE(crc32(data), 16)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(n.length, 28)
    central.writeUInt32LE(offset, 42)
    locals.push(head, n, data)
    centrals.push(central, n)
    offset += 30 + n.length + data.length
  }
  const cd = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(Object.keys(entries).length, 8)
  end.writeUInt16LE(Object.keys(entries).length, 10)
  end.writeUInt32LE(cd.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, cd, end])
}

const usersRow = (password) =>
  "INSERT INTO `#__users` (`id`, `name`, `password`) VALUES \n(42,'Petal Admin','" + password + "');\n"
const CLEAN_DUMP = "INSERT INTO `#__content` (`id`, `title`) VALUES \n(5,'Tulip week');\n"
const VENDOR_SAMPLE = 'libraries/vendor/florist/token-sample.txt'

function setup() {
  const root = mkdtempSync(path.join(tmpdir(), 'secret-scan-'))
  const kit = path.join(root, 'kit', '1.0.0')
  mkdirSync(path.join(kit, 'check-record'), { recursive: true })
  writeFileSync(
    path.join(kit, 'mapping.json'),
    JSON.stringify({ template: { slug: 'petal' }, note: 'Fresh tulips' })
  )
  const blank = path.join(root, 'petal-blank.zip')
  writeFileSync(
    blank,
    zipOf({
      [DUMP]: CLEAN_DUMP,
      'installation/configuration.php-dist': "<?php\nclass JConfig {\n\tpublic $secret = '';\n}\n",
      [VENDOR_SAMPLE]: 'Example token: ' + PLANTED.jwt + '\n'
    })
  )
  const human = { name: 'petal-quickstart.zip', bytes: zipOf({ [DUMP]: usersRow(PLANTED.bcrypt_hash) }) }
  // A stand-in for the pinned gitleaks: writes an empty report where it is told to.
  const bin = path.join(root, 'gitleaks-stand-in')
  writeFileSync(
    bin,
    '#!/bin/sh\nwhile [ $# -gt 0 ]; do [ "$1" = --report-path ] && echo "[]" > "$2"; shift; done\n'
  )
  chmodSync(bin, 0o755)
  const files = filesOfArgs({ kit, blankSite: blank })
  return { root, kit, blank, human, bin, files }
}
const vendorAllow = () => [
  {
    file: 'blank-site.zip!' + VENDOR_SAMPLE,
    rule: 'jwt',
    fingerprint: fingerprintOf(PLANTED.jwt),
    why: 'a sample token in a vendor readme'
  }
]

test('a clean package with its vendor sample allowed, a right control and gitleaks run passes', () => {
  const s = setup()
  const r = secretScan({ files: s.files, allow: vendorAllow(), control: s.human, gitleaks: { bin: s.bin } })
  assert.equal(r.status, 'passed')
  assert.deepEqual(r.findings, [])
  assert.deepEqual(
    r.allowed.map((a) => [a.file, a.rule, a.why]),
    [['blank-site.zip!' + VENDOR_SAMPLE, 'jwt', 'a sample token in a vendor readme']]
  )
  assert.equal(r.control.status, 'right')
  assert.equal(r.gitleaks.status, 'ran')
  assert.deepEqual(r.scanned, { files: 2, texts: 4, binary: 0, archives: 1 })
  rmSync(s.root, { recursive: true, force: true })
})

test('without the allow entry the vendor sample fails the scan, named and never shown', () => {
  const s = setup()
  const r = secretScan({ files: s.files, control: s.human, gitleaks: { bin: s.bin } })
  assert.equal(r.status, 'failed')
  assert.deepEqual(
    r.findings.map((f) => [f.file, f.at, f.rule]),
    [['blank-site.zip!' + VENDOR_SAMPLE, 'line:1', 'jwt']]
  )
  assert.ok(!JSON.stringify(r).includes(PLANTED.jwt))
  rmSync(s.root, { recursive: true, force: true })
})

test('a secret left in the blank site demo data or a kit file fails; the value reaches neither result nor page', () => {
  const s = setup()
  writeFileSync(s.blank, zipOf({ [DUMP]: usersRow(PLANTED.bcrypt_hash) }))
  writeFileSync(path.join(s.kit, 'mapping.json'), JSON.stringify({ mail: PLANTED.uri_credentials }))
  const r = secretScan({ files: s.files, control: s.human, gitleaks: { bin: s.bin } })
  assert.equal(r.status, 'failed')
  assert.deepEqual(r.findings.map((f) => f.file + ' ' + f.at + ' ' + f.rule).sort(), [
    'blank-site.zip!' + DUMP + ' users#42.password bcrypt_hash',
    'blank-site.zip!' + DUMP + ' users#42.password joomla_account_password',
    'kit/mapping.json /mail uri_credentials'
  ])
  const page = recordHtml({
    verdict: { pass: false, failing: ['secrets'], notRun: [] },
    universe: {},
    markerTest: { groups: [], notSeen: [] },
    demoScan: { controls: {} },
    measurements: { secrets: r }
  })
  assert.match(page, /users#42\.password/)
  for (const v of [PLANTED.bcrypt_hash, PLANTED.uri_credentials, 'Tulip7Fake']) {
    assert.ok(!JSON.stringify(r).includes(v), 'value in the result')
    assert.ok(!page.includes(v), 'value in the page')
  }
  rmSync(s.root, { recursive: true, force: true })
})

test('a blind control, no control, gitleaks not available or an unreadable dump leave the scan incomplete', () => {
  const s = setup()
  const allow = vendorAllow()
  const blind = { name: 'petal-quickstart.zip', bytes: zipOf({ [DUMP]: CLEAN_DUMP }) }
  const cases = [
    [{ control: blind, gitleaks: { bin: s.bin } }, (r) => r.control.status === 'scan_blind'],
    [{ control: null, gitleaks: { bin: s.bin } }, (r) => r.control.status === 'not_run'],
    [{ control: s.human, gitleaks: false }, (r) => r.gitleaks.status === 'not_available']
  ]
  for (const [options, why] of cases) {
    const r = secretScan({ files: s.files, allow, ...options })
    assert.equal(r.status, 'incomplete')
    assert.ok(why(r))
  }
  writeFileSync(s.blank, zipOf({ [DUMP]: 'INSERT INTO `#__content` (`id`) VALUES \n(5) , oops (6);\n' }))
  const r = secretScan({ files: s.files, control: s.human, gitleaks: { bin: s.bin } })
  assert.deepEqual([r.status, r.unparsed], ['incomplete', ['blank-site.zip!' + DUMP]])
  rmSync(s.root, { recursive: true, force: true })
})

test('the allow file needs a reason for every entry, and an entry that matches nothing fails the scan, named', () => {
  const s = setup()
  const file = path.join(s.kit, 'check-record', 'secret-allow.json')
  writeFileSync(file, JSON.stringify([{ ...vendorAllow()[0], why: ' ' }]))
  assert.throws(() => readAllow(file), /why/)
  const stale = { file: 'kit/mapping.json', rule: 'jwt', fingerprint: 'abcdef012345', why: 'removed since' }
  const r = secretScan({
    files: s.files,
    allow: [...vendorAllow(), stale],
    control: s.human,
    gitleaks: { bin: s.bin }
  })
  assert.deepEqual(r.unusedAllows, [stale])
  assert.equal(r.status, 'failed')
  assert.equal(r.reason, 'unused_allow')
  assert.match(r.message, /kit\/mapping\.json jwt abcdef012345/)
  rmSync(s.root, { recursive: true, force: true })
})

test('the command names each finding and its fingerprint, prints no value, and exits 1', () => {
  const s = setup()
  const out = path.join(s.root, 'result.json')
  const run = spawnSync(
    process.execPath,
    [CLI, '--kit', s.kit, '--blank-site', s.blank, '--no-gitleaks', '--out', out],
    {
      encoding: 'utf8'
    }
  )
  assert.equal(run.status, 1)
  assert.match(
    run.stdout,
    /finding blank-site\.zip!libraries\/vendor\/florist\/token-sample\.txt line:1 jwt [0-9a-f]{12}/
  )
  assert.ok(!run.stdout.includes(PLANTED.jwt) && !run.stderr.includes(PLANTED.jwt))
  writeFileSync(path.join(s.kit, 'check-record', 'secret-allow.json'), JSON.stringify(vendorAllow()))
  const allowed = spawnSync(
    process.execPath,
    [CLI, '--kit', s.kit, '--blank-site', s.blank, '--no-gitleaks'],
    { encoding: 'utf8' }
  )
  assert.match(allowed.stdout, /secret scan incomplete: 0 finding\(s\), 1 allowed/)
  rmSync(s.root, { recursive: true, force: true })
})

test('the pinned gitleaks, when this machine has it, finds a planted key with --redact and the value stays out', (t) => {
  if (!pinnedGitleaks().bin) return t.skip('the pinned gitleaks is not installed here')
  const s = setup()
  writeFileSync(path.join(s.kit, 'notes.txt'), 'kept for later\n' + PLANTED.private_key + '\n')
  const files = filesOfArgs({ kit: s.kit, blankSite: s.blank })
  const r = secretScan({ files, allow: vendorAllow(), control: s.human })
  const leaks = r.findings.filter((f) => f.rule.startsWith('gitleaks:'))
  assert.equal(r.gitleaks.status, 'ran')
  assert.ok(
    leaks.some((f) => f.file === 'kit/notes.txt' && f.at === 'line:2' && f.rule === 'gitleaks:private-key')
  )
  assert.ok(r.findings.some((f) => f.file === 'kit/notes.txt' && f.rule === 'private_key'))
  assert.ok(!JSON.stringify(r).includes(PLANTED.private_key.split('\n')[1]))
  rmSync(s.root, { recursive: true, force: true })
})
