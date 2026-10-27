/** Real invitation panels with synthetic, in-memory state; no customer data or network requests. */
import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import type { Campaign, Recipient } from '../../../../../web/tracy-harness/src/invitations/api'
import { ContentPanel } from '../../../../../web/tracy-harness/src/invitations/ContentPanel'
import { ConversationPanel, ReviewPanel } from '../../../../../web/tracy-harness/src/invitations/EmailPanels'
import type {
  CampaignView,
  RecipientDetail,
  Registry,
  RealWrite
} from '../../../../../web/tracy-harness/src/invitations/real-api'
import { RealReviewPanel } from '../../../../../web/tracy-harness/src/invitations/RealReviewPanel'
import { RealReviewWorkspace } from '../../../../../web/tracy-harness/src/invitations/RealReviewWorkspace'
import { RealRecipients } from '../../../../../web/tracy-harness/src/invitations/RealRecipients'
import { RealFieldsPanel } from '../../../../../web/tracy-harness/src/invitations/RealFieldsPanel'

const AT = '2026-10-09T09:00:00.000Z'
const GROUPS = Array.from({ length: 5 }, (_, index) => ({
  key: `group_${index + 1}`,
  label: `Sandbox group ${index + 1}`
}))

function makeRecipient(index: number, group: string): Recipient {
  return {
    id: `synthetic-${index}`,
    email: `synthetic-${index}@invitations.test`,
    group,
    firstName: `Synthetic ${index}`,
    state: 'draft',
    draft: {
      subject: '[Sandbox] An invitation for Synthetic ' + index,
      bodyText:
        'Hello Synthetic ' +
        index +
        ',\n\nThis is fictional content for a design review.\nReply STOP to test suppression.',
      revision: 1,
      contentHash: `synthetic-hash-${index}-1`,
      approved: false,
      templateGroup: group,
      templateVersion: 1
    },
    messages: [],
    attempts: []
  }
}

function makeCampaign(empty: boolean): Campaign {
  return {
    id: 'synthetic-story-campaign',
    name: 'Synthetic invitation review',
    revision: 1,
    counts: {},
    content: empty
      ? []
      : GROUPS.map(({ key }) => ({
          group: key,
          activeVersion: 1,
          versions: [
            {
              version: 1,
              subject: '[Sandbox] Hello {{first_name}}',
              bodyText:
                'Hello {{first_name}},\n\nThis is a fictional invitation for {{group}}.\nReply STOP to test suppression.',
              createdAt: AT
            }
          ]
        })),
    recipients: empty
      ? []
      : GROUPS.flatMap(({ key }, index) => [
          makeRecipient(index * 2 + 1, key),
          { ...makeRecipient(index * 2 + 2, key), state: 'ready', draft: null }
        ])
  }
}

interface PreviewProps {
  view: 'content' | 'review' | 'conversations'
  status?: 'normal' | 'approved' | 'suppressed'
  writable?: boolean
  busy?: boolean
  empty?: boolean
  saveFails?: boolean
}

