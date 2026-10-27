<?php
/**
 * Title: Login form
 * Slug: wp-ja-morgan/account-login
 * Description: The sign-in card of the JA Morgan Login page: username, password, remember me and the three help links. It posts to the WordPress sign-in screen.
 * Categories: wp-ja-morgan, tracy
 * Post Types: page
 * Inserter: yes
 * Keywords: account, form
 *
 * @package wp-ja-morgan
 */
?>
<!-- wp:html {"metadata":{"name":"account.login-form"}} -->
<?php echo function_exists( 'wp_ja_morgan_login_first_notice' ) ? wp_ja_morgan_login_first_notice() : ''; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- escaped where built. ?><div class="login-wrap jm-form"><div class="login"><form action="<?php echo esc_url( site_url( 'wp-login.php', 'login_post' ) ); ?>" method="post" class="form-horizontal"><input type="hidden" name="redirect_to" value="<?php echo esc_url( home_url( '/j-pages/profile/' ) ); ?>"><div class="form-group"><div class="control-label"><label for="jm-username" class="required"><?php esc_html_e( 'Username', 'wp-ja-morgan' ); ?><span class="star" aria-hidden="true">&nbsp;*</span></label></div><div class="jm-control"><input type="text" name="log" id="jm-username" class="form-control" size="25" required autocomplete="username"></div></div><div class="form-group"><div class="control-label"><label for="jm-password" class="required"><?php esc_html_e( 'Password', 'wp-ja-morgan' ); ?><span class="star" aria-hidden="true">&nbsp;*</span></label></div><div class="jm-control"><div class="input-group"><input type="password" name="pwd" id="jm-password" class="form-control" size="25" maxlength="99" required autocomplete="current-password"><button type="button" class="btn btn-secondary input-password-toggle" aria-label="<?php esc_attr_e( 'Show Password', 'wp-ja-morgan' ); ?>"><span class="icon-eye" aria-hidden="true"></span></button></div></div></div><div class="form-group"><div class="jm-control"><div class="checkbox"><label><input id="jm-remember" type="checkbox" name="rememberme" value="forever"> <?php esc_html_e( 'Remember me', 'wp-ja-morgan' ); ?></label></div></div></div><div class="form-group"><div class="jm-control"><button type="submit" class="btn btn-primary btn-block"><?php esc_html_e( 'Log in', 'wp-ja-morgan' ); ?></button></div></div><div class="other-links form-group"><div class="jm-control"><ul><li><a href="<?php echo esc_url( home_url( '/password-reset/' ) ); ?>"><?php esc_html_e( 'Forgot your password?', 'wp-ja-morgan' ); ?></a></li><li><a href="<?php echo esc_url( home_url( '/username-reminder-request/' ) ); ?>"><?php esc_html_e( 'Forgot your username?', 'wp-ja-morgan' ); ?></a></li><li><a href="<?php echo esc_url( home_url( '/j-pages/registration/' ) ); ?>"><?php esc_html_e( "Don't have an account?", 'wp-ja-morgan' ); ?></a></li></ul></div></div></form></div></div>
<!-- /wp:html -->
