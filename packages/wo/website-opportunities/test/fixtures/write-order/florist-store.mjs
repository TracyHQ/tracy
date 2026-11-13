// An invented template's AI quickstart declarations for the write order tests (ticket #597): a block store with a light
// and dark hero pair, item cards with a price, a photo, an icon and a derived item page link, a gallery, a contact block
// with a child list of network icons kept as font classes, a masthead keyed to the pages, a footer row of network icons
// kept as image files, and the page recipes. Stored places are generated per record. Nothing here is a real template.

const text = (name, kind, limit, extra = {}) => ({ name, kind, type: 'text', limit, ...extra })
const link = (name, kind, extra = {}) => ({ name, kind, type: 'link', ...extra })
const frame = (width, height) => ({ frame: { width, height } })
/** `count` stored places on one record, from a starting column. */
const places = (record, from, count) => Array.from({ length: count }, (_, n) => `${record}.${from + n}`)
const SOCIAL_ROWS = 3
const PAGE_ROWS = 3

export const FLORIST_TEMPLATE = Object.freeze({
  slug: 'example-petal',
  name: 'Example Petal',
  version: '1.0.0',
  accent: '#7a4e8c'
})

function header() {
  return {
    id: 'header-main',
    type: 'header',
    positions: ['header'],
    items: { min: 1, max: 1 },
    noData: { rule: 'hide' },
    fields: [
      text('cta_label', 'contact.cta_label', 24, { slot: 'module-1.1' }),
      link('cta_link', 'contact.cta_url', { slot: 'module-1.2' }),
      { name: 'sticky', type: 'design', slot: 'module-1.3' }
    ]
  }
}

function masthead() {
  return {
    id: 'masthead',
    type: 'text',
    positions: ['title'],
    items: { min: 1, max: 1 },
    noData: { rule: 'fallback', fallback: 'the default title of the template' },
    fields: [text('default-title', 'editorial.heading', 30, { slot: 'module-2.1' })],
    lists: [
      {
        name: 'pages',
        label: 'Page headings',
        items: { min: 0, max: PAGE_ROWS },
        itemsFrom: { min: 'a page without a row shows the default title', max: 'the rows the module stores' },
        fields: [
          text('title', 'editorial.heading', 30, { slots: [places('module-2', 10, PAGE_ROWS)] }),
          link('page', 'editorial.navigation_url', {
            derived: 'the page of the row',
            keyAt: [
              Array.from({ length: PAGE_ROWS }, (_, n) => ({
                entity: 'module-2',
                column: 'params',
                jsonPath: ['rows', 'page', n]
              }))
            ]
          })
        ]
      }
    ]
  }
}

function hero() {
  return {
    id: 'hero-home',
    type: 'hero',
    positions: ['masthead'],
    items: { min: 1, max: 1 },
    noData: { rule: 'fallback', fallback: 'the template picture' },
    fields: [
      text('heading', 'business.tagline', 42, { slot: 'module-3.1' }),
      {
        name: 'photo',
        kind: 'business.hero_image',
        type: 'image',
        theme: 'light',
        slot: 'module-3.2',
        ...frame(1600, 900)
      },
      {
        name: 'photo-dark',
        kind: 'business.hero_image',
        type: 'image',
        theme: 'dark',
        variantOf: 'photo',
        slot: 'module-3.3',
        ...frame(1600, 900)
      },
      { name: 'background', type: 'design', slot: 'module-3.4' }
    ]
  }
}

function bouquets() {
  const per = (n) => [`article-1.${n}`, `article-2.${n}`, `article-3.${n}`, `article-4.${n}`]
  return {
    id: 'bouquets',
    itemsLabel: 'Bouquets',
    type: 'services',
    positions: ['content'],
    items: { min: 2, max: 4 },
    noData: { rule: 'hide' },
    fields: [text('heading', 'editorial.heading', 30, { slot: 'module-4.1' })],
    itemFields: [
      text('name', 'offering.name', 30, { slots: per(1) }),
      { name: 'price', kind: 'offering.price', type: 'number', slots: per(2) },
      { name: 'photo', kind: 'offering.image', type: 'image', slots: per(3), ...frame(600, 600) },
      {
        name: 'icon',
        kind: 'editorial.item_icon',
        type: 'icon',
        storage: 'image-file',
        for: ['name'],
        slots: per(4),
        ...frame(48, 48)
      },
      link('more', 'editorial.navigation_url', { derived: 'the item page address' })
    ]
  }
}

