export { Cowork, type CoworkProps } from './Cowork'
export {
  siteChanges,
  siteHistory,
  siteRecord,
  SiteStateError,
  type SiteChangeFile,
  type SiteChanges,
  type SiteHistory,
  type SiteRelease
} from './siteApi'

// The team and the three site tabs live behind their own entries (`@tracy/core/team`,
// `@tracy/core/site-tabs`) so a plugin bundle never drags this root — and `@tracy/i18n`'s
// catalogues with it — into a browser. See `team/index.ts`.
