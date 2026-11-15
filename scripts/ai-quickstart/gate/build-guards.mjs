// The stop codes of the build team's write step as write safety classes them (ticket #586, review round 2), each
// decided by a person and listed here by hand. A test reads every code their write step throws or reports, in the
// domain files (`packages/wo/website-opportunities/domain/draft-write-*.mjs`, `write-order*.mjs`) and in the app's step
// chain files (`apps/tracy-web/src/step-chain-draft-*.js`), and fails when one is on neither list, or when a listed
// code is gone: a new code is never classed by default. Pure.

/** The build's own named guards: a value refused before any site saw it, recorded only (`refused_by_build`). */
export const BUILD_GUARD_CODES = Object.freeze([
  'accent_module_unbuilt',
  'accent_template_colour_unknown',
  'accent_written_as_unknown',
  'answer_over_limit',
  'block_not_approved',
  'category_title_unknown',
  'container_copies_per_page',
  'control_first_item_empty',
  'created_frame_not_declared',
  'empty_text_node',
  'held_block_without_container',
  'held_text_in_value',
  'home_repeated',
  'icon_not_in_list',
  'initials_drawer_missing',
  'kept_when_unknown',
  'kit_missing',
  'library_html_stale',
  'library_html_unsafe',
  'location_unresolved',
  'markup_forbidden',
  'markup_runs_code',
  'menu_item_to_under_page',
  'menu_items_link_unknown',
  'menu_items_over_max',
  'omit_row_gap',
  'op_unknown',
  'order_invalid',
  'page_link_unresolved',
  'page_parent_not_in_plan',
  'page_style_unresolved',
  'page_type_not_declared',
  'page_unbuilt',
  'pair_incomplete',
  'picture_not_stored',
  'picture_web_address_only',
  'picture_without_alt',
  'pictures_missing',
  'place_not_written',
  'plan_missing',
  'profile_missing',
  'record_kind_unsupported',
  'record_name_empty',
  'ref_unresolved',
  'slot_missing',
  'straight_quote_in_open_slot',
  'text_over_limit',
  'under_page_position_not_detail',
  'unknown_block',
  'value_not_escaped',
  'writer_missing'
])

/** The gate's own guard: the page writer's copy check sent a probed field back. */
export const GATE_GUARD_CODES = Object.freeze(['page_copy_check'])

/** Codes a site gives: a door that failed after its retries, a read back the site answered otherwise. */
export const SITE_CODES = Object.freeze({
  redo_failed: 'a door call failed after its retries: the door named in its cause answered',
  read_back_mismatch: 'the site keeps another value than the one written',
  door_not_available: 'the plugin on the site has no door the write needs'
})

/**
 * Codes of the run's own state, neither the build's guard nor the site's failure: the measurement cannot pass and
 * says so (`run_state`), it never blames a value.
 */
export const RUN_STATE_CODES = Object.freeze({
  write_record_stale: 'the run folder holds the record of another plan',
  stored_picture_gone: 'a picture the run stored is no longer behind its reference',
  revision_needs_removal: 'a revision needs a removal door the run does not have',
  site_changed_outside: 'the site changed outside the run',
  site_key_missing: 'the run record names no site'
})

export const BUILD_GUARDS = new Set([...BUILD_GUARD_CODES, ...GATE_GUARD_CODES])
