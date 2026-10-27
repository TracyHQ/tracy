/**
 * What the two Add site wizards say when the server refuses, and the one action that goes with it
 * (#796).
 *
 * Until 03/10/2026 the create wizard printed the machine code for every refusal it had no sentence
 * for ("Tracy could not start the build (NOT_SIGNED_IN)"), and the import wizard answered five
 * named refusals with "Something went wrong. Try again." — including the one where trying again
 * can never work, because the session is gone.
 *
 * Kept apart from `wizard.tsx` and `import-wizard.tsx` so the mapping can be mounted and read on
 * its own, without the wizard's dsh services.
 */
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@tracy/ui'
import { ChevronRight } from 'lucide-react'
import type { JSX } from 'react'

import type { CreateRefusal } from './create'
import type { ImportErrorDetail } from './import'
import type { Translate } from './strings'

/**
 * Signing in happens on tracy-web's own door, root-absolute like every other door of it
 * (`dsh-url.ts`). A constant, never built from an answer.
 */
const SIGN_IN_HREF = '/login'

/**
 * The way to sign in again WITHOUT leaving the wizard: a new tab. Navigating this tab to `/login`
 * would drop everything typed here — the name, the brief, the admin details of the site being
 * imported. The session cookie is shared, so the press that was refused works once the other tab
 * has signed in.
 */
export function SignInLink({ t }: { t: Translate }): JSX.Element {
  return (
    <a
      href={SIGN_IN_HREF}
      target="_blank"
      rel="noopener"
      className="underline"
      data-tracy-sign-in=""
      aria-label={t('sign_in_new_tab_aria')}
    >
      {t('sign_in_new_tab')}
    </a>
  )
}

/** The create door's refusal, as a sentence — and the sign-in link when that is the next step. */
export function CreateRefusalNote({
  refused,
  t
}: {
  refused: { refusal: CreateRefusal; code: string }
  t: Translate
}): JSX.Element {
  return (
    <span className="text-destructive text-xs" role="alert">
      {t(`error_${refused.refusal}`)}
      {refused.refusal === 'signed_out' ? (
        <>
          {' '}
          <SignInLink t={t} />
        </>
      ) : null}
    </span>
  )
}

const IMPORT_ERRORS = new Set([
  'invalid_credential',
  'no_backend_access',
  'mfa_required',
  'captcha_required',
  'login_locked_out',
  'blocked_by_firewall',
  'fs_credentials_required',
  'upgrade_failed',
  'site_resource_limit',
  'site_offline',
  'unreachable',
  'blocked_by_host',
  'basic_auth_required',
  'basic_auth_invalid',
  'installs_disabled',
  'install_failed',
  'install_forbidden',
  'upload_too_large',
  'activate_failed',
  'configure_failed',
  'credentials_required',
  'cowork_not_answering',
  'call_failed',
  'store_refused',
  'too_many_parts',
  'run_lost',
  'claim_stands',
  'admin_gate',
  'admin_form_not_found',
  'tls_invalid',
  'php_too_old'
])

/**
 * The checks a Joomla install that did not land stops on when nothing named a cause: the site took
 * the package (or answered 5xx) and Claude Cowork is not there, or is there and does not answer.
 */
const INSTALL_UNEXPLAINED = new Set(['not_installed', 'not_answering'])

/** Whether an import refusal means the session is gone (the door's own code, or a bare 401). */
export function importSignedOut(code: string): boolean {
  return code === 'NOT_SIGNED_IN' || code === 'HTTP_401'
}

