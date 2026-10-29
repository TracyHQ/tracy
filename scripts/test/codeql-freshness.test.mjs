/**
 * CodeQL upkeep: the freshness check of `develop`'s and `main`'s analyses
 * (`scripts/ci/codeql-freshness.mjs`), the workflow that runs it, and the Dependabot config that keeps
 * the pinned actions current.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { load } from 'js-yaml'

import { CATEGORIES, DEVELOP, MAIN, checkFreshness, readAnalyses } from '../ci/codeql-freshness.mjs'
import { CI_REPOSITORY } from '../ci/ci-repository.mjs'
import { githubJson, githubReader } from '../ci/github-read.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const NOW = Date.parse('2026-10-29T06:41:00Z')
const daysAgo = (days) => new Date(NOW - days * 86_400_000).toISOString()
const HEAD = 'c'.repeat(40)
const PARENT = 'b'.repeat(40)
const analysis = (category, days, sha = HEAD) => ({
  category,
  created_at: daysAgo(days),
  commit_sha: sha,
  tool: { name: 'CodeQL' }
})
const all = (days, sha = HEAD) => CATEGORIES.map((category) => analysis(category, days, sha))

/**
 * A fake API. `develop`/`main` are the analysis pages of each ref, `head` the age in days of the
 * develop head commit `HEAD`. Records every path asked.
 */
const api = ({
  develop = [all(0.5)],
  main = [all(1)],
  head = 0.6,
  message = 'Merge pull request #1'
} = {}) => {
  const paths = []
  const pages = { [DEVELOP]: develop, [MAIN]: main }
  return {
    paths,
    getJson: async (path) => {
      paths.push(path)
      const url = new URL(`https://api.github.com/${path}`)
      if (url.pathname === `/repos/${CI_REPOSITORY}/branches/develop`)
        return {
          name: 'develop',
          commit: { sha: HEAD, commit: { message, committer: { date: daysAgo(head) } } }
        }
      assert.equal(url.pathname, `/repos/${CI_REPOSITORY}/code-scanning/analyses`)
      assert.equal(url.searchParams.get('tool_name'), 'CodeQL')
      return pages[url.searchParams.get('ref')][Number(url.searchParams.get('page')) - 1] ?? []
    }
  }
}

test('fresh develop and main analyses are green, and both refs are read', async () => {
  const { getJson, paths } = api()
  const result = await checkFreshness({ getJson, now: NOW })
  assert.equal(result.code, 0, result.stderr)
  const refs = paths.map((p) => new URL(`https://x/${p}`).searchParams.get('ref')).filter(Boolean)
  assert.deepEqual(refs, [DEVELOP, MAIN])
})

test('a quiet develop whose head was analyzed is never stale, however old the analysis', async () => {
  // Head committed 30 days ago, analyzed an hour after; nothing pushed since.
  const { getJson } = api({ develop: [all(29.95)], head: 30 })
  const result = await checkFreshness({ getJson, now: NOW })
  assert.equal(result.code, 0, result.stderr)
})

test('a head committed less than 24 hours ago with no analysis yet is green: CodeQL may still run', async () => {
  const { getJson } = api({ develop: [all(3, PARENT)], head: 0.5 })
  const result = await checkFreshness({ getJson, now: NOW })
  assert.equal(result.code, 0, result.stderr)
})

test('a head 2 days old analyzed only through its parent, 10 minutes before it, fails', async () => {
  // Scanning stopped after the parent: every analysis is of PARENT, made just before HEAD's date.
  const tenMinutes = 10 / (24 * 60)
  const { getJson } = api({ develop: [all(2 + tenMinutes, PARENT)], head: 2 })
  const result = await checkFreshness({ getJson, now: NOW })
  assert.equal(result.code, 1)
  for (const category of CATEGORIES)
    assert.ok(
      result.stderr.includes(
        `refs/heads/develop ${category}: head commit cccccccccccc committed 2026-10-27T06:41Z ` +
          'has no analysis after 24 h; last analysis 2026-10-27T06:31Z of bbbbbbbbbbbb'
      ),
      result.stderr
    )
})

