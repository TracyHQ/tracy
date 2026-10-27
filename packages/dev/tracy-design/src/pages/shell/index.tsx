/**
 * The dsh frame, redrawn with shadcn-admin tokens and components.
 *
 * PURPOSE: a place to discuss LAYOUT without opening the real dsh. Measurements come from the running surface
 * (`127.0.0.1:51740`, native profile), not estimated by eye:
 *
 *     left column    280px fixed   → logo 60 · new-session button 38 · flexible tree area · footer 32
 *     centre column  flexible      → header 76 (title + tabs) · scrolling body · composer pinned to the bottom
 *     right column   534px         → toolbar · 3-column card grid
 *
 * ⚠ NO LOGIC CARRIED OVER. No store, no router, no network calls, no plugins. The only state is
 * four `useState`s for things you must click to see: collapse/expand the left column, selected tab, selected
 * session, show/hide the right column. This is a drawing, not a running build — and it must stay that way,
 * or it quietly becomes a second dsh to maintain.
 *
 * ⚠ ENGLISH TEXT, even though the real dsh currently shows Vietnamese. This drawing lives in an all-English
 * template; mixing two languages on one screen makes viewers think they are looking at a half-done translation.
 * Language is the locale package's job, not the layout drawing's.
 *
 * ⚠ COLOURS AND SPACING ARE SHADCN-ADMIN'S, NOT DSH'S. That is on purpose: what is being compared
 * here is the frame, and the palette is taken from the template. So do not read this to conclude dsh's colours are wrong.
 */
import { useState } from 'react'
import {
  ChevronDown,
  Clock,
  FolderOpen,
  Globe,
  ListFilter,
  MessageSquare,
  Monitor,
  PanelLeft,
  PanelRight,
  Paperclip,
  Plus,
  Search,
  Send,
  Settings,
  SquareTerminal,
  SquarePen,
  GitBranch,
  Files,
  ListChecks,
  Download
} from 'lucide-react'

import { cn } from '@tracy/ui'
import { TracyMark } from '@tracy/ui/brand'
import { SettingsDialog } from './settings-dialog'
import { Badge } from '@tracy/ui'
import { Button } from '@tracy/ui'
import { ScrollArea } from '@tracy/ui'
import { Separator } from '@tracy/ui'

/** Sessions in the left tree. Made-up data, matching the shape dsh currently shows. */
const SESSIONS = [
  { title: 'Demo WP site', age: '1h' },
  { title: 'Simple greeting', age: '4h' },
  { title: 'Greeting and initial inquiry', age: '22h' },
  { title: 'AI coding-assistant greeting', age: '1d' },
  { title: 'AI coding assistant greeting', age: '1d' }
]

/** Tool cards in the right column — exactly the eight tiles of the real surface, in order. */
const TOOLS = [
  { label: 'Files', icon: Files },
  { label: 'Source Control', icon: GitBranch },
  { label: 'Tasks', icon: ListChecks },
  { label: 'Side Chat', icon: MessageSquare, badge: 'beta' },
  { label: 'Terminal', icon: SquareTerminal },
  { label: 'Browser', icon: Globe },
  { label: 'My Sites', icon: Monitor },
  { label: 'Add site', icon: Plus }
]

const TABS = ['Conversation', 'Trajectory'] as const

export function TracyShell() {
  const [railOpen, setRailOpen] = useState(true)
  const [panelOpen, setPanelOpen] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [tab, setTab] = useState<(typeof TABS)[number]>('Conversation')
  const [active, setActive] = useState('Simple greeting')

  return (
    // `h-svh`, not `h-screen`: on mobile browsers the address bar eats the bottom, and
    // the composer — the thing pinned to the bottom — is swallowed first.
    <div className="flex h-svh w-full overflow-hidden bg-background text-foreground">
      <Rail
        open={railOpen}
        active={active}
        onSelect={setActive}
        onToggle={() => setRailOpen((value) => !value)}
        onSettings={() => setSettingsOpen(true)}
      />

      <section className="flex min-w-0 flex-1 flex-col">
        <CenterHeader tab={tab} onTab={setTab} />
        <Conversation title={active} />
        <Composer />
      </section>

      {panelOpen ? <ToolPanel onClose={() => setPanelOpen(false)} /> : null}
      {!panelOpen ? (
        <div className="border-border border-s p-2">
          <Button variant="ghost" size="icon" onClick={() => setPanelOpen(true)} aria-label="Show tool panel">
            <PanelRight />
          </Button>
        </div>
      ) : null}

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  )
}

