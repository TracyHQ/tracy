// /ops/wo › Settings › Provider order, laid out like Settings › AI accounts: per capability group the
// Default provider, then the ones tried next, in order, each with its state.
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@tracy/ui'
import { htmlLang } from '@tracy/core/interface-languages/resolve'
import { ArrowDown, ArrowUp, Check, Minus, Plus } from 'lucide-react'

import { useLanguage, useT } from './i18n/index.ts'
import {
  asDefault,
  draftOrderOf,
  misorderText,
  moved,
  providerReportText,
  providerStateText,
  type WoCapabilityGroup,
  type WoCapabilityProvider,
  type WoProviderOrder,
  withGroupOrder,
  withoutProvider
} from './wo-provider-order.ts'

const STATE_VARIANT = {
  connected: 'secondary',
  missing_key: 'outline',
  limit_reached: 'outline',
  error: 'destructive'
} as const

function StateBadge({ provider, now }: { provider: WoCapabilityProvider; now: number }) {
  const t = useT()
  return (
    <Badge variant={STATE_VARIANT[provider.state] ?? 'outline'} className="font-normal text-[10px]">
      {providerStateText(t, provider, now)}
    </Badge>
  )
}

const misorderOf = (provider: WoCapabilityProvider) =>
  provider.report?.enough ? provider.report.misordered : undefined

/** The provider's name, bold when its place in the order looks wrong. */
function ProviderName({ provider, className }: { provider: WoCapabilityProvider; className?: string }) {
  return misorderOf(provider) ? (
    <strong className="font-semibold">{provider.label}</strong>
  ) : (
    <span className={className}>{provider.label}</span>
  )
}

/** Its numbers (or the muted "not enough data" line) and, when misordered, the bold one-line reason. */
function ProviderNumbers({ provider, group }: { provider: WoCapabilityProvider; group: WoCapabilityGroup }) {
  const t = useT()
  const locale = htmlLang(useLanguage().lang)
  const text = providerReportText(t, provider, group.reportMinCalls ?? 30, locale)
  if (!text) return null
  const misordered = misorderOf(provider)
  const than = misordered && (group.providers.find((p) => p.id === misordered.than)?.label ?? misordered.than)
  return (
    <div
      className="basis-full space-y-0.5 text-[11px]"
      data-report={provider.report?.enough ? 'numbers' : 'short'}
    >
      <p className="text-muted-foreground">{text}</p>
      {misordered && than && (
        <p className="font-semibold text-foreground" data-misordered={misordered.basis}>
          {misorderText(t, misordered, than, locale)}
        </p>
      )}
    </div>
  )
}

