<?php
/**
 * Title: Username reminder form
 * Slug: wp-ja-morgan/account-remind
 * Description: The Username Reminder Request card: an explanation and one email field. It posts to a theme handler that emails the username.
 * Categories: wp-ja-morgan, tracy
 * Post Types: page
 * Inserter: yes
 * Keywords: account, form
 *
 * @package wp-ja-morgan
 */

$jm_notice = function_exists( 'wp_ja_morgan_form_notice' ) ? wp_ja_morgan_form_notice(
	array(
		'ok'           => __( 'If that address belongs to an account, your username has been emailed to it.', 'wp-ja-morgan' ),
		'error-token'  => __( 'The form expired. Please try again.', 'wp-ja-morgan' ),
		'error-fields' => __( 'Please enter a valid email address.', 'wp-ja-morgan' ),
	)
) : '';
?>
<!-- wp:html {"metadata":{"name":"account.remind-form"}} -->
<div class="remind jm-form"><?php echo $jm_notice; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- escaped by wp_ja_morgan_form_notice(). ?><form action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" method="post" class="form-horizontal"><input type="hidden" name="action" value="jm_remind"><input type="hidden" name="jm_nonce" value="<?php echo esc_attr( wp_create_nonce( 'jm_remind' ) ); ?>"><fieldset><div class="alert alert-warning"><?php esc_html_e( 'Please enter the email address associated with your User account. Your username will be emailed to the email address on file.', 'wp-ja-morgan' ); ?></div><div class="control-group"><div class="control-label"><label for="jm-remind-email" class="required"><?php esc_html_e( 'Email Address', 'wp-ja-morgan' ); ?><span class="star" aria-hidden="true">&nbsp;*</span></label></div><div class="controls"><input type="email" inputmode="email" name="email" id="jm-remind-email" class="form-control" size="30" autocomplete="email" required></div></div></fieldset><div class="form-group"><div class="jm-control"><button type="submit" class="btn btn-primary"><?php esc_html_e( 'Submit', 'wp-ja-morgan' ); ?></button></div></div></form></div>
<!-- /wp:html -->
