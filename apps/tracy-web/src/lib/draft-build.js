/**
 * What the create door and the run frame read of an approved build of the build chat (#610, `build_draft.build`,
 * migration 219), kept in lib/ so `sites/` and `app.js` read it without importing the build draft domain
 * (module-graph rule). The build draft domain writes it (`build-draft/build-store.js`).
 */

import { planDataOf } from 'website-opportunities/domain/plan-data.mjs'
import { namesHeldInAnyForm, withheldOfBrief } from 'website-opportunities/domain/plan-withheld.mjs'

const samePlan = (a, b) => a?.id === b?.id && a?.revision === b?.revision

const list = (value) => (Array.isArray(value) ? value : [])
const text = (value) => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null)

/** What the owner keeps off the site, from the build's frozen profile, else its research record. */
const withheldOf = (snapshot) =>
  snapshot?.profile?.withheld ??
  snapshot?.research?.withheld ??
  withheldOfBrief(snapshot?.research?.brief).withheld ??
  null

/**
 * The texts no shown name may name: the held people and the held business name. The profile lists the name as hidden now
 * (`withheld.names`, which leaves it when the owner chose to show it); a research record with no profile yet gives it
 * as research read it.
 */
function heldTextsOfSnapshot(snapshot, withheld) {
  const named = list(withheld?.names)
  const researched =
    withheld?.name === true && !Array.isArray(withheld.names)
      ? [
          ...list(snapshot?.research?.profile?.facts?.['business.name']).map((f) => f?.value),
          snapshot?.research?.brief?.business?.name
        ]
      : []
  const people = list(withheld?.people)
  return [...people, ...named, ...researched].map(text).filter(Boolean)
}

/**
 * The names and people the owner keeps off the site, from a build's frozen snapshot (the server's own withheld set),
 * each once: what the hand off tells the site agent never to write (#611). Empty when nothing is held.
 * @returns {string[]}
 */
export function heldTextsOfBuild(snapshot) {
  const withheld = withheldOf(snapshot)
  return withheld ? [...new Set(heldTextsOfSnapshot(snapshot, withheld))] : []
}

/**
 * The held texts of a build that `texts` already name, in any form (#611): what the hand off must tell the site agent
 * to keep off the site. A held text the texts never name is left out, so the hand off never carries a held name it
 * did not already hold, and the agent cannot write what it was never told.
 */
export function heldTextsSaidIn(snapshot, texts) {
  return heldTextsOfBuild(snapshot).filter((held) => namesHeldInAnyForm(texts, [held]))
}

/**
 * The name the site is allowed to show, from a build's frozen snapshot `{plan, profile, research}` (#610): the plan's
 * `business.name` fact unless it names something the owner keeps off the site, then the site name answer
 * (`withheld.siteName`, the owner's own choice), else null (the caller goes by its neutral fallback). Never the held
 * business name.
 */
export function shownBuildNameOf(snapshot) {
  const withheld = withheldOf(snapshot)
  const fact = text(list(snapshot?.plan?.facts).find((f) => f?.kind === 'business.name')?.value)
  if (!withheld) return fact
  const held = heldTextsOfSnapshot(snapshot, withheld)
  const answer = text(withheld.siteName)
  // The held name as the plan card shows it: a held name with no site name answer is never the plan's name.
  if (withheld.name === true && !answer) return null
  if (fact && !namesHeldInAnyForm([fact], held)) return fact
  return answer
}

/**
 * The approved plan as a reader outside the plan gate may see it (the hand off to the site chat): what the owner keeps
 * off the site is gone (the ids `planDataOf` holds back, as the step chain's `planWithoutWithheld` drops them), and
 * the `business.name` fact carries the name the site may show (`shownBuildNameOf`) or is gone.
 */
export function shownBuildPlanOf(snapshot) {
  const plan = snapshot?.plan
  if (!plan || typeof plan !== 'object') return plan ?? null
  const held = planDataOf(snapshot.profile).withheld ?? new Set()
  const shown = (id) => !held.has(typeof id === 'string' ? id : id?.id)
  const name = shownBuildNameOf(snapshot)
  const facts = list(plan.facts)
    .filter(shown)
    .flatMap((f) => {
      if (f?.kind !== 'business.name') return [f]
      return name ? [{ ...f, value: name }] : []
    })
  return {
    ...plan,
    pages: list(plan.pages).map((page) => ({
      ...page,
      blocks: list(page?.blocks).map((block) =>
        Array.isArray(block?.data) ? { ...block, data: block.data.filter(shown) } : block
      )
    })),
    ...(Array.isArray(plan.items) ? { items: plan.items.filter(shown) } : {}),
    ...(Array.isArray(plan.facts) ? { facts } : {})
  }
}

/** The business name the approved plan may show, for the site's name; null without one. */
export async function draftBuildName(pool, draftId) {
  const { rows } = await pool.query(
    `select build -> 'snapshot' as snapshot from build_draft where id::text = $1`,
    [String(draftId)]
  )
  return shownBuildNameOf(rows[0]?.snapshot)
}

/**
 * Whether the draft `draftId` is the caller's and holds an approved build of exactly `plan`, asked under that build's
 * own id: the create door's check before it starts a step chain run from a draft (`sites/route.js`). 🔒 ONE SITE PER
 * DRAFT: the create door is idempotent on `buildId`, so only the build's own id may name the draft; a fresh id would
 * make a second site from the same approval.
 */
export async function draftBuildApproved(pool, { draftId, accountId, plan, buildId }) {
  const { rows } = await pool.query(
    `select build -> 'plan' as plan, build ->> 'id' as id from build_draft
      where id::text = $1 and account_id = $2 and build is not null`,
    [String(draftId), accountId]
  )
  return (
    rows.length > 0 &&
    samePlan(rows[0].plan, plan) &&
    typeof buildId === 'string' &&
    rows[0].id?.toLowerCase() === buildId.toLowerCase()
  )
}
