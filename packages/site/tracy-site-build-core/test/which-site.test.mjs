/**
 * Which site a Build tab's plain GET is about.
 *
 * The tab polls `/job` and `/ask` with no session of its own, so the host used to answer from one
 * module-level variable holding "the site folder the last TOOL call worked in". That is exact only
 * while every session on the lane is about one site. Measured 09/09 on this machine: two sessions
 * were building at once, the second one's `ask` moved that variable, and the first tab fell back to
 * "Tracy is preparing a few questions…" with its own `ask.json` sitting on disk, correct and
 * unread. The tab never recovers on its own — the file it wants is one directory away and nothing
 * says so.
 *
 * The fix the old comment asked for: the routes carry the session, and the session names the site
 * the same way the tool's own `exec.agent.session.header.cwd` does.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { rootForRequest, rootForCwd, sitesRootOf } from '../src/host/host.ts'

/** A directory shaped like a site folder: `siteFolderFrom` recognises one by its working copy. */
function siteAt(name) {
  const root = path.join(mkdtempSync(path.join(tmpdir(), 'which-site-')), name)
  mkdirSync(path.join(root, '.webroot'), { recursive: true })
  return root
}

test('the session named on the query decides, not the last tool call', () => {
  const mine = siteAt('mine')
  const theirs = siteAt('theirs')
  const sessions = [
    { id: 'session-1', header: { cwd: mine } },
    { id: 'session-2', header: { cwd: theirs } }
  ]
  assert.equal(rootForRequest('/api/tracy-site-build/ask?session=session-1', sessions, theirs), mine)
  assert.equal(rootForRequest('/api/tracy-site-build/ask?session=session-2', sessions, mine), theirs)
})

test('a request deeper in the site folder still names the site folder', () => {
  const mine = siteAt('mine')
  const sessions = [{ id: 'session-1', header: { cwd: path.join(mine, 'docs', 'agents') } }]
  assert.equal(rootForRequest('/api/tracy-site-build/job?session=session-1', sessions, '/fallback'), mine)
})

test('no session on the query keeps the old answer, so a one-site lane is untouched', () => {
  const sessions = [{ id: 'session-1', header: { cwd: siteAt('mine') } }]
  assert.equal(rootForRequest('/api/tracy-site-build/ask', sessions, '/fallback'), '/fallback')
})

test('a session this lane does not know falls back rather than guessing', () => {
  const sessions = [{ id: 'session-1', header: { cwd: siteAt('mine') } }]
  assert.equal(
    rootForRequest('/api/tracy-site-build/ask?session=session-9', sessions, '/fallback'),
    '/fallback'
  )
})

/**
 * A session that stands in NO site — the shape every build of a brand-new site starts in.
 *
 * Measured 09/09 on dev-cowork, session 971ef06f: the press "Build with WordPress" opens a fresh
 * session in the workspace the customer stands in, which before any site exists is
 * `/desk-home/workspace/<id>` — outside the sites root. Both halves answered "no site folder here"
 * and fell back to the LANE root, and on a fleet host that root is `/site` itself: the directory
 * holding every customer's site, owned by root. The first tool call of the build died with
 *
 *   Error: EACCES: permission denied, mkdir '/site/docs'
 *
 * and the agent then spent thirteen more steps walking into the path fence, one refusal each. The
 * form never appeared, so nothing could be answered and no site was ever made.
 *
 * The session's own workspace is the right answer: it is writable, it is private to that session,
 * and a build for a site that does not exist yet keeps nothing a site folder would hold — every
 * stage of a `targetSiteKey` build works through the apply door, not through this directory.
 */
test('a session standing in no site keeps its own workspace, which is writable and its own', () => {
  const workspace = mkdtempSync(path.join(tmpdir(), 'not-a-site-'))
  const sessions = [{ id: 'session-1', header: { cwd: workspace } }]
  assert.equal(
    rootForRequest('/api/tracy-site-build/ask?session=session-1', sessions, '/fallback'),
    workspace
  )
})

/**
 * The sites root is never a build root, and this is the one case the rule above cannot cover.
 *
 * `/site` holds one folder per customer. A build that kept its state there would write one
 * `docs/agents/build/job.json` for the whole machine — every site's tab reading every other site's
 * job — which is why the fence in `tracy-subprocess-docker` refuses a cwd of `/site` too. On the
 * fleet the kernel refuses first (root owns it); the rule is here so the answer does not depend on
 * a permission bit.
 */
test('the sites root itself is never a build root', () => {
  const sites = sitesRootOf()
  const sessions = [{ id: 'session-1', header: { cwd: sites } }]
  assert.equal(
    rootForRequest('/api/tracy-site-build/ask?session=session-1', sessions, '/fallback'),
    '/fallback'
  )
  assert.equal(rootForCwd(sites, '/fallback'), '/fallback')
})

test('rootForCwd names the site folder when the cwd is inside one', () => {
  const mine = siteAt('mine')
  assert.equal(rootForCwd(path.join(mine, 'docs'), '/fallback'), mine)
  assert.equal(rootForCwd(mine, '/fallback'), mine)
})
