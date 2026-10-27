/**
 * `@tracy/dsh-assistant` — Tracy Help: `/help <question>` typed in the agent's chat, answered by
 * tracy-web without the agent (tasks/todo-lenh-help.md). Until 07/10/2026 this was a floating
 * "AI Assistant" button with a chat panel of its own.
 *
 * HOW IT REACHES THE COMPOSER. dsh's client commands (`commandUi`, the same service `/model` uses)
 * run in the browser and never become an agent message. This plugin registers one action command,
 * `help`, that takes text: the composer consumes the whole `/help …` line, hands the text here, and
 * the agent receives nothing — not while it is idle, not while it is thinking or writing. That
 * argued-line behaviour is the fork patch `feat/tracy-command-text` (`TRACY-FORK.md`).
 *
 * HOW THE ANSWER SHOWS. The question and its answer are rows of dsh's client-local transcript
 * (`chatLocal`): drawn among the agent's rows in the order they happened, never written to the
 * session log, the export or the agent's context. `help.ts` owns the rows and the queue,
 * `HelpNode.tsx` draws one. A finished answer ends with dsh's own action row
 * (`chatLocal.AnswerActions`, fork tracy.42): copy, the thumbs stored by tracy-web, branch, the clock.
 *
 * Everything Help knows and every link it may offer is decided by tracy-web
 * (`apps/tracy-web/src/assistant/`). The operator's switch is `ai-assistant`
 * (`@tracy/core/ui-switches`): off, `help` leaves the menu and `/help …` is an ordinary message.
 */
