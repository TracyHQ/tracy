/**
 * /ops › Agents › Voice — voice input in the customer's chat box, on one screen (David 15/10/2026: a
 * row of its own beside CMS agents and Provider presets, one switch for every agent, and the speech
 * key typed here instead of set in the environment).
 *
 * 🔒 THE SWITCH IS THE USER INTERFACE ONE, NOT A COPY. Voice is the catalogue switch
 * `composer-voice-input`; this screen reads where it stands from `GET /api/ops/speech` and presses it
 * with `PUT /api/ops/ui`, the door /ops › User Interface presses it with. Two switches for one
 * feature would disagree the first time someone used the other screen. Off is off on the server
 * too: the chat box draws no microphone and the voice socket refuses every session.
 *
 * 🔒 THE KEY GOES IN, NEVER COMES OUT. `PUT /api/ops/speech/key` saves it sealed and the screen only
 * ever reads where the key in use comes from and a hint of it. The field is emptied after a save.
 * Test asks the speech service with the typed key, or with the one in use when the field is empty,
 * so a key without the Speech to Text permission is caught here rather than by a customer. Remove
 * asks first and names what follows (#800: a press that takes something away asks before it acts).
 *
 * TURN TIMES (council 19/10/2026): how long voice turns took over the last day and week, as the
 * pages timed them (`turns`, `apps/tracy-web/src/lib/voice-trace.js`). The server applies the Usage
 * rules — no median under 20 turns, no 95th percentile under 100, staff left out — and this screen
 * shows what it is given: a count where there is no figure, never a number made up from too few.
 *
 * KEYTERMS PILOT (council 19/10/2026, A1): the site keys whose voice sessions ask the speech service to
 * listen for the site's own names (`PUT /api/ops/speech/keyterms`, `apps/tracy-web/src/lib/speech-keyterms.js`).
 * Empty by default: an empty list is the pilot off. The screen lists site keys only; the names are read
 * on the server when a session opens, and never shown here.
 */
import {
  Badge,
  Button,
  Card,
  CardContent,
  Input,
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
  Skeleton,
  Switch
} from '@tracy/ui'
import {
  AlertTriangle,
  AudioLines,
  CheckCircle2,
  Gauge,
  KeyRound,
  ListChecks,
  Mic,
  RefreshCw,
  Timer,
  Watch,
  XCircle
} from 'lucide-react'
import { type ReactNode, useCallback, useEffect, useState } from 'react'

import { formatDateTime, formatFixed, formatNumber, formatTime, type T, tr, useT } from './i18n'

const SWITCH = 'composer-voice-input'

/** Product names, the same in every language. */
const PROVIDER_NAME = { elevenlabs: 'ElevenLabs', voicestudio: 'VoiceStudio' } as const

/** What `GET /api/ops/speech` answers. */
interface HealthPart {
  outcome: 'ok' | 'refused' | 'limited' | 'unavailable'
  at: number
  reason: string | null
}

/** One line of the key's health: what it is for, and whether the service takes it. */
function healthLine(t: T, kind: 'stt' | 'tts', part: HealthPart | null | undefined): string {
  const what = t(`voice.health.${kind}`)
  if (!part) return t('voice.health.notTried', { what })
  const when = formatTime(part.at)
  if (part.outcome === 'ok') return t('voice.health.ok', { what, when })
  const reason = part.reason ?? t(`voice.health.reason.${part.outcome}`)
  if (part.outcome === 'unavailable') return t('voice.health.unavailable', { what, reason, when })
  // The account is held back (credits used up): the key is fine, and nothing is hidden from customers.
  if (part.outcome === 'limited') return t(`voice.health.limited.${kind}`, { what, reason, when })
  return t(`voice.health.refused.${kind}`, { what, reason, when })
}

