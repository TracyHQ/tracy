/** The Design templates screens of /ops: the card sheet, the screen itself and the Design system step. */
export const NS = 'cms-design'

/** Files whose visible words belong to this namespace (paths under `src/`; the gate scans them). */
export const SCREENS = [
  'cms/DesignInspiration.tsx',
  'cms/Inspiration.tsx',
  'cms/DesignSystemRules.tsx',
  'cms/DesignSystemRuleDetail.tsx',
  'cms/DesignSystemsSwitch.tsx',
  'cms/ds-rule-display.ts',
  'cms/rule-rows.ts'
] as const

export const en = {
  'cms-design.contract.exact': 'Content contract: {profile}',
  'cms-design.contract.noneCard': 'No content contract yet, so this card cannot be published.',
  'cms-design.contract.noneListing':
    'No content contract yet, so this listing cannot be published. Road to live, step 3, says how to make it.',
  'cms-design.contract.lower':
    'Uses the content contract made for {profile}. It is not tested on {version} yet.',

  'cms-design.badge.on': 'On Design templates',
  'cms-design.badge.active': 'Active',
  'cms-design.badge.hasWarnings': 'Has warnings',
  'cms-design.badge.card': 'Card, not on Design templates',
  'cms-design.badge.hidden': 'Hidden',
  'cms-design.badge.noCard': 'No card',
  'cms-design.badge.disabled': 'Disabled',

  'cms-design.sheet.settingsFor': 'Design templates settings for {name}',
  'cms-design.sheet.addCard': 'Add card',
  'cms-design.sheet.settings': 'Settings',
  'cms-design.sheet.close': 'Close',
  'cms-design.sheet.resize': 'Resize panel',
  'cms-design.sheet.title': 'Design templates · {name}',
  'cms-design.sheet.description':
    'The card this release is on Design templates as, on this server. Version and demo are read; the rest is yours.',
  'cms-design.sheet.pickRelease_one': 'One card, {count} build. Pick the release whose card file you edit.',
  'cms-design.sheet.pickRelease_other':
    'One card, {count} builds. Pick the release whose card file you edit.',
  'cms-design.sheet.release': 'Release',
  'cms-design.panel.title': 'Design templates',
  'cms-design.body.reading': 'Reading…',

  'cms-design.error.door': 'the door answered {status}',
  'cms-design.error.fileDoor': '{file}: the door answered {status}',

  'cms-design.shelf.noContract':
    '{tag} has no content contract, so this card cannot be published yet. Make it in the tch repo (JA Joomla T3/T4: the quickstart-contract skill; WordPress: packages/cms/tracy-wordpress-quickstart/contracts), merge it to develop, and publish once CI has deployed this server.',
  'cms-design.shelf.saveFirst': 'Save the card first.',

  'cms-design.checklist.desktopEveryPage': 'Desktop picture for every page',
  'cms-design.checklist.category': 'Category',
  'cms-design.checklist.blurb': 'Blurb',
  'cms-design.checklist.homePicture': 'Home page picture',
  'cms-design.checklist.thumbnail': 'Thumbnail',

  'cms-design.upload.noTemplateListing': 'This listing has no template yet, so a picture has nowhere to go.',
  'cms-design.upload.noTemplateCard': 'This card has no template yet, so a picture has nowhere to go.',
  'cms-design.upload.badType': '{file} is not a PNG, JPEG or WebP picture.',
  'cms-design.upload.button': 'Upload pictures',

  'cms-design.generate.failed':
    'Couldn’t read the demo to fill the form (server error {status}). Fill it by hand or try again.',
  'cms-design.generate.filledWhy': 'Filled what could be read: {why}.',
  'cms-design.generate.filled': 'Filled from the demo.',
  'cms-design.generate.keptListed': 'The menu read found only Home, so the layouts already listed were kept.',
  'cms-design.generate.titleRegenerate':
    'Read the demo again: its menu, dark mode and pictures are refreshed; provider, category, blurb and the chosen thumbnail stay. Nothing is saved until Update listing',
  'cms-design.generate.titleCreate':
    'Read the demo: its menu becomes the layouts, its dark mode is measured, and a category and sentence are drafted. Nothing is saved until Save listing',
  'cms-design.generate.titleCard':
    'Read the demo: its menu becomes the layouts, its dark mode is measured, and a category and sentence are drafted',
  'cms-design.generate.regenerate': 'Regenerate listing',
  'cms-design.generate.create': 'Create listing',
  'cms-design.generate.card': 'Generate card',

  'cms-design.shoot.progress': 'Shooting {page} ({n} of {total})…',
  'cms-design.shoot.noPicture': 'no picture',
  'cms-design.shoot.failed_one': '{count} picture did not come back: {list}',
  'cms-design.shoot.failed_other': '{count} pictures did not come back: {list}',
  'cms-design.shoot.noDemo': 'This template has no demo to take pictures from.',
  'cms-design.shoot.nothingForPage': 'The demo gave no picture for this page.',

  'cms-design.field.provider': 'Provider',
  'cms-design.field.providerHint': 'Shown under the name on the card. Two values today; the gate pins them.',
  'cms-design.field.category': 'Category',
  'cms-design.field.categoryHint': 'One of Design templates’ own categories, so the filter finds it.',
  'cms-design.field.pickCategory': 'Pick a category',
  'cms-design.field.blurb': 'Blurb',
  'cms-design.field.blurbHint':
    'One sentence in the preview dialog: what the site is, and whose demo content it carries.',
  'cms-design.field.thumbnail': 'Thumbnail',
  'cms-design.field.thumbnailHint': 'Which picture the card wears on Design templates.',
  'cms-design.field.choosePicture': 'Choose a picture',
  'cms-design.field.traits': 'Filter traits',
  'cms-design.field.traitsHint':
    'What the Design templates filters say about this template. Set them so the filter does not lie.',
  'cms-design.field.navigation': 'Navigation',
  'cms-design.field.navOption': 'nav · {value}',
  'cms-design.field.hero': 'Hero',
  'cms-design.field.heroOption': 'hero · {value}',
  'cms-design.field.hasDark': 'Has a dark mode',
  'cms-design.field.dark': 'dark',
  'cms-design.field.opensIn': 'Opens in',
  'cms-design.field.opensLight': 'opens in Light',
  'cms-design.field.opensDark': 'opens in Dark',

  'cms-design.nav.topLeft': 'top left',
  'cms-design.nav.topCentered': 'top centered',
  'cms-design.nav.brandCentered': 'brand centered',
  'cms-design.nav.overlay': 'overlay',
  'cms-design.nav.sidebar': 'sidebar',
  'cms-design.hero.split': 'split',
  'cms-design.hero.centered': 'centered',
  'cms-design.hero.cover': 'cover',
  'cms-design.hero.stack': 'stack',

  'cms-design.capture.noDemo': 'Install the demo first: the pictures are taken off the live site.',
  'cms-design.capture.title': 'Shoot every layout off the live demo at 1440×900 and 390×844.',
  'cms-design.capture.button': 'Capture shots from demo',

  'cms-design.layouts.title': 'Layouts',
  'cms-design.layouts.hint': 'The pages the preview dialog lists, shot at 1440×900 and 390×844.',
  'cms-design.layouts.key': 'Key',
  'cms-design.layouts.label': 'Label',
  'cms-design.layouts.path': 'Path',
  'cms-design.layouts.count': 'Count',
  'cms-design.layouts.desktop': 'Desktop',
  'cms-design.layouts.mobile': 'Mobile',
  'cms-design.layouts.labelFor': 'Label for {key}',
  'cms-design.layouts.pathFor': 'Path for {key}',
  'cms-design.layouts.answersAt': 'answers at {address}',
  'cms-design.layouts.countFor': 'Pages {key} stands for',
  'cms-design.layouts.desktopFor': 'Desktop picture for {key}',
  'cms-design.layouts.mobileFor': 'Mobile picture for {key}',
  'cms-design.layouts.add': 'Add a layout',

  'cms-design.help.listingNew':
    'Create listing drafts the listing from the demo. Save listing stores it on the release, hidden from customers; Publish, at the top of the page, shows it on Design templates.',
  'cms-design.help.listingPublished':
    'Update listing changes what customers see, at once. Unpublish, at the top of the page, hides it and keeps it.',
  'cms-design.help.listingHidden':
    'Update listing stores your edits on the release, still hidden from customers. Publish, at the top of the page, shows it on Design templates.',
  'cms-design.help.cardPublished':
    'Save card updates the card customers see, at once. Unpublish hides it and keeps it.',
  'cms-design.help.cardHidden':
    'Save card stores the card on the release and keeps it hidden from customers. Publish shows the saved card on Design templates.',

  'cms-design.save.unsavedTitle': 'Unsaved changes. {help}',
  'cms-design.save.titlePublished': 'Write this card onto the release; customers see the edits at once',
  'cms-design.save.titleHidden': 'Write this card onto the release and keep it hidden from customers',
  'cms-design.save.update': 'Update listing',
  'cms-design.save.listing': 'Save listing',
  'cms-design.save.card': 'Save card',
  'cms-design.save.unsaved': 'Unsaved changes',
  'cms-design.save.previewOnly': 'Preview only · nothing saved',

  'cms-design.publish.title': 'Show the saved card on Design templates',
  'cms-design.publish.button': 'Publish to Design templates',
  'cms-design.unpublish.titleArmed':
    'Press again to take the card of {name} ({tag}) off Design templates. Customers can no longer choose it',
  'cms-design.unpublish.title':
    'Take the card of {name} off Design templates; the card and its pictures are kept',
  'cms-design.unpublish.confirm': 'Unpublish {name}?',
  'cms-design.unpublish.button': 'Unpublish from Design templates',

  'cms-design.facts.demoSite': 'Demo Site',
  'cms-design.facts.labelVersion': 'Label · version',
  'cms-design.facts.languages': 'Languages',
  'cms-design.facts.demo': 'Demo on this server',
  'cms-design.facts.noDemo':
    'None: install it on the Demos page. A card frames the demo of the server the visitor is on, so its version always equals this release’s.',
  'cms-design.facts.platforms': 'Platforms on Design templates',

  'cms-design.shot.view': 'View {label} large',
  'cms-design.shot.change': 'Change {label}',
  'cms-design.shot.another': 'Choose another picture',
  'cms-design.shot.missingTitle': '{file}: not on this server',
  'cms-design.shot.none': 'None',
  'cms-design.shot.takeTitle':
    'Shoot this page on the demo at 1440×900 and 390×844; both pictures change at once.',
  'cms-design.shot.taking': 'Taking pictures…',
  'cms-design.shot.take': 'Take from demo',
  'cms-design.shot.uploadTitle':
    'PNG, JPEG or WebP, one file. It becomes this picture at once; Save listing or Update listing keeps it.',
  'cms-design.shot.uploading': 'Uploading…',
  'cms-design.shot.upload': 'Upload a picture',
  'cms-design.shot.missing': '{file} is not on this server.',

  'cms-design.screen.title': 'Design templates',
  'cms-design.screen.sub': 'What customers on this server are offered right now.',
  'cms-design.screen.subHost': 'What customers on <host>{host}</host> are offered right now.',
  'cms-design.screen.readAt': 'Releases last read from GitHub {when} UTC.',
  'cms-design.screen.neverRead': 'This server has not read the releases from GitHub yet.',
  'cms-design.screen.readingPanel': 'Reading what customers are offered',
  'cms-design.screen.readingRows': 'Reading Design templates',
  'cms-design.screen.refreshTitle': 'Read the releases again',
  'cms-design.screen.refreshing': 'Reading…',
  'cms-design.screen.refresh': 'Refresh from GitHub',
  'cms-design.screen.refreshAnswered': 'the refresh answered {status}',
  'cms-design.screen.switchAnswered': 'the switch answered {status}',
  'cms-design.screen.statShown': 'Cards shown',
  'cms-design.screen.statWith': 'With {cms}',
  'cms-design.screen.tabShown': 'Shown to customers · {n}',
  'cms-design.screen.tabHeld': 'Not shown · {n}',
  'cms-design.screen.tabNone': 'No card · {n}',
  'cms-design.screen.search': 'Search templates',
  'cms-design.screen.cmsFilter': 'CMS',
  'cms-design.screen.all': 'All',
  'cms-design.screen.category': 'Category',
  'cms-design.screen.allCategories': 'All categories',
  'cms-design.screen.matches': '{shown} of {total}',
  'cms-design.screen.emptyServer': 'Customers on this server are offered no card.',
  'cms-design.screen.emptyFilter': 'No card matches these filters.',
  'cms-design.screen.warnings_one': '{count} warning',
  'cms-design.screen.warnings_other': '{count} warnings',
  'cms-design.screen.noCategory': 'No category',
  'cms-design.screen.colCard': 'Card',
  'cms-design.screen.colTemplate': 'Template',
  'cms-design.screen.colBuilds': 'Builds on',
  'cms-design.screen.colProvider': 'Provider',
  'cms-design.screen.colLayouts': 'Layouts',
  'cms-design.screen.colDesignSystem': 'Design system',
  'cms-design.screen.colWarnings': 'Warnings',
  'cms-design.screen.colRelease': 'Release',
  'cms-design.screen.colWhy': 'Why customers do not see it',
  'cms-design.screen.noImage': 'none',
  'cms-design.screen.editCard': 'Edit card',
  'cms-design.screen.createCard': 'Create card',
  'cms-design.screen.noCard': 'No card',
  'cms-design.screen.emptyHeld': 'Every card on a release is shown to customers.',
  'cms-design.screen.emptyNone': 'Every release a site can start from carries a card.',

  'cms-design.dsSwitch.title': 'Design systems on Design templates',
  'cms-design.dsSwitch.hint': 'Applies to Joomla, WordPress and EmDash.',

  'cms-design.rules.kind.mustFix': 'Must fix',
  'cms-design.rules.kind.worthFixing': 'Worth fixing',
  'cms-design.rules.kind.notMeasured': 'Not measured yet',
  'cms-design.rules.kind.passed': 'Passed',
  'cms-design.rules.verdict.mustFix_one': '<b>{count}</b> must fix',
  'cms-design.rules.verdict.mustFix_other': '<b>{count}</b> must fix',
  'cms-design.rules.verdict.worthFixing_one': '<b>{count}</b> worth fixing',
  'cms-design.rules.verdict.worthFixing_other': '<b>{count}</b> worth fixing',
  'cms-design.rules.verdict.notMeasured_one': '<b>{count}</b> not measured yet',
  'cms-design.rules.verdict.notMeasured_other': '<b>{count}</b> not measured yet',
  'cms-design.rules.verdict.passed_one': '<b>{count}</b> passed',
  'cms-design.rules.verdict.passed_other': '<b>{count}</b> passed',
  'cms-design.rules.run': '<b>{source}</b> measured on {stamp}',
  'cms-design.rules.measuredOn': 'Measured on {stamp}',
  'cms-design.rules.copied': 'Copied',
  'cms-design.rules.copy': 'Copy prompt',
  'cms-design.rules.showLess': 'Show less',
  'cms-design.rules.showAll': 'Show all',
  'cms-design.rules.folded_one': '{count} rule',
  'cms-design.rules.folded_other': '{count} rules',
  'cms-design.rules.details_one': 'Details ({count} rule)',
  'cms-design.rules.details_other': 'Details ({count} rules)',

  'cms-design.rule.more': '+{count} more',
  'cms-design.rule.fix': 'Fix:',
  'cms-design.rule.elements': 'Elements ({count})',
  'cms-design.rule.seen': 'Seen',
  'cms-design.rule.systems': 'Systems',
  'cms-design.rule.sitewide': 'Site-wide',
  'cms-design.rule.pages': 'Pages',
  'cms-design.rule.source': 'Source',
  'cms-design.rule.rules': 'Rules',
  'cms-design.rule.why': 'Why'
} as const

export type CmsDesignKey = keyof typeof en
