/**
 * The four bodies of the invite wizard, layout D3 (Akemi 04/10/2026): People, Sites, Review and
 * Done. They only draw; every choice lives in `InviteWizard` (`wizard.tsx`), which hands each body
 * what it shows and the setters it may call.
 *
 * Classes are styled by `site-tabs-rules.css` under `.tv-team-dialog` (mode B).
 */
import { type JSX, useState } from 'react'
import { Check, Link2, Mail, UserPlus, X } from 'lucide-react'
import { Button, Checkbox, Input } from '@tracy/ui'
import { EmdashIcon } from '@tracy/ui/icons/platforms/emdash'
import { JoomlaIcon } from '@tracy/ui/icons/platforms/joomla'
import { WordpressIcon } from '@tracy/ui/icons/platforms/wordpress'

import { FAILURE_KEY, type Failure, nextStepKey, type Outcome, type SentResult } from './invite-answer'
import { RoleRows, SectionHeading } from './role-rows'
import { type InvitableRole, splitEmails } from './roster'
import { RoleBadge } from './team'
import type { Translate } from './translate'
import { siteCountPhrase, siteTakes, type Step, STEPS } from './wizard-plan'
import type { InvitableSite } from './wizard'

/** The CMS logos My Sites draws, by the id the seat book stores; an unknown one draws nothing. */
const CMS_LOGO = { joomla: JoomlaIcon, wordpress: WordpressIcon, emdash: EmdashIcon } as const

function CmsLogo({ platform }: { platform: string | null }): JSX.Element {
  const Logo = platform ? CMS_LOGO[platform as keyof typeof CMS_LOGO] : undefined
  if (!Logo) return <span className="tv-team-cms" aria-hidden="true" />
  return <Logo className="tv-team-cms" aria-hidden />
}

export const siteName = (s: { siteKey: string; displayName?: string }): string => s.displayName || s.siteKey

/** "Step 1 of 3 · People" and three thin bars, the brand colour up to the current one. */
export function Stepper({ at, t }: { at: Step; t: Translate }): JSX.Element {
  const n = STEPS.findIndex((s) => s.id === at) + 1
  return (
    <div className="tv-team-steps">
      <span className="tv-team-steps-label">
        {t('wizard.stepOf', { n, name: t(STEPS[n - 1]?.key ?? '') })}
      </span>
      <span className="tv-team-bars" aria-hidden="true">
        {STEPS.map((s, i) => (
          <i key={s.id} data-on={i < n ? '' : undefined} />
        ))}
      </span>
    </div>
  )
}

export function PeopleStep({
  emails,
  setEmails,
  draft,
  setDraft,
  roles,
  role,
  setRole,
  t
}: {
  emails: string[]
  setEmails: (update: (all: string[]) => string[]) => void
  draft: string
  setDraft: (draft: string) => void
  roles: readonly InvitableRole[]
  role: InvitableRole | null
  setRole: (role: InvitableRole) => void
  t: Translate
}): JSX.Element {
  const commit = (): void => {
    const { good, rest } = splitEmails(draft, emails)
    if (good.length > 0) setEmails((all) => [...all, ...good])
    setDraft(rest)
  }
  return (
    <div className="tv-team-body">
      <div>
        <label className="tv-team-sec" htmlFor="tracy-mysites-invite-emails">
          {t('wizard.emails')}
        </label>
        <div className="tv-team-field">
          {emails.map((e) => (
            <span key={e} className="tv-team-chip">
              {e}
              <button
                type="button"
                aria-label={t('wizard.removeEmail', { email: e })}
                onClick={() => setEmails((all) => all.filter((x) => x !== e))}
              >
                <X aria-hidden="true" />
              </button>
            </span>
          ))}
          <Input
            id="tracy-mysites-invite-emails"
            type="text"
            autoFocus
            autoComplete="off"
            className="tv-team-field-input"
            placeholder={emails.length === 0 ? t('wizard.emailsPlaceholder') : t('wizard.emailsMore')}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
                e.preventDefault()
                commit()
              }
            }}
          />
        </div>
        <p className="tv-team-help">{t('wizard.emailsHint')}</p>
      </div>
      <RoleRows roles={roles} value={role} onChange={setRole} help={t('wizard.ownerNote')} t={t} />
    </div>
  )
}

/**
 * Every site the viewer may invite on, the open one first and ticked. A site whose seat cannot
 * invite at the chosen role cannot be ticked: picking the role first must never quietly lower it.
 */