function InvitationsPreview({
  view,
  status = 'normal',
  writable = true,
  busy = false,
  empty = false,
  saveFails = false
}: PreviewProps) {
  const [campaign, setCampaign] = useState(() => makeCampaign(empty))
  const [, setDirty] = useState(false)
  const [recipient, setRecipient] = useState<Recipient>(() => {
    const row = makeRecipient(1, 'group_1')
    if (status === 'approved' && row.draft) row.draft.approved = true
    if (view === 'conversations') {
      row.state = 'simulated'
      row.attempts = [{ id: 'synthetic-attempt', state: 'simulated' }]
      row.messages = [
        {
          id: 'synthetic-outbound',
          direction: 'outbound',
          bodyText: row.draft?.bodyText ?? '',
          createdAt: AT
        },
        {
          id: 'synthetic-inbound',
          direction: 'inbound',
          bodyText: 'This is a fictional reply for the design review.',
          createdAt: AT
        }
      ]
    }
    if (status === 'suppressed') row.state = 'suppressed'
    return row
  })

  const renderText = (text: string, row: Recipient) =>
    text.replaceAll('{{first_name}}', row.firstName || 'there').replaceAll('{{group}}', row.group)

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-8">
      {view === 'content' ? (
        <ContentPanel
          campaign={campaign}
          groups={GROUPS}
          writable={writable}
          busy={busy}
          onDirty={setDirty}
          onSave={async (group, subject, bodyText) => {
            if (saveFails) throw new Error('Synthetic save failure. Your changes are kept for retry.')
            setCampaign((current) => {
              const previous = current.content?.find((row) => row.group === group)
              const version = (previous?.activeVersion ?? 0) + 1
              return {
                ...current,
                revision: current.revision + 1,
                content: [
                  ...(current.content ?? []).filter((row) => row.group !== group),
                  {
                    group,
                    activeVersion: version,
                    versions: [...(previous?.versions ?? []), { version, subject, bodyText, createdAt: AT }]
                  }
                ]
              }
            })
          }}
          onPreview={async (group, recipientId) => {
            const row = campaign.recipients?.find((item) => item.group === group && item.id === recipientId)
            const content = campaign.content?.find((item) => item.group === group)
            const template = content?.versions.find((item) => item.version === content.activeVersion)
            if (!row || !template) throw new Error('Choose a synthetic recipient with a saved template.')
            return {
              group,
              templateVersion: template.version,
              subject: renderText(template.subject, row),
              bodyText: renderText(template.bodyText, row)
            }
          }}
          onGenerate={async (group, replaceExisting) => {
            setCampaign((current) => ({
              ...current,
              revision: current.revision + 1,
              recipients: current.recipients?.map((row) => {
                if (
                  (group && row.group !== group) ||
                  !['ready', 'draft'].includes(row.state) ||
                  row.attempts.length ||
                  (row.draft && !replaceExisting)
                )
                  return row
                const content = current.content?.find((item) => item.group === row.group)
                const template = content?.versions.find((item) => item.version === content.activeVersion)
                if (!template) return row
                return {
                  ...row,
                  state: 'draft',
                  draft: {
                    subject: renderText(template.subject, row),
                    bodyText: renderText(template.bodyText, row),
                    revision: (row.draft?.revision ?? 0) + 1,
                    contentHash: `synthetic-${row.id}-${current.revision + 1}`,
                    approved: false,
                    templateGroup: row.group,
                    templateVersion: template.version
                  }
                }
              })
            }))
          }}
        />
      ) : view === 'review' ? (
        <ReviewPanel
          recipient={recipient}
          writable={writable}
          busy={busy}
          onDirty={setDirty}
          onSave={async (subject, bodyText) =>
            setRecipient((current) => ({
              ...current,
              draft: current.draft
                ? {
                    ...current.draft,
                    subject,
                    bodyText,
                    revision: current.draft.revision + 1,
                    contentHash: `synthetic-${current.id}-${current.draft.revision + 1}`,
                    approved: false
                  }
                : null
            }))
          }
          onApprove={async () =>
            setRecipient((current) => ({
              ...current,
              draft: current.draft ? { ...current.draft, approved: true } : null
            }))
          }
        />
      ) : (
        <ConversationPanel
          recipient={recipient}
          writable={writable}
          busy={busy}
          onDirty={setDirty}
          onMessage={async (bodyText, direction) =>
            setRecipient((current) => ({
              ...current,
              state:
                direction === 'inbound' && bodyText.trim().toUpperCase() === 'STOP'
                  ? 'suppressed'
                  : current.state,
              messages: [
                ...current.messages,
                { id: `synthetic-message-${current.messages.length}`, bodyText, direction, createdAt: AT }
              ]
            }))
          }
        />
      )}
    </div>
  )
}

const meta = {
  title: 'Screens/Ops/Invitations',
  component: InvitationsPreview,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The actual sandbox panels. All recipients, templates and events are synthetic in-memory fixtures. Story interactions do not contact any server or send email.'
      }
    }
  },
  args: { view: 'content', writable: true }
} satisfies Meta<typeof InvitationsPreview>
export default meta
type Story = StoryObj<typeof meta>

