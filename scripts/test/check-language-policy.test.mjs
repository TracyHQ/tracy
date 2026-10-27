import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { addedLines, checkRange, readPolicy } from '../check-language-policy.mjs'
import { englishProblem } from '../lib/english-policy.mjs'

const SCRIPT = fileURLToPath(new URL('../check-language-policy.mjs', import.meta.url))
const VI = 's\u1eeda l\u1ed7i'
const ZH = '\u4fee\u590d'
const emptyPolicy = () => ({ version: 1, translations: [], lines: [], objects: [] })
const digest = (text) => createHash('sha256').update(text).digest('hex')

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'english-policy-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const repo = join(root, 'repo')
  mkdirSync(repo)
  const git = (...args) =>
    execFileSync(
      'git',
      [
        '-C',
        repo,
        '-c',
        'core.hooksPath=/dev/null',
        '-c',
        'commit.gpgsign=false',
        '-c',
        'user.name=Test',
        '-c',
        'user.email=test@example.test',
        ...args
      ],
      { encoding: 'utf8' }
    ).trim()
  git('init', '--quiet', '-b', 'main')
  const put = (path, text) => {
    mkdirSync(dirname(join(repo, path)), { recursive: true })
    writeFileSync(join(repo, path), text)
  }
  const commit = (message = 'fix: update the example') => {
    git('add', '--all')
    git('commit', '--quiet', '--allow-empty', '-m', message)
    return git('rev-parse', 'HEAD')
  }
  put('README.md', 'English guide.\n')
  put('old.txt', `${VI}\nUnchanged English.\n`)
  const base = commit('chore: initial snapshot')
  const check = (policy = emptyPolicy(), head = git('rev-parse', 'HEAD'), pull = null) =>
    checkRange({ repo, base, head, policy, pull })
  return { root, repo, git, put, commit, base, check }
}

test('English text passes; different scripts, decomposed marks and recognizable ASCII prose fail', () => {
  for (const text of [
    'fix: keep the connection open',
    'Use `await` here. 42% \u2713',
    'English \u2014 with punctuation',
    'Warning \u26a0\ufe0f and key 1\ufe0f\u20e3',
    'Information \u2139'
  ])
    assert.equal(englishProblem(text), null)
  for (const text of [
    VI,
    VI.normalize('NFD'),
    ZH,
    'caf\u00e9',
    'sua\x20dang\x20nhap',
    'hola\x20mundo',
    'bonjour\x20le\x20monde'
  ])
    assert.ok(englishProblem(text), text)
})

test('all text paths are checked, including docs, tests, code fences and HTML comments', (t) => {
  const f = fixture(t)
  const paths = ['docs/guide.md', 'apps/demo/test/login.test.mjs', 'scripts/check.sh', 'config/custom.data']
  for (const path of paths)
    f.put(path, `\x60\x60\x60\n${VI.normalize('NFD')}\n\x60\x60\x60\n<!-- ${ZH} -->\n`)
  f.commit()
  assert.deepEqual([...new Set(f.check().findings.map((v) => v.path))].sort(), paths.sort())
})

test('an English change leaves old text alone but replacing an old violation at the same count fails', (t) => {
  const f = fixture(t)
  f.put('old.txt', `${VI}\nA new English sentence.\n`)
  f.commit()
  assert.deepEqual(f.check().findings, [])
  f.put('old.txt', `${ZH}\nA new English sentence.\n`)
  f.commit()
  assert.ok(f.check().findings.some((v) => v.path === 'old.txt'))
})

test('a violation remains red when a later commit removes it', (t) => {
  const f = fixture(t)
  f.put('README.md', `${VI}\n`)
  const bad = f.commit()
  f.put('README.md', 'English guide.\n')
  f.commit()
  assert.ok(f.check().findings.some((v) => v.commit === bad && v.path === 'README.md'))
})

test('merge messages and changes introduced on side branches are checked', (t) => {
  const f = fixture(t)
  f.git('checkout', '-q', '-b', 'feature')
  f.put('feature.md', `${ZH}\n`)
  f.commit()
  f.git('checkout', '-q', 'main')
  f.git('merge', '--no-ff', 'feature', '-m', `merge: ${VI}`)
  const findings = f.check().findings
  assert.ok(findings.some((v) => v.path === 'commit message'))
  assert.ok(findings.some((v) => v.path === 'feature.md'))
})

test('PR metadata has no markdown or HTML exemption, and an event must name the checked SHAs', (t) => {
  const f = fixture(t)
  const head = f.commit()
  const pull = { base: { sha: f.base }, head: { sha: head }, title: `\x60${VI}\x60`, body: `<!-- ${ZH} -->` }
  assert.equal(f.check(emptyPolicy(), head, pull).findings.length, 2)
  pull.head.sha = f.base
  assert.throws(() => f.check(emptyPolicy(), head, pull), /event SHA/)
})

test('locale JSON values are allowed; adjacent README, source code and non-English keys are not', (t) => {
  const f = fixture(t)
  const policy = emptyPolicy()
  policy.translations.push({ path: 'locales/*.json', reason: 'Product translation values only.' })
  f.put('locales/vi.json', JSON.stringify({ title: VI, nested: { label: ZH } }))
  f.commit()
  assert.deepEqual(f.check(policy).findings, [])
  f.put('locales/README.md', VI)
  f.put('locales/code.ts', `const label = '${VI}';`)
  f.put('locales/bad.json', JSON.stringify({ [ZH]: 'English' }))
  f.put('locales/invalid.json', '{invalid')
  f.commit()
  assert.deepEqual([...new Set(f.check(policy).findings.map((v) => v.path))].sort(), [
    'locales/README.md',
    'locales/bad.json',
    'locales/code.ts',
    'locales/invalid.json'
  ])
})

