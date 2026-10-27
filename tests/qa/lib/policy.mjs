// Target policy: which declared cases may run on which target.

export function targetPolicy(manifest, target) {
  if (!manifest.targets.includes(target)) {
    return `target-policy: case does not declare target "${target}"`
  }
  if (target === 'prod') {
    const e = manifest.effects
    const forbidden = []
    if (e.writes.length > 0) forbidden.push('writes')
    if (e.mail) forbidden.push('mail')
    if (e.model) forbidden.push('model')
    if (e.containers) forbidden.push('containers')
    if (forbidden.length > 0)
      return `target-policy: prod runs read-only cases only (declares ${forbidden.join(', ')})`
  }
  return null
}
