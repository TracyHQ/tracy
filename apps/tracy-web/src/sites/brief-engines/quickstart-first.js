/** WO-only three-stage engine. Historical builds and ordinary Add site retain their original engines. */
import { recoverQuickstartPictureBaseline, quickstartQaBaseline } from './quickstart-baseline.js'
import { createHash } from 'node:crypto'
import { qualityHash } from '../../lib/quality-hash.js'
import { editQuickstart } from './quickstart-editorial.js'
import { nativeStructure, openNativeQuickstart } from './quickstart-native.js'
import {
  nativePictureSlots,
  placeNativePictures,
  QUICKSTART_PLACEHOLDER_POLICY
} from './quickstart-pictures.js'
import { recordedDoor } from './shared.js'
import { quickstartReviews, reviewAttribution } from '../../lib/quickstart-reviews.js'
import { quickstartBrandFallback } from './quickstart-brand-fallback.js'
import { quickstartLinks } from './quickstart-links.js'
import { quickstartDemoResidue } from './quickstart-coverage.js'
import { quickstartIdentity, readQuickstartIdentity } from './quickstart-identity.js'
import {
  quickstartReviewFallback,
  quickstartReviewResumeProjection,
  reconcileQuickstartReviewPaths
} from './quickstart-review-fallback.js'
import { replaceQuickstartTerms } from './quickstart-terms.js'
import {
  quickstartTemplateTitleProjection,
  reconcileQuickstartTemplateTitles
} from './quickstart-template-metadata.js'
import { quickstartContactFacts } from './quickstart-facts.js'
import { quickstartFillInput, quickstartTextPins } from './quickstart-fill-copy.js'

export const QUICKSTART_WORKFLOW = 'quickstart-first/1'
/** A website page's words the editor reads: the model's input budget, not a cut of what is shown. */
const WEBSITE_PAGE_MAX = 4000
const hash = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex')
const fail = (code) => Object.assign(new Error(code), { code })

/** Recover older WP photo snapshots only from their exact verified native readback. */
export async function quickstartResumeRecords(records, held, reader) {
  const output = structuredClone(records)
  for (const record of output) {
    if (record.identity?.kind !== 'post' || !record.raw) continue
    const receipt = held[`quickstart:photo:${record.key}`]
    if (
      !receipt ||
      receipt.state !== 'verified' ||
      !receipt.after?.item ||
      qualityHash(receipt.after?.item) !== qualityHash(record.raw)
    )
      continue
    const expected = structuredClone(record.data)
    const featuredReceipt = held['quickstart:pictures']?.report?.receipts?.find(
      (item) => item.recordKey === record.key && item.featured === true
    )
    const featured =
      expected.featured_image_id ?? featuredReceipt?.uploaded?.attachment ?? featuredReceipt?.uploaded?.id
    for (const field of ['post_modified', 'post_modified_gmt']) {
      if (Object.hasOwn(record.raw, field)) expected[field] = record.raw[field]
      else delete expected[field]
    }
    if (featured !== undefined && !Object.hasOwn(record.raw, 'featured_image_id'))
      delete expected.featured_image_id
    if (qualityHash(expected) !== qualityHash(record.raw)) throw fail('QUICKSTART_RESUME_CONTENT_CHANGED')
    if (featured !== undefined) {
      const photo = held['quickstart:pictures']?.report?.receipts?.find(
        (item) =>
          item.recordKey === record.key &&
          Number(item.uploaded?.attachment ?? item.uploaded?.id) === Number(featured)
      )
      const upload = photo && held[`quickstart:upload:${photo.key}`]
      if (!photo || upload?.state !== 'verified' || upload.derivativeHash !== photo.derivativeHash)
        throw fail('QUICKSTART_RESUME_CONTENT_CHANGED')
      if (!reader) throw fail('QUICKSTART_FEATURED_READBACK_UNAVAILABLE')
      const current = JSON.parse(
        await reader.text(
          `/wp-json/wp/v2/${record.restBase ?? (record.data.post_type === 'page' ? 'pages' : 'posts')}/${record.identity.id}`
        )
      )
      if (Number(current.featured_media) !== Number(featured)) throw fail('QUICKSTART_RESUME_CONTENT_CHANGED')
    }
    record.data = structuredClone(record.raw)
  }
  return output
}

/**
 * The research an older brief embeds, read as stored: the default when the caller injects no resolver. The app injects
 * `researchOfRevision` (`opportunities-build/revision-research.js`), which also reads a new revision's referenced
 * research; a brief engine imports no other domain (`test/module-graph.test.mjs`).
 */
const embeddedResearch = (source) => source?.brief?.agentDemoSnapshot ?? null

