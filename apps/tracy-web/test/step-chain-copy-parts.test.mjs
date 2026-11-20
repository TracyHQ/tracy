// A chain build writes its copy step's first draft in five parts (step-chain-steps.js COPY_PARTS,
// site-writer/writer-parts.js): eight were no faster on dev (lat20) at four times the spend. No database, no bench.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MAX_PARALLEL_PAGES, parallelPagesProblem } from '../src/site-writer/writer-parts.js'
import { COPY_PARTS } from '../src/step-chain-steps.js'

test("the copy step's first draft is written in parts the writer takes, below its ceiling", () => {
  assert.equal(parallelPagesProblem(COPY_PARTS), null)
  assert.ok(COPY_PARTS > 1 && COPY_PARTS < MAX_PARALLEL_PAGES, `${COPY_PARTS}`)
  assert.match(parallelPagesProblem(MAX_PARALLEL_PAGES + 1), /from 1 to 8/)
})
