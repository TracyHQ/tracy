/**
 * Creating a release's missing `tracy_setting.json` from the Quickstarts screen.
 *
 * WHY A SHEET AND NOT A BUTTON THAT JUST WRITES. The server can fill in five of six fields from the
 * release itself, but "can fill in" is not "knows": the version is a default nobody chose, and the
 * checksum pins the bytes GitHub serves today rather than anything the publisher signed. So the
 * press opens what WOULD be written, marks every value with where it came from, lets an
 * administrator change any of it, and only then offers a second press that writes. Nothing reaches
 * the release until that second press.
 *
 * This replaces the `gh release upload` line the detail page used to print for a person to copy out
 * — same act, same file, one fewer terminal.
 */
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  cn
} from '@tracy/ui'
import { FilePlus2 } from 'lucide-react'
import { useState } from 'react'

import { Trans, tr, useT } from '../i18n'

/** Where a proposed value came from. `default` is the one a reader has to notice. */
type Source = 'release' | 'package' | 'default' | null
interface Field {
  value: string | null
  source: Source
  why: string | null
}
interface Proposal {
  tag: string
  fields: Record<string, Field>
  install: {
    value: Record<string, { file: string; sha256: string }> | null
    source: Source
    why: string | null
  }
  document: Record<string, unknown> | null
  problems: string[]
  package: { file: string; sha256: string; bytes: number }
}

const SOURCE_KEY: Record<string, string> = {
  release: 'cms-setup.create.source.release',
  package: 'cms-setup.create.source.package',
  default: 'cms-setup.create.source.default'
}

/** The four fields an administrator may change before the file is written; words at `cms-setup.create.field.<key>`. */
const EDITABLE = ['label', 'version', 'cms', 'template'] as const

/** Keys of the file's `install` map and the checksum's name: shown as written in the file. */
const INSTALLER_KEY = 'installer'
const CHECKSUM_NAME = 'sha256'

function SourceMark({ source }: { source: Source }) {
  const t = useT()
  if (!source) return null
  return (
    <Badge
      variant="outline"
      className={cn(
        'font-normal text-[10px]',
        source === 'default'
          ? 'border-amber-600/40 bg-amber-600/10 text-amber-700 dark:text-amber-400'
          : 'border-border bg-muted text-muted-foreground'
      )}
    >
      {Object.hasOwn(SOURCE_KEY, source) ? t(SOURCE_KEY[source]) : source}
    </Badge>
  )
}

/**
 * The press on a `No tracy_setting.json` row, and the sheet behind it.
 *
 * `onWritten` is how the list learns the row turned Ready — the door re-reads the release before it
 * answers, so a reload is a reload of facts and not an optimistic redraw.
 */
