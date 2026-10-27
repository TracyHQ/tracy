/**
 * One release's install file on the template page, read from the quickstart door
 * (`GET /api/ops/quickstart?tag=`), drawn as a spec sheet: label on the left, value on the right,
 * one hairline per row, under the headings Release / Install / Contract, then the Files and Sites
 * tables. Read-only except "Open on GitHub" and, when the file is missing, "Create the file".
 *
 * Each fact is drawn once. The release's listing on Design inspiration is not here: the Design
 * Inspiration tab owns it.
 *
 * Every group carries `data-settings-section="release|install|contract|files|sites"` so another
 * part of the page (a problem's "Go there") can scroll to it without knowing this layout.
 */
import { cn } from '@tracy/ui'
import { Check } from 'lucide-react'
import type { ReactNode } from 'react'

import { tr, useT } from '../i18n'
import type { ContractStatus } from './DesignInspiration'
import { scrollToStep } from './RoadToLive'
import { stepNumber } from './problem-guides'
import { TracyBadge, when } from './Quickstarts'
import { FilesTable, ReleaseActions, SitesTable, sitesCount } from './QuickstartSettingsParts'
import {
  contractTone,
  type ReleaseFacts,
  releaseFactsOf,
  TONE_TEXT,
  type Tone
} from './quickstart-settings-facts'

export { githubReleaseHref, OpenOnGithub } from './QuickstartSettingsParts'

/** The quickstart door's answer, as far as this page reads it. */
export type QuickstartDetail = any

/** The groups of the sheet, as `data-settings-section` names them. */
export type SettingsSection = 'release' | 'install' | 'contract' | 'files' | 'sites'

/** "Install file: ready", or what the release lacks — the old "Ready" said only about this file. */
export function InstallFileBadge({ detail }: { detail: { tracy: 'ready' | 'no-setting' | 'invalid' } }) {
  const t = useT()
  return (
    <TracyBadge
      state={detail.tracy}
      label={detail.tracy === 'ready' ? t('cms-setup.settings.installReady') : undefined}
    />
  )
}

const orDash = (v: string | null | undefined) => v || tr('cms-setup.settings.none')
const orNotDeclared = (v: string | null | undefined) => v || tr('cms-setup.settings.notDeclared')

function Group({
  section,
  title,
  children
}: {
  section: SettingsSection
  title: string
  children: ReactNode
}) {
  return (
    <section
      data-settings-section={section}
      className="flex min-w-0 scroll-mt-4 flex-col gap-1.5 overflow-x-auto border-border border-t px-4 py-3"
    >
      <h3 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">{title}</h3>
      {children}
    </section>
  )
}

/** One label / value line with a hairline under it. */
function Row({ label, children, mono }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[11rem_minmax(0,1fr)] gap-4 border-border border-b py-1.5 text-sm last:border-b-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn('min-w-0 break-words', mono && 'font-mono text-xs leading-5')}>{children}</dd>
    </div>
  )
}

/** The file's own name, a row label in every language. */
const SETTING_FILE = 'tracy_setting.json'

const Toned = ({ tone, children }: { tone: Tone; children: ReactNode }) => (
  <span className={TONE_TEXT[tone]}>{children}</span>
)

/** The install-file line: its state, and the server's reason when it cannot be installed. */
function SettingValue({ facts }: { facts: ReleaseFacts }) {
  const t = useT()
  return (
    <span className="flex flex-col gap-0.5">
      <Toned tone={facts.settingTone}>{facts.settingLabel}</Toned>
      {facts.setting !== 'ready' ? (
        <span className="text-muted-foreground text-xs">
          {facts.reason ?? t('cms-setup.settings.noSetting')}
        </span>
      ) : null}
    </span>
  )
}

/**
 * The contract row's value, ONE line in the value column like every other row (Akemi, 11/10/2026:
 * "None" over a red warning line, each indented its own way, read as two rows). Drawn from the
 * typed status: a small red "None" and where to make one, linked to its Road to live step; or the
 * contract's id with a check, "(older version)" when it was made for an earlier release. Without
 * the typed status (a design pack), the caller's node is drawn as it is and no mark is guessed.
 */