/**
 * Source IDs point at immutable profile paths; source text never becomes instructions.
 * @param {any} source - the revision row the quickstart fills from
 * @param {{researchOf?: (source: any) => any}} [options] - `researchOf`: the research the revision was made from
 */
export function quickstartSources(source, { researchOf = embeddedResearch } = {}) {
  const business = source.brief.business ?? {},
    profile = source.profile_effective ?? {},
    sources = []
  function add(id, value) {
    if (value !== null && value !== undefined && value !== '')
      sources.push({
        id,
        type:
          {
            'business.name': 'name',
            'business.phone': 'phone',
            'business.email': 'email',
            'business.address': 'address',
            'business.website': 'website',
            'business.hours': 'opening-hours'
          }[id] ?? 'story',
        branch: business.branch ?? 'unspecified',
        text: typeof value === 'string' ? value : JSON.stringify(value)
      })
  }
  for (const [key, value] of Object.entries(business)) add(`business.${key}`, value)
  add('profile.bio', profile.bio)
  add('profile.amenities', profile.googlePlace?.amenities)
  for (const [n, review] of quickstartReviews(profile, source.brief).entries())
    add(`profile.reviews.${n}`, review)
  // 🔒 Everything research collected of the place itself is a source (product owner, 26/10/2026): its website's pages, its
  // own posts, Google's rating and its social figures, each with where it came from.
  const pages = (researchOf(source)?.sources ?? [])
    .map((s) => s?.data ?? s)
    .filter((s) => s?.source === 'website')
    .flatMap((s) => (Array.isArray(s.collected?.pages) ? s.collected.pages : []))
    .filter((p) => typeof p?.text === 'string' && p.text.trim())
  for (const [n, page] of pages.entries())
    add(
      `website.pages.${n}`,
      `${page.title ? `${page.title} — ` : ''}${page.url ?? ''}\n${page.text.slice(0, WEBSITE_PAGE_MAX)}`
    )
  for (const item of source.brief.content?.items ?? [])
    if (item?.authorship === 'page' && item.id && typeof item.body === 'string')
      add(`content.${item.id}`, [item.title, item.body].filter(Boolean).join('\n'))
  const place = source.brief.googlePlace ?? {}
  if (Number.isFinite(place.rating))
    sources.push({
      id: 'brief.googlePlace.rating',
      type: 'rating',
      branch: business.branch ?? 'unspecified',
      text: `Rating on Google: ${place.rating} / 5${Number.isInteger(place.userRatingCount) ? ` from ${place.userRatingCount} reviews` : ''}${place.googleMapsUri ? ` (${place.googleMapsUri})` : ''}`
    })
  for (const [n, f] of (source.socialFigures ?? []).entries())
    add(`social.${n}`, `${f.platform}: ${f.amount} ${f.label} (${f.url})${f.asOf ? `, as of ${f.asOf}` : ''}`)
  if (!sources.length || !business.name) throw fail('QUICKSTART_SOURCE_EMPTY')
  return sources
}

export function quickstartFactCopy(record, business, reviews = []) {
  const pins = {},
    hours = Array.isArray(business.hours) ? business.hours.join(' · ') : business.hours
  for (const binding of record.bindings) {
    const field = String(binding.fact ?? binding.role ?? binding.path.at(-1)).toLowerCase()
    const reviewRole =
      (binding.role ?? '').startsWith('review-') ||
      /review|testimonial/i.test(`${record.key} ${binding.path.join(' ')}`)
    if (reviewRole && reviews.length) {
      const n = binding.path.find((p) => Number.isInteger(p)) ?? 0
      const review = reviews[n % reviews.length]
      const text = typeof review.text === 'string' ? review.text : review.text?.text
      const author = review.authorAttribution?.displayName ?? review.author_name ?? review.author
      if (text && author) {
        if (binding.role === 'review-text' || /^(?:text|quote|content|body|description)$/.test(field)) {
          // The whole review, word for word: a quote cut to the template's length is no longer the guest's words.
          pins[binding.key] =
            `${text.trim()} — ${author}${reviewAttribution(review) ? ' · ' + reviewAttribution(review) : ''}`
          continue
        }
        if (binding.role === 'review-author' || /^(?:author|name|author_name)$/.test(field)) {
          pins[binding.key] = author
          continue
        }
      }
    }
    if (binding.role === 'name' || /^(?:brand_name|site_name|sitename|blogname)$/.test(field))
      pins[binding.key] = business.name
    else if (/^(?:phone|telephone|hotline|mobile)$/.test(field) && business.phone)
      pins[binding.key] = business.phone
    else if (field === 'email_to') pins[binding.key] = business.email ?? ''
    else if (field === 'email' && business.email) pins[binding.key] = business.email
    else if (['website', 'webpage'].includes(field) && business.website) pins[binding.key] = business.website
    else if (field === 'address' && business.address) pins[binding.key] = business.address
    else if (field === 'hours' && hours) pins[binding.key] = hours
  }
  for (const binding of record.bindings) {
    const value = pins[binding.key]
    if (typeof value === 'string' && binding.maxCharacters && value.length > binding.maxCharacters)
      throw fail('QUICKSTART_FACT_LAYOUT')
  }
  return pins
}

