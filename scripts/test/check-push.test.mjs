#!/usr/bin/env node
/**
 * The pre-push gate's decisions, tested away from git.
 *
 *   node --test scripts/test/check-push.test.mjs
 *
 * WHY THE POLICY IS A PURE FUNCTION. A pre-push hook is the one gate that can only be exercised
 * by pushing, and a gate you can only debug by doing the thing it guards is a gate nobody trusts
 * — the lesson `pr-description-check.yml` already paid for. So `check-push.mjs` splits in two:
 * git I/O reads the facts, and these functions decide what the facts mean. The half that holds
 * the judgement is the half under test.
 *
 * WHY A WARNING IS NOT A FAILURE, AND WHY BOTH EXIST. Blocking on something the hook cannot
 * actually determine teaches `--no-verify`, and a hook that gets bypassed guards nothing. So
 * "the submodule moved backwards" blocks and "I could not tell which way it moved" warns, and
 * the difference is asserted here rather than left to whoever edits the script next.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  GIT_LOCATION_VARS,
  SHA_ZERO,
  DSH_BUILT_MARKER,
  envForWorkerTests,
  envWithoutGitLocation,
  interfaceLanguagesVerdict,
  needsInterfaceLanguages,
  isDelete,
  isMain,
  needsWorkerTests,
  POSTGRES_OPT_IN,
  VOCABULARY_DOC,
  vocabularyVerdict,
  readRefs,
  refsFromEnv,
  resolvePush,
  submoduleVerdict,
  workerTestsCommand
} from '../check-push.mjs'

test('readRefs parses what git writes on stdin, and ignores blank lines', () => {
  const stdin = `refs/heads/main abc123 refs/heads/main def456\n\nrefs/heads/x 111 refs/heads/x 222\n`
  assert.deepEqual(readRefs(stdin), [
    { localRef: 'refs/heads/main', localSha: 'abc123', remoteRef: 'refs/heads/main', remoteSha: 'def456' },
    { localRef: 'refs/heads/x', localSha: '111', remoteRef: 'refs/heads/x', remoteSha: '222' }
  ])
})

test('readRefs on empty stdin is empty, not a crash', () => {
  assert.deepEqual(readRefs(''), [])
  assert.deepEqual(readRefs('\n\n'), [])
})

test('a delete is recognised by the local sha, not by the ref name', () => {
  assert.equal(isDelete(SHA_ZERO), true)
  assert.equal(isDelete('abc123'), false)
})

test('the two shared branches are guarded — a branch merely named after one is not', () => {
  assert.equal(isMain('refs/heads/main'), true)
  assert.equal(isMain('refs/heads/develop'), true)
  assert.equal(isMain('refs/heads/staging'), true)
  assert.equal(isMain('refs/heads/staging-old'), false)
  // `main-v3` was renamed to `main` on 15/09/2026 and no longer exists; a push that recreated it
  // would be a stray branch, not production, so it is not guarded as one.
  assert.equal(isMain('refs/heads/main-v3'), false)
  assert.equal(isMain('refs/heads/feat/main-menu'), false)
  assert.equal(isMain('refs/heads/mainline'), false)
  assert.equal(isMain('refs/heads/develop-x'), false)
  assert.equal(isMain('refs/tags/main'), false)
})

test('the suite runs for the three trees whose tests it is, and not for a docs-only push', () => {
  // `workers/` was one of them until 16/09/2026, when the Cloudflare Workers were deleted; `apps/`
  // took its place, and this line is what would have caught the glob and the list drifting apart.
  assert.equal(needsWorkerTests(['apps/tracy-web/src/app.js']), true)
  assert.equal(needsWorkerTests(['workers/cowork/src/index.js']), false)
  assert.equal(needsWorkerTests(['scripts/check-push.mjs']), true)
  assert.equal(needsWorkerTests(['packages/ui/tracy-ui/src/tokens.css']), true)
  assert.equal(needsWorkerTests(['tasks/nhat-ky-main.md', 'docs/adr/0014-x.md']), false)
  // Since 25/09/2026 a journal entry is its own file under `tasks/nhat-ky/`; writing one is not code.
  assert.equal(needsWorkerTests(['tasks/nhat-ky/2026-09-25-journal-fragments.md']), false)
  assert.equal(needsWorkerTests([]), false)
})

test('an unchanged submodule pointer says nothing', () => {
  assert.equal(submoduleVerdict({ before: 'aaa', after: 'aaa', relation: 'unchanged' }), null)
})

test('moving the submodule forward is ordinary work and passes', () => {
  assert.equal(submoduleVerdict({ before: 'aaa', after: 'bbb', relation: 'forward' }), null)
})

test('moving the submodule BACKWARDS blocks, and the message names both commits', () => {
  const verdict = submoduleVerdict({ before: 'aaaaaaa', after: 'bbbbbbb', relation: 'backward' })
  assert.equal(verdict?.level, 'block')
  assert.match(verdict.message, /aaaaaaa/)
  assert.match(verdict.message, /bbbbbbb/)
  assert.match(verdict.message, /git submodule update/)
})

test('an undecidable pointer warns instead of blocking — the hook says what it does not know', () => {
  const verdict = submoduleVerdict({ before: 'aaa', after: 'bbb', relation: 'unknown' })
  assert.equal(verdict?.level, 'warn')
  assert.match(verdict.message, /direction CANNOT be determined/)
  assert.match(verdict.message, /aaa/)
  assert.match(verdict.message, /bbb/)
})

/**
 * ⚠ MEASURED 2026-09-08, and the reason this whole seam exists: prek CONSUMES the pre-push stdin
 * to work out the range itself, then hands the hook nothing — `ARGS=[]`, `STDIN=[]` — and passes
 * `PRE_COMMIT_FROM_REF` / `PRE_COMMIT_TO_REF` / `PRE_COMMIT_REMOTE_BRANCH` instead. A hook that
 * only reads stdin therefore sees zero refs and passes EVERY push in silence: fail-open, in the
 * one gate whose whole job is to say no.
 */
