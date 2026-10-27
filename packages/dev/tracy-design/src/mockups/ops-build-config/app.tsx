/**
 * The frame the seven screens live in, and the only place that owns navigation state.
 *
 * IT COPIES THE HARNESS APP ON PURPOSE — a 60-wide column on `bg-sidebar`, groups with a small
 * heading, the active row on `bg-muted`. If this ever becomes real code it lands next to
 * `CmsAgents` and `Preset` in `packages/web/tracy-harness`, and a second navigation grammar there
 * would be two products in one window.
 *
 * WHY THE ENVIRONMENT AND THE CMS LIVE UP HERE. Both are choices that re-read every screen at
 * once. Keeping them in the frame is also what makes the walk-through work: a reviewer who picks
 * Joomla on the overview and clicks into templates must still be on Joomla when they land, and a
 * screen that owned its own copy of that choice would quietly lose it.
 */
import { Badge, Button, NativeSelect, NativeSelectOption, ScrollArea, cn } from '@tracy/ui'
import {
  ArrowLeft,
  Boxes,
  FileText,
  FlaskConical,
  LayoutGrid,
  MessageSquareText,
  ScrollText,
  SlidersHorizontal,
  Wrench
} from 'lucide-react'
import { createContext, useContext, useState, type ReactNode } from 'react'

import { CMS_LABEL, ENVS, SNAPSHOT, type Cms, type Env } from './fixtures'
import type { ScreenId } from './fixtures'

export interface Ops {
  env: Env
  cms: Cms
  screen: ScreenId
  /** What the destination screen should open on — a mapping row, a tool, a step. */
  focus: string | null
  setEnv: (env: Env) => void
  setCms: (cms: Cms) => void
  go: (to: ScreenId, opts?: { cms?: Cms; focus?: string; from?: ScreenId }) => void
  /** Where a "back" button returns to, when the reader arrived from another screen. */
  from: ScreenId | null
}

const OpsContext = createContext<Ops | null>(null)

export function useOps(): Ops {
  const ctx = useContext(OpsContext)
  if (!ctx) throw new Error('useOps outside OpsApp')
  return ctx
}

const NAV: readonly { title: string; items: readonly { id: ScreenId; label: string; icon: ReactNode }[] }[] =
  [
    {
      title: 'Builds',
      items: [
        { id: 'overview', label: 'Website builds', icon: <LayoutGrid /> },
        { id: 'flow', label: 'Build stages', icon: <FlaskConical /> }
      ]
    },
    {
      title: 'What a build starts from',
      items: [
        { id: 'catalog', label: 'Quickstarts & templates', icon: <Boxes /> },
        { id: 'contracts', label: 'Contracts & files', icon: <ScrollText /> }
      ]
    },
    {
      title: 'What a build runs as',
      items: [
        { id: 'presets', label: 'Presets', icon: <SlidersHorizontal /> },
        { id: 'tools', label: 'Tools & skills', icon: <Wrench /> },
        { id: 'brief', label: 'Site questions', icon: <MessageSquareText /> }
      ]
    }
  ]

export const SCREEN_LABEL: Record<ScreenId, string> = {
  overview: 'Website builds',
  flow: 'Build stages',
  catalog: 'Quickstarts & templates',
  contracts: 'Contracts & files',
  presets: 'Presets',
  tools: 'Tools & skills',
  brief: 'Site questions'
}

