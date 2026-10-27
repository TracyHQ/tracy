/** A field claim must name its predicate, branch and value; numbers occurring elsewhere prove nothing. */
export function checkClaimRefs(claims, dossier) {
  const errors = []
  for (const claim of claims ?? []) {
    const fact = dossier.facts.find((f) => f.id === claim.id)
    if (!fact || fact.status !== 'supported') errors.push('CLAIM_UNSUPPORTED')
    else if (claim.type !== fact.type || claim.branch !== fact.branch || claim.value !== fact.value)
      errors.push('CLAIM_PREDICATE_MISMATCH')
  }
  return { ok: !errors.length, errors }
}
