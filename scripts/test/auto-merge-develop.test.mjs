import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  eligible,
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
  requested_teams: []
})
const review = (id, state, user = 1) => ({ id, state, user: { id: user } })

function stand({ code = 0, change, reviews = [], dryRun = false, requireApproval = false } = {}) {
  const calls = []
  let reads = 0
  const get = async (endpoint) =>
    endpoint.includes('/reviews?') ? reviews : ++reads > 1 && change ? change : pr()
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

test('workflow uses default-branch code, a serialized dev light runner and scoped App permissions', () => {
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
  assert.match(yml, /runs-on: ubuntu-latest\n/)
  assert.match(yml, /node-version-file: \.node-version/)
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
    get: async (endpoint) => (endpoint.includes('/reviews?') ? [] : pr()),
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
    get: async (endpoint) => (endpoint.includes('/reviews?') ? [] : pr()),
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
  const get = async (endpoint) =>
    endpoint.includes('/reviews?')
      ? []
      : ++reads === 1
        ? { ...pr(), mergeable: null, mergeable_state: 'unknown' }
        : pr()
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
