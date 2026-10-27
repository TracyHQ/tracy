/** Frozen editorial image choices become bounded, pixel-checked derivatives, never new claims. */
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { qualityHash } from './quality-dossier.js'
import { centeredCrop, validateCrop, validatePlacement } from './quality-pictures.js'

const fail = (code) => Object.assign(new Error(code), { code })
const identity = /\b(?:whisk(?:y|ey)|champagne|sauvignon|merlot|chef|owner)\b/i
const hash = /^[a-f0-9]{64}$/
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')

/** IDs are field identities. Geometry must come from the installed renderer, not a field-name guess. */
export function qualityImageSlots({ plan, outline, manifest }) {
  const slots = []
  for (const record of plan.records ?? []) {
    if (!['planned', 'preserved-with-reason'].includes(record.state)) continue
    const declared = manifest.records.find((r) => r.key === record.key)
    for (const field of record.fields.filter((f) => f.action === 'image')) {
      const locked = outline.records
        .find((r) => r.key === record.key)
        ?.imageIntents?.find((i) => i.field === field.field)
      if (
        !locked ||
        locked.intent !== field.imageIntent ||
        !declared?.fields.some((f) => f.slug === field.field && ['image', 'media'].includes(f.type)) ||
        !(field.assetId === null || locked.candidateAssetIds.includes(field.assetId))
      )
        throw fail('QUALITY_PLACEMENT_OUTLINE_CHANGED')
      slots.push({
        id: `${record.key}:${field.field}`,
        recordKey: record.key,
        field: field.field,
        intent: field.imageIntent,
        assetId: field.assetId,
        candidateAssetIds:
          field.assetId === null
            ? []
            : [field.assetId, ...locked.candidateAssetIds.filter((id) => id !== field.assetId)],
        requiredTags: locked.requiredTags
      })
    }
  }
  return slots
}

function measuredSlot(slot, measured, rendererHash, referencePolicy, plan) {
  const actual = measured.slots?.find((s) => s.id === slot.id)
  if (slot.assetId === null && actual?.disposition === 'empty' && actual.frames?.length === 0)
    return { ...slot, disposition: 'empty', primary: false, frames: [] }
  if (actual?.disposition === 'expected-hidden-by-reference-policy') {
    const binding = actual.referenceBinding
    if (
      slot.id !== 'projects_page/projects@en:featured_image' ||
      !referencePolicy ||
      actual.referencePolicyHash !== referencePolicy.hash ||
      !referencePolicy.policies.some((p) => qualityHash(p) === qualityHash(binding)) ||
      binding?.recordKey !== slot.recordKey ||
      binding.field !== 'featured_project' ||
      binding.mode !== 'hidden-by-unpublished-target' ||
      binding.targetCollection !== 'projects' ||
      !plan.operations.some((o) => o.key === binding.targetKey && o.kind === 'unpublish') ||
      actual.rendererHash !== rendererHash ||
      actual.frames?.length !== 0
    )
      throw fail('QUALITY_SLOT_REFERENCE_POLICY_CHANGED')
    return { ...slot, ...actual, primary: false, frames: [] }
  }
  if (
    !actual ||
    !Array.isArray(actual.frames) ||
    !actual.frames.length ||
    typeof actual.primary !== 'boolean' ||
    actual.frames.some(
      (f) =>
        ![1440, 390].includes(f.viewport) ||
        !['cover', 'contain'].includes(f.objectFit) ||
        ![f.width, f.height, f.dpr].every((n) => Number.isFinite(n) && n > 0) ||
        f.width * f.dpr > 8192 ||
        f.height * f.dpr > 8192 ||
        f.dpr > 3
    ) ||
    ![1440, 390].every((width) => actual.frames.some((f) => f.viewport === width)) ||
    !hash.test(measured.contentHash ?? '') ||
    measured.rendererHash !== rendererHash
  )
    throw fail('QUALITY_SLOT_MEASUREMENT_MISSING')
  // The largest physical frame determines the stored derivative. Smaller frames are tested below.
  const frame = [...actual.frames].sort(
    (a, b) => b.width * b.height * b.dpr ** 2 - a.width * a.height * a.dpr ** 2
  )[0]
  return {
    ...slot,
    primary: actual.primary,
    frames: actual.frames,
    width: Math.ceil(frame.width * frame.dpr),
    height: Math.ceil(frame.height * frame.dpr)
  }
}