test('shadowed JSON properties cannot hide foreign keys or non-string leaves', (t) => {
  const f = fixture(t)
  const policy = emptyPolicy()
  policy.translations.push({ path: 'locales/*.json', reason: 'Product translation values only.' })
  f.put('locales/hidden-key.json', `{"item":{"${ZH}":"x"},"item":"ok"}`)
  f.put('locales/hidden-number.json', '{"item":123,"item":"ok"}')
  f.put('locales/quoted.json', JSON.stringify({ label: `Text with escaped "${ZH}": punctuation.` }))
  f.commit()
  assert.deepEqual(
    f
      .check(policy)
      .findings.map((v) => v.path)
      .sort(),
    ['locales/hidden-key.json', 'locales/hidden-number.json']
  )
})

test('a same-PR policy or numeric ledger edit cannot approve its own text', (t) => {
  const f = fixture(t)
  f.put('README.md', VI)
  f.put('scripts/language-debt.json', JSON.stringify({ files: { 'README.md': 999 } }))
  f.put(
    'scripts/language-policy.json',
    JSON.stringify({
      ...emptyPolicy(),
      lines: [
        {
          path: 'README.md',
          sha256: digest(VI),
          count: 1,
          reason: 'Attempted self approval in a pull request.'
        }
      ]
    })
  )
  f.commit()
  const policyFile = join(f.root, 'trusted-policy.json')
  writeFileSync(policyFile, JSON.stringify(emptyPolicy()))
  const result = spawnSync(
    process.execPath,
    [
      SCRIPT,
      '--repo',
      f.repo,
      '--base',
      f.base,
      '--head',
      f.git('rev-parse', 'HEAD'),
      '--policy',
      policyFile
    ],
    { encoding: 'utf8' }
  )
  assert.equal(result.status, 1, result.stderr)
  assert.ok(JSON.parse(result.stdout).findings.some((v) => v.path === 'README.md'))
})

test('exact reviewed line allowances cannot authorize a different line, path or extra occurrence', (t) => {
  const f = fixture(t)
  const policy = emptyPolicy()
  policy.lines.push({
    path: 'sample.txt',
    sha256: digest(VI),
    count: 1,
    reason: 'Deliberate quoted customer sample.'
  })
  f.put('sample.txt', `${VI}\n`)
  f.commit()
  assert.deepEqual(f.check(policy).findings, [])
  f.put('sample.txt', `${VI}\n${VI}\n`)
  f.put('copy.txt', VI)
  f.commit()
  const findings = f.check(policy).findings
  assert.ok(findings.some((v) => v.path === 'sample.txt'))
  assert.ok(findings.some((v) => v.path === 'copy.txt'))
})

test('filenames, opaque files, invalid UTF-8 and disguised media cannot silently skip', (t) => {
  const f = fixture(t)
  f.put(`docs/${VI}.md`, 'English')
  f.put('text.png', VI)
  f.put('bad.txt', Buffer.from([0xff, 0xfe, 0xfd]))
  f.put('nul.md', Buffer.from(`English\0${VI}`))
  f.put('release.zip', 'Opaque archive')
  f.commit()
  const paths = f.check().findings.map((v) => v.path)
  for (const path of [`docs/${VI}.md`, 'text.png', 'bad.txt', 'nul.md', 'release.zip'])
    assert.ok(paths.includes(path), path)
})

test('symlinks are scanned as Git data and candidate code is never executed', (t) => {
  const f = fixture(t)
  const marker = join(f.root, 'executed')
  f.put(
    'scripts/lib/english-policy.mjs',
    `import{writeFileSync}from'node:fs';writeFileSync(${JSON.stringify(marker)},'bad');`
  )
  f.put('scripts/check-language-policy.mjs', `process.exit(0)`)
  symlinkSync(`/${VI}`, join(f.repo, 'outside'))
  f.commit()
  assert.ok(f.check().findings.some((v) => v.path === 'outside'))
  assert.equal(existsSync(marker), false)
})

test('missing objects, shallow history and malformed policy fail closed', (t) => {
  const f = fixture(t)
  assert.throws(() => f.check(emptyPolicy(), 'a'.repeat(40)))
  writeFileSync(join(f.repo, '.git/shallow'), `${f.base}\n`)
  assert.throws(() => f.check(), /shallow/)
  const file = join(f.root, 'policy.json')
  writeFileSync(
    file,
    JSON.stringify({
      ...emptyPolicy(),
      translations: [{ path: 'docs/**', reason: 'This is much too broad.' }]
    })
  )
  assert.throws(() => readPolicy(file), /specific JSON/)
})

test('opaque object approvals are pinned to the exact Git object', (t) => {
  const f = fixture(t)
  f.put('release.zip', 'Reviewed bytes')
  f.commit()
  const policy = emptyPolicy()
  policy.objects.push({
    path: 'release.zip',
    oid: f.git('rev-parse', 'HEAD:release.zip'),
    reason: 'Archive reviewed by its upstream owner.'
  })
  assert.deepEqual(f.check(policy).findings, [])
  f.put('release.zip', 'Different bytes')
  f.commit()
  assert.ok(f.check(policy).findings.some((v) => v.path === 'release.zip'))
})

test('diff line numbers remain correct for content beginning with plus signs', () => {
  assert.deepEqual(addedLines('--- a/file\n+++ b/file\n@@ -0,0 +3,2 @@\n++++ value\n+English\n'), [
    { line: 3, text: '+++ value' },
    { line: 4, text: 'English' }
  ])
})
