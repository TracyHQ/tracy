/**
 * The public Design inspiration page (ADR 0011): the 152 systems wearing Tracy's words until the
 * visitor types their domain — then their words in seconds (the Worker's read door). Or one
 * sentence about their website, when there is no site yet. The gallery and the preview are the
 * plugin's own components; only the doors and the write buttons differ.
 *
 * 🔒 NO BRAND CARD AND NO COMMUNITY SHELF HERE (03/10/2026). The domain box used to start a
 * brand extraction that became a card of its own, and a "From Community" button read every brand
 * measured anywhere. A measured brand is not a template, so neither reaches the gallery any more
 * (`template-shelf.mjs` in the plugin drops `brand:` rows on every surface); the domain box keeps
 * its first job, the visitor's words.
 */
import { Button, Input, TracyWordmark } from '@tracy/ui'
import { Loader2, Sparkles } from 'lucide-react'
import { type JSX, useEffect, useMemo, useState } from 'react'

import type { Inspiration, SitePreview } from '../../../design/tracy-design-inspiration/src/client/api'
import { fetchCatalog } from '../../../design/tracy-design-inspiration/src/client/api'
import { Gallery } from '../../../design/tracy-design-inspiration/src/client/Gallery'
import { useViewAddress } from '../../../design/tracy-design-inspiration/src/client/view-address'
import demo from './demo/tracy.json'
import {
  buildUrl,
  fetchDesignSystemsShown,
  fetchTemplates,
  hostOf,
  listRows,
  readSite,
  writeWords
} from './doors'
import { pageLanguage, pageTitle, pageWords, translatorFor } from './locale'

const DEMO: SitePreview = demo as unknown as SitePreview

type Words =
  | { kind: 'demo' }
  | { kind: 'reading'; host: string }
  | { kind: 'theirs'; host: string; partial?: boolean }
  | { kind: 'sentence'; brief: string; written: boolean }
  | { kind: 'failed'; host: string; message: string; code?: string }

/**
 * One sentence about a website, worn as its words: the sentence is the lead, its first clause the
 * headline, and the name is what the sentence calls itself
 * ("Cô Ba Bakery bakes…" → "Cô Ba Bakery"). No model on this page — a plain reading, honest about being one.
 */
