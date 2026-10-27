/**
 * The tool and skill matrix as /ops shows it: roles, tool groups, where a row lives, the matrix
 * grid, a preset read closely and the row list both agent screens share. Personas and the preset
 * file stay English: the model reads them, not a person.
 */
export const NS = 'matrix'

/** Files whose visible words belong to this namespace (paths under `src/`; the gate scans them). */
export const SCREENS = ['matrix.ts', 'MatrixGrid.tsx', 'RowList.tsx', 'Preset.tsx'] as const

export const en = {
  'matrix.role.designer.label': 'Designer',
  'matrix.role.designer.hint': 'Theme, layout, brand, visual direction',
  'matrix.role.developer.label': 'Developer',
  'matrix.role.developer.hint': 'Plugin, module, theme code, build',
  'matrix.role.writer.label': 'Writer',
  'matrix.role.writer.hint': 'Copy, pages, posts, docs',
  'matrix.role.seoGeo.label': 'SEO/GEO',
  'matrix.role.seoGeo.hint': 'Search and generative-engine visibility',

  'matrix.group.prompt': 'Prompt',
  'matrix.group.shell': 'Shell',
  'matrix.group.files': 'Files',
  // Not 'Skills': these plugins LOAD skills, and a group named like what it loads reads as a skill row.
  'matrix.group.skills': 'Skill loading',
  'matrix.group.planning': 'Planning',
  'matrix.group.context': 'Context',
  'matrix.group.delegation': 'Delegation',
  'matrix.group.web': 'Web',
  'matrix.group.advanced': 'Advanced',

  'matrix.source.unknown': 'unknown',
  'matrix.source.unknownNote': 'No composition names this row. Worth checking.',
  'matrix.source.dshNote': 'dsh plugin. Fixes ship as a -tracy.N release, not an edit in place.',

  'matrix.grid.filterPlaceholder': 'Filter rows…',
  'matrix.grid.facetAgent': 'Agent',
  'matrix.grid.facetKind': 'Kind',
  'matrix.grid.kindTool': 'Tool',
  'matrix.grid.kindSkill': 'Skill',
  'matrix.grid.reset': 'Reset',
  'matrix.grid.shown': '{shown} of {total} rows',
  'matrix.grid.explainer':
    'A <b>tool</b> is a plugin the preset switches on, and its area is the part of the harness it adds to. A <b>skill</b> is a folder of instructions the preset points at: no plugin, no build.',
  'matrix.grid.colRow': 'Row',
  'matrix.grid.colArea': 'Area',
  'matrix.grid.colAgents': 'Agents',
  'matrix.grid.colPlatform': 'Platform',
  'matrix.grid.colSource': 'Source',
  'matrix.grid.noMatch': 'No row matches these filters.',
  'matrix.grid.skillLibrary': 'Skill library',
  'matrix.grid.noAgent': 'no agent',
  'matrix.grid.sourceTitle': '{label}: {note}',

  'matrix.rows.fileOrder': 'in file order',
  'matrix.rows.toggle': '{id} on for this agent',
  'matrix.rows.fromPlatform': 'from {platform}',

  'matrix.preset.title': '{role} for {platform}',
  'matrix.preset.readOnlyGenerated': 'Read-only · generated',
  'matrix.preset.lead':
    'Composed fresh for every session from the files below. To change it, edit the matrix on the CMS agents screen: this file is written from it.',
  'matrix.preset.back': 'Back to agents',
  'matrix.preset.openGithub': 'Open in GitHub',
  'matrix.preset.tabReading': 'What it gives an agent',
  'matrix.preset.persona': 'Persona',
  'matrix.preset.inEveryPrompt': 'In every system prompt',
  'matrix.preset.noPersona': 'No persona written for this agent yet. It runs on the deployment default.',
  'matrix.preset.tools': 'Tools',
  'matrix.preset.skills': 'Skills',
  'matrix.preset.skillsNote':
    'Scanned at rank 300, inside the image. A skill one customer needs goes in their own workspace at rank 100 and wins over this one.',
  'matrix.preset.readOnly': 'Read-only',
  'matrix.preset.editGithub': 'Edit on GitHub'
} as const
