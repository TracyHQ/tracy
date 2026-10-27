// Illustrative records only. These numbers and timings are not GitHub observations.
export const changes = [
  {
    id: 104,
    author: 'Lee',
    title: 'Make site backups easier to find',
    state: 'Needs a fix',
    target: 'develop',
    detail: 'A safety check found a missing translation.',
    next: 'Lee needs to add the missing French text, then run checks again.',
    timing: 'Merge time unknown',
    step: 2,
    checks: ['Project setup', 'Code checks', 'Language coverage', 'Regression checks'],
    outcome: 'French text is missing for the new backup button.',
    technical: 'interface-languages · fr · tracy-site-tabs · backup.create',
    merged: false
  },
  {
    id: 103,
    author: 'David',
    title: 'Ask the right questions when creating a site',
    state: 'Testing',
    target: 'develop',
    detail: 'Checking that existing site flows still work.',
    next: 'Wait for checks to finish. Review and merge come next.',
    timing: 'Checks: about 4–8 min left',
    step: 3,
    checks: ['Project setup', 'Code checks', 'Language coverage', 'Regression checks'],
    outcome: 'Running the regression checks. No failure reported so far.',
    technical: 'build check · regression · run 2 · latest revision c7a4b21',
    merged: false
  },
  {
    id: 102,
    author: 'Hano',
    title: 'Improve the mobile contact page',
    state: 'Waiting for review',
    target: 'develop',
    detail: 'All required checks passed. A person still needs to review it.',
    next: 'A reviewer needs to approve the change before it can be merged.',
    timing: 'Merge time unknown',
    step: 4,
    checks: ['Project setup', 'Code checks', 'Language coverage', 'Regression checks'],
    outcome: 'Checks passed on the latest revision.',
    technical: 'Review required · no merge scheduled',
    merged: false
  },
  {
    id: 101,
    author: 'Lee',
    title: 'Show who joined the site team',
    state: 'Merged',
    target: 'develop',
    detail: 'Merged 12 minutes ago. The dev update is still being prepared.',
    next: 'Wait for the dev deployment to finish. This is not on production yet.',
    timing: 'Merged 12 minutes ago',
    step: 4,
    checks: ['Project setup', 'Code checks', 'Language coverage', 'Regression checks'],
    outcome: 'Merged into develop at 10:18 UTC on 8 Oct 2026.',
    technical: 'merge commit a81d390 · dev deployment in progress',
    merged: true
  },
  {
    id: 100,
    author: 'David',
    title: 'Simplify the site invitation email',
    state: 'Draft',
    target: 'develop',
    detail: 'David is still working on this change. Checks have not started.',
    next: 'David needs to mark the PR ready for review.',
    timing: 'Not scheduled',
    step: -1,
    checks: ['Project setup', 'Code checks', 'Language coverage', 'Regression checks'],
    outcome: 'The CI workflow waits until the draft is ready.',
    technical: 'pull_request.draft = true',
    merged: false
  },
  {
    id: 99,
    author: 'Hano',
    title: 'Keep sign-in text readable on small screens',
    state: 'Waiting to start',
    target: 'main',
    detail: 'Ready for checks; waiting for an available machine.',
    next: 'Checks will start when a machine becomes available.',
    timing: 'No estimate yet',
    step: -1,
    checks: ['Project setup', 'Code checks', 'Language coverage', 'Regression checks'],
    outcome: 'No check has started. This is a wait, not a failure.',
    technical: 'workflow queued · runner not assigned',
    merged: false
  }
]

// Proposed queue presentation, not a claim that TCH currently exposes a merge queue.
export const mergeQueue = [
  {
    id: 108,
    position: 1,
    waiting: 'Waiting 3 min',
    reason: 'First in line · waiting for the merge worker',
    eta: 'No confirmed merge time'
  },
  {
    id: 107,
    position: 2,
    waiting: 'Waiting 7 min',
    reason: 'Waiting for PR #108 to finish',
    eta: 'After 1 change · time unknown'
  },
  {
    id: 106,
    position: 3,
    waiting: 'Waiting 9 min',
    reason: 'Waiting for PRs #108 and #107',
    eta: 'After 2 changes · time unknown'
  }
]
changes.push(
  ...[
    { id: 108, author: 'Lee', title: 'Keep the site menu easy to navigate' },
    { id: 107, author: 'David', title: 'Make invitation links clearer' },
    { id: 106, author: 'Hano', title: 'Improve the image picker on mobile' },
    { id: 105, author: 'Lee', title: 'Clarify the backup confirmation' }
  ].map((p) => ({
    ...p,
    state: 'Ready to merge',
    target: 'develop',
    detail:
      p.id === 105
        ? 'Checks passed and review approved. Not in the merge queue yet.'
        : 'Checks passed, review approved, and added to the merge queue.',
    next:
      p.id === 105
        ? 'The author needs to add this PR to the merge queue.'
        : mergeQueue.find((q) => q.id === p.id)!.reason,
    timing: p.id === 105 ? 'Not queued · merge time unknown' : mergeQueue.find((q) => q.id === p.id)!.eta,
    step: 4,
    checks: ['Project setup', 'Code checks', 'Language coverage', 'Regression checks'],
    outcome: 'All required checks passed and the latest revision is approved. No merge conflict reported.',
    technical: 'Illustrative readiness and queue membership · no live queue API connected',
    merged: false
  }))
)
