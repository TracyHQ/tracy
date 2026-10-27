/**
 * /ops › Widget: the two badges a site carries. The words the badges themselves show on customer
 * sites are settings the operator types, not dictionary text.
 */
export const NS = 'widget'

/** Files whose visible words belong to this namespace (paths under `src/`; the gate scans them). */
export const SCREENS = ['Widget.tsx'] as const

export const en = {
  'widget.title': 'Widget',
  'widget.lead':
    'The two badges a site carries. A save reaches every site within five minutes, no deploy. Words, colours, corner and mark only: the script runs on customers’ pages.',
  'widget.loading': 'Loading…',
  'widget.error.signedOut': 'Signed out. Sign in again to edit the badges.',
  'widget.error.notStaff': 'This account is not Tracy staff.',
  'widget.error.unavailable': 'The badge settings are unavailable.',

  'widget.seat.title': 'Seat badge',
  'widget.seat.sub': 'On a customer’s working copy, draft or published. Off unless switched on.',
  'widget.advert.title': 'Advert badge',
  'widget.advert.sub': 'On a public demo, and on JoomlArt’s demos.',

  'widget.door.home': 'Link home (published pill)',
  'widget.door.signIn': 'Sign in',
  'widget.door.team': 'Team',
  'widget.door.hide': 'Hide button',
  'widget.door.customize': 'Button',
  'widget.door.close': 'Close button',
  'widget.door.on': '{door} on',
  'widget.door.label': '{door} label',
  'widget.doors': 'Doors',

  'widget.defaults': 'Defaults',
  'widget.save': 'Save',
  'widget.saving': 'Saving…',
  'widget.saved': 'Saved. Sites pick it up within five minutes.',
  'widget.save.conflict': 'Settings changed. Reload before saving.',
  'widget.save.refusedAt': 'Refused at {path}.',
  'widget.save.failed': 'Could not save the badge.',

  'widget.showOnSites.aria': 'Show the seat badge on sites',
  'widget.showOnSites': 'Show on sites',
  'widget.showOnSites.off': 'Off: customer sites carry no badge.',
  'widget.pillWords': 'Pill words',
  'widget.signedInAs': 'Before the signed-in address',
  'widget.colour.bg': 'Background',
  'widget.colour.fg': 'Text',
  'widget.colour.accent': 'Mark',
  'widget.colour.picker': '{label} picker',
  'widget.corner': 'Corner',
  'widget.corner.right': 'Bottom right',
  'widget.corner.left': 'Bottom left',
  'widget.showMark': 'Show Tracy’s mark',
  'widget.animation': 'Animation',
  'widget.readOnly': 'Owners and admins can save; you can preview.',

  'widget.preview': 'Preview',
  'widget.preview.as': 'Preview as',
  'widget.preview.draft': 'Draft (menu)',
  'widget.preview.managed': 'Published (link)',
  'widget.preview.frameTitle.seat': 'Seat badge preview',
  'widget.preview.frameTitle.advert': 'Advert badge preview',
  'widget.preview.page': 'A customer’s page',
  'widget.preview.invalidAt': 'Not shown: {path} is not valid.',
  'widget.preview.invalid': 'Not shown: not valid.',
  'widget.preview.unavailable': 'Preview unavailable.'
} as const