export const Content: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: 'Save new version' })).toBeDisabled()
    await userEvent.clear(canvas.getByLabelText('Subject'))
    await userEvent.type(canvas.getByLabelText('Subject'), 'Sandbox updated invitation')
    await expect(canvas.getByText('Unsaved changes')).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Generate missing drafts' })).toBeDisabled()
    await userEvent.click(canvas.getByRole('button', { name: 'Save new version' }))
    await waitFor(() => expect(canvas.queryByText('Unsaved changes')).not.toBeInTheDocument())
    await expect(canvas.getByRole('button', { name: 'Generate missing drafts' })).toBeEnabled()
    await userEvent.selectOptions(canvas.getByLabelText('Preview recipient'), 'synthetic-1')
    await userEvent.click(canvas.getByRole('button', { name: 'Preview saved template' }))
    await expect(await canvas.findByText('Sandbox updated invitation')).toBeVisible()
  }
}
export const ContentEmpty: Story = { args: { empty: true } }
export const ContentReadOnly: Story = { args: { writable: false } }
export const ContentBusy: Story = { args: { busy: true } }
export const ContentSaveFailure: Story = {
  args: { saveFails: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.clear(canvas.getByLabelText('Subject'))
    await userEvent.type(canvas.getByLabelText('Subject'), 'Sandbox keep these edits')
    await userEvent.click(canvas.getByRole('button', { name: 'Save new version' }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent('Synthetic save failure')
    await expect(canvas.getByLabelText('Subject')).toHaveValue('Sandbox keep these edits')
    await expect(canvas.getByText('Unsaved changes')).toBeVisible()
  }
}
export const Review: Story = {
  args: { view: 'review' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByLabelText('Email body'), '\nAn individual synthetic note.')
    await expect(canvas.getByRole('button', { name: 'Approve snapshot' })).toBeDisabled()
    await expect(canvas.getByText('Save your changes before approval.')).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Save draft' }))
    await waitFor(() => expect(canvas.getByRole('button', { name: 'Approve snapshot' })).toBeEnabled())
    await userEvent.click(canvas.getByRole('button', { name: 'Approve snapshot' }))
    await expect(await canvas.findByText('This exact version is already approved.')).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Approve snapshot' })).toBeDisabled()
  }
}
export const ReviewApproved: Story = {
  args: { view: 'review', status: 'approved' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: 'Approve snapshot' })).toBeDisabled()
    await expect(canvas.getByText('This exact version is already approved.')).toBeVisible()
  }
}
export const ReviewSuppressed: Story = {
  args: { view: 'review', status: 'suppressed' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByLabelText('Email body')).toBeDisabled()
    await expect(canvas.getByRole('button', { name: 'Approve snapshot' })).toBeDisabled()
    await expect(canvas.getByRole('button', { name: 'Save draft' })).toBeDisabled()
  }
}
export const Conversations: Story = { args: { view: 'conversations' } }
export const ConversationsStop: Story = {
  args: { view: 'conversations' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByLabelText('Compose a test message'), 'STOP')
    await userEvent.click(canvas.getByRole('button', { name: 'Simulate inbound' }))
    await expect(
      await canvas.findByText('Recipient is suppressed or unsubscribed. Replies are blocked.')
    ).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Simulate reply' })).toBeDisabled()
  }
}

