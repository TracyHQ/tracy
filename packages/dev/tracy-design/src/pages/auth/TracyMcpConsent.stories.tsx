/** The real Tracy OAuth consent page: one-site access, account identity and the empty state. */
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { consentPage } from '../../../../../../apps/tracy-web/src/mcp/pages.js'

function ConsentFrame({ html }: { html: string }) {
  return <iframe title="Tracy OAuth consent" srcDoc={html} className="h-full w-full border-0" />
}
const meta = { component: ConsentFrame, parameters: { layout: 'fullscreen' } } satisfies Meta<
  typeof ConsentFrame
>
export default meta
type Story = StoryObj<typeof meta>
const props = { email: 'editor@example.com', request: 'preview-only', signature: 'preview-only', lang: 'en' }

export const ChooseSite: Story = {
  args: {
    html: consentPage({
      ...props,
      sites: [{ site_key: 'shop.example.com' }, { site_key: 'news.example.com' }]
    })
  },
  play: async ({ args }) => {
    expect(args.html).toContain('data-mcp-consent')
    expect(args.html).toContain('name="siteKey"')
    expect(args.html).not.toContain('value="allow" disabled')
  }
}
export const NoEditableSite: Story = {
  args: { html: consentPage({ ...props, sites: [] }) },
  play: async ({ args }) => {
    expect(args.html).toContain('value="allow" disabled')
    expect(args.html).toContain('value="deny" formnovalidate')
  }
}
export const Vietnamese: Story = {
  args: { html: consentPage({ ...props, lang: 'vi', sites: [{ site_key: 'shop.example.com' }] }) }
}
