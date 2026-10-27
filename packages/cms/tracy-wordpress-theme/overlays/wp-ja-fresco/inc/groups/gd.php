<?php
/**
 * Group D: the account pages. The source's sign-in page (/pages/users/login-form) and registration page
 * (/pages/users/registration-form) are Joomla's com_users forms in a tinted box; here the core Login/out
 * block on the pages that use templates page-login and page-register prints the same form shape (the
 * source's classes, so one stylesheet, gd-auth.css, draws both), posting to WordPress's own sign-in and
 * registration (wp-login.php). A signed-in visitor keeps the core block's own output (a "Log out" link).
 *
 * What WordPress has no counterpart for is left out (DECISIONS D-20): the username reminder link (the
 * lost-password screen takes a username or an email), and every registration field but Username and Email
 * (WordPress mails the password; the source's name, password pair and profile fields are not stored).
 *
 * @package wp-ja-fresco
 */

defined( 'ABSPATH' ) || exit;

/**
 * Whether the current page uses one of the account templates.
 *
 * @param string $slug Template slug.
 * @return bool
 */
function wp_ja_fresco_on_account_template( string $slug ): bool {
	return is_singular( 'page' ) && get_page_template_slug() === $slug;
}

/**
 * The page that uses an account template, when the site has one.
 *
 * @param string $slug Template slug.
 * @return int Page ID or 0.
 */
function wp_ja_fresco_account_page( string $slug ): int {
	$ids = get_posts(
		array(
			'post_type'   => 'page',
			'post_status' => 'publish',
			'numberposts' => 1,
			'meta_key'    => '_wp_page_template', // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key
			'meta_value'  => $slug, // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_value
			'fields'      => 'ids',
		)
	);
	return $ids ? (int) $ids[0] : 0;
}

/**
 * One labelled field as the source prints it: label above, a red star on a required one.
 *
 * @param string $id       Field id.
 * @param string $name     Field name.
 * @param string $type     Input type.
 * @param string $label    Label text.
 * @param string $auto     Autocomplete hint.
 * @param string $group    Extra class on the group.
 * @param string $password Whether the field has the show-password toggle.
 * @return string
 */
function wp_ja_fresco_account_field( string $id, string $name, string $type, string $label, string $auto, string $group = '', bool $password = false ): string {
	$input = sprintf(
		'<input type="%1$s" name="%2$s" id="%3$s" value="" class="form-control" size="25" autocomplete="%4$s" required>',
		esc_attr( $type ),
		esc_attr( $name ),
		esc_attr( $id ),
		esc_attr( $auto )
	);
	if ( $password ) {
		$input = sprintf(
			'<div class="password-group"><div class="input-group">%1$s<button type="button" class="btn btn-secondary input-password-toggle" aria-controls="%2$s" aria-pressed="false"><svg class="jf-eye" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 5C6.5 5 2.7 9.3 1.5 12c1.2 2.7 5 7 10.5 7s9.3-4.3 10.5-7C21.3 9.3 17.5 5 12 5zm0 11.5a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9zm0-7a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z"/></svg><span class="screen-reader-text">%3$s</span></button></div></div>',
			$input,
			esc_attr( $id ),
			esc_html__( 'Show Password', 'wp-ja-fresco' )
		);
	}
	return sprintf(
		'<div class="control-group%1$s"><div class="control-label"><label for="%2$s">%3$s<span class="star" aria-hidden="true">&#160;*</span></label></div><div class="controls">%4$s</div></div>',
		$group ? ' ' . esc_attr( $group ) : '',
		esc_attr( $id ),
		esc_html( $label ),
		$input
	);
}

/**
 * The sign-in form and the links under it.
 *
 * @return string
 */
