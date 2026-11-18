// The planner decides structure, never owner-photo selection. Keep the frozen full brief for every other step.
// Bump this version whenever the model-visible brief changes; a paid conversation must not resume on new inputs.
export const PLANNER_BRIEF_VIEW = 'site-planner-brief/1'

export function plannerBriefView(brief, version) {
  if (version !== PLANNER_BRIEF_VIEW)
    throw Object.assign(new Error('The planner brief view changed since the run started.'), {
      code: 'SITE_PLANNER_BRIEF_VIEW_CHANGED'
    })
  const { assets: _ownerPhotos, ...planning } = brief
  return planning
}