interface SpeechDoc {
  on: boolean | null
  configured: boolean
  provider: {
    provider: 'elevenlabs' | 'voicestudio'
    revision: string
    profiles: {
      elevenlabs: { sttModel: string; ttsModel: string; fallbackEnabled: boolean }
      voicestudio: {
        baseUrl: string
        ttsModel: string
        voice: string
        tokenConfigured: boolean
        fallbackEnabled: boolean
      }
    }
  } | null
  runtime?: {
    actualProvider: string
    primaryProvider: string
    fallbackUsed: boolean
    status: string
    reason: string | null
  } | null
  key: {
    configured: boolean
    source: 'ops' | 'env' | null
    hint: string | null
    unreadable: boolean
    updatedBy: string | null
    updatedAt: string | null
  } | null
  writable: boolean
  service: { provider: string; model: string }
  limits: {
    sessionSeconds: number
    silenceSeconds: number
    accountMinutesPerDay: number
    totalMinutesPerDay: number
  }
  today: { day: string; minutes: number; accounts: number } | null
  /** Whether the service takes the key, as last tried or used (`apps/tracy-web/src/speech/health.js`). */
  health?: { stt: HealthPart | null; tts: HealthPart | null }
  /** The voice conversation the same switch turns on; absent from an older server. */
  speak?: {
    service: { provider: string; model: string }
    limits: { maxChars: number; accountCharsPerDay: number; totalCharsPerDay: number }
    today: { day: string; chars: number; accounts: number } | null
  }
  /** How long voice turns took, last day and last week; absent from an older server, null without a database. */
  turns?: { day: TurnWindow; week: TurnWindow } | null
  /** The keyterms pilot; absent from an older server, null when it could not be read. */
  keyterms?: { sites: string[]; limits: { sites: number; terms: number; chars: number } } | null
}

/** One span's turns and figures, as the server computed them (`null` below its turn count). */
interface Spread {
  n: number
  p50: number | null
  p95: number | null
}
interface Share {
  a: number
  b: number
  rate: number | null
}
interface TurnWindow {
  days: number
  turns: number
  pressed: number
  spans: Record<'speechToCommit' | 'commitToSent' | 'sentToAck' | 'sentToReply' | 'speechToReply', Spread>
  errors: Share
  interrupted: Share
  ackCached: Share
}

/** The spans, in the order a turn goes, the whole wait first. */
const SPANS: readonly (keyof TurnWindow['spans'])[] = [
  'speechToReply',
  'speechToCommit',
  'commitToSent',
  'sentToAck',
  'sentToReply'
]

/** Milliseconds as a person reads them: 850 ms, 3.4 s. */
function ms(value: number): string {
  return value < 1000 ? `${value} ms` : `${formatFixed(value / 1000, 1)} s`
}

/** A span's median and 95th percentile, or the count it has while it has too few turns. */
function spread(q: Spread): ReactNode {
  if (q.p50 === null) return <span className="text-muted-foreground">n={q.n}</span>
  return (
    <span>
      {ms(q.p50)} · {q.p95 === null ? <span className="text-muted-foreground">—</span> : ms(q.p95)}{' '}
      <span className="text-muted-foreground">n={q.n}</span>
    </span>
  )
}

/** `a` of `b`, with its share once the server gives one. */
function shareOf(s: Share): string {
  return s.rate === null ? `${s.a}/${s.b}` : `${s.a}/${s.b} (${Math.round(s.rate * 1000) / 10}%)`
}

/** The last day and the last week side by side: each span, then the shares. */
const SHARES: readonly ('errors' | 'interrupted' | 'ackCached')[] = ['errors', 'interrupted', 'ackCached']

