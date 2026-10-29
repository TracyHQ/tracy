import assert from 'node:assert/strict'
import test from 'node:test'
import { proposeContentMapRoles } from '../slot-roles/rule-tables.mjs'
import { checkContentMapRoles } from '../../packages/wo/website-opportunities/domain/content-map-roles.mjs'

for (const cms of ['joomla', 'wordpress']) {
  test(`${cms}: offering list excerpts bind to the offering, including previously generic paragraphs`, () => {
    const entity = cms === 'joomla' ? 'article-31' : 'page-services'
    const column = cms === 'joomla' ? 'introtext' : 'post_excerpt'
    const group = { id: `${entity}.offering`, kind: 'service', item: 0 }
    const { contentMap } = proposeContentMapRoles(
      {
        slots: [
          {
            key: `${entity}.title`,
            entity,
            column: 'title',
            type: 'text',
            sample: 'Garden care',
            role: 'offering.name',
            group
          },
          {
            key: `${entity}.intro`,
            entity,
            column,
            type: 'text',
            sample: 'Demo garden words',
            role: 'editorial.paragraph'
          },
          {
            key: 'article-32.intro',
            entity: 'article-32',
            column,
            type: 'text',
            sample: 'A journal entry',
            role: 'article.lead'
          }
        ]
      },
      { cms, vocabulary: 'place-content-roles/3' }
    )
    assert.equal(contentMap.slots[1].role, 'offering.summary')
    assert.deepEqual(contentMap.slots[1].group, group)
    assert.equal(contentMap.slots[2].role, 'article.lead')
    assert.deepEqual(checkContentMapRoles(contentMap).errors, [])
  })
}
