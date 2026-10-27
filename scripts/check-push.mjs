#!/usr/bin/env node
/**
 * The pre-push gate: what must be true before a push, judged from git alone.
 *
 *   git push …                      # run by prek as the pre-push hook
 *   node scripts/check-push.mjs     # same thing, reading the same stdin, for debugging
 *
 * WHY A LOCAL HOOK EXISTS AT ALL, WHEN THERE IS CI. Because CI cannot say no. `TracyHQ` is on the
 * free plan and this repo is private, so `rulesets` and `branches/main/protection` both answer
 * 403: THERE IS NO BRANCH PROTECTION AND THERE CANNOT BE ONE. Every CI verdict here arrives after
 * the commit is already on `main`, where the only remedy is another commit. Measured 05–06/09:
 * the changelog gate went red on real content, repeatedly, and the pushes stayed. A gate that can
 * only complain afterwards is an alarm, not a lock. This is the lock, and it works because every
 * session in this project runs on the same machine.
 *
 * WHY IT IS DELIBERATELY SMALL. `.pre-commit-config.yaml` argues the case for commit hooks and it
 * applies here too: a hook that costs a minute is a hook people pass `--no-verify` to, and a
 * bypassed hook guards nothing. So this one does not re-run CI. It checks what CI cannot check in
 * time, plus the one invariant `CLAUDE.md` says NO GATE CATCHES — a submodule pointer dragged
 * backwards, which cost the repo a silent regression on 04/09 at `606c6d82`.
 *
 * WHAT IT DOES NOT DO, said out loud:
 *   - It does not run the 26 gates. That is `pnpm build:check`, and CI runs it on what you pushed.
 *   - It reads the WORKING TREE for `pnpm test:workers`, and this checkout is shared by parallel
 *     sessions. A red there may be someone else's uncommitted work; the message says so.
 *   - By default that suite runs WITHOUT a database, so the tests that need PostgreSQL skip
 *     themselves — an exported `TEST_DATABASE_URL` is taken out, not used (`envForWorkerTests`).
 *     `TRACY_PRE_PUSH_POSTGRES=1` runs them too — see `workerTestsCommand`.
 *   - `--no-verify` skips it entirely, and nothing here pretends otherwise.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { warnOnPush } from './check-branch-fresh.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** The all-zero sha git writes for a ref that is being created or deleted. */
export const SHA_ZERO = '0000000000000000000000000000000000000000'

/** The submodule whose pointer has silently travelled backwards once already. */
const SUBMODULE = 'vendor/tracy/deepseek-harness'

/** Trees whose tests `pnpm test:workers` actually runs. Touch one, run them. (The script keeps its
 * name from the days it ran the Cloudflare Workers' suite; those were deleted 16/09/2026 and the
 * glob now names `apps/`, `scripts/` and `packages/`.) */
const TESTED_TREES = ['apps/', 'scripts/', 'packages/']

/**
 * The refs git is offering, one per stdin line: `<local ref> <local sha> <remote ref> <remote sha>`.
 * @param {string} stdin - raw stdin handed to the hook.
 * @returns {{localRef: string, localSha: string, remoteRef: string, remoteSha: string}[]} one per line.
 */
export function readRefs(stdin) {
  return stdin
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => {
      const [localRef, localSha, remoteRef, remoteSha] = line.split(/\s+/)
      return { localRef, localSha, remoteRef, remoteSha }
    })
}

/**
 * The same refs, read from the environment prek hands a `pre-push` hook.
 *
 * 🔒 THIS IS THE PATH THAT ACTUALLY RUNS. prek reads the pre-push stdin itself to work out the
 * range, and gives the hook `ARGS=[]` and `STDIN=[]` — measured 08/09. A hook that only parses
 * stdin therefore sees no refs and lets every push through without a word, which is the exact
 * fail-open shape this repo refuses everywhere else. stdin stays supported for the day someone
 * wires this into `.git/hooks/pre-push` directly, or runs it by hand.
 *
 * @param {Record<string, string | undefined>} env - the process environment.
 * @returns {{localRef: string, localSha: string, remoteRef: string, remoteSha: string}[]} one ref, or none.
 */
