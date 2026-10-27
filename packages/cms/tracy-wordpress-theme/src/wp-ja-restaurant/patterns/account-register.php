<?php
/**
 * Title: Registration form
 * Slug: wp-ja-restaurant/account-register
 * Description: The User Registration card of the JA Restaurant source: name, username, password twice and email. It posts to a theme handler that creates a WordPress user.
 * Categories: wp-ja-restaurant, tracy
 * Post Types: page
 * Inserter: yes
 * Keywords: account, form, registration
 *
 * @package wp-ja-restaurant
 */

$jm_notice = function_exists( 'wp_ja_restaurant_form_notice' ) ? wp_ja_restaurant_form_notice(
	array(
		'ok'             => __( 'Your account has been created. You can now log in.', 'wp-ja-restaurant' ),
		'error-token'    => __( 'The form expired. Please try again.', 'wp-ja-restaurant' ),
		'error-closed'   => __( 'Registration is closed on this site.', 'wp-ja-restaurant' ),
		'error-fields'   => __( 'Please fill in every required field.', 'wp-ja-restaurant' ),
		'error-password' => __( 'The two passwords do not match.', 'wp-ja-restaurant' ),
		'error-tos'      => __( 'You must agree to the Terms of Service.', 'wp-ja-restaurant' ),
		'error-exists'   => __( 'That username or email address is already in use.', 'wp-ja-restaurant' ),
		'error-limit'    => __( 'Too many accounts were created from this connection. Please try again later.', 'wp-ja-restaurant' ),
	)
) : '';
if ( ! get_option( 'users_can_register' ) ) :
	?>
<!-- wp:html {"metadata":{"name":"account.register-closed"}} -->
<div id="t3-mainbody" class="container t3-mainbody"><div class="row"><div id="t3-content" class="jr-content col-xs-12"><div class="registration"><div class="alert alert-danger" role="status"><?php esc_html_e( 'Registration is closed on this site.', 'wp-ja-restaurant' ); ?></div><p><a href="<?php echo esc_url( home_url( '/explore/j-pages/login/' ) ); ?>"><?php esc_html_e( 'Log in', 'wp-ja-restaurant' ); ?></a></p></div></div></div></div>
<!-- /wp:html -->
	<?php
	return;
endif;
?>
<!-- wp:html {"metadata":{"name":"account.register-form"}} -->
<div id="t3-mainbody" class="container t3-mainbody"><div class="row"><div id="t3-content" class="jr-content col-xs-12"><?php echo $jm_notice; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- escaped by wp_ja_restaurant_form_notice(). ?><div class="registration"><form id="member-registration" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" method="post" class="form-validate form-horizontal"><input type="hidden" name="action" value="jm_register"><input type="hidden" name="jm_nonce" value="<?php echo esc_attr( wp_create_nonce( 'jm_register' ) ); ?>"><input type="hidden" name="jform[profile][tos]" value="1"><fieldset><legend><?php esc_html_e( 'User Registration', 'wp-ja-restaurant' ); ?></legend><div class="control-group field-spacer"><div class="control-label"><span class="spacer"><span class="before"></span><span class="text"><label><strong class="red">*</strong> <?php esc_html_e( 'Required field', 'wp-ja-restaurant' ); ?></label></span><span class="after"></span></span></div><div class="controls"></div></div><div class="control-group"><div class="control-label"><label for="jr-reg-name" class="required"><?php esc_html_e( 'Name', 'wp-ja-restaurant' ); ?><span class="star" aria-hidden="true">&nbsp;*</span></label></div><div class="controls"><input type="text" name="jform[name]" id="jr-reg-name" class="form-control required" size="30" required></div></div><div class="control-group"><div class="control-label"><label for="jr-reg-user" class="required"><?php esc_html_e( 'Username', 'wp-ja-restaurant' ); ?><span class="star" aria-hidden="true">&nbsp;*</span></label></div><div class="controls"><input type="text" name="jform[username]" id="jr-reg-user" class="form-control required" size="30" required autocomplete="username"></div></div><div class="control-group"><div class="control-label"><label for="jr-reg-pw1" class="required"><?php esc_html_e( 'Password', 'wp-ja-restaurant' ); ?><span class="star" aria-hidden="true">&nbsp;*</span></label></div><div class="controls"><div id="jr-reg-pw1-rules" class="small text-muted"><strong><?php esc_html_e( 'Minimum Requirements', 'wp-ja-restaurant' ); ?></strong> &mdash; <?php esc_html_e( 'Characters: 4', 'wp-ja-restaurant' ); ?></div><div class="password-group"><div class="input-group"><input type="password" name="jform[password1]" id="jr-reg-pw1" class="form-control js-password-strength required" aria-describedby="jr-reg-pw1-rules" size="30" maxlength="99" required autocomplete="new-password"><button type="button" class="btn btn-secondary input-password-toggle"><span class="icon-eye icon-fw" aria-hidden="true"></span><span class="visually-hidden"><?php esc_html_e( 'Show Password', 'wp-ja-restaurant' ); ?></span></button></div><meter min="0" max="100" low="40" high="99" optimum="100" value="0"></meter><div class="text-center jr-strength" aria-live="polite" data-too-short="<?php esc_attr_e( 'Too short', 'wp-ja-restaurant' ); ?>" data-weak="<?php esc_attr_e( 'Weak', 'wp-ja-restaurant' ); ?>" data-good="<?php esc_attr_e( 'Good', 'wp-ja-restaurant' ); ?>" data-strong="<?php esc_attr_e( 'Strong', 'wp-ja-restaurant' ); ?>"></div></div></div></div><div class="control-group"><div class="control-label"><label for="jr-reg-pw2" class="required"><?php esc_html_e( 'Confirm Password', 'wp-ja-restaurant' ); ?><span class="star" aria-hidden="true">&nbsp;*</span></label></div><div class="controls"><div class="password-group"><div class="input-group"><input type="password" name="jform[password2]" id="jr-reg-pw2" class="form-control required" size="30" maxlength="99" required autocomplete="new-password"><button type="button" class="btn btn-secondary input-password-toggle"><span class="icon-eye icon-fw" aria-hidden="true"></span><span class="visually-hidden"><?php esc_html_e( 'Show Password', 'wp-ja-restaurant' ); ?></span></button></div></div></div></div><div class="control-group"><div class="control-label"><label for="jr-reg-email" class="required"><?php esc_html_e( 'Email Address', 'wp-ja-restaurant' ); ?><span class="star" aria-hidden="true">&nbsp;*</span></label></div><div class="controls"><input type="email" inputmode="email" name="jform[email1]" class="form-control required" id="jr-reg-email" size="30" autocomplete="email" required></div></div></fieldset><div class="form-group form-actions"><button type="submit" class="btn btn-primary validate"><?php esc_html_e( 'Register', 'wp-ja-restaurant' ); ?></button> <a class="btn btn-default cancel" href="<?php echo esc_url( home_url( '/' ) ); ?>" title="<?php esc_attr_e( 'Cancel', 'wp-ja-restaurant' ); ?>"><?php esc_html_e( 'Cancel', 'wp-ja-restaurant' ); ?></a></div></form></div></div></div></div>
<!-- /wp:html -->
