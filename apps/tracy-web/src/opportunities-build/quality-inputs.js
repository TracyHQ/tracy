/** Read the existing release, Site questions and frozen place evidence; no second questionnaire. */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { emdashToolFor } from '../lib/emdash-tool.js'
import { readCapabilities } from '../lib/quickstart-capabilities.js'
import { briefFromAnswers } from '../lib/site-brief.js'
import { handMapOf } from '../lib/contract-slot-roles.js'
import { qualityManifest, qualityManifestModelView } from './quality-plan.js'
import { qualityHash } from './quality-dossier.js'
import { qualitySourcesOf } from './quality-sources.js'
const fail = (code) => Object.assign(new Error(code), { code })

export function createQualityInputReader({ pool, request, loadDomain, normalizeLanguages }) {
  if (typeof normalizeLanguages !== 'function') throw fail('QUALITY_LANGUAGE_RESOLVER_REQUIRED')
  return async (frozen, { cookie, origin }) => {
    if (frozen.cms !== 'emdash') throw fail('QUALITY_CMS_UNSUPPORTED')
    const release = (
      await pool.query('select * from quickstart_releases where tag=$1', [frozen.template.quickstart])
    ).rows[0]
    if (!release || release.setting?.version !== frozen.template.version)
      throw fail('QUALITY_RELEASE_CHANGED')
    const tool = emdashToolFor(release.tag)
    if (!tool) throw fail('QUALITY_TEMPLATE_UNSUPPORTED')
    const bytes = readFileSync(path.join(tool.seedDir, 'seed.json')),
      seed = JSON.parse(bytes)
    const seedSha256 = createHash('sha256').update(bytes).digest('hex')
    if (handMapOf('emdash', tool.templateId)?.checked?.seedSha256 !== seedSha256)
      throw fail('QUALITY_SEED_UNVERIFIED')
    const personalize = JSON.parse(readFileSync(path.join(tool.seedDir, 'personalize.json'), 'utf8'))
    const query = new URLSearchParams({
      platform: frozen.cms,
      design: frozen.template.design,
      quickstart: release.tag,
      lang: 'en'
    })
    const response = await request(`/api/sites/questions?${query}`, { headers: { cookie, origin } })
    if (!response.ok) throw fail('QUALITY_QUESTIONS_UNAVAILABLE')
    const served = await response.json()
    if (
      !Array.isArray(served.questions) ||
      !served.questions.some((q) => q.kind === 'languages' && (q.feeds ?? []).includes('site.languages'))
    )
      throw fail('QUALITY_LANGUAGE_QUESTION_MISSING')
    const domain = await loadDomain(),
      answered = domain.answersFromBrief(frozen.brief, served, {
        now: new Date(frozen.resolved_at).toISOString()
      })
    if (!answered.questionnaire) throw fail('QUALITY_QUESTIONNAIRE_MISSING')
    const typed = briefFromAnswers(served, answered.answers)
    const languages = await normalizeLanguages(typed ?? { about: '', goal: null, style: null })
    if (!Array.isArray(languages) || !languages.length) throw fail('QUALITY_LANGUAGE_POLICY_MISSING')
    const questions = {
      served,
      answers: answered.answers,
      questionnaire: answered.questionnaire,
      pagePlan: answered.pagePlan,
      languagePolicy: { locales: languages, source: 'Site questions and the existing brief language rules' }
    }
    const capabilities = readCapabilities({ release, standardDoc: served })
    const manifest = qualityManifest({
      release,
      capabilities,
      seed,
      seedSha256,
      archiveSha256: release.setting.install?.state?.sha256,
      personalize,
      pagePlan: answered.pagePlan,
      requestedLocales: languages
    })
    const sources = qualitySourcesOf(frozen)
    const semanticBase = {
      accountId: frozen.account_id,
      opportunityId: frozen.opportunity_id,
      snapshotId: frozen.place_snapshot_id,
      overlay: frozen.overlay,
      sources,
      assets: frozen.asset_manifest,
      release: { ...manifest.release },
      questions: {
        questionnaire: questions.questionnaire,
        answers: questions.answers,
        languagePolicy: questions.languagePolicy,
        pagePlan: questions.pagePlan
      }
    }
    // Policy/config fingerprints belong to attempts, not the user input's allowance.
    delete semanticBase.release.capabilityHash
    return { manifest, questions, sources, semanticBase }
  }
}

export function qualityDossierModelView(dossier, { spanIds = null } = {}) {
  return {
    inputHash: dossier.inputHash,
    business: dossier.business,
    at: dossier.at,
    conflicts: dossier.conflicts,
    missing: dossier.missing,
    facts: dossier.facts.map(
      ({ id, type, value, branch, status, reason, validFrom, validUntil, timeZone }) => ({
        id,
        type,
        value,
        branch,
        status,
        reason,
        validFrom,
        validUntil,
        timeZone
      })
    ),
    spans: spanIds ? dossier.spans.filter((s) => spanIds.includes(s.id)) : dossier.spans
  }
}

export function qualityOutlineManifest(manifest) {
  const view = qualityManifestModelView(manifest)
  return {
    ...view,
    records: view.records.map(({ sample, ...r }) => ({
      ...r,
      samplePreview: Object.fromEntries(
        Object.entries(sample).filter(
          ([key, value]) => key === 'title' || (typeof value === 'string' && value.startsWith('$ref:'))
        )
      )
    }))
  }
}

export async function qualitySemanticAcceptance(
  pool,
  { accountId, opportunityId, semanticBase, now = Date.now }
) {
  const current = (
    await pool.query(
      `select i.* from wo_quality_current_intent c join wo_quality_intent i on i.id=c.intent_id
    where c.account_id=$1 and c.opportunity_id=$2`,
      [accountId, opportunityId]
    )
  ).rows[0]
  const baseHash = qualityHash(semanticBase)
  const asOf =
    current?.semantic_input?.baseHash === baseHash
      ? current.semantic_input.asOf
      : new Date(now()).toISOString()
  return { semanticInput: { base: semanticBase, baseHash, asOf }, expectedIntentId: current?.id ?? null }
}
