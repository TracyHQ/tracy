import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

import { workspaces } from '../fixtures'

export type ShellMode = 'web' | 'desktop'

interface ShellState {
  mode: ShellMode
  setMode: (m: ShellMode) => void
  dark: boolean
  setDark: (d: boolean) => void
  /** left rail: true = normal (icon + label), false = compact (icon) — shared by web/desktop */
  railExpanded: boolean
  setRailExpanded: (e: boolean) => void
  /** selected workspace — SiteID belongs to a workspace, so switching it switches the site set */
  workspaceId: string
  setWorkspaceId: (id: string) => void
}

const ShellContext = createContext<ShellState | null>(null)

export function ShellProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ShellMode>(() =>
    localStorage.getItem('cwkit-shell') === 'web' ? 'web' : 'desktop'
  )
  const [dark, setDark] = useState<boolean>(() => localStorage.getItem('cwkit-dark') === '1')
  const [railExpanded, setRailExpanded] = useState<boolean>(() => localStorage.getItem('cwkit-rail') === '1')
  const [workspaceId, setWorkspaceId] = useState<string>(() => {
    const saved = localStorage.getItem('cwkit-workspace')
    return workspaces.some((w) => w.id === saved) ? saved! : workspaces[0].id
  })

  useEffect(() => {
    localStorage.setItem('cwkit-rail', railExpanded ? '1' : '0')
  }, [railExpanded])

  useEffect(() => {
    localStorage.setItem('cwkit-workspace', workspaceId)
  }, [workspaceId])

  useEffect(() => {
    localStorage.setItem('cwkit-shell', mode)
  }, [mode])

  useEffect(() => {
    localStorage.setItem('cwkit-dark', dark ? '1' : '0')
    document.documentElement.classList.toggle('dark', dark)
    // data-theme blocks the prefers-color-scheme media branch in tokens.css
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  }, [dark])

  return (
    <ShellContext.Provider
      value={{ mode, setMode, dark, setDark, railExpanded, setRailExpanded, workspaceId, setWorkspaceId }}
    >
      {children}
    </ShellContext.Provider>
  )
}

export function useShell() {
  const ctx = useContext(ShellContext)
  if (!ctx) throw new Error('useShell must be used inside ShellProvider')
  return ctx
}
