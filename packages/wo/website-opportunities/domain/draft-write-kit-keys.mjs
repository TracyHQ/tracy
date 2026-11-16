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
    writtenAs: 'read: the accent module (draft-write-plan-accent.mjs)',
    value: 'not read: says the accent is a #rrggbb colour',
    sides: READ,
    keeps: 'not read: prose',
    why: 'not read: prose'
  },
  'look.accent.writtenAs': {
    kind: 'read: only "module" is known, any other value stops (accent_written_as_unknown)',
    module: READ,
    title: READ,
    position: READ,
    ordering: READ,
    showtitle: READ,
    style: READ,
    assign: 'read: only "every-page" is known, any other value stops (accent_written_as_unknown)',
    content: 'read: only "accent-module" is known, any other value stops (accent_written_as_unknown)'
  },
  'look.accent.sides': {
    opensOn: 'read: the side the module opens on',
    light: 'not read: the body class of the light side; the light tone is written on the root',
    dark: 'not read: the body class of the dark side; the dark tone is written under darkHook',
    darkHook: 'read: the root condition of the dark tone',
    values: 'read: the order value each side takes; an unknown word stops (accent_written_as_unknown)'
  },
  'look.accent.sides.values': { light: READ, dark: READ },
  'look.favicon': {
    from: 'read: "logo" makes the icon from the logo the plan uploads (draft-write-plan-favicon.mjs)',
    fallback: 'read: "initials" draws the business initials when the plan has no logo picture',
    path: 'read: where the icon is uploaded; its extension is the format (.ico, .png; another is flagged)',
    setting:
      'not read: the template setting pointing at an images/ icon is set by the blank site (overrides.settings)',
    why: 'not read: prose'
  },
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
    positions:
      'read: a recipe block outside them is written when the list page shows its record, else skipped typed',
    assignTo: 'read: only "list-page" is known, any other value stops',
    why: 'not read: prose'
  },
  'pages.<type>.record': {
    kind: READ,
    category: READ,
    base: READ,
    facts: 'read: the business fact a column of every created record holds (draft-write-record-columns.mjs)',
    why: 'not read: prose'
  },
  'pages.<type>.record.category': {
    extension: READ,
    parent: 'read: "root", the category is made at the top level',
    title: 'read: the category title (record.category.title)',
    params: READ,
    why: 'not read: prose'
  },
  'pages.<type>.record.category.title': {
    from: 'read: only "page-name" is known, any other value stops (category_title_unknown)',
    pageType: 'read: the first plan page of this type names the category',
    fallback: 'read: only "business-name" is known, any other value stops (category_title_unknown)'
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
    keptWhen: 'read: only "any-held-block-kept" is known, any other value stops (kept_when_unknown)',
    why: 'not read: prose'
  },
  'placements.<id>.resets[i]': {
    location: READ,
    from: 'read: one of DRAFT_WRITE_RESET_FROM, any other value stops (reset_from_unknown)',
    value: 'read: the value a reset from "kit" writes on every copy',
    why: 'not read: prose'
  },
  'placements.<id>.menu': { menutype: READ, items: READ, why: 'not read: prose' },
  'placements.<id>.menu.items': {
    from: READ,
    max: READ,
    pageTypes: 'read: by menuItemPagesOf when the order gives the block no items',
    level: 'read: by menuItemPagesOf when the order gives the block no items',
    except: 'read: by menuItemPagesOf when the order gives the block no items',
    plus: 'read: by menuItemPagesOf when the order gives the block no items',
    order: 'read: by menuItemPagesOf; items the order gives keep the order it gives',
    link: 'read: only "page-address" is known (a url item), any other value stops (menu_items_link_unknown)',
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
    fields: 'read: a group of fields taken off the page when the record holds none of them',
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

/** The sources of a placement reset the write knows (draft-write-plan-copies.mjs); any other stops the plan. */
export const DRAFT_WRITE_RESET_FROM = Object.freeze([
  'buildSets',
  'hides',
  'container',
  'recipe',
  'demo',
  'kit'
])

/** The values of the hide keys the write knows; any other value is unknown to it. */
export const DRAFT_WRITE_HIDE_VALUES = Object.freeze({
  // Any other way stops the plan (`hide_by_unknown`).
  by: ['empty', 'rows.remove', 'setting', 'omit', 'row', 'unassign'],
  scope: ['item', 'block'],
  from: ['first-item'],
  order: ['packed']
})
