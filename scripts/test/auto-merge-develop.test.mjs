import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  authorRefusal,
  eligible,
  FILES_LIMIT,
  sensitiveFile,
  sensitivePatterns,
  gateScripts,
  trustedSensitivePatterns,
  changesRequested,
  approvedOnHead,
  mergeCandidates,
  readPull,
  recoveryCandidates,
  REPO
} from '../auto-merge-develop.mjs'
import { WORKFLOWS } from '../check-pr-merge.mjs'

const head = 'a'.repeat(40)
const pr = () => ({
  number: 1052,
  state: 'open',
  draft: false,
  merged: false,
  head: { sha: head, repo: { full_name: REPO } },
  base: { ref: 'develop', repo: { full_name: REPO } },
  mergeable: true,
  mergeable_state: 'clean',
  requested_reviewers: [],
  requested_teams: [],
  user: { login: 'dev', type: 'User' },
  author_association: 'MEMBER',
  changed_files: 1
})
const appFiles = () => [{ filename: 'apps/tracy-web/src/lib/x.js', status: 'modified' }]
/** A fake GitHub read: reviews, the files listing, else the PR. */
const reader =
  ({ reviews = [], files = appFiles, pull = pr } = {}) =>
  async (endpoint) =>
    endpoint.includes('/reviews?') ? reviews : endpoint.includes('/files?') ? files() : pull()
const review = (id, state, user = 1) => ({ id, state, user: { id: user } })

function stand({
  code = 0,
  change,
  reviews = [],
  files = appFiles,
  lateFiles,
  dryRun = false,
  requireApproval = false
} = {}) {
  const calls = []
  // `change` and `lateFiles` are what GitHub answers once the gate has started.
  const listing = () => (calls.length > 0 && lateFiles ? lateFiles() : files())
  const get = reader({
    reviews,
    files: listing,
    pull: () => (calls.length > 0 && change ? change : { ...pr(), changed_files: listing().length })
  })
  const run = async (bin, args, token) => {
    calls.push({ bin, args, token })
    if (bin === 'gh') return { code: 0, out: '' }
    if (args.includes('--expected-head')) return { code: 0, out: `${head}\n` }
    return { code, out: code === 0 ? '{"verdict":"PASS"}\n' : '' }
  }
  return {
    calls,
    go: () =>
      mergeCandidates({
        numbers: [1052],
        get,
        run,
        dryRun,
        requireApproval,
        readToken: 'read-only',
        mergeToken: 'app-write'
      })
  }
}

test('automatic merge is restricted to ready same-repository develop PRs with known clean mergeability', () => {
  assert.equal(eligible(pr()), true)
  for (const base of ['main', 'staging'])
    assert.equal(eligible({ ...pr(), base: { ...pr().base, ref: base } }), false)
  for (const patch of [
    { draft: true },
    { state: 'closed' },
    { merged: true },
    { mergeable: null },
    { mergeable_state: 'blocked' },
    { requested_reviewers: [{}] },
    { requested_teams: [{}] },
    { head: { sha: head, repo: { full_name: 'outside/tch' } } }
  ])
    assert.equal(eligible({ ...pr(), ...patch }), false)
})

test('review requests and the latest changes-requested decision prevent automatic merge', async () => {
  assert.equal(changesRequested([review(1, 'CHANGES_REQUESTED'), review(2, 'COMMENTED')]), true)
  assert.equal(changesRequested([review(1, 'CHANGES_REQUESTED'), review(2, 'APPROVED')]), false)
  assert.equal(changesRequested([review(1, 'CHANGES_REQUESTED'), review(2, 'DISMISSED')]), false)
  assert.equal(changesRequested([review(1, 'APPROVED'), review(2, 'CHANGES_REQUESTED')]), true)
  const s = stand({ reviews: [review(1, 'CHANGES_REQUESTED')] })
  assert.equal((await s.go())[0].status, 'not-eligible')
  assert.deepEqual(s.calls, [])
})

