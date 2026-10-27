/**
 * @tracy/wo-views — the Website Opportunities result views (contract: tasks/contract-wo-views.md).
 * Pure React over `PlaceRow` data: no fetch, no polling, no storage, no Maps SDK loading.
 */
export * from './types.ts'
export { createTranslate, en, fillTemplate } from './strings.ts'
export {
  filterByKind,
  firstSocial,
  ageInDays,
  daysSince,
  formatAgo,
  perMonthText,
  freshestPostAt,
  formatCompact,
  formatDistance,
  formatNumber,
  formatPoints,
  formatRating,
  hostOf,
  kindCounts,
  LOW_WEBSITE_SCORE,
  providerLabel,
  reasonLabel,
  reasonPoints,
  reasonShownAsWhy,
  reasonText,
  socialLine,
  socialView,
  sortRows,
  STALE_COPYRIGHT_YEARS,
  totalFollowers,
  websiteSummary
} from './model.ts'
export type { SocialLine, SocialView, WebsiteKind, WebsiteNote, WebsiteSummary } from './model.ts'
export { CLUSTER_MAX_ZOOM, clusterPins } from './map-clusters.ts'
export { tableColumns, typeColumnShown } from './table-columns.ts'
export type { ColumnChoice, ColumnSlot } from './table-columns.ts'
export { rowClickHandler } from './row-click.ts'
export type { RowClick } from './row-click.ts'
export type { PinGroup } from './map-clusters.ts'

export { ResultsHeader } from './results-header.tsx'
export type { ResultsHeaderProps } from './results-header.tsx'
export { KindTabs } from './kind-tabs.tsx'
export { ViewSwitch } from './view-switch.tsx'
export { ColumnsMenu } from './columns-menu.tsx'
export type { ColumnsMenuItem } from './columns-menu.tsx'
export { SortSelect } from './sort-select.tsx'
export { PlacesTable } from './places-table.tsx'
export type { PlacesTableProps } from './places-table.tsx'
export { PlacesGrid } from './places-grid.tsx'
export { PlaceCard } from './place-card.tsx'
export type { PlaceCardProps } from './place-card.tsx'
export { PlacesMap } from './places-map.tsx'
export type { LatLngLiteral, MapsApi, MapsMapLike, PlacesMapProps } from './places-map.tsx'

export { ScoreCell } from './cells/score.tsx'
export { WebsiteCell } from './cells/website.tsx'
export { GoogleCell } from './cells/google.tsx'
export { ReviewsCell } from './cells/reviews.tsx'
export { SocialCell, SocialStatLine } from './cells/social.tsx'
export { ContactCell } from './cells/contact.tsx'
export { DemoCell } from './cells/demo.tsx'
export type { DemoCellActions } from './cells/demo.tsx'
export { DEMO_SOON_MS, demoView } from './demo.ts'
export type { DemoFacts, DemoView } from './demo.ts'
export { StatusBadge } from './cells/status.tsx'
export { KIND_ICON, TypeCell, typeLabel } from './cells/type.tsx'
export { PlaceMeta, PlaceName } from './cells/place.tsx'
export { CmsTag, SocialMark, SOCIAL_NAME } from './brand-icons.tsx'