export function refsFromEnv(env) {
  const localSha = env.PRE_COMMIT_TO_REF
  const remoteRef = env.PRE_COMMIT_REMOTE_BRANCH
  if (localSha === undefined || remoteRef === undefined) return []
  return [
    {
      localRef: env.PRE_COMMIT_LOCAL_BRANCH ?? remoteRef,
      localSha,
      remoteRef,
      // A branch that does not exist on the remote yet has no base, and the zero sha is how the
      // rest of this file already says "nothing to compare against".
      remoteSha: env.PRE_COMMIT_FROM_REF ?? SHA_ZERO
    }
  ]
}

/**
 * The refs of this push, from wherever they are available.
 * @param {Record<string, string | undefined>} env - the process environment.
 * @param {string} stdin - raw stdin, used only when the environment says nothing.
 * @returns {{localRef: string, localSha: string, remoteRef: string, remoteSha: string}[]} the refs.
 */
export function resolvePush(env, stdin) {
  const fromEnv = refsFromEnv(env)
  return fromEnv.length > 0 ? fromEnv : readRefs(stdin)
}

/**
 * Is this ref being deleted? A delete carries no content, so there is nothing to judge.
 * @param {string} localSha - the local sha git offered.
 * @returns {boolean} true when the push deletes the remote ref.
 */
export function isDelete(localSha) {
  return localSha === SHA_ZERO
}

/**
 * The shared branches — the ones the changelog and test rules below guard. The same three the
 * judging workflows name (`tracy-ci.yml` and friends): `main` is production for the tracy-web
 * architecture — a push to it deploys prod1 — and `develop` is where everyone works. Until
 * 15/09/2026 there was a third, `main-v3`, which carried production while `main` was the frozen
 * seven-Worker line; that day `main-v3` was renamed to `main` and the old `main` to `main-old`. Until 14/09 this
 * hook, like the workflows, guarded `main` alone — a push to `develop` touching `packages/` with
 * no changelog entry went through without a word. `staging` joined on 06/10/2026: it sits between
 * the two, and a push to it deploys the staging host.
 */
const SHARED_BRANCHES = new Set(['refs/heads/main', 'refs/heads/staging', 'refs/heads/develop'])

/**
 * Is the ref being written one of the shared branches? Matched whole, so `mainline`,
 * `feat/main-menu` and `develop-x` are not.
 * @param {string} remoteRef - the ref on the remote this push writes.
 * @returns {boolean} true only for `refs/heads/main`, `refs/heads/staging` and `refs/heads/develop`.
 */
export function isMain(remoteRef) {
  return SHARED_BRANCHES.has(remoteRef)
}

/**
 * Does this range oblige `pnpm test:workers`? Only for the trees whose tests it runs.
 * @param {string[]} files - paths changed in the pushed range.
 * @returns {boolean} true when at least one path is in a tested tree.
 */
export function needsWorkerTests(files) {
  return files.some((file) => TESTED_TREES.some((tree) => file.startsWith(tree)))
}

/** The variable that asks the hook for the database-backed run of the same suite. */
export const POSTGRES_OPT_IN = 'TRACY_PRE_PUSH_POSTGRES'

/** `scripts/check-tests.ts` narrowed to the workers suite, on a database it creates and removes itself. */
const POSTGRES_WRAPPER = ['exec', 'tsx', 'scripts/check-tests.ts', '--part', 'workers', '--database', 'owned']

