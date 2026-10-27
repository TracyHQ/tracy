/** The agent screens: Host agents (what each fleet host's dsh runs) and CMS agents (the role × platform roster). */
export const NS = 'agents'

/** Files whose visible words belong to this namespace (paths under `src/`; the gate scans them). */
export const SCREENS = ['HostAgents.tsx', 'CmsAgents.tsx'] as const

export const en = {
  'agents.host.title': 'Host agents',
  'agents.host.hosts_one': '{count} host',
  'agents.host.hosts_other': '{count} hosts',
  'agents.host.answered': '{n} answered',
  'agents.host.dark': '{n} dark',
  'agents.host.agree': 'they agree on every package',
  'agents.host.disagree_one': '{count} package disagrees',
  'agents.host.disagree_other': '{count} packages disagree',
  'agents.host.readFailed': 'Could not read the fleet: {error}',
  'agents.host.asking': 'Asking every host…',
  'agents.host.measured': 'Measured {time}',
  'agents.host.refresh': 'Refresh',
  'agents.host.secretMissing':
    '{error}. Nothing was asked of any host. Set it with <code>{command}</code>, the same value the fleet’s ears hold.',
  'agents.host.didNotAnswer': '{host} did not answer ({error})',
  'agents.host.column.host': 'Host',
  'agents.host.column.dsh': 'dsh',
  'agents.host.column.tag': 'Image tag',
  'agents.host.column.packages': 'Tracy packages',
  'agents.host.column.started': 'Started',
  'agents.host.drift.heading_one': 'The hosts disagree about {count} package',
  'agents.host.drift.heading_other': 'The hosts disagree about {count} packages',
  'agents.host.drift.explain':
    'Both images are built from this repo, so a difference here means one machine has not been redeployed, not that one of them is wrong. A package listed as <code>{missing}</code> is missing from that image entirely, which is the quieter and worse kind of drift.',
  'agents.host.allAgree': 'Every host that answered is running the same Tracy packages.',
  'agents.host.noAnswer': 'no answer',
  'agents.host.running': 'running',
  'agents.host.unknownStatus': 'unknown',
  'agents.host.darkDetail': 'This host did not answer, so nothing below it is known. The error was:',
  'agents.host.packagesBlock': 'Tracy packages · {n}',
  'agents.host.notRunning': 'The container is not running, so its packages were not read.',
  'agents.host.amber': 'Amber means the other host names another version.',
  'agents.host.image': 'Image',
  'agents.host.repository': 'Repository',
  'agents.host.envTag': 'Tag in the env file',
  'agents.host.previousTag': 'Previous tag',
  'agents.host.runningImage': 'Running image',
  'agents.host.container': 'Container',
  'agents.host.name': 'Name',
  'agents.host.status': 'Status',
  'agents.host.health': 'Health',
  'agents.host.noHealthcheck': 'no healthcheck',
  'agents.host.note': 'Note',
  'agents.host.justNow': 'just now',
  'agents.host.minutesAgo': '{n} min ago',
  'agents.host.hoursAgo': '{n} h ago',

  'agents.cms.title': 'CMS agents',
  'agents.cms.intro':
    'What every customer’s agents carry, on every lane. Changes travel in the next image: a lane picks them up once it is rebuilt.',
  'agents.cms.view.roster': 'Agents',
  'agents.cms.view.matrix': 'Matrix',
  'agents.cms.switchedOff_one': '{count} row switched off',
  'agents.cms.switchedOff_other': '{count} rows switched off',
  'agents.cms.pending':
    'Nothing has changed for a customer yet. This becomes a pull request against <code>{file}</code>, and reaches lanes with the next image.',
  'agents.cms.discard': 'Discard',
  'agents.cms.createPr': 'Create pull request',
  'agents.cms.comingSoon': 'Coming soon',
  'agents.cms.platform': 'Platform',
  'agents.cms.addsNothing_one': '{names} adds nothing yet.',
  'agents.cms.addsNothing_other': '{names} add nothing yet.',
  'agents.cms.adds': '{platform} adds {tools} · {skills} · {files}.',
  'agents.cms.tools_one': '{count} tool',
  'agents.cms.tools_other': '{count} tools',
  'agents.cms.skills_one': '{count} skill',
  'agents.cms.skills_other': '{count} skills',
  'agents.cms.files_one': '{count} file',
  'agents.cms.files_other': '{count} files',
  'agents.cms.noPersona': 'no persona',
  'agents.cms.roleFor': '{role} for {platform}',
  'agents.cms.openPreset': 'Open preset',
  'agents.cms.toolsTitle': 'Tools',
  'agents.cms.skillsTitle': 'Skills'
} as const

export type AgentsKey = keyof typeof en
