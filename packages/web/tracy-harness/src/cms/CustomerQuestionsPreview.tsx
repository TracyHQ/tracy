/**
 * Customize question: what a customer of one release sees on "Customize your site", before Tracy
 * builds the site, drawn by the customer's OWN page.
 *
 * 🔒 NOT A REDRAWING. The page below is `QuestionsPage` of `@tracy/dsh-add-site`
 * (`packages/site/tracy-add-site/src/client/questions-sheet.tsx`), imported from its source the way
 * the design bench imports plugin screens, with the plugin's own stylesheet (`CSS` of its
 * `styles.ts`) and its English strings. Its `preview` mode only changes where it sits (in a frame
 * here, not in the Add site panel) and that nothing leaves the page. A change to the customer's
 * page shows here at once because there is no second drawing to forget.
 *
 * 🔒 NOT A COPY OF THE QUESTIONS. They are `GET /api/ops/quickstart/customer-questions`, which
 * answers with the same `resolveQuestions` the customer door (`GET /api/sites/questions`) serves for
 * that release, and they go through the same `servedFrom` and `sheetOrder` the Add site wizard
 * applies. The parts the release decides (the logo tiles, the page list) are named in the side panel,
 * never inside the page, so the customer's drawing is left as it is.
 */
import { Eye, Info } from 'lucide-react'
import { type ReactNode, useEffect, useMemo, useState } from 'react'

import { QuestionsPage } from '../../../../site/tracy-add-site/src/client/questions-sheet'
import {
  type SiteQuestionsServed,
  servedFrom,
  sheetOrder
} from '../../../../site/tracy-add-site/src/client/site-brief.mjs'
import { en as addSiteEn } from '../../../../site/tracy-add-site/src/client/strings'
import { CSS as ADD_SITE_CSS } from '../../../../site/tracy-add-site/src/client/styles'
import { tr, useT } from '../i18n'
import { thrownText } from './response-error'

/** One question as the door serves it; only the fields this screen reads are named. */
interface ServedQuestion {
  id: string
  kind: string
  feeds?: string[]
  options?: string[]
  /** Only on a left-out brand question: the id of the question it follows. */
  after?: string | null
  [field: string]: unknown
}

interface CustomerQuestions {
  tag: string
  platform: string
  languages?: string
  set?: unknown
  questions: ServedQuestion[]
  brandUploads: boolean
  brandQuestions: ServedQuestion[] | null
  fitted: {
    logo: {
      layout: 'pair' | 'dark' | 'single' | null
      variants: string[]
      profile: { release: string; version: string; fallbackFrom: string | null } | null
    }
    pages: { id: string; label: string; home: boolean }[] | null
  }
}

/**
 * The plugin's English strings, with `{name}` filled the way dsh's `locale.bind` fills them. The
 * customer's page is previewed as written, so it does not follow the /ops language.
 */
const addSiteText = (key: string, params?: Record<string, string | number>): string =>
  (addSiteEn[key] ?? key).replace(/\{(\w+)\}/g, (whole, name: string) =>
    params && name in params ? String(params[name]) : whole
  )

/** The plugin's own sheet rules (cards, tiles, chips, head), put on the page once. */
function useAddSiteSheetCss() {
  useEffect(() => {
    if (document.querySelector('style[data-tracy-add-site-sheet="1"]')) return
    const el = document.createElement('style')
    el.dataset.tracyAddSiteSheet = '1'
    el.textContent = ADD_SITE_CSS
    document.head.appendChild(el)
  }, [])
}

/** The questions the customer door serves, with the left-out brand ones put back where the full set has them. */
function withBrandQuestions(answer: CustomerQuestions): ServedQuestion[] {
  const list = [...answer.questions]
  for (const { after, ...q } of answer.brandQuestions ?? []) {
    const at = after ? list.findIndex((other) => other.id === after) : -1
    list.splice(at + 1, 0, q)
  }
  return list
}

/** The logo tiles this release asks, in plain words, and where that comes from (for the muted source line). */
function logoFact(answer: CustomerQuestions): { value: string; source: string } {
  const { layout, variants, profile } = answer.fitted.logo
  if (!profile)
    return { value: tr('cms-setup.preview.logo.one'), source: tr('cms-setup.preview.logo.noProfile') }
  const value =
    layout === 'pair'
      ? tr('cms-setup.preview.logo.pair')
      : layout === 'dark'
        ? tr('cms-setup.preview.logo.dark')
        : variants.length === 1 && variants[0] === 'light'
          ? tr('cms-setup.preview.logo.light')
          : tr('cms-setup.preview.logo.one')
  return {
    value,
    source: tr('cms-setup.preview.logo.profile', { release: profile.release, version: profile.version })
  }
}

/** One "Varies by template" row: the plain value first, the technical source muted under it. */
function FactRow({
  name,
  value,
  source,
  children
}: {
  name: string
  value: string
  source: string
  children?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-muted-foreground text-xs">{name}</dt>
      <dd className="m-0 flex flex-col gap-1.5">
        <span className="text-foreground text-sm" title={source}>
          {value}
        </span>
        {children}
        <span className="text-[11px] text-muted-foreground/80">{source}</span>
      </dd>
    </div>
  )
}

