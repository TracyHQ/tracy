/**
 * Fixture for `../e2e/dialogs-fit-360.test.mjs`: one of the `tracy-mysites` dialogs, open, in a
 * page carrying this plugin's real stylesheet (the build's Tailwind output plus `styles.ts`, the
 * order `apply()` injects them in). `?dialog=` names which: `role` and `revoke` (`@tracy/core/team`,
 * the Team tab's), `invite` (the invite wizard), `leave` and `delete` (My Sites' row menu).
 *
 * Strings are the keys themselves, or `en` where this package owns them: the overflow under test is
 * the box (width, padding, border), not a word.
 */
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { ChangeRoleDialog, InviteWizard, RevokeDialog, type SeatRow } from '@tracy/core/team'
import { DeleteDialog, LeaveDialog } from '../../src/client/more'
import { en } from '../../src/client/strings'
import { CSS, TAILWIND } from '../../src/client/styles'

/** The site tabs' rules (`site-tabs-rules.css`), substituted by the harness's esbuild `define`. */
declare const __SITE_TABS_RULES__: string

const style = document.createElement('style')
// The site tabs' rules come last, as on the dsh page: the invite wizard's 560px width lives there.
style.textContent = `${TAILWIND}\n${CSS}\n${__SITE_TABS_RULES__}`
document.head.appendChild(style)
if (new URLSearchParams(window.location.search).get('dark') === '1') {
  document.documentElement.setAttribute('data-ds-dark-theme', '')
}

const t = (key: string, params?: Record<string, string | number>): string =>
  ((en as Record<string, string>)[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => String(params?.[k] ?? ''))

const SEAT: SeatRow = {
  id: 'seat-1',
  email: 'akemi.someone@northwind0929.example',
  displayName: 'Akemi Someone',
  role: 'editor',
  status: 'active',
  grantedAt: new Date().toISOString(),
  grantedBy: null,
  revokedAt: null,
  requestedAt: null,
  scope: 'site'
}
const SITE = 'acmedemo-wp1015-check.tracy.site'
const noop = (): void => {}

function Dialog(): unknown {
  switch (new URLSearchParams(window.location.search).get('dialog')) {
    case 'role':
      return createElement(ChangeRoleDialog, {
        seat: SEAT,
        viewerRole: 'owner',
        ownerCount: 1,
        busy: false,
        onOpenChange: noop,
        onSubmit: noop,
        t
      })
    case 'revoke':
      return createElement(RevokeDialog, { seat: SEAT, busy: false, onOpenChange: noop, onConfirm: noop, t })
    case 'invite':
      return createElement(InviteWizard, {
        open: true,
        onOpenChange: noop,
        sites: [{ siteKey: SITE, platform: 'wordpress', myRole: 'owner' }],
        onSent: noop,
        t
      })
    case 'leave':
      return createElement(LeaveDialog, {
        siteKey: SITE,
        busy: false,
        error: null,
        onOpenChange: noop,
        onConfirm: noop,
        t
      })
    case 'delete':
      return createElement(DeleteDialog, {
        siteKey: SITE,
        busy: false,
        error: null,
        onOpenChange: noop,
        onConfirm: noop,
        t
      })
    default:
      return null
  }
}

createRoot(document.getElementById('panel')!).render(createElement(Dialog as never))
