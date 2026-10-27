/** Templates Management: the template list, one template's page, and a release's listing status and press. */
export const NS = 'cms-templates'

/** Files whose visible words belong to this namespace (paths under `src/`; the gate scans them). */
export const SCREENS = [
  'cms/Templates.tsx',
  'cms/TemplateDetail.tsx',
  'cms/templates-model.ts',
  'cms/ListingPress.tsx',
  'cms/ListingStatusStrip.tsx',
  'cms/listing-compare.ts'
] as const

export const en = {
  'cms-templates.list.lead': 'What customers on <host>{host}</host> can pick, and every release on GitHub.',
  'cms-templates.list.thisServer': 'this server',
  'cms-templates.list.notFound': 'No template called {id} on this server.',
  'cms-templates.list.loadingTitle': 'Reading the templates',
  'cms-templates.list.loadingRows': 'Reading releases and cards',
  'cms-templates.list.emptyTab': 'No template in this tab.',
  'cms-templates.list.emptyFilters': 'No template matches these filters.',
  'cms-templates.list.search': 'Search templates',
  'cms-templates.list.allCms': 'All',
  'cms-templates.list.tabsLabel': 'Status on Tracy',
  'cms-templates.list.publishedHint': 'Customers can pick these on Design templates',
  'cms-templates.list.disabledHint': 'Hidden from customers',
  'cms-templates.list.openRow': 'Open {label}',

  'cms-templates.errors.answered': 'The server answered {status}.',
  'cms-templates.errors.refreshAnswered': 'The refresh answered {status}.',

  'cms-templates.sync.label': 'Sync GitHub',
  'cms-templates.sync.lastRead': 'Releases last read from GitHub: {when}',
  'cms-templates.sync.notRead': 'Not read from GitHub yet',
  'cms-templates.sync.never': 'never',
  'cms-templates.sync.again': 'Read the releases again from GitHub',

  'cms-templates.dsIssues.title': 'Design system issues',
  'cms-templates.dsIssues.lead':
    'Caused by the design system itself on most templates, so no template counts them. Fix the system.',
  'cms-templates.dsIssues.measured': 'On {lines} of {of} templates measured.',
  'cms-templates.dsIssues.fix': 'Fix: {fix}',

  'cms-templates.categories.all': 'All categories',
  'cms-templates.categories.picked_one': '{count} category',
  'cms-templates.categories.picked_other': '{count} categories',
  'cms-templates.categories.none': 'No category in this tab',
  'cms-templates.categories.clear': 'Clear filter',

  'cms-templates.table.card': 'Card',
  'cms-templates.table.template': 'Template',
  'cms-templates.table.version': 'Quickstart version',
  'cms-templates.table.warnings': 'Warnings',
  'cms-templates.table.issues': 'Issues',
  'cms-templates.thumb.noCard': 'No card',
  'cms-templates.thumb.none': 'none',

  'cms-templates.count.none': 'None',
  'cms-templates.count.warnings_one': '{count} warning',
  'cms-templates.count.warnings_other': '{count} warnings',
  'cms-templates.count.issues_one': '{count} issue',
  'cms-templates.count.issues_other': '{count} issues',
  'cms-templates.count.both': '{issues}, {warnings}',

  'cms-templates.state.published': 'Published',
  'cms-templates.state.disabled': 'Disabled',
  'cms-templates.state.designPack': 'Design pack',

  'cms-templates.detail.designPackLine':
    'A design pack is applied on top of a site built from a quickstart. It is not offered on Design templates.',
  'cms-templates.detail.viewCard': 'Design Templates',
  'cms-templates.detail.viewSettings': 'Quickstart settings',
  'cms-templates.detail.viewQuestions': 'Customize question',
  'cms-templates.detail.releaseGroup': 'Release',
  'cms-templates.detail.contractFirst': 'Make the content contract first (step 3).',
  'cms-templates.detail.needsUpdate': 'Needs update',
  'cms-templates.detail.contractNotNeeded': 'Not needed for a design pack',
  'cms-templates.detail.reading': 'Reading…',

  'cms-templates.actions.published': 'published',
  'cms-templates.actions.unpublished': 'unpublished',
  'cms-templates.actions.unpublishArmedTitle':
    'Press again to take this template off Design templates. Customers can no longer choose it',
  'cms-templates.actions.unpublishTitle':
    'Take this template off Design templates ({list}); the listings and their pictures are kept',
  'cms-templates.actions.unpublishArmed': 'Unpublish this template?',
  'cms-templates.actions.unpublish': 'Unpublish',
  'cms-templates.actions.publish': 'Publish',
  'cms-templates.actions.publishTitle': 'Show the saved listings on Design templates ({list})',
  'cms-templates.actions.partly_one': 'Partly done: {done} of {count} release changed.',
  'cms-templates.actions.partly_other': 'Partly done: {done} of {count} releases changed.',

  'cms-templates.needs.text': 'Needs: {list}',
  'cms-templates.needs.withCms': '{title} ({cms})',
  'cms-templates.needs.staysHidden': 'It would stay hidden',

  'cms-templates.listing.word': '{word}.',
  'cms-templates.listing.listed': 'Listed',
  'cms-templates.listing.hidden': 'Hidden',
  'cms-templates.listing.notListed': 'Not listed yet',
  'cms-templates.listing.listedNext': 'Customers can pick it.',
  'cms-templates.listing.hiddenNext': 'Saved, hidden from customers.',
  'cms-templates.listing.noContract': 'Needs a content contract (step 3).',
  'cms-templates.listing.usedOn': 'Used on Design Templates',
  'cms-templates.listing.usedOnLine': "Customers see {cms}'s pages and pictures on the card.",

  'cms-templates.press.published': '{name} published.',
  'cms-templates.press.unpublished': '{name} unpublished.',
  'cms-templates.press.unpublishArmedTitle': 'Press again to take {name} off Design templates',
  'cms-templates.press.unpublishTitle': 'Take {name} off Design templates; its listing and pictures are kept',
  'cms-templates.press.unpublishArmed': 'Unpublish {name}?',
  'cms-templates.press.unpublish': 'Unpublish {name}',
  'cms-templates.press.publishTitle': "Show {name}'s saved listing on Design templates",
  'cms-templates.press.publish': 'Publish {name}'
} as const

export type CmsTemplatesKey = keyof typeof en
