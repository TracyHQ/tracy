/**
 * THROWAWAY MOCK — Should the native right Sidebar's Start page become the old + launcher again?
 *
 * dsh 0.1.7 renders Start as a guide of registered tab types. Before the native surface, Better
 * Sidebar put a + directly after the tabs and opened its registry-driven menu there. This draws
 * that interaction in the current tab strip for Lee to review before a product fork is changed.
 * Lee chose two launcher entries: Add site and Design inspirations. Other registered tab types
 * stay openable from their own entry points, so this menu filter must not disable those types.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'
import { FolderOpen, Globe, Palette, Plus, X } from 'lucide-react'
import { useRef, useState } from 'react'

// Use the same menu primitive as Better Sidebar's real TabBar, so the mockup
// shows the dsh menu surface, compact rows, and keyboard behavior verbatim.
import { Menu } from '@deepseek-ai/dsh-client-ui-primitives'

import css from '../../../../../vendor/tracy/dsh-better-sidebar/src/client/sidebar.module.css'

const meta: Meta = {
  title: 'Mockups/Better Sidebar Start',
  parameters: { layout: 'fullscreen' }
}
export default meta
type Story = StoryObj

const ALIASES = {
  '--dsw-alias-bg-layer-1': 'var(--card)',
  '--dsw-alias-border-l1': 'var(--border)',
  '--dsw-alias-label-primary': 'var(--foreground)',
  '--dsw-alias-label-secondary': 'var(--muted-foreground)',
  '--dsw-alias-label-tertiary': 'var(--muted-foreground)',
  '--dsw-alias-interactive-bg-active': 'var(--muted)',
  '--dsw-alias-interactive-bg-hover': 'var(--accent)',
  '--dsw-font-xxs-12': '400 12px/16px ui-sans-serif, system-ui, sans-serif'
} as React.CSSProperties

type LaunchOption = { id: string; label: string; icon: typeof Plus }

/** The two launcher entries Lee selected; product keeps the other tab types registered. */
const OPTIONS: LaunchOption[] = [
  { id: 'add-site', label: 'Add site', icon: Plus },
  { id: 'inspirations', label: 'Design inspirations', icon: Palette }
]

function StartLauncher({
  initiallyOpen = false,
  noTabs = false
}: {
  initiallyOpen?: boolean
  noTabs?: boolean
}) {
  const [menuOpen, setMenuOpen] = useState(initiallyOpen || noTabs)
  const [selected, setSelected] = useState<LaunchOption | null>(null)
  const [active, setActive] = useState<'Files' | 'Live Edit' | 'Selected'>(noTabs ? 'Selected' : 'Live Edit')
  const plusRef = useRef<HTMLButtonElement>(null)
  const openOption = (option: LaunchOption) => {
    setSelected(option)
    setActive('Selected')
    setMenuOpen(false)
  }
  return (
    <main className="min-h-dvh bg-muted/30 p-10 text-foreground">
      <p className="mx-auto mb-3 max-w-[760px] text-sm text-muted-foreground">
        Mockup · the old + launcher in the current Better Sidebar tab strip
      </p>
      <section
        className="mx-auto flex h-[520px] max-w-[760px] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm"
        style={ALIASES}
      >
        <div className={css.tabBar}>
          <div className={css.tabList}>
            {!noTabs && (
              <>
                <div
                  className={`${css.tab} ${active === 'Files' ? css.tabActive : ''}`}
                  onClick={() => setActive('Files')}
                >
                  <FolderOpen size={14} />
                  <span className={css.tabTitle}>Files</span>
                  <button className={css.tabClose} aria-label="Close Files">
                    <X size={12} />
                  </button>
                </div>
                <div
                  className={`${css.tab} ${active === 'Live Edit' ? css.tabActive : ''}`}
                  onClick={() => setActive('Live Edit')}
                >
                  <Globe size={14} />
                  <span className={css.tabTitle} title="pvdriling.tracy.test">
                    pvdriling.tracy.test
                  </span>
                  <button className={css.tabClose} aria-label="Close Live Edit">
                    <X size={12} />
                  </button>
                </div>
              </>
            )}
            {selected && (
              <div
                className={`${css.tab} ${active === 'Selected' ? css.tabActive : ''}`}
                onClick={() => setActive('Selected')}
              >
                <selected.icon size={14} />
                <span className={css.tabTitle}>{selected.label}</span>
                <button
                  className={css.tabClose}
                  aria-label={`Close ${selected.label}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    setSelected(null)
                    setActive(noTabs ? 'Selected' : 'Live Edit')
                  }}
                >
                  <X size={12} />
                </button>
              </div>
            )}
            <Menu
              open={menuOpen}
              onClose={() => setMenuOpen(false)}
              onSelect={(id) => {
                const option = OPTIONS.find((item) => item.id === id)
                if (option) openOption(option)
              }}
              items={OPTIONS.map((option) => ({ id: option.id, label: option.label, icon: <option.icon /> }))}
              portal
              compact
              align="end"
              side="right"
              // dsh Menu's side=right starts at anchor.top; shift its zero-height
              // anchor to the button's bottom edge to match Lee's chosen origin.
              getAnchorRect={() => {
                const rect = plusRef.current?.getBoundingClientRect()
                if (!rect) return null
                // The compact DSH card's minimum width is 156px. The primitive
                // clamps overflowing menus; move its virtual anchor left first
                // so the card flips to the left of + when the right edge is tight.
                const cardWidth = 156
                const gap = 4
                const margin = 12
                const flipLeft = window.innerWidth - rect.right < cardWidth + gap + margin
                const right = flipLeft ? rect.left - cardWidth - gap : rect.right
                return new DOMRect(right - rect.width, rect.bottom, rect.width, 0)
              }}
              anchor={
                <button
                  ref={plusRef}
                  type="button"
                  className={css.tabBarPlus}
                  aria-label="Open a tab"
                  title="Open a tab"
                  onClick={() => setMenuOpen((open) => !open)}
                >
                  <Plus size={16} />
                </button>
              }
            />
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          {selected && active === 'Selected'
            ? `${selected.label} opens in a tab`
            : active === 'Files'
              ? 'Files'
              : active === 'Live Edit'
                ? 'Live site preview'
                : 'Click + to start'}
        </div>
      </section>
    </main>
  )
}

export const PlusClosed: Story = {
  name: '1 · + replaces Start',
  render: () => <StartLauncher />
}

export const PlusMenuOpen: Story = {
  name: '2 · + offers two primary actions',
  render: () => <StartLauncher initiallyOpen />
}

export const EmptyStrip: Story = {
  name: '3 · + when no tab is open',
  render: () => <StartLauncher noTabs />
}