export function SitesStep({
  sites,
  here,
  picked,
  setPicked,
  role,
  t
}: {
  sites: InvitableSite[]
  here: string | undefined
  picked: string[]
  setPicked: (update: (all: string[]) => string[]) => void
  role: InvitableRole | null
  t: Translate
}): JSX.Element {
  return (
    <div className="tv-team-body">
      <div>
        <SectionHeading count={sites.length}>{t('wizard.step.sites')}</SectionHeading>
        <ul className="tv-team-list tv-team-sites">
          {sites.map((s) => {
            const ticked = picked.includes(s.siteKey)
            const takes = role !== null && siteTakes(s.myRole, role)
            return (
              <li
                key={s.siteKey}
                data-selected={ticked ? '' : undefined}
                data-unavailable={takes ? undefined : ''}
              >
                <label className="tv-team-row">
                  <Checkbox
                    checked={ticked}
                    disabled={!takes && !ticked}
                    onCheckedChange={(c) =>
                      setPicked((all) => (c ? [...all, s.siteKey] : all.filter((k) => k !== s.siteKey)))
                    }
                  />
                  <CmsLogo platform={s.platform} />
                  <span className="tv-team-row-title tv-team-grow">{siteName(s)}</span>
                  {s.siteKey === here && <span className="tv-team-here">{t('wizard.thisSite')}</span>}
                  <RoleBadge role={s.myRole} t={t} />
                </label>
              </li>
            )
          })}
        </ul>
        <p className="tv-team-help">{t('wizard.sitesHint')}</p>
      </div>
    </div>
  )
}

/** Review: the Inbox card the invited person gets, drawn with the Inbox's own sentence. */
export function ReviewStep({
  emails,
  role,
  targets,
  inviter,
  failure,
  t
}: {
  emails: string[]
  role: InvitableRole
  targets: InvitableSite[]
  inviter: string
  failure: Failure | null
  t: Translate
}): JSX.Element {
  const site = targets.map(siteName).join(', ')
  const line = t('wizard.preview.invited', { asRole: t(`wizard.asRole.${role}`), site })
  const verb = t('wizard.preview.verb')
  const at = verb && verb !== 'wizard.preview.verb' ? line.indexOf(verb) : -1
  const count = siteCountPhrase(targets.length)
  return (
    <div className="tv-team-body">
      <div>
        <SectionHeading>{t('wizard.reviewTitle')}</SectionHeading>
        <div className="tv-team-card" aria-hidden="true">
          <span className="tv-team-tile tv-team-tile-40">
            <UserPlus />
          </span>
          <div className="tv-team-grow">
            <div className="tv-team-name">{inviter}</div>
            <div className="tv-team-line">
              {at < 0 ? (
                line
              ) : (
                <>
                  {line.slice(0, at)}
                  <span className="tv-team-verb">{verb}</span>
                  {line.slice(at + verb.length)}
                </>
              )}
            </div>
            <div className="tv-team-card-actions">
              <span className="tv-team-fake-primary">{t('wizard.preview.accept')}</span>
              <span className="tv-team-fake-outline">{t('wizard.preview.decline')}</span>
            </div>
          </div>
        </div>
        <p className="tv-team-help">
          {t('wizard.reviewFacts', {
            emails: emails.join(', '),
            role: t(`role.${role}`),
            sites: t(count.key, count.params)
          })}
        </p>
        {failure !== null && (
          <p className="tv-team-error" role="alert" data-invite-failure={failure}>
            {t(FAILURE_KEY[failure])}
          </p>
        )}
      </div>
    </div>
  )
}

function outcomeText(
  r: { outcome: Outcome },
  notified: boolean
): { key: string; tone: 'ok' | 'muted' | 'bad' } {
  if (r.outcome === 'refused') return { key: 'outcome.refused', tone: 'bad' }
  if (r.outcome === 'already_granted') return { key: 'outcome.alreadyGranted', tone: 'muted' }
  if (r.outcome === 'approved') return { key: 'outcome.approved', tone: 'ok' }
  return notified ? { key: 'outcome.invited', tone: 'ok' } : { key: 'outcome.notMailed', tone: 'bad' }
}

const allWent = (results: SentResult[]): boolean =>
  results.every(
    (r) => r.notified && r.sites.every((s) => s.outcome === 'invited' || s.outcome === 'approved')
  )

/**
 * Done. One address that went out to every site reads as the Inbox's green tile and one sentence.
 * Anything else — several people, a refusal, a seat already held, a mail that did not leave —
 * keeps the line per person and per site, so nothing is drawn as sent that was not.
 */
