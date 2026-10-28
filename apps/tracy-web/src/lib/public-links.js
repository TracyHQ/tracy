/**
 * Tracy's public addresses that tracy-web's own pages link to: the landing site, its assets, and
 * Tracy's community and social pages. In `lib/` so any domain's page can link them (`identity/`'s
 * sign-in page as well as `public/`'s template pages) without importing another domain.
 */

/**
 * The landing site's origin. Every deployment's Templates pages link to the one landing site (dev and
 * laptops have none of their own), so this default is the only value today.
 */
export const DEFAULT_LANDING_ORIGIN = 'https://tracy.ai'

/** Pages on the landing site and elsewhere that the header and footer link to. */
export const LINKS = Object.freeze({
  home: `${DEFAULT_LANDING_ORIGIN}/`,
  github: 'https://github.com/TracyHQ/tracy',
  youtube: 'https://www.youtube.com/@tracydotai',
  x: 'https://x.com/tracydotai',
  logo: `${DEFAULT_LANDING_ORIGIN}/assets/logo.png`,
  download: `${DEFAULT_LANDING_ORIGIN}/download/`,
  discord: 'https://discord.gg/BM9TMRcEBb',
  // The landing site's own backdrop, so the section reads as part of tracy.ai (approved mockup).
  backdropLight: `${DEFAULT_LANDING_ORIGIN}/assets/bg.jpg`,
  backdropDark: `${DEFAULT_LANDING_ORIGIN}/assets/bg-dark.jpg`
})