/**
 * The command that runs the workers suite for this push.
 *
 * WHY THERE ARE TWO. Raw `pnpm test:workers` gives the suites no database, and the files under
 * `apps/tracy-web/test/` that need one print `# SKIP` and exit 0 — the hook then says green for
 * tests that did not run. `scripts/check-tests.ts` is the wrapper that supplies one, and
 * `--database owned` makes it use a PostgreSQL it creates and removes itself, so the push never
 * touches the `TEST_DATABASE_URL` of whoever's shell this is.
 *
 * WHY THE DATABASE RUN IS NOT THE DEFAULT. The rule set when this step was planned: it becomes the
 * blocking path only with a real measured run adding at most 60 seconds to a push (the top of this
 * file says what a slower hook turns into). Measured 05/10/2026 on the shared dev Mac, twice, against
 * a PostgreSQL made for the measurement: raw 204 s and 218 s, with the database 278 s and 280 s —
 * 73 s and 62 s more, both over the limit. The raw run skipped 1112 tests, 1084 of them for want of
 * a database; with one, 4 were skipped and none for that reason. So the tests are worth running and
 * too slow to impose: opt-in. The `owned` path itself could not be timed that day — another run's
 * container had held port 55432 for two days, and the wrapper refused, as it must.
 *
 * 🔒 ONLY `1` TURNS IT ON, AND A VALUE NOBODY DEFINED BLOCKS. Unset, empty and `0` mean the raw
 * suite. Anything else (`true`, `yes`, `01`, a trailing space) is refused rather than guessed: read
 * as "on" it starts a container nobody asked for, read as "off" it runs fewer tests than the person
 * pushing believes.
 *
 * @param {Record<string, string | undefined>} env - the process environment.
 * @returns {{ok: true, postgres: boolean, command: string, args: string[], label: string} | {ok: false, message: string}}
 *   the command, or why the push is refused.
 */
export function workerTestsCommand(env) {
  const raw = env[POSTGRES_OPT_IN]
  if (raw === undefined || raw === '' || raw === '0') {
    return { ok: true, postgres: false, command: 'pnpm', args: ['test:workers'], label: 'pnpm test:workers' }
  }
  if (raw === '1') {
    return {
      ok: true,
      postgres: true,
      command: 'pnpm',
      args: [...POSTGRES_WRAPPER],
      label: `pnpm ${POSTGRES_WRAPPER.join(' ')}`
    }
  }
  return {
    ok: false,
    message:
      `${POSTGRES_OPT_IN}=${JSON.stringify(raw)} is not a value this hook knows, so no test ran.\n` +
      `Set it to exactly 1 for the database-backed run (\`pnpm ${POSTGRES_WRAPPER.join(' ')}\`), ` +
      'or unset it (empty and 0 mean the same) for `pnpm test:workers`.'
  }
}

/** The vocabulary rules and the closed package list — changes to it go through a pull request. */
export const VOCABULARY_DOC = 'docs/references/vocabulary.md'

/** Paths `check-vocabulary.ts` reads; a push touching none of them cannot turn it red. */
const VOCABULARY_TREES = [
  'apps/',
  'packages/',
  'scripts/',
  'docs/',
  '.agents/skills/',
  'CLAUDE.md',
  'CONTEXT.md',
  'DESIGN.md'
]

/**
 * What a push to a shared branch owes the vocabulary rules.
 *
 * The gate itself already runs in CI, but CI only runs on pull requests, and most pushes to
 * `develop` are direct — so a coined word would land unseen. The second rule is the one CI cannot
 * hold at all: adding a word to the closed list is a decision a reviewer must see, and a direct
 * push is by definition one nobody reviewed. A pull request merged on GitHub never runs this hook.
 * @param {string[]} files - paths changed in the pushed range.
 * @returns {{runGate: boolean, docChanged: boolean}} whether to run the gate, and whether the
 *   push edits the vocabulary itself.
 */
export function vocabularyVerdict(files) {
  return {
    runGate: files.some((file) => VOCABULARY_TREES.some((tree) => file.startsWith(tree))),
    docChanged: files.includes(VOCABULARY_DOC)
  }
}