export function CreateSetting({
  tag,
  writable,
  onWritten,
  variant = 'ghost'
}: {
  tag: string
  writable: boolean
  onWritten: () => void
  variant?: 'ghost' | 'outline'
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [edited, setEdited] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [problems, setProblems] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  const door = `/api/ops/quickstart`
  const at = `?tag=${encodeURIComponent(tag)}`

  const propose = async () => {
    setOpen(true)
    setProposal(null)
    setError(null)
    setProblems([])
    setBusy(true)
    try {
      const response = await fetch(`${door}/setting-proposal${at}`, {
        headers: { accept: 'application/json' }
      })
      const body = await response.json().catch(() => null)
      if (!response.ok) {
        setError(body?.reason ?? tr('cms-setup.create.doorAnswered', { status: response.status }))
        return
      }
      setProposal(body)
      setEdited(Object.fromEntries(EDITABLE.map((key) => [key, (body.fields[key]?.value as string) ?? ''])))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  /** What the press would write: the proposal with the edits in it, never the other way round. */
  const document = () => {
    if (!proposal?.install.value) return null
    const platform = proposal.fields.platform?.value
    const template = edited.template?.trim()
    return {
      schemaVersion: 'tracy-setting/v1',
      platform,
      label: edited.label?.trim(),
      version: edited.version?.trim(),
      cms: edited.cms?.trim(),
      ...(template ? { template } : {}),
      install: proposal.install.value
    }
  }

  const write = async () => {
    const doc = document()
    if (!doc) return
    setBusy(true)
    setError(null)
    setProblems([])
    try {
      const response = await fetch(`${door}/setting${at}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(doc)
      })
      const body = await response.json().catch(() => null)
      if (!response.ok) {
        setProblems(body?.problems ?? [])
        setError(
          body?.problems
            ? null
            : (body?.reason ?? tr('cms-setup.create.doorAnswered', { status: response.status }))
        )
        return
      }
      // The door says what the release reads as NOW, not what was uploaded: a file that went up
      // and a file the product accepts are two different facts.
      if (body.tracy !== 'ready') {
        setError(body.reason ?? tr('cms-setup.create.stillUnreadable'))
        return
      }
      setOpen(false)
      onWritten()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const installer = proposal?.install.value?.installer

  return (
    <>
      <Button
        size="sm"
        variant={variant}
        disabled={!writable}
        title={writable ? t('cms-setup.create.compose') : t('cms-setup.create.readOnly')}
        onClick={(e) => {
          // The row navigates; this button does not. Without this the sheet would open on a page
          // that is already leaving.
          e.stopPropagation()
          void propose()
        }}
      >
        <FilePlus2 size={14} />
        {t('cms-setup.create.press')}
      </Button>

      <Dialog open={open} onOpenChange={(next) => setOpen(next)}>
        <DialogContent closeLabel={t('cms-setup.close')} className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('cms-setup.create.title')}</DialogTitle>
            <DialogDescription>
              <Trans
                i18nKey="cms-setup.create.description"
                values={{ tag }}
                components={{ c: <span className="font-mono" /> }}
              />
            </DialogDescription>
          </DialogHeader>

          {busy && !proposal ? (
            <p className="py-6 text-muted-foreground text-sm">{t('cms-setup.create.reading')}</p>
          ) : null}
          {error ? <p className="text-destructive text-sm">{error}</p> : null}

          {proposal ? (
            <div className="flex flex-col gap-4">
              <div className="grid gap-3 sm:grid-cols-2">
                {EDITABLE.map((key) => {
                  const label = t(`cms-setup.create.field.${key}`)
                  const hint = t(`cms-setup.create.hint.${key}`)
                  return (
                    <label key={key} className="flex flex-col gap-1 text-xs">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{label}</span>
                        <SourceMark source={proposal.fields[key]?.source ?? null} />
                      </span>
                      <Input
                        value={edited[key] ?? ''}
                        aria-label={label}
                        onChange={(e) => setEdited({ ...edited, [key]: e.target.value })}
                      />
                      <span className="text-muted-foreground">
                        {proposal.fields[key]?.value === null ? (proposal.fields[key]?.why ?? hint) : hint}
                      </span>
                    </label>
                  )
                })}
              </div>

              <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-xs">
                <span className="font-medium">{t('cms-setup.create.files')}</span>
                {installer ? (
                  <dl className="mt-1.5 grid gap-1">
                    <div className="flex flex-wrap gap-2">
                      <dt className="text-muted-foreground">{INSTALLER_KEY}</dt>
                      <dd className="font-mono">{installer.file}</dd>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <dt className="text-muted-foreground">{CHECKSUM_NAME}</dt>
                      <dd className="break-all font-mono text-[11px]">{installer.sha256}</dd>
                    </div>
                  </dl>
                ) : (
                  <p className="mt-1.5 text-destructive">{proposal.install.why}</p>
                )}
                <p className="mt-2 text-muted-foreground">{t('cms-setup.create.checksumNote')}</p>
              </div>

              {problems.length > 0 ? (
                <ul className="flex list-disc flex-col gap-1 ps-5 text-destructive text-xs">
                  {problems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t('cms-setup.cancel')}
            </Button>
            <Button disabled={busy || !proposal?.install.value} onClick={() => void write()}>
              {busy ? t('cms-setup.create.writing') : t('cms-setup.create.write')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
