/**
 * [TAM] Temporary developer preview, never ships: remove this file and every line marked [TAM].
 *
 * The Details states the preview panel can show (`preview-panel.tsx`), each made from the real Details answer by
 * patching only the fields the stepper, the section cards and the blocks read (research, jobs, sources, profile, brief, brief
 * job, demo, demo action). The place's name, type and address stay real. Pure: no DOM, no fetch; the clock is given.
 */
import { pastedLinksOf } from './source-links-model.ts'

type Body = Record<string, unknown>

/** A small drawn home page (header, hero, three cards) standing in for the build's picture. */
const PREVIEW_PICTURE = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 400"><rect width="640" height="400" fill="rgb(247,244,238)"/>' +
    '<rect width="640" height="44" fill="rgb(255,255,255)"/><rect x="24" y="15" width="90" height="14" rx="3" fill="rgb(40,60,52)"/>' +
    '<rect x="380" y="18" width="220" height="8" rx="4" fill="rgb(190,190,180)"/><rect y="44" width="640" height="200" fill="rgb(52,92,74)"/>' +
    '<rect x="40" y="100" width="300" height="26" rx="4" fill="rgb(255,255,255)"/><rect x="40" y="140" width="220" height="10" rx="5" fill="rgb(210,226,216)"/>' +
    '<rect x="40" y="176" width="110" height="32" rx="6" fill="rgb(214,150,74)"/><rect x="40" y="268" width="170" height="110" rx="8" fill="rgb(229,221,206)"/>' +
    '<rect x="235" y="268" width="170" height="110" rx="8" fill="rgb(229,221,206)"/><rect x="430" y="268" width="170" height="110" rx="8" fill="rgb(229,221,206)"/></svg>'
)}`

export const PREVIEW_STATES = [
  'real',
  'new',
  'researching',
  'profile-review',
  'profile-approved',
  'brief-running',
  'brief-failed',
  'brief-review',
  'brief-approved',
  'building',
  'built',
  'built-plain',
  'built-review'
] as const
export type PreviewStateId = (typeof PREVIEW_STATES)[number]

export const PREVIEW_LABELS: Readonly<Record<PreviewStateId, string>> = {
  real: 'Real data',
  new: 'New place',
  researching: 'Researching',
  'profile-review': 'Business facts need review',
  'profile-approved': 'Business facts approved',
  'brief-running': 'Writing site content brief',
  'brief-failed': 'Site content brief failed',
  'brief-review': 'Site content brief needs review',
  'brief-approved': 'Site content brief approved',
  building: 'Building',
  built: 'Built',
  'built-plain': 'Built, no picture',
  'built-review': 'Built, QA needs review'
}

export const isPreviewState = (v: unknown): v is PreviewStateId =>
  typeof v === 'string' && (PREVIEW_STATES as readonly string[]).includes(v)

/** The flag `wo-preview=1`, in the query string or in the hash (read like `my-address.ts` reads the address). */
export function previewFlag(search: string, hash = ''): boolean {
  const inSearch = new URLSearchParams(search).get('wo-preview') === '1'
  const h = hash.replace(/^#/, '')
  const inHash = new URLSearchParams(h.includes('?') ? h.slice(h.indexOf('?')) : h).get('wo-preview') === '1'
  return inSearch || inHash
}

const rec = (v: unknown): Body =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Body) : {}
const list = (v: unknown): Body[] =>
  Array.isArray(v) ? v.filter((x) => typeof x === 'object' && x !== null) : []

/**
 * Research turns every pasted link into a source row (sources are fixed once it starts). A card that was never
 * researched has no row for them yet, so each pasted link no real row covers gets one, collected at `collectedAt`,
 * shaped like the server's own row (`source-links-model.ts sourcesToShow`).
 */
export function pastedRows(opportunity: unknown, sources: readonly Body[], collectedAt: string): Body[] {
  const covered = (l: { source: string; url: string }): boolean =>
    sources.some(
      (s) => s.pastedLink === l.url || s.ref === l.url || (l.source !== 'listing' && s.source === l.source)
    )
  return pastedLinksOf(opportunity)
    .filter((l) => !covered(l))
    .map((l) => ({ source: l.source, ref: l.url, pastedLink: l.url, status: 'complete', collectedAt }))
}

export function applyPreview(real: Body | null, state: PreviewStateId, now: number): Body | null {
  if (real === null || state === 'real') return real
  const at = (minutes: number): string => new Date(now + minutes * 60_000).toISOString()
  const opp = rec(real.opportunity)
  const slug =
    String(opp.name ?? 'demo')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'demo'
  const sources = list(real.sources)
  const noDemo = { demo: null, demoAction: null, builds: [] }
  // The seller's approvals (#537), as the server answers them (approval.js approvalOf).
  const approval = (over: Body): Body => ({
    research: 'ok',
    profile: 'none',
    profileApprovedAt: null,
    profileChangedAt: null,
    brief: 'none',
    briefApprovedAt: null,
    briefStale: null,
    ...over
  })
  const approved = { profile: 'approved', profileApprovedAt: at(-50) }
  const noBrief = { brief: null, briefJob: null, revisions: [] }

  if (state === 'new')
    return {
      ...real,
      ...noDemo,
      ...noBrief,
      research: { state: 'not_started', researchedAt: null },
      approval: approval({}),
      stepProgress: null,
      jobs: [],
      profile: null,
      media: [],
      menu: null,
      // No research rows yet: Sources lists the links the owner pasted (`source-links-model.ts`).
      sources: []
    }

  if (state === 'researching') {
    // A third of the sources done, the next ones being read, the rest queued.
    const third = Math.max(1, Math.ceil(sources.length / 3))
    return {
      ...real,
      ...noDemo,
      ...noBrief,
      research: { state: 'running', researchedAt: null },
      approval: approval({}),
      // What the band lists when the server sends the research sub-steps (not sent yet: TAM only).
      stepProgress: {
        step: 'research',
        items: [
          { key: 'google-places', label: 'Google Places', state: 'done' },
          { key: 'instagram', label: 'Instagram', state: 'running' },
          { key: 'website', label: 'Website', state: 'waiting' },
          { key: 'profile', label: 'Writing the business facts', state: 'waiting' }
        ]
      },
      jobs: [
        {
          id: 'preview-research-job',
          kind: 'research',
          state: 'running',
          stage: 'social',
          progress: {},
          lastError: null,
          createdAt: at(-2),
          updatedAt: at(0)
        }
      ],
      // No profile yet: the Profile draws the name and phone known so far and Collecting… for the rest.
      profile: null,
      menu: null,
      media: list(real.media).slice(0, 4),
      sources: sources.map((s, i) =>
        i < third
          ? { ...s, status: 'complete' }
          : i < third * 2
            ? {
                ...s,
                status: 'partial',
                reason: null,
                coverage: { fetched: 4, total: 12 },
                collectedAt: null
              }
            : { ...s, status: null, reason: null, coverage: null, collectedAt: null }
      )
    }
  }

  // Every later state: research done, the real profile, sources and media kept.
  const research = rec(real.research)
  const researchedAt = typeof research.researchedAt === 'string' ? research.researchedAt : at(-60)
  const jobs = list(real.jobs).some((j) => j.state === 'completed')
    ? real.jobs
    : [
        {
          id: 'preview-research-job',
          kind: 'research',
          state: 'completed',
          stage: 'done',
          progress: {},
          lastError: null,
          createdAt: at(-62),
          updatedAt: researchedAt
        }
      ]
  // Sources the real card never researched read as collected at that time, so the table agrees with the step.
  const collected = [
    ...sources.map((s) =>
      typeof s.status === 'string' && s.status !== ''
        ? s
        : { ...s, status: 'complete', collectedAt: researchedAt }
    ),
    ...pastedRows(real.opportunity, sources, researchedAt)
  ]
  const done = {
    ...real,
    research: { state: 'done', researchedAt },
    jobs,
    sources: collected,
    stepProgress: null
  }

  if (state === 'profile-review')
    return { ...done, ...noDemo, ...noBrief, approval: approval({ profile: 'needed' }) }
  if (state === 'profile-approved') return { ...done, ...noDemo, ...noBrief, approval: approval(approved) }

  if (state === 'brief-running')
    return {
      ...done,
      approval: approval(approved),
      ...noDemo,
      ...noBrief,
      // No job id: the brief job poll never asks the server about it.
      briefJob: { state: 'running', step: 'labelling', error: null, startedAt: at(-1), updatedAt: at(0) }
    }
  if (state === 'brief-failed')
    return {
      ...done,
      approval: approval(approved),
      ...noDemo,
      ...noBrief,
      briefJob: {
        state: 'failed',
        step: 'labelling',
        error: { code: 'BRIEF_INTERRUPTED' },
        startedAt: at(-3),
        updatedAt: at(-1)
      }
    }

  const realBrief = rec(real.brief)
  const brief = {
    id: typeof realBrief.id === 'string' ? realBrief.id : 'preview-brief',
    n: typeof realBrief.n === 'number' ? realBrief.n : 1,
    createdAt: at(-30),
    current: true
  }
  const revisions =
    list(real.revisions).length > 0
      ? real.revisions
      : [{ id: brief.id, n: brief.n, createdAt: brief.createdAt }]
  const withBrief = {
    ...done,
    brief,
    revisions,
    briefJob: {
      state: 'done',
      step: 'writing',
      error: null,
      revisionId: brief.id,
      updatedAt: brief.createdAt
    }
  }

  const briefOk = approval({ ...approved, brief: 'approved', briefApprovedAt: at(-20) })
  if (state === 'brief-review')
    return { ...withBrief, ...noDemo, approval: approval({ ...approved, brief: 'needed' }) }
  if (state === 'brief-approved') return { ...withBrief, ...noDemo, approval: briefOk }

  if (state === 'building') {
    // Each step's time and cost as the server sends them (#537, `wo-chain-builds.js chainRunView`): a done step its
    // minutes and spend, a running step its minutes so far and no spend yet, a waiting step its measured estimate.
    const step = (
      id: string,
      s: string,
      minutes: number | null = null,
      usd: number | null = null,
      estimate: { minutes: number; usd: number } | null = null
    ) => ({
      id,
      label: id,
      state: s,
      minutes,
      usd,
      ...(s === 'upcoming' ? { estimate } : {})
    })
    return {
      ...withBrief,
      approval: briefOk,
      demo: null,
      builds: [],
      demoAction: {
        id: 'preview-demo-action',
        state: 'running',
        step: 'pictures',
        error: null,
        updatedAt: at(0),
        run: {
          steps: [
            step('kit', 'done', 0.1, 0.01),
            step('brand', 'done', 2, 0.06),
            step('plan', 'done', 6, 0.08),
            step('copy', 'current', 3),
            step('pictures', 'current', 2),
            step('write', 'upcoming', null, null, { minutes: 4, usd: 0.3 })
          ],
          current: 'pictures',
          startedAt: at(-8),
          minutes: 8,
          usd: 0.15,
          estimate: { minutes: 26, usd: 1.84 }
        }
      }
    }
  }

  // built (and its two variants, #537 option A): the site was made AFTER the seller approved the brief. `effectiveOf` (stepper-model.ts) drops a demo whose
  // brief was approved after it was built, so the approval here predates the build (demoAction.updatedAt below).
  return {
    ...withBrief,
    approval: approval({ ...approved, brief: 'approved', briefApprovedAt: at(-24 * 60 - 30) }),
    builds: [],
    demo: {
      siteKey: `${slug}-demo`,
      url: `https://${slug}.example.test/`,
      expiresAt: at(14 * 24 * 60),
      frozenAt: null,
      deletedAt: null,
      deletesAt: null,
      qa: state === 'built-review' ? 'needs-review' : 'passed',
      build: { status: 'done', startedAt: at(-24 * 60) },
      // What the build took, its failing checks and its picture (`GET …/:id` demo, #537 option A).
      built: { at: at(-60), minutes: 26, usd: 1.84 },
      findings: state === 'built-review' ? ['cta-real', 'no-demo-pictures'] : [],
      preview: state === 'built-plain' ? null : { url: PREVIEW_PICTURE, capturedAt: at(-59) }
    },
    demoAction: {
      id: 'preview-demo-action',
      state: 'completed',
      step: 'write',
      error: null,
      updatedAt: at(-60)
    }
  }
}