export function createQuickstartFirstEngine({
  legacy,
  woContent,
  applyFor,
  siteAccess,
  siteReader,
  realPictures,
  generateFor,
  assertActive = null,
  verifySite = null,
  openNative = openNativeQuickstart,
  placePictures = placeNativePictures,
  planPictures = placePictures === placeNativePictures ? nativePictureSlots : null,
  researchOf = embeddedResearch
}) {
  const sourceFor = (ctx) => woContent?.quickstartFor?.({ siteKey: ctx.siteKey, email: ctx.email })
  return {
    async normalize(ctx) {
      return (await sourceFor(ctx)) ? { workflow: QUICKSTART_WORKFLOW } : null
    },
    async prepare(ctx) {
      const source = await sourceFor(ctx)
      if (!source) return { legacy: true, prepared: await legacy.prepare(ctx) }
      return {
        workflow: QUICKSTART_WORKFLOW,
        source,
        sourceHash: hash(source),
        sources: quickstartSources(source, { researchOf })
      }
    },
    async preparePictures(ctx, prepared) {
      if (!prepared.legacy) return null
      return legacy.preparePictures?.(ctx, prepared.prepared) ?? null
    },
    async apply(ctx, prepared) {
      if (prepared.legacy) {
        // Only the runner accepts preparation results: a late dependency cannot restart drawing during writes.
        if (prepared.realPicturesPrepared) {
          prepared.prepared.realPicturesPrepared = true
          prepared.prepared.realPictureShape = prepared.realPictureShape
        }
        return legacy.apply(ctx, prepared.prepared)
      }
      let assertRoot = null
      const checkAllowed = async () => {
        ctx.signal?.throwIfAborted()
        await assertActive?.({ ctx, source: prepared.source })
        await assertRoot?.()
        const current = await sourceFor(ctx)
        // Progress receipts are mutable; the frozen source and generation are not.
        if (
          !current ||
          current.id !== prepared.source.id ||
          current.revision_id !== prepared.source.revision_id ||
          hash({ brief: current.brief, profile: current.profile_effective }) !==
            hash({ brief: prepared.source.brief, profile: prepared.source.profile_effective })
        )
          throw fail('QUICKSTART_SOURCE_CHANGED')
      }
      prepared.checkAllowed = checkAllowed
      await checkAllowed()
      const checkpoint = async (key, value) => {
        await checkAllowed()
        await woContent.recordWrite(prepared.source.id, `quickstart:${key}`, {
          workflow: QUICKSTART_WORKFLOW,
          ...value
        })
      }
      const held = prepared.source.content?.writes ?? {}
      if (held['quickstart:fill']?.state === 'filled') {
        if (
          Object.values(held).some((receipt) =>
            ['sending', 'draft-written', 'published'].includes(receipt?.state)
          )
        )
          throw fail('QUICKSTART_MUTATION_UNCERTAIN')
        const generate = await generateFor({ ctx, source: prepared.source, checkAllowed })
        assertRoot = generate.assertAllowed ?? null
        prepared.generate = generate
        prepared.checkpoint = checkpoint
        const current = await openNative({
          ctx,
          apply: recordedDoor(ctx, async (call) => {
            await checkAllowed()
            return applyFor(ctx.email, ctx.runId)(call)
          }),
          siteAccess,
          checkAllowed,
          reader: await siteReader(ctx.siteKey)
        })
        const filled = held['quickstart:fill']
        const matchesFilled = (records) =>
          filled.workflow === QUICKSTART_WORKFLOW &&
          Array.isArray(filled.initialStructure) &&
          quickstartCopyHash(records) === filled.copyHash &&
          qualityHash(nativeStructure(records)) === qualityHash(filled.initialStructure)
        if (!matchesFilled(current.records)) {
          const titles =
            ctx.platform === 'wordpress'
              ? quickstartTemplateTitleProjection(current.records, filled, held)
              : null
          const projection = quickstartReviewResumeProjection(
            titles ? { ...current, records: titles.records } : current,
            held
          )
          if (!matchesFilled(projection)) throw fail('QUICKSTART_RESUME_CONTENT_CHANGED')
          if (titles) await reconcileQuickstartTemplateTitles({ adapter: current, plan: titles, checkpoint })
          for (const record of current.records)
            record.bindings = projection.find((item) => item.key === record.key).bindings
          await reconcileQuickstartReviewPaths({ adapter: current, held, checkpoint })
        }
        await quickstartIdentity({ adapter: current, ctx, name: prepared.source.brief.business.name })
        const reviewFallback = await quickstartReviewFallback({
          adapter: current,
          ctx,
          business: prepared.source.brief.business,
          checkpoint,
          reviews: quickstartReviews(prepared.source.profile_effective, prepared.source.brief)
        })
        const result = {
          ...filled,
          reviewFallback,
          baseline: quickstartQaBaseline(
            filled.baseline ??
              held['quickstart:baseline']?.baseline ??
              (verifySite && prepared.source.brief.reviewMode !== 'manual'
                ? await recoverQuickstartPictureBaseline({
                    inventory: held['quickstart:inventory'],
                    ctx,
                    releaseVersion: prepared.source.template?.version,
                    reader: await siteReader(ctx.siteKey),
                    checkAllowed
                  })
                : null)
          ),
          copyHash: quickstartCopyHash(current.records),
          structureHash: hash(nativeStructure(current.records))
        }
        if (qualityHash(nativeStructure(current.records)) !== qualityHash(filled.initialStructure))
          throw fail('QUICKSTART_STRUCTURE_CHANGED')
        await checkpoint('fill', result)
        ctx.time('quickstartCopyFields', filled.wrote)
        return result
      }
      const readOnlyRetry = Boolean(
        held['quickstart:inventory']?.structure?.length &&
          Object.keys(held).every(
            (key) =>
              key === 'quickstart:inventory' ||
              (key === 'quickstart:preflight' && held[key].state === 'read') ||
              (key === 'quickstart:baseline' && held[key].state === 'read') ||
              (key === 'quickstart:picture-plan' &&
                held[key].state === 'planned' &&
                Array.isArray(held[key].plan?.unfilled)) ||
              (key.startsWith('quickstart:upload:') &&
                held[key].state === 'verified' &&
                held[key].derivativeHash &&
                held[key].uploaded?.ok) ||
              (key.startsWith('quickstart:photo:') &&
                held[key].state === 'rolled-back' &&
                held[key].proof?.version === 1 &&
                held[key].proof.liveHash === held[key].proof.beforeHash &&
                held[key].proof.draftRemoved === true &&
                held[key].revision)
          )
      )
      const photosOnlyRetry = Boolean(
        held['quickstart:pictures']?.state === 'verified' &&
          !held['quickstart:editorial-baseline'] &&
          Object.entries(held).every(
            ([key, value]) =>
              [
                'quickstart:inventory',
                'quickstart:preflight',
                'quickstart:picture-plan',
                'quickstart:pictures',
                'quickstart:baseline'
              ].includes(key) ||
              ((key.startsWith('quickstart:photo:') || key.startsWith('quickstart:upload:')) &&
                value.state === 'verified')
          )
      )
      const resume = held['quickstart:inventory'] ? held['quickstart:editorial-baseline'] : null
      if (
        held['quickstart:inventory'] &&
        !readOnlyRetry &&
        !photosOnlyRetry &&
        (!resume?.recordsHash ||
          !Array.isArray(resume.records) ||
          held['quickstart:pictures']?.state !== 'verified' ||
          Object.keys(held).some((key) => key.startsWith('quickstart:copy:') || key === 'quickstart:fill'))
      )
        throw fail('QUICKSTART_RESUME_REQUIRES_RECONCILIATION')
      if (
        Object.values(held).some(
          (r) =>
            r?.workflow === QUICKSTART_WORKFLOW && ['sending', 'draft-written', 'published'].includes(r.state)
        )
      )
        throw fail('QUICKSTART_MUTATION_UNCERTAIN')
      const generate = await generateFor({ ctx, source: prepared.source, checkAllowed })
      assertRoot = generate.assertAllowed ?? null
      prepared.generate = generate
      prepared.checkpoint = checkpoint
      const apply = recordedDoor(ctx, async (call) => {
        await checkAllowed()
        return applyFor(ctx.email, ctx.runId)(call)
      })
      const adapter = await openNative({
        ctx,
        apply,
        siteAccess,
        checkAllowed,
        reader: await siteReader(ctx.siteKey)
      })
      const unresolved = (adapter.coverage ?? []).filter((item) => item.state === 'required-unresolved')
      await checkpoint('preflight', {
        state: 'read',
        version: 'quickstart-contract-plan/1',
        scope: 'contract',
        ok: unresolved.length === 0,
        records: adapter.records.length,
        coverage: adapter.coverage ?? [],
        issues: unresolved
      })
      if (unresolved.length) throw fail('QUICKSTART_COVERAGE_INCOMPLETE')
      const demoIdentity = resume
        ? held['quickstart:inventory'].demoIdentity
        : await readQuickstartIdentity(adapter, ctx)
      const initialStructure = nativeStructure(adapter.records)
      if (
        readOnlyRetry &&
        (qualityHash(initialStructure) !== qualityHash(held['quickstart:inventory'].structure) ||
          demoIdentity !== held['quickstart:inventory'].demoIdentity ||
          (held['quickstart:inventory'].copyHash
            ? quickstartCopyHash(adapter.records) !== held['quickstart:inventory'].copyHash
            : adapter.seedCopyUnchanged !== true))
      )
        throw fail('QUICKSTART_RESUME_CONTENT_CHANGED')
      if (photosOnlyRetry) {
        const original = new Map(held['quickstart:inventory'].structure.map((record) => [record.key, record]))
        if (
          adapter.records.length !== original.size ||
          adapter.records.some((record) => !original.has(record.key))
        )
          throw fail('QUICKSTART_RESUME_CONTENT_CHANGED')
        const projection = adapter.records.map((record) => ({
          ...record,
          data: held[`quickstart:photo:${record.key}`]?.beforeData ?? record.data
        }))
        if (
          !held['quickstart:inventory'].copyHash ||
          quickstartCopyHash(projection) !== held['quickstart:inventory'].copyHash
        )
          throw fail('QUICKSTART_RESUME_CONTENT_CHANGED')
        for (const record of adapter.records) {
          const receipt = held[`quickstart:photo:${record.key}`]
          if (receipt) {
            const item = receipt.after?.item
            if (
              !item ||
              item.id !== record.identity.id ||
              receipt.after._rev !== record.revision ||
              qualityHash(item.liveData ?? item.data) !== qualityHash(record.data) ||
              qualityHash(item.references ?? {}) !== qualityHash(record.references ?? {})
            )
              throw fail('QUICKSTART_RESUME_CONTENT_CHANGED')
          } else if (qualityHash(nativeStructure([record])[0]) !== qualityHash(original.get(record.key)))
            throw fail('QUICKSTART_RESUME_CONTENT_CHANGED')
        }
        if (demoIdentity !== held['quickstart:inventory'].demoIdentity)
          throw fail('QUICKSTART_RESUME_CONTENT_CHANGED')
      }
      if (resume) {
        if (resume.recordsSemanticHash && resume.recordsSemanticHash !== qualityHash(resume.records))
          throw fail('QUICKSTART_RESUME_CONTENT_CHANGED')
        const expected =
          ctx.platform === 'wordpress'
            ? await quickstartResumeRecords(resume.records, held, await siteReader(ctx.siteKey))
            : resume.records
        if (qualityHash(adapter.records) !== qualityHash(expected))
          throw fail('QUICKSTART_RESUME_CONTENT_CHANGED')
        await checkpoint('resume-proof', {
          state: 'verified',
          version: 'native-readback-projection/1',
          originalRecordsHash: resume.recordsHash,
          currentRecordsHash: hash(adapter.records)
        })
      }
      if (!resume && !photosOnlyRetry)
        await checkpoint('inventory', {
          workflow: QUICKSTART_WORKFLOW,
          state: 'read',
          demoIdentity,
          copyHash: quickstartCopyHash(adapter.records),
          structure: initialStructure
        })
      let baseline = held['quickstart:baseline']?.baseline
        ? { baseline: held['quickstart:baseline'].baseline }
        : null
      if (!baseline && verifySite && prepared.source.brief.reviewMode !== 'manual') {
        baseline =
          !resume && !photosOnlyRetry
            ? await verifySite({ ctx, source: prepared.source, stage: 'baseline' })
            : {
                baseline: await recoverQuickstartPictureBaseline({
                  inventory: held['quickstart:inventory'],
                  ctx,
                  releaseVersion: prepared.source.template?.version,
                  reader: await siteReader(ctx.siteKey),
                  checkAllowed
                })
              }
        if (!baseline?.baseline?.pictures) throw fail('QUICKSTART_BASELINE_REQUIRED')
        await checkpoint('baseline', { state: 'read', baseline: baseline.baseline })
      }
      const reader = await siteReader(ctx.siteKey)
      let pictureInventory = null
      if (!resume && !photosOnlyRetry && planPictures) {
        pictureInventory = await planPictures({
          adapter,
          ctx,
          reader,
          frames: baseline?.baseline?.imageFrames ?? []
        })
        await checkpoint('preflight', {
          state: 'read',
          version: 'quickstart-contract-plan/1',
          scope: 'contract-and-pictures',
          ok: pictureInventory.unresolved.length === 0 && pictureInventory.groups.length > 0,
          records: adapter.records.length,
          coverage: adapter.coverage ?? [],
          issues: pictureInventory.unresolved,
          pictures: { groups: pictureInventory.groups.length, excluded: pictureInventory.excluded }
        })
        if (pictureInventory.unresolved.length) throw fail('QUICKSTART_PICTURE_COVERAGE_INCOMPLETE')
        if (!pictureInventory.groups.length) throw fail('QUICKSTART_PICTURE_COVERAGE_EMPTY')
      }
      const real =
        resume || photosOnlyRetry
          ? null
          : await realPictures.forSite({
              siteKey: ctx.siteKey,
              email: ctx.email,
              strict: true,
              signal: ctx.signal,
              visionOverride: generate.vision,
              visionNeeds: (baseline?.baseline?.imageFrames ?? []).map(({ width, height }) => ({
                width,
                height
              }))
            })
      if (!resume && !photosOnlyRetry && !real?.pictures?.length)
        throw fail('QUICKSTART_PHOTOGRAPHS_REQUIRED')
      // A v3 content map and a brief that links its photos: the fill plan decides the pictures and pins its words (#141).
      const fill = resume || photosOnlyRetry ? null : await quickstartFillInput({ ctx, woContent, real })
      const photos =
        resume || photosOnlyRetry
          ? held['quickstart:pictures'].report
          : await placePictures({
              fill,
              adapter,
              ctx,
              reader,
              real,
              inventory: pictureInventory,
              checkpoint,
              priorUploads: Object.entries(held)
                .filter(([key, value]) => key.startsWith('quickstart:upload:') && value.state === 'verified')
                .map(([, value]) => value),
              frames: baseline?.baseline?.imageFrames ?? []
            })
      const brandFallback = await quickstartBrandFallback({ adapter, ctx, photos, checkpoint })
      // Re-read copy from the image-updated object so prose cannot restore a demo src/srcset.
      for (const record of adapter.records) {
        record.copy = Object.fromEntries(
          record.bindings.map((binding) => [binding.key, adapter.get(record.data, binding.path)])
        )
      }
      for (const photo of photos.receipts ?? [])
        if (photo.caption)
          prepared.sources.push({
            id: `photo.${photo.sourceId}`,
            type: 'story',
            branch: prepared.source.brief.business.branch ?? 'unspecified',
            text: photo.caption
          })
      if (!resume)
        await checkpoint('editorial-baseline', {
          state: 'read',
          records: structuredClone(adapter.records),
          recordsHash: hash(adapter.records),
          recordsSemanticHash: qualityHash(adapter.records)
        })
      const linkReceipts = []
      const bindFacts = (record, data) => {
        const next = structuredClone(data)
        const paths = [
          ...record.bindings.map((binding) => binding.path),
          ...(record.linkBindings ?? []).filter((binding) => !binding.block).map((binding) => binding.path)
        ]
        if (record.identity?.kind === 'contact')
          for (const field of ['email_to', 'webpage']) if (Object.hasOwn(data, field)) paths.push([field])
        for (const path of new Map(paths.map((item) => [JSON.stringify(item), item])).values()) {
          const key = path.at(-1),
            value = adapter.get(next, path)
          const contact = quickstartContactFacts({ [key]: value }, prepared.source.brief.business)
          const bindings = (record.linkBindings ?? [])
            .filter((binding) => path.every((part, index) => binding.path[index] === part))
            .map((binding) => ({ ...binding, path: [key, ...binding.path.slice(path.length)] }))
          const links = quickstartLinks(contact, prepared.source.brief.business, {
            base: reader.base,
            navigationFallback: true,
            bindings,
            referenceUrls: quickstartReviews(prepared.source.profile_effective, prepared.source.brief).map(
              (review) => review.provenance.url
            )
          })
          if (links.unresolved.length) throw fail('QUICKSTART_LINK_COVERAGE_INCOMPLETE')
          linkReceipts.push(...links.receipts)
          let parent = next
          for (const part of path.slice(0, -1)) parent = parent[part]
          parent[key] = links.data[key]
        }
        return next
      }
      const beforeProse = nativeStructure(
        adapter.records.map((r) => ({
          ...r,
          data: bindFacts(r, r.data)
        }))
      )
      const facts = adapter.records.map((record) => ({
        key: record.key,
        pins: quickstartFactCopy(
          record,
          prepared.source.brief.business,
          quickstartReviews(prepared.source.profile_effective, prepared.source.brief)
        )
      }))
      // The fill plan's words: each card's name its photo was chosen by, a claim without its demo number, a signer's
      // name. The facts code pins win over them.
      const filled = fill ? quickstartTextPins({ adapter, input: fill }) : null
      const pins = new Map(facts.map((f) => [f.key, { ...filled?.pins.get(f.key), ...f.pins }]))
      const editable = adapter.records.map((record) => ({
        ...record,
        context: {
          ...record.context,
          pictures: (photos.receipts ?? [])
            .filter((p) => p.recordKey === record.key)
            .map((p) => p.caption)
            .filter(Boolean)
        },
        copy: Object.fromEntries(
          // Keep the original locked link targets here. bindFacts repurposes both the URL and label after editing.
          Object.entries(record.copy).filter(([key]) => !Object.hasOwn(pins.get(record.key), key))
        )
      }))
      const edited = await editQuickstart({
        records: editable,
        sources: prepared.sources,
        generate,
        locale: ctx.normalized.languages?.[0] ?? 'en',
        signal: ctx.signal,
        recordBatch: (batch) =>
          checkpoint(`batch:${batch.inputHash}`, {
            workflow: QUICKSTART_WORKFLOW,
            state: 'validated',
            ...batch
          })
      })
      if (quickstartDemoResidue(edited.records, demoIdentity, prepared.source.brief.business.name).length)
        throw fail('QUICKSTART_DEMO_IDENTITY_REMAINS')
      for (const editedRecord of edited.records) {
        const record = adapter.records.find((r) => r.key === editedRecord.key)
        const copy = { ...editedRecord.copy, ...pins.get(record.key) }
        const data = bindFacts(record, adapter.patchData(record, copy))
        await adapter.write(record, data, (receipt) =>
          checkpoint(`copy:${record.key}`, { workflow: QUICKSTART_WORKFLOW, ...receipt })
        )
      }
      const reviewFallback = await quickstartReviewFallback({
        adapter,
        ctx,
        business: prepared.source.brief.business,
        checkpoint,
        reviews: quickstartReviews(prepared.source.profile_effective, prepared.source.brief)
      })
      const identity = await quickstartIdentity({
        adapter,
        ctx,
        name: prepared.source.brief.business.name,
        checkpoint,
        write: true
      })
      if (hash(nativeStructure(adapter.records)) !== hash(beforeProse))
        throw fail('QUICKSTART_STRUCTURE_CHANGED')
      const result = {
        workflow: QUICKSTART_WORKFLOW,
        state: 'filled',
        wrote: edited.changes.length,
        records: adapter.records.length,
        copyHash: quickstartCopyHash(adapter.records),
        structureHash: hash(beforeProse),
        photos,
        initialStructure: beforeProse,
        sourceHash: hash(prepared.sources),
        identity,
        demoIdentity,
        brandFallback,
        reviewFallback,
        links: { state: 'verified', receipts: linkReceipts },
        coverage: adapter.coverage ?? [],
        reviewProvenance: quickstartReviews(prepared.source.profile_effective, prepared.source.brief).map(
          (review) => ({
            author: review.author,
            ...review.provenance
          })
        ),
        needsVisualCheck: true,
        baseline: baseline?.baseline ?? null,
        ...(filled ? { textSubstitutes: filled.substitutes } : {})
      }
      await checkpoint('fill', result)
      ctx.time('quickstartCopyFields', result.wrote)
      return result
    },
    async beforeBrand(_ctx, prepared) {
      if (!prepared.legacy) {
        if (!prepared.checkAllowed) throw fail('QUICKSTART_OWNER_MISSING')
        await prepared.checkAllowed()
      }
    },
    async verify(ctx, prepared, report) {
      if (prepared.legacy || report?.workflow !== QUICKSTART_WORKFLOW) return
      const checkAllowed = prepared.checkAllowed
      if (!checkAllowed) throw fail('QUICKSTART_OWNER_MISSING')
      await checkAllowed()
      const current = await openNative({
        ctx,
        apply: recordedDoor(ctx, async (call) => {
          await checkAllowed()
          return applyFor(ctx.email, ctx.runId)(call)
        }),
        siteAccess,
        checkAllowed,
        reader: await siteReader(ctx.siteKey)
      })
      if (
        quickstartDemoResidue(current.records, report.demoIdentity, prepared.source.brief.business.name)
          .length
      )
        throw fail('QUICKSTART_DEMO_IDENTITY_REMAINS')
      if (quickstartCopyHash(current.records) !== report.copyHash)
        throw fail('QUICKSTART_COPY_CHANGED_AFTER_WRITE')
      const finalReader = await siteReader(ctx.siteKey)
      for (const receipt of report.photos.receipts ?? []) {
        if (!receipt.readbackPath) throw fail('QUICKSTART_PICTURE_READBACK_REQUIRED')
        const bytes = await finalReader.bytes(receipt.readbackPath)
        if (!bytes || createHash('sha256').update(bytes).digest('hex') !== receipt.derivativeHash)
          throw fail('QUICKSTART_PICTURE_READBACK')
      }
      if (hash(nativeStructure(current.records)) !== report.structureHash)
        throw fail('QUICKSTART_STRUCTURE_CHANGED_AFTER_BRAND')
      if ((current.coverage ?? []).some((item) => item.state === 'required-unresolved'))
        throw fail('QUICKSTART_COVERAGE_INCOMPLETE')
      const identity = await quickstartIdentity({
        adapter: current,
        ctx,
        name: prepared.source.brief.business.name
      })
      // Gaps hold verified placeholders (read back above); they send the build to review, not to failure.
      if (
        (report.photos.gaps ?? []).some(
          (gap) =>
            !report.photos.receipts?.some(
              (receipt) => receipt.key === gap.groupId && receipt.kind !== 'photo'
            )
        )
      )
        throw fail('QUICKSTART_PICTURE_COVERAGE_INCOMPLETE')
      await quickstartBrandFallback({ adapter: current, ctx, photos: report.photos, verify: true })
      const terms = await replaceQuickstartTerms({
        adapter: current,
        ctx,
        sources: prepared.sources,
        generate: prepared.generate,
        held: prepared.source.content?.writes ?? {},
        checkpoint: prepared.checkpoint,
        checkAllowed
      })
      // 🔒 A MACHINE CHECK SAYS WHAT WAS MEASURED (24/10/2026). Structure, coverage and pictures were proved above
      // (a failure throws); links and template residue only the site's own QA measures, so they are its results:
      // `cta-real` for the links, `no-demo-words` and `no-demo-pictures` for the residue. A manual review runs no
      // QA, so they read 'not-measured' there — never a `true` nothing checked.
      const measuredChecks = (checks) => {
        const passed = (id) => (checks ?? []).some((c) => c.id === id && c.pass === true && !c.skipped)
        return {
          terms,
          version: 1,
          identity,
          structure: true,
          coverage: true,
          pictures: checks ? passed('no-demo-pictures') : true,
          links: checks ? passed('cta-real') : 'not-measured',
          demoResidue: checks ? passed('no-demo-words') && passed('no-demo-pictures') : 'not-measured'
        }
      }
      if (prepared.source.brief.reviewMode === 'manual') {
        const machineChecks = measuredChecks(null)
        await woContent.recordWrite(prepared.source.id, 'quickstart:qa', {
          workflow: QUICKSTART_WORKFLOW,
          state: 'needs-review',
          reviewMode: 'manual',
          humanAccepted: false,
          machineChecks
        })
        return
      }
      if (!verifySite) throw fail('QUICKSTART_VISUAL_CHECK_UNAVAILABLE')
      const qa = await verifySite({ ctx, source: prepared.source, report, baseline: report.baseline })
      await checkAllowed()
      const machineChecks = measuredChecks(Array.isArray(qa.checks) ? qa.checks : [])
      await woContent.recordWrite(prepared.source.id, 'quickstart:qa', {
        workflow: QUICKSTART_WORKFLOW,
        ...qa,
        // A placeholder sends the build to review even if the report forgot to say so.
        ...(qa.state === 'passed' && (report.photos.requiresReview || report.photos.gaps?.length)
          ? {
              state: 'needs-review',
              humanAccepted: false,
              reviewReason: report.photos.gaps?.length
                ? (report.photos.placeholderPolicy ?? QUICKSTART_PLACEHOLDER_POLICY)
                : report.photos.variantPolicy
            }
          : {}),
        machineChecks
      })
      if (qa.state !== 'passed') throw fail('QUICKSTART_QA_INCOMPLETE')
    },
    dispose: (prepared) => (prepared?.legacy ? legacy.dispose?.(prepared.prepared) : undefined)
  }
}

export function quickstartCopyHash(records) {
  const get = (data, path) => path.reduce((value, key) => value?.[key], data)
  return qualityHash(
    records
      .map((record) => ({
        key: record.key,
        copy: Object.fromEntries(
          record.bindings.map((binding) => [binding.key, get(record.data, binding.path)])
        )
      }))
      .sort((a, b) => a.key.localeCompare(b.key))
  )
}
