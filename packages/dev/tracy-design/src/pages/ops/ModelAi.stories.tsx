/** Real Model & AI screen, synthetic provider book; inference is mocked in this story. */
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { CAPABILITIES, LLM_CATALOG, LLM_DOORS } from '../../../../../../apps/tracy-web/src/lib/llm-catalog.js'
import type { LlmPayload } from '../../../../../web/tracy-harness/src/settings/llm-api'
import { ModelAi } from '../../../../../web/tracy-harness/src/settings/ModelAi'

function book(state: 'untested' | 'passed' | 'unavailable'): LlmPayload {
  const at = '2026-10-20T12:00:00.000Z'
  const model = {
    id: 'synthetic-reader',
    name: 'Synthetic reader',
    draws: false,
    vision: true,
    reasoning: true,
    reasoningEfforts: ['low', 'high', 'max'],
    tools: null,
    json: true,
    context: 1000000
  }
  const assignment = {
    providerId: 'synthetic',
    model: model.id,
    effort: 'high',
    updatedBy: 'synthetic@example.test',
    updatedAt: at
  }
  return {
    catalog: LLM_CATALOG,
    doors: LLM_DOORS as LlmPayload['doors'],
    capabilities: CAPABILITIES as LlmPayload['capabilities'],
    writable: true,
    providers: [
      {
        id: 'synthetic',
        presetId: null,
        name: 'Synthetic provider',
        baseUrl: 'https://provider.invalid',
        baseUrlOverridden: true,
        apiKeyUrl: null,
        keyOptional: false,
        note: null,
        configured: true,
        keyHint: 'set',
        keyUnreadable: false,
        enabled: true,
        models: [model],
        modelsReadAt: at,
        revision: 1,
        updatedBy: assignment.updatedBy,
        updatedAt: at,
        effortOptions: { [model.id]: { mode: 'selectable', choices: ['low', 'high', 'max'] } }
      }
    ],
    assignments: {
      web: null,
      assistant: null,
      seedText: null,
      seedImage: null,
      vision: assignment,
      woEditorial: assignment,
      agent: null
    },
    visionTest: {
      state,
      model: model.id,
      ...(state === 'unavailable' ? { error: 'QUALITY_MODEL_CAPABILITY_UNKNOWN' } : {})
    }
  }
}
function doors(
  state: 'untested' | 'passed' | 'unavailable',
  effortMode: 'selectable' | 'unknown' | 'unsupported' = 'selectable'
) {
  return () => {
    const original = window.fetch
    const data = book(state)
    if (effortMode !== 'selectable')
      data.providers[0].effortOptions = {
        'synthetic-reader': { mode: effortMode, choices: [] }
      }
    window.fetch = async (input, init) => {
      const url = new URL(
        typeof input === 'string' ? input : input instanceof Request ? input.url : input.href,
        location.origin
      )
      if (url.pathname === '/api/ops/llm') return Response.json(data)
      if (url.pathname === '/api/ops/llm/doors/woEditorial' && init?.method === 'PUT') {
        const body = JSON.parse(String(init.body))
        data.assignments.woEditorial = { ...data.assignments.woEditorial!, effort: body.effort }
        return Response.json({ assignments: data.assignments })
      }
      if (url.pathname === '/api/ops/llm/doors/vision/test') {
        data.visionTest = { state: 'passed', model: 'synthetic-reader' }
        return Response.json({
          id: 'synthetic-test',
          state: 'succeeded',
          model: 'synthetic-reader',
          costCents: 0
        })
      }
      throw new Error(`Unexpected story request: ${url.pathname}`)
    }
    return () => {
      window.fetch = original
    }
  }
}
const meta = {
  title: 'Screens/Ops/Model and AI',
  component: ModelAi,
  decorators: [
    (Story) => (
      <main className="min-h-screen bg-background p-6 text-foreground">
        <Story />
      </main>
    )
  ],
  parameters: { layout: 'fullscreen' }
} satisfies Meta<typeof ModelAi>
export default meta
type Story = StoryObj<typeof meta>
export const Unverified: Story = {
  beforeEach: doors('untested'),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText('Read pictures')).toBeVisible()
    await expect(canvas.getByText('Pictures for a built site')).toBeVisible()
    await expect(canvas.getByText('WO editorial')).toBeVisible()
    const effort = canvas.getByRole('combobox', { name: 'WO editorial reasoning effort' })
    await expect(effort).toHaveTextContent('high')
    await userEvent.click(effort)
    await userEvent.click(await within(document.body).findByRole('option', { name: /^max$/ }))
    await waitFor(() => expect(effort).toHaveTextContent('max'))
    await userEvent.click(canvas.getByRole('button', { name: 'Test with pixels' }))
    await expect(
      await canvas.findByText('Pixels and structured JSON verified for synthetic-reader.')
    ).toBeVisible()
  }
}
export const Verified: Story = { beforeEach: doors('passed') }
export const EffortUnknown: Story = {
  beforeEach: doors('untested', 'unknown'),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      await canvas.findByText(
        'Supported reasoning effort is unknown. Refresh the model list before using WO editorial.'
      )
    ).toBeVisible()
    await expect(canvas.queryByRole('combobox', { name: 'WO editorial reasoning effort' })).toBeNull()
  }
}
export const EffortUnsupported: Story = {
  beforeEach: doors('untested', 'unsupported'),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      await canvas.findByText(
        'Tracy has no supported effort control for this provider and model. WO editorial will remain unavailable.'
      )
    ).toBeVisible()
    await expect(canvas.queryByRole('combobox', { name: 'WO editorial reasoning effort' })).toBeNull()
  }
}
export const Unsupported: Story = {
  beforeEach: doors('unavailable'),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByRole('button', { name: 'Test with pixels' })).toBeDisabled()
  }
}