function TurnTable({ day, week }: { day: TurnWindow; week: TurnWindow }) {
  const t = useT()
  return (
    <table className="mt-2 w-full text-sm">
      <thead>
        <tr className="text-left text-muted-foreground">
          <th className="py-1 pr-3 font-normal">
            <span className="sr-only">{t('voice.turns.step')}</span>
          </th>
          <th className="py-1 pr-3 font-normal">{t('voice.turns.day', { turns: day.turns })}</th>
          <th className="py-1 font-normal">{t('voice.turns.week', { turns: week.turns })}</th>
        </tr>
      </thead>
      <tbody>
        {SPANS.map((key) => (
          <tr key={key}>
            <td className="py-1 pr-3">{t(`voice.span.${key}`)}</td>
            <td className="py-1 pr-3">{spread(day.spans[key])}</td>
            <td className="py-1">{spread(week.spans[key])}</td>
          </tr>
        ))}
        {SHARES.map((key) => (
          <tr key={key}>
            <td className="py-1 pr-3">{t(`voice.share.${key}`)}</td>
            <td className="py-1 pr-3">{shareOf(day[key])}</td>
            <td className="py-1">{shareOf(week[key])}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

interface SpeechModel {
  id: string
  name: string
  kind: 'stt' | 'tts' | 'other'
  selectable: boolean
  reason: string | null
  alias?: boolean
  source: string
}
interface ModelList {
  models: SpeechModel[]
  readAt: string | null
  stale: boolean
  fetchedCount: number
  source: string
  error?: string
  status?: number
}

type TestAnswer = { ok: true } | { ok: false; status: number; reason: string | null; message: string }

/** What a customer sees right now, from the two facts it depends on (`labelKey` in `ns/voice.ts`). */
function seen(doc: SpeechDoc): { labelKey: string; tone: 'on' | 'off' | 'unknown' } {
  if (doc.on === null) return { labelKey: 'voice.seen.unknown', tone: 'unknown' }
  if (!doc.on) return { labelKey: 'voice.seen.off', tone: 'off' }
  if (['refused', 'unavailable'].includes(doc.health?.stt?.outcome ?? ''))
    return { labelKey: 'voice.seen.sttFailed', tone: 'off' }
  if (!doc.configured) return { labelKey: 'voice.seen.notConfigured', tone: 'off' }
  return { labelKey: 'voice.seen.on', tone: 'on' }
}

/** Where the key in use comes from, in one sentence. */
function keySentence(t: T, doc: SpeechDoc): string {
  const key = doc.key
  if (!key) return t('voice.key.unread')
  const when = key.updatedAt ? formatDateTime(key.updatedAt) : null
  const hint = key.hint ?? ''
  if (key.source === 'ops') {
    if (key.updatedBy && when) return t('voice.key.savedByAt', { hint, by: key.updatedBy, when })
    if (key.updatedBy) return t('voice.key.savedBy', { hint, by: key.updatedBy })
    if (when) return t('voice.key.savedAt', { hint, when })
    return t('voice.key.saved', { hint })
  }
  if (key.source === 'env') return t('voice.key.env', { hint })
  return t('voice.key.none')
}

function Row({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <Item size="sm">
      <ItemMedia variant="icon">{icon}</ItemMedia>
      <ItemContent>
        <ItemTitle>{title}</ItemTitle>
        <ItemDescription className="line-clamp-none">{children}</ItemDescription>
      </ItemContent>
    </Item>
  )
}

export function Voice() {
  const t = useT()
  const [doc, setDoc] = useState<SpeechDoc | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<null | 'switch' | 'save' | 'test' | 'remove' | 'models' | 'keyterms'>(null)
  /** The pilot's site keys as typed, one a line; filled from the server on each load. */
  const [pilot, setPilot] = useState('')
  const [typed, setTyped] = useState('')
  const [tested, setTested] = useState<TestAnswer | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [provider, setProvider] = useState<'elevenlabs' | 'voicestudio'>('elevenlabs')
  const [profile, setProfile] = useState({
    baseUrl: '',
    sttModel: 'scribe_v2_realtime',
    ttsModel: 'eleven_flash_v2_5',
    voice: 'default',
    fallbackEnabled: false
  })
  const [modelLists, setModelLists] = useState<Partial<Record<'elevenlabs' | 'voicestudio', ModelList>>>({})
  const [modelsError, setModelsError] = useState<string | null>(null)
  const [modelsLoading, setModelsLoading] = useState(false)
  const [token, setToken] = useState('')
  const [removeToken, setRemoveToken] = useState(false)
  const [profileTest, setProfileTest] = useState<{
    stt: { outcome: string; reason: string | null }
    tts: { outcome: string; reason: string | null }
  } | null>(null)
  const pickProvider = (next: 'elevenlabs' | 'voicestudio', source = doc) => {
    setProvider(next)
    const saved = source?.provider?.profiles[next]
    setProfile({
      baseUrl: '',
      sttModel: 'scribe_v2_realtime',
      ttsModel: next === 'voicestudio' ? 'omnivoice' : 'eleven_flash_v2_5',
      voice: 'default',
      fallbackEnabled: false,
      ...saved
    })
    setToken('')
    setRemoveToken(false)
    setProfileTest(null)
  }

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/ops/speech', { headers: { accept: 'application/json' } })
      if (!response.ok) throw new Error(tr('voice.error.load', { status: response.status }))
      const next = (await response.json()) as SpeechDoc
      setDoc(next)
      setPilot((next.keyterms?.sites ?? []).join('\n'))
      pickProvider(next.provider?.provider ?? 'elevenlabs', next)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    let cancelled = false
    setModelsError(null)
    setModelsLoading(true)
    void fetch(`/api/ops/speech/providers/${provider}/models`)
      .then(async (response) => {
        if (!response.ok) throw new Error(tr('voice.error.models', { status: response.status }))
        const list = (await response.json()) as ModelList
        if (!cancelled) setModelLists((previous) => ({ ...previous, [provider]: list }))
      })
      .catch((e) => {
        if (!cancelled) setModelsError(e.message)
      })
      .finally(() => {
        if (!cancelled) setModelsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [provider])

  /** One request at a time; its failure is said, and what is on screen stays. */
  const act = async (what: NonNullable<typeof busy>, run: () => Promise<void>) => {
    setBusy(what)
    setError(null)
    try {
      await run()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const press = (on: boolean) =>
    act('switch', async () => {
      const response = await fetch('/api/ops/ui', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ switches: { [SWITCH]: on } })
      })
      if (!response.ok) throw new Error(t('voice.error.switch', { status: response.status }))
      await load()
    })

  const saveKey = (apiKey: string, what: 'save' | 'remove') =>
    act(what, async () => {
      const response = await fetch('/api/ops/speech/key', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ apiKey })
      })
      const body = await response.json().catch(() => null)
      if (!response.ok)
        throw new Error(t('voice.error.keyNotSaved', { reason: String(body?.error ?? response.status) }))
      setDoc(body as SpeechDoc)
      setTyped('')
      setTested(null)
      setConfirmRemove(false)
    })

  const savePilot = () =>
    act('keyterms', async () => {
      const sites = pilot
        .split(/[\s,]+/)
        .map((site) => site.trim())
        .filter(Boolean)
      const response = await fetch('/api/ops/speech/keyterms', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sites })
      })
      const body = await response.json().catch(() => null)
      if (!response.ok)
        throw new Error(t('voice.error.pilotNotSaved', { reason: String(body?.error ?? response.status) }))
      const next = body as SpeechDoc
      setDoc(next)
      setPilot((next.keyterms?.sites ?? []).join('\n'))
    })

  const testKey = () =>
    act('test', async () => {
      setTested(null)
      const response = await fetch('/api/ops/speech/key/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(typed.trim() ? { apiKey: typed } : {})
      })
      if (!response.ok) throw new Error(t('voice.error.test', { status: response.status }))
      setTested((await response.json()) as TestAnswer)
    })

  const getModels = () =>
    act('models', async () => {
      setModelsError(null)
      const response = await fetch(`/api/ops/speech/providers/${provider}/models`, { method: 'POST' })
      const result = (await response.json()) as ModelList
      if (!response.ok || result.error) {
        const reason = String(result.error ?? response.status)
        setModelsError(
          result.status
            ? t('voice.models.refreshFailedUpstream', { reason, status: result.status })
            : t('voice.models.refreshFailed', { reason })
        )
        return
      }
      setModelLists((previous) => ({ ...previous, [provider]: result }))
    })
  const modelList = modelLists[provider]
  const modelSelect = (key: 'sttModel' | 'ttsModel', label: string) => {
    const models =
      modelList?.models.filter((model) => model.kind === (key === 'sttModel' ? 'stt' : 'tts')) ?? []
    return (
      <label className="flex flex-col gap-1 text-sm">
        {label}
        <select
          aria-label={label}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={profile[key]}
          disabled={!doc?.writable || busy !== null}
          onChange={(e) => {
            setProfile({ ...profile, [key]: e.target.value })
            setProfileTest(null)
          }}
        >
          {!models.some((model) => model.id === profile[key]) ? (
            <option value={profile[key]}>{t('voice.provider.currentModel', { model: profile[key] })}</option>
          ) : null}
          {models.map((model) => (
            <option key={model.id} value={model.id} disabled={!model.selectable}>
              {model.name === model.id ? model.id : `${model.name} · ${model.id}`}
              {model.reason ? ` — ${model.reason}` : ''}
            </option>
          ))}
        </select>
        {models.find((model) => model.id === profile[key])?.reason ? (
          <span className="text-muted-foreground text-xs">
            {models.find((model) => model.id === profile[key])?.reason}
          </span>
        ) : null}
      </label>
    )
  }

  const profileAction = (test: boolean) =>
    act(test ? 'test' : 'save', async () => {
      const request =
        provider === 'voicestudio'
          ? {
              baseUrl: profile.baseUrl,
              ttsModel: profile.ttsModel,
              voice: profile.voice,
              fallbackEnabled: profile.fallbackEnabled,
              ...(removeToken ? { token: '' } : token ? { token } : {})
            }
          : {
              sttModel: profile.sttModel,
              ttsModel: profile.ttsModel,
              fallbackEnabled: profile.fallbackEnabled
            }
      const response = await fetch(`/api/ops/speech/provider${test ? '/test' : ''}`, {
        method: test ? 'POST' : 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider, profile: request })
      })
      const result = await response.json()
      if (!response.ok)
        throw new Error(t('voice.error.profile', { reason: String(result.error ?? response.status) }))
      if (test) setProfileTest(result)
      else {
        setDoc(result)
        pickProvider(provider, result)
      }
    })
  const field = (key: keyof typeof profile, label: string, type = 'text') => (
    <label className="flex flex-col gap-1 text-sm" key={key}>
      {label}
      <Input
        type={type}
        value={String(profile[key])}
        disabled={!doc?.writable || busy !== null}
        onChange={(e) => {
          setProfile({ ...profile, [key]: e.target.value })
          setProfileTest(null)
        }}
      />
    </label>
  )

  const state = doc ? seen(doc) : null
  const runtimeName = doc?.runtime?.actualProvider === 'voicestudio' ? 'VoiceStudio' : 'ElevenLabs'
  /** A last check as the server names it: outcome, then its reason. */
  const checkOf = (part: HealthPart | null | undefined) => {
    const outcome = part?.outcome ?? t('voice.profile.notChecked')
    return part?.reason ? `${outcome} (${part.reason})` : outcome
  }

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4 px-6 py-6">
      <div>
        <h1 className="flex items-center gap-2 font-semibold text-lg tracking-tight">
          <Mic className="size-4.5" />
          {t('voice.title')}
        </h1>
        <p className="text-muted-foreground text-sm">{t('voice.lead')}</p>
      </div>

      {error ? (
        <p className="flex items-center gap-1.5 text-destructive text-sm" role="alert">
          <AlertTriangle className="size-4" /> {error}
        </p>
      ) : null}

      {!doc ? (
        error ? null : (
          <Skeleton className="h-40 w-full" />
        )
      ) : (
        <>
          <Card className="py-2" data-voice-switch>
            <CardContent className="px-2">
              <ItemGroup>
                <Item>
                  <ItemMedia variant="icon">
                    <Mic />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>{t('voice.switch.title')}</ItemTitle>
                    <ItemDescription className="line-clamp-none">
                      {t('voice.switch.description')}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <Switch
                      checked={doc.on === true}
                      disabled={!doc.writable || doc.on === null || busy !== null}
                      onCheckedChange={(on) => void press(on)}
                      aria-label={t('voice.switch.title')}
                    />
                  </ItemActions>
                </Item>
                <ItemSeparator />
                <Item size="sm">
                  <ItemContent>
                    <ItemDescription className="line-clamp-none">{t('voice.switch.seenNow')}</ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <Badge
                      data-voice-seen={state?.tone}
                      variant={state?.tone === 'on' ? 'default' : 'secondary'}
                    >
                      {state ? t(state.labelKey) : null}
                    </Badge>
                  </ItemActions>
                </Item>
                {doc.writable ? null : (
                  <p className="px-3 pb-2 text-muted-foreground text-xs">{t('voice.switch.readOnly')}</p>
                )}
              </ItemGroup>
            </CardContent>
          </Card>

          <Card className="py-2" data-voice-provider>
            <CardContent className="flex flex-col gap-3 px-5 py-3">
              <div>
                <h2 className="font-semibold text-sm">{t('voice.provider.title')}</h2>
                <p className="text-muted-foreground text-sm">
                  {t('voice.provider.active', { provider: doc.service.provider })}
                </p>
              </div>
              {doc.runtime ? (
                <p className="text-muted-foreground text-sm" data-voice-runtime>
                  {t('voice.provider.runtime', {
                    provider: doc.runtime.fallbackUsed
                      ? t('voice.provider.runtimeFallback', { provider: runtimeName })
                      : runtimeName,
                    status: doc.runtime.reason
                      ? `${doc.runtime.status} (${doc.runtime.reason})`
                      : doc.runtime.status
                  })}
                </p>
              ) : null}
              <label className="flex flex-col gap-1 text-sm">
                {t('voice.provider.label')}
                <select
                  aria-label={t('voice.provider.label')}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={provider}
                  disabled={!doc.writable || busy !== null}
                  onChange={(e) => pickProvider(e.target.value as typeof provider)}
                >
                  {(['elevenlabs', 'voicestudio'] as const).map((id) => (
                    <option key={id} value={id}>
                      {PROVIDER_NAME[id]}
                    </option>
                  ))}
                </select>
              </label>
              {provider === 'voicestudio' ? (
                <>
                  {field('baseUrl', t('voice.provider.serverUrl'), 'url')}
                  <p className="text-muted-foreground text-xs">{t('voice.provider.voicestudioServer')}</p>
                  <label className="flex flex-col gap-1 text-sm">
                    {t('voice.provider.stt')}
                    <Input
                      readOnly
                      aria-label={t('voice.provider.stt')}
                      value={
                        modelList?.models.find((model) => model.kind === 'stt' && !model.alias)?.name ??
                        t('voice.provider.activeEngine')
                      }
                    />
                    <span className="text-muted-foreground text-xs">{t('voice.provider.sttReadOnly')}</span>
                  </label>
                  {modelSelect('ttsModel', t('voice.provider.tts'))}
                  {field('voice', t('voice.provider.voice'))}
                  <p className="text-muted-foreground text-xs">{t('voice.provider.voiceHint')}</p>
                  <label className="flex flex-col gap-1 text-sm">
                    {t('voice.provider.token')}
                    <Input
                      type="password"
                      autoComplete="off"
                      value={token}
                      disabled={!doc.writable || busy !== null || removeToken}
                      placeholder={
                        doc.provider?.profiles.voicestudio.tokenConfigured
                          ? t('voice.provider.tokenKept')
                          : t('voice.provider.noToken')
                      }
                      onChange={(e) => {
                        setToken(e.target.value)
                        setProfileTest(null)
                      }}
                    />
                  </label>
                  {doc.provider?.profiles.voicestudio.tokenConfigured ? (
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={removeToken}
                        disabled={!doc.writable || busy !== null}
                        onChange={(e) => {
                          setRemoveToken(e.target.checked)
                          setProfileTest(null)
                        }}
                      />
                      {t('voice.provider.removeToken')}
                    </label>
                  ) : null}
                  <p className="text-muted-foreground text-xs">{t('voice.provider.voicestudioModels')}</p>
                </>
              ) : (
                <>
                  <p className="text-muted-foreground text-sm">{t('voice.provider.elevenlabsNote')}</p>
                  {modelSelect('sttModel', t('voice.provider.stt'))}
                  {modelSelect('ttsModel', t('voice.provider.tts'))}
                </>
              )}
              <div className="flex flex-col gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="self-start"
                  disabled={!doc.writable || busy !== null || modelsLoading}
                  onClick={() => void getModels()}
                >
                  <RefreshCw className={busy === 'models' || modelsLoading ? 'animate-spin' : ''} />
                  {busy === 'models' ? t('voice.models.getting') : t('voice.models.get')}
                </Button>
                <p className="text-muted-foreground text-xs">{t('voice.models.uses')}</p>
                {modelsLoading ? (
                  <p className="text-muted-foreground text-xs">{t('voice.models.loading')}</p>
                ) : null}
                {modelsError ? (
                  <p role="alert" className="text-destructive text-sm">
                    {modelsError}
                  </p>
                ) : null}
                {modelList ? (
                  <>
                    <p className="text-muted-foreground text-xs">
                      {modelList.source}.{' '}
                      {modelList.readAt
                        ? t('voice.models.lastRead', { when: formatDateTime(modelList.readAt) })
                        : t('voice.models.notFetched')}
                      {modelList.stale ? ` ${t('voice.models.stale')}` : ''}
                    </p>
                    {modelList.readAt && !modelList.fetchedCount ? (
                      <p className="text-muted-foreground text-xs">{t('voice.models.noEntries')}</p>
                    ) : null}
                    <details>
                      <summary className="cursor-pointer text-sm">{t('voice.models.details')}</summary>
                      <textarea
                        readOnly
                        aria-label={t('voice.models.aria')}
                        rows={6}
                        className="mt-2 w-full resize-y rounded-md border bg-transparent p-3 font-mono text-xs"
                        value={JSON.stringify(modelList.models, null, 2)}
                      />
                    </details>
                  </>
                ) : null}
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={profile.fallbackEnabled}
                  disabled={!doc.writable || busy !== null}
                  onCheckedChange={(on) => {
                    setProfile({ ...profile, fallbackEnabled: on })
                    setProfileTest(null)
                  }}
                />
                {t('voice.fallback.switch', {
                  target: provider === 'elevenlabs' ? 'VoiceStudio' : 'ElevenLabs'
                })}
              </label>
              <p className="text-muted-foreground text-xs">
                {t('voice.fallback.note', {
                  provider: provider === 'elevenlabs' ? 'ElevenLabs' : 'VoiceStudio'
                })}
              </p>
              {profile.fallbackEnabled &&
                !(provider === 'elevenlabs'
                  ? doc.provider?.profiles.voicestudio.baseUrl
                  : doc.key?.configured) && (
                  <p role="status" className="text-muted-foreground text-xs">
                    {t('voice.fallback.notConfigured')}
                  </p>
                )}
              <p className="text-muted-foreground text-xs">{t('voice.profile.testNote')}</p>
              {doc.writable ? (
                <div className="flex gap-2">
                  <Button variant="outline" disabled={busy !== null} onClick={() => void profileAction(true)}>
                    {t('voice.profile.test')}
                  </Button>
                  <Button disabled={busy !== null} onClick={() => void profileAction(false)}>
                    {t('voice.profile.apply')}
                  </Button>
                </div>
              ) : null}
              {profileTest ? (
                <div role="status" data-provider-test className="text-sm">
                  {(['stt', 'tts'] as const).map((part) => (
                    <p key={part}>
                      {t(part === 'stt' ? 'voice.profile.listening' : 'voice.profile.speaking', {
                        result:
                          profileTest[part].outcome === 'ok'
                            ? part === 'stt' && provider === 'elevenlabs'
                              ? t('voice.profile.accepted')
                              : t('voice.profile.works')
                            : t('voice.profile.unavailable', {
                                reason: profileTest[part].reason ?? t('voice.profile.unknown')
                              })
                      })}
                    </p>
                  ))}
                </div>
              ) : null}
              <div className="text-muted-foreground text-xs">
                {t('voice.profile.lastChecks', {
                  stt: checkOf(doc.health?.stt),
                  tts: checkOf(doc.health?.tts)
                })}
              </div>
            </CardContent>
          </Card>

          <Card className="py-2" data-voice-key>
            <CardContent className="flex flex-col gap-3 px-2">
              <Item size="sm">
                <ItemMedia variant="icon">
                  <KeyRound />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{t('voice.key.title')}</ItemTitle>
                  <ItemDescription
                    className="line-clamp-none"
                    data-voice-key-source={doc.key?.source ?? 'none'}
                  >
                    {keySentence(t, doc)} {t('voice.key.onlyElevenLabs')}
                  </ItemDescription>
                  {doc.key?.unreadable ? (
                    <p className="flex items-center gap-1 text-amber-700 text-xs dark:text-amber-400">
                      <AlertTriangle className="size-3" /> {t('voice.key.unreadable')}
                    </p>
                  ) : null}
                </ItemContent>
              </Item>
              {doc.writable ? (
                <div className="flex flex-col gap-2 px-3 pb-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      type="password"
                      autoComplete="off"
                      spellCheck={false}
                      className="min-w-0 flex-1 font-mono"
                      placeholder={t('voice.key.placeholder')}
                      aria-label={t('voice.key.aria')}
                      value={typed}
                      onChange={(event) => {
                        setTyped(event.target.value)
                        setTested(null)
                      }}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy !== null}
                      onClick={() => void testKey()}
                    >
                      {t('voice.key.test')}
                    </Button>
                    <Button
                      size="sm"
                      disabled={busy !== null || typed.trim() === ''}
                      onClick={() => void saveKey(typed, 'save')}
                    >
                      {t('voice.key.save')}
                    </Button>
                  </div>
                  {tested ? (
                    <p
                      className={
                        tested.ok
                          ? 'flex items-center gap-1.5 text-emerald-700 text-xs dark:text-emerald-400'
                          : 'flex items-center gap-1.5 text-destructive text-xs'
                      }
                      data-voice-test={tested.ok ? 'ok' : 'failed'}
                      role="status"
                    >
                      {tested.ok ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />}
                      {tested.ok
                        ? t(typed.trim() ? 'voice.key.worksTyped' : 'voice.key.worksInUse')
                        : t('voice.key.fails', { message: tested.message })}
                    </p>
                  ) : null}
                  {doc.key?.source === 'ops' ? (
                    <div className="flex flex-wrap items-center gap-2">
                      {confirmRemove ? (
                        <>
                          <span className="text-muted-foreground text-xs">{t('voice.key.removeAsk')}</span>
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={busy !== null}
                            onClick={() => void saveKey('', 'remove')}
                          >
                            {t('voice.key.remove')}
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setConfirmRemove(false)}>
                            {t('voice.key.keep')}
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy !== null}
                          onClick={() => setConfirmRemove(true)}
                        >
                          {t('voice.key.removeSaved')}
                        </Button>
                      )}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="py-2">
            <CardContent className="px-2">
              <ItemGroup>
                <Row icon={<Timer />} title={t('voice.limits.title')}>
                  {t('voice.limits.text', {
                    session: Math.round(doc.limits.sessionSeconds / 60),
                    silence: doc.limits.silenceSeconds,
                    account: doc.limits.accountMinutesPerDay,
                    total: doc.limits.totalMinutesPerDay
                  })}
                </Row>
                <ItemSeparator />
                <Row icon={<Gauge />} title={t('voice.keyRow.title')}>
                  {healthLine(t, 'stt', doc.health?.stt)} {healthLine(t, 'tts', doc.health?.tts)}{' '}
                  {t('voice.health.tried')}
                </Row>
                <ItemSeparator />
                <Row icon={<Gauge />} title={t('voice.today.title')}>
                  {doc.today
                    ? t('voice.today.audio', {
                        minutes: doc.today.minutes,
                        total: doc.limits.totalMinutesPerDay,
                        count: doc.today.accounts,
                        day: doc.today.day
                      })
                    : t('voice.notCounted')}
                </Row>
                {doc.speak ? (
                  <>
                    <ItemSeparator />
                    <Row icon={<AudioLines />} title={t('voice.speak.title')}>
                      {t('voice.speak.text', {
                        provider: doc.speak.service.provider,
                        model: doc.speak.service.model,
                        maxChars: doc.speak.limits.maxChars,
                        accountChars: formatNumber(doc.speak.limits.accountCharsPerDay),
                        totalChars: formatNumber(doc.speak.limits.totalCharsPerDay)
                      })}
                    </Row>
                    <ItemSeparator />
                    <Row icon={<Gauge />} title={t('voice.speak.todayTitle')}>
                      {doc.speak.today
                        ? t('voice.speak.today', {
                            chars: formatNumber(doc.speak.today.chars),
                            total: formatNumber(doc.speak.limits.totalCharsPerDay),
                            count: doc.speak.today.accounts,
                            day: doc.speak.today.day
                          })
                        : t('voice.notCounted')}
                    </Row>
                  </>
                ) : null}
              </ItemGroup>
            </CardContent>
          </Card>

          {doc.keyterms !== undefined ? (
            <Card className="py-2" data-voice-keyterms="">
              <CardContent className="flex flex-col gap-3 px-2">
                <Item size="sm">
                  <ItemMedia variant="icon">
                    <ListChecks />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>{t('voice.keyterms.title')}</ItemTitle>
                    <ItemDescription className="line-clamp-none">
                      {doc.keyterms === null
                        ? t('voice.keyterms.unread')
                        : `${t('voice.keyterms.lead', {
                            terms: doc.keyterms.limits.terms,
                            chars: doc.keyterms.limits.chars
                          })} ${
                            doc.keyterms.sites.length === 0
                              ? t('voice.keyterms.emptyNow')
                              : t('voice.keyterms.count', { count: doc.keyterms.sites.length })
                          }`}
                    </ItemDescription>
                  </ItemContent>
                </Item>
                {doc.keyterms !== null && doc.writable ? (
                  <div className="flex flex-col gap-2 px-3 pb-2">
                    <textarea
                      aria-label={t('voice.keyterms.aria')}
                      rows={4}
                      spellCheck={false}
                      className="w-full resize-y rounded-md border border-input bg-transparent p-3 font-mono text-sm"
                      placeholder={t('voice.keyterms.placeholder')}
                      value={pilot}
                      disabled={busy !== null}
                      onChange={(event) => setPilot(event.target.value)}
                    />
                    <Button
                      size="sm"
                      className="self-start"
                      disabled={busy !== null}
                      onClick={() => void savePilot()}
                    >
                      {busy === 'keyterms' ? t('voice.keyterms.saving') : t('voice.keyterms.save')}
                    </Button>
                  </div>
                ) : doc.keyterms !== null && doc.keyterms.sites.length > 0 ? (
                  <p className="px-3 pb-2 font-mono text-muted-foreground text-xs">
                    {doc.keyterms.sites.join(', ')}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {doc.turns !== undefined ? (
            <Card className="py-2" data-voice-turns="">
              <CardContent className="px-2">
                <ItemGroup>
                  <Item size="sm">
                    <ItemMedia variant="icon">
                      <Watch />
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>{t('voice.turns.title')}</ItemTitle>
                      <ItemDescription className="line-clamp-none">
                        {doc.turns === null ? t('voice.notCounted') : t('voice.turns.lead')}
                      </ItemDescription>
                      {doc.turns !== null ? <TurnTable day={doc.turns.day} week={doc.turns.week} /> : null}
                    </ItemContent>
                  </Item>
                </ItemGroup>
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  )
}