test('the environment prek actually sets is read as one ref', () => {
  const env = {
    PRE_COMMIT_FROM_REF: 'aaa',
    PRE_COMMIT_TO_REF: 'bbb',
    PRE_COMMIT_REMOTE_BRANCH: 'refs/heads/main',
    PRE_COMMIT_LOCAL_BRANCH: 'refs/heads/main'
  }
  assert.deepEqual(refsFromEnv(env), [
    { localRef: 'refs/heads/main', localSha: 'bbb', remoteRef: 'refs/heads/main', remoteSha: 'aaa' }
  ])
})

test('a brand-new remote branch has no FROM_REF, and the zero sha says so rather than guessing', () => {
  const refs = refsFromEnv({ PRE_COMMIT_TO_REF: 'bbb', PRE_COMMIT_REMOTE_BRANCH: 'refs/heads/x' })
  assert.equal(refs[0].remoteSha, SHA_ZERO)
})

test('an environment that describes no push yields nothing to judge', () => {
  assert.deepEqual(refsFromEnv({}), [])
  assert.deepEqual(refsFromEnv({ PRE_COMMIT_TO_REF: 'bbb' }), [])
})

test('resolvePush prefers the environment, and falls back to raw stdin when run by git itself', () => {
  const env = {
    PRE_COMMIT_TO_REF: 'bbb',
    PRE_COMMIT_REMOTE_BRANCH: 'refs/heads/main',
    PRE_COMMIT_FROM_REF: 'aaa'
  }
  const stdin = 'refs/heads/other 111 refs/heads/other 222\n'
  assert.equal(resolvePush(env, stdin)[0].remoteRef, 'refs/heads/main')
  assert.equal(resolvePush({}, stdin)[0].remoteRef, 'refs/heads/other')
  assert.deepEqual(resolvePush({}, ''), [])
})

