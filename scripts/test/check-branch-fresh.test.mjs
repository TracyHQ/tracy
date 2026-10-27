#!/usr/bin/env node
/**
 * Branch freshness decisions, tested away from git.
 *
 *   node --test scripts/test/check-branch-fresh.test.mjs
 *
 * The same split as `check-push.mjs`: git reads the facts, these pure functions decide what they
 * mean. The part asserted hardest is the one that keeps the hook usable: a push only ever warns.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  FRESHNESS_LIMIT,
  freshnessVerdict,
  overlapsOf,
  parseLog,
  releasePathProblem,
  STAGING_IN_RELEASE_PATH
} from '../check-branch-fresh.mjs'

const base = 'origin/develop'

test('within the limit and no shared files: nothing to say', () => {
  assert.deepEqual(freshnessVerdict({ behind: FRESHNESS_LIMIT, base, overlaps: [], mode: 'ci' }), {
    level: 'ok',
    message: null
  })
})

test('over the limit on push only warns, never blocks', () => {
  const verdict = freshnessVerdict({ behind: FRESHNESS_LIMIT + 1, base, overlaps: [], mode: 'push' })
  assert.equal(verdict.level, 'warn')
  assert.match(verdict.message, /git merge origin\/develop/)
})

test('over the limit on a ready pull request fails', () => {
  assert.equal(
    freshnessVerdict({ behind: FRESHNESS_LIMIT + 1, base, overlaps: [], mode: 'ci' }).level,
    'fail'
  )
})

test('within the limit but sharing files: warns in CI too, does not fail', () => {
  const overlaps = [{ subject: 'Merge pull request #780', files: ['apps/tracy-web/src/sites/route.js'] }]
  const verdict = freshnessVerdict({ behind: 3, base, overlaps, mode: 'ci' })
  assert.equal(verdict.level, 'warn')
  assert.match(verdict.message, /#780/)
  assert.match(verdict.message, /sites\/route\.js/)
})

test('a long overlap list is cut, and says how much was cut', () => {
  const overlaps = Array.from({ length: 13 }, (_, i) => ({ subject: `c${i}`, files: ['a.js'] }))
  assert.match(freshnessVerdict({ behind: 60, base, overlaps, mode: 'push' }).message, /and 3 more/)
})

test('overlapsOf keeps only commits and paths this branch also changes', () => {
  const commits = [
    { subject: 'one', files: ['a.js', 'b.js'] },
    { subject: 'two', files: ['c.js'] }
  ]
  assert.deepEqual(overlapsOf(commits, ['b.js', 'z.js']), [{ subject: 'one', files: ['b.js'] }])
})

test('parseLog reads the NUL-separated first-parent log', () => {
  const raw = '\0Merge pull request #1\n\na.js\nb.js\n\0fix: direct push\n\nc.js\n'
  assert.deepEqual(parseLog(raw), [
    { subject: 'Merge pull request #1', files: ['a.js', 'b.js'] },
    { subject: 'fix: direct push', files: ['c.js'] }
  ])
})

test('release path, staging off (beta): main takes any branch of this repository, never a fork', () => {
  assert.equal(STAGING_IN_RELEASE_PATH, false)
  assert.equal(releasePathProblem({ base: 'main', head: 'develop', sameRepo: true }), null)
  assert.equal(
    releasePathProblem({ base: 'main', head: 'release/develop-to-main-2026-10-12', sameRepo: true }),
    null
  )
  assert.match(releasePathProblem({ base: 'main', head: 'develop', sameRepo: false }), /not from a fork/)
  assert.equal(releasePathProblem({ base: 'develop', head: 'feat/x', sameRepo: false }), null)
})

test('release path, staging on: main takes staging of this repository only; develop and staging take any branch', () => {
  assert.equal(releasePathProblem({ base: 'main', head: 'staging', sameRepo: true, staging: true }), null)
  assert.match(
    releasePathProblem({ base: 'main', head: 'develop', sameRepo: true, staging: true }),
    /from staging only/
  )
  assert.match(
    releasePathProblem({ base: 'main', head: 'fix/hot', sameRepo: true, staging: true }),
    /"fix\/hot"/
  )
  assert.match(
    releasePathProblem({ base: 'main', head: 'staging', sameRepo: false, staging: true }),
    /from staging only/
  )
  assert.equal(releasePathProblem({ base: 'staging', head: 'develop', sameRepo: true, staging: true }), null)
  assert.equal(releasePathProblem({ base: 'staging', head: 'fix/hot', sameRepo: true, staging: true }), null)
  assert.equal(releasePathProblem({ base: 'develop', head: 'feat/x', sameRepo: false, staging: true }), null)
})

test('release path, staging on: a release/staging-to-main-* head passes only with the tree of staging', () => {
  const pr = (head, sameTreeAsStaging, sameRepo = true) =>
    releasePathProblem({ base: 'main', head, sameRepo, sameTreeAsStaging, staging: true })
  assert.equal(pr('release/staging-to-main-2026-10-07', true), null)
  assert.match(pr('release/staging-to-main-2026-10-07', false), /does not carry the tree of staging/)
  assert.match(pr('release/staging-to-main-2026-10-07', null), /staging could not be read/)
  assert.match(pr('release/staging-to-main-2026-10-07', true, false), /from staging only/)
  assert.match(pr('release/develop-to-main-2026-10-07', true), /from staging only/)
  assert.match(pr('release/staging-to-main-', true), /from staging only/)
  assert.match(pr('feat/x', true), /from staging only/)
})