/**
 * What `scripts/check-interface-languages.ts` measures (#754), as path tests. A push touching none
 * of them cannot change its verdict. It reads every Tracy plugin's client code and all of
 * `@tracy/core/src` (bare English), the Tracy and vendored locale packages (translations), the
 * bundles and plugin manifests (which dsh plugins are loaded, so which English is measured), its
 * own ledger and fingerprints, its own code, and dsh itself through the submodule pointer.
 */
const INTERFACE_LANGUAGE_PATHS = [
  /^packages\/[^/]+\/[^/]+\/src\/client\//,
  /^packages\/[^/]+\/[^/]+\/cordis\.patch\.yml$/,
  /^packages\/bundle\//,
  /^packages\/locale\//,
  /^packages\/core\/tracy-core\/src\//,
  /^vendor\/tracy\/dsh-better-locale\//,
  /^vendor\/tracy\/dsh-locale-vi\//,
  /^vendor\/tracy\/dsh-better-sidebar\/src\/client\/(locales|chunks\/locale)/,
  /^scripts\/locale-[^/]+\.json$/,
  /^scripts\/check-interface-languages\.ts$/,
  /^scripts\/lib\/(ui-literals|locale-ledger)\.mjs$/,
  /^scripts\/lib\/tracy-owned-namespaces\.ts$/,
  new RegExp(`^${SUBMODULE.replaceAll('/', '\\/')}$`)
]

/**
 * Does this range oblige the interface-language gate?
 *
 * Tracy CI runs that gate on pull requests only (a team decision, CLAUDE.md §6), so a direct push
 * to `develop` or `main` would land an untranslated string with no gate ever reading it. This is
 * the gate's seat on that road.
 * @param {string[]} files - paths changed in the pushed range.
 * @returns {boolean} true when at least one path is something the gate measures.
 */
export function needsInterfaceLanguages(files) {
  return files.some((file) => INTERFACE_LANGUAGE_PATHS.some((path) => path.test(file)))
}

/** The file that exists only once `pnpm dsh:build` has run: the CLI the gate asks `--dump-config`. */
export const DSH_BUILT_MARKER = 'node_modules/@deepseek-ai/dsh/lib/bin.js'

/**
 * Whether to run the interface-language gate, and what to say when it cannot run.
 *
 * ⚠ A MISSING LOCAL BUILD SKIPS, LOUDLY; IT DOES NOT BLOCK. The gate asks the built dsh which
 * plugins load and reads their built bundles; a checkout that never ran `pnpm dsh:build` cannot
 * answer, and refusing the push for that teaches `--no-verify`, which then skips every OTHER check
 * here too. The skip is printed, so the push is not mistaken for a measured one.
 * @param {string[]} files - paths changed in the pushed range.
 * @param {boolean} dshBuilt - whether {@link DSH_BUILT_MARKER} exists in the checkout.
 * @returns {{run: boolean, notice: string | null}} run the gate, or the notice to print instead.
 */
export function interfaceLanguagesVerdict(files, dshBuilt) {
  if (!needsInterfaceLanguages(files)) return { run: false, notice: null }
  if (dshBuilt) return { run: true, notice: null }
  return {
    run: false,
    notice:
      'pre-push: check-interface-languages SKIPPED — this push touches what it measures, but dsh is ' +
      `not built here (${DSH_BUILT_MARKER} is missing).\n` +
      '   The push is NOT checked for untranslated strings. Run `pnpm dsh:build` and push again, or ' +
      'open a pull request so Tracy CI measures it.'
  }
}

