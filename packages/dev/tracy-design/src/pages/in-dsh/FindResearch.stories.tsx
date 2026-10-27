/** The production Find table: existing research, no research and this account's live demo. */
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { PlacesTable, createTranslate, type PlaceRow } from '../../../../../ui/tracy-wo-views/src/index'
import { FindActionButton } from '../../../../../../packages/site/tracy-website-opportunities/src/client/find-action'
import { en } from '../../../../../../packages/site/tracy-website-opportunities/src/client/strings'
import '../../../../../ui/tracy-wo-views/src/styles.css'

const t = createTranslate(en)
const base: PlaceRow = {
  key: 'google-places:warm',
  provider: 'google-places',
  providerId: 'warm',
  name: 'Warm restaurant',
  kind: 'restaurants',
  chain: false,
  chainSuspect: false,
  status: 'researched',
  website: 'https://example.test',
  rating: 4.4,
  reviews: 1107,
  tripadvisor: {
    rating: 4,
    reviews: 238,
    url: 'https://www.tripadvisor.com/12345',
    checkedAt: '2026-10-21T10:00:00Z'
  },
  research: { researchedAt: new Date(Date.now() - 2 * 86400000).toISOString(), canBuild: true },
  findAction: { kind: 'build' },
  score: { score: 75, grade: 'A', pending: false, reasons: [] },
  siteCheck: { status: 'done', performance: 41 },
  email: 'hello@example.test'
}
function FindResearch() {
  const rows: PlaceRow[] = [
    base,
    {
      ...base,
      key: 'new',
      name: 'New restaurant',
      status: 'new',
      research: null,
      findAction: { kind: 'research' }
    },
    {
      ...base,
      key: 'mine',
      name: 'My demo restaurant',
      status: 'demo',
      findAction: { kind: 'view', siteKey: 'mine.example.test' }
    }
  ]
  return (
    <div className="tracy-wo">
      <PlacesTable
        t={t}
        rows={rows}
        selected={new Set()}
        hidden={new Set()}
        sort="score"
        dir={-1}
        onSort={() => {}}
        actions={{ onToggle() {} }}
        extraColumns={[
          {
            id: 'action',
            header: 'Action',
            after: 'web',
            cell: (row) => <FindActionButton row={row} t={t} onAction={() => {}} />
          }
        ]}
      />
    </div>
  )
}
const meta = {
  title: 'Screens/In dsh/Find research',
  component: FindResearch,
  parameters: { layout: 'fullscreen' }
} satisfies Meta<typeof FindResearch>
export default meta
export const ExistingAndNew: StoryObj<typeof meta> = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    const headers = c.getAllByRole('columnheader').map((h) => h.textContent)
    await expect(headers.indexOf('Action')).toBe(headers.indexOf('Website') + 1)
    await expect(c.getAllByText('Tripadvisor').length).toBeGreaterThan(0)
    await expect(c.getAllByText('Researched 2 days ago').length).toBeGreaterThan(0)
    await expect(c.getByRole('button', { name: /^Build demo$/ })).toBeEnabled()
    await expect(c.getByRole('button', { name: /^View demo$/ })).toBeEnabled()
    await userEvent.click(c.getByRole('button', { name: /^Build demo$/ }))
  }
}
