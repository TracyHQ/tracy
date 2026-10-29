/**
 * Site briefs (plan §10 item 4; template-free since 24/10/2026): an immutable snapshot of the research — the
 * brief and the asset manifest it read — that names no CMS and no template. The build holds what it is built with
 * (`build-choice.js`, `wo_build.choice`), so one brief feeds demos on any CMS and template.
 *
 * 🔒 ONE BRIEF PER RESEARCH READ. `research_hash` hashes the exact object the brief is made from (opportunity
 * overlay, profile, brand, sources, media, posts, place snapshot); a build whose research has not changed adopts
 * that brief (and the demo action's `revision_id` moves to it in the same transaction), else a new one is written.
 * The unique `(opportunity_id, research_hash)` index and the opportunity row lock keep two builds from writing two.
 *
 * 🔒 A BRIEF OF A RESEARCHED PLACE PINS WHAT IT READ: `place_snapshot_id`, the effective profile (the snapshot
 * with the account's overlay, `place-view.js`) and a manifest naming each picture by id AND sha256 with its
 * `origin` (`place` → `wo_place_media`, `opportunity` → `wo_media`). A later refresh publishes a new snapshot
 * and never changes those rows, so the build reads what the brief was made with.
 *
 * quality-v1 (an injected editorial preparer) is the exception: its editorial plan is made for one template, so its
 * brief keeps that build's view and is never shared (`research_hash` null). It freezes inputs in a short
 * transaction, calls models outside it, then finalizes the same input hash in a second short transaction.
 */
import { randomUUID } from 'node:crypto'
import { AGENT_DEMO, evidenceData, researchHash } from './agent-demo.js'
import { BRIEF_BUILD } from './brief-build-path.js'
import { briefWithResearch, frozenResearchOf, researchReference } from './revision-research.js'
import { quickstartReleaseMatches } from '../lib/quickstart-selection.js'
import { renderBriefWithReviews } from 'website-opportunities/src/review-sources.js'
import { chooseTemplate, resolveRevisionCms } from '../lib/wo-revision-choice.js'
import {
  briefBrand,
  fromOpportunity,
  fromPlace,
  makeSiteBrief,
  opportunityOf
} from 'website-opportunities/src/brief-research.js'
import { placeViewOf } from 'website-opportunities/src/place-view.js'
import { closedListOf } from 'website-opportunities/domain/pictures/picture-links.mjs'
import { withSocialStats } from 'website-opportunities/src/place-social-stats.js'
import { qualityHash } from './quality-dossier.js'
import { makeBuildChoice, withBuildChoice } from './build-choice.js'
import { withLogoResearch } from './logo-research.js'
import { freezePlaceProfileOrNull, PROFILE_SNAPSHOT_VERSION } from './profile-revision.js'

// Re-exported for callers that chose a template through this module before the choice moved to `lib/`.
export { chooseTemplate, resolveRevisionCms }
export { briefBrand }

/** Whether a build's template can be built: `{ok}` or the refusal code. */
export function templateRefusal(template) {
  if (template?.status === 'unselected') return 'TEMPLATE_UNSELECTED'
  if (template?.status || !template?.quickstart || !template?.design) return 'TEMPLATE_UNAVAILABLE'
  return null
}

/**
 * The brief a demo action builds from, seen with its build's choice. The choice is the build row's when one was
 * written (a retry never reads `/ops` or the template list again), else made now from the action's selection.
 * `templates`: async, the offered cards (`/api/templates`); a refusal it throws is the caller's.
 * `logoResearch`: `{research}` for `withLogoResearch`; without it a brief never waits for a logo research. While
 * one asked may still answer, `{pending: true, retryAt}` and no brief: a later call makes it.
 * @returns {Promise<{ revision: object } | { error: string }>}
 */
