import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { REVIEWED_SKILLS } from '../ci/related-tests.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const sourceRoot = join(here, '../..')

const DATA = 'apps/tracy-web/src/lib/template-profiles.json'
const MAPPED = [
  'template-profiles',
  'fit-questions',
  'brief-brand-joomla',
  'brief-brand',
  'brief-emdash-brand'
].map((name) => `apps/tracy-web/test/${name}.test.mjs`)
// A reviewed tree no test reads: its re-pin runs no test.
const SKILL_FILE = `${REVIEWED_SKILLS.find((skill) => !skill.readers.length).prefix}IMPORT-NOTE.md`

/** Scratch lives under the task's artifact directory when the runner provides one. */
function scratchRoot() {
  const base = process.env.TCH_TEST_ARTIFACTS_DIR
  if (base) {
    mkdirSync(base, { recursive: true })
    return mkdtempSync(join(realpathSync(base), 'related-gate-'))
  }
  return mkdtempSync(join(realpathSync(tmpdir()), 'tracy-related-gate-'))
}

/** Builds a two-commit fixture repo, runs `check-tests --part related`, always removes the fixture. */
function gateRun({ base, change }) {
  const root = scratchRoot()
  const write = (file, value) => {
    mkdirSync(dirname(join(root, file)), { recursive: true })
    writeFileSync(join(root, file), value)
  }
  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'pipe' })
  const commit = (message) =>
    git('-c', 'user.name=CI', '-c', 'user.email=ci@example.invalid', 'commit', '-qm', message)
  try {
    for (const file of ['check-tests.ts', 'test-database.ts', 'test-timing-reporter.mjs']) {
      write(`scripts/${file}`, readFileSync(join(sourceRoot, 'scripts', file)))
    }
    write('scripts/ci/related-tests.mjs', readFileSync(join(sourceRoot, 'scripts/ci/related-tests.mjs')))
    for (const [file, value] of Object.entries(base)) write(file, value)
    git('init', '-q')
    git('add', '.')
    commit('base')
    for (const [file, value] of Object.entries(change)) write(file, value)
    git('add', '.')
    commit('change')
    symlinkSync(join(sourceRoot, 'node_modules'), join(root, 'node_modules'))
    const { NODE_TEST_CONTEXT: _context, TEST_DATABASE_URL: _database, ...env } = process.env
    return spawnSync(
      process.execPath,
      ['--import', 'tsx', join(root, 'scripts/check-tests.ts'), '--part', 'related'],
      { cwd: sourceRoot, env, encoding: 'utf8', timeout: 30_000 }
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

const passing = (name) => `import { test } from 'node:test'; test('${name}', () => {})\n`
const dataBase = () => ({
  [DATA]: '{}\n',
  [SKILL_FILE]: 'a\n',
  ...Object.fromEntries(MAPPED.map((file) => [file, passing(`mapped-${file.split('/').at(-1)}`)])),
  'apps/tracy-web/test/unmapped.test.mjs': passing('unmapped-not-selected'),
  'scripts/test/interop.test.ts': passing('interop-must-not-run')
})

test('the related gate runs the mapped tests for a data-only change and nothing else', () => {
  const run = gateRun({ base: dataBase(), change: { [DATA]: '{"a":1}\n', [SKILL_FILE]: 'b\n' } })
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`)
  assert.match(run.stdout, /related workers — 5 file/)
  assert.match(run.stdout, /interop=false/)
  for (const file of MAPPED) assert.match(run.stdout, new RegExp(`mapped-${file.split('/').at(-1)}`))
  assert.doesNotMatch(run.stdout, /unmapped-not-selected|interop-must-not-run/)
})

test('the related gate runs no test at all for a reviewed skill re-pin', () => {
  const run = gateRun({ base: dataBase(), change: { [SKILL_FILE]: 'b\n' } })
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`)
  assert.match(run.stdout, /0 workers files; interop=false/)
  assert.doesNotMatch(run.stdout, /mapped-|unmapped-not-selected|interop-must-not-run/)
})

test('the related gate runs exactly the declared reader for a skill with one', () => {
  const t4 = REVIEWED_SKILLS.find((skill) => skill.prefix.includes('joomlart-t4'))
  const [reader] = t4.readers
  const file = `${t4.prefix}IMPORT-NOTE.md`
  const run = gateRun({
    base: {
      ...dataBase(),
      [file]: 'a\n',
      [reader]: passing('declared-reader-selected')
    },
    change: { [file]: 'b\n' }
  })
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`)
  assert.match(run.stdout, /related workers — 1 file/)
  assert.match(run.stdout, /declared-reader-selected/)
  assert.match(run.stdout, /interop=false/)
  assert.doesNotMatch(run.stdout, /mapped-|unmapped-not-selected|interop-must-not-run/)
})

test('the related gate keeps the owner selection when the data file travels with source', () => {
  const run = gateRun({
    base: dataBase(),
    change: { [DATA]: '{"a":1}\n', 'apps/tracy-web/src/a.js': 'export const a = 1\n' }
  })
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`)
  assert.match(run.stdout, /unmapped-not-selected/)
  assert.match(run.stdout, /interop-must-not-run/)
})

test('the related gate runs the changed owner and not an unrelated owner', () => {
  const root = scratchRoot()
  const write = (file, value) => {
    mkdirSync(dirname(join(root, file)), { recursive: true })
    writeFileSync(join(root, file), value)
  }
  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'pipe' })
  try {
    for (const file of ['check-tests.ts', 'test-database.ts', 'test-timing-reporter.mjs']) {
      write(`scripts/${file}`, readFileSync(join(sourceRoot, 'scripts', file)))
    }
    write('scripts/ci/related-tests.mjs', readFileSync(join(sourceRoot, 'scripts/ci/related-tests.mjs')))
    write('packages/demo/one/src/value.mjs', 'export const value = 1\n')
    write('packages/demo/two/src/value.mjs', 'export const value = 1\n')
    write(
      'packages/demo/one/test/owner.test.mjs',
      "import { test } from 'node:test'; test('owner-selected', () => {})\n"
    )
    write(
      'packages/demo/two/test/other.test.mjs',
      "import { test } from 'node:test'; test('other-not-selected', () => {})\n"
    )
    write(
      'scripts/test/interop.test.ts',
      "import { test } from 'node:test'; test('interop-selected', () => {})\n"
    )
    git('init', '-q')
    git('add', '.')
    git('-c', 'user.name=CI', '-c', 'user.email=ci@example.invalid', 'commit', '-qm', 'base')
    write('packages/demo/one/src/value.mjs', 'export const value = 2\n')
    git('add', '.')
    git('-c', 'user.name=CI', '-c', 'user.email=ci@example.invalid', 'commit', '-qm', 'change one')
    // The fixture only borrows the loader; its test source still comes from its own Git tree.
    symlinkSync(join(sourceRoot, 'node_modules'), join(root, 'node_modules'))
    const { NODE_TEST_CONTEXT: _context, TEST_DATABASE_URL: _database, ...env } = process.env
    const run = spawnSync(
      process.execPath,
      ['--import', 'tsx', join(root, 'scripts/check-tests.ts'), '--part', 'related'],
      { cwd: sourceRoot, env, encoding: 'utf8', timeout: 30_000 }
    )
    assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`)
    assert.match(run.stdout, /related workers — 1 file/)
    assert.match(run.stdout, /owner-selected/)
    assert.match(run.stdout, /interop-selected/)
    assert.doesNotMatch(run.stdout, /other-not-selected/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
