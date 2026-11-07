// The WordPress page path rule lives once (`content-coverage/lib/wordpress-page-path.mjs`) and the tracy-web image, which
// carries no `packages/`, reads a byte-identical mirror under `src/`. This test keeps the two equal.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8')

test('the tracy-web mirror of the WordPress page path rule is byte-identical to the canonical file', () => {
  assert.equal(
    read('../../apps/tracy-web/src/lib/template-readiness/wordpress-page-path.mjs'),
    read('../../packages/cms/tracy-quickstart-tools/content-coverage/lib/wordpress-page-path.mjs')
  )
})
