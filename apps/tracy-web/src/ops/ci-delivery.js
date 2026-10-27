// A later successful deployment can contain an earlier PR's merge commit.
// Missing history, failed reads and unrelated branches never establish delivery.
const WORKFLOWS = ['build-app-images', 'build-dsh-image']
const SHA = /^[a-f0-9]{40}$/
const HISTORY = `query CiDeliveryHistory($owner:String!,$repo:String!,$sha:GitObjectID!,$cursor:String) {
  repository(owner:$owner,name:$repo) { object(oid:$sha) { ... on Commit {
    oid history(first:100,after:$cursor) { nodes { oid } pageInfo { hasNextPage endCursor } }
  } } }
}`
export function createDeliveryReader({ token, repo, link, fetchImpl = fetch, now = Date.now }) {
  const releases = new Map(),
    histories = new Map(),
    comparisons = new Map()
  async function request(url, body, budget) {
    const response = await fetchImpl(url, {
      method: body ? 'POST' : 'GET',
      redirect: 'error',
      signal: AbortSignal.any([AbortSignal.timeout(10000), budget]),
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'content-type': 'application/json',
        'user-agent': 'tracy-web-ci',
        'x-github-api-version': '2026-03-10'
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    })
    if (!response.ok) throw new Error('Deployment evidence unavailable')
    return response.json()
  }
  async function release(branch, workflow, budget) {
    const key = `${branch}:${workflow}`
    const cached = releases.get(key)
    if (cached && now() - cached.at < 30000) return cached.value
    const runs = await request(
      `https://api.github.com/repos/${repo}/actions/workflows/${workflow}.yml/runs?branch=${branch}&event=push&status=completed&per_page=20`,
      null,
      budget
    )
    if (!Array.isArray(runs.workflow_runs)) throw new Error('Incomplete deployment runs')
    const target = { develop: 'dev', staging: 'staging', main: 'prod' }[branch]
    let value = null
    // A failed fleet deployment need not invalidate a successful deployment to this target.
    for (const run of runs.workflow_runs.slice(0, 5)) {
      if (
        run.head_branch !== branch ||
        run.event !== 'push' ||
        !SHA.test(run.head_sha) ||
        !Number.isSafeInteger(run.id) ||
        !Number.isSafeInteger(run.run_attempt)
      )
        continue
      const data = await request(
        `https://api.github.com/repos/${repo}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`,
        null,
        budget
      )
      if (
        !Array.isArray(data.jobs) ||
        !Number.isSafeInteger(data.total_count) ||
        data.total_count !== data.jobs.length
      )
        throw new Error('Incomplete deployment jobs')
      const job = data.jobs.find(
        (job) =>
          job.name === `deploy-${target}` &&
          job.status === 'completed' &&
          job.conclusion === 'success' &&
          Number.isFinite(Date.parse(job.completed_at)) &&
          Number.isSafeInteger(job.id)
      )
      if (!job || !link(job.html_url)) continue
      value = {
        sha: run.head_sha,
        check: {
          id: String(job.id),
          name: job.name,
          workflow,
          runId: run.id,
          runAttempt: run.run_attempt,
          status: 'COMPLETED',
          conclusion: 'SUCCESS',
          url: link(job.html_url),
          startedAt: job.started_at ?? null,
          completedAt: job.completed_at,
          summary: null,
          steps: []
        }
      }
      break
    }
    releases.set(key, { at: now(), value })
    return value
  }
  async function readAncestors(sha, budget) {
    const found = new Set()
    let cursor = null,
      complete = false
    for (let page = 0; page < 10; page++) {
      const data = await request(
        'https://api.github.com/graphql',
        {
          query: HISTORY,
          variables: { owner: repo.split('/')[0], repo: repo.split('/')[1], sha, cursor }
        },
        budget
      )
      const commit = data.data?.repository?.object,
        history = commit?.history
      if (
        data.errors?.length ||
        commit?.oid !== sha ||
        !Array.isArray(history?.nodes) ||
        !history.pageInfo ||
        history.nodes.some((node) => !SHA.test(node?.oid))
      )
        throw new Error('Incomplete deployment ancestry')
      for (const node of history.nodes) found.add(node.oid)
      if (!history.pageInfo.hasNextPage) {
        complete = true
        break
      }
      if (!history.pageInfo.endCursor || history.pageInfo.endCursor === cursor)
        throw new Error('Invalid deployment history cursor')
      cursor = history.pageInfo.endCursor
    }
    return { found, complete }
  }
  function ancestors(sha, budget) {
    if (histories.has(sha)) return histories.get(sha)
    const pending = readAncestors(sha, budget).catch((error) => {
      histories.delete(sha)
      throw error
    })
    histories.set(sha, pending)
    if (histories.size > 20) histories.delete(histories.keys().next().value)
    return pending
  }
  async function readComparison(base, head, budget) {
    // Page two avoids downloading file diffs. Ancestry is in the comparison summary.
    const data = await request(
      `https://api.github.com/repos/${repo}/compare/${base}...${head}?per_page=1&page=2`,
      null,
      budget
    )
    if (
      data.base_commit?.sha !== base ||
      !Number.isSafeInteger(data.behind_by) ||
      !['ahead', 'behind', 'identical', 'diverged'].includes(data.status)
    )
      throw new Error('Incomplete deployment comparison')
    const value =
      ['ahead', 'identical'].includes(data.status) &&
      data.behind_by === 0 &&
      data.merge_base_commit?.sha === base
    return value
  }
  function contains(base, head, budget) {
    const key = `${base}:${head}`
    if (comparisons.has(key)) return comparisons.get(key)
    const pending = readComparison(base, head, budget)
      .then((value) => {
        comparisons.set(key, value)
        return value
      })
      .catch((error) => {
        comparisons.delete(key)
        throw error
      })
    comparisons.set(key, pending)
    if (comparisons.size > 5000) comparisons.delete(comparisons.keys().next().value)
    return pending
  }
  return {
    async enrich(rows) {
      const candidates = rows.filter(
        (row) => row.merged && SHA.test(row.mergeCommit ?? '') && row.deployment.stage !== 'Live'
      )
      if (!token || !candidates.length) return rows
      const budget = AbortSignal.timeout(30000),
        evidence = new Map()
      await Promise.all(
        [...new Set(candidates.map((row) => row.target))].map(async (branch) => {
          if (!['develop', 'staging', 'main'].includes(branch)) return
          try {
            const deployed = await Promise.all(WORKFLOWS.map((workflow) => release(branch, workflow, budget)))
            if (deployed.some((value) => !value)) return
            const history = await Promise.all(deployed.map((value) => ancestors(value.sha, budget)))
            evidence.set(branch, { deployed, history })
          } catch {
            // Preserve the exact-merge observation; unavailable evidence must not invent Live.
          }
        })
      )
      const verified = new Set(),
        missing = []
      for (const row of candidates) {
        const proof = evidence.get(row.target)
        if (
          !proof ||
          !proof.deployed.every((value) => Date.parse(value.check.completedAt) >= Date.parse(row.mergedAt))
        )
          continue
        const known = proof.deployed.map(
          (value, index) =>
            proof.history[index].found.has(row.mergeCommit) ||
            comparisons.get(`${row.mergeCommit}:${value.sha}`)
        )
        if (known.every((value) => value === true)) verified.add(row.id)
        else if (!known.includes(false)) missing.push(row)
      }
      // Older PRs outside bounded history need explicit comparisons, never guessed coverage.
      let cursor = 0
      await Promise.all(
        Array.from({ length: 4 }, async () => {
          while (cursor < Math.min(missing.length, 80)) {
            const row = missing[cursor++],
              proof = evidence.get(row.target)
            try {
              const results = await Promise.all(
                proof.deployed.map(
                  (value, index) =>
                    proof.history[index].found.has(row.mergeCommit) ||
                    contains(row.mergeCommit, value.sha, budget)
                )
              )
              if (results.every(Boolean)) verified.add(row.id)
            } catch {
              // Unknown comparisons preserve the original result.
            }
          }
        })
      )
      return rows.map((row) => {
        const proof = evidence.get(row.target)
        if (!verified.has(row.id)) return row
        return {
          ...row,
          deployment: {
            label: `Included in successful deployments (${row.target === 'main' ? 'prod' : row.target === 'develop' ? 'dev' : 'staging'})`,
            stage: 'Live',
            failed: false,
            checks: proof.deployed.map((value) => value.check),
            coverage: proof.deployed.map((value) => ({ workflow: value.check.workflow, commit: value.sha }))
          }
        }
      })
    }
  }
}
