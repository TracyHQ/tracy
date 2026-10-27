import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  expectedEvidence,
  inheritanceProofAt,
  themeFilesHash as opsThemeFilesHash
} from '../../apps/tracy-web/src/lib/template-design-system-readiness/readers/measurement-inheritance.js'
import { inheritedMeasurement } from '../../packages/cms/tracy-wordpress-quickstart/scripts/patch-artifacts.mjs'
import { themeFilesHash } from '../../packages/design/tracy-ds-slot/src/brand-facts.mjs'
import { inheritanceProblem } from '../../packages/design/tracy-ds-slot/src/measurement.mjs'
import { patchEvidenceProblems } from '../lib/patch-evidence.mjs'

const sha256 = (/** @type {Buffer} */ b) => createHash('sha256').update(b).digest('hex')

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const LINE = path.join(ROOT, 'packages/cms/tracy-wordpress-quickstart/contracts/ja-restaurant/wp7')
const PROFILES = JSON.parse(
  readFileSync(path.join(ROOT, 'apps/tracy-web/src/lib/template-profiles.json'), 'utf8')
)
const AT = 'ja-restaurant/wp7/1.0.1'

/** A throwaway copy of JA Restaurant 1.0.0 and 1.0.1 (cut by patch-artifacts.mjs from the release folder). */
function line(/** @type {(dir: string) => void} */ edit = () => {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'patch-evidence-'))
  try {
    for (const v of ['1.0.0', '1.0.1']) cpSync(path.join(LINE, v), path.join(root, v), { recursive: true })
    edit(root)
    return patchEvidenceProblems(path.join(root, '1.0.1'), AT, PROFILES)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}
const rewrite = (/** @type {string} */ f, /** @type {(d: any) => void} */ change) => {
  const d = JSON.parse(readFileSync(f, 'utf8'))
  change(d)
  writeFileSync(f, JSON.stringify(d, null, 2) + '\n')
}

test('the committed evidence of JA Restaurant 1.0.1 agrees with its manifest, lock, row and brand facts', () => {
  assert.deepEqual(line(), [])
})

test('evidence that no longer matches the committed files is named', () => {
  const sealed = line((r) =>
    rewrite(path.join(r, '1.0.1/manifest.json'), (m) => (m.quickstart.parts.database.sha256 = 'f'.repeat(64)))
  )
  assert.ok(
    sealed.some((p) => /archives is not what the committed files make it/.test(p)),
    sealed.join('\n')
  )
  const lock = line((r) =>
    rewrite(path.join(r, '1.0.1/presentation-lock.json'), (l) => (l.options.extra = '1'))
  )
  assert.ok(
    lock.some((p) => /presentationLock is not what the committed files make it/.test(p)),
    lock.join('\n')
  )
  const row = patchEvidenceProblems(path.join(LINE, '1.0.1'), AT, {
    releases: {
      'quickstart/ja-restaurant/wp7': {
        '1.0.1': { ...PROFILES.releases['quickstart/ja-restaurant/wp7']['1.0.1'], logos: 'single' }
      }
    }
  })
  assert.ok(
    row.some((p) => /profileRow is not what the committed files make it/.test(p)),
    row.join('\n')
  )
  const facts = line((r) =>
    rewrite(path.join(r, '1.0.1/brand-facts.json'), (d) => (d.facts.frame.height = 60))
  )
  assert.ok(
    facts.some((p) => /brand facts differ, the row was carried: frame/.test(p)),
    facts.join('\n')
  )
})

/**
 * A database-only patch made of JA Restaurant's files: 1.0.1 given 1.0.0's theme (its lock files, the brand facts
 * of that theme), its evidence updated to name those bytes, and its measurement inherited from 1.0.0.
 */
