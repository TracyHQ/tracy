/**
 * The "no preview — download instead" pane: shown by the editor host when no
 * viewer can render a file (binary without a registered renderer, or the
 * `binary-download` strategy) and registered as the `binary-download` viewer
 * component so the declarative route and the host fallback share one UI.
 *
 * The link fetches before it saves (`save-download.ts`): a refused download
 * says why here instead of saving the route's JSON error as the file.
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import type { SessionScope } from './api.ts'
import { downloadUrl } from './api.ts'
import { t } from './locales.ts'
import { downloadName, saveDownload } from './save-download.ts'
import css from './sidebar.module.css'

export function BinaryDownload(props: { scope: SessionScope; path: string }): ReactNode {
  const { scope, path } = props
  const [error, setError] = useState<string | null>(null)
  const url = downloadUrl(scope, path)
  return (
    <div className={css.editorBinary}>
      <span className={css.editorBinaryNotice}>{t('binaryNoPreview')}</span>
      <a
        className={css.editorDownloadLink}
        href={url}
        download
        onClick={(event) => {
          event.preventDefault()
          setError(null)
          saveDownload(url, downloadName(path)).catch((failure: unknown) => {
            setError(t('downloadFailed', { message: failure instanceof Error ? failure.message : String(failure) }))
          })
        }}
      >
        {t('downloadToView')}
      </a>
      {error !== null && <span className={css.editorBinaryNotice} role="alert">{error}</span>}
    </div>
  )
}
