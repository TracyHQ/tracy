// A chain build writes its copy step's first draft in as many parts as the writer takes (step-chain-steps.js
// COPY_PARTS, site-writer/writer-parts.js). No database, no bench.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MAX_PARALLEL_PAGES, parallelPagesProblem } from '../src/site-writer/writer-parts.js'
import { COPY_PARTS } from '../src/step-chain-steps.js'

test("the copy step's first draft is written in the most parts the writer takes", () => {
  assert.equal(parallelPagesProblem(COPY_PARTS), null)
  // test-quality: contract the chain asks for the writer's own ceiling, so a draft waits on the lightest heaviest part
  assert.equal(COPY_PARTS, MAX_PARALLEL_PAGES)
  assert.match(parallelPagesProblem(COPY_PARTS + 1), /from 1 to 8/)
})
