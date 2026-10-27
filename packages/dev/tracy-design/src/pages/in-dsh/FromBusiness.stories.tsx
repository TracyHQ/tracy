/**
 * Add site › Build from my business, drawn from the shipped component (`tracy-add-site/src/client/from-business.tsx`)
 * with its doors faked: what a customer sees from typing their business to the chat opening.
 *
 * ⚠ MODE B in the product (a plugin in dsh's page); here Tailwind's preflight and the missing dsh aliases make it
 * look slightly tidier than in dsh (see `InDsh.stories.tsx`). Judge the states and the words here, the pixels in dsh.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { FromBusiness } from '../../../../../site/tracy-add-site/src/client/from-business'
import { en } from '../../../../../site/tracy-add-site/src/client/strings'

const t = (key: string, params?: Record<string, string | number>): string =>
  String((en as Record<string, string>)[key] ?? key).replace(/\{(\w+)\}/g, (_, k) =>
    String(params?.[k] ?? `{${k}}`)
  )

const QUESTION = {
  questions: [
    {
      id: 'business',
      kind: 'business',
      label: 'Find your business',
      hint: 'Type its name and city, or paste its website or Google Maps link. Tracy reads what is public about it and builds the whole site from it.'
    }
  ]
}
const PLACES = [
  {
    providerId: 'p1',
    name: 'Smile Dental Clinic',
    address: '12 Trang Tien, Hoan Kiem, Hanoi',
    category: 'Dentist',
    trade: 'health'
  },
  {
    providerId: 'p2',
    name: 'Smile Dental Care',
    address: '88 Kim Ma, Ba Dinh, Hanoi',
    category: 'Dental clinic',
    trade: 'health'
  }
]

type Answer = { ok: boolean; status: number; body: unknown }
const ok = (body: unknown): Answer => ({ ok: true, status: 200, body })
function api({ find, start, state }: { find?: Answer; start?: Answer; state?: Answer } = {}) {
  return {
    question: async () => ok(QUESTION),
    find: async () => find ?? ok({ candidates: PLACES }),
    start: async () =>
      start ?? ok({ business: { id: 'b1', name: 'Smile Dental Clinic', phase: 'research' } }),
    // The research never ends in the story: the page stays on the reading state.
    state: async () => state ?? ok({ business: { id: 'b1', phase: 'research' } }),
    build: async () => ok({ business: { id: 'b1', phase: 'research' } }),
    // The catalogue the suggestion's sentence and demo come from (`suggestionCardOf`).
    templates: async () =>
      ok({
        templates: [
          {
            id: 'ja-vital',
            card: {
              blurb: 'A clinic website with services, doctors and appointment booking.',
              image: null,
              layouts: []
            },
            platforms: [
              {
                platform: 'joomla',
                tag: 'quickstart/ja-vital/j6',
                demo: { url: 'https://demo.example/ja-vital' }
              }
            ]
          }
        ]
      }),
    prepare: async () => ok({})
  }
}

const meta: Meta<typeof FromBusiness> = {
  title: 'Screens/In dsh/Build from my business',
  component: FromBusiness,
  parameters: { layout: 'padded' },
  // No kept business: each story starts on its own (`keptBusiness`).
  args: { t, lang: 'en', onBack: () => {}, open: () => {}, storage: null }
}
export default meta
type Story = StoryObj<typeof FromBusiness>

export const Empty: Story = { args: { api: api() } }

export const Found: Story = {
  args: { api: api() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(await canvas.findByLabelText('Find your business'), 'Smile Dental Hanoi')
    await userEvent.click(canvas.getByRole('button', { name: 'Search' }))
    await expect(await canvas.findByText('Smile Dental Clinic')).toBeVisible()
    await userEvent.click(canvas.getByText('Smile Dental Clinic'))
  }
}

export const NothingFound: Story = {
  args: { api: api({ find: ok({ candidates: [] }) }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(await canvas.findByLabelText('Find your business'), 'Nowhere Bakery Atlantis')
    await userEvent.click(canvas.getByRole('button', { name: 'Search' }))
    await expect(await canvas.findByText(/No business found/)).toBeVisible()
  }
}

export const Reading: Story = {
  args: { api: api() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(await canvas.findByLabelText('Find your business'), 'smiledental.vn')
    await userEvent.click(canvas.getByRole('button', { name: 'Build from this link' }))
    await expect(await canvas.findByRole('status')).toHaveTextContent(
      /reading what is public about Smile Dental Clinic/
    )
  }
}

export const DailyLimit: Story = {
  args: { api: api({ start: { ok: false, status: 429, body: { code: 'DEMO_BUILD_DAILY_LIMIT' } } }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(await canvas.findByLabelText('Find your business'), 'https://smiledental.vn')
    await userEvent.click(canvas.getByRole('button', { name: 'Build from this link' }))
    await expect(await canvas.findByText(/all of today’s sites/)).toBeVisible()
  }
}

export const Choosing: Story = {
  args: {
    api: api({
      state: ok({
        business: {
          id: 'b1',
          name: 'Smile Dental Clinic',
          phase: 'choose',
          recommended: {
            cms: 'joomla',
            design: 'ja-vital',
            quickstart: 'quickstart/ja-vital/j6',
            label: 'JA Vital',
            reason: 'auto:trade-match:health'
          }
        }
      })
    }),
    pickTemplate: async () => null
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(await canvas.findByLabelText('Find your business'), 'smiledental.vn')
    await userEvent.click(canvas.getByRole('button', { name: 'Build from this link' }))
    await expect(await canvas.findByText('JA Vital on Joomla')).toBeVisible()
    await expect(await canvas.findByText(/A clinic website with services/)).toBeVisible()
  }
}