test('envWithoutGitLocation: a spawned test never inherits git\u2019s pointer at THIS repository', () => {
  // 08/09: with GIT_DIR inherited from the push, all seven tests of webroot-git.test.mjs failed —
  // they build a repository in a temp directory, and every `git` call went here instead. The gate
  // was red on every push touching `packages/`, and said the working tree was to blame.
  const env = envWithoutGitLocation({
    PATH: '/usr/bin',
    GIT_DIR: '/repo/.git',
    GIT_INDEX_FILE: '/repo/.git/index',
    GIT_WORK_TREE: '/repo',
    GIT_REFLOG_ACTION: 'push',
    GIT_SSH_COMMAND: 'ssh -i key',
    PRE_COMMIT_TO_REF: 'abc'
  })
  for (const name of GIT_LOCATION_VARS) assert.equal(env[name], undefined, name)
  assert.equal(env.PATH, '/usr/bin', 'nothing else is touched')
  assert.equal(env.GIT_SSH_COMMAND, 'ssh -i key', 'how git talks to a remote is not a location')
  assert.equal(env.PRE_COMMIT_TO_REF, 'abc')
})

test('the vocabulary gate runs for every tree it reads, and not for task or journal edits', () => {
  assert.equal(vocabularyVerdict(['packages/ui/tracy-ui/src/x.ts']).runGate, true)
  assert.equal(vocabularyVerdict(['docs/references/i18n.md']).runGate, true)
  assert.equal(vocabularyVerdict(['.agents/skills/tch-dev/SKILL.md']).runGate, true)
  assert.equal(vocabularyVerdict(['CLAUDE.md']).runGate, true)
  assert.equal(vocabularyVerdict(['tasks/nhat-ky/2026-09-27-x.md']).runGate, false)
  assert.equal(vocabularyVerdict([]).runGate, false)
})

test('a direct push that edits the vocabulary itself is flagged, and nothing else is', () => {
  assert.equal(vocabularyVerdict([VOCABULARY_DOC]).docChanged, true)
  assert.equal(vocabularyVerdict(['docs/references/i18n.md', 'apps/tracy-web/src/a.js']).docChanged, false)
  // A path that merely contains the name is a different file.
  assert.equal(vocabularyVerdict(['docs/references/vocabulary.md.bak']).docChanged, false)
})

test('the interface-language gate runs when a push touches anything it measures (#754)', () => {
  for (const file of [
    'packages/ui/tracy-sidebar/src/client/index.tsx',
    'packages/design/tracy-design-inspiration/src/client/api.ts',
    'packages/site/tracy-my-sites/cordis.patch.yml',
    'packages/bundle/tracy-native/package.json',
    'packages/locale/tracy-locales/es/tracy-settings.json',
    'packages/locale/tracy-locale-vi/vi/tracy-view.json',
    'packages/core/tracy-core/src/interface-languages/index.mjs',
    'packages/core/tracy-core/src/Cowork.tsx',
    'vendor/tracy/dsh-better-locale/src/client/dictionaries/de.ts',
    'vendor/tracy/dsh-locale-vi/locales/chat.json',
    'vendor/tracy/dsh-better-sidebar/src/client/locales-es.ts',
    'vendor/tracy/dsh-better-sidebar/src/client/chunks/locale.tsx',
    'scripts/locale-debt.json',
    'scripts/locale-sources.json',
    'scripts/check-interface-languages.ts',
    'scripts/lib/ui-literals.mjs',
    'vendor/tracy/deepseek-harness'
  ]) {
    assert.equal(needsInterfaceLanguages([file]), true, file)
  }
})

test('the interface-language gate stays out of pushes that cannot change its verdict', () => {
  for (const file of [
    'apps/tracy-web/src/identity/pages.js',
    'packages/ui/tracy-sidebar/src/host/index.ts',
    'packages/ui/tracy-sidebar/test/x.test.mjs',
    'vendor/tracy/dsh-better-sidebar/src/client/index.tsx',
    'vendor/tracy/deepseek-harness-notes.md',
    'docs/references/i18n.md',
    'tasks/nhat-ky/2026-10-02-x.md'
  ]) {
    assert.equal(needsInterfaceLanguages([file]), false, file)
  }
  assert.equal(needsInterfaceLanguages([]), false)
})

