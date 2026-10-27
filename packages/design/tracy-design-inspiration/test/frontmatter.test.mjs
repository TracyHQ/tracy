import assert from 'node:assert/strict'
import { test } from 'node:test'

import { splitFrontmatter } from '../src/client/frontmatter.mjs'

test("splitFrontmatter: the brand engine's block comes off with its scalars; a vendored file passes untouched", () => {
  const brand =
    '---\nname: "lucaswp.tracy.ai"\ncategory: Brands\ncolors:\n  accent: "#0071e3"\n---\n\n# lucaswp.tracy.ai\n\n> Category: Brands\n'
  const out = splitFrontmatter(brand)
  assert.equal(out.body, '\n# lucaswp.tracy.ai\n\n> Category: Brands\n')
  assert.deepEqual(out.meta, { name: 'lucaswp.tracy.ai', category: 'Brands' })
  const vendored = '# Design System Inspired by Airbnb\n\n> Category: E-Commerce & Retail\n'
  assert.deepEqual(splitFrontmatter(vendored), { body: vendored, meta: {} })
  assert.deepEqual(splitFrontmatter('--- not a block\n'), { body: '--- not a block\n', meta: {} })
})
