/**
 * The agent's `start` joins the Build tab's new-site build; it never starts a second one.
 *
 * The tab makes the site and gets its key back from the fleet. That key is on the job as
 * `targetSiteKey`, and every later stage knocks on that site's door with it. A tool call carries no
 * key and no way to learn one, so a job it starts is a build of the SESSION's own site — which is
 * not what anybody asked for.
 *
 * Measured 09/09, twice on a local lane: the customer's answers reached the agent, `start` ran, and
 * a second target-less job overwrote `job.json`. Its check stage read the session's own WordPress
 * and stopped with "This site runs WordPress; a Joomla site is a new site — use Add site.", while
 * the Joomla site it was supposed to report on had been built correctly at the same moment.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { joinsTabBuild } from '../src/host/host.ts'

const tabJob = { inspiration: 'airbnb', platform: 'joomla', targetSiteKey: 'quan-ca-phe.localhost' }

test('the same build the tab started, still running or already finished, is joined', () => {
  assert.equal(joinsTabBuild({ ...tabJob, status: 'running' }, 'airbnb', 'joomla'), true)
  assert.equal(joinsTabBuild({ ...tabJob, status: 'done' }, 'airbnb', 'joomla'), true)
  assert.equal(joinsTabBuild({ ...tabJob, status: 'failed' }, 'airbnb', 'joomla'), true)
})

test('a build of THIS site carries no target, so the agent may still start one', () => {
  assert.equal(
    joinsTabBuild({ inspiration: 'airbnb', platform: 'wordpress', status: 'done' }, 'airbnb', 'wordpress'),
    false
  )
})

test('a different inspiration or platform is a different build, not one to join', () => {
  assert.equal(joinsTabBuild({ ...tabJob, status: 'done' }, 'ant', 'joomla'), false)
  assert.equal(joinsTabBuild({ ...tabJob, status: 'done' }, 'airbnb', 'wordpress'), false)
})

test('no job at all is nothing to join', () => {
  assert.equal(joinsTabBuild(null, 'airbnb', 'joomla'), false)
})
