<?php
/**
 * wp-ja-kinetic/kinetic-auth-register — the source's registration card + benefits panel
 * (html/com_users/registration/default.php), the full field set in the source's own order/labels/
 * classes: Full Name + Company (a row, `.kinetic-auth__row`), Email Address, Password. Posts to
 * this same page (`get_permalink()`); `wp_ja_kinetic_register_submit()` (inc/extra.php, on
 * `template_redirect`) calls `wp_insert_user()` directly — WordPress core's own
 * `register_new_user()` only ever takes a username and an email and never honours a password
 * (wp-login.php emails one instead), so it cannot carry this form's Password or Company fields;
 * this handler does. On error the fields are re-shown with the values typed (`register_values`)
 * and the source's own error copy (`COM_USERS_REGISTRATION_SAVE_FAILED`). Two sibling elements, no
 * wrapper — same reason as kinetic-auth-login.
 *
 * On success the handler redirects (303) to this page's `?layout=complete`, like the source; on that
 * view (`register_success`) the whole split (form card + benefits aside) is replaced by the source's own
 * `registration/complete.php` — measured live on the running source (admin-activation is on,
 * `com_users` params `useractivation=2`): a lone `.kinetic-auth__card` with no form, no aside, just
 * the plain in-card head (`.kinetic-auth__head`/`.kinetic-auth__eyebrow` "// new account", no dot —
 * that dot only decorates the OUTER `.kinetic-auth-masthead` eyebrow, never this in-card one — plus
 * `.kinetic-auth__title` = the same `page_heading` menu-item param the outer masthead's `post-title`
 * already carries, "Create your Kinetic account", read from the running source's own `#__menu` row).
 * The confirmation copy itself (`COM_USERS_REGISTRATION_COMPLETE_VERIFY`) is the notice above this
 * card, not text inside it — see kinetic-auth-notice/render.php. `kinetic-auth__card--plain` is the
 * same modifier kinetic-auth-password/render.php uses for its own in-card heads: the CSS `:has()`
 * rule it relies on (wp-ja-kinetic-finder-auth.css) already hides the outer masthead for ANY page
 * carrying that modifier, and a matching `body.item-234 .kinetic-auth__split:has(…)` rule there
 * collapses the 2-col grid to one centered column when the aside is absent.
 *
 * Kept against the source, even though hidden, for D-11 element-tree parity: the show-password eye
 * toggle button on the Password field (`html/com_users/auth-fix.css` hides it there too — same as
 * kinetic-auth-login/render.php's own doc comment).
 *
 * The required fields' labels carry the source's own `jform_*-lbl` ids (the Joomla form field's
 * label id); their `for` and the fields' own ids/names stay this form's (the submit handler reads
 * those names).
 *
 * @package wp-ja-kinetic
 */

defined( 'ABSPATH' ) || exit;

$wp_ja_kinetic_check   = '<svg class="kinetic-auth__check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
$wp_ja_kinetic_state   = wp_ja_kinetic_auth_state();
$wp_ja_kinetic_error   = (string) ( $wp_ja_kinetic_state['register_error'] ?? '' );
$wp_ja_kinetic_success = ! empty( $wp_ja_kinetic_state['register_success'] );
$wp_ja_kinetic_values  = (array) ( $wp_ja_kinetic_state['register_values'] ?? array() );
?>
<?php if ( $wp_ja_kinetic_success ) : ?>
	<div class="kinetic-auth__card">
		<div class="kinetic-auth__head">
			<span class="kinetic-auth__eyebrow">// new account</span>
			<h1 class="kinetic-auth__title">Create your Kinetic account</h1>
		</div>
	</div>
	<?php return; ?>