/** The admin's side panel: what this preview is, which questions this release decides, and the uploads note. */
function AboutPreview({ answer, questions }: { answer: CustomerQuestions; questions: ServedQuestion[] }) {
  const t = useT()
  const asksLogo = questions.some((q) => q.kind === 'logo')
  const asksPages = questions.some((q) => q.feeds?.includes('site.pages'))
  const logo = logoFact(answer)
  const pages = answer.fitted.pages
  return (
    <aside
      className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 text-card-foreground"
      aria-label={t('cms-setup.preview.about')}
    >
      <h3 className="m-0 font-medium text-foreground text-sm">{t('cms-setup.preview.about')}</h3>
      <p className="m-0 flex gap-2 text-muted-foreground text-xs leading-relaxed">
        <Eye className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>{t('cms-setup.preview.only')}</span>
      </p>
      {asksLogo || asksPages ? (
        <section className="flex flex-col gap-3 border-border border-t pt-3" data-varies-by-template="">
          <h4 className="m-0 font-medium text-muted-foreground text-xs">{t('cms-setup.preview.varies')}</h4>
          <dl className="m-0 flex flex-col gap-3">
            {asksLogo ? (
              <FactRow name={t('cms-setup.preview.logo')} value={logo.value} source={logo.source} />
            ) : null}
            {asksPages ? (
              pages ? (
                <FactRow
                  name={t('cms-setup.preview.pages')}
                  value={t('cms-setup.preview.pageCount', { count: pages.length })}
                  source={t('cms-setup.preview.pagesListed')}
                >
                  <ul className="m-0 flex list-none flex-wrap gap-1 p-0">
                    {pages.map((page) => (
                      <li
                        key={page.id}
                        className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] text-foreground"
                      >
                        {page.label}
                      </li>
                    ))}
                  </ul>
                </FactRow>
              ) : (
                <FactRow
                  name={t('cms-setup.preview.pages')}
                  value={t('cms-setup.preview.everyPage')}
                  source={t('cms-setup.preview.noPagesFile')}
                />
              )
            ) : null}
          </dl>
        </section>
      ) : null}
      {!answer.brandUploads ? (
        <p
          className="m-0 flex gap-2 border-border border-t pt-3 text-muted-foreground text-xs leading-relaxed"
          data-brand-uploads="off"
        >
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>{t('cms-setup.preview.uploadsOff')}</span>
        </p>
      ) : null}
    </aside>
  )
}

const NO_ANSWERS = {}
const nothing = () => {}

export function CustomerQuestionsPreview({ tag }: { tag: string }) {
  const t = useT()
  useAddSiteSheetCss()
  const [answer, setAnswer] = useState<CustomerQuestions | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const ac = new AbortController()
    setAnswer(null)
    setError(null)
    fetch(`/api/ops/quickstart/customer-questions?tag=${encodeURIComponent(tag)}`, {
      headers: { accept: 'application/json' },
      signal: ac.signal
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(tr('cms-setup.create.doorAnswered', { status: response.status }))
        const body = (await response.json()) as CustomerQuestions
        if (!ac.signal.aborted) setAnswer(body)
      })
      .catch((e) => {
        if (!ac.signal.aborted) setError(thrownText(e))
      })
    return () => ac.abort()
  }, [tag])

  // Exactly what the wizard does with the customer door's answer (`wizard.tsx`): keep what the sheet can draw, then
  // put the Recommended questions first. Computed once per answer: the sheet rebuilds its form when its list changes.
  const drawn = useMemo(() => {
    if (!answer) return null
    const all = withBrandQuestions(answer)
    const served: SiteQuestionsServed | null = servedFrom({ ...answer, questions: all })
    return { all, served, ordered: served ? sheetOrder(served.questions) : [] }
  }, [answer])

  if (error) return <p className="text-destructive text-sm">{error}</p>
  if (!answer || !drawn) return <p className="text-muted-foreground text-sm">{t('cms-setup.reading')}</p>
  const { all, served, ordered } = drawn

  return (
    // Wide: the sheet on the left at the Add site panel's width, the notes beside it. Narrow: the notes stack above.
    <div
      className="grid items-start gap-4 lg:grid-cols-[minmax(0,600px)_minmax(220px,300px)]"
      data-customer-questions={tag}
    >
      <div className="w-full max-w-[600px] lg:col-start-2 lg:row-start-1">
        <AboutPreview answer={answer} questions={all} />
      </div>
      <div className="min-w-0 lg:col-start-1 lg:row-start-1">
        {served ? (
          // The page as a customer sees it in a narrow Add site panel: it fills this frame and scrolls inside it.
          <div className="relative h-[min(80vh,760px)] w-full max-w-[600px] overflow-hidden rounded-[14px] border border-border">
            <QuestionsPage
              t={addSiteText}
              questions={ordered}
              oneLanguage={served.oneLanguage}
              answers={NO_ANSWERS}
              onAnswers={nothing}
              onClose={nothing}
              preview
            />
          </div>
        ) : (
          <p className="m-0 text-muted-foreground text-sm">{t('cms-setup.preview.noQuestion')}</p>
        )}
      </div>
    </div>
  )
}
