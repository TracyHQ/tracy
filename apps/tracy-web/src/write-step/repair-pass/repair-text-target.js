// Only a complete measured DOM identity can merge readability observations or authorize a fresh target lookup.
export function measuredTargetKey(target) {
  if (
    target?.complete !== true ||
    typeof target.path !== 'string' ||
    !target.path ||
    target.path.length > 180 ||
    typeof target.text !== 'string' ||
    !target.text ||
    target.text.length > 300 ||
    typeof target.tag !== 'string' ||
    !/^[a-z][a-z0-9-]{0,63}$/.test(target.tag) ||
    !Array.isArray(target.marks) ||
    target.marks.length > 12 ||
    target.marks.some((m) => typeof m !== 'string' || !m || m.length > 240)
  )
    return null
  return JSON.stringify([target.path, target.tag, target.text, target.marks])
}
