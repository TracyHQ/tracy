/**
 * Files in the creation workspace's chat: the chips of the chat box's draft (uploading, stored,
 * refused) and the chips under a question that carried them. The markup and class names are
 * `@tracy/dsh-chat-input`'s (`ComposerChips.tsx`, `.tv-att` / `.tv-chip`), whose stylesheet is on every
 * page, so a file looks the same in this chat box and in a site's.
 */
import { X } from 'lucide-react'
import type { DraftFile, HelpFile } from './files'
import { isPicture, sizeText } from './files'
import type { Translate } from './strings'

/** The extension as the chip's badge: "PDF", "DOCX", or "FILE". */
function badgeOf(name: string): string {
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1) return 'FILE'
  return (
    name
      .slice(dot + 1)
      .replace(/[^a-z0-9]/gi, '')
      .slice(0, 4)
      .toUpperCase() || 'FILE'
  )
}

/** The draft's files, above the text: each with its state and a remove button. */
export function DraftChips({
  files,
  t,
  onRemove
}: {
  files: readonly DraftFile[]
  t: Translate
  onRemove: (key: string) => void
}) {
  if (files.length === 0) return null
  return (
    <div className="tv-att" role="group" aria-label={t('onboarding.attach')}>
      {files.map((f) => {
        const state = f.status === 'uploading' ? 'uploading' : f.status === 'failed' ? 'error' : 'done'
        // The reason of a refusal is said once, under the chat box; the chip keeps it as its tooltip.
        const meta =
          f.status === 'uploading'
            ? t('file.uploading', { name: f.name })
            : f.status === 'failed'
              ? t(f.problem ?? 'file.failed', { name: f.name })
              : sizeText(f.bytes)
        return (
          <div key={f.key} className="tv-chip" data-state={state} title={meta}>
            <span className="tv-chip-body">
              <span className="tv-chip-badge" aria-hidden="true">
                {f.status === 'uploading' ? <span className="tv-chip-spinner" /> : badgeOf(f.name)}
              </span>
              <span className="tv-chip-name">{f.name}</span>
              <span className="tv-chip-meta">{f.status === 'done' ? meta : ''}</span>
            </span>
            <button
              type="button"
              className="tv-chip-x"
              aria-label={t('file.remove', { name: f.name })}
              title={t('file.remove', { name: f.name })}
              onClick={() => onRemove(f.key)}
            >
              <X aria-hidden="true" />
            </button>
          </div>
        )
      })}
    </div>
  )
}

/** The files a sent question carried: each opens (a picture) or downloads (any other) from its door. */
export function SentChips({ files, t }: { files: readonly HelpFile[]; t: Translate }) {
  if (files.length === 0) return null
  return (
    <div className="tv-att tv-help-files" role="group">
      {files.map((f) => (
        <div key={f.id} className="tv-chip" title={f.name}>
          <a
            className="tv-chip-body"
            href={f.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t('file.open', { name: f.name })}
            {...(isPicture(f.type) ? {} : { download: f.name })}
          >
            {isPicture(f.type) ? (
              <img className="tv-chip-thumb" src={f.url} alt="" />
            ) : (
              <span className="tv-chip-badge" aria-hidden="true">
                {badgeOf(f.name)}
              </span>
            )}
            <span className="tv-chip-name">{f.name}</span>
            <span className="tv-chip-meta">{sizeText(f.bytes)}</span>
          </a>
        </div>
      ))}
    </div>
  )
}
