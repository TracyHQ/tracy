<?php
/**
 * Content pages: Joomla's article text kept verbatim, and the Login module of the blog sidebar.
 *
 * @package wp-ja-restaurant
 */

/**
 * Straight quotes and dashes, as the source prints them. Joomla stores and prints article text
 * verbatim; WordPress would turn every quote into a curly one and every " - " into an en dash, so the
 * same sentence would read differently on the two sites.
 */
add_filter( 'run_wptexturize', '__return_false' );

/**
 * The Login module is assigned to every sidebar of the source except the one of the tag list.
 *
 * @param string $content The rendered group block.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_restaurant_b_login_module( string $content, array $block ): string {
	$class = (string) ( $block['attrs']['className'] ?? '' );
	if ( false === strpos( $class, 'jm-login' ) ) {
		return $content;
	}
	if ( is_page() && 'list-of-all-tags' === get_post_field( 'post_name', get_queried_object_id() ) ) {
		return '';
	}
	// The source's two fields show "Username" and "Password" inside the empty box; WordPress prints them bare (the labels stay for screen readers).
	$content = preg_replace( '/(<input\b[^>]*\bid="user_login")/', '$1 placeholder="' . esc_attr__( 'Username', 'wp-ja-restaurant' ) . '"', $content, 1 ) ?? $content;
	return preg_replace( '/(<input\b[^>]*\bid="user_pass")/', '$1 placeholder="' . esc_attr__( 'Password', 'wp-ja-restaurant' ) . '"', $content, 1 ) ?? $content;
}
add_filter( 'render_block_core/group', 'wp_ja_restaurant_b_login_module', 10, 2 );

/**
 * The three links the source's Login module prints under the button (create an account, forgot the username, forgot the password)
 * sit inside the form, as the source's do, so the form box and the link row are one thing.
 *
 * @param string               $bottom The markup after the submit row.
 * @param array<string, mixed> $args   The form arguments.
 * @return string
 */
function wp_ja_restaurant_login_links( string $bottom, array $args ): string {
	if ( 'loginform' !== ( $args['form_id'] ?? '' ) ) {
		return $bottom;
	}
	// With registration closed the link would lead to a dead end, so it is not printed (as the list-item filter of the account group did).
	$create = get_option( 'users_can_register' ) ? '<li><a href="' . esc_url( home_url( '/explore/j-pages/registration/' ) ) . '">' . esc_html__( 'Create an account', 'wp-ja-restaurant' ) . '</a></li>' : '';
	return $bottom . '<ul class="wp-block-list unstyled">' . $create
		. '<li><a href="' . esc_url( home_url( '/explore/j-pages/reminder/' ) ) . '">' . esc_html__( 'Forgot your username?', 'wp-ja-restaurant' ) . '</a></li>'
		. '<li><a href="' . esc_url( home_url( '/explore/j-pages/reset-password/' ) ) . '">' . esc_html__( 'Forgot your password?', 'wp-ja-restaurant' ) . '</a></li></ul>';
}
add_filter( 'login_form_bottom', 'wp_ja_restaurant_login_links', 10, 2 );

/**
 * The source's log-in button reads "Log in"; WordPress capitalises it ("Log In").
 *
 * @param array<string, mixed> $defaults The login form defaults.
 * @return array<string, mixed>
 */
function wp_ja_restaurant_login_label( array $defaults ): array {
	$defaults['label_log_in'] = __( 'Log in', 'wp-ja-restaurant' );
	return $defaults;
}
add_filter( 'login_form_defaults', 'wp_ja_restaurant_login_label' );
