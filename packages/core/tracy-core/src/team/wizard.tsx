/**
 * The invite wizard, layout D3 (Akemi 04/10/2026; Lee built it 04/09, Hano touched it in #853):
 * People (addresses and role) → Sites → Review → Done.
 *
 * People takes SEVERAL addresses, and every later step applies to all of them — one role, one set
 * of sites, no per-person branching (Lee, 04/09: a simpler system). The role is picked first, from
 * what every ticked site accepts from the viewer (`inviteRolesAcross`): an Owner or an Editor seat
 * invites an Editor or a Viewer, never an Owner (ADR 0028). Sites then lets the reader tick only sites
 * that take that role, so a wizard can never reach Review with a role its sites would refuse
 * (#798). Only the site the wizard was opened from starts ticked.
 *
 * The send is ONE call: `POST /api/team/invite { emails, role, siteKeys }` (`invite-answer.ts`
 * reads the answer). The seat book answers per person and per site, and Done shows exactly that —
 * a refusal on one site is a line on that site with what to do next, not a failure of the whole
 * run. Each person gets one mail with one link; the seats are granted when they click it, which is
 * why the outcome reads "waiting for them to accept" and never "added".
 *
 * Whatever the seat book wrote, the page hears it: one `tracy:team-changed {siteKey}` per site the
 * send wrote a seat on ({@link writtenSites}), so the Team start card of every such site counts
 * again — not only the site of the tab the wizard was opened from.
 */
import { type JSX, useEffect, useRef, useState } from 'react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@tracy/ui'

import { TEAM_CHANGED_EVENT } from './face'
import { type Failure, failureOf, readResults, type SentResult, writtenSites } from './invite-answer'
import { type InvitableRole, inviteRolesAcross, type SeatRole } from './roster'
import type { Translate } from './translate'
import { hereFirst, nextStep, previousStep, selectedPhrase, type Step, summaryPhrase } from './wizard-plan'
import { DoneStep, PeopleStep, ReviewStep, SitesStep, Stepper } from './wizard-steps'

export { writtenSites } from './invite-answer'

/** A site the viewer may invite on (`canInvite`), as the wizard needs it. */
export interface InvitableSite {
  siteKey: string
  /** The name the site is shown by; a rename changes it, never the key the invite is sent for. */
  displayName?: string
  platform: string | null
  /** The viewer's ACCEPTED role there: it decides which roles this site lets them invite. */
  myRole: SeatRole
}

export interface WizardPreset {
  /**
   * Addresses fixed in advance — re-inviting somebody. When this is non-empty the sites are
   * already answered too, so People goes straight to Review. Empty means the reader types them.
   */
  emails: string[]
  /** Sites ticked in advance: the site the wizard was opened from, shown first as "This site". */
  siteKeys: string[]
}

