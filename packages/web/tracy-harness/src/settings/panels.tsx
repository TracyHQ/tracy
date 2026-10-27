/**
 * The four reporting panels of Settings — Sign-in, Limits, Integrations, Naming.
 *
 * ⚠ MODEL & AI WAS HERE AND IS NOT ANY MORE (22/09). It read the environment while the Model & AI
 * SCREEN reads the provider book, so the two disagreed the moment somebody configured a provider:
 * this panel said "not set · Off" beside a screen showing DeepSeek in service.
 * (Team is its own long-standing screen and is rendered beside these by `Settings.tsx`.)
 *
 * 🔒 EVERY PANEL SAYS WHERE A VALUE LIVES, because none of them can change it. Layer A reads
 * `config`, which was read from the environment once at boot — an input here would be a control
 * that does nothing, which is worse than no control. "Set this in `/etc/tracy/tracy-web.env`" is
 * a shorter path to the change than a text box that silently discards it.
 *
 * ⚠ THE THREE STATES ARE DELIBERATE AND DIFFERENT: `Ready` (configured), `Off` (deliberately not
 * configured — a feature this deployment does not use), and `Not visible` (this process cannot
 * inspect it at all). Collapsing the third into the second is how a screen ends up stating,
 * confidently and wrongly, that the agent has no model key.
 */
import { Badge, Card, Separator, cn } from '@tracy/ui'
import { AlertTriangle, Check, Eye, Minus } from 'lucide-react'
import type { ReactNode } from 'react'

import { Trans, useT } from '../i18n'
import type { General, Integration } from './api'

/** Names kept as they are in every language. */
const GOOGLE = 'Google'
const GITHUB = 'GitHub'
const TURNSTILE = 'Turnstile'

/** One labelled line. The label column is fixed so a column of them reads as a table. */
function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-1.5">
      <span className="w-44 flex-none text-muted-foreground text-xs">{label}</span>
      <span className="min-w-0 flex-1 text-sm">{children}</span>
    </div>
  )
}

/** A value the deployment did not set. Never an empty cell: a blank reads as a rendering bug. */
function Unset({ what }: { what?: string }) {
  const t = useT()
  return <span className="text-muted-foreground italic">{what ?? t('settings.panels.notSet')}</span>
}

const Mono = ({ children }: { children: ReactNode }) => (
  <span className="break-all font-mono text-[13px]">{children}</span>
)

type StateKind = 'ready' | 'off' | 'opaque' | 'partial'

function State({ kind, children }: { kind: StateKind; children: ReactNode }) {
  const icon = {
    ready: <Check />,
    off: <Minus />,
    opaque: <Eye />,
    partial: <AlertTriangle />
  }[kind]
  return (
    <Badge
      variant={kind === 'ready' ? 'secondary' : 'outline'}
      className={cn(
        'gap-1 [&_svg]:size-3',
        kind === 'partial' && 'border-amber-500/40 text-amber-700 dark:text-amber-400'
      )}
    >
      {icon}
      {children}
    </Badge>
  )
}

function Section({
  title,
  blurb,
  state,
  children
}: {
  title: string
  blurb?: string
  state?: ReactNode
  children: ReactNode
}) {
  return (
    <Card className="gap-0 px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-medium text-sm">{title}</h3>
          {blurb ? <p className="mt-0.5 text-muted-foreground text-xs">{blurb}</p> : null}
        </div>
        {state}
      </div>
      <Separator className="my-3" />
      {children}
    </Card>
  )
}

/** Where a value is set, in the words a person would use to go and change it. */
const Where = ({ where }: { where: string }) => (
  <p className="mt-3 text-muted-foreground text-xs">
    <Trans i18nKey="settings.panels.where" values={{ where }} components={{ code: <Mono>{null}</Mono> }} />
  </p>
)