/* ── Left column ──────────────────────────────────────────────────────────────────────────── */

/**
 * The left column, TWO modes — 280px full and 56px icon-only.
 *
 * 🔒 COLLAPSING MEANS NARROWING, NOT DISAPPEARING. My first version removed `<aside>` from the tree entirely, and it was wrong in
 * the hardest way to spot: it "hides fine" at a glance, but the user loses the way back and
 * every sign of where they are. dsh keeps the column at 56px with 36×36 buttons — measurements taken from
 * the real surface, not estimated.
 */
function Rail({
  open,
  active,
  onSelect,
  onToggle,
  onSettings
}: {
  open: boolean
  active: string
  onSelect: (title: string) => void
  onToggle: () => void
  onSettings: () => void
}) {
  return (
    <aside
      className={cn(
        'flex shrink-0 flex-col border-border border-e bg-sidebar text-sidebar-foreground',
        open ? 'w-70' : 'w-14'
      )}
    >
      {/* 60px — logo + collapse button. In narrow mode only the mark remains, and the collapse button drops to the next row. */}
      <div className={cn('flex h-15 items-center gap-2', open ? 'px-3' : 'justify-center px-0')}>
        <TracyMark size={22} className="shrink-0" />
        {open ? (
          <>
            <span className="flex-1 text-sm">
              <span className="font-semibold">Tracy</span>
              <span className="ms-1.5 opacity-55">Cowork</span>
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={onToggle}
              aria-label="Collapse sidebar"
            >
              <PanelLeft />
            </Button>
          </>
        ) : null}
      </div>

      {!open ? (
        <div className="flex justify-center pb-2">
          <Button
            variant="ghost"
            size="icon"
            className="size-9"
            onClick={onToggle}
            aria-label="Expand sidebar"
          >
            <PanelLeft />
          </Button>
        </div>
      ) : null}

      <div className={cn(open ? 'px-3' : 'flex justify-center')}>
        <Button
          variant="secondary"
          className={cn('gap-2', open ? 'h-9.5 w-full justify-center' : 'size-9')}
          aria-label="New session"
        >
          <SquarePen />
          {open ? 'New session' : null}
        </Button>
      </div>

      {open ? (
        <div className="mt-4 flex h-8 items-center gap-1 px-3">
          <span className="flex-1 text-muted-foreground text-xs">Sitespaces</span>
          {[Search, ListFilter, FolderOpen].map((Icon, index) => (
            <Button key={index} variant="ghost" size="icon" className="size-7">
              <Icon className="size-3.5" />
            </Button>
          ))}
        </div>
      ) : (
        // Narrow mode keeps exactly those three actions, stacked — they are the only way into the session
        // tree when the tree is not shown.
        <div className="mt-3 flex flex-col items-center gap-1">
          {[Search, ListFilter, FolderOpen].map((Icon, index) => (
            <Button key={index} variant="ghost" size="icon" className="size-9">
              <Icon className="size-4" />
            </Button>
          ))}
        </div>
      )}

      {open ? (
        <ScrollArea className="min-h-0 flex-1 px-2">
          <div className="flex items-center gap-2 px-1 py-1.5 text-sm">
            <FolderOpen className="size-4 text-muted-foreground" />
            <span className="font-medium">TracyHQ</span>
          </div>
          <div className="flex flex-col">
            {SESSIONS.map((session) => (
              <button
                key={session.title}
                type="button"
                onClick={() => onSelect(session.title)}
                className={cn(
                  'flex items-center gap-2 rounded-md px-3 py-1.5 text-start text-sm',
                  'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                  active === session.title && 'bg-sidebar-accent text-sidebar-accent-foreground'
                )}
              >
                <span className="min-w-0 flex-1 truncate">{session.title}</span>
                <span className="shrink-0 text-muted-foreground text-xs">{session.age}</span>
              </button>
            ))}
          </div>
        </ScrollArea>
      ) : (
        <div className="min-h-0 flex-1" />
      )}

      <div className={cn('p-2', !open && 'flex flex-col items-center')}>
        <Button variant="ghost" size="icon" className="mb-2 size-8 rounded-full border border-border">
          <MessageSquare className="size-4" />
        </Button>
        <Button
          variant="secondary"
          className={cn('gap-2', open ? 'h-8 w-full justify-start' : 'size-9')}
          onClick={onSettings}
          aria-label="Settings"
        >
          <Settings className="size-4" />
          {open ? 'Settings' : null}
        </Button>
      </div>
    </aside>
  )
}

