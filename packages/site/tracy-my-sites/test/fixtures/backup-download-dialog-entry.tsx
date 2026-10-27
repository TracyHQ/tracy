import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { DownloadBackupDialog } from '../../../../core/tracy-core/src/site-tabs/DownloadBackupDialog'
import type { BackupPoint } from '../../../../core/tracy-core/src/site-tabs/backup-list'
import { CSS, TAILWIND } from '../../src/client/styles'
import { en } from '../../../tracy-site-tabs/src/client/strings'

declare const __SITE_TABS_RULES__: string

const style = document.createElement('style')
style.textContent = `${TAILWIND}\n${CSS}\n${__SITE_TABS_RULES__}`
document.head.appendChild(style)

const t = (key: string, params?: Record<string, string | number>): string => {
  const raw = (en as Record<string, string>)[key] ?? key
  return raw.replace(/\{(\w+)\}/g, (_, name) => String(params?.[name] ?? ''))
}
const backup = {
  version: 3,
  title: 'Before launch',
  initial: false,
  beforeRestoreTo: null
} as BackupPoint

const dialog = () =>
  createElement(DownloadBackupDialog, {
    siteKey: 'acme.tracy.site',
    backup,
    time: { absolute: (iso: string) => iso },
    onClose: () => undefined,
    t
  })

createRoot(document.getElementById('panel')!).render(dialog())
// `?twice=1`: a second instance opens while the first is still on the page, as when one dialog is
// still in its exit animation and the next opens, in its own root with no `identifierPrefix`.
if (new URLSearchParams(window.location.search).get('twice') === '1')
  setTimeout(() => {
    const host = document.createElement('div')
    document.body.append(host)
    createRoot(host).render(dialog())
  }, 500)