/**
 * What a submodule pointer move means. The policy, kept away from git so it can be tested.
 *
 * ⚠ BACKWARDS BLOCKS, UNKNOWN ONLY WARNS. The failure this exists for is invisible: a checkout
 * that never ran `git submodule update` still holds the OLD pointer, and `git add -A` packages
 * that staleness as a deliberate-looking change. `git status` shows one line that looks like
 * every other line. But when the objects to compare are not in the local submodule clone, the
 * hook genuinely cannot tell forward from backward — and blocking on what it cannot determine is
 * how a hook earns `--no-verify`.
 *
 * @param {{before: string, after: string, relation: 'unchanged'|'forward'|'backward'|'unknown'}} move - the pointer move.
 * @returns {{level: 'block'|'warn', message: string} | null} null when there is nothing to say.
 */
export function submoduleVerdict({ before, after, relation }) {
  if (relation === 'unchanged' || relation === 'forward') return null
  if (relation === 'backward') {
    return {
      level: 'block',
      message:
        `${SUBMODULE} was moved BACKWARDS: ${before} → ${after}.\n` +
        `Your tree kept the old pointer because \`git submodule update\` was not run, and a \`git add -A\` ` +
        `just packaged it as a change that looks deliberate.\n` +
        `Fix: \`git submodule update\`, then commit the pointer again. If going back is really intended, use \`--no-verify\`.`
    }
  }
  return {
    level: 'warn',
    message:
      `${SUBMODULE} moved its pointer ${before} → ${after}, but the direction CANNOT be determined — ` +
      `the local submodule clone lacks one of the two commits. Run \`git submodule update\` and push again ` +
      `if you did not mean to change it.`
  }
}

/** @param {string[]} args @param {string} [cwd] @returns {string} stdout, trimmed. */
function git(args, cwd = ROOT) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
}

/**
 * The submodule sha recorded in a commit, or null when the commit has no such entry.
 * @param {string} commit - a commit-ish.
 * @returns {string | null} the gitlink sha.
 */
function submoduleAt(commit) {
  try {
    const line = git(['ls-tree', commit, SUBMODULE])
    const match = /^\d+ commit ([0-9a-f]{40})\t/.exec(line)
    return match === null ? null : match[1]
  } catch {
    return null
  }
}

/**
 * Which way the pointer moved, asked of the submodule's own clone.
 * @param {string} before - sha on the remote.
 * @param {string} after - sha being pushed.
 * @returns {'unchanged'|'forward'|'backward'|'unknown'} the relation.
 */
function submoduleRelation(before, after) {
  if (before === after) return 'unchanged'
  const dir = resolve(ROOT, SUBMODULE)
  const isAncestor = (a, b) => spawnSync('git', ['merge-base', '--is-ancestor', a, b], { cwd: dir }).status
  // Ask the cheap direction first: `after` behind `before` is the failure this gate exists for.
  if (isAncestor(after, before) === 0) return 'backward'
  if (isAncestor(before, after) === 0) return 'forward'
  return 'unknown'
}

/**
 * The variables git exports into a hook to point `git` at the repository it is working on. They are
 * inherited by everything the hook spawns, and a test that builds its own repository in a temp
 * directory then finds every `git` call redirected here instead.
 *
 * 🔒 Measured 08/09: with `GIT_DIR` inherited, all seven tests of
 * `packages/fleet/tracy-fleet-operation/test/webroot-git.test.mjs` fail — so this gate was red on
 * EVERY push touching `packages/`, whatever the change was, and the message blamed the working
 * tree. A gate that cannot be satisfied is a gate everyone learns to `--no-verify` past.
 */
export const GIT_LOCATION_VARS = [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_COMMON_DIR',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_PREFIX',
  'GIT_REFLOG_ACTION'
]

/**
 * The environment a spawned command should see: this one, minus git's pointers at THIS repository.
 * @param {NodeJS.ProcessEnv} env @returns {NodeJS.ProcessEnv} a copy without the location vars.
 */
export function envWithoutGitLocation(env) {
  const out = { ...env }
  for (const name of GIT_LOCATION_VARS) delete out[name]
  return out
}

