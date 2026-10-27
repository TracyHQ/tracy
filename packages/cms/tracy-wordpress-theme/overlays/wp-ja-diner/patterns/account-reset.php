<?php
/**
 * Title: Password reset form
 * Slug: wp-ja-diner/account-reset
 * Description: The Password Reset card of the JA Diner source: an explanation and one email field. It posts to the WordPress lost-password screen, which mails the reset link.
 * Categories: wp-ja-diner, tracy
 * Post Types: page
 * Inserter: yes
 * Keywords: account, form
 *
 * @package wp-ja-diner
 */
?>
<!-- wp:html {"metadata":{"name":"account.reset-form"}} -->
<div id="t3-mainbody" class="container t3-mainbody"><div class="row"><div id="t3-content" class="jd-content col-xs-12"><div class="reset"><form id="user-registration" class="form-inline" action="<?php echo esc_url( site_url( 'wp-login.php?action=lostpassword', 'login_post' ) ); ?>" method="post"><div class="alert alert-warning"><?php esc_html_e( 'Please enter the email address for your account. A verification code will be sent to you. Once you have received the verification code, you will be able to choose a new password for your account.', 'wp-ja-diner' ); ?></div><div class="form-group "><div class="col-sm-12 control-label"><label for="jd-reset-email" class="required"><?php esc_html_e( 'Email Address', 'wp-ja-diner' ); ?><span class="star" aria-hidden="true">&nbsp;*</span></label></div><div class="col-sm-12"><input type="email" inputmode="email" name="user_login" class="form-control validate-email required" id="jd-reset-email" size="30" autocomplete="email" required></div></div><div class="form-group"><div class="col-sm-12"><button type="submit" class="btn btn-primary validate"><?php esc_html_e( 'Submit', 'wp-ja-diner' ); ?></button></div></div></form></div></div></div></div>
<!-- /wp:html -->
