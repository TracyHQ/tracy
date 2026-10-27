<?php
/**
 * wp-ja-kinetic/kinetic-auth-password — two source pages, one WordPress template
 * (`page-password.html`, since page-map.json's own `view` names both `pages/reset` (Itemid 236)
 * and `pages/remind` (Itemid 237) `page-password`): reset (html/com_users/reset/{default,confirm,
 * complete}.php) and remind (html/com_users/remind/default.php). Which mode a request is in comes
 * from `wp_ja_kinetic_current_item_id()` (inc/item-ids.php).
 *
 * **remind** (237) has no WordPress core equivalent ("email me my username") — posts to the page
 * itself; `wp_ja_kinetic_remind_submit()` (inc/extra.php) looks the account up by email and mails
 * the username, then redirects to the login page with a flash notice on success — the source's own
 * `RemindController::remind()` behaviour, not an in-page confirmation (see that function's own doc
 * comment for the redirect mechanics, shared with reset's own success step below).
 *
 * **reset** (236) stays on THIS page through the source's own request/confirm/new-password steps,
 * never touching wp-login.php until the very end (see `wp_ja_kinetic_reset_link_message()`'s own doc
 * comment in inc/extra.php for how the emailed link is rewritten to point here, and its own doc
 * comment above `wp_ja_kinetic_reset_confirm_submit()` for the manual-entry step below):
 *  - **request** (source: `reset/default.php`) — the bare page: posting to this page,
 *    `wp_ja_kinetic_reset_request_submit()` calls core's own `retrieve_password()`, then 303s to
 *    `?layout=confirm`.
 *  - **confirm** (source: `reset/confirm.php`, `reset_confirm.xml` — Username + Verification Code)
 *    — `?layout=confirm`; posting to this page, `wp_ja_kinetic_reset_confirm_submit()` checks the
 *    code with core's own `check_password_reset_key()` and 303s to `?layout=complete` (or back here).
 *  - **new password** (source: `reset/complete.php`, its own copy `COM_USERS_COMPLETE`/
 *    `_RESET_COMPLETE_LABEL`, verbatim from the source's `com_users.ini`) — `?layout=complete`, where
 *    a valid confirm submission and the emailed link both land; posting to this page,
 *    `wp_ja_kinetic_reset_new_password_submit()` calls core's own `reset_password()`, THEN redirects
 *    to the login page with a flash notice — the source's own `ResetController::complete()`
 *    behaviour (that function's own doc comment), so this page never renders a "done" state itself.
 *
 * The confirm step and the new-password step use the source's own PLAIN in-card head
 * (`.kinetic-auth__head`/`.kinetic-auth__title` — `reset/confirm.php:21-24`, `reset/complete.php:
 * 19-24`, no `.kinetic-auth__eyebrow-dot`: that dot only decorates the OUTER `.kinetic-auth-masthead`
 * eyebrow the request step and the other auth pages use, never this in-card one). Both mark their
 * card `kinetic-auth__card--plain`; `wp_ja_kinetic_auth_is_plain_view()` (inc/extra.php) mirrors
 * this same state at the boolean level so `wp_ja_kinetic_suppress_plain_masthead()` there can remove
 * the outer masthead's own block output — real structural absence, not the template's static
 * masthead merely hidden by CSS. Heading text on both is the source's own live `page_heading`
 * menu-item param for Itemid 236, "Reset your password" (measured directly against the running
 * source's `#__menu` row, 2026-09-22) — the same text the request step's own `post-title` carries.
 *
 * Every required field's label carries the source's own `jform_*-lbl` id (`jform_email-lbl` on
 * remind/request, `jform_password1-lbl`/`jform_password2-lbl` on complete, `jform_username-lbl`/
 * `jform_token-lbl` on confirm); `for` and the fields' own ids/names stay this form's.
 *
 * @package wp-ja-kinetic
 */

defined( 'ABSPATH' ) || exit;

$wp_ja_kinetic_reset_heading = 'Reset your password';

$wp_ja_kinetic_is_remind = 237 === wp_ja_kinetic_current_item_id();

