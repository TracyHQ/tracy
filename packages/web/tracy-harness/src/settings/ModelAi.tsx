/**
 * `/ops/model` — the providers this deployment holds credentials for, and which job each one does.
 *
 * THE SHAPE COMES FROM `tracy-desk`'s Settings → Providers (Lee, 22/09): a list on the left, the
 * chosen provider on the right, with API key, host and a model list. What is deliberately NOT
 * copied is its sixty-two-provider catalog — this is one company's fleet, and every entry is a
 * credential somebody has to hold, rotate and pay for.
 *
 * 🔒 THE KEY FIELD IS WRITE-ONLY. The door never answers a key, so the input starts EMPTY even for
 * a provider that has one, with the hint (`sk-or-…  (51 chars)`) beside it. Saving an untouched
 * form must not clear the credential, so an empty field is sent as "unchanged" and removal is a
 * separate, named press.
 *
 * ⚠ FOUR JOBS, AND THEY DO NOT ALL RUN HERE. `web` is spent by this process. `seedText`,
 * `seedImage` and `agent` are spent inside `tracy-dsh` and inside a customer's own container, which
 * read their keys from a file on that machine — so assigning them is not enough, the keys have to
 * be PUSHED. The screen says so rather than letting a saved assignment look like a delivered one.
 */
import {
  Button,
  Card,
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  cn,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Skeleton,
  Switch,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@tracy/ui'
import {
  AlertTriangle,
  Braces,
  Brain,
  Check,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Plus,
  RefreshCw,
  ScanEye,
  Trash2,
  Upload,
  Wrench,
  Zap
} from 'lucide-react'
import { type ReactNode, useCallback, useEffect, useState } from 'react'

import { formatNumber, type T, tr, useT } from '../i18n'
import type { Assignment, Capability, Door, ModelRow } from './llm-api'
import {
  assignDoor,
  fetchLlm,
  type LlmPayload,
  listModels,
  type ProbeResult,
  type Provider,
  pushKeys,
  removeProvider,
  saveModelAliases,
  saveProvider,
  testProvider,
  testVision
} from './llm-api'

/**
 * What a model can do, in five glyphs.
 *
 * 🔒 IT DRAWS ONLY WHAT THE PROVIDER DECLARED. A capability the provider said nothing about
 * (`null`) is simply absent from the strip — not a greyed-out icon, which would read as "cannot".
 * Only OpenRouter publishes this shape today, so a model from anywhere else shows no strip at all,
 * and that is the honest picture rather than a row of crosses.
 */
const CAP_ICON: Record<Capability, ReactNode> = {
  draws: <ImageIcon />,
  vision: <ScanEye />,
  reasoning: <Brain />,
  tools: <Wrench />,
  json: <Braces />
}

/** Examples in empty fields, the same in every language. */
const EXAMPLE_MODEL = 'deepseek-chat'
const EXAMPLE_HOST = 'https://api.example.com/v1'

const isCapability = (id: string): id is Capability => Object.hasOwn(CAP_ICON, id)

/**
 * Each capability's name in the language on screen; one the dictionary does not know keeps the
 * server's (`CAPABILITIES` in `apps/tracy-web/src/lib/llm-catalog.js`).
 */
function capabilityLabels(t: T, data: LlmPayload): Record<Capability, string> {
  const out = Object.fromEntries((data.capabilities ?? []).map((c) => [c.id, c.label])) as Record<
    Capability,
    string
  >
  for (const id of Object.keys(CAP_ICON)) if (isCapability(id)) out[id] = t(`settings.model.cap.${id}`)
  return out
}

/** Capabilities as they read inside a sentence, joined. */
const capsInline = (t: T, caps: readonly Capability[]) =>
  caps.map((c) => t(`settings.model.capInline.${c}`)).join(', ')

const DOOR_IDS: readonly string[] = [
  'web',
  'assistant',
  'seedText',
  'woEditorial',
  'vision',
  'seedImage',
  'agent'
]
const WHERE_KEY: Record<string, string> = {
  'this process': 'settings.model.door.where.process',
  'tracy-dsh': 'settings.model.door.where.dsh',
  'tracy-dsh, and the customer site container': 'settings.model.door.where.dshAndSite'
}

/** A job's name, sentence and machine in the language on screen; an unknown job keeps the server's words. */
function doorText(t: T, door: Door): { label: string; blurb: string; where: string } {
  const where = Object.hasOwn(WHERE_KEY, door.where) ? t(WHERE_KEY[door.where]) : door.where
  if (!DOOR_IDS.includes(door.id)) return { label: door.label, blurb: door.blurb, where }
  return {
    label: t(`settings.model.door.${door.id}.label`),
    blurb: t(`settings.model.door.${door.id}.blurb`, { fallback: t('settings.model.door.web.label') }),
    where
  }
}

/** `1000000` → `1M`, `128000` → `128k`. A model picker with raw token counts is a wall of digits. */
function shortContext(n: number | null): string | null {
  if (!n) return null
  if (n >= 1_000_000) return `${Math.round(n / 100_000) / 10}M`.replace('.0', '')
  if (n >= 1000) return `${Math.round(n / 1000)}k`
  return String(n)
}

function CapabilityStrip({
  model,
  labels,
  className,
  // In a list, the icons and the context window are two COLUMNS, not one run of glyphs: model ids
  // vary from 12 to 45 characters, so anything that follows them inline lands at a different x on
  // every row and stops being scannable. The caller places each part in a fixed-width cell.
  show = 'all'
}: {
  model: ModelRow
  labels: Record<Capability, string>
  className?: string
  show?: 'all' | 'icons' | 'context'
}) {
  const t = useT()
  const on = (Object.keys(CAP_ICON) as Capability[]).filter((cap) => model[cap] === true)
  const ctx = show === 'icons' ? null : shortContext(model.context)
  if ((show === 'context' ? 0 : on.length) === 0 && !ctx) return null
  return (
    <span className={cn('flex flex-none items-center gap-1 text-muted-foreground', className)}>
      {(show === 'context' ? [] : on).map((cap) => (
        <Tooltip key={cap}>
          {/*
            A real tooltip, not the browser's `title`. The native one waits about a second before
            it appears, which on a strip of five unlabelled glyphs means most people never see it
            — and a glyph nobody can name is decoration (Lee, 22/09). `TooltipProvider delay={0}`
            below makes it immediate, the same treatment the rail already gives its icon mode.
          */}
          <TooltipTrigger
            render={<span className="inline-flex cursor-help [&_svg]:size-3.5" aria-label={labels[cap]} />}
          >
            {CAP_ICON[cap]}
          </TooltipTrigger>
          <TooltipContent side="top">{labels[cap]}</TooltipContent>
        </Tooltip>
      ))}
      {ctx ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <span
                className="cursor-help text-[10px] tabular-nums"
                aria-label={t('settings.model.contextWindow')}
              />
            }
          >
            {ctx}
          </TooltipTrigger>
          {/* The number spelled out: `164k` is short enough to fit and vague enough to misread. */}
          <TooltipContent side="top">
            {t('settings.model.contextTokens', {
              tokens: model.context == null ? '' : formatNumber(model.context)
            })}
          </TooltipContent>
        </Tooltip>
      ) : null}
    </span>
  )
}

