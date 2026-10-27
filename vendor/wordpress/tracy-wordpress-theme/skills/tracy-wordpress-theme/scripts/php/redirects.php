<?php
/**
 * Plugin Name: Tracy redirects
 * Description: Serves the redirect rules the Tracy seeder writes (the option named by tracy_redirects_option, a JSON list of { from, to, status }) when WordPress would answer 404 for the path — the source's old routes. Installed by the Tracy seeder (scripts/seed.mjs), because a theme that does not hook template_redirect left the rules unserved.
 *
 * Only a request that is a 404 is redirected: a page or post that answers at the path keeps it. The
 * path is compared without a trailing slash and without case, query strings are ignored, and only the
 * statuses 301, 302, 307 and 308 are used (else 301). A rule without a from or a to is skipped.
 */

if ( ! function_exists( 'tracy_redirects_serve' ) ) {
	function tracy_redirects_serve() {
		if ( ! is_404() ) {
			return;
		}
		$name = get_option( 'tracy_redirects_option' );
		if ( ! is_string( $name ) || ! preg_match( '/^[a-z0-9_]+$/i', $name ) ) {
			return;
		}
		$rules = get_option( $name );
		if ( is_string( $rules ) ) {
			$rules = json_decode( $rules, true );
		}
		if ( ! is_array( $rules ) ) {
			return;
		}
		$norm = function ( $path ) {
			$path = (string) wp_parse_url( (string) $path, PHP_URL_PATH );
			$path = untrailingslashit( '/' . ltrim( strtolower( rawurldecode( $path ) ), '/' ) );
			return '' === $path ? '/' : $path;
		};
		// phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- only the path is read, and it is normalised.
		$here = $norm( isset( $_SERVER['REQUEST_URI'] ) ? wp_unslash( $_SERVER['REQUEST_URI'] ) : '/' );
		$home = $norm( home_url( '/' ) );
		if ( '/' !== $home && 0 === strpos( $here, $home . '/' ) ) {
			$here = substr( $here, strlen( $home ) );
		}
		foreach ( $rules as $rule ) {
			if ( ! is_array( $rule ) || empty( $rule['from'] ) || empty( $rule['to'] ) || ! is_string( $rule['from'] ) || ! is_string( $rule['to'] ) ) {
				continue;
			}
			if ( $norm( $rule['from'] ) !== $here ) {
				continue;
			}
			$status = isset( $rule['status'] ) ? (int) $rule['status'] : 301;
			if ( ! in_array( $status, array( 301, 302, 307, 308 ), true ) ) {
				$status = 301;
			}
			$to = $rule['to'];
			if ( 0 === strpos( $to, '/' ) && 0 !== strpos( $to, '//' ) ) {
				$to = home_url( $to );
			}
			wp_redirect( esc_url_raw( $to ), $status ); // phpcs:ignore WordPress.Security.SafeRedirect -- the rules are the seeder's own.
			exit;
		}
	}
	add_action( 'template_redirect', 'tracy_redirects_serve', 9 );
}