function visibleInFrames(asset, slot, crop, focalPoint) {
  const check = validateCrop({ asset, slot, crop, focalPoint })
  if (!check.ok) return check
  const derivative = { width: slot.width, height: slot.height }
  const focus = {
    x: (focalPoint.x * asset.width - crop.x) / crop.width,
    y: (focalPoint.y * asset.height - crop.y) / crop.height
  }
  for (const f of slot.frames) {
    if (f.objectFit === 'contain') continue
    const frame = { width: f.width * f.dpr, height: f.height * f.dpr }
    const visible = centeredCrop(derivative, frame)
    const actual = validateCrop({ asset: derivative, slot: frame, crop: visible, focalPoint: focus })
    if (!actual.ok) return actual
  }
  return { ok: true, errors: [] }
}

/** A failed crop/subject/identity uses an explicit empty field; no template image is retained. */
export function prepareQualityPlacement({
  run,
  plan,
  outline,
  manifest,
  assets,
  observations,
  measured,
  rendererHash,
  referencePolicy = null
}) {
  if (
    plan.validation?.state !== 'validated' ||
    outline.validation?.state !== 'validated' ||
    observations.validation?.state !== 'validated' ||
    assets.accountId !== run.account_id ||
    plan.observationHash !== observations.hash ||
    plan.manifestHash !== manifest.hash ||
    !hash.test(rendererHash ?? '') ||
    measured.rendererHash !== rendererHash ||
    new Set(measured.slots?.map((s) => s.id)).size !== measured.slots?.length
  )
    throw fail('QUALITY_PLACEMENT_INPUT')
  const slots = qualityImageSlots({ plan, outline, manifest }).map((s) =>
    measuredSlot(s, measured, rendererHash, referencePolicy, plan)
  )
  if (measured.slots.length !== slots.length || measured.slots.some((s) => !slots.some((t) => t.id === s.id)))
    throw fail('QUALITY_SLOT_MEASUREMENT_SCOPE')
  const placements = [],
    used = new Set()
  for (const slot of slots) {
    let chosen = null
    const exclusions = []
    for (const id of slot.disposition === 'expected-hidden-by-reference-policy'
      ? []
      : slot.candidateAssetIds) {
      const asset = assets.selected.find((a) => a.id === id)
      const seen = observations.pictures.find((p) => p.id === id)
      if (
        !asset ||
        !seen ||
        seen.contentHash !== asset.sha256 ||
        (asset.accountId && asset.accountId !== run.account_id)
      )
        throw fail('QUALITY_PLACEMENT_ASSET_SCOPE')
      const text = `${slot.intent} ${seen.description}`
      const reason = slot.requiredTags.some((tag) => !seen.tags.includes(tag))
        ? 'subject-mismatch'
        : asset.credit
          ? 'credit-requires-visible-attribution'
          : seen.quality !== 'good'
            ? `observed-${seen.quality}`
            : identity.test(text) &&
                (!asset.verifiedIdentity ||
                  !text.toLowerCase().includes(asset.verifiedIdentity.toLowerCase()))
              ? 'identity-unproven'
              : used.has(asset.sha256)
                ? 'primary-or-distinct-slot-duplicate'
                : null
      if (reason) {
        exclusions.push({ id, reason })
        continue
      }
      const crop = centeredCrop(asset, slot, seen.focalPoint)
      const checked = visibleInFrames(asset, slot, crop, seen.focalPoint)
      if (!checked.ok) {
        exclusions.push({ id, reason: checked.errors.join(',') })
        continue
      }
      const alt = seen.description.length <= 240 && !identity.test(seen.description) ? seen.description : ''
      if (!alt) {
        exclusions.push({ id, reason: 'observed-alt-not-safe' })
        continue
      }
      chosen = {
        slotId: slot.id,
        assetId: id,
        intent: slot.intent,
        requiredTags: slot.requiredTags,
        crop,
        focalPoint: seen.focalPoint,
        aspect: slot.width / slot.height,
        width: slot.width,
        height: slot.height,
        frames: slot.frames,
        alt,
        caption: '',
        credit: asset.credit ?? null,
        sourceHash: asset.sha256,
        reason: 'The observed subject and focal point fit every measured frame.',
        exclusions
      }
      used.add(asset.sha256)
      break
    }
    placements.push(
      chosen ?? {
        slotId: slot.id,
        assetId: null,
        intent: slot.intent,
        requiredTags: slot.requiredTags,
        alt: '',
        caption: '',
        reason:
          slot.disposition === 'expected-hidden-by-reference-policy'
            ? 'This image region is expected to be absent on the public page after its exact reference target is unpublished; no crop or upload was performed.'
            : slot.assetId === null
              ? 'The frozen editorial plan explicitly leaves this image empty.'
              : 'No locked candidate has a safe subject and crop for every measured frame.',
        exclusions
      }
    )
  }
  const checked = validatePlacement({
    planHash: plan.hash,
    accountId: run.account_id,
    slots,
    assets: assets.selected,
    observations,
    placements
  })
  if (!checked.ok) throw fail('QUALITY_PLACEMENT_INVALID')
  const artifact = {
    ...checked.artifact,
    policyVersion: run.input.policyVersion,
    inputHash: run.input_hash,
    rendererHash,
    measurementHash: qualityHash(measured),
    measurementContentHash: measured.contentHash,
    slots
  }
  delete artifact.hash
  return { ...artifact, hash: qualityHash(artifact) }
}