test('only the category missing an analysis of the head is named', async () => {
  const { getJson } = api({
    develop: [
      [
        analysis('/language:actions', 1.9),
        analysis('/language:javascript-typescript', 1.9),
        analysis('/language:python', 1.95, PARENT)
      ]
    ],
    head: 2
  })
  const result = await checkFreshness({ getJson, now: NOW })
  assert.equal(result.code, 1)
  assert.match(
    result.stderr,
    /refs\/heads\/develop \/language:python: head commit c{12} committed 2026-10-27T06:41Z/
  )
  assert.doesNotMatch(result.stderr, /javascript-typescript|language:actions|refs\/heads\/main/)
})

test('a head whose message skips CI stays red and says why', async () => {
  const { getJson } = api({ develop: [all(3, PARENT)], head: 2, message: 'ci: tidy [skip ci]' })
  const result = await checkFreshness({ getJson, now: NOW })
  assert.equal(result.code, 1)
  assert.match(
    result.stderr,
    /has no analysis after 24 h \(its message asks GitHub to skip CI: push again without it\)/
  )
})

test('a develop analysis without its commit id fails closed', async () => {
  const unnamed = all(0.5).map((a) => ({ ...a, commit_sha: undefined }))
  const result = await checkFreshness({ getJson: api({ develop: [unnamed] }).getJson, now: NOW })
  assert.equal(result.code, 1)
  assert.match(result.stderr, /refs\/heads\/develop: could not read .*Unreadable code-scanning analysis/)
})

test('a main analysis 9 days old fails; 7 days old passes', async () => {
  const stale = await checkFreshness({ getJson: api({ main: [all(9)] }).getJson, now: NOW })
  assert.equal(stale.code, 1)
  for (const category of CATEGORIES)
    assert.ok(stale.stderr.includes(`refs/heads/main ${category}: last analysis 2026-10-20T06:41Z`), category)
  assert.match(stale.stderr, /none in the last 8 days/)

  const fresh = await checkFreshness({ getJson: api({ main: [all(7)] }).getJson, now: NOW })
  assert.equal(fresh.code, 0, fresh.stderr)
})

test('a missing category fails on either ref', async () => {
  const noPython = [CATEGORIES.filter((c) => c !== '/language:python').map((c) => analysis(c, 0.5))]
  for (const [ref, input] of [
    [DEVELOP, { develop: noPython }],
    [MAIN, { main: noPython }]
  ]) {
    const result = await checkFreshness({ getJson: api(input).getJson, now: NOW })
    assert.equal(result.code, 1, ref)
    const line = ref === DEVELOP ? 'no analysis found; head commit cccccccccccc' : 'no analysis found'
    assert.ok(
      result.stderr.includes(`${ref} /language:python: `) && result.stderr.includes(line),
      result.stderr
    )
  }
})

test('no analysis at all fails for every category of both refs', async () => {
  const result = await checkFreshness({ getJson: api({ develop: [], main: [], head: 2 }).getJson, now: NOW })
  assert.equal(result.code, 1)
  for (const ref of [DEVELOP, MAIN])
    for (const category of CATEGORIES)
      assert.ok(result.stderr.includes(`${ref} ${category}`), `${ref} ${category}`)
})

test('a category found only on a later page still counts, and paging stops past the cutoff', async () => {
  const full = (category, days) => Array.from({ length: 100 }, () => analysis(category, days))
  const found = api({
    develop: [
      full('/language:actions', 0.5),
      [analysis('/language:javascript-typescript', 0.5), analysis('/language:python', 0.5)]
    ]
  })
  assert.equal((await checkFreshness({ getJson: found.getJson, now: NOW })).code, 0)
  assert.equal(found.paths.filter((p) => p.includes('develop') && p.includes('page=2')).length, 1)

  const old = api({ develop: [full('/language:actions', 30), full('/language:python', 1)] })
  await readAnalyses(old.getJson, DEVELOP, NOW - 8 * 86_400_000, () => false)
  assert.equal(old.paths.length, 1)
})

