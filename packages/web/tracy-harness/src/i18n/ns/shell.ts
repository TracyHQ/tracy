/** The shell's own words: brand, rail, account menu, theme and language switches, update notice. */
export const NS = 'shell'

/** Files whose visible words belong to this namespace (paths under `src/`; the gate scans them). */
export const SCREENS = [
  'App.tsx',
  'shell/theme.tsx',
  'shell/language-switch.tsx',
  'shell/NewVersionNotice.tsx'
] as const

export const en = {
  'shell.brand.mark': 'TH',
  'shell.brand.title': 'Tracy harness',
  'shell.brand.subtitle': 'Website operations',
  'shell.document.cms': 'Build configuration · {brand}',
  'shell.sidebar.toggle': 'Toggle Sidebar',
  'shell.sidebar.mobileTitle': 'Sidebar',
  'shell.sidebar.mobileDescription': 'Displays the mobile sidebar.',
  'shell.loading': 'Loading…',

  'shell.group.campaigns': 'Campaigns',
  'shell.group.wo': 'Website Opportunities',
  'shell.group.agents': 'Agents',
  'shell.group.fleet': 'Fleet',
  'shell.group.builds': 'Builds',
  'shell.group.buildFrom': 'What a build starts from',
  'shell.group.buildRuns': 'What a build runs as',
  'shell.group.settings': 'Tracy Settings',
  'shell.group.devops': 'DevOps',

  'shell.nav.invitations': 'Invitations',
  'shell.nav.woQueue': 'Live Queue',
  'shell.nav.woResearch': 'Research',
  'shell.nav.woPlaces': 'Places',
  'shell.nav.woSettings': 'Settings & API',
  'shell.nav.appStatistic': 'Desktop App Statistics',
  'shell.nav.agents': 'CMS agents',
  'shell.nav.presets': 'Provider presets',
  'shell.nav.voice': 'Voice',
  'shell.nav.hosts': 'Host agents',
  'shell.nav.shards': 'Shards',
  'shell.nav.widget': 'Widget',
  'shell.nav.general': 'General',
  'shell.nav.ui': 'User Interface',
  'shell.nav.model': 'Model & AI',
  'shell.nav.servers': 'Servers',
  'shell.nav.mail': 'Mail',
  'shell.nav.api': 'API',
  'shell.nav.ci': 'CI',
  'shell.nav.release': 'Release checklist',

  'shell.account.roleReadOnly': '{role} · read-only',
  'shell.account.signedInAs': 'Signed in as {email}',
  'shell.account.signOut': 'Sign out',

  'shell.theme.group': 'Theme',
  'shell.theme.light': 'Light',
  'shell.theme.dark': 'Dark',
  'shell.theme.system': 'System',

  'shell.language.title': 'Language',
  'shell.language.current': 'Language: {language}',
  'shell.language.followDevice': 'Follow device',
  'shell.language.failed': '{language} could not be loaded, so English is shown.',
  'shell.language.retry': 'Try again',

  'shell.update.notice': 'A new version of this page is out.',
  'shell.update.reload': 'Reload',
  'shell.account.role.owner': 'owner',
  'shell.account.role.admin': 'admin',
  'shell.account.role.developer': 'developer'
} as const

export type ShellKey = keyof typeof en