export function SignInPanel({ data }: { data: General }) {
  const t = useT()
  const { mail, oauth, turnstile, localLoginPreview } = data.signin
  const ready = <State kind="ready">{t('settings.panels.ready')}</State>
  const offNoButton = <State kind="off">{t('settings.signin.oauth.off')}</State>
  return (
    <div className="flex flex-col gap-4">
      <Section
        title={t('settings.signin.mail.title')}
        blurb={t('settings.signin.mail.blurb')}
        state={
          mail.kind === 'console' ? (
            <State kind="partial">{t('settings.signin.mail.consoleOnly')}</State>
          ) : (
            <State kind="ready">{mail.kind}</State>
          )
        }
      >
        <Line label={t('settings.signin.mail.transport')}>
          <Mono>{mail.kind}</Mono>
        </Line>
        <Line label={t('settings.signin.mail.from')}>{mail.from ? <Mono>{mail.from}</Mono> : <Unset />}</Line>
        <Where where="MAIL · MAIL_FROM" />
      </Section>

      <Section title={t('settings.signin.oauth.title')} blurb={t('settings.signin.oauth.blurb')}>
        <Line label={GOOGLE}>{oauth.google ? ready : offNoButton}</Line>
        <Line label={GITHUB}>{oauth.github ? ready : offNoButton}</Line>
        <Where where="GOOGLE_OAUTH_CLIENT_ID/SECRET · GITHUB_OAUTH_CLIENT_ID/SECRET" />
      </Section>

      <Section
        title={TURNSTILE}
        blurb={t('settings.signin.turnstile.blurb')}
        state={
          turnstile.configured ? (
            ready
          ) : turnstile.disabled ? (
            <State kind="off">{t('settings.signin.turnstile.deliberatelyOff')}</State>
          ) : (
            <State kind="partial">{t('settings.signin.turnstile.failsClosed')}</State>
          )
        }
      >
        {/*
          Two independent facts, never one standing in for the other: a missing secret FAILS CLOSED
          and the only way past it is the named flag. "No captcha configured" and "captcha turned
          off" are different states of this deployment, and they behave differently.
        */}
        <Line label={t('settings.signin.turnstile.secret')}>
          {turnstile.configured ? t('settings.signin.turnstile.secretSet') : <Unset />}
        </Line>
        <Line label={t('settings.signin.turnstile.disabled')}>
          {t(turnstile.disabled ? 'settings.common.yes' : 'settings.common.no')}
        </Line>
        <Line label={t('settings.signin.turnstile.localPreview')}>
          {t(localLoginPreview ? 'settings.common.on' : 'settings.common.off')}
        </Line>
        <Where where="TURNSTILE_SECRET · TURNSTILE_DISABLED" />
      </Section>
    </div>
  )
}

export function LimitsPanel({ data }: { data: General }) {
  const t = useT()
  const l = data.limits
  return (
    <div className="flex flex-col gap-4">
      <Section title={t('settings.limits.sessions.title')}>
        <Line label={t('settings.limits.sessions.sessionLasts')}>
          {t('settings.limits.hours', { count: Math.round(l.sessionTtlS / 3600) })}
        </Line>
        <Line label={t('settings.limits.sessions.codeLasts')}>
          {t('settings.limits.minutes', { count: Math.round(l.otpTtlMs / 60000) })}
        </Line>
        <Line label={t('settings.limits.sessions.wrongCodes')}>{l.otpMaxAttempts}</Line>
      </Section>

      <Section title={t('settings.limits.rate.title')} blurb={t('settings.limits.rate.blurb')}>
        <Line label={t('settings.limits.rate.writesPerHour')}>{l.writesPerHour}</Line>
        <Line label={t('settings.limits.rate.designReads')}>{l.designReadsPerDay}</Line>
        <Line label={t('settings.limits.rate.designWords')}>{l.designWordsPerDay}</Line>
        <Line label={t('settings.limits.rate.designBrand')}>{l.designBrandPerDay}</Line>
      </Section>

      <Section title={t('settings.limits.invitation.title')}>
        <Line label={t('settings.limits.invitation.addresses')}>{l.teamMaxEmails}</Line>
        <Line label={t('settings.limits.invitation.sites')}>{l.teamMaxSites}</Line>
      </Section>

      {/* Said once, at the foot of the panel: these are code, and changing one is a deploy. */}
      <p className="text-muted-foreground text-xs">
        <Trans
          i18nKey="settings.limits.footer"
          values={{ where: l.where }}
          components={{ code: <Mono>{null}</Mono> }}
        />
      </p>
    </div>
  )
}

