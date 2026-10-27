/**
 * Fixture for `../e2e/delete-result.test.mjs`: the real `MySitesTab` in a page carrying this
 * plugin's real stylesheet (the build's Tailwind output plus `styles.ts`, the order `apply()`
 * injects them in).
 *
 * Nothing is mocked here: the test answers `/api/sites`, `/api/team`, `/auth/me` and the DELETE
 * itself at the network (Playwright `page.route`), so each case injects one deterministic answer.
 * The site the page stands in is the first path segment, as in the product (`siteKeyHere`).
 *
 * `window.__unmountTab()` takes the tab away the way dsh does when a delete makes it forget the
 * page's workspace (`deleting-cover.ts`): whatever the delete reports afterwards must not depend on
 * the tab still being there.
 */
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { TabLoadingScope } from '@tracy/ui'
import { MySitesTab } from '../../src/client/index'
import { en } from '../../src/client/strings'
import { CSS, TAILWIND } from '../../src/client/styles'

declare global {
  interface Window {
    __unmountTab: () => void
  }
}

const style = document.createElement('style')
style.textContent = `${TAILWIND}\n${CSS}`
document.head.appendChild(style)
if (new URLSearchParams(window.location.search).get('dark') === '1') {
  document.documentElement.setAttribute('data-ds-dark-theme', '')
}

const t = (key: string, params?: Record<string, string | number>): string =>
  ((en as Record<string, string>)[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => String(params?.[k] ?? ''))

const root = createRoot(document.getElementById('panel')!)
root.render(createElement(TabLoadingScope, { label: t('loading.label') }, createElement(MySitesTab, { t })))
window.__unmountTab = () => root.unmount()
