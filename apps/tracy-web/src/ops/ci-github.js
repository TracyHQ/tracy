import { createExecutionReader } from './ci-execution.js'
import { createDeliveryReader } from './ci-delivery.js'
import { DEFAULT_SOURCE_REPOSITORY, SOURCE_REPOSITORIES } from '../lib/source-repository.js'

// Read-only CI observations for the source repository (config `sourceRepo`). Every check belongs to the reported head SHA.
const CHECK_FIELDS = `__typename
  ... on CheckRun { databaseId name status conclusion detailsUrl startedAt completedAt title summary
    checkSuite { createdAt workflowRun { databaseId runAttempt workflow { name } } }
  }
  ... on StatusContext { context state description targetUrl createdAt }`
const COMMIT_FIELDS = `oid committedDate statusCheckRollup { state contexts(first:100) { pageInfo { hasNextPage } nodes { ${CHECK_FIELDS} } } }`
const PR_FIELDS = `number title url state isDraft headRefOid baseRefName createdAt updatedAt mergedAt mergeable mergeStateStatus reviewDecision
  author { login ... on User { databaseId name } }
  mergeQueue { id }
  mergeQueueEntry { position enqueuedAt estimatedTimeToMerge state }
  commits(last:1) { nodes { commit { ${COMMIT_FIELDS} } } }
  mergeCommit { ${COMMIT_FIELDS} }`
export const CI_LIST_QUERY = `query CiPullRequests($owner:String!,$repo:String!,$cursor:String) { repository(owner:$owner,name:$repo) {
  open:pullRequests(first:50,after:$cursor,states:OPEN,orderBy:{field:UPDATED_AT,direction:DESC}) { pageInfo { hasNextPage endCursor } nodes { ${PR_FIELDS} } }
  merged:pullRequests(first:30,states:MERGED,orderBy:{field:UPDATED_AT,direction:DESC}) { nodes { ${PR_FIELDS} } }
} }`
export const CI_SEARCH_QUERY = `query CiSearch($query:String!,$cursor:String) {
  search(query:$query,type:ISSUE,first:50,after:$cursor) {
    issueCount pageInfo { hasNextPage endCursor }
    nodes { ... on PullRequest { ${PR_FIELDS} } }
  }
}`

// Query values are closed enums and UTC bounds, never raw GitHub search syntax.
export function ciScope(input = {}) {
  const branch = input.branch ?? 'All',
    field = input.dateField ?? 'updated',
    range = input.range ?? '24h'
  if (
    !['All', 'main', 'staging', 'develop'].includes(branch) ||
    !['updated', 'created', 'merged'].includes(field) ||
    !['24h', '7d', '30d', '90d', 'any', 'custom'].includes(range)
  )
    throw new Error('Invalid CI filters.')
  const bound = (value) => {
    if (!value) return null
    if (
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
      !Number.isFinite(Date.parse(value)) ||
      new Date(value).toISOString() !== value
    )
      throw new Error('Invalid CI date.')
    return value
  }
  const from = range === 'custom' ? bound(input.from) : null,
    to = range === 'custom' ? bound(input.to) : null
  if (range === 'custom' && ((!from && !to) || (from && to && from >= to)))
    throw new Error('Invalid CI date range.')
  return { branch, dateField: field, range, from, to }
}
function scopeBounds(scope, now) {
  const days = { '24h': 1, '7d': 7, '30d': 30, '90d': 90 }[scope.range]
  return days ? { ...scope, from: new Date(now - days * 86400000).toISOString(), to: null } : scope
}
function inScope(raw, scope) {
  if (
    !['main', 'staging', 'develop'].includes(raw.baseRefName) ||
    (scope.branch !== 'All' && raw.baseRefName !== scope.branch)
  )
    return false
  const time = Date.parse(
    raw[{ updated: 'updatedAt', created: 'createdAt', merged: 'mergedAt' }[scope.dateField]] ?? ''
  )
  return (
    (!scope.from && !scope.to) ||
    (Number.isFinite(time) &&
      (!scope.from || time >= Date.parse(scope.from)) &&
      (!scope.to || time < Date.parse(scope.to)))
  )
}
export const CI_DETAIL_QUERY = `query CiPullRequest($owner:String!,$repo:String!,$number:Int!) { repository(owner:$owner,name:$repo) { pullRequest(number:$number) { ${PR_FIELDS}
  head:commits(last:1) { nodes { commit { oid statusCheckRollup { contexts(first:100) { nodes {
    ... on CheckRun { databaseId steps(first:100) { pageInfo { hasNextPage } nodes { name number status conclusion startedAt completedAt } } }
  } } } } } }
} } }`