/** Extract only the validated rectangle. No fill/generative image call or shared-source mutation. */
export async function qualityDerivative({ bytes, asset, placement, accountId, siteKey, planHash }) {
  if (
    sha(bytes) !== asset.sha256 ||
    placement.sourceHash !== asset.sha256 ||
    placement.assetId !== asset.id ||
    (asset.accountId && asset.accountId !== accountId) ||
    !placement.slotId ||
    !siteKey ||
    !hash.test(planHash ?? '')
  )
    throw fail('QUALITY_DERIVATIVE_SCOPE')
  const checked = visibleInFrames(
    asset,
    { width: placement.width, height: placement.height, frames: placement.frames },
    placement.crop,
    placement.focalPoint
  )
  if (!checked.ok) throw fail('QUALITY_DERIVATIVE_CROP')
  if (
    !Object.values(placement.crop).every(Number.isInteger) ||
    ![placement.width, placement.height].every(Number.isInteger)
  )
    throw fail('QUALITY_DERIVATIVE_INTEGER_RECT')
  const dimensions = await sharp(bytes, { limitInputPixels: 100000000 }).metadata()
  if (dimensions.width !== asset.width || dimensions.height !== asset.height)
    throw fail('QUALITY_DERIVATIVE_DIMENSIONS')
  const output = await sharp(bytes, { limitInputPixels: 100000000 })
    .extract({
      left: placement.crop.x,
      top: placement.crop.y,
      width: placement.crop.width,
      height: placement.crop.height
    })
    .resize(placement.width, placement.height, { fit: 'fill' })
    .webp({ quality: 88 })
    .toBuffer()
  if (output.length > 8 * 1024 * 1024) throw fail('QUALITY_DERIVATIVE_TOO_LARGE')
  const digest = sha(output),
    binding = {
      accountId,
      siteKey,
      planHash,
      slotId: placement.slotId,
      sourceHash: asset.sha256,
      crop: placement.crop,
      width: placement.width,
      height: placement.height,
      sha256: digest
    }
  return {
    bytes: output,
    mime: 'image/webp',
    sha256: digest,
    filename: `wo-quality-${qualityHash(binding).slice(0, 40)}.webp`,
    binding,
    hash: qualityHash(binding)
  }
}