export async function revisionForAction(
  db,
  { action, domain, templates, ops, now = Date.now, editorial, historical, logoResearch, pictureLabels }
) {
  const built = (
    await db.query('select choice from wo_build where account_id = $1 and request_id = $2', [
      action.account_id,
      action.build_request_id
    ])
  ).rows[0]
  const workflow = historical
    ? 'none'
    : action.selection?.workflow === AGENT_DEMO || action.selection?.workflow === BRIEF_BUILD
      ? action.selection.workflow
      : editorial
        ? 'none'
        : undefined
  // The template list is read only when no build row holds the choice yet.
  const cards = built?.choice ? null : await templates()
  // An action with no selection (before 153) takes the account's CMS, else /ops's default, and its pin.
  const pref =
    built?.choice || action.selection?.cms
      ? null
      : ((await db.query('select cms from wo_preference where account_id = $1', [action.account_id]))
          .rows[0] ?? null)
  let failure = null
  // Made once: quality-v1 asks before its model call and again after, and must get the same choice.
  let chosen = built?.choice ?? null
  const choiceFor = (revision) => {
    if (chosen) return chosen
    const made = choiceOfSelection({
      selection: action.selection,
      pref,
      cards,
      domain,
      revision,
      ops,
      now,
      workflow
    })
    if (made.error) {
      failure = made.error
      return null
    }
    chosen = made.choice
    return chosen
  }
  let revision = (
    await db.query('select * from wo_revision where id = $1 and account_id = $2', [
      action.revision_id,
      action.account_id
    ])
  ).rows[0]
  if (!revision) {
    // 🔒 The brief is made once, so it waits for its logo research — by answering pending, never by sleeping
    // (logo-research.js).
    const read = await withLogoResearch(db, { action, now, ...logoResearch })
    if (read.pending) return { pending: true, retryAt: read.retryAt }
    const made = await createRevision(db, {
      accountId: action.account_id,
      opportunityId: action.opportunity_id,
      revisionId: action.revision_id,
      actionId: action.id,
      frozenResearchRead: read.input,
      researchSnapshotAt: read.snapshotAt ?? action.selection?.snapshotAt,
      domain,
      now,
      // What the brief's photographs show, asked before the brief is made (`brief-picture-labels.js`, F08).
      ...(pictureLabels ? { pictureLabels } : {}),
      ...(editorial ? { editorial, choiceFor: (frozen) => choiceFor(frozen) ?? fail(failure) } : {})
    }).catch((error) => (error?.code && error.code === failure ? { error: failure } : Promise.reject(error)))
    if (made.error) return made
    revision = made.revision
  }
  const choice = choiceFor(revision)
  if (!choice) return { error: failure }
  return { revision: withBuildChoice(revision, choice) }
}

const fail = (code) => {
  throw Object.assign(new Error(code), { code })
}

/** The action's selection (template already resolved at acceptance) as a build choice, checked against the offer. */
function choiceOfSelection({ selection, pref, cards, domain, revision, ops, now, workflow }) {
  const offer = cards ? { cards } : { error: 'TEMPLATES_UNREADABLE' }
  if (!selection?.cms) {
    const { cms, cmsSource, resolvedAt } = resolveRevisionCms(domain, pref, new Date(now()), ops)
    const pinTag = ops?.pinnedTemplates?.[cms] ?? null
    const template = chooseTemplate(
      offer,
      cms,
      undefined,
      pinTag ? { tag: pinTag, policy: ops?.templatePinPolicy ?? 'fallback-any-restaurant' } : null
    )
    if ('refusal' in template) return { error: template.refusal }
    return {
      choice: makeBuildChoice({ domain, revision, cms, cmsSource, resolvedAt, template, workflow, ops })
    }
  }
  const template = chooseTemplate(offer, selection.cms, selection, null)
  // Offered when the action was accepted, withdrawn since.
  if ('refusal' in template)
    return { error: template.refusal === 'INVALID_TEMPLATE' ? 'TEMPLATE_UNAVAILABLE' : template.refusal }
  if (
    (selection.version && template.version !== selection.version) ||
    (selection.release && !quickstartReleaseMatches(selection.release, template.release))
  )
    return { error: 'TEMPLATE_VERSION_CHANGED' }
  // Why the template was chosen at acceptance (Tracy's pick, the /ops pin), not merely that it was asked for.
  if (typeof selection.auto?.reason === 'string') template.reason = selection.auto.reason
  else if (typeof selection.reason === 'string') template.reason = selection.reason
  return {
    choice: makeBuildChoice({
      domain,
      revision,
      cms: selection.cms,
      cmsSource: 'account',
      resolvedAt: new Date(now()).toISOString(),
      template,
      workflow,
      ops
    })
  }
}

