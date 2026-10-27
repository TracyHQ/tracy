/**
 * The invite wizard's rules as plain functions (layout D3, Akemi 04/10/2026): which step follows
 * which, which sites a role can go to, and the counted phrases ("1 site selected", "One email for
 * 3 sites"). Kept apart from the JSX so each rule is tested without a DOM.
 */
import { type InvitableRole, inviteRolesFor, type SeatRole } from './roster'

export type Step = 'people' | 'sites' | 'review' | 'sent'

/** The three steps the stepper counts; Done is not one of them. */
export const STEPS: readonly { id: Exclude<Step, 'sent'>; key: string }[] = [
  { id: 'people', key: 'wizard.step.people' },
  { id: 'sites', key: 'wizard.step.sites' },
  { id: 'review', key: 'wizard.step.review' }
]

/**
 * The step after `step`. A wizard opened for a fixed address (re-inviting somebody here) already
 * knows its sites, so People goes straight to Review.
 */
export function nextStep(step: Step, sitesKnown: boolean): Step {
  if (step === 'people') return sitesKnown ? 'review' : 'sites'
  if (step === 'sites') return 'review'
  return 'sent'
}

/** The step before `step`, the mirror of {@link nextStep}. */
export function previousStep(step: Step, sitesKnown: boolean): Step {
  if (step === 'review') return sitesKnown ? 'people' : 'sites'
  return 'people'
}

/** Whether a seat of `myRole` on a site may invite somebody there as `role`. */
export const siteTakes = (myRole: SeatRole | string | null, role: InvitableRole): boolean =>
  inviteRolesFor(myRole).includes(role)

/** The open site first, the rest in the order given; the list is never reordered otherwise. */
export function hereFirst<T extends { siteKey: string }>(sites: readonly T[], here: string | undefined): T[] {
  const open = sites.filter((s) => s.siteKey === here)
  return [...open, ...sites.filter((s) => s.siteKey !== here)]
}

/** A counted phrase: the key for one, or the key for many with `{count}`. */
export interface Counted {
  key: string
  params?: { count: number }
}

const counted = (count: number, one: string, many: string): Counted =>
  count === 1 ? { key: one } : { key: many, params: { count } }

/** "1 site selected" / "{count} sites selected", under the Sites step. */
export const selectedPhrase = (count: number): Counted =>
  counted(count, 'wizard.selectedOne', 'wizard.selectedMany')

/** "One email for 1 site" / "One email for {count} sites", under Review. */
export const summaryPhrase = (count: number): Counted =>
  counted(count, 'wizard.reviewSummaryOne', 'wizard.reviewSummaryMany')

/** "1 site" / "{count} sites", inside the Review facts line. */
export const siteCountPhrase = (count: number): Counted =>
  counted(count, 'wizard.siteCountOne', 'wizard.siteCountMany')

/** The short name a person is shown by: their display name, else the part of the address before @. */
export function shortNameOf(person: { displayName?: string | null; email: string | null }): string {
  const name = person.displayName?.trim()
  if (name) return name
  const email = person.email ?? ''
  const at = email.indexOf('@')
  return at > 0 ? email.slice(0, at) : email
}
