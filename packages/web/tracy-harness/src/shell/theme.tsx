/**
 * Light, Dark or System for every `/ops` page, remembered per browser (Akemi, 10/10/2026).
 *
 * The harness owns its `<html>` (DESIGN.md §0, mode A), so dark is the `.dark` class plus
 * `data-theme="dark"` on the root: the two signals `@tracy/ui/tokens.css` switches its dark block
 * on. `System` follows the computer through `prefers-color-scheme` and keeps following it while the
 * page is open. The choice lives in `localStorage`; a browser that refuses storage simply starts on
 * System every time, never a crash.
 */
import { cn } from '@tracy/ui'
import { Monitor, Moon, Sun } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import type * as shell from '../i18n/ns/shell.ts'
import { useT } from '../i18n'

export type ThemeChoice = 'light' | 'dark' | 'system'

const THEME_KEY = 'tracy.ops.theme'
const CHOICES: readonly { id: ThemeChoice; label: shell.ShellKey; icon: typeof Sun }[] = [
  { id: 'light', label: 'shell.theme.light', icon: Sun },
  { id: 'dark', label: 'shell.theme.dark', icon: Moon },
  { id: 'system', label: 'shell.theme.system', icon: Monitor }
]

export function readThemeChoice(): ThemeChoice {
  try {
    const saved = window.localStorage.getItem(THEME_KEY)
    return saved === 'light' || saved === 'dark' ? saved : 'system'
  } catch {
    return 'system'
  }
}

const systemIsDark = () => window.matchMedia?.('(prefers-color-scheme: dark)').matches === true

/** Put the resolved theme on `<html>` — called before the first paint (`main.tsx`) and on every change. */
export function applyTheme(choice: ThemeChoice) {
  const dark = choice === 'dark' || (choice === 'system' && systemIsDark())
  const root = document.documentElement
  root.classList.toggle('dark', dark)
  root.dataset.theme = dark ? 'dark' : 'light'
  root.style.colorScheme = dark ? 'dark' : 'light'
}

export function useTheme(): [ThemeChoice, (next: ThemeChoice) => void] {
  const [choice, setChoice] = useState<ThemeChoice>(readThemeChoice)
  useEffect(() => {
    applyTheme(choice)
    if (choice !== 'system') return
    const query = window.matchMedia?.('(prefers-color-scheme: dark)')
    const follow = () => applyTheme('system')
    query?.addEventListener('change', follow)
    return () => query?.removeEventListener('change', follow)
  }, [choice])
  const choose = useCallback((next: ThemeChoice) => {
    setChoice(next)
    try {
      if (next === 'system') window.localStorage.removeItem(THEME_KEY)
      else window.localStorage.setItem(THEME_KEY, next)
    } catch {
      // Storage refused: the choice holds for this page, it is just not remembered.
    }
  }, [])
  return [choice, choose]
}

/** Three icon buttons, the label on hover — under the brand in the rail. */
export function ThemeSwitch() {
  const [choice, choose] = useTheme()
  const t = useT()
  return (
    <div
      className="flex w-fit gap-0.5 rounded-lg bg-sidebar-accent p-0.5 group-data-[collapsible=icon]:hidden"
      role="group"
      aria-label={t('shell.theme.group')}
      data-theme-switch=""
    >
      {CHOICES.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          title={t(label)}
          aria-label={t(label)}
          aria-pressed={choice === id}
          data-theme-choice={id}
          onClick={() => choose(id)}
          className={cn(
            'flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors',
            'focus-visible:outline-1 focus-visible:outline-ring',
            choice === id ? 'bg-background text-foreground shadow-sm' : 'hover:text-foreground'
          )}
        >
          <Icon className="size-3.5" />
        </button>
      ))}
    </div>
  )
}
