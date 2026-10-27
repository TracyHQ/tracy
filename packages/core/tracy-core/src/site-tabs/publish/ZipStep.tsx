/**
 * Export site as ZIP, the last step of the ZIP flow (Owner only): a fresh backup, the package, a
 * 6-digit code from the Owner's email, then the download. Moved from the Export dialog of My Sites
 * (`ExportSiteDialog`) when Publish became one stepped tab (23/10/2026): the same doors, the same
 * stages, the same refusals. The work goes on while the person is on another step.
 */
import { type JSX, useState } from 'react'
import { Button, InputOTP, InputOTPGroup, InputOTPSlot, Label } from '@tracy/ui'
import { Archive, Database, FileText, Gauge, ShieldAlert } from 'lucide-react'
import type { Translate } from '../../team/translate'
import { CopyButton } from '../SiteDomains'
import { Checklist, type ChecklistItem, Notice, type PageFooter, StepPage, Working } from './page'
import type { SiteExport, ZipStage } from './use-site-export'

const DIGITS_ONLY = '^\\d+$'

/** What the package holds, as the small tags under the privacy line. */
const DETAILS = [
  { key: 'zip.detail.backup', Icon: Database },
  { key: 'zip.detail.largeFiles', Icon: Archive },
  { key: 'zip.detail.limit', Icon: Gauge },
  { key: 'zip.detail.readme', Icon: FileText }
] as const

/** Where the three parts of the work stand at each stage. */
function checklist(stage: ZipStage, t: Translate): ChecklistItem[] {
  const at = stage === 'backup' ? 0 : stage === 'packing' ? 1 : 2
  return (['stepBackup', 'stepPack', 'stepCode'] as const).map((id, i) => ({
    id,
    label: t(`flow.zip.${id}`),
    state: i < at ? 'done' : i === at ? 'now' : 'next'
  }))
}

