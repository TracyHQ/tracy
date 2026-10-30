/**
 * The tool and skill matrix behind the harness screens.
 *
 * THE DATA IS NOT HERE ANY MORE. It comes from `matrix.generated.ts`, which `scripts/gen-presets.ts`
 * writes out of `config/mode-matrix.json` — the same run that writes the twelve dsh presets. Until
 * 03/09 this file held a hand-copied version of those rows, and that copy was a second source of
 * truth: it could disagree with the matrix, and nothing would have said so.
 *
 * What stays here is what a generator should not own — the types, and the two questions the
 * screens ask of a row: what does an agent get (`resolve`), and where does this row live
 * (`sourceOf`).
 *
 * Counts as drawn: Designer 13+27, Developer 17+12, Writer 8+12, SEO/GEO 9+5
 * (tools+skills). The platform overlays add on top: WordPress 1+1, Joomla 0+0, Emdash 0+0.
 *
 * An overlay has a third part the two counts do not cover — the prose in `overlays` below. It is
 * kept apart from the rows because it is not a switch: a row is on or off for an agent, while a
 * persona is text somebody writes.
 */

export type RoleId = 'designer' | 'developer' | 'writer' | 'seo-geo'
export type PlatformId = 'wordpress' | 'joomla' | 'emdash'
export type ToolGroup =
  | 'prompt'
  | 'shell'
  | 'files'
  | 'skills'
  | 'planning'
  | 'context'
  | 'delegation'
  | 'web'
  | 'advanced'

export interface Role {
  id: RoleId
  label: string
  hint: string
}

export interface PlatformOption {
  id: PlatformId
  label: string
  /** Letter for PlatformGlyph when @tracy/ui has no color for this platform yet. */
  letter: string
}

export interface MatrixRow {
  id: string
  /** Tool names the model actually sees. Empty when the row only adds a prompt section. */
  tools?: readonly string[]
  group?: ToolGroup
  description?: string
  roles: Record<RoleId, boolean>
  platforms: Partial<Record<PlatformId, boolean>>
  note?: string
}

import type { T } from './i18n'
import { generated } from './matrix.generated'

/** UI decides how a group reads; the generator has no business naming things for people. */
export function groupLabel(group: ToolGroup, t: T): string {
  return t(`matrix.group.${group}`)
}

/** Dictionary key segment of each role (`seo-geo` is not a key-shaped id). */
const ROLE_KEY: Record<RoleId, string> = {
  designer: 'designer',
  developer: 'developer',
  writer: 'writer',
  'seo-geo': 'seoGeo'
}

/** A role's name on screen; the generated English is what the preset files carry. */
export function roleLabel(role: Role, t: T): string {
  const key = ROLE_KEY[role.id]
  return key ? t(`matrix.role.${key}.label`) : role.label
}

export function roleHint(role: Role, t: T): string {
  const key = ROLE_KEY[role.id]
  return key ? t(`matrix.role.${key}.hint`) : role.hint
}

/** One .md file an overlay contributes, at a path a reviewer can open. */
export interface OverlayPrompt {
  path: string
  kind: 'skill' | 'persona'
  note?: string
}

/**
 * The prose half of a platform overlay: what a CMS adds to what an agent READS, as against the
 * tools and skills it adds to what an agent can DO.
 *
 * The persona is a string and not a path because `@deepseek-ai/dsh-persona` takes `config.text`
 * and nothing else. `scripts/gen-presets.ts` is what turns it into a file, at build time.
 */
export interface PlatformOverlay {
  persona: string
  prompts: readonly OverlayPrompt[]
}

const G = generated

export const roles: readonly Role[] = G.roles
export const platforms: readonly PlatformOption[] = G.platforms
export const toolRows: readonly MatrixRow[] = G.toolRows as readonly MatrixRow[]
export const skillRows: readonly MatrixRow[] = G.skillRows as readonly MatrixRow[]

/** Persona of a role — the prose every session in that mode carries. Empty is a real answer. */
export const personas: Readonly<Record<RoleId, string>> = G.personas

/** What a platform adds on top: its own persona, and the .md files it carries. */
export const overlays: Readonly<Record<PlatformId, PlatformOverlay>> = G.overlays as Readonly<
  Record<PlatformId, PlatformOverlay>