function gallery() {
  return {
    id: 'gallery-strip',
    itemsLabel: 'Gallery photos',
    type: 'gallery',
    positions: ['content'],
    items: { min: 3, max: 6 },
    noData: { rule: 'hide' },
    itemFields: [
      {
        name: 'photo',
        kind: 'business.gallery_image',
        type: 'image',
        slots: places('module-5', 1, 6),
        ...frame(800, 800)
      }
    ],
    fields: []
  }
}

function contact() {
  return {
    id: 'contact-strip',
    type: 'contact',
    positions: ['content'],
    items: { min: 1, max: 1 },
    noData: { rule: 'hide' },
    fields: [
      link('phone', 'contact.phone', { slot: 'module-6.1' }),
      link('email', 'contact.email', { slot: 'module-6.2' }),
      text('address', 'contact.address', 80, { slot: 'module-6.3' }),
      text('hours', 'contact.hours', 80, { slot: 'module-6.4' })
    ],
    lists: [
      {
        name: 'social',
        label: 'Social links',
        items: { min: 0, max: SOCIAL_ROWS },
        itemsFrom: { min: 'the block lays out without a link', max: 'the rows the module stores' },
        fields: [
          link('link', 'contact.social_url', { slots: [places('module-6', 10, SOCIAL_ROWS)] }),
          {
            name: 'network-icon',
            kind: 'editorial.item_icon',
            type: 'icon',
            storage: 'class-name',
            iconOf: 'network',
            slots: [places('module-6', 20, SOCIAL_ROWS)],
            ...frame(18, 18)
          }
        ]
      }
    ]
  }
}

function footer() {
  return {
    id: 'footer-main',
    itemsLabel: 'Social links',
    type: 'footer',
    positions: ['footer'],
    items: { min: 0, max: 3 },
    noData: { rule: 'hide' },
    fields: [text('copyright', 'business.copyright', 80, { slot: 'module-7.1' })],
    itemFields: [
      link('social-url', 'contact.social_url', { slots: places('module-7', 10, 3) }),
      {
        name: 'social-icon',
        kind: 'editorial.item_icon',
        type: 'icon',
        storage: 'image-file',
        iconOf: 'network',
        slots: places('module-7', 20, 3),
        ...frame(32, 32)
      }
    ]
  }
}

function detail() {
  return {
    id: 'bouquet-detail',
    itemsLabel: 'Bouquets',
    type: 'services',
    positions: ['content'],
    items: { min: 1, max: 1 },
    noData: { rule: 'hide' },
    fields: [text('heading', 'editorial.heading', 40, { slot: 'article-9.1' })],
    itemFields: [
      text('name', 'offering.name', 30, { slots: ['article-9.2'] }),
      text('description', 'offering.description', 160, { slots: ['article-9.3'] })
    ]
  }
}

/** The invented block store description. */
export const floristBlockStore = () => ({
  schema: 'tracy-ai-quickstart-block-store/v1',
  roleVocabularyVersion: 'place-content-roles/3',
  template: { slug: FLORIST_TEMPLATE.slug, version: FLORIST_TEMPLATE.version },
  blocks: [header(), masthead(), hero(), bouquets(), gallery(), contact(), footer(), detail()]
})

/** The invented page recipes. */
export const floristPageRecipes = () => ({
  schema: 'tracy-ai-quickstart-page-recipes/v1',
  recipes: [
    {
      pageType: 'home',
      mainBlock: 'hero-home',
      blocks: [
        'header-main',
        'masthead',
        'hero-home',
        'bouquets',
        'gallery-strip',
        'contact-strip',
        'footer-main'
      ]
    },
    {
      pageType: 'bouquet',
      mainBlock: 'bouquet-detail',
      blocks: ['header-main', 'masthead', 'bouquet-detail', 'footer-main']
    },
    {
      pageType: 'contact',
      mainBlock: 'contact-strip',
      blocks: ['header-main', 'masthead', 'contact-strip', 'footer-main']
    }
  ]
})
