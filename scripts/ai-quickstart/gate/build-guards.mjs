// The stop codes of the build team's write step as write safety classes them (ticket #586, review round 2), each
// decided by a person and listed here by hand. A test reads every code their write step throws or reports, in the
// domain files (`packages/wo/website-opportunities/domain/draft-write-*.mjs`, `write-order*.mjs`) and in the app's step
// chain files (`apps/tracy-web/src/step-chain-draft-*.js`), and in the planner's files (the plan composer the marker
// build calls and every domain file it imports, review 7 D1), and fails when one is on no list, or when a listed code
// is gone: a new code is never classed by default. Pure.

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
  'hide_by_unknown',
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
  // A picture address naming no file, and a picture that cannot take its required slot's declared frame (#597): both
  // stop before that picture is written anywhere.
  'picture_address_empty',
  'picture_not_stored',
  'picture_web_address_only',
  'picture_without_alt',
  'pictures_missing',
  'place_not_written',
  'plan_missing',
  'profile_missing',
  'record_fact_column_unknown',
  'record_kind_unsupported',
  'record_name_empty',
  'ref_unresolved',
  'reset_from_unknown',
  'slot_missing',
  'slot_picture_unfit',
  'straight_quote_in_open_slot',
  'text_over_limit',
  'under_page_position_not_detail',
  'unknown_block',
  'value_not_escaped',
  'writer_missing'
])

/**
 * The planner's own codes (review 7 D1): the plan composer the marker build calls refuses a plan with a code of its own
 * before any write, so a probed build it refuses never reaches a site: recorded only, like a write step guard. The plain
 * marker build passes the planner, so a code met only in a pass is the probe's doing. One code is decided apart:
 * `plan_gate_failed` (`PLAN_GATE_REFUSALS`).
 */
export const PLANNER_GUARD_CODES = Object.freeze([
  'answer_invalid',
  'block_store_invalid',
  'brand_logo_colours_unmeasured',
  'brand_missing',
  'brand_step_failed',
  'brand_step_missing',
  'brand_step_stopped',
  'language_invalid',
  'library_invalid',
  'look_incomplete',
  'model_missing',
  'pictures_invalid',
  'plan_gate_failed',
  'profile_empty',
  'site_name_invalid',
  'site_name_missing',
  'site_name_too_long'
])

/**
 * The problems of the planner's rules gate that make `plan_gate_failed` a build refusal (review 7 D1). The needs
 * profile drops an empty or blank fact, so a plan block that reads it names an item the profile does not hold
 * (`invented_item`): the planner refused the blank value a customer typed. `plan_gate_failed` carries every problem of
 * its last attempt (`details.problems`); when any is another rule, or the reply was unreadable (`reply_unreadable`,
 * the marker build's own composition), it is not decided as a value refusal and stays `unclassified`.
 */
export const PLAN_GATE_REFUSALS = Object.freeze(['invented_item'])

/** The gate's own guard: the page writer's copy check sent a probed field back. */
export const GATE_GUARD_CODES = Object.freeze(['page_copy_check'])

/**
 * Codes a site gives: a door that failed after its retries, a read back the site answered otherwise. Only the first two
 * have a class of their own in write safety (`stopClassOf`); `door_not_available` and `sheets_unreadable` are classed
 * as any other unnamed code, `server_error`. Both stop the plain marker build too, so the marker test stops on them
 * before write safety gives any probe.
 */
export const SITE_CODES = Object.freeze({
  redo_failed: 'a door call failed after its retries: the door named in its cause answered',
  read_back_mismatch: 'the site keeps another value than the one written',
  door_not_available: 'the plugin on the site has no door the write needs',
  sheets_unreadable:
    'the stylesheets the site serves could not be read: no page or no sheet answered, too large, or past the deadline'
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

export const BUILD_GUARDS = new Set([...BUILD_GUARD_CODES, ...PLANNER_GUARD_CODES, ...GATE_GUARD_CODES])

/**
 * Whether a build that threw `code` with `details` was refused by a named guard: a listed code, and for
 * `plan_gate_failed` only when every problem it carries is one of `PLAN_GATE_REFUSALS`.
 */
export function guardRefused(code, details) {
  if (!BUILD_GUARDS.has(code)) return false
  if (code !== 'plan_gate_failed') return true
  const problems = Array.isArray(details?.problems) ? details.problems : []
  return problems.length > 0 && problems.every((p) => PLAN_GATE_REFUSALS.includes(String(p?.code)))
}
