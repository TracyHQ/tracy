/**
 * English baseline for the `tracy-build-chat` namespace. This package OWNS the namespace; `NS` lives beside `en` so
 * `check-dsh-locale` can find the owner. Wording follows the build chat mock the product owner approved.
 */
export const NS = 'tracy-build-chat'

export const en = {
  'template.list': 'Designs for your site',
  'template.recommended': 'Recommended',
  'template.later': 'You can change the design later.',
  'template.use': 'Use {name}',
  'template.chosen': 'Chosen: {name}',
  'template.saveFailed': 'Your choice was not saved. Try again.',
  'template.none': 'No ready design fits your business yet.',
  'template.noneNext': 'You can still add your site from Add site.',
  'template.openAddSite': 'Open Add site',
  'progress.title.build': 'Building your site',
  'progress.title.partial': 'Updating your site',
  'progress.done': '{count} completed',
  'progress.running': '{count} in progress',
  'progress.pending': '{count} pending',
  'progress.failed': '{count} failed',
  'progress.state.done': 'Completed',
  'progress.state.running': 'In progress',
  'progress.state.pending': 'Pending',
  'progress.state.failed': 'Failed',
  'progress.note.failed': 'Failed',
  'progress.note.failedTwice': 'Failed twice',
  'progress.note.notStarted': 'Not started',
  'progress.clock': 'Elapsed time',
  'stopped.title': 'Your site is not finished yet',
  'stopped.twice': 'The step "{step}" failed twice, so I stopped instead of showing you a half built site.',
  'stopped.once': 'The step "{step}" failed, so I stopped instead of showing you a half built site.',
  'stopped.kept.none': 'Kept: your plan and your answers.',
  'stopped.kept.one': 'Kept: your plan, your answers and the written page.',
  'stopped.kept.other': 'Kept: your plan, your answers and the {count} written pages.',
  'stopped.unchanged': 'Your current site is unchanged.',
  'stopped.notified':
    'The Tracy team has been notified and will reply in this chat. You do not need to do anything.',
  'plan.title': '{name} site plan',
  'plan.design': 'Design: {name}',
  'plan.facts': 'Business facts',
  'plan.language': 'Site language',
  'plan.allSources': 'All sources',
  'plan.look': 'Look',
  'plan.look.template': 'Template',
  'plan.look.accent': 'Accent colour',
  'plan.look.logoLight': 'Logo on light',
  'plan.look.logoDark': 'Logo on dark',
  'plan.look.logoOwn': 'Your logo, from {source}',
  'plan.look.logoText': 'Your business name as text',
  'plan.services': 'Services ({count})',
  'plan.service': 'Service {n}',
  'plan.pages': 'Pages ({count})',
  'plan.sections.one': '{count} section',
  'plan.sections.other': '{count} sections',
  'plan.fromServices': 'From Services',
  'plan.count.service.one': '{count} service',
  'plan.count.service.other': '{count} services',
  'plan.count.person.one': '{count} person',
  'plan.count.person.other': '{count} people',
  'plan.count.quote.one': '{count} quote',
  'plan.count.quote.other': '{count} quotes',
  'plan.count.gallery.one': '{count} photo',
  'plan.count.gallery.other': '{count} photos',
  'plan.count.item.one': '{count} item',
  'plan.count.item.other': '{count} items',
  'plan.pictures': 'Pictures',
  'plan.pictures.own': 'Your photos',
  'plan.pictures.ownValue': '{count} photos from {from}',
  'plan.pictures.drawn': 'Drawn pictures',
  'plan.pictures.drawnValue.one': '{count} picture',
  'plan.pictures.drawnValue.other': '{count} pictures',
  'plan.pictures.drawnNone': 'None',
  'plan.assumptions': 'Assumptions',
  'plan.leftOut': 'Left out',
  'plan.and': '{first} and {last}',
  'plan.saveFailed': 'Your change was not saved. Try again.'
} as const

export type StringKey = keyof typeof en
export type Translate = (key: StringKey, vars?: Record<string, string | number>) => string

/** Translate with the English source; the plugin passes its bound locale instead. */
export const english: Translate = (key, vars = {}) =>
  en[key].replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? ''))