if ( $wp_ja_kinetic_is_remind ) :
	?>
	<div class="kinetic-auth__card">
		<form id="user-registration" action="<?php echo esc_url( get_permalink() ); ?>" method="post" class="com-users-remind__form form-validate">
			<fieldset>
				<div class="control-group">
					<div class="control-label"><label id="jform_email-lbl" for="user_login" class="required">Email Address<span class="star" aria-hidden="true">&#160;*</span></label></div>
					<div class="controls"><input type="email" name="user_login" id="user_login" class="form-control validate-email required" autocomplete="email" required></div>
				</div>
			</fieldset>
			<div class="com-users-remind__submit control-group">
				<div class="controls">
					<?php /* The submit button carries the handler's marker, so the form keeps the source's one hidden input (its token; the nonce stands there). Native submission, Enter key included, sends the submitter's name. */ ?>
					<button type="submit" name="wp_ja_kinetic_remind" value="1" class="btn btn-primary validate">Email my username</button>
				</div>
			</div>
			<input type="hidden" name="wp_ja_kinetic_nonce" value="<?php echo esc_attr( wp_create_nonce( 'wp_ja_kinetic_remind' ) ); ?>">
		</form>

		<p class="kinetic-auth__altrow kinetic-auth__altrow--links">
			<a href="<?php echo esc_url( wp_lostpassword_url() ); ?>">Reset password</a>
			<span class="kinetic-auth__altsep">&middot;</span>
			<a href="<?php echo esc_url( wp_login_url() ); ?>">Sign in</a>
		</p>
	</div>
	<?php
	return;
endif;

// ---- reset (Itemid 236) ----
// `wp_ja_kinetic_reset_view()` (inc/extra.php) resolves the exact same plain/confirm/complete
// branching this block used to duplicate inline — factored out so the outer `<main>`
// wrapper's own class list (`wp_ja_kinetic_auth_main_state_classes()`, inc/extra.php) can read the
// identical state without guessing at it independently.
$wp_ja_kinetic_view = wp_ja_kinetic_reset_view();

if ( 'complete' === $wp_ja_kinetic_view ) :
	// ---- new password: source's own `reset/complete.php` form — measured live: NO intro
	// paragraph above the fields (AU-016, run-3 audit; a prior port of this block added one that
	// the source never had), and the show-password eye toggle IS visible here (unlike every other
	// auth page — AU-017/312-334; see wp-ja-kinetic-finder-auth.css's own `:has(#password1)` rule). ----
	?>
	<div class="kinetic-auth__card">
		<div class="kinetic-auth__head">
			<span class="kinetic-auth__eyebrow">// new password</span>
			<h1 class="kinetic-auth__title"><?php echo esc_html( $wp_ja_kinetic_reset_heading ); ?></h1>
		</div>
		<form action="<?php echo esc_url( get_permalink() ); ?>" method="post" class="com-users-reset__form form-validate">
			<fieldset>
				<?php /* The source's fieldset opens with an empty paragraph (reset/complete.php:28-33 prints the fieldset's empty `label` there). */ ?>
				<p></p>
				<div class="control-group">
					<div class="control-label"><label id="jform_password1-lbl" for="password1" class="required">Password<span class="star" aria-hidden="true">&#160;*</span></label></div>
					<div class="controls">
						<div id="password1-rules" class="small text-muted"><strong>Minimum Requirements</strong> — Characters: 4</div>
						<div class="password-group">
							<div class="input-group">
								<input type="password" name="pass1" id="password1" autocomplete="new-password" class="form-control js-password-strength validate-password required" aria-describedby="password1-rules" size="30" data-min-length="4" minlength="6" required>
								<button type="button" class="btn btn-secondary input-password-toggle" data-wp-ja-kinetic-password-toggle aria-controls="password1">
									<span class="icon-eye icon-fw" aria-hidden="true"></span>
									<span class="visually-hidden">Show Password</span>
								</button>
							</div>
						</div>
					</div>
				</div>
				<div class="control-group">
					<div class="control-label"><label id="jform_password2-lbl" for="password2" class="required">Confirm Password<span class="star" aria-hidden="true">&#160;*</span></label></div>
					<div class="controls">
						<div class="password-group">
							<div class="input-group">
								<input type="password" name="pass2" id="password2" autocomplete="new-password" class="form-control validate-password required" size="30" minlength="6" required>
								<button type="button" class="btn btn-secondary input-password-toggle" data-wp-ja-kinetic-password-toggle aria-controls="password2">
									<span class="icon-eye icon-fw" aria-hidden="true"></span>
									<span class="visually-hidden">Show Password</span>
								</button>
							</div>
						</div>
					</div>
				</div>
			</fieldset>
			<div class="control-group">
				<div class="controls">
					<?php /* The submit button carries the handler's marker (native submission, Enter key included, sends the submitter's name). The confirmed user + code stay server-side (the flash, as the source's session), so the form keeps the source's one hidden input (its token; the nonce stands there). */ ?>
					<button type="submit" name="wp_ja_kinetic_reset_complete" value="1" class="btn btn-primary validate">Submit</button>
				</div>
			</div>
			<input type="hidden" name="wp_ja_kinetic_nonce" value="<?php echo esc_attr( wp_create_nonce( 'wp_ja_kinetic_reset_complete' ) ); ?>">
		</form>
	</div>
	<?php
