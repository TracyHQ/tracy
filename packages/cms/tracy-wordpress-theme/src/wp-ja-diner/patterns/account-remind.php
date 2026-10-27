<?php
/**
 * Title: Username reminder form
 * Slug: wp-ja-diner/account-remind
 * Description: The Username Reminder Request card of the JA Diner source: an explanation and one email field. It posts to a theme handler that emails the username.
 * Categories: wp-ja-diner, tracy
 * Post Types: page
 * Inserter: yes
 * Keywords: account, form
 *
 * @package wp-ja-diner
 */
$jm_notice = function_exists( 'wp_ja_diner_form_notice' ) ? wp_ja_diner_form_notice(
	array(
		'ok'           => __( 'If that address belongs to an account, your username has been emailed to it.', 'wp-ja-diner' ),
		'error-token'  => __( 'The form expired. Please try again.', 'wp-ja-diner' ),
		'error-fields' => __( 'Please enter a valid email address.', 'wp-ja-diner' ),
	)
) : '';
?>
<!-- wp:html {"metadata":{"name":"account.remind-form"}} -->
<div id="t3-mainbody" class="container t3-mainbody"><div class="row"><div id="t3-content" class="jd-content col-xs-12"><?php echo $jm_notice; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- escaped by wp_ja_diner_form_notice(). ?><div class="remind"><form id="user-registration" class="form-inline" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" method="post"><input type="hidden" name="action" value="jm_remind"><input type="hidden" name="jm_nonce" value="<?php echo esc_attr( wp_create_nonce( 'jm_remind' ) ); ?>"><div class="alert alert-warning"><?php esc_html_e( 'Please enter the email address associated with your User account. Your username will be emailed to the email address on file.', 'wp-ja-diner' ); ?></div><div class="form-group "><div class="col-sm-12 control-label"><label for="jd-remind-email" class="required"><?php esc_html_e( 'Email Address', 'wp-ja-diner' ); ?><span class="star" aria-hidden="true">&nbsp;*</span></label></div><div class="col-sm-12"><input type="email" inputmode="email" name="email" class="form-control validate-email required" id="jd-remind-email" size="30" autocomplete="email" required></div></div><div class="form-group"><div class="col-sm-12"><button type="submit" class="btn btn-primary validate"><?php esc_html_e( 'Submit', 'wp-ja-diner' ); ?></button></div></div></form></div></div></div></div>
<!-- /wp:html -->