/**
 * The environment the workers suite gets from the hook, on EITHER path: no git pointers, and no
 * `TEST_DATABASE_URL`.
 *
 * 🔒 THE PUSHING SHELL'S DATABASE IS NOT THE HOOK'S TO USE. The database-gated tests read that one
 * variable, then create and drop schemas wherever it points. Passed through, the default path —
 * documented as running with no database — would run them against whatever the shell that pushed
 * had exported: another session's stand, or a customer's. So it is removed here rather than trusted
 * to be unset. The opt-in path loses it too (`--database owned` would drop it anyway) and gets back
 * only the url of the container that run created.
 *
 * ⚠ This covers the hook only. `pnpm test:workers` typed by hand still reads the variable of the
 * shell it is typed in.
 *
 * @param {NodeJS.ProcessEnv} env @returns {NodeJS.ProcessEnv} a copy without those variables.
 */
export function envForWorkerTests(env) {
  const out = envWithoutGitLocation(env)
  delete out.TEST_DATABASE_URL
  return out
}

/**
 * Run one command, streaming its output, and say whether it passed.
 * @param {string} command @param {string[]} args
 * @param {NodeJS.ProcessEnv} [env] - what the command sees; by default this process minus git's pointers.
 * @returns {boolean} true on exit code 0.
 */
function run(command, args, env = envWithoutGitLocation(process.env)) {
  return spawnSync(command, args, { cwd: ROOT, stdio: 'inherit', env }).status === 0
}

