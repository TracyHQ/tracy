/** /ops › Release checklist: the words around the server's list (items and verdicts are the server's). */
export const NS = 'release'

/** Files whose visible words belong to this namespace (paths under `src/`; the gate scans them). */
export const SCREENS = ['release/ReleaseChecklist.tsx'] as const

export const en = {
  'release.title': 'Release checklist',
  'release.blurb':
    'Everything to check before and after a new version goes out. Lines marked {ok}, {fix}, {check} or {note} are measured by this server on every load; tick the rest by hand. Ticks stay in this browser, for this release only.',
  'release.checkAgain': 'Check again',
  'release.readFailed': 'Could not read the checklist.',
  'release.local':
    'This is a local stand: nothing here needs fixing. The checklist is for dev, staging and production, where a missing variable is a real miss.',
  'release.done': '{done} / {total} done',
  'release.toFix_one': '{count} to fix',
  'release.toFix_other': '{count} to fix',
  'release.toCheck_one': '{count} to check',
  'release.toCheck_other': '{count} to check',
  'release.onlyOpen': 'Only what is not done',
  'release.footer':
    'Measured {when} on {origin}. Environment of tracy-host and tracy-dsh is not visible to this server: those lines carry the command to run.',
  'release.state.pass': 'OK',
  'release.state.fail': 'Fix',
  'release.state.warn': 'Check',
  'release.state.info': 'Note'
} as const

export type ReleaseKey = keyof typeof en
