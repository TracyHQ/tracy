/**
 * The account menu at the foot of the left column, from the code that ships (Lee, 09/10/2026): the
 * person's face opens a menu — the header (Account), AI accounts, Settings, Appearance, Community.
 *
 * MODE B components (`DESIGN.md` §0) rendered on the bench: what the face, the menu and its rows
 * look like and how the keyboard walks them. Each row is the real component of the plugin that
 * registers it into `settings.menu.item`; the slot's ordering is played here by the array order.
 * The AI accounts row is a stand-in: `tracy-model-plan` imports with `.ts` extensions, which this
 * package's TypeScript settings refuse, and its live half reads a door the bench does not have.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState, useSyncExternalStore } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'

import {
  AccountMenu,
  AppearanceRow,
  type MenuItemProps,
  type MenuViewer,
  SettingsRow
} from '../../../../../ui/tracy-settings/src/client/account-menu'
import { CSS as settingsCss } from '../../../../../ui/tracy-settings/src/client/styles'
import { en as settingsEn } from '../../../../../ui/tracy-settings/src/client/strings'
import { CommunityMenuRow } from '../../../../../ui/tracy-sidebar/src/client/community'
import { en as sidebarEn } from '../../../../../ui/tracy-sidebar/src/client/strings'
import { PopoverItem } from '@tracy/core/site-tabs'

function translate(table: Record<string, string>) {
  return (key: string, params?: Record<string, string | number>) =>
    (table[key] ?? key).replace(/\{(\w+)\}/g, (m, name) =>
      params && name in params ? String(params[name]) : m
    )
}

const VIEWERS: Record<string, MenuViewer> = {
  signedIn: {
    state: 'signedIn',
    email: 'leeknowsnothin@example.com',
    name: 'Lee',
    face: { initial: 'L', color: '#bf5b3d', avatarUrl: null }
  },
  emailOnly: {
    state: 'signedIn',
    email: 'leeknowsnothin@example.com',
    name: null,
    face: { initial: 'L', color: '#bf5b3d', avatarUrl: null }
  },
  loading: { state: 'loading', email: null, name: null, face: null }
}

const NO_KEYS: readonly string[] = ['⌘', ',']
const shortcut = { getSnapshot: () => NO_KEYS, subscribe: () => () => {} }

/** dsh's theme service, held in the story. */
function useTheme() {
  const [store] = useState(() => {
    let preference = 'system'
    const listeners = new Set<() => void>()
    return {
      getPreference: () => preference,
      subscribe: (listener: () => void) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
      setPreference: (id: 'light' | 'dark' | 'system') => {
        preference = id
        for (const listener of listeners) listener()
      }
    }
  })
  useSyncExternalStore(store.subscribe, store.getPreference)
  return store
}

interface Args {
  viewer: keyof typeof VIEWERS
  wide: boolean
  accountShown: boolean
}

function Scene({ viewer, wide, accountShown }: Args) {
  const theme = useTheme()
  const [opened, setOpened] = useState('')
  const rows = (props: MenuItemProps) => [
    <PopoverItem key="ai" onClick={() => props.openSettings('tracy-model-plan')}>
      AI accounts
    </PopoverItem>,
    <SettingsRow key="settings" {...props} t={translate(settingsEn)} shortcut={shortcut} />,
    <AppearanceRow key="appearance" {...props} t={translate(settingsEn)} theme={theme} />,
    <CommunityMenuRow key="community" {...props} t={translate(sidebarEn) as never} />
  ]
  return (
    <div className="tsb-root" style={{ display: 'flex', height: 560, width: 760 }}>
      <style>{settingsCss}</style>
      <div
        style={{
          width: wide ? 280 : 56,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end'
        }}
        className="border-r bg-sidebar p-2"
      >
        <AccountMenu
          viewer={VIEWERS[viewer]}
          wide={wide}
          t={translate(settingsEn)}
          accountShown={accountShown}
          renderItems={rows}
          onOpenSettings={(id) => setOpened(id)}
        />
      </div>
      <div
        className="flex flex-1 items-center justify-center text-muted-foreground text-sm"
        data-testid="opened"
      >
        {opened === '' ? 'Settings closed' : `Settings opened on: ${opened}`}
      </div>
    </div>
  )
}

const meta: Meta<typeof Scene> = {
  title: 'Pages/In dsh/Account menu',
  component: Scene,
  parameters: { layout: 'centered' },
  argTypes: { viewer: { control: 'inline-radio', options: Object.keys(VIEWERS) } },
  args: { viewer: 'signedIn', wide: false, accountShown: true }
}
export default meta

type Story = StoryObj<typeof Scene>

/** The rail collapsed: the face alone. The play walks the menu with the keyboard. */
export const RailCollapsed: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const face = canvas.getByRole('button', { name: 'Lee: account and settings' })
    face.focus()
    await userEvent.keyboard('{Enter}')
    const page = within(document.body)
    const header = await page.findByRole('menuitem', { name: /Lee/ })
    await waitFor(() => expect(document.activeElement).toBe(header))
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}')
    const appearance = page.getByRole('menuitem', { name: 'Appearance' })
    await expect(document.activeElement).toBe(appearance)
    await userEvent.keyboard('{ArrowRight}')
    const system = await page.findByRole('menuitemradio', { name: 'System' })
    await expect(system).toHaveAttribute('aria-checked', 'true')
    await waitFor(() =>
      expect(document.activeElement).toBe(page.getByRole('menuitemradio', { name: 'Light' }))
    )
    await userEvent.keyboard('{ArrowLeft}')
    await expect(document.activeElement).toBe(appearance)
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(document.activeElement).toBe(face))
    await expect(page.queryByRole('menu')).toBeNull()
  }
}

/** The column open: the face and the name. */
export const RailWide: Story = { args: { wide: true } }

/** No display name: the email stands for the person. */
export const EmailOnly: Story = { args: { wide: true, viewer: 'emailOnly' } }

/** Before `/auth/me` answers: a grey disc, no header, and Settings still opens. */
export const Loading: Story = { args: { viewer: 'loading', wide: true } }

/** The Account section switched off: the header says who, but is not a row. */
export const AccountOff: Story = { args: { accountShown: false } }