export function ZipStep({
  zip,
  onBack,
  last,
  t
}: {
  zip: SiteExport
  onBack?: () => void
  last?: JSX.Element | null
  t: Translate
}): JSX.Element {
  const { stage, error, codeError, busy } = zip
  const preparing = stage === 'backup' || stage === 'packing'
  const hasFile = stage === 'ready' || stage === 'code' || stage === 'downloaded'
  // A failure in words: its own paragraphs for the codes a person can act on, else the code.
  const errorText =
    error === 'TOO_LARGE'
      ? [t('zip.tooLarge')]
      : error === 'INSUFFICIENT_TEMP_SPACE'
        ? [t('zip.noSpace')]
        : error === 'BACKUP_NOT_FULL'
          ? [t('zip.backupNotFull'), t('zip.backupNotFullNext')]
          : [t('zip.failed', { error })]
  const footer: PageFooter = {}
  if (!preparing && !busy) footer.onBack = onBack
  if (stage === 'confirm')
    footer.primary = { label: t('zip.start'), onPress: zip.run, busy, attrs: { 'data-export-start': '1' } }
  if (stage === 'ready')
    footer.primary = {
      label: t('zip.sendCode'),
      onPress: zip.requestCode,
      busy,
      attrs: { 'data-export-send-code': '1' }
    }
  if (stage === 'code')
    footer.primary = {
      label: t('zip.download'),
      onPress: zip.verify,
      busy,
      disabled: !/^\d{6}$/.test(zip.code),
      attrs: { 'data-export-download': '1' }
    }
  if (stage === 'failed')
    footer.primary = {
      label: t('zip.tryAgain'),
      onPress: zip.retry,
      busy,
      attrs: { 'data-export-retry': '1' }
    }
  return (
    <StepPage
      step="zip"
      title={t(hasFile ? 'zip.readyTitle' : 'flow.kind.zip')}
      desc={t('zip.body')}
      footer={footer}
      attrs={{ 'data-export-stage': stage }}
      t={t}
    >
      {stage === 'failed' ? (
        <Notice severity="error" attrs={{ 'data-export-failed': '1' }}>
          {errorText.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </Notice>
      ) : (
        <p className="tv-pub-strip" role="status" data-severity="warning" data-export-privacy="1">
          <ShieldAlert aria-hidden="true" />
          <span>{t('zip.privacy')}</span>
        </p>
      )}
      {preparing && <Working words={t(stage === 'backup' ? 'zip.backingUp' : 'zip.packing')} />}
      {(preparing || stage === 'ready' || stage === 'code') && (
        <Checklist items={checklist(stage, t)} attrs={{ 'data-export-steps': '1' }} />
      )}
      {stage === 'ready' && (
        <Notice severity="info" attrs={{ 'data-export-ready': '1' }}>
          <p>{t('zip.ready')}</p>
        </Notice>
      )}
      {stage === 'code' && (
        <div className="tv-pub-code" data-export-code>
          <Label htmlFor="tv-pub-export-code">{t('zip.code')}</Label>
          <InputOTP
            id="tv-pub-export-code"
            maxLength={6}
            pattern={DIGITS_ONLY}
            inputMode="numeric"
            value={zip.code}
            onChange={zip.setCode}
            aria-invalid={Boolean(codeError)}
          >
            <InputOTPGroup>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <InputOTPSlot key={i} index={i} />
              ))}
            </InputOTPGroup>
          </InputOTP>
          <div className="tv-pub-code-line">
            <span
              data-code-error={codeError || undefined}
              className={codeError ? 'tv-pub-code-error' : undefined}
            >
              {codeError
                ? t(
                    codeError === 'DOWNLOAD_CODE_EXPIRED'
                      ? 'zip.codeExpired'
                      : codeError === 'DOWNLOAD_CODE_TOO_MANY_ATTEMPTS'
                        ? 'zip.codeTooManyAttempts'
                        : 'zip.codeInvalid'
                  )
                : t('zip.codeHint')}
            </span>
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto p-0"
              disabled={busy}
              onClick={zip.requestCode}
            >
              {t('zip.resend')}
            </Button>
          </div>
        </div>
      )}
      {stage === 'downloaded' && (
        <Notice severity="success" attrs={{ 'data-export-downloaded': '' }}>
          <p>{t('zip.downloaded')}</p>
        </Notice>
      )}
      {zip.shownCode && <InstallCode code={zip.shownCode.code} earlier={zip.shownCode.earlier} t={t} />}
      {(stage === 'confirm' || stage === 'ready') && (
        <ul className="tv-pub-tags" data-export-details>
          {DETAILS.map(({ key, Icon }) => (
            <li key={key} className="tv-pub-tag">
              <Icon aria-hidden="true" />
              {t(key)}
            </li>
          ))}
        </ul>
      )}
      {last}
    </StepPage>
  )
}

/**
 * The install code of the package: its installer asks for it only when the new host's database is
 * on another server. Shown with the package, and again whenever the step opens on it, in the same
 * bar as the site address: the code, and its copy button right after it.
 */
function InstallCode({
  code,
  earlier,
  t
}: {
  code: string
  earlier: number | null
  t: Translate
}): JSX.Element {
  const [copyRefused, setCopyRefused] = useState(false)
  return (
    <div className="tv-pub-install" data-install-code>
      <span className="tv-pub-label">
        {earlier === null ? t('zip.installCode') : t('zip.installCodeEarlier', { version: earlier })}
      </span>
      <div className="tv-pub-bar tv-pub-value">
        <span className="tv-pub-bar-lk">
          <code className="tv-mono tv-pub-install-code" data-install-code-value>
            {code}
          </code>
          <CopyButton
            key={code}
            text={code}
            label={t('zip.installCodeCopy')}
            onRefused={setCopyRefused}
            t={t}
          />
        </span>
      </div>
      <p className="tv-pub-small">{t('zip.installCodeHint')}</p>
      {copyRefused && (
        <p role="alert" className="tv-pub-small tv-pub-alert" data-line="copy-refused">
          {t('publish.copyRefused')}
        </p>
      )}
    </div>
  )
}
