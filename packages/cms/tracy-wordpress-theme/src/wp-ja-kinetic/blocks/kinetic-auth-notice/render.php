<?php
/**
 * wp-ja-kinetic/kinetic-auth-notice — the source's `#system-message-container` notice for
 * whichever of this page's form handlers (inc/extra.php, all on `template_redirect`) set state
 * this request. One notice at a time, first one found wins — the same as the source, where only
 * one Joomla system message is ever queued per request. Placed between the header part and the
 * `.kinetic-auth` group in page-login.html / page-register.html / page-password.html — see
 * `wp_ja_kinetic_notice()`'s own doc comment for why that position and the exact markup/computed
 * styles it carries. With no message the source still prints the container itself, empty (measured
 * on every auth page: `<div id="system-message-container" aria-live="polite"></div>`, 0px tall), so
 * this block does too.
 *
 * @package wp-ja-kinetic
 */

defined( 'ABSPATH' ) || exit;

// Every handler answers its POST with a 303, so this state is the flash the redirect's GET loaded
// (`wp_ja_kinetic_take_flash()`, inc/extra.php) — server-written, read only through the allowlisted
// keys below, and shown once: a reload prints the empty container.
$wp_ja_kinetic_state = wp_ja_kinetic_auth_state();

// Types match the source's own Joomla message-type → alert mapping exactly, not this theme's own
// judgement call — `layouts/joomla/system/message.php`: error/MSG_ERROR → danger, warning → warning,
// notice → info, message (the default `setMessage()` takes when no type is given) → success. Each
// row below is read from the real controller that raises it (com_users' own
// Registration/Reset/RemindController), not guessed:
//  - register_error: `RegistrationController::register()` — both the field-validation path
//    (`enqueueMessage(..., MSG_ERROR)`) and the model-error path (`setMessage($error, 'error')`) —
//    danger either way.
//  - register_success_notice: set only on the first GET of `?layout=complete` after a successful
//    register POST (one-shot flash cookie, `wp_ja_kinetic_register_complete_view()`); a reload of
//    that view keeps `register_success` (the bare card) but prints no notice, as the source.
//    The source's live `com_users` params have `useractivation=2` (admin
//    activation), so `register()` sets `COM_USERS_REGISTRATION_COMPLETE_VERIFY` with the default
//    'message' type (success) — not `COM_USERS_REGISTRATION_SAVE_SUCCESS`, which only fires when
//    activation is off. See kinetic-auth-register/render.php's own doc comment for the success
//    layout this notice sits above.
//  - remind_success / reset_success / reset_confirm_error / reset_complete_error: every one of
//    these is `setRedirect(..., $message, 'notice')` in RemindController/ResetController — info.
//  - reset_complete_missing: `ResetController::complete()` on the model's 403 exception (no
//    confirmed reset in the session) — `setRedirect(..., $message, 'error')` — danger.
//  - login_required: a logged-out visit to the source's profile page lands on login with a danger
//    alert, "Please login first" (read off the running source, 2026-09-23).
//  - invalid_token: `BaseController::checkToken()` — `JINVALID_TOKEN_NOTICE`, MSG_WARNING.
$wp_ja_kinetic_candidates = array(
	array( 'invalid_token', 'warning', 'The security token did not match. The request was cancelled to prevent any security breach. Please try again.' ),
	array( 'login_error', 'warning' ),
	array( 'login_required', 'danger', 'Please login first' ),
	array( 'register_error', 'danger' ),
	array( 'register_success_notice', 'success', 'Your account has been created and a verification link has been sent to the email address you entered. Note that you must verify the account by selecting the verification link when you get the email and then an administrator will activate your account before you can login.' ),
	array( 'remind_success', 'info', 'If the email address you entered is registered on this site you will shortly receive an email with a reminder.' ),
	array( 'reset_confirm_error', 'info' ),
	array( 'reset_complete_error', 'info' ),
	array( 'reset_complete_missing', 'danger', 'Your password reset confirmation failed because the verification code was missing.' ),
	array( 'reset_success', 'info' ),
	array( 'reset_complete_success', 'success', 'Reset password successful. You may now login to the site.' ),
);

foreach ( $wp_ja_kinetic_candidates as $wp_ja_kinetic_candidate ) {
	[$wp_ja_kinetic_key, $wp_ja_kinetic_type] = $wp_ja_kinetic_candidate;
	if ( empty( $wp_ja_kinetic_state[ $wp_ja_kinetic_key ] ) ) {
		continue;
	}
	$wp_ja_kinetic_value = $wp_ja_kinetic_state[ $wp_ja_kinetic_key ];
	$wp_ja_kinetic_text  = is_string( $wp_ja_kinetic_value ) ? $wp_ja_kinetic_value : ( $wp_ja_kinetic_candidate[2] ?? '' );
	if ( '' === $wp_ja_kinetic_text ) {
		continue;
	}
	echo wp_ja_kinetic_notice( $wp_ja_kinetic_type, $wp_ja_kinetic_text ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- wp_ja_kinetic_notice() escapes internally.
	return;
}
?>
<div id="system-message-container" aria-live="polite"></div>