<?php endif; ?>
<div class="kinetic-auth__card">
	<form id="member-registration" action="<?php echo esc_url( get_permalink() ); ?>" method="post" class="com-users-registration__form form-validate">
		<div class="kinetic-auth__row">
			<div class="control-group">
				<div class="control-label"><label id="jform_name-lbl" for="kinetic_name" class="required">Name<span class="star" aria-hidden="true">&#160;*</span></label></div>
				<div class="controls"><input type="text" id="kinetic_name" name="kinetic_name" value="<?php echo esc_attr( (string) ( $wp_ja_kinetic_values['name'] ?? '' ) ); ?>" class="form-control required" autocomplete="name" required></div>
			</div>
			<div class="control-group kinetic-auth__company">
				<div class="control-label"><label for="kinetic_company">Company</label></div>
				<div class="controls"><input type="text" id="kinetic_company" name="kinetic_company" value="<?php echo esc_attr( (string) ( $wp_ja_kinetic_values['company'] ?? '' ) ); ?>" class="form-control" autocomplete="organization"></div>
			</div>
		</div>

		<div class="control-group">
			<div class="control-label"><label id="jform_email1-lbl" for="user_email" class="required">Email Address<span class="star" aria-hidden="true">&#160;*</span></label></div>
			<div class="controls"><input type="email" name="user_email" id="user_email" value="<?php echo esc_attr( (string) ( $wp_ja_kinetic_values['email'] ?? '' ) ); ?>" class="form-control validate-email required" autocomplete="email" required></div>
		</div>

		<div class="control-group">
			<div class="control-label"><label id="jform_password1-lbl" for="user_pass" class="required">Password<span class="star" aria-hidden="true">&#160;*</span></label></div>
			<div class="controls">
				<div id="user_pass-rules" class="small text-muted"><strong>Minimum Requirements</strong> — Characters: 4</div>
				<div class="password-group">
					<div class="input-group">
						<input type="password" name="user_pass" id="user_pass" autocomplete="new-password" class="form-control js-password-strength validate-password required" aria-describedby="user_pass-rules" data-min-length="4" minlength="6" required>
						<button type="button" class="btn btn-secondary input-password-toggle" data-wp-ja-kinetic-password-toggle aria-controls="user_pass">
							<span class="icon-eye icon-fw" aria-hidden="true"></span>
							<span class="visually-hidden">Show Password</span>
						</button>
					</div>
				</div>
			</div>
		</div>

		<?php /* The source's hidden Username + Confirm-password pair, mirrored there from Email/Password for Joomla core validation; inert here — the handler derives user_login itself (wp_ja_kinetic_unique_username()). */ ?>
		<input type="hidden" name="jform[username]" id="jform_username" value="" class="validate-username">
		<input type="hidden" name="jform[password2]" id="jform_password2" value="" class="validate-password">

		<div class="com-users-registration__submit control-group">
			<div class="controls">
				<button type="submit" class="com-users-registration__register btn btn-primary validate">Create free account</button>
				<?php /* Two hidden inputs after the button, as the source's `option` + `task` pair; the nonce below stands where the source's form token does. */ ?>
				<input type="hidden" name="wp_ja_kinetic_register" value="1">
				<?php wp_referer_field(); ?>
			</div>
		</div>
		<input type="hidden" name="wp_ja_kinetic_nonce" value="<?php echo esc_attr( wp_create_nonce( 'wp_ja_kinetic_register' ) ); ?>">
	</form>

	<p class="kinetic-auth__altrow">
		<span>Already have an account?</span>
		<a href="<?php echo esc_url( wp_login_url() ); ?>">Sign in</a>
	</p>
</div>

<aside class="kinetic-auth__benefits">
	<h2 class="kinetic-auth__benefits-title">Start free. No card required.</h2>
	<ul class="kinetic-auth__checklist">
		<li><?php echo $wp_ja_kinetic_check; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- fixed inline SVG, no user input. ?><span>14-day Team trial, then a generous free tier forever.</span></li>
		<li><?php echo $wp_ja_kinetic_check; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?><span>Pipe your first logs in under five minutes with the CLI.</span></li>
		<li><?php echo $wp_ja_kinetic_check; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?><span>Invite your whole team — we never charge per seat.</span></li>
	</ul>
</aside>