function wp_ja_fresco_login_form(): string {
	$links = array( sprintf( '<li><a href="%s">%s</a></li>', esc_url( wp_lostpassword_url() ), esc_html__( 'Forgot your password?', 'wp-ja-fresco' ) ) );
	$register = wp_ja_fresco_account_page( 'page-register' );
	if ( $register && get_option( 'users_can_register' ) ) {
		$links[] = sprintf( '<li><a href="%s">%s</a></li>', esc_url( get_permalink( $register ) ), esc_html__( "Don't have an account?", 'wp-ja-fresco' ) );
	}
	return sprintf(
		'<div class="login-wrap"><div class="frm-wrap login"><form id="loginform" name="loginform" action="%1$s" method="post" class="frm-login-form"><fieldset>%2$s%3$s<div class="login-remember"><div class="form-check"><input id="rememberme" type="checkbox" name="rememberme" class="form-check-input inputbox" value="forever"><label class="form-check-label" for="rememberme">%4$s</label></div></div><div class="login-submit control-group"><div class="controls"><button type="submit" name="wp-submit" class="btn btn-primary">%5$s</button></div></div><input type="hidden" name="redirect_to" value="%6$s"></fieldset></form></div><div class="other-links"><ul>%7$s</ul></div></div>',
		esc_url( site_url( 'wp-login.php', 'login_post' ) ),
		// The source's username field takes focus on load (its `autofocus`).
		str_replace( ' required>', ' required autofocus>', wp_ja_fresco_account_field( 'user_login', 'log', 'text', __( 'Username', 'wp-ja-fresco' ), 'username', 'login__input' ) ),
		wp_ja_fresco_account_field( 'user_pass', 'pwd', 'password', __( 'Password', 'wp-ja-fresco' ), 'current-password', 'login__input', true ),
		esc_html__( 'Remember me', 'wp-ja-fresco' ),
		esc_html__( 'Log in', 'wp-ja-fresco' ),
		esc_url( home_url( '/' ) ),
		implode( '', $links )
	);
}

/**
 * The registration form: Username and Email, posted to WordPress's registration, which checks them, mails
 * the password and redirects; `register_form` still runs inside it.
 *
 * @return string
 */
function wp_ja_fresco_register_form(): string {
	if ( ! get_option( 'users_can_register' ) ) {
		return '<div class="com-users-registration registration"><p>' . esc_html__( 'User registration is disabled.', 'wp-ja-fresco' ) . '</p></div>';
	}
	ob_start();
	do_action( 'register_form' );
	$extra = (string) ob_get_clean();
	return sprintf(
		'<div class="com-users-registration registration"><form id="member-registration" name="registerform" action="%1$s" method="post" class="com-users-registration__form"><fieldset><legend>%2$s</legend><div class="control-group field-spacer"><div class="control-label"><label><strong class="red">*</strong> %3$s</label></div></div>%4$s%5$s%6$s</fieldset><div class="com-users-registration__submit control-group"><div class="controls"><button type="submit" name="wp-submit" class="com-users-registration__register btn btn-primary">%7$s</button> <a class="com-users-registration__cancel btn btn-danger" href="%8$s" title="%9$s">%9$s</a></div></div></form></div>',
		esc_url( site_url( 'wp-login.php?action=register', 'login_post' ) ),
		esc_html__( 'User Registration', 'wp-ja-fresco' ),
		esc_html__( 'Required field', 'wp-ja-fresco' ),
		wp_ja_fresco_account_field( 'user_login', 'user_login', 'text', __( 'Username', 'wp-ja-fresco' ), 'username' ),
		wp_ja_fresco_account_field( 'user_email', 'user_email', 'email', __( 'Email Address', 'wp-ja-fresco' ), 'email' ),
		$extra,
		esc_html__( 'Register', 'wp-ja-fresco' ),
		esc_url( home_url( '/' ) ),
		esc_html__( 'Cancel', 'wp-ja-fresco' )
	);
}

/**
 * Swaps the core Login/out block's output for the account form of the page's template.
 *
 * @param string $html What the core block printed.
 * @return string
 */
function wp_ja_fresco_account_forms( string $html ): string {
	if ( is_user_logged_in() ) {
		return $html;
	}
	if ( wp_ja_fresco_on_account_template( 'page-login' ) ) {
		return wp_ja_fresco_login_form();
	}
	if ( wp_ja_fresco_on_account_template( 'page-register' ) ) {
		return wp_ja_fresco_register_form();
	}
	return $html;
}
add_filter( 'render_block_core/loginout', 'wp_ja_fresco_account_forms' );

/** The show-password toggle on the account forms (the source's eye button). */
function wp_ja_fresco_password_toggle(): void {
	if ( is_user_logged_in() || ! ( wp_ja_fresco_on_account_template( 'page-login' ) || wp_ja_fresco_on_account_template( 'page-register' ) ) ) {
		return;
	}
	wp_print_inline_script_tag(
		"document.querySelectorAll('.input-password-toggle').forEach(function(b){b.addEventListener('click',function(){var i=document.getElementById(b.getAttribute('aria-controls'));if(!i)return;var show=i.type==='password';i.type=show?'text':'password';b.setAttribute('aria-pressed',show?'true':'false');});});"
	);
}
add_action( 'wp_footer', 'wp_ja_fresco_password_toggle' );
