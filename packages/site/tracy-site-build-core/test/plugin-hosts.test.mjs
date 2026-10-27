// Each Build plugin's host declares exactly the services the shared half (`makeSiteBuildHost`) reads:
// cordis throws on the first `ctx.<service>` read outside `inject`, so a drift is a dead plugin.
// Cross-file naming (row id, package name, tab, stages, words) is the `plugin-contracts` gate's job.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import * as emdash from '../../tracy-site-build-emdash/src/host/index.ts'
import * as joomla from '../../tracy-site-build-joomla/src/host/index.ts'
import * as wordpress from '../../tracy-site-build-wordpress/src/host/index.ts'

const HOSTS = { joomla, wordpress, emdash }

for (const [id, host] of Object.entries(HOSTS))
  test(`${id}: host injects exactly what the shared half reads, under its own name`, () => {
    assert.equal(host.name, `tracy-site-build-${id}`)
    assert.deepEqual([...host.inject].sort(), [...host.expectedInject].sort())
  })