test('without a local dsh build the gate is skipped with a notice, never a block', () => {
  const touched = ['packages/locale/tracy-locales/fr/tracy-view.json']
  assert.deepEqual(interfaceLanguagesVerdict(touched, true), { run: true, notice: null })
  const skipped = interfaceLanguagesVerdict(touched, false)
  assert.equal(skipped.run, false)
  assert.match(skipped.notice ?? '', /SKIPPED/)
  assert.match(skipped.notice ?? '', /pnpm dsh:build/)
  assert.ok((skipped.notice ?? '').includes(DSH_BUILT_MARKER))
  // Nothing measured was touched: no run, and nothing to say either way.
  assert.deepEqual(interfaceLanguagesVerdict(['docs/a.md'], false), { run: false, notice: null })
})

/**
 * Which command runs the workers suite. The hook spawning it, once, with the right environment, is
 * witnessed in `check-prepush-postgres.test.mjs`; this is the decision alone.
 */
test('with no opt-in the suite is the raw one, and unset, empty and 0 all mean that', () => {
  for (const env of [
    {},
    { [POSTGRES_OPT_IN]: undefined },
    { [POSTGRES_OPT_IN]: '' },
    { [POSTGRES_OPT_IN]: '0' }
  ]) {
    const command = workerTestsCommand(env)
    assert.equal(command.ok, true)
    assert.equal(command.postgres, false)
    assert.deepEqual([command.command, ...command.args], ['pnpm', 'test:workers'])
  }
})

test('exactly 1 selects the wrapper, narrowed to workers and to a database of its own', () => {
  const command = workerTestsCommand({ [POSTGRES_OPT_IN]: '1' })
  assert.equal(command.ok, true)
  assert.equal(command.postgres, true)
  assert.deepEqual(
    [command.command, ...command.args],
    ['pnpm', 'exec', 'tsx', 'scripts/check-tests.ts', '--part', 'workers', '--database', 'owned']
  )
  // An unrelated variable that merely looks like consent is not consent.
  assert.equal(
    workerTestsCommand({ TRACY_PRE_PUSH_POSTGRESQL: '1', TEST_DATABASE_URL: 'postgres://x' }).postgres,
    false
  )
})

test('the returned argv is a copy: a caller editing it cannot change the next push', () => {
  workerTestsCommand({ [POSTGRES_OPT_IN]: '1' }).args.push('--part', 'rest')
  assert.equal(workerTestsCommand({ [POSTGRES_OPT_IN]: '1' }).args.length, 7)
})

test('any other value is refused with a message naming the variable and both valid spellings', () => {
  for (const value of [
    'true',
    'false',
    'yes',
    'no',
    'on',
    'off',
    '2',
    '-1',
    '01',
    '00',
    '1 ',
    ' 1',
    '1\n',
    'owned'
  ]) {
    const command = workerTestsCommand({ [POSTGRES_OPT_IN]: value })
    assert.equal(command.ok, false, JSON.stringify(value))
    assert.equal(command.command, undefined, 'a refusal carries nothing to run')
    assert.match(command.message, /TRACY_PRE_PUSH_POSTGRES=/)
    assert.match(command.message, /exactly 1/)
    assert.match(command.message, /pnpm test:workers/)
  }
})

test('the suite never inherits the pushing shell’s database url, nor git’s pointers, on either path', () => {
  const shell = {
    PATH: '/usr/bin',
    TEST_DATABASE_URL: 'postgres://someone:else@db.example.invalid/theirs',
    GIT_DIR: '/repo/.git',
    [POSTGRES_OPT_IN]: '1'
  }
  const env = envForWorkerTests(shell)
  assert.equal('TEST_DATABASE_URL' in env, false)
  assert.equal('GIT_DIR' in env, false)
  assert.equal(env.PATH, '/usr/bin', 'everything else is passed on')
  assert.equal(env[POSTGRES_OPT_IN], '1')
  assert.equal(
    shell.TEST_DATABASE_URL.startsWith('postgres://'),
    true,
    'the caller’s own object is not edited'
  )
  // An empty value is still a value the suites would read; it goes too.
  assert.equal('TEST_DATABASE_URL' in envForWorkerTests({ TEST_DATABASE_URL: '' }), false)
})