function databaseOnly(/** @type {string} */ r) {
  const lock0 = JSON.parse(readFileSync(path.join(r, '1.0.0/presentation-lock.json'), 'utf8'))
  rewrite(path.join(r, '1.0.1/presentation-lock.json'), (l) => (l.files = lock0.files))
  const lockSha = sha256(readFileSync(path.join(r, '1.0.1/presentation-lock.json')))
  rewrite(path.join(r, '1.0.1/brand-facts.json'), (d) => (d.themeFiles = themeFilesHash(lock0.files)))
  rewrite(path.join(r, '1.0.1/patch-evidence.json'), (e) => {
    e.presentationLock.sha256 = lockSha
    e.themeFiles.sha256 = themeFilesHash(lock0.files)
    e.webrootDiff.theme = { added: [], removed: [], changed: [] }
    e.measurement = 'inherited'
  })
  const m0 = JSON.parse(readFileSync(path.join(r, '1.0.0/design-system-measurement.json'), 'utf8'))
  writeFileSync(
    path.join(r, '1.0.1/design-system-measurement.json'),
    JSON.stringify(inheritedMeasurement(m0, '1.0.1'), null, 2) + '\n'
  )
}

test('a measurement inherited by a database-only patch counts when the committed locks prove the theme unmoved', () => {
  assert.deepEqual(line(databaseOnly), [])
  // no evidence at all
  const bare = line((r) => (databaseOnly(r), rmSync(path.join(r, '1.0.1/patch-evidence.json'))))
  assert.ok(
    bare.some((p) => /inherits from 1\.0\.0: no patch-evidence\.json beside it/.test(p)),
    bare.join('\n')
  )
  // evidence that claims an inherited measurement the file does not carry
  const claim = line(
    (r) => (
      databaseOnly(r),
      rewrite(path.join(r, '1.0.1/design-system-measurement.json'), (d) => {
        d.version = '1.0.1'
        delete d.inheritedFrom
      })
    )
  )
  assert.ok(
    claim.some((p) => /measurement is not what the committed files make it/.test(p)),
    claim.join('\n')
  )
  // inherited numbers that are not the previous version's
  const forged = line(
    (r) => (
      databaseOnly(r),
      rewrite(path.join(r, '1.0.1/design-system-measurement.json'), (d) => (d.controls = [9]))
    )
  )
  assert.ok(
    forged.some((p) => /its numbers are not 1\.0\.0's/.test(p)),
    forged.join('\n')
  )
})

test('an inherited measurement is refused when the committed locks show the theme moved', () => {
  // JA Restaurant 1.0.1 changed five stylesheets
  const lied = line((r) => {
    rewrite(path.join(r, '1.0.1/patch-evidence.json'), (e) => (e.measurement = 'inherited'))
    rewrite(path.join(r, '1.0.1/design-system-measurement.json'), (d) => (d.inheritedFrom = '1.0.0'))
  })
  assert.ok(
    lied.some((p) => /the theme files of 1\.0\.1 and 1\.0\.0 differ \(presentation locks\)/.test(p)),
    lied.join('\n')
  )
})

test('a brand-facts.json copied from another version is refused, evidence or not', () => {
  const copied = line((r) =>
    writeFileSync(
      path.join(r, '1.0.1/brand-facts.json'),
      readFileSync(path.join(r, '1.0.0/brand-facts.json'))
    )
  )
  assert.ok(
    copied.some((p) =>
      /measured quickstart\/ja-restaurant\/wp7@1\.0\.0, not quickstart\/ja-restaurant\/wp7@1\.0\.1/.test(p)
    ),
    copied.join('\n')
  )
  // the right tag and version, but a measurement of another theme build
  const other = line((r) =>
    rewrite(path.join(r, '1.0.1/brand-facts.json'), (d) => (d.themeFiles = 'f'.repeat(64)))
  )
  assert.ok(
    other.some((p) => /measured another theme/.test(p)),
    other.join('\n')
  )
})

test('a row carried with a field the brand facts do not measure is named unless its own proof holds', () => {
  const rows = (/** @type {any} */ extra) => ({
    releases: {
      'quickstart/ja-restaurant/wp7': {
        '1.0.1': { ...PROFILES.releases['quickstart/ja-restaurant/wp7']['1.0.1'], ...extra }
      }
    }
  })
  const unverified = patchEvidenceProblems(
    path.join(LINE, '1.0.1'),
    AT,
    rows({ unverified: ['faviconReady'] })
  )
  assert.ok(
    unverified.some((p) => /was carried with unverified/.test(p)),
    unverified.join('\n')
  )
  // the theme moved between 1.0.0 and 1.0.1: a theme field cannot have been carried
  const framework = patchEvidenceProblems(path.join(LINE, '1.0.1'), AT, rows({ framework: 't4' }))
  assert.ok(
    framework.some((p) => /was carried with framework: the theme is not the same bytes/.test(p)),
    framework.join('\n')
  )
})

test('a value in the evidence the gate cannot recompute fails it (slotContract.sha256 tampered)', () => {
  // review round 2, finding 2: slotContract.sha256 set to 64 'f' in a copy of the JA Restaurant 1.0.1 dossier passed
  const tampered = line((r) =>
    rewrite(path.join(r, '1.0.1/patch-evidence.json'), (e) => (e.slotContract.sha256 = 'f'.repeat(64)))
  )
  assert.ok(
    tampered.some((p) => /slotContract holds more than its file and maxVersion move/.test(p)),
    tampered.join('\n')
  )
  // a theme-zip hash added back
  const zip = line((r) =>
    rewrite(path.join(r, '1.0.1/patch-evidence.json'), (e) => (e.themeZip = { sha256: 'f'.repeat(64) }))
  )
  assert.ok(
    zip.some((p) => /holds themeZip, which no committed file lets the gate recompute/.test(p)),
    zip.join('\n')
  )
  // each recomputed value, edited, fails: the theme files, the previous lock, the content map's change flag
  for (const [key, edit] of /** @type {[string, (e: any) => void][]} */ ([
    ['themeFiles', (e) => (e.themeFiles.previousSha256 = 'f'.repeat(64))],
    ['presentationLock', (e) => (e.presentationLock.previousSha256 = 'f'.repeat(64))],
    ['contentMap', (e) => (e.contentMap.changeAccepted = true)],
    ['webrootDiff', (e) => (e.webrootDiff.database = 'same')]
  ])) {
    const problems = line((r) => rewrite(path.join(r, '1.0.1/patch-evidence.json'), edit))
    assert.ok(
      problems.some((p) => p.includes(`${key} is not what the committed files make it`)),
      `${key}: ${problems.join('\n')}`
    )
  }
  // a maxVersion move the slot contract does not hold
  const moved = line((r) =>
    rewrite(
      path.join(r, '1.0.1/patch-evidence.json'),
      (e) => (e.slotContract.maxVersion = { from: '1.0.1', to: '9.9.9' })
    )
  )
  assert.ok(
    moved.some((p) => /slotContract\.maxVersion .* is not a move/.test(p)),
    moved.join('\n')
  )
})

/** What /ops decides for 1.0.1 of a fixture line: the same call the reader makes (`readers/measurement.js`). */
const opsProof = (/** @type {string} */ r) =>
  inheritanceProofAt(
    path.join(r, '1.0.1'),
    { tag: 'quickstart/ja-restaurant/wp7', version: '1.0.1' },
    '1.0.0',
    { selfProblem: inheritanceProblem }
  ).problem

/** A fixture line edited by `edit` after `databaseOnly`, read by the gate and by /ops in one go. */
function both(/** @type {(r: string) => void} */ edit) {
  /** @type {string | null} */
  let ops = null
  const gate = line((r) => {
    databaseOnly(r)
    edit(r)
    ops = opsProof(r)
  })
  return { gate, ops }
}

test('a patch that moved the slot contract (maxVersion) never inherits, at the gate or on /ops', () => {
  // review round 3, finding 1: evidence declaring a maxVersion move still let the measurement be inherited
  const { gate, ops } = both((r) =>
    rewrite(
      path.join(r, '1.0.1/patch-evidence.json'),
      (e) => (e.slotContract.maxVersion = { from: '1.0.0', to: '1.0.1' })
    )
  )
  assert.match(ops ?? '', /moved the slot contract's maxVersion/)
  assert.ok(
    gate.some((p) => /moved the slot contract's maxVersion/.test(p)),
    gate.join('\n')
  )
})

test('/ops refuses evidence that is not what the committed files make it, as the gate does', () => {
  // review round 3, finding 2: presentationLock.sha256 set to 64 'f' was caught by the gate but accepted by /ops
  const { gate, ops } = both((r) =>
    rewrite(path.join(r, '1.0.1/patch-evidence.json'), (e) => (e.presentationLock.sha256 = 'f'.repeat(64)))
  )
  assert.match(ops ?? '', /presentationLock is not what the committed files make it/)
  assert.ok(
    gate.some((p) => /presentationLock is not what the committed files make it/.test(p)),
    gate.join('\n')
  )
})

test('the gate and /ops reach the same decision on every kind of evidence edit', () => {
  /** @type {[string, (r: string) => void][]} */
  const edits = [
    ['untouched', () => {}],
    [
      'maxVersion moved',
      (r) =>
        rewrite(
          path.join(r, '1.0.1/patch-evidence.json'),
          (e) => (e.slotContract.maxVersion = { from: '1.0.0', to: '1.0.1' })
        )
    ],
    [
      'lock hash',
      (r) =>
        rewrite(
          path.join(r, '1.0.1/patch-evidence.json'),
          (e) => (e.presentationLock.previousSha256 = 'f'.repeat(64))
        )
    ],
    [
      'theme files hash',
      (r) => rewrite(path.join(r, '1.0.1/patch-evidence.json'), (e) => (e.themeFiles.sha256 = 'f'.repeat(64)))
    ],
    [
      'archives',
      (r) => rewrite(path.join(r, '1.0.1/patch-evidence.json'), (e) => (e.archives.database.bytes = 1))
    ],
    [
      'content map flag',
      (r) => rewrite(path.join(r, '1.0.1/patch-evidence.json'), (e) => (e.contentMap.changeAccepted = true))
    ],
    [
      'profile row hash',
      (r) => rewrite(path.join(r, '1.0.1/patch-evidence.json'), (e) => (e.profileRow = 'f'.repeat(64)))
    ],
    [
      'brand facts hash',
      (r) => rewrite(path.join(r, '1.0.1/patch-evidence.json'), (e) => (e.brandFacts.sha256 = 'f'.repeat(64)))
    ],
    [
      'a key nobody recomputes',
      (r) =>
        rewrite(path.join(r, '1.0.1/patch-evidence.json'), (e) => (e.themeZip = { sha256: 'f'.repeat(64) }))
    ],
    [
      'slot hash added',
      (r) =>
        rewrite(path.join(r, '1.0.1/patch-evidence.json'), (e) => (e.slotContract.sha256 = 'f'.repeat(64)))
    ],
    ['content map edited', (r) => writeFileSync(path.join(r, '1.0.1/content-map.json'), '{"slots":[]}\n')],
    ['evidence removed', (r) => rmSync(path.join(r, '1.0.1/patch-evidence.json'))]
  ]
  for (const [name, edit] of edits) {
    const { gate, ops } = both(edit)
    assert.equal(gate.length === 0, ops === null, `${name}: gate ${JSON.stringify(gate)}, /ops ${ops}`)
    assert.equal(name === 'untouched', ops === null, `${name}: /ops ${ops}`)
  }
})

test('the theme hash /ops recomputes is the one brand facts are measured with', () => {
  const lock = JSON.parse(readFileSync(path.join(LINE, '1.0.1/presentation-lock.json'), 'utf8'))
  assert.equal(opsThemeFilesHash(lock.files), themeFilesHash(lock.files))
})

/**
 * A line of database-only patches cut from JA Restaurant 1.0.0's own files: each later version is 1.0.0's dossier
 * under its own version, its brand facts and measurement carried, its evidence what the files make
 * (`expectedEvidence`, the function the gate and /ops recompute with). Its profile rows ride in `profiles`.
 */
function chain(/** @type {string} */ root, /** @type {string[]} */ versions) {
  const row = PROFILES.releases['quickstart/ja-restaurant/wp7']['1.0.0']
  /** @type {any} */
  const profiles = { releases: { 'quickstart/ja-restaurant/wp7': { '1.0.0': row } } }
  cpSync(path.join(LINE, '1.0.0'), path.join(root, '1.0.0'), { recursive: true })
  rmSync(path.join(root, '1.0.0', 'patch-evidence.json'), { force: true })
  let previous = '1.0.0'
  for (const v of versions) {
    cpSync(path.join(root, previous), path.join(root, v), { recursive: true })
    rewrite(path.join(root, v, 'manifest.json'), (m) => {
      m.id = `ja-restaurant/wp7/${v}`
      m.quickstart.version = v
    })
    rewrite(path.join(root, v, 'brand-facts.json'), (d) => (d.version = v))
    const before = JSON.parse(
      readFileSync(path.join(root, previous, 'design-system-measurement.json'), 'utf8')
    )
    writeFileSync(
      path.join(root, v, 'design-system-measurement.json'),
      JSON.stringify(inheritedMeasurement(before, v), null, 2) + '\n'
    )
    profiles.releases['quickstart/ja-restaurant/wp7'][v] = row
    const { expected } = expectedEvidence(path.join(root, v), previous, { profiles })
    writeFileSync(
      path.join(root, v, 'patch-evidence.json'),
      JSON.stringify(
        {
          ...expected,
          slotContract: {
            file: 'packages/design/tracy-ds-slot/templates/wordpress-wp-ja-restaurant.json',
            maxVersion: null
          }
        },
        null,
        2
      ) + '\n'
    )
    previous = v
  }
  return profiles
}

test('a chain of database-only patches is proven link by link (1.0.0 → 1.0.1 → 1.0.2)', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'patch-chain-'))
  try {
    const profiles = chain(root, ['1.0.1', '1.0.2'])
    const m2 = JSON.parse(readFileSync(path.join(root, '1.0.2/design-system-measurement.json'), 'utf8'))
    assert.equal(m2.inheritedFrom, '1.0.1', 'each link points at the version before it')
    const tag = 'quickstart/ja-restaurant/wp7'
    const at = (/** @type {string} */ v, /** @type {string} */ from) =>
      inheritanceProofAt(path.join(root, v), { tag, version: v }, from, {
        selfProblem: inheritanceProblem,
        profiles
      }).problem
    assert.equal(at('1.0.2', '1.0.1'), null)
    // a removed middle evidence breaks the end of the chain
    rmSync(path.join(root, '1.0.1/patch-evidence.json'))
    assert.match(at('1.0.2', '1.0.1') ?? '', /^1\.0\.1 inherits from 1\.0\.0: no patch-evidence\.json/)
    // a middle lock edited after the evidence was cut: 1.0.2's own evidence (the previous lock's hash) is stale now
    chain(root, ['1.0.1', '1.0.2'])
    assert.equal(at('1.0.2', '1.0.1'), null)
    rewrite(path.join(root, '1.0.1/presentation-lock.json'), (l) => (l.options.extra = '1'))
    assert.match(at('1.0.2', '1.0.1') ?? '', /presentationLock is not what the committed files make it/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('equal locks and consistent evidence are not enough: the content maps of both versions must be the same bytes', () => {
  // review round 2, finding 1: equal locks and hashes the evidence declared were accepted with no artifact behind
  const root = mkdtempSync(path.join(tmpdir(), 'patch-declared-'))
  try {
    const tag = 'quickstart/ja-restaurant/wp7'
    const profiles = chain(root, ['1.0.1'])
    const proof = () =>
      inheritanceProofAt(path.join(root, '1.0.1'), { tag, version: '1.0.1' }, '1.0.0', {
        selfProblem: inheritanceProblem,
        profiles
      }).problem
    assert.equal(proof(), null)
    // the content map changed and the evidence cut again to match it: the files still differ, so no inheritance
    rewrite(path.join(root, '1.0.1/content-map.json'), (m) => m.slots.pop())
    const { expected } = expectedEvidence(path.join(root, '1.0.1'), '1.0.0', { profiles })
    rewrite(path.join(root, '1.0.1/patch-evidence.json'), (e) => Object.assign(e, expected))
    assert.equal(proof(), 'the content maps of 1.0.1 and 1.0.0 are not the same bytes')
    // made-up zip and slot hashes added beside it: a key nobody can recompute
    rewrite(
      path.join(root, '1.0.1/patch-evidence.json'),
      (e) => (e.themeZip = { sha256: 'c'.repeat(64), previousSha256: 'c'.repeat(64) })
    )
    assert.match(proof() ?? '', /holds themeZip, which no committed file lets the gate recompute/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