/**
 * What is wrong with this model for this job — the WARNING half.
 *
 * The door already refuses what it can prove (`requires`, e.g. the pictures job and a model whose
 * declared output is text only). This is the other half Lee asked for: a model that will work but
 * works worse, said out loud instead of left for somebody to discover in a customer's site.
 */
function mismatchFor(t: T, door: Door, model: ModelRow | undefined): string | null {
  if (!model) return door.requires?.length ? t('settings.model.mismatch.unknown') : null
  const missing = (door.prefers ?? []).filter((cap) => model[cap] === false)
  if (missing.length > 0)
    return t('settings.model.mismatch.lacks', { model: model.id, caps: capsInline(t, missing) })
  // The pictures job with a model nobody has vouched for: not refused (the door cannot prove it),
  // but worth saying, because the failure is a site with no photographs and no error.
  if (door.requires?.some((cap) => model[cap] === null))
    return t('settings.model.mismatch.undeclared', { model: model.id, caps: capsInline(t, door.requires) })
  return null
}

/** A provider row in the left list. */
function ProviderRow({
  provider,
  active,
  onPick
}: {
  provider: Provider
  active: boolean
  onPick: () => void
}) {
  const t = useT()
  return (
    <button
      type="button"
      onClick={onPick}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors',
        active ? 'bg-muted font-medium' : 'hover:bg-muted/60'
      )}
    >
      <span className="min-w-0 flex-1 truncate">{provider.name}</span>
      {provider.keyUnreadable ? (
        <AlertTriangle
          className="size-3.5 text-amber-600"
          aria-label={t('settings.model.keyUnreadableMark')}
        />
      ) : provider.enabled ? (
        <span className="size-2 rounded-full bg-primary" aria-label={t('settings.model.inServiceMark')} />
      ) : null}
    </button>
  )
}

function ProbeNotice({ probe }: { probe: ProbeResult }) {
  const t = useT()
  return (
    <p
      className={cn('mt-2 text-xs', probe.ok ? 'text-muted-foreground' : 'text-destructive')}
      role={probe.ok ? undefined : 'alert'}
    >
      {probe.ok ? (
        t('settings.model.answeredIn', { ms: probe.latencyMs })
      ) : (
        <>
          {/* The vendor's own sentence — "Insufficient Balance" is the reason somebody opened this
              screen, and flattening it into "could not reach provider" throws that away. */}
          {probe.status ? `HTTP ${probe.status}. ` : ''}
          {probe.detail}
        </>
      )}
    </p>
  )
}