elseif ( 'confirm' === $wp_ja_kinetic_view ) :
	// ---- confirm: source's own `reset/confirm.php` — Username + Verification Code. Reached
	// either right after a request-form submit, or directly at `?layout=confirm` (AU-015). ----
	?>
	<div class="kinetic-auth__card">
		<div class="kinetic-auth__head">
			<span class="kinetic-auth__eyebrow">// password reset</span>
			<h1 class="kinetic-auth__title"><?php echo esc_html( $wp_ja_kinetic_reset_heading ); ?></h1>
		</div>
		<form action="<?php echo esc_url( get_permalink() ); ?>" method="post" class="com-users-reset__form form-validate">
			<fieldset>
				<?php /* The source's fieldset opens with an empty paragraph (reset/confirm.php:29-30 prints the fieldset's empty `label` there). */ ?>
				<p></p>
				<div class="control-group">
					<div class="control-label"><label id="jform_username-lbl" for="reset_confirm_username" class="required">Username<span class="star" aria-hidden="true">&#160;*</span></label></div>
					<div class="controls"><input type="text" name="reset_confirm_username" id="reset_confirm_username" class="form-control required" autocomplete="username" required></div>
				</div>
				<div class="control-group">
					<div class="control-label"><label id="jform_token-lbl" for="reset_confirm_token" class="required">Verification Code<span class="star" aria-hidden="true">&#160;*</span></label></div>
					<div class="controls"><input type="text" name="reset_confirm_token" id="reset_confirm_token" class="form-control required" autocomplete="one-time-code" required></div>
				</div>
			</fieldset>
			<div class="control-group">
				<div class="controls">
					<?php /* The submit button carries the handler's marker, so the form keeps the source's one hidden input (its token; the nonce stands there). */ ?>
					<button type="submit" name="wp_ja_kinetic_reset_confirm" value="1" class="btn btn-primary validate">Submit</button>
				</div>
			</div>
			<input type="hidden" name="wp_ja_kinetic_nonce" value="<?php echo esc_attr( wp_create_nonce( 'wp_ja_kinetic_reset_confirm' ) ); ?>">
		</form>
	</div>
	<?php
else :
	// ---- request: source's own `reset/default.php` ----
	?>
	<div class="kinetic-auth__card">
		<form id="user-registration" action="<?php echo esc_url( get_permalink() ); ?>" method="post" class="com-users-reset__form form-validate">
			<fieldset>
				<div class="control-group">
					<div class="control-label"><label id="jform_email-lbl" for="user_login" class="required">Email Address<span class="star" aria-hidden="true">&#160;*</span></label></div>
					<div class="controls"><input type="email" name="user_login" id="user_login" class="form-control validate-email required" autocomplete="email" required></div>
				</div>
			</fieldset>
			<div class="com-users-reset__submit control-group">
				<div class="controls">
					<?php /* The submit button carries the handler's marker, so the form keeps the source's one hidden input (its token; the nonce stands there). Native submission, Enter key included, sends the submitter's name. */ ?>
					<button type="submit" name="wp_ja_kinetic_reset" value="1" class="btn btn-primary validate">Send reset link</button>
				</div>
			</div>
			<input type="hidden" name="wp_ja_kinetic_nonce" value="<?php echo esc_attr( wp_create_nonce( 'wp_ja_kinetic_reset' ) ); ?>">
		</form>

		<p class="kinetic-auth__altrow">
			<span>Remembered it?</span>
			<a href="<?php echo esc_url( wp_login_url() ); ?>">Back to sign in</a>
		</p>
	</div>
	<?php
endif;
