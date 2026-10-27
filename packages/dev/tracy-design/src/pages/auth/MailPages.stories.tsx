/**
 * The mails the seat book sends about a team: the invitation, and the "somebody asked to join"
 * bell for the site's Owners. Both are built by `workers/mail/src/emails.js` on the frame React Email
 * rendered into `emailHtml.generated.mjs`; the story IMPORTS the builders, so what shows here is
 * what Resend receives. `docs/references/ui-workflow.md`, step 1.
 *
 * Rendered in `<iframe srcDoc>`: a mail carries its own `<html>` and inline styles and must not
 * inherit the bench's Tailwind.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'

import {
  betaMail,
  joinRequestMail,
  teamInviteMail
} from '../../../../../../apps/tracy-web/src/mail/emails.js'

function Mail({ subject, html }: { subject: string; html: string }) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b bg-muted/40 px-6 py-3 text-sm">
        <span className="text-muted-foreground">Subject · </span>
        <span className="font-medium">{subject}</span>
      </div>
      <iframe srcDoc={html} title={subject} className="min-h-0 w-full flex-1 border-0" />
    </div>
  )
}

const meta = {
  component: Mail,
  parameters: { layout: 'fullscreen' }
} satisfies Meta<typeof Mail>

export default meta
type Story = StoryObj<typeof meta>

const ACCEPT =
  'https://cowork.tracy.ai/invite/eyJ2IjoxLCJlbWFpbCI6ImhhbmEub3BzQGdtYWlsLmNvbSJ9.4GGi2PB4W60LJ4uZhBzmiRcf3AGlgil1xZOIW5xBDkY'

/** One person, one role, eight sites, one link that accepts them all. */
export const InviteEightSites: Story = {
  name: 'Invitation - eight sites',
  args: teamInviteMail({
    inviterName: 'Lee',
    inviterEmail: 'patowner@example.com',
    role: 'viewer',
    siteKeys: [
      'beta.tracy.ai',
      'gymshark.com',
      'joomlart.com',
      'tracy.ai',
      'juneflower.tracy.ai',
      'demo-tracy.myshopify.com',
      'tracy-demo-001.myshopify.com',
      'fijitrips.example'
    ] as never,
    acceptUrl: ACCEPT
  })
}

export const InviteOneSite: Story = {
  name: 'Invitation - one site',
  args: teamInviteMail({
    inviterName: 'Lee',
    inviterEmail: 'patowner@example.com',
    role: 'editor',
    siteKeys: ['tracy.ai'] as never,
    acceptUrl: ACCEPT
  })
}

/** What every Owner of the site gets when somebody presses "Ask for access" (ADR 0028). */
export const JoinRequest: Story = {
  name: 'Asked to join - to the owners',
  args: joinRequestMail({
    requesterEmail: 'samfounder@example.com',
    requesterName: null,
    siteKey: 'fijitrips.example',
    reviewUrl:
      'https://cowork.tracy.ai/fijitrips.example?open=my-sites&team=fijitrips.example&member=samfounder%40example.com'
  })
}

export const BetaWaitlist: Story = {
  name: 'Whitelist - join',
  args: betaMail({ url: 'https://tracy.ai/whitelist/?email=visitor%40example.com' })
}

export const BetaUnavailable: Story = {
  name: 'Whitelist - membership unavailable',
  args: betaMail({ url: 'https://tracy.ai/whitelist/?email=visitor%40example.com', unavailable: true })
}
