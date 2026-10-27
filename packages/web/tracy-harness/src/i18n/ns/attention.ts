/**
 * The Admin attention screen (`/ops/attention`): the server answers codes and values
 * (`apps/tracy-web/src/lib/admin-attention.js`); `attention/strings.ts` maps them to these keys.
 * The Vietnamese is the wording Brian approved on 04/10/2026 (decision #11), kept verbatim.
 */
export const NS = 'attention'

export const SCREENS = ['attention/Attention.tsx', 'attention/strings.ts'] as const

export const en = {
  'attention.rail': 'Needs attention',
  'attention.title': 'Needs attention',
  'attention.intro':
    'The Quickstarts below are missing something or have errors. Tracy checks the data on this server. Each error leaves the list by itself once it is fixed.',
  'attention.cms.all': 'All',
  'attention.checkedAt_one': 'Just checked · {count} Quickstart can be used to build sites',
  'attention.checkedAt_other': 'Just checked · {count} Quickstarts can be used to build sites',
  'attention.reload': 'Check again',
  'attention.loading': 'Checking…',
  'attention.loadFailed': 'Could not read the list ({status}).',
  'attention.empty.title': 'No Quickstart needs attention',
  'attention.empty.body':
    'Every Quickstart on this server has a Demo and a complete Design templates card. Every Joomla and WordPress version has a content contract.',
  'attention.areaCount.attention': 'Quickstarts that need attention',
  'attention.areaCount.hint': 'Hints only',
  'attention.show.label': 'Show',
  'attention.show.attention': 'Needs attention',
  'attention.show.hints': 'Hints',
  'attention.show.all': 'All',
  'attention.none.title': 'Nothing here',
  'attention.none.attention': 'No Quickstart needs attention in this area.',
  'attention.none.hints': 'No hints in this area.',
  'attention.col.quickstart': 'Quickstart',
  'attention.col.cms': 'CMS',
  'attention.col.demo': 'Demo',
  'attention.col.problems': 'Problems',
  'attention.details': 'View details',
  'attention.seeIn.demo': 'See in Demo',
  'attention.seeIn.quickstart': 'See in Quickstart',

  'attention.severity.broken': 'Broken',
  'attention.severity.missing': 'Missing',
  'attention.severity.hint': 'Hint',

  'attention.check.demoFailed': 'Demo build failed',
  'attention.check.notOnInspiration': 'The Demo works but the design is not on Design templates yet',
  'attention.check.inspirationIncomplete': 'The Design templates card is missing details or pictures',
  'attention.check.demoOrphan': 'The Demo uses a Quickstart that is no longer offered',
  'attention.check.unreadable': 'Could not read the Quickstart version details',
  'attention.check.noDemo': 'No Demo yet',
  'attention.check.noContract': 'No content contract yet',
  'attention.check.noDesignSystem': 'No design system assigned',
  'attention.check.standardQuestions': 'Uses the standard CMS questionnaire',
  'attention.check.demoBehind': 'The Demo runs an older Quickstart version',
  'attention.check.noCard': 'No Design templates card yet',

  'attention.area.quickstarts.label': 'Quickstart',
  'attention.area.quickstarts.blurb': 'One row per Quickstart. Open a row to see each error and its reason.',
  'attention.area.demos.label': 'Demo',
  'attention.area.demos.blurb':
    "Checks Tracy's Demo sites. The list holds failed Demo builds, Quickstarts with no Demo and Demos running an older version.",
  'attention.area.inspiration.label': 'Design templates',
  'attention.area.inspiration.blurb':
    'Checks the cards on Design templates. The list holds designs whose Demo works but that do not appear yet, and cards missing details or pictures.',
  'attention.area.contracts.label': 'Content contract',
  'attention.area.contracts.blurb':
    "Joomla and WordPress Quickstarts with no content contract for the version on offer. The agent needs a contract to know where to edit content. EmDash uses the data in the design's files.",
  'attention.area.design.label': 'Design system',
  'attention.area.design.blurb':
    'Joomla and WordPress Quickstarts that have a contract but no design system assigned. The design system is declared in the .design.json file next to the contract. Quickstarts with no contract are under Content contract.',
  'attention.area.questions.label': 'Questionnaires',
  'attention.area.questions.blurb':
    "Quickstarts with no questionnaire of their own that use the standard CMS questionnaire. The standard questionnaire does not ask the customer about the design's own content parts.",

  'attention.inspiration.unpublished': 'The card is hidden on Design templates.',
  'attention.inspiration.noTemplate':
    'The card is not attached to any template, so Design templates has nowhere to show it.',
  'attention.inspiration.picturesMissing': 'This server is missing {missing}/{total} pictures: {files}.',
  'attention.inspiration.layoutsWithoutShots': 'Layouts with no screenshot yet: {layouts}.',
  'attention.inspiration.noDemo': 'This server has no working Demo to show yet.',
  'attention.inspiration.noCategory': 'The card has no group, so the filters cannot find the design.',
  'attention.inspiration.noThumbnail': 'The card has no cover picture.',
  'attention.inspiration.noBlurb': 'The card has no description.',

  'attention.why.unreadable': 'Tracy could not read tracy_setting.json: {reason}',
  'attention.why.notOnInspiration': 'This Quickstart version has no Design templates card yet.',
  'attention.why.demoOrphan':
    "Demo {demo} runs {tag}, a version that is no longer in this server's Quickstart list.",
  'attention.why.noContract': 'No content contract yet for {key}, version {version}.',
  'attention.why.noDesignSystem':
    'Contract {contract} declares no design system (file {version}.design.json says null).',
  'attention.why.demoBehind':
    'The Demo runs version {demoVersion}. The Quickstart version on offer is {version}.',

  'attention.analysis.loading': 'Comparing the questionnaire…',
  'attention.analysis.failed': 'Could not read the questionnaire analysis ({status}).',
  'attention.analysis.partsTitle': 'Which content parts this design has',
  'attention.analysis.askedTitle_one': 'Questionnaire in use: {setName} · {count} question',
  'attention.analysis.askedTitle_other': 'Questionnaire in use: {setName} · {count} questions',
  'attention.analysis.problemsTitle': 'Why it needs rework',
  'attention.analysis.suggestionsTitle': 'Suggestions for a questionnaire of its own',
  'attention.analysis.blocks_one': '{count} block',
  'attention.analysis.blocks_other': '{count} blocks',
  'attention.analysis.pages_one': '{count} page',
  'attention.analysis.pages_other': '{count} pages',
  'attention.analysis.newsPages_one': '{count} news page',
  'attention.analysis.newsPages_other': '{count} news pages',
  'attention.analysis.and': '{first} and {second}',
  'attention.analysis.feedsInto': 'fills {what}',
  'attention.analysis.agentReads': 'read by the agent',
  'attention.analysis.noEffect': 'no effect',
  'attention.analysis.viewInQuickstart': 'View in Quickstart',
  'attention.analysis.deadQuestion': 'The question "{label}" is asked but has no effect: {why}',
  'attention.analysis.dropQuestion': 'Remove the question "{label}" from the questionnaire of its own.',
  'attention.analysis.noContract.limited':
    'There is no content contract yet, so Tracy does not know which content parts this design has. Only the general questions can be compared.',
  'attention.analysis.noContract.suggestion':
    'Add a content contract for this Quickstart first. With a contract, Tracy can read the content blocks.',
  'attention.analysis.identityOnly.limited':
    "This design's contract declares only the site name and identity. Tracy does not know yet which content blocks the site has, so it cannot point out which part is left out.",
  'attention.analysis.identityOnly.contentMap':
    "Add a content map to the contract: declare the design's Services, Team, Contact… blocks.",
  'attention.analysis.identityOnly.thenAsk': 'Then create a questionnaire of its own for this design.',
  'attention.analysis.gaps':
    "No question asks about {parts}. The customer's site will keep the sample content of {template} in {where}, or the agent has to guess from a one-line introduction.",
  'attention.analysis.contactGap':
    'The sample address, phone and email will stay on the site if nobody asks the customer.',
  'attention.analysis.suggestRole': '{role}: {ask}',

  'attention.role.services': 'Services',
  'attention.role.services.ask':
    "Ask for the customer's main services: a name and a one-sentence description, 3–6 items.",
  'attention.role.pricing': 'Pricing',
  'attention.role.pricing.ask':
    'Ask which plans and prices the customer wants to show. Allow choosing "do not show pricing".',
  'attention.role.team': 'Team',
  'attention.role.team.ask':
    'Ask for the name, job title and photo of each team member. Allow choosing "do not show the team".',
  'attention.role.testimonials': 'Customer testimonials',
  'attention.role.testimonials.ask':
    'Ask for 2–3 real customer testimonials. Allow hiding the block, so the site does not keep sample testimonials.',
  'attention.role.projects': 'Featured projects',
  'attention.role.projects.ask':
    'Ask for 3–6 featured projects or products: name, picture and a short description.',
  'attention.role.contact': 'Contact details',
  'attention.role.contact.ask': 'Ask for the address, phone, email and opening hours.',
  'attention.role.gallery': 'Photo gallery',
  'attention.role.gallery.ask': 'Ask whether the customer has their own pictures to replace the sample ones.',
  'attention.role.faq': 'Frequently asked questions',
  'attention.role.faq.ask': 'Ask for 3–5 questions their customers often ask, with the answers.',
  'attention.role.news': 'News / articles',
  'attention.role.news.ask':
    'Ask whether the customer keeps the news section. If so, ask for the article topics.',
  'attention.role.events': 'Events',
  'attention.role.events.ask': 'Ask for upcoming events, or allow hiding the events section.',
  'attention.role.hero': 'Opening block (hero)',
  'attention.role.about': 'About',
  'attention.role.cta': 'Call to action',

  'attention.feed.siteName': 'site name',
  'attention.feed.copyAbout': 'about text',
  'attention.feed.copyTone': 'writing tone',
  'attention.feed.siteLanguages': 'site build languages',
  'attention.feed.seedPages': 'page list',
  'attention.feed.template': 'sample content',

  'attention.dead.sealedPages':
    'This Quickstart comes with its own pages; the build adds or removes none, so the answer is not used.',
  'attention.dead.unsealedLanguages':
    'A Quickstart with no contract makes the build skip the language step; the agent adds languages only when the customer asks in chat.',
  'attention.dead.emdashNoCopy': 'EmDash has no content rewrite step.',
  'attention.dead.noPageList':
    'This release has no tracy_site_pages.json, so the Pages question keeps every page of the design and hides none.',
  'attention.dead.emdashNoSeed': 'EmDash has no page creation step; the pages come with the design.',
  'attention.dead.noPersonalize': 'This version has no personalize map, so the answer is not used.',
  'attention.dead.noPersonalizeMap': 'This CMS has no personalize map.',
  'attention.dead.noFeeds': 'The question sends its answer to no step.',
  'attention.dead.unavailable': "This Quickstart's build does not use the answer."
} as const satisfies Record<string, string>

export type AttentionKey = keyof typeof en
