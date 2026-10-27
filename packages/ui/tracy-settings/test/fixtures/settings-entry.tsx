/**
 * Fixture for `../e2e/settings-fits-360.test.mjs`: the Settings dialog, open on `?section=`, with the
 * real sections the dsh page puts in it — General (Tracy's Language row and a row of the same build),
 * Account (`@tracy/dsh-my-sites`), AI accounts (`@tracy/dsh-model-plan`), Notifications and Help &
 * about (this package). Each plugin's own stylesheet is injected as on the dsh page: its Tailwind
 * output (built by the harness, `__*_TAILWIND__`) and its plain rules (`CSS`).
 *
 * The doors the sections read (`/auth/me`, `/api/seat-plan/status`, `/api/notifications/preferences`,
 * `/api/build`) are answered by the harness's server with the shapes measured on dev 09/10/2026.
 */
import { createElement, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AccountsPane } from '../../../tracy-model-plan/src/client/AccountsPane'
import { en as planEn } from '../../../tracy-model-plan/src/client/strings'
import { AccountSection } from '../../../../site/tracy-my-sites/src/client/index'
import { en as sitesEn } from '../../../../site/tracy-my-sites/src/client/strings'
import { CSS as SITES_CSS } from '../../../../site/tracy-my-sites/src/client/styles'
import { createUpdateSource } from '../../src/client/desktop-updates'
import { HELP_SECTION_ID, HelpAboutSection } from '../../src/client/help-about-section'
import { SettingsPage } from '../../src/client/index'
import { LanguageRow } from '../../src/client/language-row'
import { NOTIFICATIONS_SECTION_ID, NotificationsSection } from '../../src/client/notifications-section'
import { en } from '../../src/client/strings'
import { CSS } from '../../src/client/styles'

declare const __SETTINGS_TAILWIND__: string
declare const __SITES_TAILWIND__: string
declare const __PLAN_TAILWIND__: string

// The order the plugins inject their sheets on the dsh page does not matter for this test: each
// sheet's rules are scoped to its own root class.
for (const text of [__SETTINGS_TAILWIND__, CSS, __SITES_TAILWIND__, SITES_CSS, __PLAN_TAILWIND__]) {
  const style = document.createElement('style')
  style.textContent = text
  document.head.appendChild(style)
}
const params = new URLSearchParams(window.location.search)
if (params.get('dark') === '1') document.documentElement.setAttribute('data-ds-dark-theme', '')

type Dict = Record<string, string>
const translate =
  (dict: Dict) =>
  (key: string, values?: Record<string, unknown>): string =>
    (dict[key] ?? key).replace(/\{(\w+)\}/g, (_, k: string) => String(values?.[k] ?? ''))
const t = translate(en as Dict)
const tSites = translate(sitesEn as Dict)
const tPlan = translate(planEn as Dict)

// One snapshot object: `useSyncExternalStore` loops on a fresh object per read.
const LANGUAGE = {
  active: 'en',
  preference: undefined,
  locales: [
    { id: 'en', label: 'English' },
    { id: 'vi', label: 'Tiếng Việt' }
  ]
}
const language = {
  getSnapshot: () => LANGUAGE,
  subscribe: () => () => {},
  setLocale: () => {},
  clearPreference: () => {}
}
const updates = createUpdateSource(null)

const ROWS = [
  { id: 'general', order: 0, label: t('general.nav'), group: '' },
  // dsh hands a section's `group` on to the shell only once it keeps extra options (index.tsx
  // SECTION_GROUPS), so on dev 09/10 every section stood under Workspace: the same here.
  { id: 'tracy-account', order: 20, label: tSites('account.nav'), group: '' },
  { id: 'tracy-model-plan', order: 21, label: tPlan('nav'), group: '' },
  { id: NOTIFICATIONS_SECTION_ID, order: 22, label: t('notifications.nav'), group: '' },
  { id: HELP_SECTION_ID, order: 1000, label: t('help.nav'), group: 'help' }
]

function General(): JSX.Element {
  return (
    <div className="ts-general">
      <div className="ts-general-item">
        <LanguageRow t={t} language={language as never} />
      </div>
      <div className="ts-general-item">
        {/* dsh's theme row, drawn with the same row build Tracy gives its own rows. */}
        <div className="ts-row">
          <div className="ts-row-text">
            <span className="ts-row-title">Theme</span>
            <span className="ts-row-desc">Light, dark, or follow the system appearance.</span>
          </div>
          <button type="button" className="ts-select">
            System
          </button>
        </div>
      </div>
    </div>
  )
}

function section(id: string): JSX.Element | null {
  switch (id) {
    case 'general':
      return <General />
    case 'tracy-account':
      return <AccountSection t={tSites} />
    case 'tracy-model-plan':
      return <AccountsPane t={tPlan} />
    case NOTIFICATIONS_SECTION_ID:
      return <NotificationsSection t={t} />
    case HELP_SECTION_ID:
      return <HelpAboutSection t={t} updates={updates} />
    default:
      return null
  }
}

function App(): JSX.Element {
  const [active, setActive] = useState(params.get('section') ?? 'general')
  // dsh fills `settings.header` with its "Settings" title; the sections by id.
  const renderSlot = (name: string, _owner: unknown, options?: { only?: string }) =>
    name === 'settings.header'
      ? 'Settings'
      : name === 'settings.section' && options?.only !== undefined
        ? section(options.only)
        : null
  return (
    <SettingsPage
      t={t}
      renderSlot={renderSlot as never}
      rows={ROWS}
      activeId={active}
      onSelect={setActive}
      onClose={() => {}}
    />
  )
}

createRoot(document.getElementById('panel') as HTMLElement).render(createElement(App))
