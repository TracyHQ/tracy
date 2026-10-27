<?php
/**
 * Update checks for a theme that does not live on wordpress.org.
 *
 * The theme is installed from a GitHub release of TracyHQ/claude-cowork, the same place the
 * Cowork plugin comes from. Without this file a site keeps whatever version was installed the day
 * it was built: every design system added later, and every fix to the page layouts, is dead code
 * there. The Appearance screen would also be the one row on the site that never says an update
 * exists.
 *
 * WordPress 6.1 gave themes the door plugins got in 5.8: declare an `Update URI:` header, and
 * WordPress calls `update_themes_<host of that URI>` for THIS theme alone, passing what is
 * installed and asking for anything newer. Nothing else on the site is reachable from here, which
 * is the difference from the old recipe of splicing rows into `pre_set_site_transient_update_themes`.
 *
 * The answer is `wordpress/theme/update.json` in that repository, read raw off the main branch, so
 * cutting a release and announcing it are one commit. A release that should not spread is
 * un-announced by editing one line, without touching a single site.
 *
 * @package tracy
 */

defined( 'ABSPATH' ) || exit;

/** Where the answer comes from. Raw content of the repository's main branch, no infrastructure. */
const TRACY_UPDATE_MANIFEST = 'https://raw.githubusercontent.com/TracyHQ/claude-cowork/main/wordpress/theme/update.json';

/** The theme's directory name, which is also what WordPress passes as the update's stylesheet. */
const TRACY_UPDATE_SLUG = 'tracy';

/**
 * How long an answer is kept. WordPress asks about updates roughly twice a day; the cache is not
 * about saving a request but about the site's admin pages never waiting on somebody else's host.
 */
const TRACY_UPDATE_TTL = 6 * HOUR_IN_SECONDS;

/**
 * The manifest, or null when it cannot be read. Never throws: an update check is not worth a site.
 *
 * @return array<string, mixed>|null
 */
function tracy_update_manifest(): ?array {
	// "Check again" must actually check again: WordPress clears its own cache when a person presses
	// that button, and a theme answering from a six-hour cache of its own makes the button a lie.
	$forced = isset( $_GET['force-check'] ) && '' !== $_GET['force-check']; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
	$cached = $forced ? false : get_site_transient( 'tracy_theme_update' );
	if ( is_array( $cached ) ) {
		return isset( $cached['version'] ) && '' !== $cached['version'] ? $cached : null;
	}

	$response = wp_remote_get( TRACY_UPDATE_MANIFEST, array( 'timeout' => 5 ) );
	if ( is_wp_error( $response ) || 200 !== (int) wp_remote_retrieve_response_code( $response ) ) {
		// Remembered as a miss for a shorter while, so a host that is down does not mean a request
		// on every admin page load until it comes back.
		set_site_transient( 'tracy_theme_update', array( 'version' => '' ), 15 * MINUTE_IN_SECONDS );
		return null;
	}

	$parsed = json_decode( (string) wp_remote_retrieve_body( $response ), true );
	if ( ! is_array( $parsed ) || ! isset( $parsed['version'], $parsed['package'] ) ) {
		return null;
	}

	set_site_transient( 'tracy_theme_update', $parsed, TRACY_UPDATE_TTL );
	return $parsed;
}

/**
 * Answer WordPress's question about THIS theme: is there something newer, and where is it.
 *
 * `$update` is passed through untouched whenever the answer is no — another theme sharing this
 * host is filtered by the same hook, and returning our data for its row is how a site ends up
 * installing the wrong package over the right one.
 *
 * @param array<string, mixed>|false $update      What WordPress has so far.
 * @param array<string, mixed>       $theme_data  The installed theme's headers.
 * @param string                     $theme_stylesheet The theme's directory name.
 * @return array<string, mixed>|false
 */
function tracy_check_update( $update, array $theme_data, string $theme_stylesheet ) {
	if ( TRACY_UPDATE_SLUG !== $theme_stylesheet ) {
		return $update;
	}

	$manifest  = tracy_update_manifest();
	$installed = (string) ( $theme_data['Version'] ?? '' );
	if ( null === $manifest || '' === $installed ) {
		return $update;
	}
	if ( version_compare( (string) $manifest['version'], $installed, '<=' ) ) {
		return $update;
	}

	return array(
		'id'           => 'github.com/TracyHQ/claude-cowork',
		'theme'        => TRACY_UPDATE_SLUG,
		'version'      => (string) $manifest['version'],
		'url'          => (string) ( $manifest['url'] ?? 'https://github.com/TracyHQ/claude-cowork' ),
		'package'      => (string) $manifest['package'],
		'requires'     => (string) ( $manifest['requires'] ?? '' ),
		'requires_php' => (string) ( $manifest['requires_php'] ?? '' ),
	);
}
add_filter( 'update_themes_github.com', 'tracy_check_update', 10, 3 );

/**
 * Take the update WordPress just found, without waiting for somebody to press a button.
 *
 * A site built by Tracy has no administrator watching the Appearance screen, and the pages the
 * customer sees are drawn by this theme's own templates — a site left behind draws its pages with
 * a different set of rules from the one every other Tracy site uses.
 *
 * Two ways out stay open: a site owner who switches automatic updates off for this theme is obeyed
 * (WordPress consults `auto_update_themes` before this filter), and a release that should not
 * spread is removed from update.json.
 *
 * @param bool|null            $update Whether to update.
 * @param object|array<string, mixed> $item   The update offer.
 * @return bool|null
 */
function tracy_auto_update( $update, $item ) {
	$theme = is_object( $item ) ? ( $item->theme ?? '' ) : ( $item['theme'] ?? '' );
	return TRACY_UPDATE_SLUG === $theme ? true : $update;
}
add_filter( 'auto_update_theme', 'tracy_auto_update', 10, 2 );
