/**
 * Build from my business — Add site's one-press start (`from-business-flow.mjs` holds its logic). One field: the
 * business's name and city, or its link. A name is looked up and the customer picks theirs; a link is used as
 * it is. Tracy researches it and suggests a template; the person keeps it or picks another in the shared Design
 * templates picker (the person chooses, Tracy suggests: David 24/10/2026), which shows the business's trade's
 * templates first, marked Recommended, in its grid (`ranking`, the owner's choice 26/10/2026). Then the chat opens
 * where the site's agent builds the whole site.
 *
 * The field's label and hint are the questionnaire's `business` question (`GET /api/sites/questions`), never a
 * second set of questions in this file (CLAUDE.md "One questionnaire").
 */
import { Alert, AlertDescription, Button, Input, Label, RadioGroup } from '@tracy/ui'
import { ArrowLeft, Hammer, Link2, Loader2, Search } from 'lucide-react'
import {
  requestTemplatePick,
  type TemplatePick,
  type TemplateRanking,
  type TemplateSuggestion
} from '@tracy/core/template-picker'
import { type JSX, useEffect, useId, useRef, useState } from 'react'
import { type FindMode, LinkRows, type LinkRowsCopy, ModeSwitch } from '@tracy/wo-views/link-rows'
import {
  type ServerLink,
  judgeRows,
  linksOf,
  rowsOf,
  sourceNames,
  spreadPaste,
  summaryOf
} from '@tracy/wo-views/link-rows-model'
import { ChoiceOption, FIELD_LABEL, Note } from './choice'
import {
  businessQuestionOf,
  failureKey,
  followBusiness,
  fromBusinessApi,
  keepBusiness,
  keptBusiness,
  linkOf,
  linksStart,
  looksLikeLink,
  newRequestId,
  placeLine,
  reasonKey,
  researchNameOf,
  startNameOf,
  researchProgressOf,
  startOutcome,
  suggestionCardOf
} from './from-business-flow.mjs'
import type { Translate } from './strings'

const CMS_NAMES: Record<string, string> = { wordpress: 'WordPress', joomla: 'Joomla', emdash: 'EmDash' }

type Place = { providerId: string; name: string; address?: string; category?: string; trade?: string }
/** Links of one business as a start sends them; `place` once the person picked the Google link's place. */
type LinksInput = { links: string[]; name?: string; place?: Place }
type Stage =
  | { at: 'idle' }
  | { at: 'searching' }
  /** `retry`: the places came from an ambiguous Google link, and the pick resends these links with it. */
  | { at: 'found'; places: Place[]; retry?: LinksInput; sources?: string[] }
  /** `name`: the best name known before the server answers; `sources`: what a links start reads. */
  | { at: 'starting'; name: string; sources?: string[] }
  | { at: 'research'; name: string; sources?: string[]; progress?: ReturnType<typeof researchProgressOf> }
  | {
      at: 'choose'
      id: string
      name: string
      recommended: TemplateSuggestion | null
      /** How the picker groups its cards for this business's trade; null when the trade is unknown. */
      ranking: TemplateRanking | null
      card?: ReturnType<typeof suggestionCardOf>
    }
  | { at: 'opening'; logo?: boolean }
  | { at: 'failed'; key: string }

/** "A, B and C" in the interface language; a plain comma list where the locale is not one the browser knows. */
function listOf(items: string[], lang: string): string {
  try {
    return new Intl.ListFormat(lang || 'en', { type: 'conjunction' }).format(items)
  } catch {
    return items.join(', ')
  }
}

/** `own_links_<key>`: a shared rows key in this namespace's snake case. */
function linksKey(key: string): string {
  return `own_links_${key.replace(/[.-]/g, '_').replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)}`
}

