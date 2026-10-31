/**
 * Sync to live, one story per thing a person can be looking at, as the site's Publish tab draws it
 * since 25/10/2026: its own flow (Choose how › Review › Send) instead of the My Sites dialog it replaces
 * (David: follow the Publish wizard of #1700).
 *
 * The real wizard (`@tracy/core` `site-tabs/publish/PublishWizard`) over its real hooks, landed the way
 * the ••• menu's "Sync to live" lands it; only `fetch` is stood in for, answering `GET …/push` the way
 * `apps/tracy-web/src/sites/live-push.js` `view()` does. Confirm and the Undo question are reached by
 * pressing the real buttons once the page is drawn. `?globals=theme:dark` for the dark theme, `lang=vi`
 * on a story for the Vietnamese strings that ship.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'
import { type ReactNode, useEffect, useState } from 'react'

import { PublishWizard } from '../../../../../core/tracy-core/src/site-tabs/publish/PublishWizard'
import { WIZARD_SHELL_CSS } from '../../../../../site/tracy-site-tabs/src/client/styles'
import '../../../../../site/tracy-site-tabs/src/client/site-tabs-rules.css'
import { en as siteTabsEn } from '../../../../../site/tracy-site-tabs/src/client/strings'
import viSiteTabs from '../../../../../locale/tracy-locale-vi/vi/tracy-site-tabs.json'

const meta: Meta = {
  title: 'Screens/In dsh/Sync to live',
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
const item = (id: string, title: string | null, extra: Record<string, unknown> = {}) => ({
  id,
  kind: 'article',
  title,
  ...extra
})
const row = (fields: Record<string, unknown>) => ({
  id: 'p1',
  state: 'previewed',
  phase: 'preview',
  step: null,
  error: null,
  undoError: null,
  startedAt: ago(2),
  pushedAt: null,
  undoneAt: null,
  expiresAt: ago(-20),
  preview: null,
  deletes: false,
  result: null,
  undo: null,
  undoable: false,
  maxItems: 200,
  ...fields
})
const PREVIEW = {
  platform: 'joomla',
  add: [item('a1', 'Opening hours'), item('a2', 'Spring menu')],
  change: [
    item('c1', 'About us', { fields: ['title', 'introtext'] }),
    item('c2', 'Main menu', { kind: 'menu', fields: ['ordering'] })
  ],
  remove: [item('r1', 'Old news'), item('r2', null, { liveId: '12' })],
  files: [item('f1', 'media/templates/site/cassiopeia/css/user.css', { kind: 'file', size: 2048 })],
  settings: [item('s1', 'Global Configuration', { kind: 'siteIdentity', fields: ['Site Name'] })],
  php: [item('p1', 'templates/cassiopeia/html/mod_menu/default.php', { kind: 'file', size: 812 })],
  unsupported: [
    { kind: 'file', name: 'templates/t4/css/custom.css', reason: 'engine-has-no-file-write' },
    { kind: 'file', name: 'images/hero-4k.png', reason: 'too-large', size: 9 * 1024 * 1024 }
  ],
  liveChanged: [item('l1', 'Contact')],
  held: 0,
  limit: 200,
  itemsTotal: 9,
  unsupportedTotal: 2
}
const RESULT = {
  pushed: [item('a1', 'Opening hours'), item('a2', 'Spring menu'), item('c1', 'About us')],
  conflicts: [item('c2', 'Main menu', { kind: 'menu', reason: 'changed-on-live' })],
  failed: [],
  skipped: [item('r1', 'Old news', { reason: 'deletes-not-confirmed' })]
}

/** `GET /api/sites/:key/push` answers, as the door gives them. */
const ANSWERS: Record<string, unknown> = {
  unavailable: { available: false, why: 'not-connected', push: null, lastPush: null },
  ready: { available: true, push: null, lastPush: null },
  previewing: { available: true, push: row({ state: 'running', step: 'comparing' }), lastPush: null },
  review: { available: true, push: row({ preview: PREVIEW }), lastPush: null },
  nothing: {
    available: true,
    push: row({ preview: { ...PREVIEW, add: [], change: [], remove: [], files: [], settings: [], php: [] } }),
    lastPush: null
  },
  held: { available: true, push: row({ state: 'held' }), lastPush: null },
  expired: { available: true, push: row({ state: 'expired', preview: PREVIEW }), lastPush: null },
  pushing: {
    available: true,
    push: row({ state: 'running', phase: 'apply', step: 'writing', preview: PREVIEW }),
    lastPush: null
  },
  pushed: {
    available: true,
    push: row({
      state: 'pushed',
      phase: 'apply',
      pushedAt: ago(1),
      preview: PREVIEW,
      result: RESULT,
      undoable: true
    }),
    lastPush: null
  },
  // Sent with no answer back, and a write a firewall refused (#226): their own group, a note each.
  unknown: {
    available: true,
    push: row({
      state: 'pushed',
      phase: 'apply',
      pushedAt: ago(1),
      preview: PREVIEW,
      result: {
        ...RESULT,
        pushed: RESULT.pushed.slice(0, 1),
        failed: [
          item('u1', 'Page template', { code: 'WRITE_OUTCOME_UNKNOWN' }),
          item('b1', 'Prices', { code: 'LIVE_BLOCKED' })
        ]
      },
      undoable: true
    }),
    lastPush: null
  },
  // Undo answered that nothing is left to undo (#226): said once, no Undo to press.
  notPushed: {
    available: true,
    push: row({
      state: 'pushed',
      phase: 'apply',
      pushedAt: ago(40),
      preview: PREVIEW,
      result: RESULT,
      undoable: true,
      undoError: 'NOT_PUSHED'
    }),
    lastPush: null
  },
  undoing: {
    available: true,
    push: row({ state: 'running', phase: 'undo', step: 'undoing', preview: PREVIEW, result: RESULT }),
    lastPush: null
  },
  undone: {
    available: true,
    push: row({
      state: 'undone',
      phase: 'undo',
      pushedAt: ago(9),
      undoneAt: ago(1),
      preview: PREVIEW,
      result: RESULT,
      undo: { restored: RESULT.pushed.slice(0, 2), conflicts: [RESULT.pushed[2]], failed: [] }
    }),
    lastPush: null
  },
  failed: {
    available: true,
    push: row({ state: 'failed', phase: 'apply', error: 'LIVE_UNREACHABLE', preview: PREVIEW }),
    lastPush: null
  }
}

