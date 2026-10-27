/**
 * The pieces of the Quickstart settings tab: the release's two presses, the install-file table and
 * the built-sites table. Read-only except the presses.
 */
import {
  Button,
  buttonVariants,
  cn,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@tracy/ui'
import { Check, Copy, ExternalLink } from 'lucide-react'
import { useState } from 'react'

import { useT } from '../i18n'
import { CreateSetting } from './CreateSetting'
import { when } from './Quickstarts'
import { type InstallFile, type ReleaseFacts, TONE_TEXT } from './quickstart-settings-facts'

/** The checksum's name, a column head in every language. */
const CHECKSUM_NAME = 'sha256'

export const githubReleaseHref = (tag: string) =>
  `https://github.com/JoomlArt-Products/ja-products/releases/tag/${encodeURIComponent(tag)}`

export function OpenOnGithub({ tag }: { tag: string }) {
  const t = useT()
  return (
    <a
      href={githubReleaseHref(tag)}
      target="_blank"
      rel="noreferrer"
      className={buttonVariants({ variant: 'outline', size: 'sm' })}
    >
      <ExternalLink />
      {t('cms-setup.github.open')}
    </a>
  )
}

/** "Create the file" when the release lacks tracy_setting.json, then "Open on GitHub". */
export function ReleaseActions({
  facts,
  writable,
  onChanged
}: {
  facts: ReleaseFacts
  writable: boolean
  onChanged: () => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {facts.setting === 'no-setting' && facts.kind === 'quickstart' ? (
        <span data-road-control="create-setting">
          <CreateSetting tag={facts.tag} writable={writable} variant="outline" onWritten={onChanged} />
        </span>
      ) : null}
      <span data-road-control="open-github">
        <OpenOnGithub tag={facts.tag} />
      </span>
    </div>
  )
}

/** The first 12 characters of a checksum; the whole one on hover and on copy. */
export function Sha({ value }: { value: string }) {
  const t = useT()
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard refused (no permission, insecure origin): the full value is still on hover.
    }
  }
  return (
    <span className="inline-flex items-center gap-1" title={value}>
      <span className="font-mono text-[11px] text-muted-foreground">{value.slice(0, 12)}…</span>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={() => void copy()}
        aria-label={copied ? t('cms-setup.files.copied') : t('cms-setup.files.copy')}
      >
        {copied ? <Check /> : <Copy />}
      </Button>
    </span>
  )
}

export function FilesTable({ files }: { files: InstallFile[] }) {
  const t = useT()
  if (files.length === 0) return <p className="text-muted-foreground text-xs">{t('cms-setup.files.none')}</p>
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('cms-setup.files.part')}</TableHead>
          <TableHead>{t('cms-setup.files.file')}</TableHead>
          <TableHead>{CHECKSUM_NAME}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {files.map((f) => (
          <TableRow key={f.part}>
            <TableCell className="font-mono text-xs">{f.part}</TableCell>
            <TableCell className="font-mono text-xs">{f.file}</TableCell>
            <TableCell>
              <Sha value={f.sha256} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export function SitesTable({ facts }: { facts: ReleaseFacts }) {
  const t = useT()
  if (facts.sites.length === 0)
    return <p className="text-muted-foreground text-xs">{t('cms-setup.sites.none')}</p>
  return (
    <div className="flex flex-col gap-1.5">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('cms-setup.sites.site')}</TableHead>
            <TableHead>{t('cms-setup.sites.host')}</TableHead>
            <TableHead>{t('cms-setup.sites.version')}</TableHead>
            <TableHead>{t('cms-setup.sites.created')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {facts.sites.map((s) => {
            const older = s.version && facts.quickstartVersion && s.version !== facts.quickstartVersion
            return (
              <TableRow key={s.label}>
                <TableCell
                  className="font-mono text-xs"
                  data-site-demo={s.demo ? (s.live ? 'live' : 'not-live') : undefined}
                >
                  {s.label}
                  {s.demo ? (
                    <span
                      className={cn('ml-1.5 font-sans', s.live ? 'text-muted-foreground' : TONE_TEXT.warn)}
                    >
                      {s.live ? t('cms-setup.sites.demo') : t('cms-setup.sites.demoNotLive')}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="text-xs">{s.host}</TableCell>
                <TableCell className="font-mono text-xs">
                  {s.version ?? t('cms-setup.sites.unknown')}
                  {older ? (
                    <span className={cn('ml-1.5 font-sans', TONE_TEXT.warn)}>
                      {t('cms-setup.sites.notVersion', { version: facts.quickstartVersion ?? '' })}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="font-mono text-muted-foreground text-xs">{when(s.createdAt)}</TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      {facts.sitesCapped ? (
        <p className="text-muted-foreground text-xs">
          {t('cms-setup.sites.latest', { count: facts.sites.length })}
        </p>
      ) : null}
    </div>
  )
}

/** "4 sites" with the cap the door applies. */
export const sitesCount = (facts: ReleaseFacts) => `${facts.sites.length}${facts.sitesCapped ? '+' : ''}`
