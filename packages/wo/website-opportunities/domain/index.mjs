export { CMS, DEFAULT_CMS, parseCms, resolveCms } from './cms.mjs'
export { assertPublicUrl, isBlockedAddress, UrlBlockedError } from './url-guard.mjs'
export { fetchLimited, FetchLimitedError, USER_AGENT } from './fetch-limited.mjs'
export {
  geocode,
  searchRestaurants,
  candidateFromOsm,
  normaliseSocial,
  socialNetworkOf
} from './discovery-osm.mjs'
export { crawlWebsite, extractPage } from './website-crawler.mjs'
export { LISTING_HOSTS, MAX_LINKS, judgeLinks, linkKind, splitPasted } from './link-kinds.mjs'
export {
  isGoogleHost,
  matchGooglePlace,
  namesMatch,
  parseGoogleLink,
  resolveShortLink
} from './google-link.mjs'
export { listingFromHtml, nameHintOfListingUrl, readListingPage } from './listing-page.mjs'
export { chosenNameOf, decideBusinessName, handleOfSocialUrl, nameKey } from './business-name.mjs'
export {
  decideHours,
  hoursPickOf,
  isOpenAllWeek,
  readableHours,
  usuallyOpenAllWeek
} from './hours-check.mjs'
export {
  decideGoogleRating,
  FEW_GOOGLE_REVIEWS,
  googleRatingOf,
  ratingPickOf,
  ratingShownForms
} from './google-rating.mjs'
export { readMenus, menuItemsFromHtml, menuItemsFromPdfPages } from './menu-reader.mjs'
export { renderAgentPrompt, HANDOFF_FOLDER, socialFiguresOf } from './agent-prompt.mjs'
export { answersFromBrief, contactFacts } from './site-answers.mjs'
export { pageRole } from './page-plan.mjs'
export { pinnedCopy } from './pinned-copy.mjs'
export { neutralFor, neutralWords } from './neutral-copy.mjs'
export { forbiddenFillers, forbiddenFillerText, validateSlotFillManifest } from './slot-fill-manifest.mjs'
export { contractCopyPins, handMapApplies, slotFillPins, slotRolesFor } from './contract-copy-pins.mjs'
export { planSlotFill, provisionalAssessment, SLOT_FILL_VERSION } from './slot-fill.mjs'
export {
  ARTICLE_ROLES,
  BASE_FILES,
  CONTENT_MAP_ROLE_VOCABULARY_VERSIONS,
  DEFAULT_NEUTRAL_BY_ROLE,
  EDITORIAL_ROLES,
  EDITORIAL_ROLES_V3,
  EMDASH_BASE_FILES,
  FACT_ROLES,
  FACT_ROLES_ADDED_IN_V3,
  FACT_ROLES_V3,
  GROUP_KINDS,
  GROUP_KINDS_V3,
  KEEP_DECISION_BY_ROLE,
  KEEP_DECISIONS,
  LOGO_ROLES,
  PLACE_CONTENT_ROLES,
  PLACE_CONTENT_ROLES_V3,
  ROLE_VOCABULARY_V3,
  ROLE_VOCABULARY_VERSION,
  ROLE_VOCABULARY_VERSIONS,
  SLOT_ROLES_SCHEMA_VERSION,
  baseHashOf,
  isEditorialRole,
  isFactRole,
  isGroupKind,
  isRole,
  keepDecisionOfRole,
  modeOfRole,
  sha256,
  validateSlotRoles
} from './place-content-roles.mjs'
export {
  customizeOfRole,
  keepDecisionOf,
  keepDerivationProblems,
  pictureReplaceOfRole,
  roleDecidesKeep
} from './content-map-keep-decision.mjs'
export { collectionOfGroupId, repeatableListProblems } from './content-map-repeatable-lists.mjs'
export {
  checkContentMapRoles,
  contentMapDeclaresRoles,
  slotRolesOfContentMap
} from './content-map-roles.mjs'
export {
  ICON_PX,
  PICTURE_KINDS,
  SLOT_FIT_TOLERANCE,
  SLOT_FIT_VERSION,
  checkContentMapFit,
  contentMapDeclaresFit,
  pictureKindOf,
  pictureReplaceOf,
  slotFitOf,
  slotFitOfContentMap
} from './content-map-fit.mjs'
export {
  neutralItemName,
  SECTION_ACTIONS,
  sectionAction,
  placeholderFor
} from './section-fills.mjs'
export { approxLocationOf, isLocatableAddress, GEOIP_PROVIDERS } from './geoip.mjs'
export {
  discoverRestaurants,
  searchRestaurantsGmaps,
  candidateFromGmaps,
  GMAPS_ACTOR
} from './discovery-gmaps.mjs'
export {
  TRADES,
  defaultOfferingKind,
  statedTradeOf,
  tradeOfCategory,
  tradeOfPlace,
  tradeOfSchemaType
} from './trades.mjs'
export { ALLOWED_INFERRED_KINDS, assessProfile, factDecisions } from './fact-assessment.mjs'
export { CONFIDENCE_LEVELS, confidenceOf } from './fact-confidence.mjs'
export { SUB_TRADE_WORDS, TRADE_WORDS, businessWords, otherKindWords, tradeWords } from './trade-words.mjs'
export { SUB_TRADES, decideSubTrade, subTradeChoicesOf, subTradeOfGoogleTypes } from './sub-trades.mjs'
export { validatePlaceProfile } from './place-profile.mjs'
export { placeProfileFromResearch } from './place-profile-from-research.mjs'
export { placeProfileFromBrief } from './place-profile-from-brief.mjs'
export { placeProfileFromDemoRequest } from './place-profile-from-demo-request.mjs'
export { placeProfileForHost } from './place-profile-for-host.mjs'
export {
  SEARCH_TRADES,
  TRADE_SEARCH,
  ANY_GOOGLE_TYPES,
  searchTradeOf,
  tradeOfOsmTags
} from './trade-search.mjs'
export {
  searchRestaurantsGplaces,
  searchPlacesText,
  searchAreaGplaces,
  searchNamedPlaces,
  suggestPlaces,
  SUGGEST_PRIMARY_TYPES,
  GPLACES_AUTOCOMPLETE_URL,
  candidateFromGplaces,
  textCandidateFromGplaces,
  GPLACES_FIELDS,
  GPLACES_TEXT_FIELDS,
  GPLACES_URL,
  GPLACES_TEXT_URL
} from './discovery-gplaces.mjs'
export {
  KINDS,
  CUISINES,
  SEARCH_PRIMARY_TYPES,
  kindOfPrimaryType,
  cuisineOfPrimaryType,
  primaryTypesOfKinds,
  primaryTypeOfCuisine
} from './place-kinds.mjs'
export { markChains, CHAIN_BRANDS } from './chains.mjs'
export { scoreOpportunity } from './opportunity-score.mjs'
export { withSiteSocials } from './site-socials.mjs'
export {
  buildDemoRequest,
  DEMO_REQUEST_CAPABILITIES,
  DEMO_REQUEST_LIMITS,
  DEMO_REQUEST_SCHEMA,
  DEMO_REQUEST_V2_LIMITS,
  DEMO_REQUEST_V2_SCHEMA,
  validateDemoRequest
} from './demo-request.mjs'
export { siteLabelFor, nextSiteLabel } from './site-label.mjs'
export { detectStack, STACK_PACK_NAMES } from './site-stack.mjs'
export {
  GPLACES_DETAIL_FIELDS,
  PLACE_LOCATION_FIELDS,
  PLACE_VERIFICATION_FIELDS,
  fetchPlaceDetails,
  fetchPlaceLocation,
  fetchPlaceVerification,
  fetchPlaceWebsite,
  placeFactsFromDetails,
  placePhotoUrl,
  placePhotoUri,
  fetchPlacePhoto
} from './gplaces-details.mjs'
export {
  crawlWebsiteWithFallback,
  crawlWithBrowser,
  needsBrowser,
  renderedPagesResult,
  BROWSER_ACTOR,
  THIN_TEXT_CHARS
} from './website-browser.mjs'
export { readWithJina, readWithFirecrawl } from './website-readers.mjs'
export { connectorsFor, SOURCES } from './connectors.mjs'
export {
  apifyCollect,
  apifyRunUrl,
  apifyStartUrl,
  APIFY_ACTORS,
  DEFAULT_MAX_CHARGE_USD,
  RECENT_DAYS,
  redactToken
} from './apify.mjs'
export { FACEBOOK_APIFY, facebookApifyInput, facebookApifyStats } from './social-stats/facebook-apify.mjs'
export { collectYoutubePublic, channelVideosUrl } from './youtube-public.mjs'
export { upgradeFacebookPhotos, facebookPictureSize, facebookPhotoPageUrl } from './facebook-photos.mjs'
export { sniffMime, sha256Hex, classifyMedia } from './media.mjs'
export { dedupeCandidates, normaliseName, distanceM } from './dedupe.mjs'
export { brandFromSocial } from './brand-social.mjs'
export {
  buildBrief,
  briefForBuild,
  validateBrief,
  renderBriefMarkdown,
  BRIEF_SCHEMA_VERSION,
  BRIEF_SCHEMA_VERSIONS,
  BRIEF_REQUIRED
} from './brief.mjs'
export { factOnSite, withheldMissing } from './brief-facts.mjs'
export {
  matchDishPhotos,
  confirmDishPhoto,
  isDishVision,
  withAcceptedDishPhotos,
  DISH_PHOTOS_MATCHER
} from './dish-photos.mjs'
export { slotMap, protectedPicture, SLOT_MAP_VERSION } from './pictures/slot-map.mjs'
export {
  labelPicture,
  nearCopies,
  hammingDistance,
  looksGraphic,
  LABELS_VERSION
} from './pictures/picture-labels.mjs'
export { heroCandidates, withoutNearCopies, NEAR_COPY_BITS } from './pictures/brief-media.mjs'
export {
  ASSET_CONTENT,
  ASSET_CONTENT_KINDS,
  ASSET_ORIENTATIONS,
  ASSET_QUALITIES,
  assetLabelsOf,
  orientationOf,
  resolutionGradeOf
} from './pictures/asset-labels.mjs'
export { UPLOADER_ROLES, assetOriginOf, creditRequiredOf } from './pictures/asset-origin.mjs'
export {
  GENERAL,
  PHOTO_ROLES,
  assetRelationsOf,
  closedListDigest,
  closedListOf,
  heldVisionLinks,
  ownershipOf
} from './pictures/picture-links.mjs'
export {
  BRIEF_ITEM_ROUTES,
  itemKindsOfBrief,
  ownerQuestionsOf,
  routeTableErrors,
  routesOfBrief
} from './brief-item-routes.mjs'
export {
  BRIEF_READINESS_VERSION,
  READINESS_THRESHOLDS,
  briefReadinessOf,
  heldKindsOf
} from './brief-readiness.mjs'
export {
  planPlacement,
  drawPlan,
  outputSize,
  cropBox,
  shapeFit,
  fitCrop,
  ROLES,
  PLANNER_VERSION,
  MAX_SCALE,
  DRAW_MAX
} from './pictures/placement.mjs'
export { FILL_PLAN_VERSION, FILL_REASONS, planFill } from './fill-plan.mjs'
export { placementOfFill } from './fill-placement.mjs'
export { collectSocialProfile, PROFILE_TIERS } from './social-profile.mjs'
export {
  fetchSocialStats,
  statsTiersOf,
  SOCIAL_CHAINS,
  SOCIAL_PROVIDERS,
  ADVANCE_CODES as SOCIAL_STATS_ADVANCE_CODES
} from './social-stats/chain.mjs'
export {
  SocialStatsError,
  SOCIAL_STATS_ERROR_CODES,
  RAPIDAPI_HOSTS,
  postsCadence
} from './social-stats/providers.mjs'
export { parseSocialUrl } from './social-stats/handles.mjs'
export {
  CAPABILITY_GROUPS,
  CAPABILITY_GROUP_IDS,
  PROVIDER_CREDENTIALS,
  ATTEMPT_STATUSES,
  FALLBACK_REASONS,
  capabilityGroup,
  defaultOrderOf,
  resolveOrder,
  parseProviderOrder,
  providerAnswer,
  runInOrder
} from './capabilities.mjs'
export {
  findSocialPages,
  matchSocialPage,
  searchPlaceOf,
  scrapeCreatorsGoogleSearch,
  SEARCH_NETWORKS
} from './social-search.mjs'
export { jinaSearch, firecrawlSearch, serpapiGoogleSearch } from './web-search.mjs'
export { findMenuLinks, menuLinksFromResults, menuSearchQuery } from './menu-search.mjs'

// Hosts check these before running a job; bump `version` on any breaking change to the API above.
export const CONTRACT = Object.freeze({
  name: 'tracy-website-opportunities',
  version: 1,
  capabilities: Object.freeze([
    'cms.resolve',
    'url.guard',
    'fetch.limited',
    'discovery.osm',
    'discovery.google-maps',
    'discovery.google-places',
    'discovery.google-places.text',
    'discovery.google-places.autocomplete',
    'collect.google-places.details',
    'collect.google-places.photos',
    'location.approx-ip',
    'dedupe.candidates',
    'collect.website',
    'collect.menu-items',
    'collect.website.browser-fallback',
    'collect.facebook',
    'collect.instagram',
    'collect.tiktok',
    'collect.youtube',
    'media.sniff',
    'media.classify',
    'brand.social',
    'brief.v1',
    'brief.markdown',
    'handoff.prompt',
    'site.answers',
    'pictures.plan.v1',
    'pictures.draw.v1',
    'score.opportunity.v1',
    'site.stack',
    'site.label',
    'social-stats',
    'provider-order'
  ])
})
