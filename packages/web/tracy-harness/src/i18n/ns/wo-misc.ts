/** `/ops/wo` › Settings: the Provider order panel and the Demos for outside builders panel. */
export const NS = 'wo-misc'

/** Files whose visible words belong to this namespace (paths under `src/`; the gate scans them). */
export const SCREENS = [
  'WoProviderOrder.tsx',
  'WoPublicDemos.tsx',
  'wo-provider-order.ts',
  'wo-public-demos.ts'
] as const

export const en = {
  'wo-misc.order.title': 'Provider order',
  'wo-misc.order.description':
    'Which provider research asks first for each kind of data, and who is tried next. The place profile and social stats use the same order.',
  'wo-misc.order.unavailable': 'Provider order is not available from this server.',
  'wo-misc.order.notWired': 'Not wired yet',
  'wo-misc.order.reset': 'Reset to default',
  'wo-misc.order.defaultOrder': 'Default order',
  'wo-misc.order.default': 'Default',
  'wo-misc.order.stopUsing': 'Stop using {name}',
  'wo-misc.order.off': 'Off: research does not ask anyone for this.',
  'wo-misc.order.fallbackTitle': "If {name} can't answer, try these next, in order",
  'wo-misc.order.fallbackHint':
    "A provider can't answer when its key is missing or refused, its limit is reached, or it's down. A page it says does not exist stops the search.",
  'wo-misc.order.noFallback': 'No fallback: only {name} is asked.',
  'wo-misc.order.makeDefault': 'Make default',
  'wo-misc.order.moveUp': 'Move up',
  'wo-misc.order.moveDown': 'Move down',
  'wo-misc.order.notUsed': 'Not used',
  'wo-misc.order.use': 'Use',

  'wo-misc.state.connected': 'Connected',
  'wo-misc.state.missing_key': 'Missing key',
  'wo-misc.state.limit_reached': 'Limit reached today',
  'wo-misc.state.error': 'Last error',
  'wo-misc.reason.credential_invalid': 'key refused',
  'wo-misc.reason.quota': 'out of quota',
  'wo-misc.reason.provider_error': 'provider error',
  'wo-misc.reason.timeout': 'timed out',
  'wo-misc.state.lastErrorAgo': 'Last error: {reason}, {ago}',
  'wo-misc.state.lastErrorReason': 'Last error: {reason}',

  'wo-misc.report.short': 'Not enough data yet: {calls} of {min} calls',
  'wo-misc.report.calls_one': '{count} call',
  'wo-misc.report.calls_other': '{count} calls',
  'wo-misc.report.usable': '{percent}% usable',
  'wo-misc.report.noCost': 'no cost recorded',
  'wo-misc.report.perCall': '{amount} a call',
  'wo-misc.report.perCallAtMost': 'at most {amount} a call',
  'wo-misc.report.perUsable': '{amount} a usable result',
  'wo-misc.report.perUsableAtMost': 'at most {amount} a usable result',
  'wo-misc.report.ceiling': 'reserved ceiling, not a bill',
  'wo-misc.misorder.costFree': 'Costs money per usable result, while {than}, placed after it, costs nothing',
  'wo-misc.misorder.cost': 'Costs {times} more per usable result than {than}, which is placed after it',
  'wo-misc.misorder.rateNever': 'Never gave a usable result, while {than}, placed after it, did',
  'wo-misc.misorder.rate': 'Gives a usable result {times} less often than {than}, which is placed after it',

  'wo-misc.demos.title': 'Demos for outside builders',
  'wo-misc.demos.description':
    'Demos a self-hosted Website Opportunities asks for through /v1/demos: how many may be live per account, and what Tracy’s model may spend on them.',
  'wo-misc.demos.saved': 'Saved. New demo requests read these numbers now.',
  'wo-misc.demos.saving': 'Saving…',
  'wo-misc.demos.save': 'Save',
  'wo-misc.demos.liveLabel': 'Live demo sites per account',
  'wo-misc.demos.liveHint':
    'Demos made through /v1/demos that one account may have at once. Deleting one frees a place; 0 closes the door.',
  'wo-misc.demos.perDemoLabel': 'Most per demo on Tracy’s model, in cents',
  'wo-misc.demos.perDemoHint':
    'Held against the month for each demo of an account with no AI account of its own.',
  'wo-misc.demos.monthlyLabel': 'Model budget per UTC month, in cents (0 = none)',
  'wo-misc.demos.monthlyHint':
    'Over it, new demos on Tracy’s model are refused before they start. Own AI accounts are not counted.',
  'wo-misc.demos.wholeNumber': '{label}: a whole number.',
  'wo-misc.demos.range': '{label}: from {min} to {max}.',
  'wo-misc.demos.readFailed': 'Failed to read the demo settings (HTTP {status})',
  'wo-misc.demos.saveFailed': 'Failed to save the demo settings (HTTP {status})'
} as const

export type WoMiscKey = keyof typeof en
