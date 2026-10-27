/**
 * The pieces a FAILED demo adds to the Demo Site row (`ReleaseDemo`). The row itself keeps the one
 * layout every state shares (status, version, latest version, the press at the right); what failed
 * adds sits under it, quiet by default (Akemi, 11/10/2026: the stacked red title, the version
 * sentence and the raw PHP warning in large text were unreadable):
 *
 *   - a small "Failed" pill and "Last install failed" in the status cell (`FailedStatus`);
 *   - one muted line: when, and the install history (`FailedNotes`);
 *   - the guide's short fact, when `demo-failure-guides.ts` knows this failure;
 *   - the raw reason behind a closed "Error details" disclosure, in a small monospace block that
 *     wraps, with a copy button so it can be sent to the dev team as it is.
 */
import { Button } from '@tracy/ui'
import { Check, ChevronRight, Copy } from 'lucide-react'
import { useState } from 'react'

import { useT } from '../i18n'
import { DemoHistoryDrawer, type DemoRow } from './Demos'
import { failedInstallGuide, stepInWords } from './demo-failure-guides'
import { relativeTime } from './relative-time'

/** The status cell of a failed demo: a small red pill, then the plain words. */
export function FailedStatus() {
  const t = useT()
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <span className="flex-none rounded-full border border-destructive/40 bg-destructive/10 px-2 py-px font-medium text-destructive text-xs">
        {t('cms-demos.failed.pill')}
      </span>
      <span className="truncate text-sm">{t('cms-demos.failed.status')}</span>
    </span>
  )
}

/** Under the row of a failed demo: when and the history, the guide's fact, and the reason folded away. */
export function FailedNotes({ row }: { row: DemoRow }) {
  const t = useT()
  const d = row.deployed
  if (!d) return null
  const ago = relativeTime(d.deployedAt)
  const address = (d.address || row.address || row.tag).replace(/^https?:\/\//, '')
  const fact = failedInstallGuide(d.reason ?? null, d.step).whatToDo
  // What a person pastes to the dev team: which demo, which version, at which step, then the line
  // the job died on, verbatim. Only the reason is drawn; the rest is context for the reader.
  const report = d.reason
    ? [
        d.version
          ? t('cms-demos.failed.reportVersion', {
              tag: row.tag,
              version: d.version,
              step: stepInWords(d.step)
            })
          : t('cms-demos.failed.report', { tag: row.tag, step: stepInWords(d.step) }),
        d.reason
      ].join('\n')
    : ''
  return (
    <div className="flex min-w-0 flex-col gap-1.5" data-demo-failed={d.step ?? ''}>
      <span className="flex flex-wrap items-center gap-1 text-muted-foreground text-xs">
        {ago ? <span>{ago} ·</span> : null}
        <DemoHistoryDrawer
          tag={row.tag}
          address={address}
          trigger={
            <span className="text-xs underline underline-offset-2">{t('cms-demos.failed.history')}</span>
          }
        />
      </span>
      {fact ? (
        <span className="text-muted-foreground text-xs" data-demo-failed-guide="">
          {fact}
        </span>
      ) : null}
      {d.reason ? (
        <details className="group text-xs" data-demo-failed-details="">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-sm border border-transparent text-muted-foreground outline-none hover:text-foreground focus-visible:border-ring [&::-webkit-details-marker]:hidden">
            <ChevronRight className="size-3 transition-transform group-open:rotate-90" />
            {t('cms-demos.failed.details')}
          </summary>
          <div className="mt-1.5 flex items-start gap-2 rounded-md border border-border bg-muted px-2.5 py-2">
            <pre className="min-w-0 flex-1 whitespace-pre-wrap break-words font-mono text-[11px] text-foreground leading-relaxed">
              {d.reason}
            </pre>
            <CopyText value={report} label={t('cms-demos.failed.copy')} />
          </div>
        </details>
      ) : null}
    </div>
  )
}

/** One small copy press; it says Copied for a moment, and stays silent when the clipboard refuses. */
function CopyText({ value, label }: { value: string; label: string }) {
  const t = useT()
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard refused (no permission, insecure origin): the text is still there to select.
    }
  }
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      className="flex-none"
      title={copied ? t('cms-demos.failed.copied') : label}
      aria-label={copied ? t('cms-demos.failed.copied') : label}
      onClick={() => void copy()}
    >
      {copied ? <Check /> : <Copy />}
    </Button>
  )
}