test('a green guard is validated before exact-head merge and only the merge uses the App token', async () => {
  const s = stand()
  assert.equal((await s.go())[0].status, 'merged')
  assert.equal(s.calls.length, 5)
  assert.equal(s.calls[0].token, 'read-only')
  assert.equal(s.calls[1].token, 'read-only')
  assert.ok(s.calls[1].args.includes('--expected-head'))
  assert.equal(s.calls[2].token, 'read-only')
  assert.equal(s.calls[3].token, 'read-only')
  assert.deepEqual(s.calls[4], {
    bin: 'gh',
    args: ['pr', 'merge', '1052', '--repo', REPO, '--merge', '--match-head-commit', head],
    token: 'app-write'
  })
})

test('FAIL and UNKNOWN guards never invoke expected-head validation or merge', async () => {
  for (const code of [1, 3]) {
    const s = stand({ code })
    assert.equal((await s.go())[0].status, 'checks-not-confirmed')
    assert.equal(s.calls.length, 1)
  }
})

test('draft, review, branch and head changes after the gate prevent merge', async () => {
  for (const change of [
    { ...pr(), draft: true },
    { ...pr(), requested_reviewers: [{}] },
    { ...pr(), base: { ...pr().base, ref: 'main' } },
    { ...pr(), head: { ...pr().head, sha: 'b'.repeat(40) } }
  ]) {
    const s = stand({ change })
    assert.equal((await s.go())[0].status, 'changed-after-check')
    assert.equal(s.calls.length, 2)
  }
})

test('dry-run verifies gates but cannot mutate and an apply requires a separate App token', async () => {
  const s = stand({ dryRun: true })
  assert.equal((await s.go())[0].status, 'would-merge')
  assert.equal(s.calls.length, 4)
  for (const mergeToken of [undefined, 'read-only'])
    await assert.rejects(
      mergeCandidates({ numbers: [], dryRun: false, readToken: 'read-only', mergeToken }),
      /separate GitHub App/
    )
})

test('workflow uses default-branch code, a serialized GitHub-hosted runner and scoped App permissions', () => {
  const yml = readFileSync(new URL('../../.github/workflows/auto-merge-develop.yml', import.meta.url), 'utf8')
  for (const workflow of WORKFLOWS) assert.ok(yml.includes(workflow.name))
  assert.ok(yml.indexOf('Prepare GitHub CLI') < yml.indexOf('Create repository-scoped merge token'))
  assert.match(yml, /sha256sum --check/)
  assert.match(yml, /cli\/cli\/releases\/download\/v2\.102\.0/)
  assert.match(yml, /ref: \$\{\{ github.event.repository.default_branch \}\}/)
  assert.match(yml, /persist-credentials: false/)
  assert.ok(
    yml.includes(
      "if: vars.TRACY_AUTO_MERGE_DEVELOP == 'true' || (github.event_name == 'workflow_dispatch' && inputs.dry_run == true)"
    )
  )
  assert.doesNotMatch(yml, /if: github.event_name != 'workflow_dispatch' \|\| inputs.dry_run == false/)
  assert.match(yml, /cancel-in-progress: false/)
  // The merge token never sits on a machine that also runs pull-request code.
  assert.match(yml, /^ {4}runs-on: ubuntu-latest$/m)
  assert.deepEqual(yml.match(/runs-on:.*/g), ['runs-on: ubuntu-latest'])
  assert.match(yml, /permission-contents: write/)
  assert.match(yml, /permission-pull-requests: write/)
  assert.match(yml, /repositories: \$\{\{ github\.event\.repository\.name \}\}/)
  assert.match(yml, /AUTO_MERGE_APP_TOKEN: \$\{\{ steps.app.outputs.token \}\}/)
  assert.doesNotMatch(yml, /github\.event\.pull_request\.head|pull_request_target/)
})

