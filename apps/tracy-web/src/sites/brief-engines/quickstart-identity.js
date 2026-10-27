/** CMS identity is required independently of template-specific logo handling. */
const fail = (code) => Object.assign(new Error(code), { code })
export async function quickstartIdentity({ adapter, ctx, name, checkpoint, write = false }) {
  if (typeof name !== 'string' || !name.trim()) throw fail('QUICKSTART_IDENTITY_REQUIRED')
  const read = () => readQuickstartIdentity(adapter, ctx)
  const before = await read()
  if (before !== name && write) {
    await checkpoint?.('identity', { state: 'sending', before, expected: name })
    const apply_id = `qs-identity-${ctx.runId}`
    if (ctx.platform === 'emdash') await adapter.api('POST', '/_emdash/api/settings', { title: name })
    else if (ctx.platform === 'wordpress')
      await adapter.call('content.update', {
        kind: 'option',
        key: 'blogname',
        fields: { value: name },
        apply_id
      })
    else await adapter.call('site.identity', { operation: 'set', fields: { sitename: name }, apply_id })
  }
  const actual = await read()
  if (actual !== name) throw fail('QUICKSTART_IDENTITY_READBACK_FAILED')
  const receipt = { state: 'verified', platform: ctx.platform, expected: name, actual }
  if (write) await checkpoint?.('identity', receipt)
  return receipt
}

export async function readQuickstartIdentity(adapter, ctx) {
  if (ctx.platform === 'emdash') return (await adapter.api('GET', '/_emdash/api/settings')).title
  if (ctx.platform === 'wordpress')
    return (await adapter.call('content.get', { kind: 'option', key: 'blogname' })).item?.value
  if (ctx.platform === 'joomla')
    return (await adapter.call('site.identity', { operation: 'read', fields: ['sitename'] })).fields?.sitename
  throw fail('QUICKSTART_IDENTITY_UNSUPPORTED')
}
