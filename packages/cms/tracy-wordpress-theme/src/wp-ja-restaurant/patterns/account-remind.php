<?php
/**
 * Title: Username reminder form
 * Slug: wp-ja-restaurant/account-remind
 * Description: The Username Reminder Request card of the JA Restaurant source: an explanation and one email field. It posts to a theme handler that emails the username.
 * Categories: wp-ja-restaurant, tracy
 * Post Types: page
 * Inserter: yes
 * Keywords: account, form
 *
 * @package wp-ja-restaurant
 */
$jm_notice = function_exists( 'wp_ja_restaurant_form_notice' ) ? wp_ja_restaurant_form_notice(
	array(
		'ok'           => __( 'If that address belongs to an account, your username has been emailed to it.', 'wp-ja-restaurant' ),
		'error-token'  => __( 'The form expired. Please try again.', 'wp-ja-restaurant' ),
		'error-fields' => __( 'Please enter a valid email address.', 'wp-ja-restaurant' ),
	)
) : '';
?>
<!-- wp:html {"metadata":{"name":"account.remind-form"}} -->
<div id="t3-mainbody" class="container t3-mainbody"><div class="row"><div id="t3-content" class="jr-content col-xs-12"><?php echo $jm_notice; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- escaped by wp_ja_restaurant_form_notice(). ?><div class="remind"><form id="user-registration" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" method="post" class="form-validate form-horizontal"><input type="hidden" name="action" value="jm_remind"><input type="hidden" name="jm_nonce" value="<?php echo esc_attr( wp_create_nonce( 'jm_remind' ) ); ?>"><fieldset><p><?php esc_html_e( 'Please enter the email address associated with your User account. Your username will be emailed to the email address on file.', 'wp-ja-restaurant' ); ?></p><div class="control-group"><div class="control-label"><label for="jr-remind-email" class="required"><?php esc_html_e( 'Email Address', 'wp-ja-restaurant' ); ?><span class="star" aria-hidden="true">&nbsp;*</span></label></div><div class="controls"><input type="email" inputmode="email" name="email" class="form-control required" id="jr-remind-email" size="30" autocomplete="email" required></div></div></fieldset><div class="control-group"><div class="controls"><button type="submit" class="btn btn-primary validate"><?php esc_html_e( 'Submit', 'wp-ja-restaurant' ); ?></button></div></div></form></div></div></div></div>
<!-- /wp:html -->