export function InviteWizard({
  open,
  onOpenChange,
  sites,
  preset,
  inviter = '',
  onSent,
  t
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  sites: InvitableSite[]
  preset?: WizardPreset
  /** The viewer's short name, as the invited person's Inbox will show it on Review. */
  inviter?: string
  /** Called once the seat book answered, so the tab re-reads the books it changed. */
  onSent: () => void
  t: Translate
}): JSX.Element {
  const sitesKnown = (preset?.emails.length ?? 0) > 0
  const here = preset?.siteKeys.length === 1 ? preset.siteKeys[0] : undefined
  const [step, setStep] = useState<Step>('people')
  const [emails, setEmails] = useState<string[]>(preset?.emails ?? [])
  const [draft, setDraft] = useState('')
  const [picked, setPicked] = useState<string[]>(preset?.siteKeys ?? sites.map((s) => s.siteKey))
  const [role, setRole] = useState<InvitableRole>('editor')
  const [sending, setSending] = useState(false)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [results, setResults] = useState<SentResult[] | null>(null)
  /** A send is on its way. A ref, not `sending`: two presses in one tick both read the old state. */
  const inFlight = useRef(false)
  /** False once this wizard is gone, so a late answer draws nothing in it. */
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const listed = hereFirst(sites, here)
  const targets = listed.filter((s) => picked.includes(s.siteKey))
  /** What every ticked site would accept from the viewer; empty with nothing ticked. */
  const roles = inviteRolesAcross(targets.map((s) => s.myRole))
  /**
   * The role this invitation carries: the one picked while the ticked sites still allow it, else
   * the lowest they allow, else none. Derived on every render, so a role picked for one
   * set of sites can never be sent to a set that would refuse it.
   */
  const chosen: InvitableRole | null = roles.includes(role) ? role : (roles[roles.length - 1] ?? null)

  // Nobody to invite, nowhere to invite to, or no role every ticked site accepts: no way on.
  const canNext =
    step === 'people' ? emails.length > 0 && chosen !== null : targets.length > 0 && chosen !== null
  const next = (): void => {
    if (!canNext) return
    if (chosen !== null) setRole(chosen)
    setStep(nextStep(step, sitesKnown))
  }

  const send = async (): Promise<void> => {
    if (inFlight.current || chosen === null || emails.length === 0) return
    inFlight.current = true
    setSending(true)
    setFailure(null)
    const siteKeys = targets.map((s) => s.siteKey)
    let answer: SentResult[] | Failure
    try {
      const res = await fetch('/api/team/invite', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ emails, role: chosen, siteKeys })
      })
      if (res.ok) {
        const body: unknown = await res.json().catch(() => null)
        answer = readResults(body, emails, siteKeys) ?? 'unknown'
      } else {
        answer = await failureOf(res)
      }
    } catch {
      answer = 'unknown'
    }
    inFlight.current = false
    // Every site whose book this send wrote, also from a wizard that has been closed: the Team start
    // card of each counts again. The window's own `CustomEvent`: one from another realm is refused.
    for (const siteKey of writtenSites(answer, siteKeys))
      window.dispatchEvent(new window.CustomEvent(TEAM_CHANGED_EVENT, { detail: { siteKey } }))
    // The book is read again whenever it may have changed, also by a wizard that has been closed.
    if (typeof answer !== 'string' || answer === 'unknown') onSent()
    if (!alive.current) return
    setSending(false)
    if (typeof answer === 'string') {
      setFailure(answer)
      return
    }
    setResults(answer)
    setStep('sent')
  }

  /** Invite more: the same role and sites, a fresh list of people. */
  const again = (): void => {
    setEmails([])
    setDraft('')
    setResults(null)
    setFailure(null)
    setStep('people')
  }

  const left =
    step === 'sites'
      ? selectedPhrase(targets.length)
      : step === 'review'
        ? summaryPhrase(targets.length)
        : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('action.close')} className="tracy-mysites tracy-site-tabs tv-team-dialog">
        <DialogHeader>
          <DialogTitle>{t('wizard.title')}</DialogTitle>
          {step !== 'sent' && <DialogDescription>{t('wizard.description')}</DialogDescription>}
        </DialogHeader>
        {step !== 'sent' && <Stepper at={step} t={t} />}

        {step === 'people' && (
          <PeopleStep
            emails={emails}
            setEmails={setEmails}
            draft={draft}
            setDraft={setDraft}
            roles={roles}
            role={chosen}
            setRole={setRole}
            t={t}
          />
        )}
        {step === 'sites' && (
          <SitesStep sites={listed} here={here} picked={picked} setPicked={setPicked} role={chosen} t={t} />
        )}
        {step === 'review' && chosen !== null && (
          <ReviewStep
            emails={emails}
            role={chosen}
            targets={targets}
            inviter={inviter}
            failure={failure}
            t={t}
          />
        )}
        {step === 'sent' && results !== null && <DoneStep results={results} sites={sites} t={t} />}

        <DialogFooter className="tv-team-foot">
          {left !== null && <span className="tv-team-foot-left">{t(left.key, left.params)}</span>}
          {step === 'sent' ? (
            <>
              <Button variant="outline" size="sm" onClick={again}>
                {t('wizard.inviteMore')}
              </Button>
              <Button size="sm" onClick={() => onOpenChange(false)}>
                {t('wizard.done')}
              </Button>
            </>
          ) : (
            <>
              {step !== 'people' && (
                <Button variant="ghost" size="sm" onClick={() => setStep(previousStep(step, sitesKnown))}>
                  {t('wizard.back')}
                </Button>
              )}
              {step === 'review' ? (
                <Button size="sm" disabled={sending || chosen === null} onClick={() => void send()}>
                  {sending
                    ? t('wizard.sending')
                    : emails.length === 1
                      ? t('wizard.send')
                      : t('wizard.sendMany', { count: emails.length })}
                </Button>
              ) : (
                <Button size="sm" disabled={!canNext} onClick={next}>
                  {t('wizard.continue')}
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
