<?php
/**
 * The editors see plain colours where the theme reads a design-system role.
 *
 * WHY. A target that reads the standard role variables (`theme.config.json` `roleReads`, see
 * lib/role-reads.mjs) ships palette entries like `var(--ds-c-bg, #f5f3ee)`: the front end resolves
 * them to the template's own colour until a design system is worn, and to the system's once one is.
 * WordPress prints the value into `--wp--preset--color--<slug>` untouched, but its editors also parse
 * the raw string with colord (measured in WordPress 7, wp-includes/js/dist/components.js): the swatch
 * check mark's contrast in `SinglePalette`, and the colour picker that opens on a palette entry in
 * Site Editor › Styles › Colors (`PaletteEdit` hands `element.color` straight to the picker). A
 * `var()` there is not a colour to colord, so the picker opened on black and the check mark lost its
 * contrast. In the admin and in REST requests (the Site Editor reads the theme's palette over REST)
 * the theme's palette is handed over with each role read replaced by its fallback, the template's
 * own colour; the front end keeps the role read.
 *
 * Only `var(--ds-…, <colour>)` is unwrapped; any other value passes through untouched, so a theme
 * without role reads is not changed by this file.
 *
 * @package tracy
 */

defined( 'ABSPATH' ) || exit;

/**
 * A colour value with its role read replaced by the fallback: `var(--ds-c-bg, #f5f3ee)` → `#f5f3ee`.
 * Anything else is returned as given.
 *
 * @param mixed $value A palette entry's colour.
 * @return mixed
 */
function tracy_role_read_fallback( $value ) {
	if ( ! is_string( $value ) ) {
		return $value;
	}
	// A fallback may itself be a role read: unwrap until the template's own value is left.
	while ( preg_match( '/^\s*var\(\s*--ds-[a-z0-9-]+\s*,\s*(.+?)\s*\)\s*$/s', $value, $m ) ) {
		$value = $m[1];
	}
	return $value;
}

/**
 * A theme.json palette (a list of `{ slug, name, color }`) with every role read unwrapped.
 *
 * @param array $palette
 * @return array
 */
function tracy_editor_palette( array $palette ): array {
	foreach ( $palette as $i => $entry ) {
		if ( is_array( $entry ) && isset( $entry['color'] ) ) {
			$palette[ $i ]['color'] = tracy_role_read_fallback( $entry['color'] );
		}
	}
	return $palette;
}

/**
 * The theme's theme.json data as the editors get it: in the admin and over REST, the palette with
 * its role reads unwrapped; on the front end, unchanged.
 *
 * @param WP_Theme_JSON_Data $theme_json
 * @return WP_Theme_JSON_Data
 */
function tracy_editor_theme_json( $theme_json ) {
	$editor = is_admin() || ( defined( 'REST_REQUEST' ) && REST_REQUEST );
	if ( ! $editor || ! is_object( $theme_json ) || ! method_exists( $theme_json, 'get_data' ) ) {
		return $theme_json;
	}
	$data    = $theme_json->get_data();
	$palette = $data['settings']['color']['palette'] ?? null;
	// WP_Theme_JSON keeps presets under their origin (`palette.theme`); a plain list is accepted too.
	if ( is_array( $palette ) && isset( $palette['theme'] ) ) {
		$palette = $palette['theme'];
	}
	if ( ! is_array( $palette ) ) {
		return $theme_json;
	}
	$plain = tracy_editor_palette( $palette );
	if ( $plain === $palette ) {
		return $theme_json;
	}
	return $theme_json->update_with(
		array(
			'version'  => $data['version'] ?? 3,
			'settings' => array( 'color' => array( 'palette' => $plain ) ),
		)
	);
}

if ( function_exists( 'add_filter' ) ) {
	add_filter( 'wp_theme_json_data_theme', 'tracy_editor_theme_json' );
}