/**
 * The brief of an opportunity's current research: the one already written for it, else the next revision.
 * @param {import('pg').Pool} pool
 * @param {{
 *   accountId: string, opportunityId: string, domain: any, now?: () => number, revisionId?: string,
 *   actionId?: string, frozenResearchRead?: object, researchSnapshotAt?: string,
 *   editorial?: Function, choiceFor?: (frozen: object) => object, pictureLabels?: Function
 * }} args - `actionId`: the demo action that adopts a reused brief; `choiceFor`: quality-v1's one build;
 *   `pictureLabels`: the brief's photograph labelling (`brief-picture-labels.js`), none = unlabelled
 * @returns {Promise<{ revision: object, reused?: true } | { error: 'NOT_FOUND' }
 *   | { error: 'BRIEF_INVALID', errors: string[] }>}
 */
export async function createRevision(pool, argsIn) {
  const args = await withPictureLabelling(pool, argsIn)
  if (!args.editorial) return createBaseRevision(pool, args)
  const saved = await args.editorial.loadPrepared?.({
    accountId: args.accountId,
    opportunityId: args.opportunityId,
    revisionId: args.revisionId
  })
  const prepared = saved ? { frozen: saved } : await createBaseRevision(pool, { ...args, prepareOnly: true })
  if (!prepared.frozen) return prepared
  const frozen = prepared.frozen
  if (
    frozen.account_id !== args.accountId ||
    frozen.opportunity_id !== args.opportunityId ||
    (args.revisionId && frozen.id !== args.revisionId)
  )
    throw Object.assign(new Error('QUALITY_PREPARATION_SCOPE'), { code: 'QUALITY_PREPARATION_SCOPE' })
  const originalHash = qualityHash(frozen)
  // The transaction and its connection are closed before any model/network work.
  const editorial = await args.editorial(structuredClone(frozen))
  if (qualityHash(frozen) !== originalHash || editorial.frozenHash !== originalHash)
    throw Object.assign(new Error('QUALITY_FINALIZE_INPUT_CHANGED'), {
      code: 'QUALITY_FINALIZE_INPUT_CHANGED'
    })
  const client = await pool.connect()
  try {
    await client.query('begin')
    const opp = (
      await client.query('select id from wo_opportunity where id=$1 and account_id=$2 for update', [
        frozen.opportunity_id,
        frozen.account_id
      ])
    ).rows[0]
    if (!opp) {
      await client.query('rollback')
      return { error: 'NOT_FOUND' }
    }
    const held = (
      await client.query('select * from wo_revision where id=$1 and account_id=$2', [
        frozen.id,
        frozen.account_id
      ])
    ).rows[0]
    if (held) {
      if (qualityHash(held.brief?.editorial) !== qualityHash(editorial.reference))
        throw Object.assign(new Error('QUALITY_FINALIZE_REFERENCE_CHANGED'), {
          code: 'QUALITY_FINALIZE_REFERENCE_CHANGED'
        })
      await client.query('commit')
      return { revision: held }
    }
    const record = {
      ...frozen,
      brief: { ...frozen.brief, editorial: editorial.reference },
      brief_md: `${frozen.brief_md}\n\n${editorial.markdown}`
    }
    const inserted = await insertFrozenRevision(client, record)
    await client.query('commit')
    return { revision: inserted }
  } catch (e) {
    await client.query('rollback').catch(() => {})
    throw e
  } finally {
    client.release()
  }
}