export function ModelAi() {
  const t = useT()
  const [data, setData] = useState<LlmPayload | null>(null)
  const [failed, setFailed] = useState(false)
  const [picked, setPicked] = useState<string | null>(null)
  const [keyDraft, setKeyDraft] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [urlDraft, setUrlDraft] = useState('')
  const [probeModel, setProbeModel] = useState('')
  const [probe, setProbe] = useState<ProbeResult | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const body = await fetchLlm()
    setData(body)
    setFailed(body === null)
    return body
  }, [])

  /**
   * 🔒 A LIST SAVED BEFORE CAPABILITIES WERE RECORDED LOOKS LIKE A LIST OF MODELS THAT CAN DO
   * NOTHING. Rows read before 22/09 carry `id` and `name` only, so every glyph and every context
   * window vanished from the picker with no sign of why — measured on the dev stand: OpenRouter's 444
   * rows and DeepSeek's 2, read at 16:49 and 16:51 UTC, two hours before the code that records
   * capabilities landed (Lee, 23/09). The shape says which lists these are — `context` is absent,
   * not null — so they are read again once, on open, the same way a never-read list already is.
   */
  const [rereading, setRereading] = useState<string[]>([])
  useEffect(() => {
    let cancelled = false
    reload().then(async (body) => {
      const stale = (body?.providers ?? []).filter(
        (p) => p.models.length > 0 && p.models.every((m) => !('context' in m))
      )
      if (cancelled || stale.length === 0) return
      setRereading(stale.map((p) => p.name))
      for (const p of stale) {
        const answer = await listModels(p.id)
        if (answer?.error) setNotice(tr('settings.model.rereadFailed', { name: p.name, error: answer.error }))
      }
      if (cancelled) return
      setRereading([])
      await reload()
    })
    return () => {
      cancelled = true
    }
  }, [reload])

  const provider = data?.providers.find((p) => p.id === picked) ?? null
  // A catalog entry with no row yet: picking it means "configure this one", not "open it".
  const unconfigured = (data?.catalog ?? []).filter((c) => !data?.providers.some((p) => p.id === c.id))

  const pick = (id: string) => {
    setPicked(id)
    setProbe(null)
    setKeyDraft('')
    setShowKey(false)
    const row = data?.providers.find((p) => p.id === id)
    setUrlDraft(row?.baseUrlOverridden ? row.baseUrl : '')
    setProbeModel(row?.models?.[0]?.id ?? '')
  }

  const save = async (patch: Record<string, unknown>) => {
    if (!picked) return
    setBusy('save')
    const preset = data?.catalog.find((c) => c.id === picked)
    await saveProvider(picked, {
      presetId: provider?.presetId ?? preset?.id ?? null,
      ...(urlDraft ? { baseUrl: urlDraft } : {}),
      // 🔒 An empty field is NOT sent: the door reads an absent key as "unchanged" and an empty
      // string as "remove". Sending '' here would disarm the provider on every unrelated save.
      ...(keyDraft ? { apiKey: keyDraft } : {}),
      ...patch
    })
    setKeyDraft('')
    await reload()
    setBusy(null)
  }

  const runProbe = async () => {
    if (!picked || !probeModel) return
    setBusy('test')
    setProbe(null)
    // Save first, so Test measures what the form says rather than what was stored an edit ago.
    if (keyDraft || urlDraft) await save({})
    setProbe(await testProvider(picked, probeModel))
    setBusy(null)
  }

  const refreshModels = async () => {
    if (!picked) return
    setBusy('models')
    const answer = await listModels(picked)
    if (answer?.error) setNotice(t('settings.model.listFailed', { error: answer.error }))
    await reload()
    setBusy(null)
  }

  const push = async () => {
    setBusy('push')
    const answer = await pushKeys()
    const code = answer?.code ?? t('settings.model.noAnswer')
    setNotice(
      answer?.ok
        ? t('settings.model.pushed', { files: answer.wrote?.join(', ') ?? '', host: answer.host ?? '' })
        : answer?.detail
          ? t('settings.model.pushFailedDetail', { code, detail: answer.detail })
          : t('settings.model.pushFailed', { code })
    )
    setBusy(null)
  }

  if (failed)
    return (
      <div className="px-8 py-7">
        <h1 className="font-semibold text-xl tracking-tight">{t('settings.model.title')}</h1>
        {/* This door refuses a role below admin outright, which is the likeliest reason to land
            here — so the message names that rather than implying something is broken. */}
        <p className="mt-2 text-muted-foreground text-sm">{t('settings.model.readFailed')}</p>
      </div>
    )

  return (
    // `delay={0}`: these glyphs are the only name a capability has on this screen, so waiting is
    // the difference between a legend and a decoration.
    <TooltipProvider delay={0}>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex-none px-8 pt-7 pb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="font-semibold text-xl tracking-tight">{t('settings.model.title')}</h1>
              <p className="mt-1 text-muted-foreground text-sm">{t('settings.model.blurb')}</p>
            </div>
            <Button variant="outline" size="sm" onClick={push} disabled={busy !== null}>
              <Upload />
              {t('settings.model.push')}
            </Button>
          </div>
          {notice ? (
            <p className="mt-3 rounded-lg bg-muted px-3 py-2 text-sm" role="status">
              {notice}
            </p>
          ) : null}
          {rereading.length > 0 ? (
            <p className="mt-3 flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm" role="status">
              <RefreshCw className="size-3.5 animate-spin" />
              {t('settings.model.rereading', { names: rereading.join(', ') })}
            </p>
          ) : null}
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-6 px-8 pb-8 lg:flex-row">
          <nav className="flex w-full flex-none flex-col gap-1 lg:w-56">
            {!data ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <>
                {data.providers.map((p) => (
                  <ProviderRow key={p.id} provider={p} active={p.id === picked} onPick={() => pick(p.id)} />
                ))}
                {data.providers.length > 0 && unconfigured.length > 0 ? <Separator className="my-2" /> : null}
                {/* The rest of the catalog, plainly marked — a provider Tracy could use but has no
                  credential for is a different thing from one that is switched off. */}
                {unconfigured.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => pick(c.id)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-muted-foreground text-sm hover:bg-muted/60',
                      c.id === picked && 'bg-muted text-foreground'
                    )}
                  >
                    <Plus className="size-3.5" />
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  </button>
                ))}
              </>
            )}
          </nav>

          <div className="min-w-0 flex-1">
            {!data ? (
              <Skeleton className="h-64 w-full" />
            ) : !picked ? (
              <p className="text-muted-foreground text-sm">{t('settings.model.pickProvider')}</p>
            ) : (
              <ProviderPanel
                data={data}
                key={picked}
                picked={picked}
                provider={provider}
                keyDraft={keyDraft}
                setKeyDraft={setKeyDraft}
                showKey={showKey}
                setShowKey={setShowKey}
                urlDraft={urlDraft}
                setUrlDraft={setUrlDraft}
                probeModel={probeModel}
                setProbeModel={setProbeModel}
                probe={probe}
                busy={busy}
                onSave={save}
                onProbe={runProbe}
                onModels={refreshModels}
                onAliasesSaved={async () => {
                  await reload()
                }}
                onDelete={async () => {
                  const answer = await removeProvider(picked)
                  if (answer?.error === 'PROVIDER_IN_USE')
                    setNotice(t('settings.model.inUse', { doors: answer.doors.join(', ') }))
                  else {
                    setPicked(null)
                    await reload()
                  }
                }}
              />
            )}

            {data ? <Doors data={data} onChange={reload} setNotice={setNotice} /> : null}
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}

