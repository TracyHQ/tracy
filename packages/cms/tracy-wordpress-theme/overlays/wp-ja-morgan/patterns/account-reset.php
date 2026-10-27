<?php
/**
 * Title: Password reset form
 * Slug: wp-ja-morgan/account-reset
 * Description: The Password Reset card: one email field. It posts to the WordPress lost-password screen, which mails the reset link.
 * Categories: wp-ja-morgan, tracy
 * Post Types: page
 * Inserter: yes
 * Keywords: account, form
 *
 * @package wp-ja-morgan
 */
?>
<!-- wp:html {"metadata":{"name":"account.reset-form"}} -->
<div class="reset jm-form"><form action="<?php echo esc_url( site_url( 'wp-login.php?action=lostpassword', 'login_post' ) ); ?>" method="post" class="form-horizontal"><fieldset><div class="alert alert-warning"></div><div class="control-group"><div class="control-label"><label for="jm-reset-email" class="required"><?php esc_html_e( 'Email Address', 'wp-ja-morgan' ); ?><span class="star" aria-hidden="true">&nbsp;*</span></label></div><div class="controls"><input type="email" inputmode="email" name="user_login" id="jm-reset-email" class="form-control" size="30" autocomplete="email" required></div></div></fieldset><div class="form-group"><div class="jm-control"><button type="submit" class="btn btn-primary"><?php esc_html_e( 'Submit', 'wp-ja-morgan' ); ?></button></div></div></form></div>
<!-- /wp:html -->
