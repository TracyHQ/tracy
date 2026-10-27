import { strict as assert } from 'node:assert'
import test from 'node:test'
import { planJoomlaContract, coworkWouldRefuse } from '../src/plan-joomla-contract.mjs'

// A page whose menu item opens one article directly (`view=article&id=555`) shows THAT article's
// words as its body. Measured 23/09/2026 on a Tracy Business 1.2.0 site built end to end (j-0a8tgu):
// the seed planned the page's menu item and modules but not its article, so the About page kept the
// demo company's description — now saying the customer's name through `{site.name}`.
const page = {
  entity: 'menuItem-600',
  route: 'about',
  link: 'index.php?option=com_content&view=article&id=555',
  assignedModules: [{ entity: 'module-425' }]
}

test("a page's own article is planned with the page, not left as demo copy", async () => {
  const seen = []
  await planJoomlaContract({
    state: {
      contract: 'test/v1',
      revision: 'r1',
      pages: [page],
      slots: [
        {
          key: 'article-555.0',
          entity: 'article-555',
          sample: 'Northgate is a general contractor.',
          maxCharacters: 200
        },
        { key: 'article-556.0', entity: 'article-556', sample: 'Another page body.', maxCharacters: 200 },
        { key: 'module-425.0', entity: 'module-425', sample: 'Switch language', maxCharacters: 60 }
      ]
    },
    site: { name: 'Sarah' },
    surface: 'pages',
    now: new Date('2026-09-23T00:00:00Z'),
    generate: async ({ input }) => {
      seen.push(...input.slots.map((s) => s.key))
      return JSON.stringify({ values: {}, pending: input.slots.map((s) => s.key) })
    }
  })
  assert.deepEqual(seen.sort(), ['article-555.0', 'module-425.0'])
})

test('a value that keeps an identity token is not refused as a Joomla directive', () => {
  assert.equal(coworkWouldRefuse({ type: 'text' }, 'Why {site.name}'), null)
  assert.equal(coworkWouldRefuse({ type: 'text' }, '{loadposition hero}'), 'directive')
  assert.equal(coworkWouldRefuse({ type: 'text' }, 'Why {site.evil}'), 'directive')
})