async function createBaseRevision(pool, args) {
  const { accountId, opportunityId, domain, revisionId, actionId, now = Date.now } = args
  const client = await pool.connect()
  try {
    await client.query('begin')
    // Locking the opportunity serialises `n` and the research lookup between two builds.
    const opp = (
      await client.query('select * from wo_opportunity where id = $1 and account_id = $2 for update', [
        opportunityId,
        accountId
      ])
    ).rows[0]
    if (!opp) {
      await client.query('rollback')
      return { error: 'NOT_FOUND' }
    }
    // The durable demo action chooses its revision id before work starts. A crash after this
    // transaction committed adopts that snapshot, rather than creating another brief.
    if (revisionId) {
      const held = (
        await client.query(
          'select * from wo_revision where id = $1 and account_id = $2 and opportunity_id = $3',
          [revisionId, accountId, opp.id]
        )
      ).rows[0]
      if (held) {
        await client.query('commit')
        return { revision: held }
      }
    }
    const view = args.frozenResearchRead ? null : opp.place_id ? await placeViewOf(client, opp) : null
    // The photographs carry the labels the brief step asked for before this transaction (`withPictureLabelling`).
    const read = withPictureLabels(
      args.frozenResearchRead ?? (await liveRead(client, opp, view)),
      args.pictureLabelling
    )
    // One object is hashed and briefed: the hash names exactly what the brief read.
    const research = await researchOf(client, read, opp, view)
    // A quality-v1 brief holds an editorial plan made for one template: never shared (`choiceFor`).
    const hash = args.choiceFor ? null : researchKey(domain, research)
    if (hash) {
      const same = (
        await client.query('select * from wo_revision where opportunity_id = $1 and research_hash = $2', [
          opp.id,
          hash
        ])
      ).rows[0]
      if (same) {
        if (actionId) await adoptRevision(client, actionId, accountId, same.id)
        await client.query('commit')
        return { revision: same, reused: true }
      }
    }
    const madeAt = args.researchSnapshotAt ?? new Date(now()).toISOString()
    // The place profile is frozen first: the brief states its facts with its frozen decisions (#1791), so the card,
    // the brief, the agent prompt and QA read one decision per fact.
    const placeProfile = freezePlaceProfileOrNull({ research, at: madeAt })
    const brief = makeSiteBrief(domain, read, { opportunity: research.opportunity, madeAt, placeProfile })
    const checked = domain.validateBrief(brief)
    if (!checked?.ok) {
      await client.query('rollback')
      return { error: 'BRIEF_INVALID', errors: checked?.errors ?? [] }
    }
    // Whether the brief is ready to build from, measured once beside its validation and kept with it (#50): the build
    // honours the verdict (`readinessRefusal`, `builds.js`).
    brief.readiness = domain.briefReadinessOf(brief)
    const id = revisionId ?? randomUUID()
    // Every brief freezes its evidence once, beside its place profile, and names both by hash (#1791 V2): any build
    // of it, an agent demo included, reads the same through `researchOfRevision`.
    const frozenResearch = frozenResearchOf(research)
    brief.agentDemoResearch = researchReference({
      research: frozenResearch,
      placeProfile,
      accountId,
      opportunityId: opp.id,
      revisionId: id,
      at: madeAt
    })
    const manifest = read.media.map(
      ({ id, origin, kind, category, sha256, mime, width, height, source, sourceUrl, postId, credit }) => ({
        id,
        ...(origin ? { origin } : {}),
        kind,
        category,
        sha256,
        mime,
        width,
        height,
        source,
        sourceUrl,
        postId: postId ?? null,
        credit: credit ?? null
      })
    )
    let frozen = {
      id,
      opportunity_id: opp.id,
      account_id: accountId,
      brief,
      brief_md: renderBriefWithReviews(
        domain,
        briefWithResearch({
          id,
          account_id: accountId,
          brief,
          research: frozenResearch,
          place_profile: placeProfile
        })
      ),
      asset_manifest: manifest,
      place_snapshot_id: read.placeSnapshotId ?? view?.snapshot.id ?? null,
      profile_effective: args.frozenResearchRead || view ? read.profile : null,
      place_profile: placeProfile,
      research: frozenResearch,
      raw_sources: read.rawSources ?? [],
      overlay: {
        name: opp.name,
        branch: opp.branch ?? null,
        candidate: structuredClone(opp.candidate ?? {}),
        privateSources: (view?.sources ?? read.sources)
          .filter((source) => !source.shared)
          .map(({ id, source, ref }) => ({ id, source, ref }))
      }
    }
    if (args.choiceFor) {
      // quality-v1: its editorial model reads the brief as its one build sees it, and keeps it so.
      frozen = withBuildChoice(frozen, args.choiceFor(frozen))
    }
    if (args.prepareOnly) {
      await client.query('commit')
      return { frozen }
    }
    const inserted = await insertFrozenRevision(client, { ...frozen, research_hash: hash })
    await client.query('commit')
    return { revision: inserted }
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

/** The hash of the research a brief made now would read: equal to the latest brief's when nothing changed. */
export async function currentResearchKey(db, opp, domain) {
  const view = opp.place_id ? await placeViewOf(db, opp) : null
  return researchKey(domain, await researchOf(db, await liveRead(db, opp, view), opp, view))
}

/** What a brief made now reads; a frozen read (`freezeDemoResearchInput`) keeps what it held when frozen. */
/**
 * What the brief's photographs show, asked BEFORE any transaction (F08): `args.pictureLabels` (`brief-picture-labels.js`,
 * injected) labels the photographs of the read the brief will be made from, at most its cap, from the shared cache first.
 * Its answer rides on the args as `pictureLabelling`. Without the step nothing changes; a step that throws is a failed
 * labelling, never a failed brief.
 */
async function withPictureLabelling(pool, args) {
  if (typeof args.pictureLabels !== 'function' || args.pictureLabelling) return args
  let read = args.frozenResearchRead ?? null
  let opp = null
  try {
    if (!read) {
      const client = await pool.connect()
      try {
        opp = (
          await client.query('select * from wo_opportunity where id = $1 and account_id = $2', [
            args.opportunityId,
            args.accountId
          ])
        ).rows[0]
        if (!opp) return args
        read = await liveRead(client, opp, opp.place_id ? await placeViewOf(client, opp) : null)
      } finally {
        client.release()
      }
    }
    const answer = await args.pictureLabels({
      media: read.media ?? [],
      brand: briefBrand(read.brand),
      accountId: args.accountId,
      trade: read.opportunity?.candidate?.trade ?? opp?.candidate?.trade ?? null,
      // The brief's offerings and people the model may link a photo to, and the name that marks the business's own
      // Google photos (#48).
      closedList: closedListOf(read.profile?.businessReading),
      businessName: read.profile?.name ?? read.opportunity?.name ?? opp?.name ?? null
    })
    return { ...args, pictureLabelling: answer }
  } catch {
    return {
      ...args,
      pictureLabelling: {
        labels: new Map(),
        note: { status: 'failed', asked: 0, labelled: 0, cached: 0, reason: 'vision_failed' }
      }
    }
  }
}

/** A read whose photographs carry the vision labels asked for, and the note of how that went. */
function withPictureLabels(read, labelling) {
  if (!labelling) return read
  const labels = labelling.labels ?? new Map()
  return {
    ...read,
    media: (read.media ?? []).map((m) =>
      labels.has(m.id) ? { ...m, labels: { ...m.labels, vision: labels.get(m.id) } } : m
    ),
    ...(labelling.note ? { assetLabelling: labelling.note } : {})
  }
}

async function liveRead(db, opp, view) {
  return withSocialStats(db, view ? fromPlace(view) : await fromOpportunity(db, opp))
}

/** One shape for a live read and an action's frozen one (`freezeDemoResearchInput`), so both hash alike. */
async function researchOf(db, read, opp, view) {
  const research = {
    ...read,
    placeSnapshotId: read.placeSnapshotId ?? view?.snapshot.id ?? null,
    opportunity: read.opportunity ?? opportunityOf(opp)
  }
  if (!research.demoRequest && opp.provider === 'external:website-opportunities') {
    const row = (
      await db.query(
        'select request from wo_public_demo where id::text=$1 and opportunity_id=$2 and account_id=$3',
        [opp.provider_id, opp.id, opp.account_id]
      )
    ).rows[0]
    if (!row) throw Object.assign(new Error('Public demo request missing'), { code: 'DEMO_REQUEST_MISSING' })
    research.demoRequest = row.request
  }
  return research
}

/** A picture as the research holds it: without the vision labels a brief step added (`researchKey`). */
function withoutVisionLabels(m) {
  if (!m?.labels || typeof m.labels !== 'object' || !('vision' in m.labels)) return m
  const { vision: _vision, ...labels } = m.labels
  return { ...m, labels: Object.keys(labels).length ? labels : null }
}

/** The research a brief reads, as one hash: the same read twice is the same brief. */
export function researchKey(domain, research) {
  // How the labelling went is not research, and neither are the vision labels the brief step put on the photographs
  // (`withPictureLabels`): a place's are kept in the shared analysis cache, never on its media rows, so the live read the
  // Details page hashes (`currentResearchKey`) has none, and a brief made a minute ago would read as stale. The other
  // labels a picture carries are the store's own and do count.
  const { demoRequest, assetLabelling: _labelling, ...read } = research
  return researchHash({
    schemaVersion: domain.BRIEF_SCHEMA_VERSION,
    profileSnapshotVersion: PROFILE_SNAPSHOT_VERSION,
    research: evidenceData({ ...read, media: (read.media ?? []).map(withoutVisionLabels) }),
    ...(demoRequest ? { demoRequestHash: researchHash(demoRequest) } : {})
  })
}

/** The action builds from the brief of the same research: its frozen revision id moves to that brief. */
async function adoptRevision(client, actionId, accountId, revisionId) {
  await client.query('update wo_demo_action set revision_id = $3 where id = $1 and account_id = $2', [
    actionId,
    accountId,
    revisionId
  ])
}

async function insertFrozenRevision(db, r) {
  return (
    await db.query(
      `insert into wo_revision (id,opportunity_id,account_id,n,brief,brief_md,asset_manifest,place_snapshot_id,profile_effective,research_hash,place_profile,research)
    values($1,$2,$3,(select coalesce(max(n),0)+1 from wo_revision where opportunity_id=$2),$4::jsonb,$5,$6::jsonb,$7,$8::jsonb,$9,$10::jsonb,$11::jsonb) returning *`,
      [
        r.id,
        r.opportunity_id,
        r.account_id,
        JSON.stringify(r.brief),
        r.brief_md,
        JSON.stringify(r.asset_manifest),
        r.place_snapshot_id,
        JSON.stringify(r.profile_effective),
        r.research_hash ?? null,
        r.place_profile ? JSON.stringify(r.place_profile) : null,
        r.research ? JSON.stringify(r.research) : null
      ]
    )
  ).rows[0]
}

/** Capture acceptance-time research in the action transaction; retries never read a newer source. */
export async function freezeDemoResearchInput(client, opportunityId, accountId, { demoRequest } = {}) {
  const opp = (
    await client.query('select * from wo_opportunity where id=$1 and account_id=$2', [
      opportunityId,
      accountId
    ])
  ).rows[0]
  if (!opp) throw Object.assign(new Error('Opportunity missing'), { code: 'NOT_FOUND' })
  const view = opp.place_id ? await placeViewOf(client, opp) : null
  const read = await liveRead(client, opp, view)
  return researchOf(
    client,
    { ...read, ...(demoRequest ? { demoRequest: structuredClone(demoRequest) } : {}) },
    opp,
    view
  )
}