export function DoneStep({
  results,
  sites,
  t
}: {
  results: SentResult[]
  sites: InvitableSite[]
  t: Translate
}): JSX.Element {
  const nameOf = (key: string): string => {
    const site = sites.find((x) => x.siteKey === key)
    return site ? siteName(site) : key
  }
  const ok = allWent(results)
  const only = results.length === 1 ? results[0] : undefined
  return (
    <div className="tv-team-body">
      {ok && (
        <div className="tv-team-done">
          <span className="tv-team-tile tv-team-tile-40 tv-team-tile-in">
            <Check />
          </span>
          <div className="tv-team-name">{t('wizard.doneTitle')}</div>
          {only !== undefined && (
            <div className="tv-team-help">
              {t('wizard.doneBody', {
                email: only.email,
                site: only.sites.map((s) => nameOf(s.siteKey)).join(', ')
              })}
            </div>
          )}
        </div>
      )}
      {ok && only !== undefined && <SpamHintRows result={only} t={t} />}
      {!(ok && only !== undefined) &&
        results.map((r) => (
          <div key={r.email}>
            <SectionHeading>{r.email}</SectionHeading>
            <ul className="tv-team-list">
              {r.sites.map((s) => {
                const o = outcomeText(s, r.notified)
                const next = s.outcome === 'refused' ? nextStepKey(s.code) : null
                const site = sites.find((x) => x.siteKey === s.siteKey)
                return (
                  <li
                    key={s.siteKey}
                    className="tv-team-outcome"
                    data-outcome={s.outcome}
                    data-refusal={s.outcome === 'refused' ? (s.code ?? '') : undefined}
                  >
                    <div className="tv-team-row">
                      <CmsLogo platform={site?.platform ?? null} />
                      <span className="tv-team-row-title tv-team-grow">{nameOf(s.siteKey)}</span>
                      <span className="tv-team-tone" data-tone={o.tone}>
                        {t(o.key)}
                      </span>
                    </div>
                    {next !== null && <p className="tv-team-help">{t(next)}</p>}
                  </li>
                )
              })}
            </ul>
            {r.inviteUrl !== undefined && <SpamHintRows result={r} t={t} linkOnly />}
          </div>
        ))}
    </div>
  )
}

/**
 * Spam hints D1 + D2 on Done, variant C (Akemi 05/10): an "Invite link" row the inviter can copy
 * and send another way, and an "Email sent" row asking them to have it looked for in Spam. The
 * link is the door's own (`inviteUrl`, the inviter's answer only); without one there is no row.
 * `linkOnly` is the per-person list of a send to several people, where the outcomes say the rest.
 */
function SpamHintRows({
  result,
  t,
  linkOnly = false
}: {
  result: SentResult
  t: Translate
  linkOnly?: boolean
}): JSX.Element | null {
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle')
  const link = result.inviteUrl
  const mailRow = !linkOnly && result.notified
  if (link === undefined && !mailRow) return null
  const copyLink = async (): Promise<void> => {
    if (link === undefined) return
    try {
      await navigator.clipboard.writeText(link)
      setCopy('copied')
    } catch {
      setCopy('failed')
    }
  }
  return (
    <ul className="tv-team-list tv-team-hints">
      {link !== undefined && (
        <li>
          <div className="tv-team-row tv-team-row-static">
            <span className="tv-team-tile" aria-hidden="true">
              <Link2 />
            </span>
            <span className="tv-team-row-text">
              <span className="tv-team-row-title">{t('wizard.linkTitle')}</span>
              <span className="tv-team-row-desc">{t('wizard.linkHelp', { email: result.email })}</span>
            </span>
            {/* Both labels share one grid cell, so the button is always as wide as the longer of
                the two in this language and "copied" never reflows the row. */}
            <Button variant="outline" size="sm" className="tv-team-copy" onClick={() => void copyLink()}>
              <span className="tv-team-copy-label" aria-hidden={copy === 'copied'}>
                {t('wizard.copyLink')}
              </span>
              <span className="tv-team-copy-label" aria-hidden={copy !== 'copied'}>
                {t('wizard.linkCopied')}
              </span>
            </Button>
          </div>
          <span className="tv-sr-only" role="status" aria-live="polite">
            {copy === 'copied' ? t('wizard.linkCopied') : ''}
          </span>
          {copy === 'failed' && (
            <div className="tv-team-hint-fallback">
              <p className="tv-team-help">{t('wizard.copyFailed')}</p>
              <Input
                readOnly
                value={link}
                aria-label={t('wizard.linkTitle')}
                onFocus={(event) => event.currentTarget.select()}
              />
            </div>
          )}
        </li>
      )}
      {mailRow && (
        <li>
          <div className="tv-team-row tv-team-row-static">
            <span className="tv-team-tile" aria-hidden="true">
              <Mail />
            </span>
            <span className="tv-team-row-text">
              <span className="tv-team-row-title">{t('wizard.emailSentTitle')}</span>
              <span className="tv-team-row-desc">{t('wizard.emailSentHelp')}</span>
            </span>
          </div>
        </li>
      )}
    </ul>
  )
}