/** The string key for an import refusal. No sentence of its own → the generic one, never the code. */
export function importErrorKey(code: string, detail?: ImportErrorDetail | null): string {
  // The site refused the sign-in with a message Tracy could not read: not proof of a wrong password.
  if (code === 'invalid_credential' && detail?.check === 'message_unread')
    return 'import_error_signin_unclear'
  // Joomla's backend takes the username only, and a customer often types the email address there.
  if (code === 'invalid_credential' && detail?.platform === 'joomla')
    return 'import_error_invalid_credential_joomla'
  // The Joomla install road's own causes. `site_resource_limit` is shared with reading the site and
  // `install_failed` with WordPress, so the install's sentence is picked by the check it stopped on.
  if (code === 'site_resource_limit' && detail?.check === 'memory_exhausted')
    return 'import_error_install_memory'
  // Installed, but it lacks the files of the quickstart contract the site names (`slim-package.ts`).
  if (code === 'install_failed' && detail?.check === 'contract_unavailable')
    return 'import_error_install_contract'
  if (code === 'install_failed' && detail?.check && INSTALL_UNEXPLAINED.has(detail.check))
    return 'import_error_install_unexplained'
  // Cloudflare challenges the engine's door too, so its sentence never offers the manual install.
  if (code === 'blocked_by_firewall' && detail?.firewall === 'cloudflare')
    return 'import_error_blocked_by_cloudflare'
  // The server names this one exactly; keep its name instead of lowering it to a generic line.
  if (code === 'INVALID_SITE_KEY') return 'import_error_invalid_site_key'
  if (IMPORT_ERRORS.has(code)) return `import_error_${code}`
  if (code.startsWith('manifest_') || code === 'EXTENSION_MANIFEST_UNAVAILABLE')
    return 'import_error_manifest'
  if (code === 'TAKEN') return 'import_error_claim_taken'
  if (code === 'HOST_UPDATING') return 'import_error_host_updating'
  if (code === 'ALREADY_PROVISIONED') return 'import_error_already_provisioned'
  if (importSignedOut(code)) return 'import_error_signed_out'
  if (code === 'SEAT_BOOK_UNREACHABLE') return 'import_error_access_check'
  if (code === 'NO_VIEWING_SESSION') return 'import_error_no_access'
  if (code === 'INVALID_REQUEST') return 'import_error_invalid_request'
  if (code === 'UNSUPPORTED_PLATFORM') return 'import_error_unsupported_platform'
  return 'import_error_other'
}

/**
 * The second sentence of `php_too_old`: the versions, as far as the run learnt them. Empty when it
 * learnt neither — the first sentence already says what to do.
 */
export function phpVersionsText(detail: ImportErrorDetail | null | undefined, t: Translate): string {
  if (!detail?.minimumPhp) return ''
  return detail.php
    ? t('import_error_php_versions', { php: detail.php, minimum: detail.minimumPhp })
    : t('import_error_php_minimum', { minimum: detail.minimumPhp })
}

/**
 * The second sentence of `upload_too_large` over a PHP limit the site named: the package and that
 * limit. Empty for a 413, where the limit is the web server's and was never read.
 */
export function uploadSizesText(detail: ImportErrorDetail | null | undefined, t: Translate): string {
  if (!detail?.packageMb || !detail.limitMb) return ''
  return t('import_error_upload_sizes', { package: detail.packageMb, limit: detail.limitMb })
}

/** Where in the Cloudflare dashboard each switch of `import_error_blocked_by_cloudflare` sits. */
const CLOUDFLARE_STEPS = [
  'import_cloudflare_step_bots',
  'import_cloudflare_step_under_attack',
  'import_cloudflare_step_rules'
] as const

/** The steps behind the Cloudflare sentence, folded away (the export dialog's details pattern). */
export function CloudflareSteps({ t }: { t: Translate }): JSX.Element {
  return (
    <Collapsible
      className="mt-2 rounded-lg border border-border has-[:focus-visible]:border-primary"
      data-cloudflare-steps=""
    >
      <CollapsibleTrigger className="group flex w-full items-center justify-between px-3 py-2.25 text-foreground/80 text-sm outline-none hover:text-foreground">
        {t('import_cloudflare_how')}
        <ChevronRight
          className="size-4 text-muted-foreground transition-transform group-data-[panel-open]:rotate-90"
          aria-hidden="true"
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ol className="m-0 list-decimal space-y-0.5 px-3 pb-1.5 pl-7 text-sm text-muted-foreground">
          {CLOUDFLARE_STEPS.map((key) => (
            <li key={key}>{t(key)}</li>
          ))}
        </ol>
        <p className="m-0 px-3 pb-2.5 text-sm text-muted-foreground">{t('import_cloudflare_skip_rule')}</p>
      </CollapsibleContent>
    </Collapsible>
  )
}

/**
 * An import refusal on screen: its sentence, and the sign-in link when the session is gone.
 * `steps={false}` keeps the Cloudflare steps out where the sentence sits in an inline line of text.
 */
export function ImportErrorText({
  code,
  t,
  detail,
  steps = true
}: {
  code: string
  t: Translate
  detail?: ImportErrorDetail | null
  steps?: boolean
}): JSX.Element {
  const versions =
    code === 'php_too_old'
      ? phpVersionsText(detail, t)
      : code === 'upload_too_large'
        ? uploadSizesText(detail, t)
        : ''
  const key = importErrorKey(code, detail)
  return (
    <>
      {t(key)}
      {versions ? ` ${versions}` : null}
      {steps && key === 'import_error_blocked_by_cloudflare' ? <CloudflareSteps t={t} /> : null}
      {importSignedOut(code) ? (
        <>
          {' '}
          <SignInLink t={t} />
        </>
      ) : null}
    </>
  )
}
