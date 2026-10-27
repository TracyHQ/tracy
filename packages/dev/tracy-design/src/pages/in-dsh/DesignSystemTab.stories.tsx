/**
 * Design system — the tab the site browser toolbar's Design system button opens (plan
 * `tasks/ke-hoach-nut-design-system.md`), drawn from the PLUGIN'S OWN CODE (`@tracy/dsh-design-inspiration`
 * `DesignSystemTab`), not a mockup. One story per real state: wearing the template's own look, wearing a
 * system with the newest apply undoable, a Viewer seat, a template that cannot wear a system, and the read
 * failing.
 *
 * What is stubbed, and only that: the plugin's host doors (`design-inspirations.doors.ts`, shared with the
 * Design inspirations stories) and tracy-web's three Design system doors, answered here in the shapes
 * `apps/tracy-web/src/sites/design-system.js` returns. An Apply in the bench lands at once.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'
import { type JSX, useEffect, useState } from 'react'

import { DesignSystemTab } from '../../../../../design/tracy-design-inspiration/src/client/DesignSystemTab'
import { en as dsEn } from '../../../../../design/tracy-design-inspiration/src/client/strings'
import viDs from '../../../../../locale/tracy-locale-vi/vi/tracy-design-inspiration.json'
import { installDoors, SITE } from './design-inspirations.doors'

const meta: Meta = {
  title: 'Pages/In dsh/Design system tab',
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
const en = lookup(dsEn as Record<string, string>)
const vi = lookup(viDs as Record<string, string>)

type Read = Record<string, unknown>
const BASE: Read = {
  platform: 'wordpress',
  canApply: true,
  refused: ['airbnb'],
  worn: null,
  template: 'wordpress/tracy-base',
  supported: true,
  last: null
}

/** tracy-web's Design system doors, answered from `state` (status `fail` = the read fails). */
function installDesignSystemDoor(state: { read: Read; fail?: boolean }): void {
  const w = window as unknown as { __dsDoor?: typeof state; __dsReal?: typeof fetch }
  w.__dsDoor = state
  if (w.__dsReal) return
  const real = window.fetch.bind(window)
  w.__dsReal = real
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const m = /\/api\/sites\/[^/]+\/design-system(\/undo)?$/.exec(url.split(/[?#]/)[0] ?? '')
    if (!m) return real(input, init)
    const s = w.__dsDoor!
    const json = (status: number, body: unknown): Response =>
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
    if (s.fail) return json(502, { code: 'DS_READ_FAILED' })
    if ((init?.method ?? 'GET') === 'GET') return json(200, s.read)
    const body = JSON.parse(String(init?.body ?? '{}')) as { id?: string }
    if (m[1]) {
      const back = (s.read.last as { previous: unknown } | null)?.previous ?? null
      s.read = { ...s.read, worn: back, last: { ...(s.read.last as object), undone: true } }
      return json(200, { ok: true, worn: back })
    }
    const worn = { id: body.id, slotId: `od:${body.id}`, name: body.id }
    s.read = {
      ...s.read,
      worn,
      last: { applyId: 'a1b2c3d4e5f6', id: body.id, name: body.id, previous: s.read.worn, undone: false }
    }
    return json(200, { ok: true, applyId: 'a1b2c3d4e5f6', worn, previous: null, changed: true, seen: true })
  }
}

function Screen({ read, fail = false, t = en }: { read: Read; fail?: boolean; t?: typeof en }): JSX.Element {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    installDoors(SITE)
    installDesignSystemDoor({ read: { ...read }, fail })
    setReady(true)
  }, [read, fail])
  if (!ready) return <div />
  return (
    <div className="ml-auto h-dvh w-[440px] overflow-hidden border-border border-l bg-background">
      {/* `t` is typed on the plugin's own key union; the bench dictionary is a superset by construction. */}
      <DesignSystemTab siteKey="lucaswp" t={t as never} />
    </div>
  )
}

/** An editor on a site wearing the template's own look: pick a card, then Apply to this site. */
export const TemplateLook: Story = { render: () => <Screen read={BASE} /> }

/** Wearing Stripe, applied by the newest press: Undo puts back the template's own look. */
export const WearingWithUndo: Story = {
  render: () => (
    <Screen
      read={{
        ...BASE,
        worn: { id: 'stripe', slotId: 'od:stripe', name: 'Stripe' },
        last: { applyId: 'a1b2c3d4e5f6', id: 'stripe', name: 'Stripe', previous: null, undone: false }
      }}
    />
  )
}

/** A Viewer seat reads what the site wears; Apply and Undo stay off with the reason. */
export const Viewer: Story = {
  render: () => (
    <Screen
      read={{
        ...BASE,
        canApply: false,
        cannotApply: { code: 'TOOLSET_NOT_GRANTED', toolset: 'code', role: 'viewer' },
        worn: { id: 'stripe', slotId: 'od:stripe', name: 'Stripe' }
      }}
    />
  )
}

/** A Tracy Business WordPress site: its template has no ready slot contract, so nothing can be applied. */
export const TemplateCannotWear: Story = {
  render: () => (
    <Screen
      read={{
        ...BASE,
        template: 'wordpress/wp-tracy-business',
        supported: false,
        reason: 'TEMPLATE_NOT_READY'
      }}
    />
  )
}

/** The site did not answer the read: the reason and Try again, nothing invented. */
export const ReadFailed: Story = { render: () => <Screen read={BASE} fail /> }

/** The same tab in Vietnamese. */
export const Vietnamese: Story = { render: () => <Screen read={BASE} t={vi} /> }
