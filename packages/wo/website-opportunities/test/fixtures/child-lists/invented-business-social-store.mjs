// An invented single-person hero block whose social list takes the BUSINESS links (kind contact.social_url), shaped
// exactly like the JA Boxing block-180 social list as the block store declared it before it moved to person.social_url
// (ticket #615). It is declared here so a test about business links does not depend on the real template's store.
export const BUSINESS_SOCIAL_BLOCK = 'invented-hero'

const places = (prefix, from) => [[0, 1, 2, 3].map((n) => `${prefix}.${from + n}`)]

export const businessSocialStore = () => ({
  blocks: [
    {
      id: BUSINESS_SOCIAL_BLOCK,
      type: 'team',
      source: 'template',
      positions: ['section-1'],
      items: { min: 1, max: 4 },
      fields: [
        { name: 'person-name', kind: 'person.name', type: 'text', limit: 36, slot: 'module-1.1' },
        { name: 'person-bio', kind: 'person.bio', type: 'text', limit: 707, slot: 'module-1.2' }
      ],
      lists: [
        {
          name: 'social',
          items: { min: 0, max: 4 },
          fields: [
            {
              name: 'label',
              kind: 'contact.social_label',
              type: 'text',
              limit: 40,
              slots: places('module-1', 3)
            },
            { name: 'link', kind: 'contact.social_url', type: 'link', slots: places('module-1', 7) },
            {
              name: 'network-icon',
              kind: 'editorial.item_icon',
              type: 'icon',
              storage: 'class-name',
              iconOf: 'network',
              frame: { width: 18, height: 18 },
              slots: places('module-1', 12)
            }
          ]
        }
      ]
    }
  ]
})
