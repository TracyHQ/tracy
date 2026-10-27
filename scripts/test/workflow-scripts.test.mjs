// The `check-workflow-scripts` gate reads what the workflows RUN. This suite calls the checker
// directly with YAML broken one way at a time — Node 24 strips TypeScript types on a direct
// `import`, so the function exported from `check-workflow-scripts.ts` runs inside `node --test`
// (the glob `pnpm test:workers` uses) with no temporary tree and no build step.
//
// Each way of getting it wrong, in a cut-down fixture, must be red with a message naming the path.
// That the repo's REAL workflows are green is the job of the `workflow-scripts` gate in
// `scripts/check-all.ts` (same function over the real `.github/workflows/`); breaking a real file
// to prove a point invites a PR nobody wants.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkWorkflowScripts } from '../check-workflow-scripts.ts'

/** Every path exists — isolates "did it FIND the call" from "did it judge the path". */
const allPresent = () => true

test('a workflow calling a script that does not exist is caught, and the message names the path', () => {
  const yml = `
jobs:
  build:
    steps:
      - name: Stage the CMS themes and the seeder
        run: |
          set -euo pipefail
          packages/fleet/tracy-fleet-operation/scripts/tools/stage-cms-themes.sh
`
  const problems = checkWorkflowScripts(yml, 'fixture.yml', () => false)
  assert.equal(problems.length, 1)
  assert.match(problems[0].message, /stage-cms-themes\.sh/)
  assert.equal(problems[0].file, 'fixture.yml')
})

test('the same call is silent when the script is there', () => {
  const yml = `
jobs:
  build:
    steps:
      - run: packages/fleet/tracy-fleet-operation/scripts/tools/stage-cms-seeder.sh
`
  assert.deepEqual(checkWorkflowScripts(yml, 'fixture.yml', allPresent), [])
})