/** What a story presses once drawn: Continue to Confirm, or Undo to its question. */
const PRESS: Record<string, string> = {
  confirm: '[data-push-go]',
  undo: '[data-push-undo-ask]'
}
const ANSWER_OF: Record<string, string> = { confirm: 'review', undo: 'pushed', kind: 'ready' }

const snapshot = {
  siteKey: 'shop.example',
  siteUrl: 'https://shop.example/',
  platform: 'joomla',
  role: 'owner',
  state: 'ready',
  values: { title: 'Shop' },
  addressChange: { allowed: true, managedDomain: 'tracy.site', status: 'ready' }
}
const idle = { publishing: null, pressed: null, notice: null, press: () => {}, read: () => {} }

/** The wizard with `fetch` answering `which`; `loading` never answers, `unreadable` answers 500. */
function Frame({ which, lang = 'en' }: { which: string; lang?: 'en' | 'vi' }): ReactNode {
  const [ready, setReady] = useState(false)
  const answerOf = ANSWER_OF[which] ?? which
  useEffect(() => {
    const real = window.fetch
    window.fetch = (input, init) => {
      const url = String(input)
      if (url.endsWith('/push') && (!init?.method || init.method === 'GET')) {
        if (which === 'loading') return new Promise(() => {})
        if (which === 'unreadable')
          return Promise.resolve(Response.json({ code: 'SITE_UNKNOWN' }, { status: 500 }))
        return Promise.resolve(Response.json(ANSWERS[answerOf]))
      }
      if (url.endsWith('/sync')) return Promise.resolve(Response.json({ available: true, sync: null }))
      return Promise.resolve(Response.json({ code: 'NOT_FOUND' }, { status: 404 }))
    }
    setReady(true)
    return () => {
      window.fetch = real
    }
  }, [which, answerOf])
  useEffect(() => {
    const selector = PRESS[which]
    if (!ready || !selector) return
    const timer = setInterval(() => {
      const button = document.querySelector<HTMLButtonElement>(selector)
      if (button) {
        button.click()
        clearInterval(timer)
      }
    }, 50)
    return () => clearInterval(timer)
  }, [ready, which])
  const dict =
    lang === 'vi'
      ? { ...(siteTabsEn as Record<string, string>), ...(viSiteTabs as Record<string, string>) }
      : (siteTabsEn as Record<string, string>)
  return (
    <div className="flex min-h-screen justify-end bg-muted/40 text-foreground">
      <style>{WIZARD_SHELL_CSS}</style>
      <div
        className="min-h-screen border-border border-l bg-background"
        style={{ width: 460, maxWidth: '100%' }}
      >
        <div className="tracy-site-tabs text-sm">
          {ready && (
            <PublishWizard
              siteKey="shop.example"
              siteName="Shop"
              snapshot={snapshot as never}
              control={idle as never}
              refresh={() => {}}
              role="owner"
              imported
              // `kind`: the Publish tab opened on its own, at the choice of kind.
              arrival={which === 'kind' ? null : { entry: 'push', n: 1 }}
              t={lookup(dict) as never}
            />
          )}
        </div>
      </div>
    </div>
  )
}

export const ChooseKind: Story = { render: () => <Frame which="kind" /> }
export const Loading: Story = { render: () => <Frame which="loading" /> }
export const Unreadable: Story = { render: () => <Frame which="unreadable" /> }
export const Unavailable: Story = { render: () => <Frame which="unavailable" /> }
export const Ready: Story = { render: () => <Frame which="ready" /> }
export const Previewing: Story = { render: () => <Frame which="previewing" /> }
export const Review: Story = { render: () => <Frame which="review" /> }
export const NothingToSend: Story = { render: () => <Frame which="nothing" /> }
export const Held: Story = { render: () => <Frame which="held" /> }
export const Expired: Story = { render: () => <Frame which="expired" /> }
export const Confirm: Story = { render: () => <Frame which="confirm" /> }
export const Pushing: Story = { render: () => <Frame which="pushing" /> }
export const Pushed: Story = { render: () => <Frame which="pushed" /> }
export const UndoAsked: Story = { render: () => <Frame which="undo" /> }
export const Undoing: Story = { render: () => <Frame which="undoing" /> }
export const Undone: Story = { render: () => <Frame which="undone" /> }
export const Failed: Story = { render: () => <Frame which="failed" /> }
export const PushedUnknown: Story = { render: () => <Frame which="unknown" /> }
export const PushedUnknownVi: Story = { render: () => <Frame which="unknown" lang="vi" /> }
export const NothingLeftToUndo: Story = { render: () => <Frame which="notPushed" /> }
export const ReviewVi: Story = { render: () => <Frame which="review" lang="vi" /> }
export const PushedVi: Story = { render: () => <Frame which="pushed" lang="vi" /> }
