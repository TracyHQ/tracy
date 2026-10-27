/**
 * `harness.tracy.ai` → Team: who is at Tracy, and the two ways to change that list.
 *
 * The story IMPORTS the real code from `@tracy/harness-web` (step 1a of the UI workflow). The mockup that used to live at
 * `Mockups/Harness team` was deleted in the same pass — keeping it would mean two versions of one screen in the repo,
 * and the version nobody syncs is the one people read.
 *
 * `fetchImpl` is injected in each story: this screen calls `/api/team` on mount, and a Storybook with no
 * Worker could only draw the error state. The states below are the REAL shape of the answer
 * — copied from `workspaceRosterRow` in `workers/seat-registry/src/index.js`, not made up.
 */
import { Team, type TeamPayload } from '@tracy/harness-web'
import type { Meta, StoryObj } from '@storybook/react-vite'

const member = (
  id: string,
  email: string,
  role: TeamPayload['members'][number]['role'],
  accepted = true
) => ({
  id,
  email,
  role,
  grantedAt: '2026-08-15T00:00:00Z',
  acceptedAt: accepted ? '2026-08-15T00:00:00Z' : null
})

/** The book as it is today: two owners, one admin, six developers — measured 04/09. */
const BOOK: TeamPayload = {
  viewer: { email: 'pat@example.com', role: 'owner' },
  members: [
    member('11111111-1111-4111-8111-111111111111', 'pat@example.com', 'owner'),
    member('22222222-2222-4222-8222-222222222222', 'sam@example.com', 'owner'),
    member('33333333-3333-4333-8333-333333333333', 'alex@example.com', 'admin'),
    member('44444444-4444-4444-8444-444444444444', 'kim@example.net', 'developer'),
    member('55555555-5555-4555-8555-555555555555', 'jordan@example.com', 'developer'),
    member('66666666-6666-4666-8666-666666666666', 'dev4@example.com', 'developer')
  ]
}

/** A fake `fetch` returning exactly one answer, for every path. */
const answering = (body: unknown, status = 200): typeof fetch =>
  (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' }
    })) as unknown as typeof fetch

const meta = {
  component: Team,
  parameters: { layout: 'fullscreen' }
} satisfies Meta<typeof Team>

export default meta
type Story = StoryObj<typeof meta>

/** An owner sees the full book. Remove is open on every row because there are two owners. */
export const AsOwner: Story = { args: { fetchImpl: answering(BOOK) } }

/**
 * Admin: can add people, but Remove on the two owner rows is closed.
 *
 * The locked button carries a `title` stating the reason — blocked BEFORE the click, not an error after it.
 */
export const AsAdmin: Story = {
  args: { fetchImpl: answering({ ...BOOK, viewer: { email: 'alex@example.com', role: 'admin' } }) }
}

/** Developer: can read, no Add member button, every Remove closed. */
export const AsDeveloper: Story = {
  args: {
    fetchImpl: answering({
      ...BOOK,
      viewer: { email: 'kim@example.net', role: 'developer' }
    })
  }
}

/**
 * The last owner, looking at their own row.
 *
 * Removing yourself leaves nobody able to add anyone, and the way back is a few hand-typed `curl` calls into Supabase
 * — exactly what this screen was made to end. So that row is closed, even for an owner.
 */
export const LastOwner: Story = {
  args: {
    fetchImpl: answering({
      viewer: { email: 'pat@example.com', role: 'owner' },
      members: [BOOK.members[0], BOOK.members[2], BOOK.members[3]]
    })
  }
}

/**
 * An invitation not yet accepted.
 *
 * `invited` is not decoration: `tracyAdminRoleOf` requires `accepted_at`, so this row grants nothing
 * yet. The row must state the difference between "has been invited" and "can read this screen".
 */
export const PendingInvitation: Story = {
  args: {
    fetchImpl: answering({
      ...BOOK,
      members: [
        ...BOOK.members,
        member('77777777-7777-4777-8777-777777777777', 'new@example.com', 'developer', false)
      ]
    })
  }
}

/** The seat book's refusal, shown verbatim in words the reader can act on. */
export const Refused: Story = {
  args: { fetchImpl: answering({ code: 'SEAT_NOT_AUTHORIZED' }, 403) }
}

/**
 * The Add member dialog.
 *
 * A DIALOG, NOT a panel inserted into the page. The first coded version built it as a `Card` in the middle of the screen
 * — and the consequence showed on opening: the list below jumped down, and jumped back on close. Both tasks on
 * this screen are short (type an address, type a code), while the list is what is being acted
 * on, so it must stay where the eye just left it.
 *
 * `play` opens the dialog instead of snapshotting a static state: the button is what the user presses, so the story takes that
 * path — a story that pre-renders the open state would stay green even when the button is broken.
 */
export const AddMemberDialog: Story = {
  args: { fetchImpl: answering(BOOK) },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole('button', { name: /Add member/ }))
  }
}

/**
 * The Remove dialog — an `AlertDialog`, because this is destructive.
 *
 * It says WHO and WHEN, not just "are you sure": access is lost on the next call, not the next
 * sign-in, and that is the easiest part to misread. The code field sits inside the same dialog — a mistyped code must keep the dialog open,
 * or people lose the very field they need.
 */
export const RemoveMemberDialog: Story = {
  args: {
    fetchImpl: (async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/code'))
        return new Response(JSON.stringify({ sent: true, to: 'p•••@example.com' }), { status: 200 })
      return new Response(JSON.stringify(BOOK), { status: 200 })
    }) as unknown as typeof fetch
  },
  play: async ({ canvas, userEvent }) => {
    const rows = await canvas.findAllByRole('button', { name: 'Remove' })
    // The developer row — owner rows are locked when only two owners remain and the viewer is an owner.
    await userEvent.click(rows[rows.length - 1])
  }
}
