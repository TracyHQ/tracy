/**
 * The Build tab of `@tracy/dsh-site-build` — the form a customer answers before anything is built —
 * DRAWN FROM THE PLUGIN'S OWN CODE, not redrawn. `BuildForm`, `BuildTab` and the header come from
 * `packages/site/tracy-site-build-core/src/client`; every word comes from the WordPress plugin's `strings.ts` or
 * from `@tracy/dsh-tracy-locale-vi`; the header thumbnail and the skeleton are the real
 * `components.html` of the inspiration under `vendor/tracy/od-design-system`.
 *
 * WHY IT EXISTS. The screen only appears on a lane, at the end of a chain nobody can hold still:
 * pick an inspiration → press Create with WordPress → the agent writes questions → the tab opens
 * with them. Four of its states cannot be reached on demand there at all (the agent sent nothing;
 * the engine came back for two missing answers; the six stages running; the site built). Here each
 * one is a story, so the form can be reshaped without a lane, an agent, or a build.
 *
 * WHAT IS STUBBED, and only this: the doors. `site-build.doors.ts` answers
 * `/api/tracy-site-build-wordpress/…` plus the two Worker doors the press goes through, and
 * `design-inspirations.doors.ts` answers `/api/tracy-design-inspiration/…`. Nothing inside the
 * components is replaced.
 *
 * ⚠ MODE B, not A. This is a plugin living inside dsh's page: it carries no reset, and its colours
 * are `@tracy/ui` tokens which map onto `--dsw-alias-*` on a lane. The bench renders it on Tailwind
 * because the bench owns `<html>` — so a class that only exists in this plugin has to be scanned
 * from `src/style.css` (`@source .../tracy-site-build-core/src/client`), or it silently renders bare.
 * `DESIGN.md` §0.
 *
 * THE SIDE CARD IS 520px WIDE on a lane (better-sidebar's panel). Every story is framed at that
 * width — a form that only looks right at 900px is a form nobody will see.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'
import { type JSX, useEffect, useMemo, useRef, useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import viBuild from '../../../../../locale/tracy-locale-vi/vi/tracy-site-build-wordpress.json'
import { makeApi, type Question } from '../../../../../site/tracy-site-build-core/src/client/api'
import { BuildForm } from '../../../../../site/tracy-site-build-core/src/client/BuildForm'
import {
  BuildHeader,
  BuildTab,
  type TabSpec
} from '../../../../../site/tracy-site-build-core/src/client/BuildTab'
import { parkComposer } from '../../../../../site/tracy-site-build-core/src/client/composer'
import { LiveSiteTab } from '../../../../../site/tracy-site-build-core/src/client/LiveSiteTab'
import type { Translate } from '../../../../../site/tracy-site-build-core/src/client/strings'
import { questionsFor } from '../../../../../site/tracy-site-build-core/src/questions.mjs'
import wordpressQuestions from '../../../../../site/tracy-site-build-wordpress/questions.json'
import { en as buildEn } from '../../../../../site/tracy-site-build-wordpress/src/client/strings'
import { installDoors, SITE } from './design-inspirations.doors'
import { freshJob, installBuildDoors, waitingJob } from './site-build.doors'

const meta: Meta = {
  title: 'Pages/In dsh/Build tab',
  parameters: { layout: 'fullscreen' }
}
export default meta
type Story = StoryObj

/** The browser transport is observed here; the controls and polling are the shipped component. */
export const LiveSiteUpdates: Story = {
  render: function LiveSiteStory() {
    const job = useRef({
      ...freshJob('apple', 'joomla'),
      targetSiteKey: 'new.example',
      targetUrl: 'https://new.example/',
      startedAt: 'initial',
      stages: [{ name: 'seed', status: 'running' as const }]
    })
    const api = useMemo(() => ({ ...API, fetchJob: async () => job.current }), [])
    return (
      <div className="bg-background text-foreground" style={{ width: 520, height: 500 }}>
        <button
          type="button"
          onClick={() => {
            job.current = { ...job.current, startedAt: 'updated' }
          }}
        >
          Advance build
        </button>
        <LiveSiteTab
          api={api}
          siteKey="new.example"
          t={en}
          browserProps={{
            tab: { id: 'live-one', type: 'live', title: 'Live site' },
            scope: { sessionId: 'owner' },
            visible: true
          }}
          browser={({ tab }) => (
            <div data-testid="browser-surface">
              <p>{tab.path}</p>
              <output>{String((tab.meta as { reloadNonce?: string }).reloadNonce)}</output>
            </div>
          )}
        />
      </div>
    )
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const surface = await canvas.findByTestId('browser-surface')
    await waitFor(() => expect(surface).toHaveTextContent('initial'))
    await expect(canvas.getByRole('link', { name: 'Open site' })).toHaveAttribute(
      'href',
      'https://new.example/'
    )
    await userEvent.click(canvas.getByRole('checkbox', { name: 'Update automatically' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Advance build' }))
    await expect(surface).toHaveTextContent('initial')
    await userEvent.click(canvas.getByRole('checkbox', { name: 'Update automatically' }))
    await waitFor(() => expect(surface).toHaveTextContent('updated'), { timeout: 4000 })
  }
}

// ─── The dictionary, as dsh hands it to the plugin ────────────────────────────────────────────

const lookup =
  (dict: Record<string, string>) =>
  (key: string, params?: Record<string, string | number>): string =>
    (dict[key] ?? key).replace(/\{(\w+)\}/g, (m, name: string) =>
      params && name in params ? String(params[name]) : m
    )
const en = lookup(buildEn as Record<string, string>) as Translate
const vi = lookup(viBuild as Record<string, string>) as Translate

// ─── What the customer arrived with ───────────────────────────────────────────────────────────

/** The inspiration and platform the URL carries on a lane: `?inspiration=airbnb&platform=wordpress`. */
const ID = 'airbnb'
const NAME = 'Airbnb'
const PLATFORM = 'wordpress'
const PLATFORM_NAME = 'WordPress'
/** The WordPress plugin's api, against the doors this bench installs (`site-build.doors.ts`). */
const API = makeApi({
  name: 'tracy-site-build-wordpress',
  stages: ['check', 'theme', 'style', 'copy', 'seed', 'shot']
})
const SPEC: TabSpec = {
  api: API,
  platform: PLATFORM,
  platformName: PLATFORM_NAME
}

/**
 * A form the AGENT wrote, of the shape it sends: its own words, its own options, and two questions
 * the standard six do not ask. Kept close to what an agent actually sent lucaswp on 07/09 — the
 * point of the story is that a form the tab did not author still lays out.
 */
const AGENT_QUESTIONS: Question[] = [
  { id: 'name', label: 'What is the place called?', kind: 'text', hint: 'Casa Lucia' },
  {
    id: 'about',
    label: 'Who stays with you, and what do they come for?',
    kind: 'text',
    hint: 'Two sentences is plenty — it becomes the first thing a guest reads.'
  },
  {
    id: 'rooms',
    label: 'What can a guest book?',
    kind: 'multi',
    options: ['whole house', 'private room', 'studio', 'long stay'],
    hint: 'Each one becomes a card on the home page.'
  },
  {
    id: 'pages',
    label: 'Pages you want',
    kind: 'multi',
    options: ['home', 'listing', 'article', 'pricing', 'contact'],
    hint: 'Home is always there.'
  },
  { id: 'tone', label: 'How should it read?', kind: 'choice', options: ['plain', 'warm', 'bold'] },
  {
    id: 'season',
    label: 'When are you open?',
    kind: 'text',
    hint: 'All year · May to October · weekends only'
  },
  { id: 'contact', label: 'How does a guest reach you?', kind: 'text', hint: 'email · phone · address' },
  {
    id: 'label',
    label: 'Address for the new site',
    kind: 'text',
    hint: 'Tracy builds it from the name; you can change it.'
  }
]

// ─── The frame: the side card, at the width a lane gives it ───────────────────────────────────

function Panel({ children }: { children: JSX.Element }): JSX.Element {
  return (
    <div className="mx-auto h-dvh max-w-[520px] overflow-y-auto border-border border-x bg-background">
      {children}
    </div>
  )
}

/**
 * Install both sets of doors before the first render, and park a composer so the three buttons
 * behave as they do with a chat session open — `agentReachable()` is false otherwise and every
 * press comes back with "Open a chat session first".
 */
function useDoors(next: Parameters<typeof installBuildDoors>[0]): boolean {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    installDoors(SITE)
    installBuildDoors(next)
    parkComposer({
      setDraft: (text) => console.log('[bench] composer draft:', text),
      submit: () => console.log('[bench] composer submit')
    })
    setReady(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the doors are installed per story
  }, [])
  return ready
}

/** One story: the whole tab, on doors — the four screens follow each other as they do on a lane. */
function Tab(props: { t: Translate } & Parameters<typeof installBuildDoors>[0]): JSX.Element {
  const { t, ...doors } = props
  const ready = useDoors(doors)
  if (!ready) return <div />
  return (
    <Panel>
      <div className="tracy-site-build h-full overflow-y-auto text-foreground text-sm">
        <BuildTab spec={SPEC} meta={{ id: ID, name: NAME, platform: PLATFORM }} t={t} />
      </div>
    </Panel>
  )
}

/** One story: the form alone, at a state the tab reaches only after an agent or an engine spoke. */
function Form({
  t,
  questions,
  agentSent,
  job
}: {
  t: Translate
  questions: Question[]
  agentSent: boolean
  job?: Parameters<typeof BuildForm>[0]['job']
}): JSX.Element {
  const ready = useDoors({ job: job ?? null })
  if (!ready) return <div />
  return (
    <Panel>
      <div className="tracy-site-build h-full overflow-y-auto text-foreground text-sm">
        <BuildForm
          api={API}
          id={ID}
          name={NAME}
          platform={PLATFORM}
          platformName={PLATFORM_NAME}
          questions={questions}
          agentSent={agentSent}
          site={SITE}
          job={job ?? null}
          t={t}
          header={<BuildHeader id={ID} name={NAME} platformName={PLATFORM_NAME} site={SITE} t={t} />}
          onStarted={() => undefined}
        />
      </div>
    </Panel>
  )
}

// ─── The stories ──────────────────────────────────────────────────────────────────────────────

/**
 * THE ONE TO LOOK AT FIRST. The standard six, which is what a customer sees whenever the agent sent
 * nothing of its own — seven boxes counting the site address, three ways out at the bottom.
 */
export const StandardQuestions: Story = {
  render: () => (
    <Form t={en} questions={questionsFor(wordpressQuestions as never, 'en') as never} agentSent={false} />
  )
}

/** The form the agent wrote: its own words and two questions the standard six do not ask. */
export const AgentQuestions: Story = {
  render: () => <Form t={en} questions={AGENT_QUESTIONS} agentSent />
}

/**
 * The engine came back for what it could not do without — `waiting: form:name,about`, the only two
 * it ever asks for (`stages.mjs`, stage `copy`). A ring goes on those boxes, a notice replaces the
 * step bars, and Send answer becomes Continue.
 *
 * 🔒 THIS ONE IS NOT STEPPED, and that is the point of keeping it as a story: a form the customer
 * is being sent back to must show every box at once, so they can see what they already said.
 */
export const MissingAnswers: Story = {
  render: () => (
    <Form
      t={en}
      questions={questionsFor(wordpressQuestions as never, 'en') as never}
      agentSent={false}
      job={waitingJob(ID, PLATFORM, ['name', 'about'])}
    />
  )
}

/**
 * The tab opened before the agent said anything — the first thing a customer sees after pressing
 * Create with WordPress. "Use the standard questions" walks past it into the form above.
 */
export const WaitingForTheAgent: Story = {
  render: () => <Tab t={en} ask={null} job={null} />
}

/**
 * The whole tab on the agent's form: press Send answer and the doors walk the six stages, so the
 * skeleton, the progress bar and the Built screen are reviewable without a lane.
 */
export const WholeTab: Story = {
  render: () => (
    <Tab
      t={en}
      ask={{ at: new Date().toISOString(), inspiration: ID, platform: PLATFORM, questions: AGENT_QUESTIONS }}
    />
  )
}

/** The six stages running, on the inspiration's own layout filling in. */
export const Building: Story = {
  render: () => <Tab t={en} job={freshJob(ID, PLATFORM)} />
}

/** The same form in Vietnamese — the language most of these customers read. */
export const Vietnamese: Story = {
  render: () => (
    <Form t={vi} questions={questionsFor(wordpressQuestions as never, 'vi') as never} agentSent={false} />
  )
}