test('a verdict expiring during the last review reads never reaches merge', async () => {
  let validations = 0
  let merged = false
  const results = await mergeCandidates({
    numbers: [1052],
    get: reader(),
    run: async (bin, args) => {
      if (bin === 'gh') {
        merged = true
        return { code: 0, out: '' }
      }
      if (!args.includes('--expected-head')) return { code: 0, out: '{"verdict":"PASS"}' }
      validations++
      return validations === 1 ? { code: 0, out: head } : { code: 1, out: '' }
    },
    dryRun: false,
    readToken: 'read-only',
    mergeToken: 'app-write'
  })
  assert.equal(results[0].status, 'verdict-expired')
  assert.equal(merged, false)
})

test('scheduled recovery rotates bounded batches so old eligible PRs are not starved', () => {
  const pulls = Array.from({ length: 45 }, (_, index) => ({ ...pr(), number: index + 1 }))
  const visited = new Set()
  for (let round = 0; round < 3; round++) {
    const batch = recoveryCandidates(pulls, round * 600000)
    assert.equal(batch.length, 20)
    assert.equal(new Set(batch).size, 20)
    batch.forEach((number) => visited.add(number))
  }
  assert.equal(visited.size, 45)
  assert.deepEqual(
    recoveryCandidates([{ ...pr(), draft: true }, { ...pr(), base: { ref: 'main' } }, pr()], 0),
    [1052]
  )
})

test('a newly running or failed CI attempt during review reads invalidates the earlier green verdict', async () => {
  let gates = 0
  let merged = false
  const results = await mergeCandidates({
    numbers: [1052],
    get: reader(),
    run: async (bin, args) => {
      if (bin === 'gh') {
        merged = true
        return { code: 0, out: '' }
      }
      if (args.includes('--expected-head')) return { code: 0, out: head }
      gates++
      return gates === 1 ? { code: 0, out: '{"verdict":"PASS"}' } : { code: 1, out: '' }
    },
    dryRun: false,
    readToken: 'read-only',
    mergeToken: 'app-write'
  })
  assert.equal(results[0].status, 'checks-not-confirmed')
  assert.equal(merged, false)
})

test('mergeability still being computed is read again before the PR is judged', async () => {
  let reads = 0
  const waits = []
  const calls = []
  const get = reader({
    pull: () => (++reads === 1 ? { ...pr(), mergeable: null, mergeable_state: 'unknown' } : pr())
  })
  const run = async (bin, args) => {
    calls.push(bin)
    if (bin === 'gh') return { code: 0, out: '' }
    if (args.includes('--expected-head')) return { code: 0, out: `${head}\n` }
    return { code: 0, out: '{"verdict":"PASS"}\n' }
  }
  const results = await mergeCandidates({
    numbers: [1052],
    get,
    run,
    dryRun: false,
    readToken: 'read-only',
    mergeToken: 'app-write',
    wait: async (ms) => waits.push(ms)
  })
  assert.deepEqual(results, [{ pr: 1052, status: 'merged', head }])
  assert.equal(waits.length, 1)
  assert.equal(calls.at(-1), 'gh')
})

test('mergeability that stays unknown is reported as such and never reaches the gate', async () => {
  let reads = 0
  const calls = []
  const get = async (endpoint) => {
    if (endpoint.includes('/reviews?')) return []
    reads++
    return { ...pr(), mergeable: null, mergeable_state: 'unknown' }
  }
  const results = await mergeCandidates({
    numbers: [1052],
    get,
    run: async (bin) => (calls.push(bin), { code: 0, out: '' }),
    dryRun: false,
    readToken: 'read-only',
    mergeToken: 'app-write',
    wait: async () => {}
  })
  assert.deepEqual(results, [{ pr: 1052, status: 'mergeability-unknown' }])
  assert.equal(reads, 4)
  assert.deepEqual(calls, [])
  const closed = { ...pr(), state: 'closed', mergeable: null }
  let closedReads = 0
  await readPull(
    async () => (closedReads++, closed),
    1052,
    async () => {}
  )
  assert.equal(closedReads, 1)
})

const approval = (id, state, { user = 1, sha = head, association = 'MEMBER' } = {}) => ({
  id,
  state,
  commit_id: sha,
  author_association: association,
  user: { id: user }
})

