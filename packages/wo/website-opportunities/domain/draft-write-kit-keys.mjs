// Every key of the kit's build declarations the draft write knows (ticket #597), and what it does with each: `read`
// (the plan follows it), `stops` (a plan that needs it stops typed), or why it is not read. A kit that declares a key
// of these families missing here fails `domain-draft-write-kit-places.test.mjs`, so a new declaration is never ignored
// in silence. Pure data. Spec: docs/references/ai-quickstart-contract.md, "What the build writes besides the blocks".

const READ = 'read'
const ITEM = {
  link: READ,
  templateStyle: READ,
  params: READ,
  parent: 'read; a parent page type the plan has not stops (page_parent_not_in_plan)',
  home: 'not read: the order says which page is the home page',
  why: 'not read: prose'
}

/** `{family: {key: status}}`; a family's path names where it sits in the mapping file. */
export const DRAFT_WRITE_KIT_KEYS = Object.freeze({
  'look.accent': {
    variables: READ,
    writtenAs:
      'read; the accent is skipped (accent_modes_not_measured): its sheet and its two sides are not measured',
    value: 'not read: the accent is not written',
    sides: 'not read: the accent is not written',
    keeps: 'not read: prose',
    why: 'not read: prose'
  },
  'look.accent.writtenAs': Object.fromEntries(
    ['kind', 'module', 'title', 'position', 'ordering', 'showtitle', 'style', 'assign', 'content'].map(
      (k) => [k, 'not read: the accent is not written']
    )
  ),
  'pages.<type>': {
    menuItem: READ,
    under: READ,
    ownItem: 'read when the plan has no page of the list page type',
    record: READ,
    unbuilt: 'stops (page_unbuilt)'
  },
  'pages.<type>.menuItem': ITEM,
  'pages.<type>.ownItem': ITEM,
  'pages.<type>.under': { page: READ, address: READ, detailPositions: READ, why: 'not read: prose' },
  'pages.<type>.under.detailPositions': {
    positions: 'read: a block assigned to the page outside them stops (under_page_position_not_detail)',
    assignTo: 'read: only "list-page" is known, any other value stops',
    why: 'not read: prose'
  },
  'pages.<type>.record': { kind: READ, category: READ, base: READ, why: 'not read: prose' },
  'pages.<type>.record.category': {
    extension: READ,
    parent: 'read: "root", the category is made at the top level',
    title: 'not read: its from is prose; the title is the name of the list page (listTitleOf)',
    params: READ,
    why: 'not read: prose'
  },
  'pages.<type>.unbuilt': { code: 'read: the code of the stop', why: 'not read: prose' },
  'createdFrames[]': {
    entities: READ,
    column: READ,
    nestedJson: READ,
    jsonPath: READ,
    html: READ,
    why: 'not read: prose'
  },
  'placements.<id>.keyedRow': {
    pageType: READ,
    list: READ,
    row: 'not read: the block fields keyed to the page type hold the row',
    fields: 'not read: the block fields keyed to the page type hold the row',
    why: 'not read: prose'
  },
  'placements.<id>.holds': {
    blocks: READ,
    position: READ,
    copies: READ,
    why: 'not read: prose'
  },
  'placements.<id>.holds.copies': {
    perPage: READ,
    keptWhen: 'read: kept while a held block is kept (the only meaning the contract gives)',
    why: 'not read: prose'
  },
  'placements.<id>.menu': { menutype: READ, items: READ, why: 'not read: prose' },
  'placements.<id>.menu.items': {
    from: READ,
    max: READ,
    pageTypes: 'stops: a default rule not measured (menu_items_not_measured when the order gives no items)',
    level: 'stops: a default rule not measured (menu_items_not_measured when the order gives no items)',
    except: 'stops: a default rule not measured (menu_items_not_measured when the order gives no items)',
    plus: 'stops: a default rule not measured (menu_items_not_measured when the order gives no items)',
    order: 'stops: a default rule not measured; items the order gives keep the order it gives',
    default: 'not read: says the rule is a default the owner may change',
    why: 'not read: prose'
  },
  'seo.featuredView': {
    pageTypes: READ,
    needs: 'read: the why of featured_article_needed on a kit with no article',
    article: READ,
    why: 'not read: prose'
  },
  'seo.featuredView.article': {
    pageType: READ,
    set: READ,
    none: 'read: the why of featured_article_none',
    why: 'not read: prose'
  },
  'facts.<fact>[i].notWritten': { by: READ, why: 'not read: prose' },
  'hides.<id>[i]': {
    control: READ,
    rows: READ,
    by: READ,
    slots: READ,
    element: READ,
    location: READ,
    value: READ,
    row: READ,
    scope: READ,
    from: READ,
    order: READ,
    why: 'not read: prose'
  }
})

/** The values of the hide keys the write knows; any other value is unknown to it. */
export const DRAFT_WRITE_HIDE_VALUES = Object.freeze({
  scope: ['item', 'block'],
  from: ['first-item'],
  order: ['packed']
})
