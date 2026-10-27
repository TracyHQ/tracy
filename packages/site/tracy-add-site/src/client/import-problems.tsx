/** Shared status and resolution pattern for the import wizard and its build handover. */
import { Button, cn, Collapsible, CollapsibleContent, CollapsibleTrigger } from '@tracy/ui'
import { ChevronRight, CircleX, Info, Lightbulb, TriangleAlert } from 'lucide-react'
import { Fragment, type JSX, type ReactNode } from 'react'

import { type ImportErrorDetail, safeImportJoinPath } from './import'
import { PLATFORM_ADMIN_PATHS } from './admin-path.mjs'
import { IMPORT_PROBLEMS } from './import-problem-data'
import type { Translate } from './strings'
import { CLOUDFLARE_DASHBOARD_URL, DISCORD_SUPPORT_URL } from './vendor-links'

export const IMPORT_LINK = 'text-primary underline-offset-4 hover:underline'
export interface ImportProblemContext {
  domain?: string
  platform?: string
  additionalProblems?: string[]
  adminUrl?: string
  username?: string
  extensionVersion?: string
  joinPath?: string
  detail?: ImportErrorDetail | null
  params?: Record<string, string | number>
  onManual?: () => void
  onCreate?: () => void
  onMySites?: () => void
  onAction?: (key: string) => void
  technicalDetails?: string
  hideStatus?: boolean
  actions?: ReactNode
}

/** One named server refusal selects one approved case; unknown responses keep a safe fallback. */
export function importProblemCase(
  code: string,
  detail?: ImportErrorDetail | null,
  username?: string
): string {
  if (code === 'invalid_credential')
    return detail?.check === 'message_unread'
      ? 'p8'
      : detail?.check === 'username_is_email' || (detail?.platform === 'joomla' && username?.includes('@'))
        ? 'p7'
        : 'p6'
  if (code === 'blocked_by_firewall')
    return detail?.firewall === 'cloudflare' ? 'p16' : detail?.firewall === 'wordfence' ? 'p17' : 'firewall'
  if (code === 'install_failed' && ['not_installed', 'not_answering'].includes(detail?.check ?? ''))
    return 'p26'
  // A run a dsh restart cut (#1565): Continue, or the sign-in details again when the host holds no code.
  if (code === 'interrupted') return detail?.check === 'credentials_needed' ? 'p53.again' : 'p53'
  if (code === 'site_resource_limit') return detail?.check === 'memory_exhausted' ? 'p34' : 'p35'
  if (code.startsWith('manifest_') || code.startsWith('EXTENSION_')) return 'p31'
  if (code === 'NOT_SIGNED_IN' || code === 'HTTP_401') return 'p44'
  if (code === 'NETWORK' || code === 'HTTP_0') return 'p45'
  return (
    (
      {
        no_backend_access: detail?.platform === 'wordpress' ? 'p23' : 'p9',
        basic_auth_required: 'p10',
        basic_auth_invalid: 'p11',
        admin_form_not_found: 'p12',
        mfa_required: 'p13',
        captcha_required: 'p14',
        login_locked_out: 'p15',
        admin_gate: 'p18',
        blocked_by_host: 'p19',
        unreachable: 'p20',
        tls_invalid: 'p21',
        install_forbidden: 'p22',
        installs_disabled: 'p23',
        fs_credentials_required: 'p24',
        install_failed: 'p25',
        activate_failed: 'p27',
        configure_failed: 'p28',
        upgrade_failed: 'p29',
        cowork_not_answering: 'p30',
        php_too_old: 'p32',
        upload_too_large: 'p33',
        too_many_parts: 'p36',
        call_failed: 'p37',
        site_offline: 'p55',
        store_refused: 'p38',
        run_lost: 'p39',
        HOST_UPDATING: 'p40',
        start_unconfirmed: 'p41',
        poll_stale: 'p42',
        handover_failed: 'p43',
        JOB_NOT_YOURS: 'p48',
        agent_failed: 'p49',
        address_missing: 'p50',
        preview_failed: 'p51',
        import_running: 'p52',
        TAKEN: 'pf1.taken',
        TRACY_SITE: 'pf1.tracy',
        claim_stands: 'legacy.claim_stands',
        IMPORT_REMOVING: 'legacy.import_removing',
        INVALID_SITE_KEY: 'legacy.invalid_site_key',
        INVALID_REQUEST: 'legacy.invalid_request',
        UNSUPPORTED_PLATFORM: 'legacy.unsupported_platform',
        SEAT_BOOK_UNREACHABLE: 'legacy.access_check',
        NO_VIEWING_SESSION: 'legacy.no_access',
        ALREADY_PROVISIONED: 'pf1.mine'
      } as Record<string, string>
    )[code] ?? 'p45.server'
  )
}