export function OpsApp({
  screen = 'overview',
  cms = 'joomla',
  env = 'main',
  focus = null,
  render
}: {
  screen?: ScreenId
  cms?: Cms
  env?: Env
  focus?: string | null
  /** The story supplies the screen bodies, so this file stays a frame and nothing else. */
  render: (screen: ScreenId) => ReactNode
}) {
  const [state, setState] = useState({ screen, cms, env, focus, from: null as ScreenId | null })

  const ops: Ops = {
    ...state,
    setEnv: (next) => setState((s) => ({ ...s, env: next })),
    setCms: (next) => setState((s) => ({ ...s, cms: next })),
    go: (to, opts) =>
      setState((s) => ({
        ...s,
        screen: to,
        cms: opts?.cms ?? s.cms,
        focus: opts?.focus ?? null,
        from: opts?.from ?? null
      }))
  }

  const snap = SNAPSHOT[state.env]

  return (
    <OpsContext.Provider value={ops}>
      <div className="flex h-screen min-w-0 bg-background text-foreground">
        <div className="flex w-60 flex-none flex-col border-border border-r bg-sidebar">
          <div className="flex h-11 flex-none items-center px-4">
            <span className="font-semibold text-sm tracking-tight">Tracy harness</span>
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <nav className="flex flex-col gap-0.5 px-2 pb-4">
              {NAV.map((group) => (
                <div key={group.title} className="mb-1">
                  <p className="px-2 pt-3 pb-1 font-medium text-[11px] text-muted-foreground tracking-wide">
                    {group.title}
                  </p>
                  {group.items.map((it) => (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => ops.go(it.id)}
                      aria-current={state.screen === it.id ? 'page' : undefined}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-lg py-1.5 pr-2 pl-2 text-left text-sm transition-colors [&_svg]:size-4 [&_svg]:text-muted-foreground',
                        'focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-1',
                        state.screen === it.id
                          ? 'bg-muted font-medium text-foreground'
                          : 'text-foreground/80 hover:bg-muted/60'
                      )}
                    >
                      {it.icon}
                      <span className="truncate">{it.label}</span>
                    </button>
                  ))}
                </div>
              ))}
            </nav>
          </ScrollArea>
          <div className="flex-none border-border border-t px-4 py-3">
            <Badge variant="secondary">Tracy only</Badge>
          </div>
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
          {/* 🔒 THE MOCK BANNER IS PART OF THE FRAME, NOT OF A SCREEN. Seven screens are seven
              chances to forget it, and the one that forgot would be the one somebody screenshots
              into a decision. Storybook draws its own banner above this; this one survives the
              screenshot. */}
          <div className="flex flex-none flex-wrap items-center gap-x-4 gap-y-2 border-border border-b bg-muted/40 px-6 py-2">
            <Badge variant="outline" className="gap-1.5 border-dashed font-normal">
              <FileText className="size-3" />
              Mock data · UI preview
            </Badge>
            <label className="flex items-center gap-2 text-muted-foreground text-xs">
              Environment
              <NativeSelect
                size="sm"
                className="w-[10rem]"
                aria-label="Environment"
                value={state.env}
                onChange={(e) => ops.setEnv(e.target.value as Env)}
              >
                {ENVS.map((e) => (
                  <NativeSelectOption key={e.id} value={e.id}>
                    {e.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </label>
            <span className="text-muted-foreground text-xs">
              {ENVS.find((e) => e.id === state.env)?.note}
            </span>
            <span className="ms-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground text-xs">
              <span>
                Configuration <span className="font-mono text-foreground/80">{snap.config}</span>
              </span>
              <span>
                Runtime <span className="font-mono text-foreground/80">{snap.runtime}</span>
              </span>
              <span>
                Observed <span className="font-mono text-foreground/80">{snap.observed}</span>
              </span>
            </span>
          </div>

          {state.from ? (
            <div className="flex flex-none items-center gap-2 border-border border-b px-6 py-1.5">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => ops.go(state.from as ScreenId, { cms: state.cms })}
              >
                <ArrowLeft />
                Back to {SCREEN_LABEL[state.from]}
              </Button>
              <span className="text-muted-foreground text-xs">
                Carrying {CMS_LABEL[state.cms]}
                {state.focus ? ` · ${state.focus}` : ''}
              </span>
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-auto">{render(state.screen)}</div>
        </div>
      </div>
    </OpsContext.Provider>
  )
}
