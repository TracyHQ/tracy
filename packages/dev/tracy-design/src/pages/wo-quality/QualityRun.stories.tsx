/** The actual owner-only HTML viewer, with active, incomplete, ready and cancelled evidence. */
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, waitFor, within } from 'storybook/test'
import vi from '../../../../../../apps/tracy-web/src/lib/i18n/locales/vi.json'
import { en } from '../../../../../../apps/tracy-web/src/lib/i18n/strings.js'
import { renderQualityPage as renderPage } from '../../../../../../apps/tracy-web/src/opportunities-build/quality-page.js'

// The production route injects its existing translator. Reading the same dictionaries here
// keeps the HTML renderer browser-safe without importing the session store's AsyncLocalStorage.
function renderQualityPage(dto: Parameters<typeof renderPage>[0], { lang = 'en' } = {}) {
  const dictionary: Record<string, string> = lang === 'vi' ? vi : en
  const t = Object.assign(
    (key: string, values: Record<string, unknown> = {}) =>
      (dictionary[key] ?? key).replace(/\{([a-zA-Z]+)\}/g, (whole, name) =>
        Object.hasOwn(values, name) ? String(values[name]) : whole
      ),
    { lang, htmlLang: lang }
  )
  return renderPage(dto, { t })
}

function QualityFrame({ html }: { html: string }) {
  return <iframe title="WO quality evidence" srcDoc={html} className="h-full w-full border-0" />
}
const meta = {
  title: 'Screens/Worker pages/WO quality',
  component: QualityFrame,
  parameters: { layout: 'fullscreen' }
} satisfies Meta<typeof QualityFrame>
export default meta
type Story = StoryObj<typeof meta>
const active = {
  run: { id: 'synthetic-owner-run', state: 'running', policy: { maxAttempts: 64, jobCapCents: 200 } },
  intent: { state: 'active', attemptCount: 3, repairCount: 0, deadline: '2026-10-20T20:00:00Z' },
  cost: { spentCents: 3, reservedCents: 1, unreconciledCents: 0 },
  links: {
    json: '/api/website-opportunities/quality/runs/synthetic-owner-run',
    cancel: '/api/website-opportunities/quality/runs/synthetic-owner-run/cancel',
    opportunity: '/?opportunity=synthetic'
  },
  artifacts: {
    dossier: {
      facts: [
        {
          id: 'opening-hours',
          type: 'opening-hours',
          value: '7AM–10PM',
          status: 'supported',
          branch: 'main',
          sourceRefs: [{ sourceId: 'official', start: 0, end: 26, quote: 'Open daily from 7AM to 10PM.' }]
        }
      ],
      conflicts: []
    },
    'plan-markdown': '# Site brief\n\nFood, coffee and a place to meet.\n\nNo unsupported booking claim.',
    plan: {
      records: [{ key: 'home/home@en' }],
      coverage: [
        { key: 'home/home@en', route: '/', state: 'planned', reason: 'Verified restaurant evidence' }
      ]
    }
  },
  attempts: [
    {
      id: 'synthetic-call',
      stage: 'a-facts',
      state: 'succeeded',
      model: { model: 'deepseek-v4-pro', reasoning: { effort: 'high' } },
      receipt: { costCents: 0.1, durationMs: 1800, usage: { prompt_tokens: 190, completion_tokens: 83 } }
    }
  ],
  operations: [
    {
      id: 'synthetic-write',
      kind: 'update',
      state: 'succeeded',
      target: { record: 'home' },
      receipt: { genericUndo: false, conditionalRecovery: true }
    }
  ]
}
async function frameBody(canvasElement: HTMLElement) {
  const frame = canvasElement.querySelector('iframe')
  await waitFor(() => expect(frame?.contentDocument?.querySelector('h1')).not.toBeNull())
  return within(frame!.contentDocument!.body)
}
export const Active: Story = {
  args: { html: renderQualityPage(active) },
  play: async ({ canvasElement }) => {
    const body = await frameBody(canvasElement)
    expect(body.getByRole('heading', { name: 'Demo quality' })).toBeVisible()
    expect(body.getByRole('button', { name: /^Stop$/ }).closest('form')).toHaveAttribute('method', 'post')
    expect(body.getByText('Open daily from 7AM to 10PM.')).toBeVisible()
  }
}
export const NeedsAttention: Story = {
  args: {
    html: renderQualityPage({
      ...active,
      run: { ...active.run, state: 'failed' },
      artifacts: {
        ...active.artifacts,
        'review-r0-attention': { state: 'needs-attention', error: 'QUALITY_CAPTURE_INCOMPLETE' }
      }
    })
  },
  play: async ({ canvasElement }) => {
    const body = await frameBody(canvasElement)
    expect(body.queryByRole('button', { name: /^Stop$/ })).toBeNull()
    expect(body.getByText('QUALITY_CAPTURE_INCOMPLETE')).toBeVisible()
  }
}
export const ReadyForHuman: Story = {
  args: {
    html: renderQualityPage({
      ...active,
      artifacts: {
        ...active.artifacts,
        'review-r0-gate': { state: 'ready-for-human' },
        'review-r0-semantic': { state: 'ready-for-human', findings: [] }
      }
    })
  },
  play: async ({ canvasElement }) => {
    const body = await frameBody(canvasElement)
    expect(body.getByText('Human acceptance is pending.')).toBeVisible()
    expect(body.queryByRole('button', { name: /^Stop$/ })).toBeNull()
  }
}
export const Cancelled: Story = {
  args: { html: renderQualityPage({ ...active, intent: { ...active.intent, state: 'cancelled' } }) },
  play: async ({ canvasElement }) => {
    const body = await frameBody(canvasElement)
    expect(body.getByText('Cancelled')).toBeVisible()
    expect(body.queryByRole('button', { name: /^Stop$/ })).toBeNull()
  }
}
export const Vietnamese: Story = { args: { html: renderQualityPage(active, { lang: 'vi' }) } }
export const Empty: Story = {
  args: {
    html: renderQualityPage({
      run: { id: 'synthetic-pending-run', state: 'pending' },
      intent: { state: 'active' },
      artifacts: {}
    })
  }
}