function ContractValue({
  tag,
  node,
  status
}: {
  tag: string
  node: ReactNode
  status: ContractStatus | undefined
}) {
  const t = useT()
  if (!status) return <span>{node}</span>
  if (status.state === 'none')
    return (
      <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1" data-contract-none="">
        <span className="rounded-full border border-destructive/40 bg-destructive/10 px-2 py-px font-medium text-destructive text-xs">
          {t('cms-setup.settings.contractNone')}
        </span>
        <span className="text-muted-foreground text-xs">
          {t('cms-setup.settings.needsContract')}{' '}
          <button
            type="button"
            className="rounded-sm border border-transparent underline underline-offset-2 outline-none hover:text-foreground focus-visible:border-ring"
            data-contract-go=""
            onClick={() => scrollToStep(tag, 'contract')}
          >
            {t('cms-setup.settings.step', { n: stepNumber('contract') })}
          </button>
        </span>
      </span>
    )
  if (status.state === 'not-applicable' || !status.profile)
    return <span className="text-muted-foreground">{t('cms-setup.settings.contractNone')}</span>
  const tone = contractTone(status)
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5" data-contract-code="">
      <Check className={cn('size-3.5 flex-none', TONE_TEXT[tone])} aria-hidden />
      <span className="truncate font-mono text-xs">{status.profile}</span>
      {status.state === 'lower' ? (
        <span className="text-muted-foreground text-xs">{t('cms-setup.settings.older')}</span>
      ) : null}
    </span>
  )
}

export function QuickstartSettings({
  tag,
  detail,
  writable,
  onChanged,
  contract,
  contractStatus
}: {
  tag: string
  detail: QuickstartDetail
  writable: boolean
  onChanged: () => void
  /** Drawn as-is only when there is no typed `contractStatus` (a design pack's "Not needed"). */
  contract?: ReactNode
  /** The release's contract state: the row is built from it (None and its step, or the contract's id). */
  contractStatus?: ContractStatus
}) {
  const t = useT()
  const f = releaseFactsOf(tag, detail, contractStatus)
  const ready = f.setting === 'ready'
  return (
    <div className="flex flex-col rounded-lg border border-border" data-quickstart-settings={tag}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <span className="font-mono font-semibold text-sm">{f.tag}</span>
        <ReleaseActions facts={f} writable={writable} onChanged={onChanged} />
      </div>
      <Group section="release" title={t('cms-setup.settings.release')}>
        <dl>
          <Row label={t('cms-setup.settings.github')}>
            <Toned tone={f.githubTone}>{f.githubLabel}</Toned>
            <span className="text-muted-foreground"> · {when(f.publishedAt)}</span>
          </Row>
          <Row label={t('cms-setup.settings.assets')}>
            {t('cms-setup.settings.fileCount', { count: f.assetCount })}
          </Row>
          <Row label={t('cms-setup.settings.lastRead')}>{when(f.fetchedAt)}</Row>
        </dl>
      </Group>
      <Group section="install" title={t('cms-setup.settings.install')}>
        <dl>
          <Row label={SETTING_FILE}>
            <SettingValue facts={f} />
          </Row>
          {ready ? (
            <>
              <Row label={t('cms-setup.settings.cms')}>{orDash(f.cms)}</Row>
              <Row label={t('cms-setup.create.field.version')}>{orDash(f.quickstartVersion)}</Row>
              <Row label={t('cms-setup.create.field.template')} mono={Boolean(f.template)}>
                {orNotDeclared(f.template)}
              </Row>
              <Row label={t('cms-setup.settings.languages')}>{orNotDeclared(f.languages.join(', '))}</Row>
            </>
          ) : null}
        </dl>
      </Group>
      <Group section="contract" title={t('cms-setup.settings.contract')}>
        <dl>
          <Row label={t('cms-setup.settings.contentContract')}>
            <ContractValue
              tag={f.tag}
              node={contract ?? t('cms-setup.settings.contractNone')}
              status={contractStatus}
            />
          </Row>
        </dl>
      </Group>
      {ready ? (
        <Group section="files" title={t('cms-setup.create.files')}>
          <FilesTable files={f.files} />
        </Group>
      ) : null}
      <Group section="sites" title={t('cms-setup.settings.sites', { n: sitesCount(f) })}>
        <SitesTable facts={f} />
      </Group>
    </div>
  )
}