/** All admin destinations are relative to the address supplied by the customer, including subfolders. */
function destinations(context: ImportProblemContext): Record<string, string> {
  const domain = context.domain ?? ''
  let site: URL
  try {
    site = new URL(`https://${domain}`)
  } catch {
    site = new URL('https://invalid.invalid')
  }
  let admin: URL
  let suppliedAdmin: string | undefined
  try {
    admin = new URL(context.adminUrl || '/administrator/', site)
    if (['http:', 'https:'].includes(admin.protocol) && /^https?:\/\//i.test(context.adminUrl ?? ''))
      suppliedAdmin = context.adminUrl
  } catch {
    admin = new URL('/administrator/', site)
  }
  if (!['http:', 'https:'].includes(admin.protocol)) admin = new URL('/administrator/', site)
  const joomla = (option: string) => {
    const u = new URL(admin)
    u.pathname = `${u.pathname.replace(/\/(?:index\.php)?\/?$/, '')}/index.php`
    for (const [key, value] of new URLSearchParams(option)) u.searchParams.set(key, value)
    return u.href
  }
  const wpBase = new URL(admin)
  wpBase.search = ''
  wpBase.hash = ''
  if (wpBase.pathname.endsWith('/wp-login.php'))
    wpBase.pathname = wpBase.pathname.replace(/wp-login\.php$/, 'wp-admin/')
  else if (/\/wp-admin(?:\/|$)/.test(wpBase.pathname))
    wpBase.pathname = wpBase.pathname.replace(/(\/wp-admin)(?:\/.*)?$/, '$1/')
  else wpBase.pathname = wpBase.pathname.replace(/(?:index\.php)?\/?$/, '/')
  const wp = (page: string) => new URL(page, wpBase.href.replace(/\/?$/, '/')).href
  const reset = new URL(wpBase)
  reset.pathname = reset.pathname.replace(/wp-admin\/.*$/, 'wp-login.php')
  reset.search = 'action=lostpassword'
  const origin = site.origin
  // Recover the entered site's base without duplicating a standard admin path or entry file.
  const defaultAdmin = new URL(admin)
  defaultAdmin.search = ''
  defaultAdmin.hash = ''
  const sourceBase = defaultAdmin.pathname
    .replace(/\/(?:administrator|wp-admin)(?:\/.*)?$|\/wp-login\.php$/, '')
    .replace(/\/[^/]+\.php$/, '')
    .replace(/\/$/, '')
  const platform = context.platform ?? context.detail?.platform ?? 'joomla'
  defaultAdmin.pathname = `${sourceBase}${PLATFORM_ADMIN_PATHS[platform] ?? PLATFORM_ADMIN_PATHS.joomla}`
  return {
    'my-sites': '#my-sites',
    create: '#create',
    manual: '#install-myself',
    discord: DISCORD_SUPPORT_URL,
    cloudflare: CLOUDFLARE_DASHBOARD_URL,
    reset: reset.href,
    'joomla-install': joomla('option=com_installer&view=install'),
    'joomla-users': joomla('option=com_users&view=users'),
    'joomla-manage': joomla('option=com_installer&view=manage'),
    'joomla-update': joomla('option=com_installer&view=update'),
    'joomla-cowork': joomla('option=com_claudecowork'),
    'wp-settings': wp('options-general.php?page=claude-cowork'),
    'wp-users': wp('users.php'),
    'wp-plugins': wp('plugins.php'),
    'wp-install': wp('plugin-install.php'),
    login: '/login',
    join: safeImportJoinPath(context.joinPath) ?? '',
    admin: suppliedAdmin ?? admin.href,
    'default-admin': defaultAdmin.href,
    site: origin
  }
}

/** Parse only the three inline tags used by approved copy; no HTML is inserted into the document. */
export function ImportRichText({
  text,
  context = {}
}: {
  text: string
  context?: ImportProblemContext
}): JSX.Element {
  const links = destinations(context)
  // Translations retain semantic identifiers; only this allowlist supplies actual destinations.
  const pieces = text.split(/(<(?:b|code)>[^<]*<\/(?:b|code)>|<a\b[^>]*>[\s\S]*?<\/a>)/g)
  return (
    <>
      {pieces.map((part, index) => {
        const link = part.match(/^<a\b([^>]*)>([\s\S]*)<\/a>$/)
        if (link) {
          const [, attributes, label] = link
          const id = attributes.match(/\bdata-import-link="([a-z-]+)"/)?.[1]
          const href = id && Object.hasOwn(links, id) ? links[id] : undefined
          if (!href) return <Fragment key={index}>{label.replace(/<\/?b>/g, '')}</Fragment>
          const action =
            href === '#install-myself'
              ? context.onManual
              : href === '#create'
                ? context.onCreate
                : href === '#my-sites'
                  ? context.onMySites
                  : undefined
          return (
            <a
              key={index}
              href={href}
              className={IMPORT_LINK}
              data-tracy-sign-in={href === '/login' ? '' : undefined}
              target={action ? undefined : '_blank'}
              rel="noopener"
              onClick={
                action
                  ? (event) => {
                      event.preventDefault()
                      action()
                    }
                  : undefined
              }
            >
              {id === 'admin'
                ? context.adminUrl || href
                : id === 'default-admin'
                  ? href
                  : label.replace(/<\/?b>/g, '')}
            </a>
          )
        }
        if (part.startsWith('<b>'))
          return (
            <strong key={index} className="font-medium text-foreground">
              {part.slice(3, -4)}
            </strong>
          )
        if (part.startsWith('<code>')) return <code key={index}>{part.slice(6, -7)}</code>
        return <Fragment key={index}>{part}</Fragment>
      })}
    </>
  )
}

/** A field-sized status line followed by the existing bordered resolution shape. */
export function ImportProblem({
  problem,
  t,
  ...context
}: { problem: string; t: Translate } & ImportProblemContext): JSX.Element | null {
  let data = IMPORT_PROBLEMS[problem]
  if (!data || data.severity === 'ok') return null
  const detail = context.detail as (ImportErrorDetail & { have?: string; need?: string }) | undefined
  const params = {
    domain: context.domain ?? '',
    platform: (context.platform ?? detail?.platform) === 'wordpress' ? 'WordPress' : 'Joomla',
    username: context.username ?? '',
    installed: detail?.have ?? '',
    required: context.extensionVersion ?? '',
    php: detail?.php ?? '',
    minimum: detail?.minimumPhp ?? '',
    limit: detail?.limitMb ?? '',
    package: detail?.packageMb ?? '',
    uploadMinimum: detail?.packageMb ? Math.max(16, Math.ceil(Number(detail.packageMb) / 4 + 1) * 4) : '',
    minutes: 3,
    checked: '',
    ...context.params
  }
  if (problem === 'p29')
    data = {
      ...data,
      what: detail?.have ? data.what : 'import_upgrade_unknown',
      why: context.extensionVersion ? data.why : undefined
    }
  if (problem === 'p32' && (!detail?.php || !detail.minimumPhp))
    data = {
      ...data,
      what: 'import_php_unknown',
      why: detail?.minimumPhp ? 'import_problem_p32_why' : undefined,
      fix: ['import_php_change', 'import_php_host', 'import_problem_p32_fix_2']
    }
  if (problem === 'p33' && (!detail?.limitMb || !detail.packageMb))
    data = { ...data, what: 'import_upload_unknown' }
  if (problem === 'p33' && detail?.platform === 'wordpress')
    data = { ...data, fix: ['import_problem_p33_fix_1'], options: true }
  if (problem === 'p33' && !detail?.packageMb)
    data = {
      ...data,
      fix:
        detail?.platform === 'wordpress'
          ? ['import_upload_raise']
          : ['import_problem_p33_fix_0', 'import_upload_raise'],
      options: true
    }
  if (problem === 'p27' && detail?.platform === 'wordpress') data = { ...data, fix: ['import_wp_activate'] }
  if (problem === 'p29' && detail?.platform === 'joomla')
    data = { ...data, fix: ['import_joomla_update', 'import_problem_p29_or'] }
  if (problem === 'p30' && detail?.platform === 'wordpress')
    data = {
      ...data,
      fix: ['import_problem_p30_fix_0', 'import_wp_token_settings', 'import_problem_p30_fix_2']
    }
  if (problem === 'p25' && detail?.platform === 'wordpress')
    data = { ...data, fix: ['import_wp_install', 'import_problem_p25_fix_1'] }
  if (problem === 'p6' && detail?.platform === 'joomla')
    data = { ...data, fix: ['import_credentials_joomla_check', 'import_credentials_joomla_reset'] }
  const additional = (context.additionalProblems ?? [])
    .filter((key, index, keys) => key !== problem && keys.indexOf(key) === index)
    .map((key) => IMPORT_PROBLEMS[key])
    .filter((item) => item && item.severity !== 'ok')
  if (additional.length)
    data = {
      ...data,
      fix: [
        ...(data.fix ?? []),
        ...additional.flatMap((item) => [...(item.why ? [item.why] : []), ...(item.fix ?? [])])
      ],
      options: true
    }
  const text = (key: string) => <ImportRichText text={t(key, params)} context={context} />
  const Icon = data.severity === 'warning' ? TriangleAlert : data.severity === 'info' ? Info : CircleX
  const content = !!(data.why || data.fix?.length || data.more || context.technicalDetails)
  const actions = context.actions
  if (context.hideStatus && !content && !actions) return null
  if (problem === 'p46') data = { ...data, more: undefined }
  const body = (
    <div className="tas-import-body">
      {data.why ? <p className="m-0">{text(data.why)}</p> : null}
      {data.fix?.length === 1 && !data.options ? (
        <p>{text(data.fix[0])}</p>
      ) : data.fix?.length ? (
        data.options ? (
          <ul className="m-0 list-disc space-y-1 pl-4">
            {data.fix.map((key) => (
              <li key={key}>{text(key)}</li>
            ))}
          </ul>
        ) : (
          <ol className="m-0 list-decimal space-y-1 pl-4">
            {data.fix.map((key) => (
              <li key={key}>{text(key)}</li>
            ))}
          </ol>
        )
      ) : null}
      {data.more ? (
        <details>
          <summary className="cursor-pointer text-foreground">{text(data.more.title)}</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-4">
            {data.more.steps.map((key) => (
              <li key={key}>{text(key)}</li>
            ))}
          </ol>
        </details>
      ) : null}
      {context.technicalDetails ? (
        <details>
          <summary className="cursor-pointer text-foreground">{t('import_problem_p46_more_title')}</summary>
          <ol data-diagnosis="1" className="wrap-anywhere max-h-60 list-decimal overflow-y-auto pl-4">
            {context.technicalDetails
              .split(/\r?\n/)
              .filter(Boolean)
              .map((line, index) => (
                <li key={index}>{line}</li>
              ))}
          </ol>
        </details>
      ) : null}
      {actions ? <div className="tas-import-actions">{actions}</div> : null}
    </div>
  )
  const title = (
    <span className="tas-import-title">
      <Lightbulb className="size-3.5 shrink-0 text-warning" aria-hidden="true" />
      {t('import_resolve_title')}
    </span>
  )
  return (
    <div className="space-y-2" data-import-problem={problem}>
      {!context.hideStatus ? (
        <div
          role={data.severity === 'error' ? 'alert' : 'status'}
          data-severity={data.severity}
          className={cn(
            'flex items-start gap-2 text-xs font-normal',
            data.severity === 'error' ? 'text-destructive' : 'text-muted-foreground'
          )}
        >
          <Icon className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          <span>{text(data.what)}</span>
        </div>
      ) : null}
      {content ? (
        data.severity === 'warning' && !actions ? (
          <Collapsible className="rounded-lg border border-border has-[:focus-visible]:border-primary">
            <CollapsibleTrigger className="tas-import-head group flex w-full items-center justify-between border-0 bg-transparent text-left outline-none">
              {title}
              <ChevronRight
                className="size-3.5 transition-transform group-data-[panel-open]:rotate-90"
                aria-hidden="true"
              />
            </CollapsibleTrigger>
            <CollapsibleContent>{body}</CollapsibleContent>
          </Collapsible>
        ) : (
          <div className="rounded-lg border border-border">
            <div className="tas-import-head">{title}</div>
            {body}
          </div>
        )
      ) : (
        <div className="tas-import-actions">{actions}</div>
      )}
    </div>
  )
}

/** Actions use the same package buttons; their behavior belongs to the wizard that owns the state. */
export function ImportProblemActions({
  problem,
  t,
  onAction
}: {
  problem: string
  t: Translate
  onAction: (key: string) => void
}): JSX.Element | null {
  const data = IMPORT_PROBLEMS[problem]
  if (!data?.actions?.length) return null
  return (
    <div className="flex flex-wrap items-center gap-2">
      {data.actions.map((key, index) => (
        <Button
          key={key}
          type="button"
          size="sm"
          variant={index === 0 && !data.quiet ? 'default' : 'outline'}
          onClick={() => onAction(key)}
        >
          {t(key)}
        </Button>
      ))}
    </div>
  )
}
