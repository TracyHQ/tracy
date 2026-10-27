<?php
/**
 * Title: Registration form
 * Slug: wp-ja-diner/account-register
 * Description: The User Registration card of the JA Diner source: name, username, password twice and email. It posts to a theme handler that creates a WordPress user.
 * Categories: wp-ja-diner, tracy
 * Post Types: page
 * Inserter: yes
 * Keywords: account, form, registration
 *
 * @package wp-ja-diner
 */

$jm_notice = function_exists( 'wp_ja_diner_form_notice' ) ? wp_ja_diner_form_notice(
	array(
		'ok'             => __( 'Your account has been created. You can now log in.', 'wp-ja-diner' ),
		'error-token'    => __( 'The form expired. Please try again.', 'wp-ja-diner' ),
		'error-closed'   => __( 'Registration is closed on this site.', 'wp-ja-diner' ),
		'error-fields'   => __( 'Please fill in every required field.', 'wp-ja-diner' ),
		'error-password' => __( 'The two passwords do not match.', 'wp-ja-diner' ),
		'error-tos'      => __( 'You must agree to the Terms of Service.', 'wp-ja-diner' ),
		'error-exists'   => __( 'That username or email address is already in use.', 'wp-ja-diner' ),
		'error-limit'    => __( 'Too many accounts were created from this connection. Please try again later.', 'wp-ja-diner' ),
	)
) : '';
if ( ! get_option( 'users_can_register' ) ) :
	?>
<!-- wp:html {"metadata":{"name":"account.register-closed"}} -->
<div id="t3-mainbody" class="container t3-mainbody"><div class="row"><div id="t3-content" class="jd-content col-xs-12"><div class="registration"><div class="alert alert-danger" role="status"><?php esc_html_e( 'Registration is closed on this site.', 'wp-ja-diner' ); ?></div><p><a href="<?php echo esc_url( home_url( '/j-pages/login/' ) ); ?>"><?php esc_html_e( 'Log in', 'wp-ja-diner' ); ?></a></p></div></div></div></div>
<!-- /wp:html -->
	<?php
	return;
endif;
?>
<!-- wp:html {"metadata":{"name":"account.register-form"}} -->
<div id="t3-mainbody" class="container t3-mainbody"><div class="row"><div id="t3-content" class="jd-content col-xs-12"><?php echo $jm_notice; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- escaped by wp_ja_diner_form_notice(). ?><div class="registration"><form id="member-registration" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" method="post" class="form-validate form-horizontal"><input type="hidden" name="action" value="jm_register"><input type="hidden" name="jm_nonce" value="<?php echo esc_attr( wp_create_nonce( 'jm_register' ) ); ?>"><input type="hidden" name="jform[profile][tos]" value="1"><fieldset><legend><?php esc_html_e( 'User Registration', 'wp-ja-diner' ); ?></legend><div class="form-group"><div class="col-sm-12 control-label"><span class="spacer"><span class="before"></span><span class="text"><label><strong class="red">*</strong> <?php esc_html_e( 'Required field', 'wp-ja-diner' ); ?></label></span><span class="after"></span></span></div><div class="col-sm-12"></div></div><div class="form-group"><div class="col-sm-12 control-label"><label for="jd-reg-name" class="required"><?php esc_html_e( 'Name', 'wp-ja-diner' ); ?><span class="star" aria-hidden="true">&nbsp;*</span></label></div><div class="col-sm-12"><input type="text" name="jform[name]" id="jd-reg-name" class="form-control required" size="30" required></div></div><div class="form-group"><div class="col-sm-12 control-label"><label for="jd-reg-user" class="required"><?php esc_html_e( 'Username', 'wp-ja-diner' ); ?><span class="star" aria-hidden="true">&nbsp;*</span></label></div><div class="col-sm-12"><input type="text" name="jform[username]" id="jd-reg-user" class="form-control validate-username required" size="30" required autocomplete="username"></div></div><div class="form-group"><div class="col-sm-12 control-label"><label for="jd-reg-pw1" class="required"><?php esc_html_e( 'Password', 'wp-ja-diner' ); ?><span class="star" aria-hidden="true">&nbsp;*</span></label></div><div class="col-sm-12"><div id="jd-reg-pw1-rules" class="small text-muted"><strong><?php esc_html_e( 'Minimum Requirements', 'wp-ja-diner' ); ?></strong> &mdash; <?php esc_html_e( 'Characters: 4', 'wp-ja-diner' ); ?></div><div class="password-group"><div class="input-group"><input type="password" name="jform[password1]" id="jd-reg-pw1" class="form-control js-password-strength validate-password required" aria-describedby="jd-reg-pw1-rules" size="30" maxlength="99" required autocomplete="new-password"><button type="button" class="btn btn-secondary input-password-toggle"><span class="icon-eye icon-fw" aria-hidden="true"></span><span class="visually-hidden"><?php esc_html_e( 'Show Password', 'wp-ja-diner' ); ?></span></button></div><meter min="0" max="100" low="40" high="99" optimum="100" value="0"></meter><div class="text-center jd-strength" aria-live="polite" data-too-short="<?php esc_attr_e( 'Too short', 'wp-ja-diner' ); ?>" data-weak="<?php esc_attr_e( 'Weak', 'wp-ja-diner' ); ?>" data-good="<?php esc_attr_e( 'Good', 'wp-ja-diner' ); ?>" data-strong="<?php esc_attr_e( 'Strong', 'wp-ja-diner' ); ?>"></div></div></div></div><div class="form-group"><div class="col-sm-12 control-label"><label for="jd-reg-pw2" class="required"><?php esc_html_e( 'Confirm Password', 'wp-ja-diner' ); ?><span class="star" aria-hidden="true">&nbsp;*</span></label></div><div class="col-sm-12"><div class="password-group"><div class="input-group"><input type="password" name="jform[password2]" id="jd-reg-pw2" class="form-control validate-password required" size="30" maxlength="99" required autocomplete="new-password"><button type="button" class="btn btn-secondary input-password-toggle"><span class="icon-eye icon-fw" aria-hidden="true"></span><span class="visually-hidden"><?php esc_html_e( 'Show Password', 'wp-ja-diner' ); ?></span></button></div></div></div></div><div class="form-group"><div class="col-sm-12 control-label"><label for="jd-reg-email" class="required"><?php esc_html_e( 'Email Address', 'wp-ja-diner' ); ?><span class="star" aria-hidden="true">&nbsp;*</span></label></div><div class="col-sm-12"><input type="email" inputmode="email" name="jform[email1]" class="form-control validate-email required" id="jd-reg-email" size="30" autocomplete="email" required></div></div></fieldset><div class="form-group form-actions"><div class="col-sm-12"><button type="submit" class="btn btn-primary validate"><?php esc_html_e( 'Register', 'wp-ja-diner' ); ?></button> <a class="btn btn-default cancel" href="<?php echo esc_url( home_url( '/' ) ); ?>" title="<?php esc_attr_e( 'Cancel', 'wp-ja-diner' ); ?>"><?php esc_html_e( 'Cancel', 'wp-ja-diner' ); ?></a></div></div></form></div></div></div></div>
<!-- /wp:html -->