/** The browser's storage for the kept business, or null where reading it throws (a private window, blocked data). */
function viewerStorage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function FromBusiness({
  initialQuery = '',
  t,
  lang,
  onBack,
  open = (href) => window.location.assign(href),
  api: givenApi,
  pickTemplate = (ranking) => requestTemplatePick(undefined, { ranking }),
  storage = viewerStorage()
}: {
  t: Translate
  initialQuery?: string
  lang: string
  onBack(): void
  open?(href: string): void
  api?: ReturnType<typeof fromBusinessApi>
  pickTemplate?(ranking: TemplateRanking | null): Promise<TemplatePick | null>
  storage?: Storage | null
}): JSX.Element {
  // 🔒 ONE API FOR THE PAGE'S LIFE. A default made in the parameter list was a new object every render, the effect
  // below ran again each time, and its cleanup aborted the follow it had just started: the research spinner never
  // turned into the template choice (local stand 24/10/2026, twenty minutes on a research done in twenty seconds).
  const [api] = useState(() => givenApi ?? fromBusinessApi())
  const fieldId = useId()
  const [question, setQuestion] = useState<{ label: string; hint: string | null } | null>(null)
  const [text, setText] = useState(initialQuery)
  const editedQuery = useRef(false)
  const seededQuery = useRef(initialQuery)
  const searchSequence = useRef(0)
  useEffect(() => {
    if (seededQuery.current === initialQuery) return
    seededQuery.current = initialQuery
    if (editedQuery.current || !['idle', 'searching', 'found', 'failed'].includes(stage.at)) return
    searchSequence.current++
    setText(initialQuery)
    setPicked(null)
    setStage({ at: 'idle' })
  }, [initialQuery])
  const [picked, setPicked] = useState<string | null>(null)
  const [stage, setStage] = useState<Stage>({ at: 'idle' })
  const [mode, setMode] = useState<FindMode>('search')
  const [rows, setRows] = useState<string[]>(() => rowsOf())
  const [linkName, setLinkName] = useState('')
  /** The server's judgement of the links last sent, shown on their rows until they are edited. */
  const [server, setServer] = useState<ServerLink[] | undefined>(undefined)
  const stop = useRef<AbortController | null>(null)
  const copy: LinkRowsCopy = (key, params) => t(linksKey(key), params)
  const usable = summaryOf(judgeRows(rows, server)).used

  useEffect(() => {
    let live = true
    void api.question(lang).then((answer) => {
      if (live) setQuestion(businessQuestionOf(answer.body))
    })
    return () => {
      live = false
    }
  }, [api, lang])
  // Leaving the page stops following; the research and the build go on on the server.
  useEffect(() => () => stop.current?.abort(), [])

  // A business this viewer already started is followed again where it stands (`keptBusiness`).
  useEffect(() => {
    const kept = keptBusiness(storage)
    if (kept === null) return
    // Started from its links: back in links mode with them, as the person left it.
    if (kept.links) {
      setMode('links')
      setRows(rowsOf(kept.links))
      setLinkName(kept.linkName ?? '')
    }
    const controller = new AbortController()
    stop.current = controller
    setStage({ at: 'research', name: kept.name })
    void follow(kept.id, controller)
    return () => controller.abort()
    // Once, on the page's first draw: a business started on it is followed by `build`.
  }, [])

  const link = looksLikeLink(text)
  const busy =
    stage.at === 'searching' ||
    stage.at === 'starting' ||
    stage.at === 'research' ||
    stage.at === 'choose' ||
    stage.at === 'opening'

  async function search(): Promise<void> {
    const mine = ++searchSequence.current
    setPicked(null)
    setStage({ at: 'searching' })
    const answer = await api.find(text.trim())
    if (mine !== searchSequence.current) return
    if (!answer.ok) return setStage({ at: 'failed', key: failureKey(answer.body?.code) })
    setStage({ at: 'found', places: Array.isArray(answer.body?.candidates) ? answer.body.candidates : [] })
  }

  /** The sources a research line names: brand names, and this namespace's word for the business's own website. */
  function sourcesOf(links: readonly string[]): string[] {
    return sourceNames(links).map((source) => (source === 'website' ? t('own_source_website') : source))
  }

  async function build(
    input: { place: Place } | LinksInput,
    name: string,
    sources?: string[]
  ): Promise<void> {
    stop.current?.abort()
    const controller = new AbortController()
    stop.current = controller
    const typed = 'links' in input ? (input.name?.trim() ?? '') : ''
    // Until the server answers: the words typed with the links, else the first link's host, never an empty name.
    const before = 'links' in input ? startNameOf(typed, input.links) : name
    setStage({ at: 'starting', name: before, sources })
    const outcome = startOutcome(
      await api.start(
        'links' in input ? linksStart(newRequestId(), input) : { requestId: newRequestId(), ...input }
      )
    )
    if ('pick' in outcome && 'links' in input) {
      setServer(outcome.links)
      setPicked(null)
      return setStage({
        at: 'found',
        places: outcome.pick,
        retry: { links: input.links, name: input.name },
        sources
      })
    }
    if ('unusable' in outcome) {
      setServer(outcome.unusable)
      setMode('links')
      if (!('links' in input)) return setStage({ at: 'failed', key: 'own_bad_link' })
      // A link typed in the name field is shown in its row, with the reason it cannot be used.
      if (mode === 'search') setRows(rowsOf(input.links))
      return setStage({ at: 'idle' })
    }
    if (!('started' in outcome))
      return setStage({ at: 'failed', key: 'failed' in outcome ? outcome.failed : 'own_failed' })
    const { id } = outcome.started
    // The rows stay on screen through the research: they say which link the server left out, and why.
    if ('links' in input) setServer(outcome.links)
    // The best name known: the words typed with the links, else the server's (never a host while a source names it).
    const shown = typed || outcome.started.name || before
    setStage({ at: 'research', name: shown, sources })
    keepBusiness(
      storage,
      'links' in input ? { id, name: shown, links: input.links, linkName: typed } : { id, name: shown }
    )
    await follow(id, controller)
  }

  /** Several links pasted into the name field go to the link rows, one per row. */
  function pasteLinks(pasted: string): boolean {
    const spread = spreadPaste(rowsOf(), 0, pasted)
    if (spread === null) return false
    setRows(spread.rows)
    setLinkName(spread.name)
    setServer(undefined)
    setMode('links')
    if (stage.at === 'found' || stage.at === 'failed') setStage({ at: 'idle' })
    return true
  }

  /** From the research to the template choice, or from an accepted build to its chat. */
  async function follow(id: string, controller: AbortController): Promise<void> {
    const done = await followBusiness({
      api,
      id,
      signal: controller.signal,
      onState: (business) => {
        if (business.phase === 'build') setStage((now) => (now.at === 'opening' ? now : { at: 'opening' }))
        // What the research has reached, under the sentence: the source, the photos, the minutes.
        // A better name than the host once a source shows one (`bestKnownName` on the server).
        else if (business.phase === 'research')
          setStage((now) =>
            now.at === 'research'
              ? {
                  ...now,
                  name: researchNameOf(now.name, business.name),
                  progress: researchProgressOf(business.job)
                }
              : now
          )
      },
      onLogoWait: (logo) => setStage((now) => (now.at === 'opening' ? { at: 'opening', logo } : now)),
      open: (href) => {
        // The chat is where it goes on from here; the kept business has done its work.
        keepBusiness(storage, null)
        open(href)
      }
    })
    if ('choose' in done) {
      const recommended = done.choose.recommended ?? null
      const ranking = done.choose.ranking ?? null
      setStage({ at: 'choose', id, name: done.choose.name, recommended, ranking })
      // The suggestion's picture, sentence and demo, once the catalogue answers; the choice works without them.
      if (recommended)
        void api.templates().then((answer) => {
          const card = answer.ok ? suggestionCardOf(answer.body, recommended) : null
          if (card && !controller.signal.aborted)
            setStage((now) => (now.at === 'choose' && now.id === id ? { ...now, card } : now))
        })
      return
    }
    if ('failed' in done && done.failed !== 'STOPPED') {
      keepBusiness(storage, null)
      setStage({ at: 'failed', key: failureKey(done.failed) })
    }
  }

  /** The person's template: Tracy's pick kept, or another from the picker (`null`: cancelled, nothing built). */
  async function choose(selection: TemplatePick | null): Promise<void> {
    if (stage.at !== 'choose' || !selection) return
    const controller = stop.current ?? new AbortController()
    stop.current = controller
    const { id } = stage
    setStage({ at: 'opening' })
    const accepted = await api.build(id, selection)
    if (!accepted.ok) return setStage({ at: 'failed', key: failureKey(accepted.body?.code) })
    await follow(id, controller)
  }

  const places = stage.at === 'found' ? stage.places : []
  const chosen = places.find((p) => p.providerId === picked) ?? null
  return (
    <div className="tas-own grid gap-4" data-add-site-own="1" data-own-stage={stage.at}>
      <div className="grid gap-1.5">
        <Label htmlFor={mode === 'search' ? fieldId : undefined} className={FIELD_LABEL}>
          {question?.label ?? t('own_title')}
        </Label>
        <ModeSwitch
          mode={mode}
          disabled={busy}
          onMode={(next) => {
            setMode(next)
            if (stage.at === 'found' || stage.at === 'failed') setStage({ at: 'idle' })
          }}
          search={
            <>
              <Search aria-hidden="true" />
              {t('own_mode_search')}
            </>
          }
          links={
            <>
              <Link2 aria-hidden="true" />
              {t('own_mode_links')}
            </>
          }
        />
      </div>
      {mode === 'links' ? (
        <form
          className="grid gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (busy || usable === 0) return
            const links = linksOf(rows)
            void build({ links, name: linkName }, linkName.trim() || links[0], sourcesOf(links))
          }}
        >
          <LinkRows
            copy={copy}
            rows={rows}
            server={server}
            disabled={busy}
            onName={setLinkName}
            onRows={(next) => {
              setRows(next)
              setServer(undefined)
              if (stage.at === 'found' || stage.at === 'failed') setStage({ at: 'idle' })
            }}
          />
          <div>
            <Button type="submit" variant="outline" disabled={busy || usable === 0}>
              {stage.at === 'starting' ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <Hammer aria-hidden="true" />
              )}
              {usable > 1 ? t('own_links_many') : t('own_link')}
            </Button>
          </div>
        </form>
      ) : (
        <div className="grid gap-1.5">
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              if (busy || text.trim().length < 2) return
              if (link) {
                const links = [linkOf(text)]
                void build({ links }, text.trim(), sourcesOf(links))
              } else void search()
            }}
          >
            <Input
              id={fieldId}
              value={text}
              disabled={busy}
              autoComplete="off"
              placeholder={t('own_placeholder')}
              onPaste={(event) => {
                if (pasteLinks(event.clipboardData.getData('text'))) event.preventDefault()
              }}
              onChange={(event) => {
                editedQuery.current = true
                setText(event.target.value)
                if (stage.at === 'found' || stage.at === 'failed') setStage({ at: 'idle' })
              }}
            />
            <Button type="submit" variant="outline" disabled={busy || text.trim().length < 2}>
              {stage.at === 'searching' ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : link ? (
                <Hammer aria-hidden="true" />
              ) : (
                <Search aria-hidden="true" />
              )}
              {link ? t('own_link') : t('own_find')}
            </Button>
          </form>
          {question?.hint ? <p className="text-muted-foreground text-xs">{question.hint}</p> : null}
        </div>
      )}
      {stage.at === 'found' && places.length === 0 ? <Note>{t('own_none')}</Note> : null}
      {places.length ? (
        <div className="grid gap-2" data-own-places={places.length}>
          <div className={FIELD_LABEL}>{t('own_pick')}</div>
          {stage.at === 'found' && stage.retry ? (
            <p className="text-muted-foreground text-xs" data-own-pick-note="1">
              {t('own_pick_note')}
            </p>
          ) : null}
          <RadioGroup value={picked ?? undefined} onValueChange={setPicked} className="gap-2">
            {places.map((place) => (
              <ChoiceOption
                key={place.providerId}
                value={place.providerId}
                selected={picked === place.providerId}
                title={place.name}
                description={placeLine(place)}
              />
            ))}
          </RadioGroup>
          <Button
            type="button"
            disabled={!chosen}
            onClick={() => {
              if (!chosen || stage.at !== 'found') return
              void build(
                stage.retry ? { ...stage.retry, place: chosen } : { place: chosen },
                chosen.name,
                stage.sources
              )
            }}
          >
            {t('own_build')}
          </Button>
        </div>
      ) : null}
      {stage.at === 'starting' || stage.at === 'research' || stage.at === 'opening' ? (
        <p className="flex items-center gap-2 text-sm" role="status" data-own-progress="1">
          <Loader2 className="animate-spin" aria-hidden="true" />
          {stage.at === 'opening'
            ? t(stage.logo ? 'own_logo' : 'own_opening')
            : stage.sources?.length
              ? t('own_research_links', {
                  name: stage.name,
                  sources: listOf(stage.sources, lang)
                })
              : t('own_research', { name: stage.name || text.trim() })}
        </p>
      ) : null}
      {stage.at === 'research' && stage.progress ? (
        <p className="text-muted-foreground grid gap-0.5 pl-6 text-xs" data-own-research-progress="1">
          {stage.progress.source ? (
            <span>
              {stage.progress.source === 'website'
                ? t('own_progress_website')
                : t('own_progress_source', { source: stage.progress.source })}
            </span>
          ) : null}
          {stage.progress.photos ? (
            <span>
              {t('own_progress_photos', {
                done: stage.progress.photos.done,
                total: stage.progress.photos.total
              })}
            </span>
          ) : null}
          {stage.progress.minutes ? (
            <span>{t('own_progress_minutes', { minutes: stage.progress.minutes })}</span>
          ) : null}
        </p>
      ) : null}
      {stage.at === 'choose' ? (
        <div className="grid gap-2 rounded-lg border p-3" data-own-choose={stage.recommended?.design ?? ''}>
          {stage.recommended ? (
            <>
              <div className={FIELD_LABEL}>{t('own_choose_title', { name: stage.name })}</div>
              <div className="font-medium">
                {t('own_choose_line', {
                  template: stage.recommended.label ?? stage.recommended.design,
                  cms: CMS_NAMES[stage.recommended.cms] ?? stage.recommended.cms
                })}
              </div>
              <p className="text-muted-foreground text-xs">{t(reasonKey(stage.recommended.reason))}</p>
              {stage.card?.image ? (
                <img
                  src={stage.card.image}
                  alt=""
                  className="aspect-[16/10] w-full max-w-sm rounded-md border object-cover object-top"
                  data-own-choose-image="1"
                />
              ) : null}
              {stage.card?.blurb ? <p className="text-sm">{stage.card.blurb}</p> : null}
              {stage.card?.demo ? (
                <a
                  href={stage.card.demo}
                  target="_blank"
                  rel="noreferrer"
                  className="self-start text-primary text-sm underline-offset-4 hover:underline"
                  data-own-choose-demo="1"
                >
                  {t('own_demo')}
                </a>
              ) : null}
            </>
          ) : (
            <div className={FIELD_LABEL}>{t('own_choose_none')}</div>
          )}
          <div className="flex flex-wrap gap-2">
            {stage.recommended ? (
              <Button
                type="button"
                onClick={() => {
                  const r = stage.recommended
                  if (r) void choose({ cms: r.cms, design: r.design, quickstart: r.quickstart })
                }}
              >
                <Hammer aria-hidden="true" />
                {t('own_use')}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              onClick={() => void pickTemplate(stage.ranking).then(choose, () => {})}
            >
              {t('own_other')}
            </Button>
          </div>
        </div>
      ) : null}
      {stage.at === 'failed' ? (
        <Alert variant="destructive" data-own-failed={stage.key}>
          <AlertDescription>{t(stage.key)}</AlertDescription>
        </Alert>
      ) : null}
      <div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={stage.at === 'opening'}
          onClick={() => {
            stop.current?.abort()
            // Back gives the business up on this page; its research stays on the server for a later start.
            keepBusiness(storage, null)
            setStage({ at: 'idle' })
            onBack()
          }}
        >
          <ArrowLeft aria-hidden="true" />
          {t('own_back')}
        </Button>
      </div>
    </div>
  )
}
