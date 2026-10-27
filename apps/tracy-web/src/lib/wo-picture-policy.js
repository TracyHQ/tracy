/** Picture choices are revision data: an operator change applies to the next revision, never a retry. */
const bounded = (value, fallback, min, max) =>
  Number.isFinite(value) ? Math.max(min, Math.min(max, Math.trunc(value))) : fallback

export function picturePolicy(settings = {}) {
  settings ??= {}
  return {
    version: 1,
    visionEnabled: typeof settings.visionEnabled === 'boolean' ? settings.visionEnabled : true,
    maxVisionPictures: bounded(settings.maxVisionPictures, 80, 10, 200),
    handoffMaxPictures: bounded(settings.handoffMaxPictures, 24, 6, 60),
    missingHeroMode: ['outpaint-and-scene', 'outpaint', 'real-only'].includes(settings.missingHeroMode)
      ? settings.missingHeroMode
      : 'outpaint-and-scene'
  }
}