>

/** Skills Tracy wrote. Everything else in the library came from OpenDesign. */
const TRACY_SKILLS = new Set(['tracy-file-links', 't4-framework-knowledge', 'site-build-rules'])

/** Packages of ours, and where they sit in this repository. */
const TRACY_PACKAGE_PATH: Record<string, string> = {
  '@tracy/dsh-brand': 'packages/brand/tracy-brand',
  '@tracy/dsh-tracy-locale-vi': 'packages/locale/tracy-locale-vi',
  '@tracy/dsh-chat-input': 'packages/ui/tracy-chat-input',
  '@tracy/dsh-settings': 'packages/ui/tracy-settings',
  '@tracy/dsh-webroot-read': 'packages/tools/tracy-webroot-read'
}

const REPO = 'https://github.com/TracyHQ/tch/tree/main'

export interface Source {
  /** What to show: a repo path, or a package name when the code is not in this tree. */
  label: string
  /** A link, only when the file really is in this repository. */
  href?: string
  /** Why there is no link, when there is none. Never left to be guessed. */
  note?: string
}

/**
 * Where a row lives, and whether you can go and edit it.
 *
 * WHY A LINK IS NOT ALWAYS THE RIGHT ANSWER, even though the repo is private and everyone reading
 * this screen can open it. A link says "go here and change it", so it must only appear where that
 * is true:
 *
 *   skills            live in this tree — `vendor/tracy/od-skill/skills/<id>` for the OpenDesign
 *                     library, `packages/design/tracy-design-skill/skills/<id>` for ours. Link.
 *   plugins of ours   `packages/<area>/<pkg>`. Link.
 *   plugins of dsh    `@deepseek-ai/*`. The code is in `vendor/tracy/deepseek-harness`, a SUBMODULE, so
 *                     a GitHub link there resolves to a commit pointer rather than a file — and
 *                     more importantly, editing it in place is the wrong move. Rule #5: a Tracy
 *                     fix to somebody else's code ships as a `-tracy.N` release, not as an edit.
 *                     So: package name and version, no link, and the reason stated.
 */
/** The cordis plugin a tool row mounts, or `null` for a row that no composition names. */
export function packageOf(rowId: string): string | null {
  return (G.packages as Record<string, string>)[rowId] ?? null
}

export function sourceOf(row: MatrixRow, kind: 'tool' | 'skill', t: T): Source {
  if (kind === 'skill') {
    const path = TRACY_SKILLS.has(row.id)
      ? `packages/design/tracy-design-skill/skills/${row.id}`
      : `vendor/tracy/od-skill/skills/${row.id}`
    return { label: path, href: `${REPO}/${path}` }
  }

  const pkg = packageOf(row.id)
  if (!pkg) return { label: t('matrix.source.unknown'), note: t('matrix.source.unknownNote') }

  const path = TRACY_PACKAGE_PATH[pkg]
  if (path) return { label: path, href: `${REPO}/${path}` }
  return { label: pkg, note: t('matrix.source.dshNote') }
}

/**
 * What one agent carries: its own rows, plus whatever the platform overlay adds.
 *
 * Tools: `role ∪ platform` — the same union `scripts/gen-presets.ts` applies when it writes the preset,
 * and that is not a coincidence to be maintained by hand: the `presets` gate re-runs the generator
 * and fails if the files on disk disagree with this matrix.
 *
 * Skills: `skillReaches` in the same generator — a platform row goes to the roles on that platform whose
 * column is on, or to every role there when no column is on (09/10/2026: `joomlart-t4-template` names
 * Designer and Developer only).
 */
export function resolve(role: RoleId, platform: PlatformId) {
  const on = (rows: readonly MatrixRow[]) =>
    rows.filter((r) => r.roles[role] || r.platforms[platform] === true)
  const named = (r: MatrixRow) => Object.values(r.platforms).some((v) => v === true)
  const anyRole = (r: MatrixRow) => Object.values(r.roles).some((v) => v === true)
  const skills = skillRows.filter((r) =>
    named(r)
      ? r.platforms[platform] === true && (!anyRole(r) || r.roles[role] === true)
      : r.roles[role] === true
  )
  return { tools: on(toolRows), skills }
}