test('an API error fails closed with the reason, for each ref', async () => {
  const fetchImpl = async () =>
    new Response('{"message":"Resource not accessible by integration"}', { status: 403 })
  const read = githubReader({ appToken: undefined, jobToken: 'job-token', fetchImpl, onRoute: () => {} })
  const result = await checkFreshness({ getJson: (path) => githubJson(read, path, 1_000_000), now: NOW })
  assert.equal(result.code, 1)
  for (const ref of [DEVELOP, MAIN])
    assert.ok(
      result.stderr.includes(
        `${ref}: could not read its code-scanning analyses: GitHub CI read failed: HTTP 403`
      ),
      ref
    )
  assert.match(result.stderr, /fails closed/)
})

test('an unreadable answer fails closed', async () => {
  for (const answer of [{ message: 'Not Found' }, [{ category: '/language:python' }], [null]]) {
    const getJson = async (path) => (path.includes('/branches/develop') ? api().getJson(path) : answer)
    const result = await checkFreshness({ getJson, now: NOW })
    assert.equal(result.code, 1, JSON.stringify(answer))
    assert.match(result.stderr, /could not read/)
  }
  for (const branch of [{}, { commit: { sha: HEAD, commit: { committer: { date: 'soon' } } } }]) {
    const getJson = async (path) => (path.includes('/branches/develop') ? branch : all(0.5))
    const result = await checkFreshness({ getJson, now: NOW })
    assert.equal(result.code, 1)
    assert.match(result.stderr, /refs\/heads\/develop: could not read .*Unreadable develop branch/)
  }
})

test('the categories are the ones codeql.yml uploads', () => {
  const codeql = load(readFileSync(join(ROOT, '.github/workflows/codeql.yml'), 'utf8'))
  const languages = codeql.jobs.analyze.strategy.matrix.include.map((row) => `/language:${row.language}`)
  assert.deepEqual([...languages].sort(), [...CATEGORIES].sort())
})

test('the freshness workflow is its own daily run with read-only permissions and pinned actions', () => {
  const text = readFileSync(join(ROOT, '.github/workflows/codeql-freshness.yml'), 'utf8')
  const doc = load(text)
  const on = doc.on ?? doc[true]
  assert.deepEqual(Object.keys(on).sort(), ['schedule', 'workflow_dispatch'])
  assert.match(on.schedule[0].cron, /^\d+ \d+ \* \* \*$/)
  assert.deepEqual(doc.permissions, { contents: 'read', 'security-events': 'read' })
  for (const [name, job] of Object.entries(doc.jobs)) {
    assert.equal(job.permissions, undefined, `${name}: no job widens the workflow permissions`)
    assert.equal(job['runs-on'], 'ubuntu-latest', name)
    for (const step of job.steps)
      if (String(step.uses ?? '').startsWith('actions/checkout@'))
        assert.equal(step.with?.['persist-credentials'], false, `${name}: checkout`)
  }
  const uses = [...text.matchAll(/^\s*(?:-\s*)?uses:\s*(\S+)\s*#\s*v\d/gm)].map((m) => m[1])
  assert.ok(uses.length >= 2)
  for (const ref of uses) assert.match(ref, /@[0-9a-f]{40}$/, ref)
  assert.match(text, /run: node scripts\/ci\/codeql-freshness\.mjs/)
  assert.doesNotMatch(text, /secrets\./)
})

test('Dependabot updates only the pinned GitHub Actions, one grouped pull request into develop', () => {
  const config = load(readFileSync(join(ROOT, '.github/dependabot.yml'), 'utf8'))
  assert.equal(config.version, 2)
  assert.equal(config.updates.length, 1)
  const [actions] = config.updates
  assert.equal(actions['package-ecosystem'], 'github-actions')
  assert.deepEqual(actions.directories, ['/', '/.github/actions/*'])
  assert.equal(actions['target-branch'], 'develop')
  assert.equal(actions.schedule.interval, 'weekly')
  assert.deepEqual(Object.values(actions.groups), [{ patterns: ['*'] }])
  assert.ok(actions['open-pull-requests-limit'] >= 1 && actions['open-pull-requests-limit'] <= 3)
  // naming-conventions.md §6: `type(scope): description`; Dependabot appends `: bump …`.
  assert.match(`${actions['commit-message'].prefix}: bump actions/checkout`, /^ci\([a-z-]+\): [a-z]/)
})