// These stories render the production real-campaign panels, without an HTTP boundary or real data.
const REAL_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
function realRecipient(status: 'draft' | 'approved' | 'stale' | 'empty'): RecipientDetail {
  return {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    email: 'synthetic@invitations.test',
    firstName: 'there',
    group: 'group_1',
    groupLabel: 'Active agencies',
    state: 'recheck',
    contentStatus: status,
    reasons: ['SOURCE_ASSERTIONS_UNKNOWN'],
    values: {},
    rawSource: { headers: ['email', 'company'], values: ['synthetic@invitations.test', 'Synthetic company'] },
    draft:
      status === 'empty'
        ? null
        : {
            revision: 1,
            templateVersion: 1,
            reviewedTemplateVersion: 1,
            subject: 'A synthetic invitation',
            html: '<p>Customized synthetic note.</p>',
            bodyText: 'Customized synthetic note.',
            assets: [],
            customized: true,
            contentApproved: status === 'approved',
            stale: status === 'stale'
          }
  }
}
function RealReviewStory({
  status = 'draft',
  saveFails = false
}: {
  status?: 'draft' | 'approved' | 'stale' | 'empty'
  saveFails?: boolean
}) {
  const [recipient, setRecipient] = useState(() => realRecipient(status))
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const write: RealWrite = async (path, body) => {
    if (saveFails) {
      setError('Synthetic save failure. Your edits are kept.')
      throw new Error('Synthetic failure')
    }
    const input = body as { subject?: string; html?: string; text?: string }
    setRecipient((r) => ({
      ...r,
      draft: r.draft
        ? {
            ...r.draft,
            revision: r.draft.revision + 1,
            ...(path.endsWith('/approve')
              ? { contentApproved: true, stale: false }
              : {
                  subject: input.subject ?? r.draft.subject,
                  html: input.html ?? r.draft.html,
                  bodyText: input.text ?? r.draft.bodyText,
                  contentApproved: false,
                  customized: true
                })
          }
        : null
    }))
    return { revision: 2 }
  }
  return (
    <div className="mx-auto max-w-6xl p-4 md:p-8">
      {error ? <p role="alert">{error}</p> : null}
      <RealReviewPanel
        key={recipient.draft?.revision ?? 0}
        recipient={recipient}
        campaignId={REAL_ID}
        registry={null}
        busy={false}
        onError={() => setError('Synthetic preview failure')}
        onDirty={() => {}}
        write={write}
        onSaved={async () => {}}
        onOpenTemplates={() => {}}
        onPrevious={null}
        onNext={null}
        editing={editing}
        onEditing={setEditing}
      />
    </div>
  )
}
export const RealDraft: Story = {
  render: () => <RealReviewStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('A synthetic invitation')).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Edit this email' }))
    await userEvent.type(canvas.getByLabelText('Draft HTML'), '<p>An individual note.</p>')
    await expect(canvas.getByRole('button', { name: 'Approve content and go to next' })).toBeDisabled()
    await userEvent.click(canvas.getByRole('button', { name: 'Save this email' }))
    await waitFor(() =>
      expect(canvas.getByRole('button', { name: 'Approve content and go to next' })).toBeEnabled()
    )
    await userEvent.click(canvas.getByRole('button', { name: 'Approve content and go to next' }))
    await expect(await canvas.findByRole('button', { name: 'Content approved' })).toBeDisabled()
    await expect(canvas.getByText(/Approving content does not send anything/)).toBeVisible()
  }
}
export const RealApproved: Story = {
  render: () => <RealReviewStory status="approved" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: 'Content approved' })).toBeDisabled()
    await expect(canvas.getByText(/Approving content does not send anything/)).toBeVisible()
  }
}
export const RealStale: Story = {
  render: () => <RealReviewStory status="stale" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Changed, review again')).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Edit this email' }))
    await expect(canvas.getByLabelText('Draft HTML')).toHaveValue('<p>Customized synthetic note.</p>')
    await expect(canvas.queryByRole('button', { name: 'Content approved' })).not.toBeInTheDocument()
  }
}
export const RealEmptyDraft: Story = {
  render: () => <RealReviewStory status="empty" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/No draft yet for this recipient/)).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Open Content / Templates' })).toBeVisible()
    await expect(
      canvas.queryByRole('button', { name: 'Approve content and go to next' })
    ).not.toBeInTheDocument()
  }
}
export const RealSaveFailure: Story = {
  render: () => <RealReviewStory saveFails />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Edit this email' }))
    await userEvent.clear(canvas.getByLabelText('Draft subject'))
    await userEvent.type(canvas.getByLabelText('Draft subject'), 'Keep this synthetic edit')
    await userEvent.click(canvas.getByRole('button', { name: 'Save this email' }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent('Your edits are kept')
    await expect(canvas.getByLabelText('Draft subject')).toHaveValue('Keep this synthetic edit')
    await expect(canvas.getByRole('button', { name: 'Approve content and go to next' })).toBeDisabled()
  }
}
// The Review content workspace against an in-memory stand-in for the real campaign doors: synthetic
// recipients only, and no request leaves the page.
const WORKSPACE_CAMPAIGN: CampaignView = {
  id: REAL_ID,
  name: 'Synthetic campaign',
  revision: 1,
  sourceDate: '2026-10-07',
  firstImportedAt: AT,
  expiresAt: '2026-11-11T03:10:01.000Z',
  counts: { total: 3, groups: [3, 0, 0, 0, 0], suppressed: 0, recheck: 3 },
  sendingEnabled: false,
  eligibleNow: null
}
function workspaceRecipients(): RecipientDetail[] {
  return ['ana', 'bo', 'cy'].map((name, i) => ({
    ...realRecipient(i === 2 ? 'empty' : 'draft'),
    id: `cccccccc-cccc-4ccc-8ccc-${String(i).padStart(12, '0')}`,
    email: `${name}@invitations.test`,
    contentStatus: i === 2 ? 'not_created' : 'draft',
    draft:
      i === 2
        ? null
        : {
            ...(realRecipient('draft').draft as NonNullable<RecipientDetail['draft']>),
            customized: false,
            subject: `Something we have been building, ${name}`,
            html: `<div style="font-family:Arial;padding:16px"><p>Hi ${name},</p><p>A synthetic invitation body.</p></div>`
          }
  }))
}
function RealWorkspaceStory() {
  const [people] = useState(workspaceRecipients)
  useState(() => {
    const real = '/api/ops/invitations/real/campaigns/'
    const original = globalThis.fetch
    globalThis.fetch = async (input, init) => {
      const url = String(input)
      if (!url.startsWith(real)) return original(input, init)
      const answer = (data: unknown) =>
        new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } })
      if (url.endsWith('/recipients/query'))
        return answer({
          items: people.map(({ rawSource: _r, values: _v, draft: _d, ...summary }) => summary),
          nextCursor: null,
          revision: 1,
          total: people.length
        })
      if (url.endsWith('/approve')) {
        const id = url.split('/recipients/')[1]?.split('/')[0]
        const p = people.find((x) => x.id === id)
        if (p?.draft) {
          p.draft = { ...p.draft, contentApproved: true }
          p.contentStatus = 'approved'
        }
        return answer({ revision: 2 })
      }
      const id = url.split('/recipients/')[1]
      return answer(people.find((x) => x.id === id) ?? null)
    }
    return original
  })
  return (
    <div className="mx-auto max-w-6xl p-4 md:p-8">
      <RealReviewWorkspace
        campaign={WORKSPACE_CAMPAIGN}
        groups={[{ key: 'group_1', label: 'Active agencies' }]}
        registry={null}
        busy={false}
        run={async (work) => {
          await work()
          return true
        }}
        write={async (path, _body, refresh) => {
          const response = await fetch(`/api/ops/invitations/real/campaigns/${REAL_ID}${path}`, {
            method: 'POST'
          })
          const result = (await response.json()) as { revision: number }
          await refresh?.()
          return result
        }}
        onDirty={() => {}}
        canLeave={() => true}
        onError={() => {}}
        onOpenTemplates={() => {}}
        initialRecipientId={null}
      />
    </div>
  )
}
export const RealReviewWorkspaceList: Story = {
  render: () => <RealWorkspaceStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText('Something we have been building, ana')).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Approve content and go to next' }))
    await expect(await canvas.findByText('Something we have been building, bo')).toBeVisible()
  }
}
export const RealEmptyRecipients: Story = {
  render: () => (
    <div className="p-4">
      <RealRecipients
        page={{ items: [], nextCursor: null, revision: 1, total: 0 }}
        detail={null}
        groups={GROUPS}
        group=""
        state=""
        search=""
        busy={false}
        onFilter={() => {}}
        onSelect={() => {}}
        onNext={() => {}}
        onReview={() => {}}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('0 matching recipients · at most 100 per page')).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Next page' })).toBeDisabled()
  }
}
function RealFieldsStory() {
  const [registry, setRegistry] = useState<Registry>({
    revision: 1,
    fields: [],
    campaignValues: {},
    groupValues: {}
  })
  return (
    <div className="p-4">
      <RealFieldsPanel
        key={registry.revision}
        registry={registry}
        headers={['company', 'plan']}
        groups={GROUPS}
        busy={false}
        onDirty={() => {}}
        onSaved={async () => {}}
        write={async (_path, body) => {
          const next = (body as { registry: Registry }).registry
          setRegistry({ ...next, revision: registry.revision + 1 })
          return { revision: registry.revision + 1 }
        }}
      />
    </div>
  )
}
export const RealCustomFields: Story = {
  render: () => <RealFieldsStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByLabelText('New field key'), 'opening_line')
    await userEvent.type(canvas.getByLabelText('New field label'), 'Opening line')
    await userEvent.click(canvas.getByRole('button', { name: 'Add text field' }))
    await userEvent.selectOptions(canvas.getByLabelText('custom.opening_line source'), 'company')
    await userEvent.selectOptions(canvas.getByLabelText('custom.opening_line missing rule'), 'default')
    await userEvent.type(canvas.getByLabelText('custom.opening_line default'), 'Synthetic default')
    await userEvent.click(canvas.getByRole('button', { name: 'Save fields' }))
    await waitFor(() => expect(canvas.getByRole('button', { name: 'Save fields' })).toBeDisabled())
    await expect(canvas.getByLabelText('custom.opening_line source')).toHaveValue('company')
    await expect(canvas.getByLabelText('custom.opening_line default')).toHaveValue('Synthetic default')
  }
}