test('an approval counts only from a write-level reviewer, on the current head, as their latest decision', () => {
  assert.equal(approvedOnHead([approval(1, 'APPROVED')], head), true)
  assert.equal(approvedOnHead([], head), false)
  assert.equal(approvedOnHead([approval(1, 'APPROVED', { sha: 'b'.repeat(40) })], head), false)
  for (const association of ['CONTRIBUTOR', 'FIRST_TIME_CONTRIBUTOR', 'NONE'])
    assert.equal(approvedOnHead([approval(1, 'APPROVED', { association })], head), false, association)
  assert.equal(approvedOnHead([approval(1, 'APPROVED'), approval(2, 'DISMISSED')], head), false)
  assert.equal(
    approvedOnHead([approval(1, 'APPROVED'), approval(2, 'CHANGES_REQUESTED', { user: 2 })], head),
    false
  )
  assert.equal(approvedOnHead([approval(1, 'APPROVED'), approval(2, 'COMMENTED', { user: 2 })], head), true)
})

test('with REQUIRE_APPROVAL_FOR_AUTO_MERGE on, a pull request without a current approval is not merged', async () => {
  const unapproved = stand({ requireApproval: true })
  assert.equal((await unapproved.go())[0].status, 'not-approved')
  assert.deepEqual(unapproved.calls, [])
  const approved = stand({ requireApproval: true, reviews: [approval(1, 'APPROVED')] })
  assert.equal((await approved.go())[0].status, 'merged')
  // Off (the default) keeps today's rule: no approval needed.
  assert.equal((await stand().go())[0].status, 'merged')
  const yml = readFileSync(new URL('../../.github/workflows/auto-merge-develop.yml', import.meta.url), 'utf8')
  assert.match(yml, /REQUIRE_APPROVAL_FOR_AUTO_MERGE: \$\{\{ vars\.REQUIRE_APPROVAL_FOR_AUTO_MERGE \}\}/)
})

test('only a human team member is merged automatically, checked before the gate and after it', async () => {
  assert.equal(authorRefusal(pr()), null)
  for (const association of ['OWNER', 'COLLABORATOR'])
    assert.equal(authorRefusal({ ...pr(), author_association: association }), null)
  assert.equal(
    authorRefusal({ ...pr(), user: { login: 'dependabot[bot]', type: 'Bot' } }),
    'author-not-human'
  )
  assert.equal(authorRefusal({ ...pr(), user: null }), 'author-missing')
  assert.equal(authorRefusal({ ...pr(), author_association: undefined }), 'author-missing')
  for (const association of ['NONE', 'CONTRIBUTOR', 'FIRST_TIME_CONTRIBUTOR'])
    assert.equal(authorRefusal({ ...pr(), author_association: association }), 'author-not-team')
  const bot = await mergeCandidates({
    numbers: [1052],
    get: reader({ pull: () => ({ ...pr(), user: { login: 'agent[bot]', type: 'Bot' } }) }),
    run: async () => assert.fail('the gate must not run for a bot'),
    dryRun: false,
    readToken: 'read-only',
    mergeToken: 'app-write'
  })
  assert.deepEqual(bot, [{ pr: 1052, status: 'author-not-human' }])
  const late = stand({ change: { ...pr(), author_association: 'CONTRIBUTOR' } })
  assert.equal((await late.go())[0].status, 'author-not-team')
  assert.ok(!late.calls.some((call) => call.bin === 'gh'))
})

