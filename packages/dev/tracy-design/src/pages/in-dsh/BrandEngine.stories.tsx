/**
 * Brand · Brand builder — the two tabs of `@tracy/dsh-brand-engine`, drawn from the PLUGIN'S OWN
 * CODE (client half), not a mockup. Reviewed here from now on (ui-workflow §1a).
 *
 * What is stubbed, and only that: the doors of the plugin's host half. `fetch` for
 * `/api/tracy-brand-engine/…` answers from `fixtures/brand-rows.json` — three REAL extractions run
 * on 06/09 (lucaswp.tracy.ai as the site's own brand, linear.app and stripe.com as references) —
 * and an Extract press replays the harvester's steps on a timer so the progress list can be seen.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'
import { type JSX, useEffect, useState } from 'react'

import type { BrandRow, Job } from '../../../../../design/tracy-brand-engine/src/client/api'
import { en as beEn } from '../../../../../design/tracy-brand-engine/src/client/strings'
import { BrandTab, BuilderTab } from '../../../../../design/tracy-brand-engine/src/client/tabs'
import viBe from '../../../../../locale/tracy-locale-vi/vi/tracy-brand-engine.json'
import rows from '../../fixtures/brand-rows.json'

const meta: Meta = {
  title: 'Pages/In dsh/Brand',
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
const en = lookup(beEn as Record<string, string>)
const vi = lookup(viBe as Record<string, string>)

const ROWS = rows as unknown as BrandRow[]
const SITE = 'lucaswp.tracy.ai'
const STEPS = [
  'fetch',
  'css',
  'styles',
  'fonts',
  'fonts-done',
  'logos',
  'logos-done',
  'extra-page',
  'brand',
  'system',
  'library',
  'done'
]

type Shape = { own: boolean; references: string[]; fail?: string }

/**
 * The host half, as the bench: same paths, same shapes. `state` decides which brands exist; an
 * Extract press starts a job that advances one step every 350 ms and then either lands the brand or
 * fails with the given code.
 */
let current: Shape = { own: true, references: [] }
let installed = false
const jobs = new Map<string, Job>()
function installDoors(): void {
  if (installed) return
  installed = true
  const real = window.fetch.bind(window)
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const at = url.indexOf('/api/tracy-brand-engine/')
    if (at < 0) return real(input, init)
    const rest = url.slice(at + '/api/tracy-brand-engine/'.length).split(/[?#]/)[0] ?? ''
    const json = (status: number, body: unknown): Response =>
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
    const method = init?.method ?? 'GET'
    if (rest === 'brands') {
      const present = ROWS.filter((r) =>
        r.kind === 'own' ? current.own : current.references.includes(r.host)
      )
      return json(200, { ok: true, brands: present })
    }
    if (rest === 'extract' && method === 'POST') {
      const body = JSON.parse(String(init?.body ?? '{}')) as { url?: string; kind?: string }
      const host = (body.url ?? `https://${SITE}`)
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .split('/')[0]!
        .toLowerCase()
      const job: Job = {
        host,
        kind: host === SITE ? 'own' : 'reference',
        state: 'running',
        startedAt: Date.now(),
        steps: []
      }
      jobs.set(host, job)
      const tick = (i: number): void => {
        if (i === STEPS.length || (current.fail && i === 2)) {
          if (current.fail) {
            job.state = 'failed'
            job.error = { code: current.fail, error: current.fail }
          } else {
            job.state = 'done'
            if (host === SITE) current.own = true
            else if (ROWS.some((r) => r.host === host) && !current.references.includes(host))
              current.references.push(host)
          }
          job.endedAt = Date.now()
          return
        }
        job.steps.push({ step: STEPS[i]!, at: Date.now() })
        window.setTimeout(() => tick(i + 1), 350)
      }
      window.setTimeout(() => tick(0), 200)
      return json(202, { ok: true, ...job })
    }
    const poll = /^extract\/([^/]+)$/.exec(rest)
    if (poll) {
      const job = jobs.get(decodeURIComponent(poll[1]!))
      return job ? json(200, { ok: true, ...job }) : json(404, { ok: false, code: 'NO_JOB' })
    }
    const del = /^brands\/([^/]+)$/.exec(rest)
    if (del && method === 'DELETE') {
      const host = decodeURIComponent(del[1]!)
      current.references = current.references.filter((h) => h !== host)
      return json(200, { ok: true, host })
    }
    return json(404, { code: 'UNKNOWN_ROUTE' })
  }
}

function Screen({
  shape,
  tab,
  t
}: {
  shape: Shape
  tab: 'brand' | 'builder'
  t: (key: string, params?: Record<string, string | number>) => string
}): JSX.Element {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    installDoors()
    current = { own: shape.own, references: [...shape.references], fail: shape.fail }
    jobs.clear()
    setReady(true)
  }, [shape])
  if (!ready) return <div />
  return (
    <div className="mx-auto h-dvh max-w-[520px] overflow-y-auto border-border border-x bg-background">
      {tab === 'brand' ? (
        <BrandTab siteKey={SITE} openInspiration={() => undefined} t={t as never} />
      ) : (
        <BuilderTab openInspiration={() => undefined} t={t as never} />
      )}
    </div>
  )
}

/** Brand, before the first extraction: the explanation, the locked address, Extract. Press it to watch the steps. */
export const BrandEmpty: Story = {
  render: () => <Screen shape={{ own: false, references: [] }} tab="brand" t={en} />
}

/** Brand, extracted: the card for lucaswp.tracy.ai — colours, fonts, the one correction Tracy applied. */
export const BrandExtracted: Story = {
  render: () => <Screen shape={{ own: true, references: [] }} tab="brand" t={en} />
}

/** Brand, Vietnamese. */
export const BrandExtractedVi: Story = {
  render: () => <Screen shape={{ own: true, references: [] }} tab="brand" t={vi} />
}

/** Brand, when the site cannot be reached from the lane: press Extract to see the failure and its advice. */
export const BrandBlocked: Story = {
  render: () => <Screen shape={{ own: false, references: [], fail: 'NO_MATERIAL' }} tab="brand" t={en} />
}

/** Brand builder, empty: the address field and the explanation. Type linear.app or stripe.com and Add. */
export const BuilderEmpty: Story = {
  render: () => <Screen shape={{ own: true, references: [] }} tab="builder" t={en} />
}

/** Brand builder with two references, each removable. */
export const BuilderTwo: Story = {
  render: () => (
    <Screen shape={{ own: true, references: ['linear.app', 'stripe.com'] }} tab="builder" t={en} />
  )
}
