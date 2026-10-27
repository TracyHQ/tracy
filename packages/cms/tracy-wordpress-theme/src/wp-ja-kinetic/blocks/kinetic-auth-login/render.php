<?php
/**
 * wp-ja-kinetic/kinetic-auth-login — the source's login card + benefits panel
 * (html/com_users/login/default_login.php). Posts to this same page (`get_permalink()`), not
 * straight to wp-login.php: `wp_ja_kinetic_login_submit()` (inc/extra.php, on `template_redirect`)
 * calls `wp_signon()` itself so a failed attempt keeps the visitor on this theme's chrome with the
 * source's own error text, the way the source's own login redirects back to itself on failure
 * (measured live: `POST …/pages/login?task=user.login` with bad credentials answers 303 to
 * `…/pages/login`) instead of a generic error page. Renders two sibling elements with no
 * wrapper: the parent `.kinetic-auth__split` (page-login.html) is a 2-col CSS grid and needs the
 * card and the aside as its direct children.
 *
 * Dropped against the source, and why:
 *  - the remember-me checkbox: the source's own css/page-233.css hides it
 *    (`.login-remember{display:none!important}`) — not in the .pen design, so it is not rendered
 *    here either.
 *
 * Kept against the source, even though hidden, for D-11 element-tree parity: the show-password eye
 * toggle button. `html/com_users/auth-fix.css` (`.kinetic-auth .input-password-toggle{display:none
 * !important}`) hides it on the source too — "kept in markup … but not shown", the same doc-comment
 * language page-232.css uses for the search Advanced Search panel — so this renders the same inert
 * button + the same `wp-ja-kinetic-password-toggle.js` behaviour (type flip, icon class, visually-
 * hidden label) rather than omitting the element outright.
 *
 * @package wp-ja-kinetic
 */

defined( 'ABSPATH' ) || exit;

$wp_ja_kinetic_check = '<svg class="kinetic-auth__check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
$wp_ja_kinetic_state = wp_ja_kinetic_auth_state();
$wp_ja_kinetic_error = (string) ( $wp_ja_kinetic_state['login_error'] ?? '' );
?>
<div class="kinetic-auth__card">
	<form id="com-users-login__form" action="<?php echo esc_url( get_permalink() ); ?>" method="post" class="com-users-login__form frm-login-form form-validate">
		<fieldset>
			<div class="control-group login__input">
				<div class="control-label"><label for="user_login" class="required">Username<span class="star" aria-hidden="true">&#160;*</span></label></div>
				<div class="controls"><input type="text" name="log" id="user_login" value="" class="form-control validate-username required" autocomplete="username" autofocus required></div>
			</div>
			<div class="control-group login__input">
				<div class="control-label"><label for="user_pass" class="required">Password<span class="star" aria-hidden="true">&#160;*</span></label></div>
				<div class="controls">
					<div class="password-group">
						<div class="input-group">
							<input type="password" name="pwd" id="user_pass" class="form-control required" autocomplete="current-password" required>
							<button type="button" class="btn btn-secondary input-password-toggle" data-wp-ja-kinetic-password-toggle aria-controls="user_pass">
								<span class="icon-eye icon-fw" aria-hidden="true"></span>
								<span class="visually-hidden">Show Password</span>
							</button>
						</div>
					</div>
				</div>
			</div>

			<div class="kinetic-auth__inline-link">
				<a href="<?php echo esc_url( wp_lostpassword_url( home_url( '/' ) ) ); ?>">Forgot password?</a>
			</div>

			<div class="login-submit control-group">
				<div class="controls">
					<button type="submit" name="wp-submit" class="btn btn-primary">Sign in</button>
				</div>
			</div>
			<input type="hidden" name="wp_ja_kinetic_login" value="1">
			<?php /* Two hidden inputs, as the source's `return` + token pair: no `redirect_to` — wp_ja_kinetic_login_submit() already falls back to the profile page, as the source's UserController does. */ ?>
			<input type="hidden" name="wp_ja_kinetic_nonce" value="<?php echo esc_attr( wp_create_nonce( 'wp_ja_kinetic_login' ) ); ?>">
		</fieldset>
	</form>

	<?php if ( get_option( 'users_can_register' ) ) : ?>
	<p class="kinetic-auth__altrow">
		<span>New to Kinetic?</span>
		<a href="<?php echo esc_url( wp_registration_url() ); ?>">Create an account</a>
	</p>
	<?php endif; ?>
</div>

<aside class="kinetic-auth__benefits">
	<h2 class="kinetic-auth__benefits-title">One login, your whole stack.</h2>
	<ul class="kinetic-auth__checklist">
		<li><?php echo $wp_ja_kinetic_check; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- fixed inline SVG, no user input. ?><span>Pick up dashboards and saved queries from any device.</span></li>
		<li><?php echo $wp_ja_kinetic_check; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?><span>SAML SSO and 2FA on every paid plan.</span></li>
		<li><?php echo $wp_ja_kinetic_check; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?><span>Audit logs record every access for compliance.</span></li>
	</ul>
</aside>