test('a pull request touching a CI-sensitive path, by new or old name, is never merged automatically', async () => {
  const patterns = sensitivePatterns(
    readFileSync(new URL('../../.github/CODEOWNERS', import.meta.url), 'utf8')
  )
  // Kept whatever CODEOWNERS says.
  for (const path of [
    '.github/workflows/x.yml',
    'scripts/auto-merge-develop.mjs',
    'scripts/check-pr-merge.mjs',
    'scripts/check-tests.ts',
    'scripts/lib/english-policy.mjs',
    'turbo.json'
  ])
    assert.equal(sensitiveFile([{ filename: path }], sensitivePatterns('')), path)
  assert.equal(
    sensitiveFile([{ filename: 'scripts/language-policy.json' }], patterns),
    'scripts/language-policy.json'
  )
  assert.equal(sensitiveFile(appFiles(), patterns), null)
  assert.equal(sensitiveFile([{ filename: 'apps/x/.github/y' }], patterns), null)
  const workflow = stand({ files: () => [...appFiles(), { filename: '.github/workflows/x.yml' }] })
  assert.deepEqual(await workflow.go(), [
    { pr: 1052, status: 'sensitive-files', file: '.github/workflows/x.yml' }
  ])
  assert.deepEqual(workflow.calls, [])
  const renamed = stand({
    files: () => [
      { filename: 'scripts/plan.mjs', previous_filename: 'scripts/ci/plan-ci.mjs', status: 'renamed' }
    ]
  })
  assert.equal((await renamed.go())[0].file, 'scripts/ci/plan-ci.mjs')
  assert.deepEqual(renamed.calls, [])
})

test('a file list that changes after the gate is refused, and a pushed head during the listing too', async () => {
  // Same count as the first listing, so only reading the files again can tell.
  const lateSensitive = await stand({
    lateFiles: () => [{ filename: '.github/workflows/x.yml' }]
  }).go()
  assert.deepEqual(lateSensitive, [{ pr: 1052, status: 'sensitive-files', file: '.github/workflows/x.yml' }])
  const other = stand({ lateFiles: () => [{ filename: 'apps/tracy-web/src/lib/y.js' }] })
  assert.equal((await other.go())[0].status, 'changed-after-check')
  assert.ok(!other.calls.some((call) => call.bin === 'gh'))
  // The PR read right after the listing names another head: the listing may belong to that one.
  let pulls = 0
  const pushed = await mergeCandidates({
    numbers: [1052],
    get: reader({
      pull: () => (++pulls === 2 ? { ...pr(), head: { ...pr().head, sha: 'b'.repeat(40) } } : pr())
    }),
    run: async () => assert.fail('the gate must not run'),
    readToken: 'read-only'
  })
  assert.deepEqual(pushed, [{ pr: 1052, status: 'changed-after-check' }])
})

test('a file listing that reaches the 3000-file API limit or disagrees with changed_files fails closed', async () => {
  const many = () => Array.from({ length: FILES_LIMIT }, (_, i) => ({ filename: `apps/x/${i}.js` }))
  const full = await mergeCandidates({
    numbers: [1052],
    get: reader({ files: many, pull: () => ({ ...pr(), changed_files: FILES_LIMIT }) }),
    run: async () => assert.fail('the gate must not run'),
    readToken: 'read-only'
  })
  assert.deepEqual(full, [{ pr: 1052, status: 'files-incomplete' }])
  for (const pull of [() => ({ ...pr(), changed_files: 2 }), () => ({ ...pr(), changed_files: undefined })])
    assert.deepEqual(
      await mergeCandidates({
        numbers: [1052],
        get: reader({ pull }),
        run: async () => assert.fail('the gate must not run'),
        readToken: 'read-only'
      }),
      [{ pr: 1052, status: 'files-incomplete' }]
    )
  const broken = stand({ files: () => ({ message: 'Server Error' }) })
  assert.equal((await broken.go())[0].status, 'files-incomplete')
})

test('a normal app-code pull request by a member still merges on the exact head', async () => {
  const s = stand()
  assert.deepEqual(await s.go(), [{ pr: 1052, status: 'merged', head }])
  assert.equal(s.calls.at(-1).bin, 'gh')
})

