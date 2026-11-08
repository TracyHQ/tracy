/** `/ops/wo` › Chain builds: the per-site table of what each step chain build took and cost. */
export const NS = 'wo-builds'

/** Files whose visible words belong to this namespace (paths under `src/`; the gate scans them). */
export const SCREENS = ['WoChainBuilds.tsx', 'wo-chain-builds-api.ts'] as const

export const en = {
  'wo-builds.open': 'Chain builds',
  'wo-builds.back': 'Back to queue',
  'wo-builds.title': 'Chain builds',
  'wo-builds.description':
    'Sites built by the step chain, newest first: how long each build took and what it cost. The numbers come from the runs’ own records.',
  'wo-builds.loading': 'Loading chain builds…',
  'wo-builds.empty': 'No chain build has finished yet.',
  'wo-builds.loadFailed': 'The chain builds could not be loaded ({status}).',
  'wo-builds.refresh': 'Refresh',
  'wo-builds.usual': 'Usual build: {minutes} min. Highlighted builds took more than {limit} min.',
  'wo-builds.col.site': 'Site',
  'wo-builds.col.template': 'Template',
  'wo-builds.col.started': 'Started',
  'wo-builds.col.minutes': 'Minutes',
  'wo-builds.col.usd': 'USD',
  'wo-builds.col.ending': 'Ending',
  'wo-builds.col.step': 'Step',
  'wo-builds.col.result': 'Result',
  'wo-builds.ending.complete': 'Complete',
  'wo-builds.ending.softFailure': 'Soft failure at {step}',
  'wo-builds.ending.softFailureUnknown': 'Soft failure',
  'wo-builds.slow': 'Far above the usual duration',
  'wo-builds.expand': 'Show the steps of {site}',
  'wo-builds.collapse': 'Hide the steps of {site}',
  'wo-builds.openSite': 'Open {site}',
  'wo-builds.noSteps': 'No step was recorded for this build.',
  'wo-builds.step.site': 'Base site',
  'wo-builds.step.kit': 'Template kit',
  'wo-builds.step.brand': 'Brand',
  'wo-builds.step.plan': 'Planner',
  'wo-builds.step.copy': 'Site copy',
  'wo-builds.step.pictures': 'Pictures',
  'wo-builds.step.write': 'Write step',
  'wo-builds.outcome.done': 'Done',
  'wo-builds.outcome.failed': 'Failed',
  'wo-builds.outcome.bestVersion': 'Failed, best version used',
  'wo-builds.outcome.skipped': 'Skipped',
  'wo-builds.outcome.stopped': 'Stopped'
} as const