function GroupBlock({
  group,
  providerOrder,
  writable: canWrite,
  onChange,
  now
}: {
  group: WoCapabilityGroup
  providerOrder: WoProviderOrder
  writable: boolean
  onChange: (next: WoProviderOrder) => void
  now: number
}) {
  const t = useT()
  const wired = group.wired !== false
  const writable = canWrite && wired
  const { order, declared } = draftOrderOf(group, providerOrder)
  const byId = new Map(group.providers.map((p) => [p.id, p]))
  const inOrder = order.map((id) => byId.get(id)).filter((p): p is WoCapabilityProvider => Boolean(p))
  const [first, ...fallbacks] = inOrder
  const unused = group.providers.filter((p) => !order.includes(p.id))
  const set = (next: string[] | null) => onChange(withGroupOrder(providerOrder, group.id, next))

  return (
    <Card className="py-4" data-capability={group.id}>
      <CardHeader className="px-5 py-0 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-sm">{group.label}</CardTitle>
          {!wired ? (
            <Badge variant="outline" className="font-normal text-[10px] text-muted-foreground">
              {t('wo-misc.order.notWired')}
            </Badge>
          ) : declared ? (
            writable && (
              <Button size="xs" variant="ghost" onClick={() => set(null)}>
                {t('wo-misc.order.reset')}
              </Button>
            )
          ) : (
            <Badge variant="outline" className="font-normal text-[10px] text-muted-foreground">
              {t('wo-misc.order.defaultOrder')}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 px-5 py-0 text-sm">
        {first ? (
          <div className="flex flex-wrap items-center gap-2 rounded-md border p-3">
            <Check className="size-3.5 text-primary" aria-hidden="true" />
            <ProviderName provider={first} className="font-medium" />
            <Badge className="text-[10px]">{t('wo-misc.order.default')}</Badge>
            <StateBadge provider={first} now={now} />
            {writable && (
              <Button
                size="icon-xs"
                variant="ghost"
                className="ml-auto"
                aria-label={t('wo-misc.order.stopUsing', { name: first.label })}
                onClick={() => set(withoutProvider(order, first.id))}
              >
                <Minus />
              </Button>
            )}
            <ProviderNumbers provider={first} group={group} />
          </div>
        ) : (
          <p className="text-muted-foreground text-xs">{t('wo-misc.order.off')}</p>
        )}
        {/* A group with one provider has nothing to fall back to. */}
        {first && group.providers.length > 1 && (
          <section className="space-y-1.5">
            <h4 className="font-medium text-xs">{t('wo-misc.order.fallbackTitle', { name: first.label })}</h4>
            <p className="text-[11px] text-muted-foreground">{t('wo-misc.order.fallbackHint')}</p>
            {fallbacks.length === 0 ? (
              <p className="text-muted-foreground text-xs">
                {t('wo-misc.order.noFallback', { name: first.label })}
              </p>
            ) : (
              <ol className="divide-y rounded-md border">
                {fallbacks.map((p, i) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-2 px-3 py-2" data-provider={p.id}>
                    <span className="w-4 text-muted-foreground text-xs tabular-nums">{i + 1}</span>
                    <ProviderName provider={p} />
                    <StateBadge provider={p} now={now} />
                    {writable && (
                      <span className="ml-auto flex items-center gap-1">
                        <Button size="xs" variant="ghost" onClick={() => set(asDefault(order, p.id))}>
                          {t('wo-misc.order.makeDefault')}
                        </Button>
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          aria-label={t('wo-misc.order.moveUp')}
                          disabled={i === 0}
                          onClick={() => set(moved(order, p.id, -1))}
                        >
                          <ArrowUp />
                        </Button>
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          aria-label={t('wo-misc.order.moveDown')}
                          disabled={i === fallbacks.length - 1}
                          onClick={() => set(moved(order, p.id, 1))}
                        >
                          <ArrowDown />
                        </Button>
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          aria-label={t('wo-misc.order.stopUsing', { name: p.label })}
                          onClick={() => set(withoutProvider(order, p.id))}
                        >
                          <Minus />
                        </Button>
                      </span>
                    )}
                    <ProviderNumbers provider={p} group={group} />
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}
        {unused.length > 0 && (
          <section className="space-y-1.5">
            <h4 className="font-medium text-muted-foreground text-xs">{t('wo-misc.order.notUsed')}</h4>
            <ul className="divide-y rounded-md border border-dashed">
              {unused.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-muted-foreground">
                  <span>{p.label}</span>
                  <StateBadge provider={p} now={now} />
                  {writable && (
                    <Button
                      size="xs"
                      variant="ghost"
                      className="ml-auto"
                      onClick={() => set([...order, p.id])}
                    >
                      <Plus />
                      {t('wo-misc.order.use')}
                    </Button>
                  )}
                  <ProviderNumbers provider={p} group={group} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </CardContent>
    </Card>
  )
}

export function WoProviderOrderPanel({
  groups,
  providerOrder,
  writable,
  onChange,
  now = Date.now()
}: {
  groups: WoCapabilityGroup[] | undefined
  providerOrder: WoProviderOrder | undefined
  writable: boolean
  onChange: (next: WoProviderOrder) => void
  now?: number
}) {
  const t = useT()
  return (
    <Card className="py-4">
      <CardHeader className="px-5 py-0 pb-4">
        <CardTitle className="text-base">{t('wo-misc.order.title')}</CardTitle>
        <CardDescription className="text-sm">{t('wo-misc.order.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 px-5 py-0">
        {groups?.length ? (
          groups.map((g) => (
            <GroupBlock
              key={g.id}
              group={g}
              providerOrder={providerOrder ?? {}}
              writable={writable}
              onChange={onChange}
              now={now}
            />
          ))
        ) : (
          <p className="text-muted-foreground text-sm">{t('wo-misc.order.unavailable')}</p>
        )}
      </CardContent>
    </Card>
  )
}
