/**
 * The background checks behind the Website and Social cells, run the same way by Find and My
 * opportunities on the rows they show: website checks every few seconds while any is owed, social
 * stats every ten seconds while any page is waiting. The first call of each is what queues the work,
 * so it runs at once; a refusal that asking again cannot change (`pollRefused`) stops that poll.
 */
import { useState } from 'react'
import type { PlaceRow, SiteCheck } from '@tracy/wo-views'
import { sortRows } from '@tracy/wo-views/model'

import type { Api } from './api.ts'
import { type SocialHandle, socialAnswer, socialToAsk, uncheckedWebsites } from './flow.ts'
import { POLL_MS, SOCIAL_POLL_MS, pollRefused, usePoll } from './poll.ts'

/** The site-checks door takes at most this many addresses a call. */
export const CHECK_BATCH = 60
/** Social pages a call asks about; the server fetches only its auto budget of them (score order). */
export const SOCIAL_BATCH = 40

type CheckRow = Pick<PlaceRow, 'website' | 'siteCheck' | 'score' | 'socials' | 'social'>

/** Websites still owed a check, best score first (the server checks the first of each call), each once. */
export function sitesToAsk(rows: readonly CheckRow[], batch = CHECK_BATCH): string[] {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: sortRows('score') reads only `score`, which CheckRow carries.
  return uncheckedWebsites(sortRows(rows as PlaceRow[], 'score', -1)).slice(0, batch)
}

/** Linked pages with no numbers yet, or still queued, best score first, each once. */
export function socialPagesToAsk(rows: readonly CheckRow[], batch = SOCIAL_BATCH): SocialHandle[] {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: as above; socialToAsk reads `socials` and `social`.
  return socialToAsk(sortRows(rows as PlaceRow[], 'score', -1)).slice(0, batch)
}

/** One site-checks call: the checks answered, or `stop` when asking again cannot help. */
export async function askSiteChecks(
  api: Pick<Api, 'siteChecks'>,
  urls: string[]
): Promise<{ checks: Record<string, SiteCheck> | null; stop: boolean }> {
  const answer = await api.siteChecks(urls)
  if (answer.ok) return { checks: answer.body?.checks ?? {}, stop: false }
  return { checks: null, stop: pollRefused(answer.code) }
}

/**
 * One social-stats call, with every page asked and left out of the answer as `not_queued`. A refusal
 * that stops the poll leaves every page asked `not_queued` too: its button, not "Checking…".
 */
export async function askSocialStats(
  api: Pick<Api, 'socialStats'>,
  handles: SocialHandle[]
): Promise<{ stats: Record<string, unknown> | null; stop: boolean }> {
  const answer = await api.socialStats(handles)
  if (answer.ok) return { stats: socialAnswer(handles, answer.body), stop: false }
  const stop = pollRefused(answer.code)
  return { stats: stop ? socialAnswer(handles, null) : null, stop }
}

/**
 * Both polls over `rows` while `active`. `onChecks`/`onStats` receive each answer; `stopped` says a
 * poll was refused for good (its rows then wait for nothing). `reset` lets a new search ask again.
 */
export function useCheckPolls({
  api,
  rows,
  socialRows = rows,
  active,
  social,
  onChecks,
  onStats
}: {
  api: Pick<Api, 'siteChecks' | 'socialStats'>
  /** Rows whose websites are checked. */
  rows: readonly CheckRow[]
  /** Rows whose social pages are asked about (default: `rows`). */
  socialRows?: readonly CheckRow[]
  active: boolean
  /** `/capabilities` names a usable social-stats provider. */
  social: boolean
  onChecks: (checks: Record<string, SiteCheck>) => void
  onStats: (stats: Record<string, unknown>) => void
}): { sitesStopped: boolean; socialStopped: boolean; reset: () => void } {
  const [sitesStopped, setSitesStopped] = useState(false)
  const [socialStopped, setSocialStopped] = useState(false)
  const sites = sitesToAsk(rows)
  const pages = social ? socialPagesToAsk(socialRows) : []
  usePoll(
    async () => {
      const { checks, stop } = await askSiteChecks(api, sites)
      if (checks !== null) onChecks(checks)
      if (stop) setSitesStopped(true)
    },
    active && sites.length > 0 && !sitesStopped,
    POLL_MS,
    { leading: true }
  )
  usePoll(
    async () => {
      const { stats, stop } = await askSocialStats(api, pages)
      if (stats !== null) onStats(stats)
      if (stop) setSocialStopped(true)
    },
    active && pages.length > 0 && !socialStopped,
    SOCIAL_POLL_MS,
    { leading: true }
  )
  return {
    sitesStopped,
    socialStopped,
    reset: () => {
      setSitesStopped(false)
      setSocialStopped(false)
    }
  }
}
