/** A demo logo can remain excluded only when a real brand asset or a proved text fallback replaces it. */
import { readFileSync } from 'node:fs'
import { templateProfileOf } from '../../lib/template-profiles.js'
const fail = (code) => Object.assign(new Error(code), { code })
export async function quickstartBrandFallback({ adapter, ctx, photos, checkpoint, verify = false }) {
  const brandSlots = (photos.excluded ?? []).filter((item) => ['brand', 'logo'].includes(item.reason))
  if (!brandSlots.length) return { state: 'not-required' }
  if (ctx.platform === 'emdash') {
    if (Object.values(ctx.brief?.brand?.logo ?? {}).some(Boolean))
      return { state: 'required', mode: 'native-brand-writer' }
    for (const slot of brandSlots) {
      const record = adapter.records?.find((record) => record.key === slot.record)
      const declared = record?.mediaBindings?.some(
        (binding) => binding.role === 'logo' && JSON.stringify(binding.path) === JSON.stringify(slot.path)
      )
      if (!declared || record.schema?.fields?.find((field) => field.slug === slot.path[0])?.required === true)
        throw fail('QUICKSTART_BRAND_FALLBACK_UNPROVEN')
      if (adapter.get(record.data, slot.path) && !verify) {
        const data = structuredClone(record.data)
        adapter.set(data, slot.path, null)
        await adapter.write(record, data, (receipt) => checkpoint?.(`brand-fallback:${record.key}`, receipt))
      }
      if (adapter.get(record.data, slot.path)) throw fail('QUICKSTART_BRAND_FALLBACK_READBACK_FAILED')
    }
    return { state: 'verified', mode: 'native-text-name' }
  }
  if (brandSlots.some((slot) => slot.writerTarget !== 'wordpress:site_logo'))
    throw fail('QUICKSTART_BRAND_WRITER_UNPROVEN')
  let release
  try {
    release = JSON.parse(readFileSync(`${ctx.contract.dir}/manifest.json`, 'utf8')).quickstart
  } catch {
    throw fail('QUICKSTART_BRAND_FALLBACK_UNPROVEN')
  }
  const profile = templateProfileOf(release.release, release.version)
  const hasLogo = Object.values(ctx.brief?.brand?.logo ?? {}).some(Boolean)
  if (hasLogo && ctx.platform === 'wordpress' && profile?.brandReady === true)
    return { state: 'required', mode: 'native-brand-writer' }
  if (ctx.platform !== 'wordpress' || profile?.nameFallback !== true)
    throw fail('QUICKSTART_BRAND_FALLBACK_UNPROVEN')
  const readLogo = async (key) => {
    const answer = await adapter.call('content.get', { kind: 'option', key })
    const value = answer?.item?.value
    if (answer?.ok === false || !['string', 'number'].includes(typeof value) || !/^\d+$/.test(String(value)))
      throw fail('QUICKSTART_BRAND_FALLBACK_READBACK_FAILED')
    return Number(value)
  }
  for (const key of ['site_logo', ...(profile.darkLogo ? ['tracy_logo_dark'] : [])]) {
    const before = await readLogo(key)
    if (Number(before) && !verify) {
      await checkpoint?.(`brand-fallback:${key}`, { state: 'sending', before, expected: 0 })
      await adapter.call('content.update', {
        kind: 'option',
        key,
        fields: { value: 0 },
        apply_id: `qs-brand-${ctx.runId}`
      })
    }
    const after = await readLogo(key)
    if (Number(after)) throw fail('QUICKSTART_BRAND_FALLBACK_READBACK_FAILED')
    if (!verify)
      await checkpoint?.(`brand-fallback:${key}`, {
        state: 'verified',
        before,
        after: after ?? 0,
        profileVersion: profile.version
      })
  }
  return { state: 'verified', mode: 'contract-text-name', profileVersion: profile.version }
}