function ProviderPanel(props: {
  data: LlmPayload
  picked: string
  provider: Provider | null
  keyDraft: string
  setKeyDraft: (v: string) => void
  showKey: boolean
  setShowKey: (v: boolean) => void
  urlDraft: string
  setUrlDraft: (v: string) => void
  probeModel: string
  setProbeModel: (v: string) => void
  probe: ProbeResult | null
  busy: string | null
  onSave: (patch: Record<string, unknown>) => Promise<void>
  onProbe: () => Promise<void>
  onModels: () => Promise<void>
  onAliasesSaved: () => Promise<void>
  onDelete: () => Promise<void>
}) {
  const t = useT()
  const { data, picked, provider, busy } = props
  const preset = data.catalog.find((c) => c.id === picked)
  const name = provider?.name ?? preset?.name ?? picked
  const keyOptional = provider?.keyOptional ?? preset?.keyOptional ?? false
  const [aliases, setAliases] = useState<Record<string, string>>(provider?.modelAliases ?? {})
  const [providerAlias, setProviderAlias] = useState(provider?.providerAlias ?? '')
  useEffect(() => {
    setProviderAlias(provider?.providerAlias ?? '')
  }, [provider?.providerAlias])
  const [aliasBusy, setAliasBusy] = useState(false)
  const [aliasNotice, setAliasNotice] = useState('')
  useEffect(() => {
    setAliases(provider?.modelAliases ?? {})
  }, [provider?.modelAliases])
  const saveAliases = async () => {
    setAliasBusy(true)
    setAliasNotice('')
    try {
      const answer = await saveModelAliases(picked, aliases, providerAlias)
      if (!answer?.aliases) {
        setAliasNotice(
          t('settings.model.provider.aliasesSaveFailed', {
            error: answer?.error ?? t('settings.model.noAnswer')
          })
        )
        return
      }
      await props.onAliasesSaved()
      setAliasNotice(t('settings.model.provider.aliasesSaved'))
    } finally {
      setAliasBusy(false)
    }
  }

  return (
    <Card className="gap-0 px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-medium text-base">{name}</h2>
          {(provider?.note ?? preset?.note) ? (
            <p className="mt-0.5 text-muted-foreground text-xs">{provider?.note ?? preset?.note}</p>
          ) : null}
        </div>
        <label className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">{t('settings.model.provider.inService')}</span>
          <Switch
            checked={provider?.enabled ?? false}
            disabled={busy !== null || (!provider?.configured && !keyOptional)}
            onCheckedChange={(next) => props.onSave({ enabled: next })}
          />
        </label>
      </div>

      <Separator className="my-3" />

      {provider?.keyUnreadable ? (
        // Its own message, because the cause is specific and the fix is specific.
        <p className="mb-3 rounded-lg bg-amber-500/10 px-3 py-2 text-amber-800 text-xs dark:text-amber-300">
          {t('settings.model.provider.keyUnreadable')}
        </p>
      ) : null}

      <label className="block">
        <span className="text-muted-foreground text-xs">{t('settings.model.provider.apiKey')}</span>
        <InputGroup className="mt-1">
          <InputGroupInput
            type={props.showKey ? 'text' : 'password'}
            value={props.keyDraft}
            autoComplete="off"
            spellCheck={false}
            // Empty even when a key IS set: the door never answers one, so there is nothing
            // truthful to prefill. The hint below says which key is in place.
            placeholder={
              provider?.configured
                ? t('settings.model.provider.keySet')
                : preset?.keyPrefix
                  ? `${preset.keyPrefix}…`
                  : t('settings.model.provider.enterKey')
            }
            onChange={(e) => props.setKeyDraft(e.target.value)}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              type="button"
              aria-label={t(
                props.showKey ? 'settings.model.provider.hideKey' : 'settings.model.provider.showKey'
              )}
              onClick={() => props.setShowKey(!props.showKey)}
            >
              {props.showKey ? <EyeOff /> : <Eye />}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </label>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-xs">
        {provider?.keyHint ? <span className="font-mono">{provider.keyHint}</span> : null}
        {keyOptional ? <span>{t('settings.model.provider.noKeyNeeded')}</span> : null}
        {(provider?.apiKeyUrl ?? preset?.apiKeyUrl) ? (
          <a
            href={provider?.apiKeyUrl ?? preset?.apiKeyUrl ?? '#'}
            target="_blank"
            rel="noreferrer noopener"
            className="underline"
          >
            {t('settings.model.provider.getKey')}
          </a>
        ) : null}
      </p>

      <label className="mt-4 block">
        <span className="text-muted-foreground text-xs">
          {t('settings.model.provider.apiHost')}{' '}
          <span className="text-muted-foreground/70">
            —{' '}
            {preset?.baseUrl
              ? t('settings.model.provider.apiHostHint', { url: preset.baseUrl })
              : t('settings.model.provider.apiHostHintDefault')}
          </span>
        </span>
        <Input
          className="mt-1 font-mono text-[13px]"
          value={props.urlDraft}
          placeholder={preset?.baseUrl ?? EXAMPLE_HOST}
          onChange={(e) => props.setUrlDraft(e.target.value)}
        />
      </label>

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <label className="min-w-0 flex-1">
          <span className="text-muted-foreground text-xs">{t('settings.model.provider.testModel')}</span>
          {provider && provider.models.length > 0 ? (
            <Select value={props.probeModel} onValueChange={(v) => v !== null && props.setProbeModel(v)}>
              <SelectTrigger size="sm" className="mt-1 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {provider.models.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              className="mt-1 font-mono text-[13px]"
              value={props.probeModel}
              placeholder={EXAMPLE_MODEL}
              onChange={(e) => props.setProbeModel(e.target.value)}
            />
          )}
        </label>
        <Button size="sm" variant="outline" onClick={props.onModels} disabled={busy !== null}>
          <RefreshCw className={cn(busy === 'models' && 'animate-spin')} />
          {t('settings.model.provider.getModels')}
        </Button>
        {/* 🔒 A real inference call, not a `/models` read: a key with no chat entitlement, or one
            out of money, lists models happily. */}
        <Button size="sm" onClick={props.onProbe} disabled={busy !== null || !props.probeModel}>
          <Zap />
          {t('settings.model.provider.test')}
        </Button>
      </div>
      {props.probe ? <ProbeNotice probe={props.probe} /> : null}
      <div className="mt-4 space-y-3">
        <label className="block text-xs">
          <span className="text-muted-foreground">{t('settings.model.provider.modelList')}</span>
          <textarea
            readOnly
            aria-label={t('settings.model.provider.modelList')}
            rows={6}
            className="mt-1 w-full resize-y rounded-md border bg-transparent p-3 font-mono text-xs"
            value={JSON.stringify(provider?.models ?? [], null, 2)}
          />
        </label>
        <p className="text-muted-foreground text-xs">{t('settings.model.provider.aliasesHelp')}</p>
        <label className="block space-y-1 text-xs">
          <span>{t('settings.model.provider.providerAlias')}</span>
          <Input
            aria-label={t('settings.model.provider.providerAlias')}
            maxLength={120}
            value={providerAlias}
            placeholder={provider?.name ?? picked}
            onChange={(event) => setProviderAlias(event.target.value)}
          />
        </label>
        {provider && provider.models.length > 0 ? (
          <>
            <div className="max-h-80 overflow-y-auto rounded-md border">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b">
                    <th className="p-2">{t('settings.model.provider.modelId')}</th>
                    <th className="p-2">{t('settings.model.provider.alias')}</th>
                  </tr>
                </thead>
                <tbody>
                  {provider.models.map((model) => (
                    <tr key={model.id} className="border-b last:border-0">
                      <td className="max-w-64 break-all p-2 font-mono" title={model.name}>
                        {model.id}
                      </td>
                      <td className="p-2">
                        <Input
                          aria-label={t('settings.model.provider.aliasFor', { model: model.id })}
                          maxLength={120}
                          value={aliases[model.id] ?? ''}
                          placeholder={model.name}
                          onChange={(event) =>
                            setAliases((current) => ({ ...current, [model.id]: event.target.value }))
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="text-muted-foreground text-xs">{t('settings.model.provider.aliasesNeedList')}</p>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={saveAliases}
          disabled={!provider || aliasBusy || busy !== null}
        >
          {t('settings.model.provider.saveAliases')}
        </Button>
        {aliasNotice && (
          <p role="status" className="text-muted-foreground text-xs">
            {aliasNotice}
          </p>
        )}
      </div>

      <Separator className="my-4" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button size="sm" onClick={() => props.onSave({})} disabled={busy !== null}>
          <Check />
          {t('settings.common.save')}
        </Button>
        {provider ? (
          <Button size="sm" variant="ghost" onClick={props.onDelete} disabled={busy !== null}>
            <Trash2 />
            {t('settings.model.provider.remove')}
          </Button>
        ) : null}
      </div>
    </Card>
  )
}

/**
 * Which provider AND which model answers each of the four jobs.
 *
 * ⚠ THE MODEL IS PICKED PER JOB, NOT INHERITED. The first cut of this screen took `models[0]`
 * whenever a provider was chosen; on the real OpenRouter catalogue that is `anthropic/claude-opus-5.5`,
 * whose declared output is `['text']` — so the PICTURES job silently got a model that cannot draw,
 * and a customer's site would have come out with no photographs and no error anywhere (Lee caught
 * it on screen, 22/09). Two controls per row, and the pictures job says which models can actually
 * answer it.
 */
function DoorRow({
  door,
  data,
  current,
  labels,
  onChange,
  setNotice
}: {
  door: Door
  data: LlmPayload
  current: Assignment | null
  labels: Record<Capability, string>
  onChange: () => Promise<unknown>
  setNotice: (s: string) => void
}) {
  /**
   * 🔒 THE CHOSEN PROVIDER IS LOCAL STATE, AND THAT IS THE WHOLE FIX. The first cut sent the
   * provider straight to the door; but a job that needs a model cannot be saved from the provider
   * alone, so the door refused, nothing was written, and the picker snapped back to what was
   * stored. On screen that reads as "I cannot switch to OpenRouter" — measured by Lee, 22/09.
   * Holding the half-made choice here lets the row show it immediately and ask for the second
   * half, which is what a two-part choice actually needs.
   */
  const t = useT()
  const text = doorText(t, door)
  const [draftProvider, setDraftProvider] = useState<string | null>(null)
  const [reading, setReading] = useState(false)
  const [testingVision, setTestingVision] = useState(false)
  const [visionRequestKey, setVisionRequestKey] = useState<string | null>(null)
  const [visionNotice, setVisionNotice] = useState<string | null>(null)
  const providerId = draftProvider ?? current?.providerId ?? ''
  const provider = data.providers.find((p) => p.id === providerId) ?? null
  const chosen = provider?.models.find((m) => m.id === current?.model)
  const effortOptions = provider?.effortOptions?.[current?.model ?? '']
  const warning = current?.model ? mismatchFor(t, door, chosen) : null

  const ready = data.providers.filter((p) => p.enabled && (p.configured || p.keyOptional))
  // For the pictures job, offer the models that can answer it: the ones the provider says draw,
  // plus the ones it said nothing about. A model it declared text-only is not a choice here.
  const offered = (provider?.models ?? []).filter(
    (m) => !door.requires?.length || door.requires.every((cap) => m[cap] !== false)
  )
  const hidden = (provider?.models ?? []).length - offered.length
  /** The model this row is currently showing — the stored one, unless a new provider was picked. */
  const shownModel = draftProvider && draftProvider !== current?.providerId ? '' : (current?.model ?? '')

  const pickProvider = async (nextId: string) => {
    setDraftProvider(nextId)
    const next = data.providers.find((p) => p.id === nextId)
    if (!door.needsModel) {
      // The agent's row: the provider IS the whole choice, so save it straight away.
      const answer = await assignDoor(door.id, nextId, null)
      if (answer?.error) setNotice(`${text.label}: ${answer.error}`)
      setDraftProvider(null)
      await onChange()
      return
    }
    // 🔒 READ THE MODELS FOR THEM, AND SAY SO WHILE IT HAPPENS. Switching to a provider whose list
    // has never been read used to leave an empty picker with no explanation — the person had to
    // guess that "Get model list" up in the panel was the missing step. One fetch, one visible
    // "Reading models…", and the second half of the choice is there to make.
    if (next && next.models.length === 0) {
      setReading(true)
      const answer = await listModels(nextId)
      setReading(false)
      if (answer?.error)
        setNotice(t('settings.model.door.readFailed', { name: next.name, error: answer.error }))
      await onChange()
    }
  }

  const pickModel = async (model: string) => {
    if (!providerId) return
    const answer = await assignDoor(door.id, providerId, model)
    if (answer?.error === 'MODEL_CANNOT_DRAW' || answer?.error === 'MODEL_CAPABILITY_MISMATCH')
      setNotice(
        t('settings.model.mismatch.refused', {
          door: text.label,
          model: answer.model ?? model,
          caps: capsInline(t, (answer.lacking ?? ['draws']).filter(isCapability))
        })
      )
    else if (answer?.error) setNotice(`${text.label}: ${answer.error}`)
    else setDraftProvider(null)
    await onChange()
  }

  const checkVision = async () => {
    const requestKey = visionRequestKey ?? data.visionTest?.active?.requestKey ?? crypto.randomUUID()
    setVisionRequestKey(requestKey)
    setTestingVision(true)
    try {
      const answer = await testVision(requestKey)
      setVisionNotice(
        answer?.state === 'succeeded'
          ? t('settings.model.vision.testPassed', {
              model: answer.model ?? '',
              cents: answer.costCents ?? ''
            })
          : (answer?.error ??
              (answer?.state
                ? t('settings.model.vision.testState', { state: answer.state })
                : t('settings.model.vision.noResponse')))
      )
      if (answer?.state === 'succeeded' || answer?.state === 'failed') setVisionRequestKey(null)
      await onChange()
    } finally {
      setTestingVision(false)
    }
  }

  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-sm">{text.label}</p>
        <p className="mt-0.5 text-muted-foreground text-xs">{text.blurb}</p>
        {/* ⚠ Where it RUNS, on every row: three of the four are spent on another machine, and an
            assignment there is not delivered until the keys are pushed. */}
        <p className="mt-0.5 text-[11px] text-muted-foreground/80">
          {t('settings.model.door.runsIn', { where: text.where })}
        </p>
      </div>
      <div className="flex flex-none flex-col items-end gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={providerId} onValueChange={(next) => next && pickProvider(next)}>
            <SelectTrigger size="sm" className="w-[10rem]">
              <SelectValue>
                {(id) => data.providers.find((p) => p.id === id)?.name ?? t('settings.model.door.notSet')}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {ready.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* The agent's row has no model picker at all: its model is chosen by the dsh runtime,
              and offering one here would be a control nothing reads. */}
          {door.needsModel && provider ? (
            reading ? (
              <span className="flex w-[15rem] items-center gap-2 text-muted-foreground text-xs">
                <RefreshCw className="size-3.5 animate-spin" />
                {t('settings.model.door.readingModels', { name: provider.name })}
              </span>
            ) : offered.length > 0 ? (
              /*
                🔒 A COMBOBOX, NOT A SELECT, AND THE REASON IS THE COUNT. OpenRouter answers with
                444 models; a Select is a scroll through all of them, and widening it only makes
                the scroll wider (Lee, 22/09). Typing is the only way to find `gemini-3.1-flash`
                among them. The provider picker beside it stays a Select on purpose — eight
                entries, all of them worth seeing at once.
              */
              <Combobox
                items={offered.map((m) => m.id)}
                value={shownModel}
                onValueChange={(next) => typeof next === 'string' && next && pickModel(next)}
              >
                <ComboboxInput
                  placeholder={t('settings.model.door.pickModel')}
                  // 🔒 SELECT WHAT IS THERE, so typing REPLACES it. The field shows the model in
                  // force, so a first keystroke otherwise lands after `x-ai/grok-4.7` and matches
                  // nothing — measured: typing `gemini` gave zero results and looked like broken
                  // filtering rather than a full field.
                  onFocus={(e) => e.currentTarget.select()}
                  className={cn('w-[15rem] font-mono text-[12px]', !shownModel && 'ring-1 ring-primary/40')}
                />
                {/* Wider than its anchor and anchored to the RIGHT: a 40rem popup hung from a
                    15rem field on the right of the page would otherwise run off the edge, which
                    is exactly where the ids were being cut off. */}
                <ComboboxContent align="end" className="max-h-96 w-[40rem] max-w-[calc(100vw-3rem)]">
                  <ComboboxEmpty>{t('settings.model.door.noMatch')}</ComboboxEmpty>
                  <ComboboxList>
                    {(modelId: string) => {
                      const m = offered.find((x) => x.id === modelId)
                      if (!m) return null
                      return (
                        <ComboboxItem key={m.id} value={m.id}>
                          {/* Three columns, fixed on the right, so the glyphs and the context
                              window line up down the list instead of trailing each id. */}
                          <span className="flex w-full min-w-0 items-center gap-3">
                            <span className="min-w-0 flex-1 truncate font-mono text-[12px]">{m.id}</span>
                            <CapabilityStrip
                              model={m}
                              labels={labels}
                              show="icons"
                              className="w-[6.5rem] flex-none justify-end"
                            />
                            <CapabilityStrip
                              model={m}
                              labels={labels}
                              show="context"
                              className="w-10 flex-none justify-end"
                            />
                          </span>
                        </ComboboxItem>
                      )
                    }}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
            ) : (
              // The provider answered with no usable model — a free field rather than a dead
              // control, because a model released this morning must still be usable.
              <Input
                className="w-[15rem] font-mono text-[12px]"
                defaultValue={shownModel}
                placeholder={t('settings.model.door.modelId')}
                onBlur={(e) => e.target.value && pickModel(e.target.value)}
              />
            )
          ) : null}
          {door.configurableEffort && current?.model && draftProvider === null ? (
            effortOptions?.mode === 'selectable' ? (
              <label className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">{t('settings.model.door.effort')}</span>
                <Select
                  value={current.effort ?? ''}
                  onValueChange={async (effort) => {
                    if (!effort) return
                    const answer = await assignDoor(door.id, providerId, current.model, effort)
                    if (answer?.error) setNotice(`${text.label}: ${answer.error}`)
                    await onChange()
                  }}
                >
                  <SelectTrigger size="sm" className="w-28" aria-label={t('settings.model.door.effortAria')}>
                    <SelectValue placeholder={t('settings.model.door.chooseEffort')} />
                  </SelectTrigger>
                  <SelectContent>
                    {effortOptions.choices.map((effort) => (
                      <SelectItem key={effort} value={effort}>
                        {effort}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            ) : (
              <p className="max-w-[26rem] text-muted-foreground text-xs">
                {effortOptions?.mode === 'unknown'
                  ? t('settings.model.door.effortUnknown')
                  : t('settings.model.door.effortUnsupported')}
              </p>
            )
          ) : null}
        </div>
        {chosen ? <CapabilityStrip model={chosen} labels={labels} className="pe-0.5" /> : null}
        {door.id === 'vision' ? (
          <div className="max-w-[26rem] space-y-2 text-right text-xs">
            <p className="text-muted-foreground" role="status">
              {data.visionTest?.state === 'passed'
                ? t('settings.model.vision.passed', { model: data.visionTest.model ?? '' })
                : (data.visionTest?.error ?? t('settings.model.vision.required'))}
            </p>
            {current?.model && draftProvider === null ? (
              <div className="space-y-1">
                <label className="flex items-center justify-end gap-2">
                  <span className="text-muted-foreground">{t('settings.model.vision.menuReasoning')}</span>
                  <Select
                    value={current.effort === 'off' ? 'off' : 'low'}
                    onValueChange={async (effort) => {
                      const answer = await assignDoor(
                        door.id,
                        providerId,
                        current.model,
                        effort === 'off' ? 'off' : undefined
                      )
                      if (answer?.error) setNotice(`${text.label}: ${answer.error}`)
                      await onChange()
                    }}
                  >
                    <SelectTrigger
                      size="sm"
                      className="w-28"
                      aria-label={t('settings.model.vision.menuReasoning')}
                    >
                      <SelectValue>
                        {(v) =>
                          t(
                            v === 'off'
                              ? 'settings.model.vision.effortOff'
                              : 'settings.model.vision.effortLow'
                          )
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">{t('settings.model.vision.effortLow')}</SelectItem>
                      <SelectItem value="off">{t('settings.model.vision.effortOff')}</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
                <p className="text-muted-foreground">{t('settings.model.vision.rereadWarning')}</p>
              </div>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              onClick={checkVision}
              disabled={
                testingVision ||
                !current?.model ||
                draftProvider !== null ||
                data.visionTest?.state === 'unavailable'
              }
            >
              <ScanEye />
              {testingVision
                ? t('settings.model.vision.testing')
                : visionRequestKey || data.visionTest?.active
                  ? t('settings.model.vision.resume')
                  : t('settings.model.vision.test')}
            </Button>
            <p className="text-muted-foreground">{t('settings.model.vision.note')}</p>
            {visionNotice ? <p role="status">{visionNotice}</p> : null}
          </div>
        ) : null}
        {/* The warning half: a model that will answer but answers worse, said here rather than
            left for somebody to find in a customer's site. */}
        {warning ? (
          <p className="flex max-w-[26rem] items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-px size-3 flex-none" />
            <span>{warning}</span>
          </p>
        ) : null}
        {door.requires?.length && hidden > 0 ? (
          <p className="text-[11px] text-muted-foreground">
            {t('settings.model.door.hidden', { count: hidden })}
          </p>
        ) : null}
      </div>
    </div>
  )
}

/** Which provider answers each of the four jobs. */
function Doors({
  data,
  onChange,
  setNotice
}: {
  data: LlmPayload
  onChange: () => Promise<unknown>
  setNotice: (s: string) => void
}) {
  const t = useT()
  // Keyed by the server's ids (`CAPABILITIES`), so the door that refuses and the screen that
  // explains name the same capabilities.
  const labels = capabilityLabels(t, data)
  return (
    <Card className="mt-5 gap-0 px-5 py-4">
      <h2 className="font-medium text-base">{t('settings.model.doors.title')}</h2>
      <p className="mt-0.5 text-muted-foreground text-xs">{t('settings.model.doors.blurb')}</p>
      <Separator className="my-3" />
      <div className="flex flex-col gap-4">
        {data.doors.map((door) => (
          <DoorRow
            key={door.id}
            door={door}
            data={data}
            current={data.assignments[door.id]}
            labels={labels}
            onChange={onChange}
            setNotice={setNotice}
          />
        ))}
      </div>
      {(data.capabilities ?? []).length > 0 ? (
        <>
          <Separator className="my-3" />
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            {data.capabilities.map((c) => (
              <span key={c.id} className="flex items-center gap-1 [&_svg]:size-3.5">
                {CAP_ICON[c.id]}
                {labels[c.id] ?? c.label}
              </span>
            ))}
            <span className="text-muted-foreground/70">— {t('settings.model.doors.legend')}</span>
          </p>
        </>
      ) : null}
    </Card>
  )
}
