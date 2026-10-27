// The compose projects this layer may ever create, stop or remove. `tchqa` is the stand itself;
// the others are the finite pool of customer-site projects (a site's label is its compose project).
// Anything outside this list is somebody else's and is never touched (plan §4, owned_compose_projects).

export const STAND_PROJECT = 'tchqa'
export const OWNED_PROJECTS = Object.freeze([
  'tchqa',
  'tchqa-uw',
  'tchqa-uj',
  'tchqa-ue',
  'tchqa-w',
  'tchqa-w1',
  'tchqa-j',
  'tchqa-j1',
  'tchqa-e',
  'tchqa-e1',
  'tchqa-sw',
  'tchqa-sw1',
  'tchqa-sw2',
  'tchqa-sj',
  'tchqa-sj1',
  'tchqa-sj2',
  'tchqa-se',
  'tchqa-se1',
  'tchqa-se2',
  'tchqa-b',
  'tchqa-publish',
  'tchqa-import'
])
export const SITE_POOL = Object.freeze(OWNED_PROJECTS.filter((p) => p !== STAND_PROJECT))

/** The pool label for a legacy label suffix (`sw1` → `tchqa-sw1`); anything else is refused. */
export function poolLabel(suffix) {
  const label = `tchqa-${suffix}`
  if (!SITE_POOL.includes(label))
    throw new Error(`label suffix "${suffix}" is outside the owned pool (${label})`)
  return label
}
export const isOwnedProject = (name) => OWNED_PROJECTS.includes(name)