import { tracyWebFetch } from '@tracy/core/web-path'
import { draftActions, draftIsCurrent, latestDraftTurn } from './onboarding'
import { inputActivity } from '@tracy/core/input-activity'
import { ActivityPieces } from '@tracy/core/input-activity/react'
import { uiSwitches } from '@tracy/core/ui-switches'
import { type ComponentType, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react'
import { keepDockFitted, fitDock, scrollerOf } from './dock-fit'
import { type PhaseSession, transcriptHidden } from './dock-phase'
import { type AnswerActionsProps, type FeedbackLabels, HelpNode } from './HelpNode'
import { HelpStop } from './HelpStop'
import {
  controllerOf,
  HELP_KIND,
  helpFor,
  type HelpData,
  isExchange,
  type LocalRows,
  sentFilesOf,
  startPressOf
} from './help'
import { publishChatFiles, uploadFile } from './files'
import { siteOfPage } from './chat'
import { en, NS, type Translate } from './strings'
import { CSS } from './styles'
import { OnboardingComposer } from './OnboardingComposer'
import { StartRow, type StartAction } from './StartRow'

/** The operator's switch (`catalogue.json`). */
const SWITCH_ID = 'ai-assistant'
/** Help in the creation workspace belongs to the account, independently of an agent session. */
const ONBOARDING_HELP = 'tracy-onboarding-help'

interface SessionContext {
  readonly sessionId: string
}

interface CommandUi {
  register(contribution: {
    name: string
    caseInsensitive?: boolean
    label?(): string
    description?(): string
    available(session: SessionContext): boolean
    ui: {
      kind: 'action'
      takesText?: boolean
      hint?(): string
      run(session: SessionContext, text?: string): void
    }
  }): () => void
}

interface ChatLocal {
  /** dsh's answer action row (fork tracy.42); absent on an older dsh. */
  readonly AnswerActions?: ComponentType<AnswerActionsProps>
  for(sessionId: string): {
    upsert(input: { id: string; kind: string; anchorSeq: number; data: unknown; exchange?: boolean }): void
    remove(id: string): void
    tailSeq(): number
    nodes: {
      subscribe(listener: () => void): () => void
      getSnapshot(): readonly { key: string; kind: string; data: unknown }[]
    }
  }
}

interface SlotsService {
  register(spec: Record<string, unknown>, component: unknown): () => void
  inject(name: string, fn: () => () => void): void
}

interface Scope {
  effect(fn: () => (() => void) | void, label?: string): void
  get(name: string): unknown
}

export const inject = ['slots', 'locale', 'commandUi', 'sessions', 'chatLocal']

export function apply(
  ctx: Scope & {
    slots: SlotsService
    locale: {
      register(namespace: string, dictionaries: Record<string, Record<string, string>>): unknown
      bind(namespace: string): Translate
      subscribe(listener: () => void): () => void
    }
    commandUi: CommandUi
    chatLocal: ChatLocal
    sessions: { subagentAddress(sessionId: string): unknown }
  }
): void {
  ctx.effect(() => ctx.locale.register(NS, { en }) as (() => void) | void, 'tracy-assistant: dictionaries')

  ctx.effect(() => {
    const id = 'tracy-assistant-css'
    if (document.getElementById(id)) return
    const style = document.createElement('style')
    style.id = id
    style.textContent = CSS
    document.head.appendChild(style)
    return () => style.remove()
  }, 'tracy-assistant: styles')

  // A native widget has its own import conversation and must keep its agent composer.
  const onboarding =
    !document.querySelector('meta[name="tracy-widget-native"]') &&
    (siteCreationPage(document.baseURI) ||
      document.querySelector('meta[name="tracy-chat-input-audience"]')?.getAttribute('content') ===
        'onboarding')
  // chat-input opens the matching tab (onboarding-start.ts); the question lets Create preselect a platform.
  const startFrom = (
    action: StartAction | 'business',
    question: string,
    platform?: string,
    draft?: Record<string, unknown>
  ) => {
    window.dispatchEvent(
      new CustomEvent('tracy:onboarding-start', {
        detail: {
          action,
          question,
          ...(platform ? { platform } : {}),
          ...(draft ? { chatDraft: draft } : {})
        }
      })
    )
  }
  // A start action pressed in an answer (`tracy-action:` link, HelpNode.tsx): the same event as a card.
  const prepareAction = draftActions(tracyWebFetch)
  const onAction = onboarding
    ? async (href: string, turn?: HelpData) => {
        const press = startPressOf(href)
        if (!press) return
        // The wizard's design step keeps the chat draft while the customer chooses a template.
        const intent = press.action === 'templates' ? { action: 'create' as const } : press
        if (!turn) throw new Error('DRAFT_CHANGED')
        const rows = () => ctx.chatLocal.for(turn.sessionId).nodes.getSnapshot()
        const latest = latestDraftTurn(rows(), turn.sessionId)
        if (!latest) throw new Error('DRAFT_CHANGED')
        const current = () => draftIsCurrent(rows(), latest)
        const draft = await prepareAction(latest, intent, current)
        startFrom(
          intent.action,
          '',
          typeof draft.platform === 'string' ? draft.platform : press.platform,
          draft
        )
      }
    : undefined
  const switches = uiSwitches()
  const t = ctx.locale.bind(NS)
  // The thumbs carry the words dsh gives an agent reply's (its `feedback` namespace, translated in every
  // interface language), so the two rows read the same.
  const feedbackT = ctx.locale.bind('feedback') as unknown as (key: string) => string
  const feedbackLabels = (): FeedbackLabels => ({
    like: feedbackT('action.like'),
    likeActive: feedbackT('action.likeActive'),
    dislike: feedbackT('action.dislike'),
    dislikeActive: feedbackT('action.dislikeActive')
  })
  const shownFor = (session: SessionContext) =>
    switches.isShown(SWITCH_ID) && ctx.sessions.subagentAddress(session.sessionId) === undefined

  /** The controller of one session: its rows are dsh's local rows of that session. */
  const helpOf = (sessionId: string) => {
    const local = ctx.chatLocal.for(sessionId)
    const rows: LocalRows = {
      upsert: (input) => local.upsert(input),
      remove: (id) => local.remove(id),
      tailSeq: () => local.tailSeq()
    }
    return helpFor({
      sessionId,
      showTip: () => !onboarding,
      // The creation workspace: answers may offer the start actions as text to press.
      start: () => onboarding,
      rows,
      fetch: (input, init) => fetch(input, init),
      site: () => siteOfPage(document.baseURI),
      transcriptShown: () => transcriptOpen.get(sessionId) === true,
      report: {
        t,
        env: () => ({
          userAgent: navigator.userAgent,
          now: new Date(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        })
      }
    })
  }

  ctx.effect(
    () =>
      ctx.commandUi.register({
        name: 'help',
        // `/Help` and `/HELP` run the same command; the text after the name is kept as typed.
        caseInsensitive: true,
        label: () => t('command.label'),
        description: () => t('command.description'),
        available: shownFor,
        ui: {
          kind: 'action',
          takesText: true,
          // Picking help in the / menu (or typing "/help ") keeps a marked /help token in the chat box
          // and this ghost text after it until the person types (fork tracy.39: text-taking claim).
          hint: () => t('command.hint'),
          // dsh's chat box takes the keyboard back by itself once the argued line is handled (fork tracy.24).
          run: (session, text) => {
            helpOf(onboarding ? ONBOARDING_HELP : session.sessionId).ask(text ?? '')
          }
        }
      }),
    'tracy-assistant: /help command'
  )

  // The bar slot is the supported host extension point. Only this page registers a Help-only
  // replacement, so no ordinary draft can fall through to the site agent, even with Help switched off.
  if (onboarding) {
    const Composer = () => {
      const sessionId = ONBOARDING_HELP
      const enabled = useSyncExternalStore(switches.subscribe, () => switches.isShown(SWITCH_ID))
      const local = sessionId ? ctx.chatLocal.for(sessionId) : undefined
      const hasQuestion = useSyncExternalStore(
        (listener) => local?.nodes.subscribe(listener) ?? (() => {}),
        () =>
          local?.nodes.getSnapshot().some((node) => {
            const data = node.data as HelpData
            return (
              node.kind === HELP_KIND &&
              data.sessionId === sessionId &&
              data.variant === 'turn' &&
              (data.question.trim() !== '' || (data.files?.length ?? 0) > 0)
            )
          }) ?? false
      )
      // The question of the latest finished answer, as the buttons under that answer used to carry it.
      const answered = useSyncExternalStore(
        (listener) => local?.nodes.subscribe(listener) ?? (() => {}),
        () => latestAnsweredQuestion(local?.nodes.getSnapshot() ?? EMPTY, sessionId)
      )
      // The files sent in this chat, for a step opened from the page (Add site's logo question).
      useEffect(() => {
        if (!sessionId) return
        const rows = ctx.chatLocal.for(sessionId)
        const sync = () => publishChatFiles(sentFilesOf(rows.nodes.getSnapshot(), sessionId))
        sync()
        return rows.nodes.subscribe(sync)
      }, [sessionId])
      return (
        <>
          <Boot sessionId={sessionId} />
          <OnboardingComposer
            key={sessionId}
            t={t}
            hasQuestion={hasQuestion}
            startRow={<StartRow t={t} onStart={(action) => startFrom(action, answered)} />}
            enabled={enabled}
            activity={
              <HelpStop
                sessionId={sessionId}
                local={sessionId ? ctx.chatLocal.for(sessionId) : undefined}
                t={t}
              />
            }
            ask={(text, files) => {
              if (enabled) helpOf(sessionId).ask(text, files)
            }}
            upload={(file) => uploadFile(file, sessionId)}
          />
        </>
      )
    }
    ctx.slots.inject('conversation.composer.bar', () =>
      ctx.slots.register({ name: 'conversation.composer.bar', priority: -20, locale: NS }, Composer)
    )
  }

  // The chat box's hint starts with "/help …": a custom property the stylesheet puts in front of
  // dsh's own placeholder (a Viewer's chat box). Every other chat box shows one whole Tracy sentence
  // that names /help inside it (Akemi 14/10/2026), set as a second property with a mark on <html>
  // that tells the stylesheet to hide dsh's words there. Both follow the interface language and the
  // operator's switch.
  ctx.effect(() => {
    const root = document.documentElement
    const sync = () => {
      if (switches.isShown(SWITCH_ID)) {
        root.style.setProperty('--tv-help-hint', JSON.stringify(t('placeholder.prefix')))
        root.style.setProperty('--tv-help-hero-hint', JSON.stringify(t('placeholder.hero')))
        root.setAttribute('data-tv-help-hero', '')
      } else {
        root.style.removeProperty('--tv-help-hint')
        root.style.removeProperty('--tv-help-hero-hint')
        root.removeAttribute('data-tv-help-hero')
      }
    }
    sync()
    const offSwitch = switches.subscribe(sync)
    const offLocale = ctx.locale.subscribe(sync)
    return () => {
      offSwitch()
      offLocale()
      root.style.removeProperty('--tv-help-hint')
      root.style.removeProperty('--tv-help-hero-hint')
      root.removeAttribute('data-tv-help-hero')
    }
  }, 'tracy-assistant: composer hint')

  // One Help row of the transcript, drawn by dsh's chat-node slot under the local kind.
  const Node = (props: { node: { data: HelpData; anchorSeq?: number }; t: Translate }) => (
    <HelpNode
      {...props}
      onboarding={onboarding}
      onAction={onAction}
      Actions={ctx.chatLocal.AnswerActions}
      feedbackLabels={feedbackLabels}
    />
  )
  ctx.slots.inject('conversation.chat.node', () =>
    ctx.slots.register({ name: 'conversation.chat.node', key: 'tracy-help', locale: NS }, Node)
  )

  // A session-scoped occupant in the dock above the composer. It does two things:
  //  1. when the session opens, it brings back that session's earlier Help rows (and, once per
  //     account, the tip): one request per session open, no polling;
  //  2. while the session is still BLANK (the start screen, no transcript is drawn yet), it draws
  //     the Help rows itself, because dsh's transcript is not mounted there and a row drawn only
  //     into it would be swallowed. Once the first message makes a transcript, the same rows are
  //     drawn there and this occupant draws nothing.
  const Boot = ({
    sessionId,
    session,
    useConversation
  }: {
    sessionId?: string
    session?: PhaseSession
    useConversation?: <T>(selector: (snapshot: { activeTargets: ReadonlySet<string> }) => T) => T
  }) => {
    // dsh's own rule for "no transcript yet" (dock-phase.ts): `blank` alone is not it.
    const activeTargets = useConversation ? useConversation((snapshot) => snapshot.activeTargets.size) : 0
    const hidden = onboarding || transcriptHidden(session, activeTargets)
    // Whether this session's chat has begun, for a bare /help (help.ts: suggestions on the start
    // screen, a one-sentence reply after). The moment a transcript appears, the person has sent
    // something to the agent: the start screen's suggestions are taken away. Help questions never
    // open the transcript (they touch neither the session nor its conversation targets).
    useLayoutEffect(() => {
      if (!sessionId || !session) return
      transcriptOpen.set(sessionId, !hidden)
      if (!hidden) controllerOf(sessionId)?.dropGreeting()
    }, [sessionId, session === undefined, hidden])
    restoreOnce(sessionId, () => {
      if (sessionId && (onboarding ? switches.isShown(SWITCH_ID) : shownFor({ sessionId })))
        void helpOf(sessionId).restore()
    })
    const local = sessionId ? ctx.chatLocal.for(sessionId) : undefined
    const rows = useSyncExternalStore(
      (listener) => local?.nodes.subscribe(listener) ?? (() => {}),
      () => local?.nodes.getSnapshot() ?? EMPTY
    )
    // The start screen keeps the newest row in view: the dock is a scrollable strip, so a new
    // answer would otherwise sit below the fold. Only while the person is at the bottom: one who
    // scrolled up to read is left where they are.
    const box = useRef<HTMLDivElement | null>(null)
    const atBottom = useRef(true)
    const mine = rows.filter(
      (row) => row.kind === 'tracy-help' && (!onboarding || (row.data as HelpData)?.variant !== 'tip')
    )
    const showing = hidden && mine.length > 0
    const conversation =
      onboarding &&
      mine.some((row) => {
        const data = row.data as HelpData
        return data.variant === 'turn' && (data.question.trim() !== '' || (data.files?.length ?? 0) > 0)
      })
    // The strip gives back the room the chat box needs (dock-fit.ts): before paint when a row is
    // added, and again whenever the room around it changes. Following the newest row happens in the
    // same task, right after the fit, before anything is painted. Until 10/10/2026 it was a passive
    // effect of its own: it ran after a paint, before the resize observer's first refit and before the
    // scroll event of the fit's measure, which then marked the person as scrolled up, so the strip
    // opened at its top and later rows stopped following (with fitDock keeping the place, that event
    // is harmless; the follow stays here so a new row is never painted below the edge first).
    useLayoutEffect(() => {
      const el = box.current
      if (!el) return
      if (!conversation) fitDock(el)
      const scroll = conversation ? (scrollerOf(el) ?? el) : el
      if (atBottom.current) scroll.scrollTop = scroll.scrollHeight
    }, [rows, showing, conversation])
    useEffect(() => {
      const el = box.current
      if (!el || !showing) return
      if (!conversation) return keepDockFitted(el)
      const scroll = scrollerOf(el) ?? el
      const track = () => {
        atBottom.current = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 24
      }
      const follow = () => {
        if (atBottom.current) scroll.scrollTop = scroll.scrollHeight
      }
      scroll.addEventListener('scroll', track)
      const watch = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(follow)
      watch?.observe(el)
      watch?.observe(scroll)
      return () => {
        scroll.removeEventListener('scroll', track)
        watch?.disconnect()
      }
    }, [showing, conversation])
    if (!showing) return null
    return (
      <div
        className="tv-help-dock"
        ref={box}
        onScroll={(event) => {
          const el = event.currentTarget
          atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
        }}
      >
        {/* Each row in a flow item of its own, as in the transcript, so dsh's rule of which answer keeps
            its action row out holds on the start screen too. Nothing to branch before the chat begins. */}
        {mine.map((row) => (
          <div
            key={row.key}
            data-chat-flow-kind={row.kind}
            data-chat-local=""
            data-chat-exchange={isExchange((row.data ?? {}) as HelpData) ? '' : undefined}
          >
            <HelpNode
              node={row as unknown as { data: HelpData }}
              t={t}
              Actions={ctx.chatLocal.AnswerActions}
              feedbackLabels={feedbackLabels}
              branchable={false}
              onboarding={onboarding}
              onAction={onAction}
            />
          </div>
        ))}
      </div>
    )
  }
  // The chat box's own round button turns into stop while a Help answer is being written (HelpStop.tsx).
  // Its seat, dsh's `conversation.input.activity`, renders only its lowest-priority registration (#1379).
  // The stop goes into the page's `@tracy/core/input-activity` list; `@tracy/dsh-chat-input`'s
  // microphone (-1) draws that list after itself. Our own registration at the default priority draws
  // the same list on a profile without chat-input, and never renders beside it, so the stop is drawn once.
  const Stop = ({ sessionId }: { sessionId?: string }) => (
    <HelpStop sessionId={sessionId} local={sessionId ? ctx.chatLocal.for(sessionId) : undefined} t={t} />
  )
  ctx.effect(() => inputActivity().add('tracy-help-stop', Stop), 'tracy-assistant: help stop')
  ctx.slots.inject('conversation.input.activity', () =>
    ctx.slots.register({ name: 'conversation.input.activity', locale: NS }, ActivityPieces)
  )

  ctx.slots.inject('conversation.input.dock', () =>
    ctx.slots.register(
      { name: 'conversation.input.dock', id: 'tracy-help-restore', order: 95, locale: NS },
      onboarding ? () => null : Boot
    )
  )
}

/** The question of the latest successfully answered Help turn of `sessionId`, or ''. */
function latestAnsweredQuestion(
  rows: readonly { kind: string; data: unknown }[],
  sessionId: string | undefined
): string {
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i]!
    const data = row.data as HelpData | undefined
    if (
      row.kind === HELP_KIND &&
      data !== undefined &&
      data.sessionId === sessionId &&
      data.variant === 'turn' &&
      data.status === 'done' &&
      data.answer !== '' &&
      !data.error
    )
      return data.question
  }
  return ''
}

const EMPTY: readonly never[] = []

/** Run `restore` once per session id the occupant is mounted for. */
function restoreOnce(sessionId: string | undefined, restore: () => void): void {
  if (sessionId && !restored.has(sessionId)) {
    restored.add(sessionId)
    // Out of render: the first paint of the transcript does not wait for it.
    queueMicrotask(restore)
  }
}

/** Sessions whose Help rows were already asked for in this page. */
const restored = new Set<string>()

/** Per session: whether dsh draws its transcript (the chat has begun), as the dock last saw it. */
const transcriptOpen = new Map<string, boolean>()

/** The page base, rather than the session URL, identifies the creation workspace. */
function siteCreationPage(base: string): boolean {
  try {
    return new URL(base).pathname === '/new/'
  } catch {
    return false
  }
}
