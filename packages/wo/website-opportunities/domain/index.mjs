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
export { scriptSignature, SIGNATURE_FONT_FAMILY } from './neutral-signature.mjs'
export { numberlessSentence } from './numberless-sentence.mjs'
export { forbiddenFillers, forbiddenFillerText, validateSlotFillManifest } from './slot-fill-manifest.mjs'
export { contractCopyPins, handMapApplies, slotFillPins, slotRolesFor } from './contract-copy-pins.mjs'
export { planSlotFill, provisionalAssessment, SLOT_FILL_VERSION } from './slot-fill.mjs'
export {
  ARTICLE_ROLES,
  BASE_FILES,
  BLOCK_TYPES,
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
  isBlockType,
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
  AI_QUICKSTART_FIELD_TYPES,
  BLOCK_STORE_FILE,
  MAPPING_FILE,
  PAGE_RECIPES_FILE,
  checkAiQuickstartContract,
  formatProblem as formatAiQuickstartProblem
} from './ai-quickstart-contract.mjs'
export { BUSINESS_FACTS, SEO_FIELDS, SHARE_IMAGE_FRAME } from './ai-quickstart-mapping.mjs'
export { LIBRARY_SCHEMA, checkLibraryDeclaration } from './ai-quickstart-library.mjs'
export {
  TRACY_LIBRARY,
  TRACY_LIBRARY_DECLARATION,
  TRACY_REVIEWS_BLOCK_ID,
  libraryEntryProblem,
  libraryItemProblem,
  tracyLibraryBlock
} from './library.mjs'
export { REVIEWS_MAX, reviewsToShow } from './library-reviews-content.mjs'
export { checkedListingUrl, googleListingUrl } from './library-reviews-listing.mjs'
export { reviewerName, reviewerNameProblem } from './library-reviews-names.mjs'
export { ReviewsBlockError, renderReviewsBlock, reviewsBlockCss } from './library-reviews-render.mjs'
export { colourLiterals } from './library-style-check.mjs'
export {
  NEEDS_PROFILE_PROMPT_FILE,
  NEEDS_PROFILE_SCHEMA,
  NeedsProfileError,
  buildNeedsProfile,
  needsProfileOf,
  needsProfileRequest
} from './needs-profile.mjs'
export { TRUST_ORDER } from './needs-profile-merge.mjs'
export { ASKED_TOPICS } from './needs-profile-questions.mjs'
export { IMPORTANT_CONFLICTS } from './needs-profile-conflict-questions.mjs'
export {
  BUILD_SCENARIO_SCHEMA,
  checkBuildDocument,
  checkBuildScenario,
  formatProblem as formatBuildContractProblem
} from './build-contract.mjs'
export { BUILD_PLAN_SCHEMA, EDITABLE_FIELDS, MAX_GENERATED_FRAMES } from './build-contract-plan.mjs'
export { PLAN_EDIT_SCHEMA, applyPlanEdit, checkPlanEdit } from './build-contract-plan-edit.mjs'
export { ANSWER_SCHEMA, QUESTION_SCHEMA, QUESTION_TOPICS, checkAnswer } from './build-contract-questions.mjs'
export { OUTCOME_SCHEMA, PROGRESS_SCHEMA, STEP_KINDS, STEP_STATES } from './build-contract-run.mjs'
export {
  PLAN_COMPOSER_PROMPT_FILE,
  PLAN_COMPOSE_ATTEMPTS,
  PlanComposerError,
  blockMapOf,
  buildPlanStep,
  composePlan,
  composerContextOf,
  planComposerRequest
} from './plan-composer.mjs'
export { gatePlan } from './plan-gate.mjs'
export { gateEditedPlan } from './plan-edit-gate.mjs'
export { ANSWER_SOURCE, settleAnswers } from './plan-answers.mjs'
export { dataAccountingOf } from './plan-accounting.mjs'
export { conflictAssumptionsOf } from './plan-conflicts.mjs'
export { placeExtraData } from './plan-placement.mjs'
export { placeExtraFacts } from './plan-placement-facts.mjs'
export { lookOf, picturesOf } from './plan-look-pictures.mjs'
export {
  BRAND_FILE_VERSION,
  BRAND_LOOK_SCHEMA,
  BrandStepError,
  brandLookOf,
  isBrandLook,
  lookOfBrandRecord
} from './brand-before-site.mjs'
export {
  ACCENT_FROM_LOGO,
  ACCENT_LOGO_WITHOUT_HUE,
  ACCENT_NO_LOGO,
  ACCENT_UNSETTLED,
  NO_HUE_ACCENT,
  accentOfBrandFile
} from './brand-look-accent.mjs'
export { BRAND_STEP_ATTEMPTS, BRAND_STEP_PROMPT, runBrandBeforeSite } from './brand-before-site-run.mjs'
export { lookProblemsOf } from './brand-look-problems.mjs'
export {
  CANDIDATES_MAX,
  ICON_STOP_WORDS,
  contentCatalog,
  iconCandidates,
  subjectOf,
  subjectWordsOf
} from './icon-candidates.mjs'
export { ICON_PAINT_ROLES, ICON_SOURCES, ICON_WEIGHTS, iconCountsOf, iconProblemsOf } from './icon-check.mjs'
export { wordsOfScope, writtenByScope } from './icon-copy.mjs'
export { themesOf } from './icon-entry.mjs'
export { ICON_THEMES, iconScopesOfPlan, isIconField, isNetworkIcon } from './icon-fields.mjs'
export { linkFieldOf, listLinksOf, rowLinkOf, rowLinksOf } from './icon-row-links.mjs'
export {
  ICON_KEYWORDS_MAX,
  ICON_KEYWORDS_PROMPT_FILE,
  englishKeywordsOf,
  iconKeywordsRequest,
  isEnglish
} from './icon-keywords.mjs'
export {
  ICON_RANKING_MAX,
  ICON_RANKING_PROMPT_FILE,
  IconSelectionError,
  iconRankingRequest,
  rankIconCandidates
} from './icon-ranking.mjs'
export { ALL_HIDDEN_MIN_ITEMS, DEFAULT_ICON_LOOK, selectIcons } from './icon-selection.mjs'
export {
  AMBIGUOUS_SHORTENERS,
  SOCIAL_ICON_NAMES,
  SOCIAL_NETWORKS,
  networkOf,
  socialReasonOf
} from './icon-social.mjs'
export { planDataOf } from './plan-data.mjs'
export { rowDataOf, rowValuesOf } from './plan-row-data.mjs'
export {
  CHILD_LIST_REASONS,
  PAGE_ROW,
  firstRowOf,
  fitsList,
  isPageKeyed,
  listKindsOf,
  placeOrder,
  planRows,
  roomOf,
  storedRowsOf
} from './plan-rows.mjs'
export {
  NO_LIST_REASON,
  fitCandidates,
  rowMisfitOf,
  takesData,
  withoutUnshownFacts
} from './plan-rows-fit.mjs'
export { limitOf, placeLimitsOf, placesOfField } from './field-place-limits.mjs'
export { listsBelowMinLeftOut, rowListProblems, rowsLeftOut } from './plan-rows-check.mjs'
export {
  answerOverLimitProblems,
  clearOverLimitValues,
  DATA_OVER_LIMIT_REASON,
  dropOverLimitData,
  overLimitLeftOut
} from './plan-data-limits.mjs'
export { replanRows } from './plan-edit-rows.mjs'
export { daysAndTimesOf, partKindOf, rowPartsOf, splitMixedPart, unplacedCodeOf } from './schedule-parts.mjs'
export { networkNameOf, rowNetworkNameOf, TEXT_OF_NETWORK } from './row-network-text.mjs'
export { cappedLength, kindLimitsOf, storeBlocksOf } from './answer-field-limits.mjs'
export { declaredRowFieldsOf, rowFieldAccountOf } from './plan-row-coverage.mjs'
export { foreignValuesOf, isDataLike, rowContextOf, rowFieldsOf } from './page-writer-rows.mjs'
export {
  MAX_ROW_DEPTH,
  MAX_ROW_PARTS,
  groundRows,
  isRowRole,
  mergeRows,
  partsOf
} from './needs-profile-rows.mjs'
export { MAX_LIST_DEPTH, blockListsProblems, rowDataProblems } from './build-contract-plan-rows.mjs'
export {
  PEOPLE_FRAME_KINDS,
  VIDEO_KIND,
  framesOfPlan,
  isVideoFrame,
  ownPicturesOf
} from './picture-frames.mjs'
export { fitsFrame, unfitReason } from './picture-fit.mjs'
export {
  itemSocialUrlsOf,
  placesOfBlock,
  repeatedNames,
  SOCIAL_URL_KINDS,
  shownItemsOf,
  socialLinksOf
} from './picture-block-places.mjs'
export { declaredMediaOf, mediaAccountOf, mediaKindOf } from './picture-declared.mjs'
export { frameOfField } from './picture-frame-size.mjs'
export {
  GENERATED_PICTURE_ROLES,
  LOGO_FRAME_ROLES,
  NEVER_GENERATED_ROLES,
  generationOf,
  pictureRolesOfVocabulary
} from './picture-roles.mjs'
export {
  PICTURE_LABELLING_PROMPT_FILE,
  PicturePolicyError,
  isLabelled,
  labelOwnPictures,
  labellingRequest
} from './picture-labelling.mjs'
export { FRAME_SOURCES, pictureProblemsOf, videoFits } from './picture-policy-check.mjs'
export { approvedCountOf, assignPictures } from './picture-policy.mjs'
export {
  blocksOf,
  differenceOf,
  picturesStep,
  placeBuildPictures,
  selectBuildIcons
} from './picture-step.mjs'
export {
  ENGINE_STEPS,
  FRAME_STEP,
  PRE_APPROVAL_STEPS,
  buildEngineSteps,
  contractRunOf,
  contractStepOf,
  contractStepsOf,
  outcomeOf,
  progressEventOf
} from './build-run-events.mjs'
export { FIELD_KINDS, HOURS_LIMIT, NO_KIND, researchOf } from './needs-research.mjs'
export {
  PAGE_WRITER_PROMPT_FILE,
  PAGE_WRITE_ATTEMPTS,
  PageWriterError,
  readWriterReply,
  writePages
} from './page-writer.mjs'
export {
  blockDescriptionsOf,
  pageFieldsOf,
  pageSlotsOf,
  pageWriterUser,
  slotKey
} from './page-writer-request.mjs'
export { WRITER_FIELD_TYPES, charCount, checkPageCopy, fieldValueProblems } from './page-copy-check.mjs'
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
export { savedProfileOf, stampDecisions, factsWithPaths, ownerChoicesOf } from './saved-profile.mjs'
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
  BRIEF_RULES_VERSION,
  BRIEF_REQUIRED
} from './brief.mjs'
export { BUSINESS_READING_VERSION } from './business-reading.mjs'
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
export { FILL_PLAN_VERSION, FILL_REASONS, cardNamesOf, planFill, shownWidthOf } from './fill-plan.mjs'
export { textSubstitutesOf } from './fill-text.mjs'
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
export {
  NO_RERUN as WRITE_ORDER_NO_RERUN,
  WRITE_ORDER_SCHEMA,
  WriteOrderError,
  answerLimitOf,
  buildWriteOrder
} from './write-order.mjs'
export { checkWriteOrder } from './write-order-check.mjs'
export { MemorySiteError, memorySite } from './write-order-memory-site.mjs'

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
