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
const emptyPolicy = () => ({ version: 1, translations: [], captured: [], lines: [], objects: [] })
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

test('an excluded history is skipped while commits and merges outside it are still checked', (t) => {
  const f = fixture(t)
  // main = f.base; develop carries a commit main's policy would reject, already checked on develop.
  f.git('checkout', '-q', '-b', 'develop')
  f.put('develop.md', `${VI}\n`)
  const developed = f.commit()
  f.git('checkout', '-q', 'main')
  f.put('hotfix.md', 'English hotfix.\n')
  const main = f.commit()
  f.git('checkout', '-q', '-b', 'release', developed)
  f.git('merge', '--no-ff', 'main', '-m', `merge: ${VI}`)
  f.put('release.md', `${ZH}\n`)
  f.commit()
  // Merging later develop work into the release branch does not re-read it either.
  f.git('checkout', '-q', 'develop')
  f.put('later.md', `${ZH}\n`)
  const later = f.commit()
  f.git('checkout', '-q', 'release')
  f.git('merge', '--no-ff', 'develop', '-m', 'merge: bring in develop')
  const head = f.git('rev-parse', 'HEAD')
  const run = (exclude) => checkRange({ repo: f.repo, base: main, head, policy: emptyPolicy(), exclude })
  assert.ok(run(null).findings.some((v) => v.path === 'develop.md'))
  const result = run(later)
  assert.equal(result.commits, 3)
  assert.deepEqual(result.findings.map((v) => v.path).sort(), ['commit message', 'release.md'])
  assert.throws(() => run('b'.repeat(40)))
  assert.throws(() => run('develop'), /exclude/)
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

test('a text blob over 16 MB is scanned in full without any object approval', (t) => {
  const f = fixture(t)
  const filler = `${'English demo line for a large captured file.\n'.repeat(400_000)}`
  assert.ok(Buffer.byteLength(filler) > 16 * 1024 * 1024)
  f.put('data/large.json', filler)
  f.commit()
  assert.deepEqual(f.check().findings, [])
  const lines = filler.split('\n').length
  f.put('data/large.json', `${filler}${ZH}\n`)
  f.commit()
  assert.deepEqual(
    f.check().findings.map((v) => [v.path, v.line, v.problem]),
    [
      ['data/large.json', lines, 'non-English letters in contributor-facing text'],
      ['data/large.json', lines, 'non-English letters in contributor-facing text']
    ]
  )
})

test('captured kits allow third-party accented values but refuse Vietnamese values and foreign keys', (t) => {
  const kit = 'packages/cms/tracy-joomla-quickstart/contracts/ja-example/j6/1.0.0/template-kit.json'
  const policy = emptyPolicy()
  policy.captured.push({
    path: 'packages/cms/tracy-joomla-quickstart/contracts/*/*/*/template-kit.json',
    reason: 'Verbatim third-party demo content.'
  })
  const accented = JSON.stringify(
    { title: 'Chasing the northern lights from Troms\u00f8', place: 'Gal\u00e1pagos, caf\u00e9' },
    null,
    2
  )
  const f = fixture(t)
  f.put(kit, accented)
  f.commit()
  assert.deepEqual(f.check(policy).findings, [])
  // The same path outside the captured class keeps the full English rule.
  assert.ok(f.check().findings.length > 0)

  const vietnamese = '\u0110\u00e0 N\u1eb5ng'
  for (const [text, line, problem] of [
    [`{\n  "place": "${vietnamese}"\n}\n`, 2, 'Vietnamese text in captured content'],
    [`{\n  "place": "${vietnamese.normalize('NFD')}"\n}\n`, 2, 'Vietnamese text in captured content'],
    ['{\n  "a": 1,\n  "place": "\\u0110\\u00e0 N\\u1eb5ng"\n}\n', 3, 'Vietnamese text in captured content'],
    [`{\n  "caf\u00e9": "Plain value"\n}\n`, 2, 'captured keys must be English identifiers'],
    ['{ "broken": ', 1, 'captured content is not valid JSON']
  ]) {
    const g = fixture(t)
    g.put(kit, text)
    g.commit()
    assert.deepEqual(
      g.check(policy).findings.map((v) => [v.path, v.line, v.problem]),
      [[kit, line, problem]],
      text
    )
  }
})

test('a reviewed line allowance can approve one exact Vietnamese line inside a captured kit', (t) => {
  const kit = 'packages/cms/tracy-joomla-quickstart/contracts/ja-example/j6/1.0.0/template-kit.json'
  const quoted = '  "sample": "Try the c\u00e0 ph\u00ea tr\u1ee9ng at Wren Example Cafe."'
  const policy = emptyPolicy()
  policy.captured.push({
    path: 'packages/cms/tracy-joomla-quickstart/contracts/*/*/*/template-kit.json',
    reason: 'Verbatim third-party demo content.'
  })
  policy.lines.push({
    path: kit,
    sha256: digest(quoted),
    count: 1,
    reason: 'Reviewed verbatim demo paragraph.'
  })
  const f = fixture(t)
  f.put(kit, `{\n${quoted}\n}\n`)
  f.commit()
  assert.deepEqual(f.check(policy).findings, [])
  f.put(kit, `[\n{\n${quoted}\n},\n{\n${quoted}\n}\n]\n`)
  f.commit()
  assert.ok(f.check(policy).findings.some((v) => v.path === kit && v.line === 3))
})

test('captured classes must be specific JSON paths, and older policies without one still load', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'english-policy-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const file = join(root, 'policy.json')
  writeFileSync(file, JSON.stringify(emptyPolicy()))
  assert.deepEqual(readPolicy(file).captured, [])
  writeFileSync(
    file,
    JSON.stringify({
      ...emptyPolicy(),
      captured: [{ path: 'packages/**', reason: 'This is much too broad.' }]
    })
  )
  assert.throws(() => readPolicy(file), /specific JSON/)
})
