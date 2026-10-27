// Can the original brief questionnaire sit alongside contextual site views?
import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  Badge,
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  Label,
  NativeSelect,
  NativeSelectOption,
  PlatformGlyph,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@tracy/ui'
import {
  ArrowLeft,
  ChevronDown,
  CircleHelp,
  ClipboardCheck,
  ExternalLink,
  Hammer,
  History,
  ListTree,
  MessageSquare,
  Monitor,
  Paperclip,
  Send,
  Shield
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { BuildApi, Job } from '../../../../site/tracy-site-build-core/src/client/api'
import { BuildForm } from '../../../../site/tracy-site-build-core/src/client/BuildForm'
import { BuildHeader } from '../../../../site/tracy-site-build-core/src/client/BuildTab'
import { parkComposer } from '../../../../site/tracy-site-build-core/src/client/composer'
import type { Translate } from '../../../../site/tracy-site-build-core/src/client/strings'
import { questionsFor } from '../../../../site/tracy-site-build-core/src/questions.mjs'
import wordpressQuestions from '../../../../site/tracy-site-build-wordpress/questions.json'
import { en } from '../../../../site/tracy-site-build-wordpress/src/client/strings'
import {
  type BuildProfile,
  buildAnswers,
  buildProfiles,
  buildSite,
  commentTargets,
  northgateDecisions,
  northgatePages
} from '../fixtures/build-parent'
import { installDoors } from '../pages/in-dsh/design-inspirations.doors'

const operationSections = [
  { id: 'Build', icon: Hammer },
  { id: 'Pages & blocks', icon: ListTree },
  { id: 'Decisions', icon: CircleHelp },
  { id: 'Quality', icon: ClipboardCheck },
  { id: 'Changes', icon: History },
  { id: 'Admin', icon: Shield }
]
const viewLabel = (view: string, unanswered = northgateDecisions.length) =>
  view === 'Build'
    ? 'Build brief'
    : view === 'Site'
      ? 'Preview'
      : view === 'Decisions'
        ? `Need comment (${unanswered})`
        : view

function BuildParent({ profile = 'joomla' }: { profile?: BuildProfile }) {
  const cms = buildProfiles[profile]
  const [tab, setTab] = useState('Build')
  const [unanswered, setUnanswered] = useState(northgateDecisions.length)
  return (
    <TooltipProvider>
      <div className="min-h-dvh bg-muted/30 text-foreground text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-border border-b bg-background px-4 py-2 text-muted-foreground text-xs">
          <span>Mockup / sample site / changes stay in this preview</span>
          <Badge variant="outline">{cms.name}</Badge>
        </div>
        <main
          data-testid="build-parent"
          className="mx-auto min-h-[780px] max-w-[520px] border-border border-x bg-background"
        >
          <div className="flex h-11 items-center border-border border-b">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    className="h-11 gap-2 rounded-none border-border border-r px-4"
                    aria-label={viewLabel(tab, unanswered)}
                  />
                }
              >
                <PlatformGlyph platform={profile} />
                <span className="font-medium">{viewLabel(tab, unanswered)}</span>
                <ChevronDown className="size-3.5 text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-64" align="start" sideOffset={4}>
                <DropdownMenuRadioGroup value={tab} onValueChange={(value) => setTab(String(value))}>
                  {operationSections.map(({ id, icon: Icon }) => (
                    <DropdownMenuRadioItem
                      key={id}
                      value={id}
                      aria-label={viewLabel(id, unanswered)}
                      closeOnClick
                      className="gap-2 py-2"
                    >
                      <Icon className="size-4 text-muted-foreground" />
                      <span>{viewLabel(id, unanswered)}</span>
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    className="mr-2 ml-auto"
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Live preview"
                    onClick={() => setTab('Site')}
                  />
                }
              >
                <Monitor />
              </TooltipTrigger>
              <TooltipContent>Live preview</TooltipContent>
            </Tooltip>
          </div>
          <SiteOperations view={tab} navigate={setTab} onUnansweredChange={setUnanswered} profile={profile} />
          <div hidden={tab !== 'Build'}>
            <BuildQuestionnaire profile={profile} />
          </div>
        </main>
      </div>
    </TooltipProvider>
  )
}

const briefDictionary: Record<string, string> = {
  ...en,
  'form.decide': '',
  'msg.decide': '',
  'form.send': 'Send to Tracy',
  'form.continue': 'Send to Tracy'
}
const briefTranslate: Translate = (key, params) =>
  (briefDictionary[key] ?? key).replace(/\{(\w+)\}/g, (match, name: string) =>
    String(params?.[name] ?? match)
  )

function BuildQuestionnaire({ profile }: { profile: BuildProfile }) {
  const [ready, setReady] = useState(false)
  const [editing, setEditing] = useState(false)
  const [, refresh] = useState(0)
  const [updated, setUpdated] = useState(false)
  const cms = buildProfiles[profile]
  const job = useRef<Job>({
    job: 'mock-build',
    inspiration: 'apple',
    platform: profile,
    status: 'done',
    startedAt: 'mock-0',
    contentRevision: 'mock-0',
    runs: 1,
    stages: ['check', 'theme', 'style', 'copy', 'seed', 'shot'].map((name) => ({ name, status: 'done' })),
    answers: buildAnswers,
    targetSiteKey: buildSite.siteKey,
    targetUrl: buildSite.site.url
  })
  const api = useMemo<BuildApi>(
    () => ({
      prefix: '/mock-only',
      stages: job.current.stages.map((s) => s.name),
      fetchAsk: async () => null,
      fetchQuestions: async () => ({
        source: 'standard',
        owner: 'wordpress',
        quickstart: null,
        questions: questionsFor(wordpressQuestions as never, 'en') as never
      }),
      fetchJob: async () => job.current,
      readJob: async () => ({ state: 'job', job: job.current }),
      startBuild: async () => ({ ok: true, job: job.current }),
      sendAnswers: async (answers) => {
        job.current = { ...job.current, answers, contentRevision: `mock-${Date.now()}` }
        refresh((v) => v + 1)
        setUpdated(true)
        return true
      },
      rerun: async () => true,
      // The half of BuildApi this mockup does not exercise. Null is the contract's own "nothing to
      // say" for the two fetches, and the two writes report success so the views render their
      // settled state rather than an error the mockup cannot produce.
      fetchDesignPlan: async () => null,
      reportProvision: async () => undefined,
      fetchWorkspace: async () => null,
      sendComment: async () => ({ ok: true }),
      inspect: async () => ({ ok: true }),
      shotUrl: () => ''
    }),
    []
  )
  useEffect(() => {
    installDoors(buildSite)
    parkComposer({ setDraft: () => undefined, submit: () => undefined })
    setReady(true)
  }, [])
  if (!ready) return null
  const answers = job.current.answers ?? {}
  const display = (value: unknown, kind?: 'pages' | 'languages' | 'tone'): string => {
    const label = (item: string) => {
      if (kind === 'languages') return item === 'en' ? 'English' : item
      const key = kind === 'pages' ? `page.${item}` : kind === 'tone' ? `tone.${item}` : ''
      return key && briefDictionary[key] ? briefDictionary[key]! : item
    }
    if (Array.isArray(value)) return value.map((item) => label(String(item))).join(', ') || 'Not provided'
    return typeof value === 'string' && value.trim() ? label(value.trim()) : 'Not provided'
  }
  return (
    <>
      <div className="border-border border-b px-4 py-2.5 text-muted-foreground text-sm">
        {updated ? 'Brief updated just now' : 'Brief updated 2 min ago'}
      </div>
      {!editing ? (
        <div className="p-4">
          <dl className="divide-y divide-border">
            {[
              ['Business name', display(answers.name)],
              ['About', display(answers.about)],
              ['Pages', display(answers.pages, 'pages')],
              ['Languages', display(answers.languages, 'languages')],
              ['Tone', display(answers.tone, 'tone')]
            ].map(([label, value]) => (
              <div key={label} className="grid gap-1 py-3 sm:grid-cols-[120px_1fr] sm:gap-4">
                <dt className="text-muted-foreground text-sm">{label}</dt>
                <dd className="min-w-0 whitespace-pre-wrap break-words text-sm">{value}</dd>
              </div>
            ))}
          </dl>
          <Button size="sm" variant="outline" className="mt-4" onClick={() => setEditing(true)}>
            Edit brief
          </Button>
        </div>
      ) : (
        <div className="[&_button:empty]:hidden">
          <div className="flex justify-end px-4 pt-3">
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
          <BuildForm
            api={api}
            id="apple"
            name="Apple"
            platform={profile}
            platformName={cms.name}
            questions={questionsFor(wordpressQuestions as never, 'en') as never}
            agentSent={false}
            site={buildSite}
            job={job.current}
            t={briefTranslate}
            header={
              <BuildHeader
                id="apple"
                name="Apple"
                platformName={cms.name}
                site={buildSite}
                t={briefTranslate}
              />
            }
            onStarted={() => {
              setUpdated(true)
              setEditing(false)
            }}
          />
        </div>
      )}
    </>
  )
}

// Can comments carry enough context across site views without a chat handoff?
type CommentContext = { key: string; location: string; reason: string; kind: string }
type MockRequest = { id: string; context: CommentContext; body: string; files: string[] }

function SiteOperations({
  view,
  navigate,
  onUnansweredChange,
  profile
}: {
  view: string
  navigate: (view: string) => void
  onUnansweredChange: (count: number) => void
  profile: BuildProfile
}) {
  const [page, setPage] = useState<keyof typeof northgatePages>('Projects')
  const [block, setBlock] = useState('Elektra')
  const [language, setLanguage] = useState('EN')
  const [decision, setDecision] = useState<string | null>('Elektra figures')
  const [requests, setRequests] = useState<MockRequest[]>([])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [files, setFiles] = useState<Record<string, string[]>>({})
  const [qualityItem, setQualityItem] = useState('Contact mail')
  const [adminItem, setAdminItem] = useState('Mail delivery')
  const [undone, setUndone] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const unanswered = northgateDecisions.filter(
    ([name]) => !requests.some((r) => r.context.key === 'decision:' + name)
  ).length
  useEffect(() => onUnansweredChange(unanswered), [unanswered, onUnansweredChange])
  const cms = buildProfiles[profile]
  const blockContext: CommentContext = {
    key: `block:${page}:${block}:${language}`,
    location: `${page} / ${block} / ${language}`,
    kind: block === 'Elektra' || block === 'Projects grid' ? 'Project content' : 'Page block',
    reason:
      page === 'Shared' ? 'What should change, and on which pages?' : 'What should change in this section?'
  }
  const decisionContext = (name: string): CommentContext => ({
    key: 'decision:' + name,
    ...commentTargets[name]!
  })
  const composer = (context: CommentContext) => {
    const sent = requests.filter((r) => r.context.key === context.key)
    return (
      <div className="space-y-3 border-border border-t pt-4" data-testid="context-comment">
        <div className="flex items-start gap-2">
          <MessageSquare className="mt-0.5 size-4 shrink-0 text-primary" />
          <div className="min-w-0">
            <h3 className="font-medium">{context.location}</h3>
            <p className="mt-1 text-muted-foreground text-xs">{context.kind}</p>
          </div>
        </div>
        {sent.map((r) => (
          <div key={r.id} className="space-y-2 border-primary/40 border-l-2 pl-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground text-xs">You / just now</span>
              <Badge variant="outline">Sent</Badge>
            </div>
            <p className="whitespace-pre-wrap break-words text-sm">{r.body}</p>
            {r.files.length > 0 && (
              <p className="break-words text-muted-foreground text-xs">{r.files.join(', ')}</p>
            )}
            <p className="text-muted-foreground text-xs">Waiting for Tracy</p>
          </div>
        ))}
        <Label htmlFor={'comment-' + context.key}>Comment</Label>
        <Textarea
          id={'comment-' + context.key}
          className="min-h-28 resize-y focus:placeholder:text-transparent"
          placeholder={context.reason}
          value={drafts[context.key] ?? ''}
          onChange={(e) => setDrafts((d) => ({ ...d, [context.key]: e.target.value }))}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Attach files"
                    onClick={() => document.getElementById('files-' + context.key)?.click()}
                  />
                }
              >
                <Paperclip />
              </TooltipTrigger>
              <TooltipContent>Attach files</TooltipContent>
            </Tooltip>
            <input
              key={(files[context.key] ?? []).join('|')}
              id={'files-' + context.key}
              type="file"
              multiple
              className="hidden"
              onChange={(e) =>
                setFiles((f) => ({
                  ...f,
                  [context.key]: Array.from(e.target.files ?? []).map((file) => file.name)
                }))
              }
            />
            {(files[context.key]?.length ?? 0) > 0 && (
              <span className="text-muted-foreground text-xs">{files[context.key]!.length} attached</span>
            )}
          </div>
          <Button
            size="sm"
            disabled={!drafts[context.key]?.trim() && !files[context.key]?.length}
            onClick={() => {
              const id = 'mock-request-' + (requests.length + 1)
              setRequests((r) => [
                ...r,
                { id, context, body: drafts[context.key]?.trim() ?? '', files: files[context.key] ?? [] }
              ])
              setDrafts((d) => ({ ...d, [context.key]: '' }))
              setFiles((f) => ({ ...f, [context.key]: [] }))
            }}
          >
            <Send className="size-4" />
            Send to Tracy
          </Button>
        </div>
      </div>
    )
  }
  if (view === 'Build') return null
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-border border-b px-4 py-3">
        <h2 className="font-semibold">{view === 'Site' ? 'Preview' : viewLabel(view, unanswered)}</h2>
        <span className="text-muted-foreground text-xs">Northgate / sample</span>
      </div>
      {view === 'Decisions' && (
        <div className="divide-y divide-border">
          {northgateDecisions.map(([name, detail, kind]) => (
            <div key={name}>
              <button
                type="button"
                aria-expanded={decision === name}
                className={cn(
                  'flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/50',
                  decision === name && 'bg-muted/50'
                )}
                onClick={() => setDecision(decision === name ? null : name!)}
              >
                <MessageSquare className="mt-1 size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{name}</span>
                  <span className="mt-1 block text-muted-foreground text-xs">{detail}</span>
                </span>
                <span className="max-w-24 text-right text-muted-foreground text-xs">
                  {requests.some((r) => r.context.key === 'decision:' + name) ? 'Sent' : kind}
                </span>
                <ChevronDown className={cn('mt-1 size-3 shrink-0', decision === name && 'rotate-180')} />
              </button>
              {decision === name && (
                <div className="space-y-3 px-4 pb-4">
                  <p className="pt-3 text-muted-foreground text-xs">
                    Source: customer design / content-rules.md
                  </p>
                  {composer(decisionContext(name!))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {view === 'Pages & blocks' && (
        <>
          <div className="flex gap-2 border-border border-b p-3">
            <NativeSelect
              aria-label="Page"
              value={page}
              onChange={(e) => {
                const next = e.target.value as keyof typeof northgatePages
                setPage(next)
                setBlock(northgatePages[next][0]!)
              }}
            >
              {Object.keys(northgatePages).map((name) => (
                <NativeSelectOption key={name}>{name}</NativeSelectOption>
              ))}
            </NativeSelect>
            <NativeSelect
              aria-label="Content language"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            >
              <NativeSelectOption>EN</NativeSelectOption>
              <NativeSelectOption>RU</NativeSelectOption>
            </NativeSelect>
          </div>
          <div className="divide-y divide-border">
            {northgatePages[page].map((name, i) => (
              <Button
                key={name}
                variant="ghost"
                className={cn('h-11 w-full justify-start rounded-none px-4', block === name && 'bg-muted')}
                onClick={() => setBlock(name)}
              >
                <span className="w-4 text-muted-foreground text-xs">{i + 1}</span>
                <ListTree className="size-4" />
                {name}
                <MessageSquare className="ml-auto size-4 text-muted-foreground" />
              </Button>
            ))}
          </div>
          <div className="space-y-4 p-4">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => navigate('Site')}>
                <Monitor />
                Preview block
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setAdminItem('Current content')
                  navigate('Admin')
                }}
              >
                <ExternalLink />
                Admin
              </Button>
            </div>
            {composer(blockContext)}
          </div>
        </>
      )}
      {view === 'Quality' && (
        <div className="space-y-4 p-4">
          <p className="text-muted-foreground text-xs">
            Sample report / project heading change / EN / desktop + mobile
          </p>
          <div className="divide-y divide-border">
            {['Links and language switcher', 'Mobile layout', 'Dark theme', 'Contact mail'].map((name) => (
              <button
                key={name}
                type="button"
                className={cn(
                  'flex w-full items-center justify-between gap-3 px-2 py-3 text-left',
                  qualityItem === name && 'bg-muted/50'
                )}
                onClick={() => setQualityItem(name)}
              >
                <span>{name}</span>
                <Badge variant="outline">
                  {name === 'Contact mail' ? 'Unverified' : undone ? 'Outdated' : 'Passed'}
                </Badge>
              </button>
            ))}
          </div>
          {composer(
            qualityItem === 'Contact mail'
              ? decisionContext('Contact mail')
              : {
                  key: 'quality:sample-change-001:' + qualityItem,
                  location: 'Quality / ' + qualityItem + ' / sample-change-001',
                  kind: 'Check feedback',
                  reason: 'What still looks wrong? You can attach a screenshot.'
                }
          )}
        </div>
      )}
      {view === 'Changes' && (
        <div className="divide-y divide-border">
          {undone && (
            <div className="space-y-1 p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-medium">Restored Elektra heading</h3>
                <Badge variant="outline">Completed</Badge>
              </div>
              <p className="text-muted-foreground text-xs">Just now / You / Undo</p>
              <p className="text-sm">Elektra appliance plant → Elektra project</p>
            </div>
          )}
          <div>
            <button
              type="button"
              aria-expanded={showDetails}
              onClick={() => setShowDetails(!showDetails)}
              className="flex w-full items-start gap-3 p-4 text-left hover:bg-muted/50"
            >
              <History className="mt-1 size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">Updated Elektra heading</span>
                <span className="mt-1 block text-muted-foreground text-xs">
                  Today, 10:42 / Tracy / 1 field
                </span>
              </span>
              <Badge variant="outline">{undone ? 'Undone' : 'Completed'}</Badge>
              <ChevronDown className={cn('mt-1 size-3 shrink-0', showDetails && 'rotate-180')} />
            </button>
            {showDetails && (
              <div className="space-y-4 px-4 pb-4">
                <p className="text-muted-foreground text-xs">Projects / Elektra / English / Heading</p>
                <div className="grid gap-4 border-border border-y py-4">
                  <div>
                    <p className="text-muted-foreground text-xs">Before</p>
                    <p className="mt-1">Elektra project</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">After</p>
                    <p className="mt-1">Elektra appliance plant</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setPage('Projects')
                      setBlock('Elektra')
                      setLanguage('EN')
                      navigate('Site')
                    }}
                  >
                    <Monitor />
                    Preview
                  </Button>
                  <Button size="sm" variant="ghost" disabled={undone} onClick={() => setUndone(true)}>
                    <History />
                    Undo
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {view === 'Admin' && (
        <div className="space-y-4 p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-medium">{cms.name} administration</h3>
            <Tooltip>
              <TooltipTrigger
                render={<Button size="icon-sm" variant="ghost" aria-label="Open CMS admin" disabled />}
              >
                <ExternalLink />
              </TooltipTrigger>
              <TooltipContent>Admin connection unavailable in mockup</TooltipContent>
            </Tooltip>
          </div>
          <div className="divide-y divide-border">
            {['Current content', 'Navigation', 'Mail delivery', 'Extensions'].map((name) => (
              <button
                type="button"
                key={name}
                className={cn(
                  'flex w-full items-center justify-between p-3 text-left',
                  adminItem === name && 'bg-muted/50'
                )}
                onClick={() => setAdminItem(name)}
              >
                <span>{name}</span>
                <MessageSquare className="size-4 text-muted-foreground" />
              </button>
            ))}
          </div>
          {composer(
            adminItem === 'Mail delivery'
              ? decisionContext('Contact mail')
              : {
                  key: 'admin:' + adminItem + (adminItem === 'Current content' ? ':' + blockContext.key : ''),
                  location:
                    adminItem === 'Current content' ? blockContext.location : cms.name + ' / ' + adminItem,
                  kind: adminItem === 'Current content' ? blockContext.kind : 'Site configuration',
                  reason:
                    adminItem === 'Extensions'
                      ? 'What feature do you need?'
                      : adminItem === 'Navigation'
                        ? 'What should change in the menu?'
                        : 'What should Tracy change here?'
                }
          )}
          <p className="text-muted-foreground text-xs">Direct CMS access is not connected in this mockup.</p>
        </div>
      )}
      {view === 'Site' && (
        <div className="space-y-4 p-4">
          <Badge variant="outline">Block preview / sample / {language}</Badge>
          <div className="space-y-4 border-primary border-l-2 py-6 pl-4">
            <p className="text-muted-foreground text-xs">
              {page} / {block}
            </p>
            <h3 className="font-semibold text-2xl">
              {block === 'Elektra' ? (undone ? 'Elektra project' : 'Elektra appliance plant') : block}
            </h3>
            {block === 'Elektra' && <p className="text-muted-foreground">19 days early / 19 months</p>}
          </div>
          {composer(blockContext)}
          <Button size="sm" variant="ghost" onClick={() => navigate('Pages & blocks')}>
            <ArrowLeft />
            Back to blocks
          </Button>
        </div>
      )}
    </div>
  )
}

const meta: Meta<typeof BuildParent> = {
  title: 'Mockups/Build parent',
  component: BuildParent,
  parameters: { layout: 'fullscreen' }
}
export default meta
type Story = StoryObj<typeof BuildParent>
export const Joomla: Story = { args: { profile: 'joomla' } }
export const WordPress: Story = { args: { profile: 'wordpress' } }
export const EmDash: Story = { args: { profile: 'emdash' } }
export const OptionB: Story = {
  name: 'Option B - tab dropdown',
  args: { profile: 'joomla' }
}