function siteFromSentence(sentence: string): SitePreview {
  const line = sentence.trim().replace(/\s+/g, ' ')
  const clause = line.split(/[,.;:!?—–-]\s|\s(?:that|which|who|where|for|to|with|and)\s/i)[0] ?? line
  const proper = line.match(/^((?:[A-ZÀ-Ỹ][\p{L}\p{N}'&-]*\s?){1,4})/u)?.[1]?.trim() ?? null
  return {
    ...DEMO,
    site: {
      ...DEMO.site,
      name: proper && proper.length <= 40 ? proper : DEMO.site.name,
      headline: clause.length > 90 ? `${clause.slice(0, 89).trimEnd()}…` : clause,
      sub: line,
      eyebrow: null,
      image: null
    }
  }
}

export function App(): JSX.Element {
  // The page's language, picked once per load (`locale.ts`): the plugin's own dictionaries for the
  // gallery and the preview, and the same language asked of the doors that answer in sentences.
  const lang = useMemo(pageLanguage, [])
  const t = useMemo(() => translatorFor(lang), [lang])
  const [catalog, setCatalog] = useState<Inspiration[] | null>(null)
  /**
   * The finished sites this deployment publishes, asked of Tracy at load rather than baked into
   * `catalog.json`: that file is cut when the image is built, so a card baked into it would not
   * reach anyone until someone ran CI (`templates.mjs`). Empty until the door answers, and empty
   * for good if it refuses.
   */
  const [templates, setTemplates] = useState<Inspiration[]>([])
  /** Whether the 152 are offered — tracy-web's switch. Off until it says otherwise, and off if it cannot. */
  const [systemsShown, setSystemsShown] = useState(false)
  const [input, setInput] = useState('')
  const [words, setWords] = useState<Words>({ kind: 'demo' })
  const [site, setSite] = useState<SitePreview>(DEMO)
  // What is on screen lives in the address — the plugin's own hook, shared with the tab in a lane.
  const view = useViewAddress()

  useEffect(() => {
    fetchCatalog()
      .then(setCatalog)
      .catch(() => setCatalog([]))
    // Asked beside the catalog, not after it: the two are independent, and a slow door for the
    // finished sites must not hold back the 152.
    void fetchTemplates().then((rows) => setTemplates(rows as Inspiration[]))
    void fetchDesignSystemsShown().then(setSystemsShown)
  }, [])

  // A `?domain=` on the URL (a shared link, the sign-in round trip) is the same as typing it.
  useEffect(() => {
    const fromUrl = new URLSearchParams(location.search).get('domain')
    if (fromUrl) {
      setInput(fromUrl)
      void look(fromUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on load
  }, [])

  const look = async (raw: string) => {
    const host = hostOf(raw)
    if (host === null) return
    setWords({ kind: 'reading', host })
    const url = new URL(location.href)
    url.searchParams.set('domain', host)
    history.replaceState(null, '', url)
    const read = await readSite(host, lang)
    if (read.ok && read.site) {
      setSite(read.site)
      setWords({ kind: 'theirs', host, partial: read.partial === true })
    } else {
      setSite(DEMO)
      setWords({
        kind: 'failed',
        host,
        code: read.code,
        message: read.message ?? pageWords('readFailed')
      })
    }
  }

  /** Not a domain: a name or a sentence about the business. The Worker's model writes the words;
   *  without it (a dev build, a limit reached) a plain reading of the sentence stands in. */
  const describe = async (line: string) => {
    const brief = line.trim()
    if (brief.length < 3) return
    const url = new URL(location.href)
    url.searchParams.delete('domain')
    history.replaceState(null, '', url)
    setWords({ kind: 'reading', host: brief })
    const written = await writeWords(brief, lang)
    if (written.ok && written.site) {
      setSite(written.site)
      setWords({ kind: 'sentence', brief, written: true })
    } else {
      setSite(siteFromSentence(brief))
      setWords({ kind: 'sentence', brief, written: false })
    }
  }

  /** One box for both (07/09 20:0x): a domain is read and checked, anything else is a brief. */
  const go = (raw: string) => {
    const host = hostOf(raw)
    if (host !== null) void look(raw)
    else void describe(raw)
  }

  const domain =
    (words.kind === 'reading' || words.kind === 'theirs' || words.kind === 'failed') &&
    hostOf(words.host) !== null
      ? words.host
      : null
  // The finished sites first, then the 152 when the switch offers them (no brand, no shelf).
  const rows = catalog ? listRows({ catalog, templates, systemsShown }) : null
  const galleryKey = `${words.kind}:${domain ?? ''}:${words.kind === 'sentence' ? words.brief : ''}`

  const status =
    words.kind === 'reading'
      ? pageWords('reading', { host: words.host })
      : words.kind === 'failed'
        ? // A wall is not a typo: telling someone to check an address that is already right sends
          // them round a loop they cannot win, so only an unreachable host gets that advice.
          `${words.message} ${pageWords(words.code === 'BLOCKED' ? 'adviceBlocked' : 'adviceUnreachable')}`
        : words.kind === 'theirs' && words.partial
          ? pageWords('partial', { host: words.host })
          : words.kind === 'sentence' && !words.written
            ? pageWords('sentenceAsIs')
            : null

  return (
    <div className="flex min-h-full flex-col">
      {/* The header as first drawn (07/09 19:5x: keep the domain form; add the sentence). */}
      <header className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-border border-b bg-background/95 px-4 py-3 backdrop-blur">
        <a href="https://tracy.ai" className="flex items-center gap-2" aria-label="Tracy">
          <TracyWordmark />
        </a>
        <span className="text-muted-foreground text-sm" data-page-title>
          {pageTitle(lang)}
        </span>
        <form
          className="ml-auto flex w-full items-center gap-2 sm:w-auto sm:min-w-[34rem]"
          onSubmit={(e) => {
            e.preventDefault()
            go(input)
          }}
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={pageWords('placeholder')}
            className="flex-1"
            aria-label={pageWords('placeholder')}
            spellCheck={false}
          />
          <Button type="submit" disabled={words.kind === 'reading' || input.trim().length < 3}>
            {words.kind === 'reading' ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Sparkles size={14} />
            )}
            {pageWords('go')}
          </Button>
        </form>
        {status ? <p className="w-full text-muted-foreground text-xs">{status}</p> : null}
      </header>
      <main className="min-h-0 flex-1">
        {rows === null ? (
          <p className="px-4 py-10 text-center text-muted-foreground text-sm" data-page-loading>
            {t('state.reading')}
          </p>
        ) : (
          <div className="tracy-design-inspiration mx-auto max-w-[1600px]">
            <Gallery
              key={galleryKey}
              inspirations={rows}
              site={site}
              selection={view.selection}
              onSelection={view.chooseFilter}
              openId={view.openId}
              onOpenId={view.choosePreview}
              publicMode={{
                build: (platform, inspiration) => {
                  location.assign(buildUrl(domain, inspiration, platform, location.search))
                }
              }}
              t={t}
            />
          </div>
        )}
      </main>
    </div>
  )
}
