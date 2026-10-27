<?php
/**
 * Title: Password reset form
 * Slug: wp-ja-restaurant/account-reset
 * Description: The Password Reset card of the JA Restaurant source: an explanation and one email field. It posts to the WordPress lost-password screen, which mails the reset link.
 * Categories: wp-ja-restaurant, tracy
 * Post Types: page
 * Inserter: yes
 * Keywords: account, form
 *
 * @package wp-ja-restaurant
 */
?>
<!-- wp:html {"metadata":{"name":"account.reset-form"}} -->
<div id="t3-mainbody" class="container t3-mainbody"><div class="row"><div id="t3-content" class="jr-content col-xs-12"><div class="reset"><form id="user-registration" action="<?php echo esc_url( site_url( 'wp-login.php?action=lostpassword', 'login_post' ) ); ?>" method="post" class="form-validate form-horizontal"><fieldset><p><?php esc_html_e( 'Please enter the email address for your account. A verification code will be sent to you. Once you have received the verification code, you will be able to choose a new password for your account.', 'wp-ja-restaurant' ); ?></p><div class="control-group"><div class="control-label"><label for="jr-reset-email" class="required"><?php esc_html_e( 'Email Address', 'wp-ja-restaurant' ); ?><span class="star" aria-hidden="true">&nbsp;*</span></label></div><div class="controls"><input type="email" inputmode="email" name="user_login" class="form-control required" id="jr-reset-email" size="30" autocomplete="email" required></div></div></fieldset><div class="control-group"><div class="controls"><button type="submit" class="btn btn-primary validate"><?php esc_html_e( 'Submit', 'wp-ja-restaurant' ); ?></button></div></div></form></div></div></div></div>
<!-- /wp:html -->
