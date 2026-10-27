/**
 * English baseline for the `tracy-brand-engine` namespace.
 *
 * This package OWNS the namespace: it ships `en` here and nothing else. Vietnamese arrives from
 * `@tracy/dsh-tracy-locale-vi`, which registers `(namespace, locale)` pairs separately —
 * `ctx.locale.register` throws on a duplicate pair, so exactly one place may ship each.
 *
 * Words follow Lee's labels of 06/09 (spec-brand-engine §6 decision 4): the tabs are "Brand" and
 * "Brand builder"; the customer's own is "Your brand", any other site is a "Reference". The result
 * is a "Design template" (vocabulary §1), never a "design system".
 */

/**
 * The namespace this package owns.
 *
 * 🔒 IT LIVES HERE, beside `en`. `check-dsh-locale` finds owners by reading the exported `NS` of
 * each `strings.ts`.
 */
export const NS = 'tracy-brand-engine'

export const en = {
  /** Tab titles; the site name is appended by the code (`Brand · fijitrips.example`). */
  'tab.brand': 'Brand',
  'tab.builder': 'Brand builder',
  /** Brand tab, before the first extraction. */
  'brand.intro':
    'Measure how your site looks today — colours by how often they are used, fonts, logos and copy — and turn it into a design template of its own. It becomes the first card in Design templates, and the agent reads it before proposing anything.',
  'brand.site': 'Your site',
  'brand.extract': 'Extract',
  'brand.extractAgain': 'Extract again',
  'brand.yours': 'Your brand',
  /** Brand builder tab. */
  'builder.intro':
    'Build a new design template from a site you admire — a competitor, a reference. Each one becomes a card in Design templates, labelled Reference, beside your own brand.',
  'builder.placeholder': 'https://example.com',
  'builder.add': 'Add',
  'builder.badUrl': 'Enter a public website address.',
  'builder.empty': 'No reference yet.',
  'builder.remove': 'Remove',
  'builder.removeConfirm': 'Remove the design template from {host}? Design templates loses its card.',
  'builder.removeFailed': 'Could not remove the design template from {host}. Try again shortly.',
  'builder.reference': 'Reference',
  /** The card. */
  'card.open': 'Open in Design templates',
  'card.fonts': 'Fonts',
  'card.imagery': 'Images from the site',
  'card.font.same': 'Display and body: {display}',
  'card.font.two': 'Display {display} · body {body}',
  'card.refined': '{count} corrections applied',
  'card.refinedOne': '1 correction applied',
  'card.extractedAt': 'Measured {when}',
  'card.thin':
    'The page is drawn by scripts, so little could be measured here. Ask the agent to look at it in a browser.',
  'card.blocked': 'The site put up an anti-bot wall; what got through was discarded.',
  /** Colour roles, as brand.json names them. */
  'role.background': 'Background',
  'role.surface': 'Surface',
  'role.foreground': 'Text',
  'role.muted': 'Muted',
  'role.border': 'Border',
  'role.accent': 'Accent',
  'role.accent-secondary': 'Second accent',
  /** Progress — one line per harvester step, in the order they happen. */
  'job.running': 'Measuring {host}…',
  'step.fetch': 'Reading the page',
  'step.css': 'Reading its styles',
  'step.styles': 'Counting colours and fonts',
  'step.fonts': 'Downloading web fonts',
  'step.fonts-done': 'Fonts saved',
  'step.logos': 'Looking for logos',
  'step.logos-done': 'Logos saved',
  'step.extra-page': 'Reading a second page',
  'step.logo-fallback': 'No logo in the page — taking the site icon',
  'step.imagery': 'Collecting the site’s images',
  'step.imagery-done': 'Images saved',
  'step.google-fonts': 'Self-hosting the Google fonts',
  'step.google-fonts-done': 'Fonts ready',
  'step.blocked': 'Anti-bot wall',
  'step.brand': 'Naming the brand',
  'step.system': 'Deriving the design template',
  'step.library': 'Writing the card',
  'step.done': 'Done',
  'job.failed': 'Could not measure {host}.',
  'job.failed.NO_MATERIAL':
    'The site could not be reached from here — an anti-bot wall or a page drawn only by scripts. Ask the agent to look at it in a browser instead.',
  'job.failed.BAD_URL': 'That is not a public website address.',
  'job.failed.ABORTED': 'Stopped: it took longer than a minute and a half.',
  /** A refused request (401/403): the person's seat may not change this site's brand. */
  'job.failed.NOT_ALLOWED': 'You do not have permission to change the brand of this site.',
  /** The brand reader did not answer, or answered with no reason of its own. */
  'job.failed.UNAVAILABLE': 'The brand reader is not available right now. Try again shortly.',
  'job.failed.EXTRACT_FAILED': 'Something went wrong while measuring the site. Try again shortly.',
  /** Any failure with no sentence of its own — never the raw code. */
  'job.failed.other': 'Something went wrong. Try again shortly.',
  /** Accessible name of the tab's loading bar (a 2px line under the tab strip, no visible words). */
  'loading.label': 'Loading',
  'state.failed': 'Could not read the brands. Try again shortly.',
  'action.retry': 'Try again'
} as const

export type Translate = (key: keyof typeof en | string, params?: Record<string, string | number>) => string
