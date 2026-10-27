<?php
/**
 * Title: Login form
 * Slug: wp-ja-diner/account-login
 * Description: The Login card of the JA Diner source: heading, short description, username, password with a show button, remember me, and the help links. It posts to the WordPress sign-in screen.
 * Categories: wp-ja-diner, tracy
 * Post Types: page
 * Inserter: yes
 * Keywords: account, form
 *
 * @package wp-ja-diner
 */
?>
<!-- wp:html {"metadata":{"name":"account.login-form"}} -->
<div id="t3-mainbody" class="container t3-mainbody"><div class="row"><div id="t3-content" class="jd-content col-xs-12"><?php echo function_exists( 'wp_ja_diner_login_first_notice' ) ? wp_ja_diner_login_first_notice() : ''; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- escaped where built. ?><div class="login-wrap"><div class="login"><div class="page-header"><h1><?php esc_html_e( 'Login', 'wp-ja-diner' ); ?></h1></div><form action="<?php echo esc_url( site_url( 'wp-login.php', 'login_post' ) ); ?>" method="post" class="form-horizontal"><input type="hidden" name="redirect_to" value="<?php echo esc_url( home_url( '/' ) ); ?>"><fieldset><div class="form-group"><div class="col-sm-12 control-label"><label for="jd-username" class="required"><?php esc_html_e( 'Username', 'wp-ja-diner' ); ?><span class="star" aria-hidden="true">&nbsp;*</span></label></div><div class="col-sm-12"><input type="text" name="log" id="jd-username" class="form-control validate-username required" size="25" required autocomplete="username"></div></div><div class="form-group"><div class="col-sm-12 control-label"><label for="jd-password" class="required"><?php esc_html_e( 'Password', 'wp-ja-diner' ); ?><span class="star" aria-hidden="true">&nbsp;*</span></label></div><div class="col-sm-12"><div class="password-group"><div class="input-group"><input type="password" name="pwd" id="jd-password" class="form-control required" size="25" maxlength="99" required autocomplete="current-password"><button type="button" class="btn btn-secondary input-password-toggle"><span class="icon-eye icon-fw" aria-hidden="true"></span><span class="visually-hidden"><?php esc_html_e( 'Show Password', 'wp-ja-diner' ); ?></span></button></div></div></div></div><div class="form-group"><div class="col-sm-12"><div class="checkbox"><label><input id="jd-remember" type="checkbox" name="rememberme" value="forever"> <?php esc_html_e( 'Remember me', 'wp-ja-diner' ); ?></label></div></div></div><div class="form-group"><div class="col-sm-12"><button type="submit" class="btn btn-primary"><?php esc_html_e( 'Log in', 'wp-ja-diner' ); ?></button></div></div></fieldset><div class="other-links form-group"><div class="col-sm-12"><ul><li><a href="<?php echo esc_url( home_url( '/password-reset/' ) ); ?>"><?php esc_html_e( 'Forgot your password?', 'wp-ja-diner' ); ?></a></li><li><a href="<?php echo esc_url( home_url( '/username-reminder-request/' ) ); ?>"><?php esc_html_e( 'Forgot your username?', 'wp-ja-diner' ); ?></a></li><li><a href="<?php echo esc_url( home_url( '/j-pages/registration/' ) ); ?>"><?php esc_html_e( "Don't have an account?", 'wp-ja-diner' ); ?></a></li></ul></div></div></form></div></div></div></div></div>
<!-- /wp:html -->