test('the scripts the gate workflows run, read from the trusted checkout, are sensitive too', async () => {
  // `stand` leaves `sensitive` at its default: the set read from this checkout's files.
  const scripts = gateScripts(
    WORKFLOWS.map(({ file }) =>
      readFileSync(new URL(`../../.github/workflows/${file}`, import.meta.url), 'utf8')
    )
  )
  for (const path of ['scripts/check-all.ts', 'scripts/check-regression.mjs', 'scripts/build-dsh.mjs'])
    assert.ok(scripts.includes(path), path)
  // A path named only in a comment or a `paths:` filter is not a call.
  assert.ok(!scripts.some((path) => path.startsWith('scripts/test/')), scripts.join(' '))
  for (const path of [
    'scripts/check-all.ts',
    'scripts/check-regression.mjs',
    'turbo.json',
    'scripts/build-dsh.mjs'
  ]) {
    const s = stand({ files: () => [{ filename: 'apps/tracy-web/src/x.js' }, { filename: path }] })
    assert.deepEqual(await s.go(), [{ pr: 1052, status: 'sensitive-files', file: path }], path)
    assert.deepEqual(s.calls, [], path)
  }
  // App code with its test is trusted to a team author.
  const app = stand({
    files: () => [{ filename: 'apps/tracy-web/src/x.js' }, { filename: 'apps/tracy-web/test/x.test.js' }]
  })
  assert.deepEqual(await app.go(), [{ pr: 1052, status: 'merged', head }])
})

test('gate workflows that name no script fail closed', () => {
  assert.throws(() => gateScripts(['jobs:\n  a:\n    steps:\n      - run: echo hi\n']), /No gate script/)
  assert.throws(() => gateScripts([]), /No gate script/)
  assert.deepEqual(
    gateScripts([
      '      - run: |\n          set -e\n          pnpm exec tsx scripts/check-all.ts --skip tests\n'
    ]),
    ['scripts/check-all.ts']
  )
  const root = mkdtempSync(join(tmpdir(), 'auto-merge-'))
  try {
    mkdirSync(join(root, '.github/workflows'), { recursive: true })
    for (const { file } of WORKFLOWS)
      writeFileSync(
        join(root, '.github/workflows', file),
        'jobs:\n  a:\n    steps:\n      - run: pnpm test\n'
      )
    assert.throws(() => trustedSensitivePatterns(pathToFileURL(`${root}/`)), /No gate script/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a script path counts whatever command, prefix or quoting runs it', async () => {
  const workflow = [
    'jobs:',
    '  gate:',
    '    steps:',
    '      - run: node ./scripts/verify-gate.mjs',
    '      - run: |',
    '          # scripts/test/only-a-comment.test.mjs',
    '          bash "$GITHUB_WORKSPACE/scripts/a.sh"',
    '          ./scripts/b.sh',
    "          python3 scripts/c.py --config '${{ github.workspace }}/scripts/d.json'",
    '      - run: pnpm exec tsx scripts/e.ts --rules=scripts/f.json',
    '    paths: [scripts/test/in-a-filter.mjs]',
    ''
  ].join('\n')
  const scripts = gateScripts([workflow])
  assert.deepEqual(scripts, [
    'scripts/a.sh',
    'scripts/b.sh',
    'scripts/c.py',
    'scripts/d.json',
    'scripts/e.ts',
    'scripts/f.json',
    'scripts/verify-gate.mjs'
  ])
  const patterns = sensitivePatterns('', scripts)
  for (const path of ['scripts/verify-gate.mjs', 'scripts/a.sh', 'scripts/b.sh', 'scripts/c.py']) {
    const refused = await mergeCandidates({
      numbers: [1052],
      get: reader({ files: () => [{ filename: path }] }),
      run: async () => assert.fail('the gate must not run'),
      readToken: 'read-only',
      sensitive: patterns
    })
    assert.deepEqual(refused, [{ pr: 1052, status: 'sensitive-files', file: path }], path)
  }
  const app = await mergeCandidates({
    numbers: [1052],
    get: reader({
      files: () => [{ filename: 'apps/tracy-web/src/x.js' }, { filename: 'apps/tracy-web/test/x.test.js' }],
      pull: () => ({ ...pr(), changed_files: 2 })
    }),
    run: async (bin, args) =>
      bin === 'gh'
        ? { code: 0, out: '' }
        : { code: 0, out: args.includes('--expected-head') ? head : '{"verdict":"PASS"}' },
    dryRun: false,
    readToken: 'read-only',
    mergeToken: 'app-write',
    sensitive: patterns
  })
  assert.deepEqual(app, [{ pr: 1052, status: 'merged', head }])
})