/* ── Centre column ────────────────────────────────────────────────────────────────────────── */

function CenterHeader({ tab, onTab }: { tab: string; onTab: (tab: (typeof TABS)[number]) => void }) {
  return (
    // 76px covers BOTH the title row and the tab row — the real surface measures as one block, not two.
    <header className="flex h-19 shrink-0 flex-col justify-between border-border border-b px-4 pt-2">
      <div className="flex items-center gap-3">
        <h1 className="font-semibold text-sm">Simple greeting</h1>
        <Badge variant="outline" className="gap-1 font-normal">
          <Clock className="size-3" />
          Standard mode
        </Badge>
        <div className="flex-1" />
        <Button variant="outline" size="sm" className="gap-2 rounded-full">
          History
          <Download className="size-3.5" />
        </Button>
      </div>

      <div className="flex gap-4">
        {TABS.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => onTab(name)}
            className={cn(
              '-mb-px border-b-2 px-0.5 pb-2 text-sm',
              tab === name
                ? 'border-primary font-medium text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {name}
          </button>
        ))}
      </div>
    </header>
  )
}

function Conversation({ title }: { title: string }) {
  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-5">
        <Badge variant="outline" className="w-fit gap-1.5 font-normal">
          <Files className="size-3" />
          System prompt
        </Badge>

        <div className="flex justify-end">
          <div className="rounded-full bg-secondary px-4 py-2 text-sm">{title}</div>
        </div>

        <div>
          <button type="button" className="flex items-center gap-1 text-muted-foreground text-sm">
            Thought for a moment
            <ChevronDown className="size-3.5" />
          </button>
          <Separator className="my-3" />
          <p className="text-sm leading-relaxed">
            Hi! I&apos;m your coding agent in the TracyHQ workspace. What would you like to work on?
          </p>
          <div className="mt-3 flex items-center gap-4 text-muted-foreground text-xs">
            <span>Usage 12.6K tok</span>
            <span>Took 2s</span>
            <span>09:37</span>
          </div>
        </div>
      </div>
    </ScrollArea>
  )
}

function Composer() {
  return (
    <div className="shrink-0 px-6 pb-5">
      <div className="mx-auto flex max-w-3xl flex-col gap-3 rounded-xl border border-border bg-card p-3">
        {/* `div`, not `textarea`: the drawing takes no input, and a typeable box would invite viewers
            to type and then think it is broken. */}
        <div className="min-h-10 text-muted-foreground text-sm">Message the agent</div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="size-8">
            <Paperclip className="size-4" />
          </Button>
          <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground">
            Auto-accept edits
            <ChevronDown className="size-3.5" />
          </Button>
          <div className="flex-1" />
          <Button size="icon" className="size-8 rounded-full">
            <Send className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

/* ── Right column ─────────────────────────────────────────────────────────────────────────── */

function ToolPanel({ onClose }: { onClose: () => void }) {
  return (
    <aside className="flex w-134 shrink-0 flex-col border-border border-s">
      <div className="flex h-11 shrink-0 items-center gap-1 px-2">
        <Button variant="ghost" size="icon" className="size-7">
          <Plus className="size-4" />
        </Button>
        <div className="flex-1" />
        <Button variant="ghost" size="icon" className="size-7">
          <Monitor className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" className="size-7" onClick={onClose} aria-label="Hide tool panel">
          <PanelRight className="size-4" />
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1 px-3 pb-3">
        <div className="grid grid-cols-3 gap-3">
          {TOOLS.map((tool) => (
            <button
              key={tool.label}
              type="button"
              className="flex h-18 flex-col items-center justify-center gap-2 rounded-lg border border-border bg-card px-2 text-center hover:bg-accent hover:text-accent-foreground"
            >
              <tool.icon className="size-4 text-muted-foreground" />
              <span className="text-xs">
                {tool.label}
                {tool.badge ? <span className="ms-1 opacity-60">({tool.badge})</span> : null}
              </span>
            </button>
          ))}
        </div>
      </ScrollArea>
    </aside>
  )
}
