/**
 * What the Quickstart settings tab says about one release, read once from the quickstart door's
 * answer (`GET /api/ops/quickstart?tag=`), apart from the drawing so `node --test` can pin it.
 *
 * Each fact appears once: the CMS and quickstart versions come from `tracy_setting.json` only, and
 * the release's listing on Design inspiration is NOT here (the Design Inspiration tab owns it).
 */
import type { ContractStatus } from './DesignInspiration'
import type { GithubState, Tracy } from './Quickstarts'
import { tr } from '../i18n'
import { CMS_LABEL, type Cms } from './route'

export type Tone = 'ok' | 'warn' | 'bad' | 'neutral'

export interface InstallFile {
  part: string
  file: string
  sha256: string
}

export interface BuiltSite {
  label: string
  host: string
  version: string | null
  createdAt: string | null
  /** The release's own demo on this server; optional: an older server does not say. */
  demo?: boolean
  /** Whether it answers at its address; a demo whose install failed does not. */
  live?: boolean
}

export interface ReleaseFacts {
  tag: string
  kind: string
  github: GithubState
  githubLabel: string
  githubTone: Tone
  publishedAt: string | null
  /** When this server last read the release from GitHub. */
  fetchedAt: string | null
  assetCount: number
  setting: Tracy
  settingLabel: string
  settingTone: Tone
  /** Why the release cannot be installed, when the server said so. */
  reason: string | null
  /** "Joomla 6.1.1", from tracy_setting.json. */
  cms: string | null
  quickstartVersion: string | null
  template: string | null
  languages: string[]
  files: InstallFile[]
  sites: BuiltSite[]
  /** The door answers the latest 20 sites only. */
  sitesCapped: boolean
  contract: ContractStatus | undefined
}

/** Label key and tone per state; the label is read when the facts are made, in the language on screen. */
const GITHUB: Record<GithubState, [string, Tone]> = {
  published: ['cms-readiness.facts.github.published', 'ok'],
  prerelease: ['cms-readiness.facts.github.prerelease', 'warn'],
  draft: ['cms-readiness.facts.github.draft', 'warn']
}

const SETTING: Record<Tracy, [string, Tone]> = {
  ready: ['cms-readiness.facts.setting.ready', 'ok'],
  'no-setting': ['cms-readiness.facts.setting.missing', 'bad'],
  invalid: ['cms-readiness.facts.setting.invalid', 'bad']
}

/** The door's limit on `sites` (`apps/tracy-web/src/ops/quickstarts.js`, `limit 20`). */
const SITES_LIMIT = 20

/** `detail` is the door's body, read field by field as the old page did. */
export function releaseFactsOf(tag: string, detail: any, contract?: ContractStatus): ReleaseFacts {
  const setting = detail.setting ?? null
  const github: GithubState = detail.github ?? 'published'
  const tracy: Tracy = detail.tracy ?? 'no-setting'
  const platform = detail.platform ? CMS_LABEL[detail.platform as Cms] : null
  const install: Record<string, { file?: string; sha256?: string }> = setting?.install ?? {}
  const sites: BuiltSite[] = detail.sites ?? []
  const designPackWithout = detail.kind === 'design-pack' && tracy === 'no-setting'
  return {
    tag,
    kind: detail.kind ?? 'quickstart',
    github,
    githubLabel: tr(GITHUB[github][0]),
    githubTone: GITHUB[github][1],
    publishedAt: detail.publishedAt ?? null,
    fetchedAt: detail.fetchedAt ?? null,
    assetCount: Array.isArray(detail.assets) ? detail.assets.length : 0,
    setting: tracy,
    // A design pack is applied on top of a quickstart site and needs no install file (the server's
    // own reason says so), so its absence is not a fault.
    settingLabel: tr(designPackWithout ? 'cms-readiness.facts.setting.designPack' : SETTING[tracy][0]),
    settingTone: designPackWithout ? 'neutral' : SETTING[tracy][1],
    reason: detail.reason ?? null,
    cms: setting?.cms ? [platform, setting.cms].filter(Boolean).join(' ') : platform,
    quickstartVersion: setting?.version ?? null,
    template: setting?.template ?? null,
    languages: setting?.languages ?? [],
    files: Object.entries(install).map(([part, f]) => ({
      part,
      file: String(f?.file ?? ''),
      sha256: String(f?.sha256 ?? '')
    })),
    sites,
    sitesCapped: sites.length >= SITES_LIMIT,
    contract
  }
}

/** How worried a contract status should look; no status at all is neutral, never a guess. */
export function contractTone(status: ContractStatus | undefined): Tone {
  if (!status || status.state === 'not-applicable') return 'neutral'
  if (status.state === 'exact') return 'ok'
  return status.state === 'none' ? 'bad' : 'warn'
}

/** Text tone classes, the same emerald / amber / destructive the status badges of this screen use. */
export const TONE_TEXT: Record<Tone, string> = {
  ok: 'text-emerald-700 dark:text-emerald-400',
  warn: 'text-amber-700 dark:text-amber-400',
  bad: 'text-destructive',
  neutral: 'text-muted-foreground'
}
