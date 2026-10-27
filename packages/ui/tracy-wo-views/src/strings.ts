/**
 * English baseline for every key the views read through `t`. A consumer merges these into its own
 * dictionary under the same keys (the plugin: namespace `tracy-website-opportunities`); `{name}`
 * placeholders are filled by the consumer's `t`, or by `createTranslate` below.
 */
import type { Translate } from './types.ts'

export const en: Record<string, string> = {
  // Results header
  'results.found': '{count} found',
  'results.shown': '{count} shown',
  'results.shownOfKind': '{count} {kind} shown',
  'results.chainsHidden': '{count} chains hidden',
  'results.sortedBy': 'sorted by {sort}',
  'results.provider.google-places': 'From Google Maps',
  'results.provider.google-maps': 'From Google Maps',
  'results.provider.osm': 'From OpenStreetMap',
  'results.checking': 'Checking websites and social pages: {done} of {total} done',
  'results.checked': 'Website checks: {done} of {total} done',
  'results.checkingLabel': 'Checking websites and social pages',
  'results.socialChecked': 'Social stats: {done} of {total} done',
  'results.empty': 'No places to show',
  'results.select': 'Select {name}',
  'results.selectAll': 'Select all',

  // View switch and sorting
  'results.view.label': 'View',
  'results.view.table': 'Table',
  'results.view.grid': 'Grid',
  'results.view.map': 'Map',
  'results.view.mapUnavailable': 'The map is not available here',
  'results.sort.label': 'Sort by',
  'results.sort.option': 'Sort: {sort}',
  'results.sort.by': 'Sort by {sort}',
  'results.sort.score': 'Opportunity',
  'results.sort.web': 'Website',
  'results.sort.google': 'Google reviews',
  'results.sort.social': 'Followers',

  // Map
  'results.map.label': 'Map of the places, pins marked with their grade',
  'results.map.legend': 'Zoom in to split a numbered group of pins',
  'results.map.cluster': '{count} places here',
  'results.map.pin': '{name}, grade {grade}',
  'results.map.close': 'Close',

  // Kind tabs
  'kind.label': 'Filter by type',
  'kind.all': 'All',
  'kind.restaurants': 'Restaurants',
  'kind.cafes': 'Cafes & coffee',
  'kind.fast-food': 'Fast food & street food',
  'kind.bakeries': 'Bakeries & desserts',
  'kind.bars': 'Bars & pubs',
  'kind.nightlife': 'Nightlife',

  // Columns
  'columns.button': 'Columns',
  'columns.note': 'Place always shows.',
  'columns.place': 'Place',
  'columns.type': 'Type',
  'columns.score': 'Opportunity',
  'columns.web': 'Website',
  'columns.google': 'Reviews',
  'columns.social': 'Social',
  'columns.contact': 'Contact',
  'columns.status': 'Status',

  // Opportunity score
  'score.aria': 'Opportunity {grade}, {score} of 100',
  'score.total': 'Opportunity',
  'score.soFar': 'So far',
  'score.outOf': '{score}/100',
  'score.stillChecking': 'Still checking',
  'score.pendingNote': 'Some parts are still being checked, so the score can still go up.',
  'score.line': '{label} {points}',
  'score.pending': 'checking…',
  'score.notCollected': 'not collected',
  'score.reason.web.none': 'No website',
  'score.reason.web.socialOnly': 'Only a social page',
  'score.reason.web.down': 'Site down',
  'score.reason.web.slow': 'Slow or outdated site',
  'score.reason.web.fine': 'Site is fine',
  'score.reason.web.checking': 'Website',
  'score.reason.web.unknown': 'Website could not be checked',
  'score.reason.demand.reviews': '{reviews} reviews · ★{rating}',
  'score.reason.demand.count': '{reviews} reviews',
  'score.reason.demand.stars': 'Rated ★{rating}',
  'score.reason.demand.unknown': 'Google rating not known',
  'score.reason.marketing.lastPost': 'Last post {ago}',
  'score.reason.marketing.unknown': 'Social pages',
  'score.reason.contact.reachable': 'Phone, chat or email found',
  'score.reason.contact.none': 'No phone, chat or email',
  'score.reason.chain.penalty': 'Chain, so halved',
  'score.reason.closed.penalty': 'Temporarily closed, so halved',

  // Place cell
  'cell.place.openMap': 'Open on the map',
  'cell.place.open': 'Open',
  'cell.place.closed': 'Closed',
  'cell.place.temporarilyClosed': 'Temporarily closed',
  'cell.place.chain': 'Chain',

  // Website cell
  'cell.website.none': 'No website',
  'cell.website.socialOnly': '{network} only',
  'cell.website.down': 'Site down',
  'cell.website.blocked': 'Could not check',
  'cell.website.checking': 'Checking…',
  'cell.website.unknown': 'Not checked',
  'cell.website.noScore': 'Checked · no speed score',
  'cell.website.score': '{score}/100',
  'cell.website.note.notMobileFriendly': 'not mobile-friendly',
  'cell.website.note.noHttps': 'no HTTPS',
  'cell.website.note.copyright': '© {year}',
  'cell.website.note.fine': 'Fine',

  // Google cell
  'cell.google.reviews': '{count} reviews',
  'cell.reviews.google': 'Google',
  'cell.reviews.tripadvisor': 'Tripadvisor',
  'cell.google.none': 'No reviews',

  // Social cell
  'cell.social.lastPost': '· last post {ago}',
  'cell.social.get': 'Get social stats',
  'cell.social.perMonth': '· {count}/mo',
  'cell.social.perMonthAtLeast': '· ≥{count}/mo',
  'cell.social.checked': 'checked {ago}',
  'cell.social.none': 'No pages found',
  'cell.social.pagesNotFound': 'Pages not found',
  'cell.social.deferred': 'Daily limit reached · {when}',

  // Contact cell
  // Demo column (cells/demo.tsx)
  'cell.demo.expiresAt': 'Expires {date}',
  'cell.demo.left.day.one': '{count} day left',
  'cell.demo.left.day.other': '{count} days left',
  'cell.demo.left.hour.one': '{count} hour left',
  'cell.demo.left.hour.other': '{count} hours left',
  'cell.demo.qaPassed': 'QA passed',
  'cell.demo.extend': 'Extend',
  'cell.demo.frozen': 'Frozen',
  'cell.demo.deletesIn.one': 'deleted in {count} day',
  'cell.demo.deletesIn.other': 'deleted in {count} days',
  'cell.demo.reopen': 'Reopen',
  'cell.demo.deleted': 'Deleted {date}',
  'cell.demo.rebuild': 'Rebuild',
  'cell.demo.building': 'Building… {count} min',
  'cell.demo.failed': 'Build failed',
  'cell.demo.retry': 'Retry',
  'cell.contact.call': 'Call {phone}',
  'cell.contact.chat': 'Chat on {app}',
  'cell.contact.email': 'Email {email}',
  'cell.contact.none': 'None found',

  // Status
  'cell.status.new': 'New',
  'cell.status.seen': 'Seen before',
  'cell.status.researchedAgo': 'Researched {ago}',
  'cell.status.researched': 'Researched',
  'cell.status.demo': 'Demo built',

  // Card
  'cell.research': 'Research',
  'cell.photo.credit': 'Photo: {credit}',
  'cell.photo.none': 'No photo'
}

/** Fills `{name}` placeholders; a missing param leaves its placeholder as written. */
export function fillTemplate(template: string, params?: Record<string, unknown>): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : whole
  )
}

/** A `t` over one dictionary (default `en`); an unknown key comes back as the key, like dsh's locale. */
export function createTranslate(dict: Record<string, string> = en): Translate {
  return (key, params) => fillTemplate(dict[key] ?? key, params)
}
