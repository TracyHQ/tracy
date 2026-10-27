/**
 * English baseline for the `tracy-sidebar` namespace. This package OWNS the namespace: `en`
 * ships here, Vietnamese arrives from `@tracy/dsh-tracy-locale-vi`. `NS` lives beside `en` so
 * `check-dsh-locale` can find the owner.
 */
export const NS = 'tracy-sidebar'

export const en = {
  /** The New session button. */
  'session.new': 'New session',
  /** aria-label of the collapse toggle while the column is wide. */
  'toggle.collapse': 'Collapse sidebar',
  /** aria-label of the expand toggle while the column is a rail. */
  'toggle.open': 'Expand sidebar',
  /** Heading above the site list on the creation workspace, where dsh's workspace tree is not shown. */
  'workspaces.title': 'Sitespaces',
  /** The arrow on another site's row: enter that workspace (a page load — its own seat). */
  'workspaces.open': 'Open workspace',
  /** The account menu row that opens the Tracy community on Discord (community.tsx). */
  'community.label': 'Community',
  /** The floating pill above the composer, and the title of the panel it opens. */
  'help.button': 'Need help?',
  /** The panel's one line on what the community is for. */
  'help.body':
    'Found a bug or have feedback? Talk to the Tracy team and other users in our Discord community.',
  /** The panel's main action. */
  'help.open': 'Open Discord',
  /** The panel's quiet action: hide the pill in this browser. */
  'help.hide': 'Hide this button',
  /** aria-label of the panel's close button. */
  'help.close': 'Close',
  /** Shown for a few seconds after hiding the pill. */
  'help.hidden': 'Hidden. Community is still in the menu under your picture, at the bottom of the sidebar.'
} as const

export type SidebarKey = keyof typeof en
