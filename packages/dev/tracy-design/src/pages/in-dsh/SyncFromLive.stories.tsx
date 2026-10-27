/**
 * Sync from live, one story per thing a person can be looking at — the review of "is it clear what
 * is going on" (David, 21/10/2026: the dialog showed a description and a dimmed button, nothing
 * about the sync itself). Since 23/10/2026 it is the Sync step of the site's Publish tab
 * (`@tracy/core` `site-tabs/publish/SyncStep`), no longer a My Sites dialog.
 *
 * The step is the real component over its real hook; only `fetch` is stood in for, answering `GET …/sync` the way
 * `apps/tracy-web/src/sites/live-sync.js` `view()` does. `?globals=theme:dark` for the dark theme,
 * `lang=vi` on a story for the Vietnamese strings that ship.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'
import { type ReactNode, useEffect, useState } from 'react'

import { SyncStep } from '../../../../../core/tracy-core/src/site-tabs/publish/SyncStep'
import { useLiveSync } from '../../../../../core/tracy-core/src/site-tabs/publish/use-live-sync'
import { WIZARD_SHELL_CSS } from '../../../../../site/tracy-site-tabs/src/client/styles'
import '../../../../../site/tracy-site-tabs/src/client/site-tabs-rules.css'
import { en as siteTabsEn } from '../../../../../site/tracy-site-tabs/src/client/strings'
import viSiteTabs from '../../../../../locale/tracy-locale-vi/vi/tracy-site-tabs.json'

const meta: Meta = {
  title: 'Screens/In dsh/Sync from live',
  parameters: { layout: 'fullscreen' }
}
export default meta
type Story = StoryObj

const lookup =
  (dict: Record<string, string>) =>
  (key: string, params?: Record<string, string | number>): string =>
    (dict[key] ?? key).replace(/\{(\w+)\}/g, (m, name: string) =>
      params && name in params ? String(params[name]) : m
    )

const ago = (minutes: number): string => new Date(Date.now() - minutes * 60_000).toISOString()

const base = { conflicts: [], kept: [], held: [], startedBy: 'owner@example.com' }
/** `GET /api/sites/:key/sync` answers, as the door gives them. */
const ANSWERS: Record<string, unknown> = {
  unavailable: { available: false, why: 'not-connected', sync: null },
  never: { available: true, sync: null },
  running: {
    available: true,
    sync: {
      ...base,
      id: 's1',
      state: 'running',
      step: 'merging',
      error: null,
      liveReadAt: null,
      startedAt: ago(2),
      summary: null
    }
  },
  applied: {
    available: true,
    sync: {
      ...base,
      id: 's2',
      state: 'applied',
      step: null,
      error: null,
      liveReadAt: ago(5),
      startedAt: ago(9),
      kept: [
        {
          id: 'db:jos_content:["2"]:title',
          kind: 'column',
          table: 'jos_content',
          column: 'title',
          key: { id: '2' },
          values: {
            ours: { title: { text: 'Our house blend — by Tracy' } },
            theirs: { title: { text: 'House blend' } }
          }
        },
        {
          id: 'file:media/templates/site/cassiopeia/css/user.css',
          kind: 'file',
          reason: 'both-changed',
          path: 'media/templates/site/cassiopeia/css/user.css'
        }
      ],
      summary: {
        backup: 7,
        files: { fromTheirs: 3, merged: 1 },
        database: { rowsFromTheirs: 12, rowsMerged: 2, rowsDeleted: 1 }
      }
    }
  },
  held: {
    available: true,
    sync: {
      ...base,
      id: 's3',
      state: 'needs_resolution',
      step: null,
      error: null,
      liveReadAt: ago(1),
      startedAt: ago(4),
      held: [
        {
          id: 'db:jos_rsform_forms:["4"]',
          kind: 'row',
          table: 'jos_rsform_forms',
          reason: 'added-both',
          key: { id: '4' }
        }
      ],
      summary: null
    }
  },
  failed: {
    available: true,
    sync: {
      ...base,
      id: 's4',
      state: 'failed',
      step: null,
      error: 'LIVE_BUSY',
      liveReadAt: null,
      startedAt: ago(3),
      summary: null
    }
  }
}

/** The step over its hook, as the Publish wizard holds it. */
function Step({ t }: { t: (key: string, params?: Record<string, string | number>) => string }): ReactNode {
  const live = useLiveSync({ siteKey: 'shop.example' })
  return <SyncStep live={live} onBack={() => {}} onNext={() => {}} t={t as never} />
}

/** The step with `fetch` answering `which`; `loading` never answers, `unreadable` answers 500. */
function Frame({ which, lang = 'en' }: { which: string; lang?: 'en' | 'vi' }): ReactNode {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const real = window.fetch
    window.fetch = (input, init) => {
      const url = String(input)
      if (url.endsWith('/sync') && (!init?.method || init.method === 'GET')) {
        if (which === 'loading') return new Promise(() => {})
        if (which === 'unreadable')
          return Promise.resolve(Response.json({ code: 'SITE_UNKNOWN' }, { status: 500 }))
        return Promise.resolve(Response.json(ANSWERS[which]))
      }
      return Promise.resolve(Response.json({ code: 'NOT_FOUND' }, { status: 404 }))
    }
    setReady(true)
    return () => {
      window.fetch = real
    }
  }, [which])
  const dict =
    lang === 'vi'
      ? { ...(siteTabsEn as Record<string, string>), ...(viSiteTabs as Record<string, string>) }
      : (siteTabsEn as Record<string, string>)
  return (
    <div className="flex min-h-screen justify-end bg-muted/40 text-foreground">
      <style>{WIZARD_SHELL_CSS}</style>
      <div
        className="min-h-screen border-border border-l bg-background"
        style={{ width: 420, maxWidth: '100%' }}
      >
        <div className="tracy-site-tabs text-sm">
          <div className="tas-root tas-wizard-card tv-pub-wizard">{ready && <Step t={lookup(dict)} />}</div>
        </div>
      </div>
    </div>
  )
}

export const Loading: Story = { render: () => <Frame which="loading" /> }
export const Unreadable: Story = { render: () => <Frame which="unreadable" /> }
export const Unavailable: Story = { render: () => <Frame which="unavailable" /> }
export const NeverSynced: Story = { render: () => <Frame which="never" /> }
export const Running: Story = { render: () => <Frame which="running" /> }
export const UpToDate: Story = { render: () => <Frame which="applied" /> }
export const NeedsDecision: Story = { render: () => <Frame which="held" /> }
export const Failed: Story = { render: () => <Frame which="failed" /> }
export const UpToDateVi: Story = { render: () => <Frame which="applied" lang="vi" /> }
export const RunningVi: Story = { render: () => <Frame which="running" lang="vi" /> }