export function githubLink(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' &&
      url.hostname === 'github.com' &&
      SOURCE_REPOSITORIES.some((repo) => url.pathname.toLowerCase().startsWith(`/${repo.toLowerCase()}/`))
      ? url.href
      : null
  } catch {
    return null
  }
}
const clip = (value, max = 1500) => (typeof value === 'string' ? value.slice(0, max) : null)
const stamp = (value) => (typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null)

function checkOf(node) {
  if (node.__typename === 'StatusContext')
    return {
      id: node.context,
      name: node.context,
      workflow: null,
      status: node.state === 'PENDING' ? 'QUEUED' : 'COMPLETED',
      conclusion: node.state,
      url: githubLink(node.targetUrl),
      startedAt: stamp(node.createdAt),
      completedAt: null,
      summary: clip(node.description),
      steps: [],
      observedAt: stamp(node.createdAt)
    }
  return {
    id: String(node.databaseId),
    name: node.name,
    workflow: node.checkSuite?.workflowRun?.workflow?.name ?? null,
    runId: node.checkSuite?.workflowRun?.databaseId ?? null,
    runAttempt: node.checkSuite?.workflowRun?.runAttempt ?? null,
    status: node.status,
    conclusion: node.conclusion,
    url: githubLink(node.detailsUrl),
    startedAt: stamp(node.startedAt),
    completedAt: stamp(node.completedAt),
    summary: clip(node.summary || node.title),
    steps: [],
    observedAt: stamp(node.checkSuite?.createdAt) || stamp(node.startedAt) || stamp(node.completedAt)
  }
}
export function checksOf(commit) {
  const connection = commit?.statusCheckRollup?.contexts
  const latest = new Map()
  for (const node of connection?.nodes ?? []) {
    if (!node || !['CheckRun', 'StatusContext'].includes(node.__typename)) continue
    const check = checkOf(node)
    const key = `${check.workflow ?? ''}:${check.name}`
    const previous = latest.get(key)
    if (
      !previous ||
      (Date.parse(check.observedAt) || 0) > (Date.parse(previous.observedAt) || 0) ||
      (check.observedAt === previous.observedAt && Number(check.id) > Number(previous.id))
    )
      latest.set(key, check)
  }
  const newestRuns = new Map()
  for (const check of latest.values())
    if (check.workflow && check.runId)
      newestRuns.set(check.workflow, Math.max(newestRuns.get(check.workflow) ?? 0, check.runId))
  return {
    checks: [...latest.values()].filter(
      (check) => !check.runId || check.runId === newestRuns.get(check.workflow)
    ),
    complete: !connection?.pageInfo?.hasNextPage
  }
}
const failed = (check) =>
  ['FAILURE', 'ERROR', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE', 'STALE'].includes(check.conclusion)
const cancelled = (check) => check.conclusion === 'CANCELLED'
const passed = (check) => ['SUCCESS', 'NEUTRAL', 'SKIPPED'].includes(check.conclusion)

function buildOf(checks, complete, matchesHead, draft) {
  if (!matchesHead || !complete) return 'Unknown'
  if (checks.some(failed)) return 'Failed'
  if (checks.some((check) => check.status === 'IN_PROGRESS')) return 'Building'
  if (checks.some((check) => check.status !== 'COMPLETED')) return 'Queued'
  if (checks.some(cancelled)) return 'Cancelled'
  // TCH requires Tracy CI even where the repository has no branch-protection rule.
  const ci = checks.filter((check) => check.workflow === 'Tracy CI')
  if (
    !draft &&
    ci.some((check) => check.name === 'build check (checks)' && check.conclusion === 'SUCCESS') &&
    ci.every(passed) &&
    checks.every(passed)
  )
    return 'Ready'
  return checks.some((check) => check.startedAt && check.conclusion !== 'SKIPPED')
    ? 'Incomplete'
    : 'Not started'
}
function deploymentOf(raw) {
  const { checks, complete } = checksOf(raw.mergeCommit)
  const deployments = checks.filter(
    (check) =>
      ['build-app-images', 'build-dsh-image'].includes(check.workflow) && check.name.startsWith('deploy-')
  )
  const target =
    raw.baseRefName === 'main'
      ? 'prod'
      : raw.baseRefName === 'develop'
        ? 'dev'
        : raw.baseRefName === 'staging'
          ? 'staging'
          : null
  const relevant = deployments.filter(
    (check) => target && check.name === `deploy-${target}` && check.conclusion !== 'SKIPPED'
  )
  const releasePassed = (check) => check.conclusion === 'SUCCESS'
  const builds = checks.filter(
    (check) =>
      ['build-app-images', 'build-dsh-image'].includes(check.workflow) &&
      check.name === 'build' &&
      check.conclusion !== 'SKIPPED'
  )
  const observed = [...builds, ...relevant]
  const result = (label, stage = null, failed = false) => ({ label, stage, failed, checks: observed })
  if (!raw.mergedAt) return result('Not deployed')
  if (builds.some(failed)) return result('Image build failed', 'Building image', true)
  if (relevant.some(failed)) return result('Deployment failed', 'Deploying', true)
  if (builds.some(cancelled)) return result('Image build cancelled', 'Building image', true)
  if (relevant.some(cancelled)) return result('Deployment cancelled', 'Deploying', true)
  if (relevant.some((check) => check.status === 'IN_PROGRESS'))
    return result(`Updating ${target}`, 'Deploying')
  if (builds.some((check) => check.status !== 'COMPLETED'))
    return result('Image build queued or running', 'Building image')
  if (relevant.some((check) => check.status !== 'COMPLETED'))
    return result(`Deployment waiting (${target})`, 'Deploying')
  if (
    !complete ||
    !relevant.length ||
    !relevant.every(releasePassed) ||
    !builds.every(releasePassed) ||
    builds.some(
      (build) => !relevant.some((deploy) => deploy.workflow === build.workflow && releasePassed(deploy))
    )
  )
    return result('Not confirmed', 'Merged')
  return result(`Deployment checks passed (${target})`, 'Live')
}
export function prOf(raw, repo = DEFAULT_SOURCE_REPOSITORY) {
  const commit = raw.commits?.nodes?.[0]?.commit
  const matchesHead = Boolean(commit?.oid && commit.oid === raw.headRefOid)
  const { checks, complete } = checksOf(commit)
  const build = buildOf(checks, complete, matchesHead, raw.isDraft)
  const queue = raw.mergeQueueEntry
  const approved = raw.reviewDecision === 'APPROVED'
  let state = 'Waiting to start',
    next = 'Checks will start when a machine becomes available.'
  if (raw.mergedAt) {
    state = 'Merged'
    next = 'The PR is in the target branch. Check deployment separately below.'
  } else if (raw.state === 'CLOSED') {
    state = 'Closed'
    next = 'This PR was closed without merging.'
  } else if (raw.isDraft) {
    state = 'Draft'
    next = 'The author needs to mark this PR ready for review.'
  } else if (build === 'Unknown') {
    state = 'Status unknown'
    next =
      'GitHub has not returned a complete result for the latest commit. Check GitHub or wait for the next update.'
  } else if (raw.mergeable === 'CONFLICTING') {
    state = 'Merge conflict'
    next = 'The author needs to resolve conflicting changes, then run checks again.'
  } else if (build === 'Failed') {
    state = 'Needs a fix'
    next = 'The author needs to fix the failed check below and run it again.'
  } else if (build === 'Cancelled' || build === 'Incomplete') {
    state = 'Checks incomplete'
    next =
      'A check was cancelled or Tracy CI has not passed. The author needs a complete CI run on this commit.'
  } else if (build === 'Building') {
    state = 'Testing'
    next = 'Wait for checks on the latest commit to finish.'
  } else if (build === 'Ready') {
    if (raw.reviewDecision === 'CHANGES_REQUESTED') {
      state = 'Changes requested'
      next = 'The author needs to address the reviewer’s requested changes.'
    } else if (raw.reviewDecision === 'REVIEW_REQUIRED') {
      state = 'Waiting for review'
      next = 'A reviewer needs to approve the latest changes.'
    } else if (
      raw.mergeable !== 'MERGEABLE' ||
      !['CLEAN', 'HAS_HOOKS', 'UNSTABLE'].includes(raw.mergeStateStatus)
    ) {
      state = 'Merge blocked'
      next = 'Checks passed, but GitHub has not confirmed this PR can merge. See its merge status below.'
    } else {
      state = 'Ready to merge'
      next = queue
        ? `In the ${raw.baseRefName} merge queue at position ${queue.position}.`
        : raw.mergeQueue
          ? 'Ready for merge. The author needs to add this PR to the merge queue.'
          : 'Ready for a maintainer to merge. This branch has no GitHub merge queue.'
    }
  }
  const bad = checks.find(failed)
  const active = checks.find((check) => check.status === 'IN_PROGRESS')
  const started = checks.some((check) => check.startedAt && check.conclusion !== 'SKIPPED')
  const progress = raw.mergedAt
    ? { value: 100, label: 'Merged', tone: 'done' }
    : !matchesHead || !complete || raw.isDraft || !started
      ? null
      : {
          value:
            build === 'Ready'
              ? queue
                ? 85
                : approved
                  ? 80
                  : 65
              : Math.min(
                  59,
                  10 + Math.round((checks.filter(passed).length / Math.max(checks.length, 1)) * 45)
                ),
          label: state,
          tone: build === 'Failed' ? 'failed' : build === 'Building' ? 'running' : 'waiting'
        }
  const deployment = deploymentOf(raw)
  return {
    id: raw.number,
    title: raw.title,
    url: `https://github.com/${repo}/pull/${raw.number}`,
    authorId:
      raw.author?.databaseId == null
        ? `login:${raw.author?.login ?? 'unknown'}`
        : String(raw.author.databaseId),
    author: raw.author?.name || raw.author?.login || 'Unknown author',
    login: raw.author?.login ?? null,
    commit: raw.headRefOid,
    mergeCommit: raw.mergeCommit?.oid ?? null,
    createdAt: stamp(raw.createdAt),
    updatedAt: stamp(raw.updatedAt),
    committedAt: matchesHead ? stamp(commit.committedDate) : null,
    mergedAt: stamp(raw.mergedAt),
    target: raw.baseRefName,
    state,
    build,
    next,
    merged: Boolean(raw.mergedAt),
    queue: queue?.position ?? null,
    queuedAt: stamp(queue?.enqueuedAt),
    queueState: queue?.state ?? null,
    estimateSeconds:
      Number.isFinite(queue?.estimatedTimeToMerge) && queue.estimatedTimeToMerge >= 0
        ? queue.estimatedTimeToMerge
        : null,
    queueEnabled: Boolean(raw.mergeQueue),
    mergeState: raw.mergeStateStatus,
    review: raw.reviewDecision,
    checks,
    checksComplete: complete && matchesHead,
    progress,
    deployment,
    note: bad
      ? `${bad.name} needs a fix`
      : active
        ? `Running: ${active.name}`
        : queue
          ? `Queue #${queue.position}`
          : raw.mergedAt
            ? deployment.label
            : next,
    detail: raw.isDraft
      ? 'The author is still working on this PR.'
      : build === 'Ready'
        ? 'Checks passed on the latest commit.'
        : 'Check results are from the latest reported commit.',
    outcome:
      bad?.summary ||
      (bad
        ? 'GitHub reported a failed check. Open that check for the failure details.'
        : build === 'Ready'
          ? 'Tracy CI passed on this commit.'
          : 'No final successful CI result yet.')
  }
}

export function createCiReader(options) {
  const repo = options.repo ?? DEFAULT_SOURCE_REPOSITORY
  const deliveryReader =
    options.deliveryReader === undefined
      ? createDeliveryReader({ ...options, repo, link: githubLink })
      : options.deliveryReader
  options = { ...options, repo, deliveryReader }
  const readers = new Map()
  const detailReader = createSnapshotReader(options)
  return {
    list(input) {
      if (!input) return detailReader.list()
      const scope = ciScope(input),
        key = JSON.stringify(scope)
      let reader = readers.get(key)
      if (!reader) {
        reader = createSnapshotReader({ ...options, scope })
        readers.set(key, reader)
        if (readers.size > 8) readers.delete(readers.keys().next().value)
      }
      return reader.list()
    },
    detail(number) {
      return detailReader.detail(number)
    }
  }
}
function createSnapshotReader({
  token,
  repo,
  fetchImpl = fetch,
  now = Date.now,
  executionReader,
  deliveryReader,
  scope
}) {
  const execution =
    executionReader === undefined
      ? createExecutionReader({ token, repo, link: githubLink, fetchImpl, now })
      : executionReader
  let snapshot = null,
    pending = null,
    retryAt = 0,
    error = null
  const details = new Map()
  async function query(queryText, variables = {}, budget) {
    if (!token) throw new Error('CI GitHub access is not configured. Set TRACY_CI_GITHUB_TOKEN on tracy-web.')
    const response = await fetchImpl('https://api.github.com/graphql', {
      method: 'POST',
      redirect: 'error',
      signal: budget ? AbortSignal.any([AbortSignal.timeout(15000), budget]) : AbortSignal.timeout(15000),
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'content-type': 'application/json',
        'user-agent': 'tracy-web-ci'
      },
      body: JSON.stringify({
        query: queryText,
        variables: { owner: repo.split('/')[0], repo: repo.split('/')[1], ...variables }
      })
    })
    if (!response.ok)
      throw new Error(
        `GitHub could not return CI data (HTTP ${response.status}). Check token access and the GitHub rate limit.`
      )
    const body = await response.json()
    if (body.errors?.length || (!body.data?.repository && !body.data?.search))
      throw new Error(
        'GitHub could not return complete CI data. Check token permissions and repository access.'
      )
    return body.data.repository ?? body.data
  }
  async function refresh() {
    const raw = [],
      seen = new Set()
    let cursor = null,
      truncated = false
    if (scope) {
      const bounds = scopeBounds(scope, now())
      const budget = AbortSignal.timeout(60000)
      const branches = scope.branch === 'All' ? ['develop', 'staging', 'main'] : [scope.branch]
      const searches = branches.flatMap((branch) =>
        (scope.dateField === 'merged' ? ['merged'] : ['open', 'merged']).map((state) => ({
          branch,
          state,
          cursor: null,
          done: false
        }))
      )
      // Bound wide historical reads. A capped result is explicitly incomplete, never a full total.
      for (let reads = 0; reads < 20 && searches.some((search) => !search.done); ) {
        const batch = searches.filter((search) => !search.done).slice(0, 20 - reads)
        reads += batch.length
        await Promise.all(
          batch.map(async (search) => {
            const terms = [
              `repo:${repo}`,
              'is:pr',
              `is:${search.state}`,
              `base:${search.branch}`,
              'sort:updated-desc'
            ]
            if (bounds.from && bounds.to) terms.push(`${scope.dateField}:${bounds.from}..${bounds.to}`)
            else if (bounds.from) terms.push(`${scope.dateField}:>=${bounds.from}`)
            else if (bounds.to) terms.push(`${scope.dateField}:<${bounds.to}`)
            const { search: connection } = await query(
              CI_SEARCH_QUERY,
              {
                query: terms.join(' '),
                cursor: search.cursor
              },
              budget
            )
            if (
              !connection ||
              !Array.isArray(connection.nodes) ||
              !Number.isSafeInteger(connection.issueCount) ||
              !connection.pageInfo
            )
              throw new Error('Incomplete GitHub search response')
            for (const pr of connection.nodes)
              if (
                pr &&
                ['OPEN', 'MERGED'].includes(pr.state) &&
                inScope(pr, bounds) &&
                !seen.has(pr.number)
              ) {
                raw.push(pr)
                seen.add(pr.number)
              }
            search.done = !connection.pageInfo.hasNextPage
            if (
              !search.done &&
              (!connection.pageInfo.endCursor || connection.pageInfo.endCursor === search.cursor)
            )
              throw new Error('Invalid GitHub search cursor')
            search.cursor = connection.pageInfo.endCursor
            // Search may stop at GitHub's result ceiling despite a larger reported count.
            if (search.done && connection.issueCount > 1000) truncated = true
          })
        )
      }
      truncated ||= searches.some((search) => !search.done)
    } else {
      for (let page = 0; page < 5; page++) {
        const repository = await query(CI_LIST_QUERY, { cursor })
        for (const pr of [...(repository.open.nodes ?? []), ...(repository.merged.nodes ?? [])]) {
          if (pr && ['main', 'staging', 'develop'].includes(pr.baseRefName) && !seen.has(pr.number)) {
            raw.push(pr)
            seen.add(pr.number)
          }
        }
        if (!repository.open.pageInfo.hasNextPage) break
        cursor = repository.open.pageInfo.endCursor
        truncated = page === 4
      }
    }
    details.clear()
    const measuredAt = new Date(now()).toISOString()
    const delivered = deliveryReader
      ? await deliveryReader.enrich(raw.map((pr) => prOf(pr, repo)))
      : raw.map((pr) => prOf(pr, repo))
    const observed = execution ? await execution.enrich(delivered) : { rows: delivered }
    snapshot = {
      ...observed,
      measuredAt,
      truncated,
      recentMergedLimit: scope ? null : 30,
      scope: scope ?? null
    }
    error = null
  }
  return {
    async list() {
      if (now() >= retryAt) {
        if (!pending)
          pending = refresh()
            .catch(() => {
              error = token
                ? 'GitHub CI data could not be refreshed. Check GitHub access or try again later.'
                : 'CI GitHub access is not configured. Set TRACY_CI_GITHUB_TOKEN on tracy-web.'
            })
            .finally(() => {
              retryAt = now() + 30000
              pending = null
            })
        await pending
      }
      return {
        ...(snapshot ?? { rows: [], measuredAt: null, truncated: false, recentMergedLimit: 30 }),
        stale: Boolean(error && snapshot),
        error,
        configured: Boolean(token)
      }
    },
    async detail(number) {
      const previous = details.get(number)
      const current = snapshot?.rows.find((row) => row.id === number)
      if (previous && now() - previous.at < 30000 && (!current || current.commit === previous.row.commit))
        return previous.row
      const data = await query(CI_DETAIL_QUERY, { number })
      const raw = data.pullRequest
      if (!raw || !['main', 'staging', 'develop'].includes(raw.baseRefName)) return null
      const row = prOf(raw, repo)
      const head = raw.head?.nodes?.[0]?.commit
      if (head?.oid === row.commit) {
        const runs = new Map(
          (head.statusCheckRollup?.contexts?.nodes ?? []).map((check) => [
            String(check.databaseId),
            check.steps
          ])
        )
        for (const check of row.checks) {
          const steps = runs.get(check.id)
          check.steps = (steps?.nodes ?? []).map((step) => ({ ...step, name: clip(step.name, 250) }))
          check.stepsComplete = !steps?.pageInfo?.hasNextPage
        }
      }
      const delivered = deliveryReader ? (await deliveryReader.enrich([row]))[0] : row
      const enriched = execution ? (await execution.enrich([delivered])).rows[0] : delivered
      details.set(number, { row: enriched, at: now() })
      if (details.size > 100) details.delete(details.keys().next().value)
      return enriched
    }
  }
}