function IntegrationRow({ item }: { item: Integration }) {
  const t = useT()
  return (
    <Section
      title={item.label}
      blurb={item.note ?? undefined}
      state={
        item.ready ? (
          <State kind="ready">{t('settings.panels.ready')}</State>
        ) : item.missing.length === item.keys.length ? (
          <State kind="off">{t('settings.integrations.off')}</State>
        ) : (
          // The case this whole screen exists for: most of a credential block, which the app
          // treats exactly like none of it, with nothing logged anywhere.
          <State kind="partial">
            {t('settings.integrations.partial', {
              set: item.keys.length - item.missing.length,
              count: item.keys.length
            })}
          </State>
        )
      }
    >
      <Line label={t('settings.integrations.keys')}>
        <span className="flex flex-wrap gap-1.5">
          {item.keys.map((key) => (
            <Badge
              key={key}
              variant="outline"
              className={cn('font-mono text-[11px]', item.missing.includes(key) && 'text-muted-foreground')}
            >
              {item.missing.includes(key) ? t('settings.integrations.missing', { key }) : key}
            </Badge>
          ))}
        </span>
      </Line>
    </Section>
  )
}

export function IntegrationsPanel({ data }: { data: General }) {
  return (
    <div className="flex flex-col gap-4">
      {data.integrations.map((item) => (
        <IntegrationRow key={item.id} item={item} />
      ))}
    </div>
  )
}

export function NamingPanel({ data }: { data: General }) {
  const t = useT()
  const d = data.deployment
  const none = <Unset what={t('settings.naming.none')} />
  return (
    <div className="flex flex-col gap-4">
      <Section title={t('settings.naming.addresses.title')} blurb={t('settings.naming.addresses.blurb')}>
        <Line label={t('settings.naming.thisDeployment')}>
          <Mono>{d.origin}</Mono>
        </Line>
        <Line label={t('settings.naming.siteDomain')}>
          <Mono>{d.siteDomain}</Mono>
        </Line>
        <Line label={t('settings.naming.aliases')}>
          {d.siteDomainAliases.length ? <Mono>{d.siteDomainAliases.join(', ')}</Mono> : none}
        </Line>
        <Line label={t('settings.naming.prefix')}>
          {d.siteAddressPrefix ? <Mono>{d.siteAddressPrefix}</Mono> : none}
        </Line>
        <Line label={t('settings.naming.cookieDomain')}>
          {d.sessionDomain ? <Mono>{d.sessionDomain}</Mono> : <Unset what={t('settings.naming.hostOnly')} />}
        </Line>
        <Line label={t('settings.naming.landing')}>
          {d.guestSiteKey ? <Mono>{d.guestSiteKey}</Mono> : <Unset what={t('settings.naming.noLanding')} />}
        </Line>
      </Section>

      <Section
        title={t('settings.naming.reserved.title')}
        blurb={t('settings.naming.reserved.blurb', { count: data.naming.reserved.length })}
      >
        <div className="flex flex-wrap gap-1.5">
          {data.naming.reserved.map((label) => (
            <Badge key={label} variant="outline" className="font-mono text-[11px]">
              {label}
            </Badge>
          ))}
        </div>
        <Where where={data.naming.where} />
      </Section>
    </div>
  )
}
