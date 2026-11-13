// An invented released contract and AI quickstart mapping file for the demo data fixture `custom.sql.txt` (the
// invented Harbor Lantern Bakery), for the blank site contract tests (#584). Two blocks the blank site keeps (the hero,
// the footer), and an article, its category and its menu item the blank site deletes. The hero's heading is a place of
// the mapping file, so the blank site empties it; the footer's title is a design line and stays.

const hero = {
  asset_id: '50',
  title: 'Hero',
  position: 'hero',
  published: '1',
  module: 'mod_ja_acm',
  params:
    '{"jatools-config":"{\\":type\\":\\"ja_bakery:hero\\",\\"hero\\":{\\"title\\":[\\"Bread, slowly\\"]}}","bg-color":"dark"}',
  client_id: '0'
}

export function releasedContract() {
  const manifest = { schema: 'tracy-quickstart-contract/v1', id: 'ja-bakery/j6/1.0.3', template: 'ja_bakery' }
  const contentMap = {
    schema: 'tracy-content-map/v1',
    entities: [
      {
        key: 'module-90',
        kind: 'module',
        sourceId: 90,
        identity: { title: 'Hero', module: 'mod_ja_acm', position: 'hero', client_id: '0' }
      },
      {
        key: 'module-91',
        kind: 'module',
        sourceId: 91,
        identity: { title: 'Footer Copy', module: 'mod_footer', position: 'copyright', client_id: '0' }
      },
      {
        key: 'category-8',
        kind: 'category',
        sourceId: 8,
        identity: { alias: 'bakery-news', extension: 'com_content' }
      },
      {
        key: 'article-1',
        kind: 'article',
        sourceId: 1,
        identity: { alias: 'fresh-rye' },
        identityReferences: { catid: 'category-8' }
      },
      {
        key: 'menuItem-102',
        kind: 'menuItem',
        sourceId: 102,
        identity: { title: 'News', menutype: 'mainmenu' }
      }
    ],
    slots: [
      {
        key: 'module-90.0',
        entity: 'module-90',
        column: 'params',
        nestedJson: 'jatools-config',
        jsonPath: ['hero', 'title', 0],
        type: 'text',
        sample: 'Bread, slowly',
        maxCharacters: 40,
        requiresEvidence: true
      },
      {
        key: 'module-90.1',
        entity: 'module-90',
        column: 'title',
        type: 'text',
        sample: 'Hero',
        maxCharacters: 100,
        requiresEvidence: false
      },
      {
        key: 'module-91.0',
        entity: 'module-91',
        column: 'title',
        type: 'text',
        sample: 'Footer Copy',
        maxCharacters: 100,
        requiresEvidence: false
      },
      {
        key: 'article-1.0',
        entity: 'article-1',
        column: 'introtext',
        xpath: '/html/body/div/p[1]',
        type: 'text',
        sample: 'Our ovens start at four.',
        maxCharacters: 80,
        requiresEvidence: true
      },
      {
        key: 'category-8.0',
        entity: 'category-8',
        column: 'title',
        type: 'text',
        sample: 'Bakery News',
        maxCharacters: 60,
        requiresEvidence: false
      }
    ],
    pages: [{ entity: 'menuItem-102', article: 'article-1' }],
    itemPages: { 'article-1': { menuItem: 'menuItem-102' } }
  }
  const lock = {
    schema: 'tracy-presentation-lock/v1',
    entities: {
      'module-90': hero,
      'module-91': {
        asset_id: '51',
        title: 'Footer Copy',
        position: 'copyright',
        published: '1',
        module: 'mod_footer',
        params: '{}',
        client_id: '0'
      },
      'category-8': {
        asset_id: '31',
        parent_id: '1',
        extension: 'com_content',
        title: 'Bakery News',
        alias: 'bakery-news',
        published: '1'
      },
      'article-1': {
        asset_id: '40',
        title: 'Fresh Rye Every Morning',
        introtext: '<p>Our ovens start at four.</p>',
        catid: '8',
        attribs: '{}',
        created_by: '42'
      },
      'menuItem-102': {
        menutype: 'mainmenu',
        title: 'News',
        link: 'index.php?option=com_content&view=category&id=8',
        parent_id: '1',
        lft: '5',
        rgt: '8',
        home: '0',
        client_id: '0'
      }
    },
    assignments: [
      { moduleid: '90', menuid: '101' },
      { moduleid: '91', menuid: '0' }
    ],
    inventoryCounts: { module: 2, category: 1, article: 1, menuItem: 1 },
    fileRoots: ['templates/ja_bakery'],
    files: { 'templates/ja_bakery/css/template.css': 'a'.repeat(64) },
    access: { entityRules: { 'modules.90': '{}', 'content.1': '{}', 'categories.8': '{}' } }
  }
  return { manifest, contentMap, lock }
}

const at = (entity, column, slot, more = {}) => ({ entity, column, slot, ...more })

export function mappingFile() {
  return {
    entities: {
      'module-90': { kind: 'module', sourceId: 90 },
      'module-91': { kind: 'module', sourceId: 91 },
      'article-1': { kind: 'article', sourceId: 1, created: true }
    },
    blocks: {
      'block-90': {
        fields: {
          heading: [
            at('module-90', 'params', 'module-90.0', {
              nestedJson: 'jatools-config',
              jsonPath: ['hero', 'title', 0]
            })
          ]
        }
      },
      'block-91': { fields: {}, designLines: [at('module-91', 'title', 'module-91.0')] },
      'block-news': {
        fields: { paragraph: [at('article-1', 'introtext', 'article-1.0', { xpath: '/html/body/div/p[1]' })] }
      }
    },
    facts: {}
  }
}

/** The block store beside the mapping file: the kit's limit of the hero heading, smaller than the released cap. */
export function blockStoreFile() {
  return {
    blocks: [
      { id: 'block-90', fields: [{ name: 'heading', type: 'text', limit: 32, slot: 'module-90.0' }] },
      { id: 'block-news', fields: [{ name: 'paragraph', type: 'text', limit: 200, slot: 'article-1.0' }] }
    ]
  }
}