function main() {
  // stdin is only read when the environment is silent: prek has already drained it, and reading
  // an empty fd 0 is instant, but a plain `.git/hooks/pre-push` still feeds it the real thing.
  const stdin = process.env.PRE_COMMIT_TO_REF === undefined ? readFileSync(0, 'utf8') : ''
  const refs = resolvePush(process.env, stdin)
  const loi = []
  let daChayTest = false
  let daChayTuVung = false
  let daChayNgonNgu = false

  for (const { localSha, remoteRef, remoteSha } of refs) {
    if (isDelete(localSha)) continue

    // The submodule check runs on EVERY branch: a pointer dragged backwards is wrong wherever it
    // lands, and catching it on a feature branch is catching it before anyone else pays for it.
    if (!isDelete(remoteSha)) {
      const before = submoduleAt(remoteSha)
      const after = submoduleAt(localSha)
      if (before !== null && after !== null) {
        const verdict = submoduleVerdict({ before, after, relation: submoduleRelation(before, after) })
        if (verdict?.level === 'block') loi.push(verdict.message)
        else if (verdict?.level === 'warn') process.stderr.write(`\n⚠ ${verdict.message}\n`)
      }
    }

    // A personal branch far behind `develop` is warned about, never refused: a push is how unfinished
    // work is saved. The red verdict waits for Ready for review (`check-branch-fresh.mjs`).
    if (!isMain(remoteRef)) {
      warnOnPush(localSha)
      continue
    }

    // A brand-new shared branch has no base to compare against, and guessing one is worse than not guarding.
    if (isDelete(remoteSha)) continue

    // 🔒 THE CHANGELOG RULE IS NOT COPIED HERE. `check-changelog.mjs` already holds it, reads a
    // push payload, and is what CI runs — so the hook hands it the same shape rather than growing
    // a second copy that drifts. Two gates disagreeing about the rule is worse than one gate.
    const payload = resolve(mkdtempSync(join(tmpdir(), 'tch-push-')), 'payload.json')
    writeFileSync(payload, JSON.stringify({ before: remoteSha, after: localSha }))
    const changelog = spawnSync(process.execPath, [resolve(ROOT, 'scripts/check-changelog.mjs'), payload], {
      cwd: ROOT,
      encoding: 'utf8'
    })
    process.stdout.write(changelog.stdout ?? '')
    if (changelog.status !== 0) loi.push(`${changelog.stderr ?? ''}`.trim())

    const files = git(['diff', '--name-only', `${remoteSha}..${localSha}`])
      .split('\n')
      .filter(Boolean)

    // CLAUDE.md §5 step 2: `pnpm test:workers` before every deploy, and merging into `main` IS the
    // deploy. Only when the push touches a tree these tests cover. (It was seven seconds when this
    // was written; 204 s measured 05/10/2026, which is why nothing slower is added by default.)
    if (!daChayTest && needsWorkerTests(files)) {
      daChayTest = true
      const tests = workerTestsCommand(process.env)
      if (!tests.ok) loi.push(tests.message)
      else {
        process.stdout.write(`\npre-push: ${tests.label} (CLAUDE.md §5 step 2)\n`)
        if (!run(tests.command, tests.args, envForWorkerTests(process.env))) {
          loi.push(
            `${tests.label} is red.\n` +
              (tests.postgres
                ? `(${POSTGRES_OPT_IN}=1: a database that could not be started is red too — the lines ` +
                  'above say which it was.)\n'
                : '') +
              '⚠ This gate reads the WORKING TREE, and this checkout is shared with other sessions — check ' +
              '`git status` before concluding the failure is yours.'
          )
        }
      }
    }

    const vocabulary = vocabularyVerdict(files)
    if (vocabulary.docChanged) {
      loi.push(
        `${VOCABULARY_DOC} changed in a direct push to ${remoteRef.replace('refs/heads/', '')}.\n` +
          'A new or renamed word is decided in review: open a pull request and merge it on GitHub ' +
          `(${VOCABULARY_DOC} §10).`
      )
    }
    if (!daChayTuVung && vocabulary.runGate) {
      daChayTuVung = true
      process.stdout.write('\npre-push: check-vocabulary (docs/references/vocabulary.md)\n')
      if (!run('pnpm', ['exec', 'tsx', 'scripts/check-vocabulary.ts'])) {
        loi.push(
          'check-vocabulary is red: a banned or coined word, or a package name outside ' +
            `${VOCABULARY_DOC} §9.\n` +
            '⚠ It reads the WORKING TREE, which parallel sessions share — check `git status` first.'
        )
      }
    }

    const languages = interfaceLanguagesVerdict(files, existsSync(resolve(ROOT, DSH_BUILT_MARKER)))
    if (languages.notice !== null && !daChayNgonNgu) {
      daChayNgonNgu = true
      process.stderr.write(`\n⚠ ${languages.notice}\n`)
    }
    if (!daChayNgonNgu && languages.run) {
      daChayNgonNgu = true
      process.stdout.write('\npre-push: check-interface-languages (docs/references/i18n.md §6.2)\n')
      if (!run('pnpm', ['exec', 'tsx', 'scripts/check-interface-languages.ts'])) {
        loi.push(
          'check-interface-languages is red: an English string without its translations, a bare ' +
            'English literal, or a stale ledger row (docs/references/i18n.md §6.2–6.3).\n' +
            '⚠ It reads the WORKING TREE, which parallel sessions share — check `git status` first.'
        )
      }
    }

    if (files.some((file) => file.startsWith('packages/') || file.startsWith('apps/'))) {
      process.stderr.write(
        '\n📣 This push touches `packages/` or `apps/`, so merging into `main` IS A DEPLOY ' +
          '(CLAUDE.md §5).\n   CI builds the images and deploys to prod1; check with ' +
          '`deploy/scripts/check-server.sh`, then `curl` the page itself.\n' +
          '   Full procedure: skill `pr-merge`.\n'
      )
    }
  }

  if (loi.length > 0) {
    process.stderr.write(`\n❌ pre-push blocked this push:\n\n${loi.join('\n\n')}\n\n`)
    process.stderr.write(
      'To skip it on purpose, use `git push --no-verify` and take responsibility for that push.\n'
    )
    process.exit(1)
  }
}

// Only run when invoked as a script: the tests import the policy above and must not trip the hook.
if (process.argv[1] !== undefined && resolve(process.argv[1]).endsWith('check-push.mjs')) main()
