<?php
/**
 * A theme stylesheet's address changes when its bytes do.
 *
 * WHY (stage 6 acceptance v5, R05, 30/09/2026). Every stylesheet of this theme was enqueued with the
 * theme's version as `ver` (`sections.css?ver=1.1.2`), which moves only with a theme release. A look
 * change rewrites such a file in place, and the server sends it with `Last-Modified` and no
 * `Cache-Control`, so a browser that has seen the page keeps the old copy "fresh" by its own
 * estimate: the sender watched the old size for ~10 minutes after Tracy said done, and a visitor
 * who came by earlier keeps the old look for as long. With the file's modification time in `ver`,
 * the address the page names is a new one the moment the file is rewritten — an undo that puts the
 * old bytes back included — and no cache holds anything under it.
 *
 * ONE FILTER, NOT ONE ARGUMENT PER CALL. `style_loader_src` sees every stylesheet address WordPress
 * prints, so the theme's own sheets, a target's overlay sheets (`inc/extra.php`) and any sheet added
 * later all get it without each `wp_enqueue_style` call having to remember. It touches only an
 * address inside the active theme (or its parent) that names a file on disk; a core, plugin or
 * external sheet passes through untouched.
 *
 * @package tracy
 */

defined( 'ABSPATH' ) || exit;

/**
 * `$src` with the named file's modification time appended to its `ver` (`1.1.2` → `1.1.2-<mtime>`,
 * none → `<mtime>`), when it is a file of the active theme or its parent; otherwise `$src` as given.
 *
 * @param mixed $src A stylesheet address as WordPress built it, `ver` already on it.
 * @return mixed
 */
function tracy_style_src_version( $src ) {
	if ( ! is_string( $src ) || '' === $src ) {
		return $src;
	}
	$roots = array(
		get_stylesheet_directory_uri() => get_stylesheet_directory(),
		get_template_directory_uri()   => get_template_directory(),
	);
	foreach ( $roots as $uri => $dir ) {
		$prefix = rtrim( (string) $uri, '/' ) . '/';
		if ( ! str_starts_with( $src, $prefix ) ) {
			continue;
		}
		$rel = rawurldecode( (string) strtok( substr( $src, strlen( $prefix ) ), '?#' ) );
		if ( '' === $rel || str_contains( $rel, '..' ) ) {
			return $src;
		}
		$file  = rtrim( (string) $dir, '/' ) . '/' . $rel;
		$mtime = is_file( $file ) ? filemtime( $file ) : false;
		if ( false === $mtime ) {
			return $src;
		}
		parse_str( (string) wp_parse_url( $src, PHP_URL_QUERY ), $query );
		$ver = isset( $query['ver'] ) && is_string( $query['ver'] ) && '' !== $query['ver'] ? $query['ver'] . '-' . $mtime : (string) $mtime;
		return add_query_arg( 'ver', $ver, $src );
	}
	return $src;
}

add_filter( 'style_loader_src', 'tracy_style_src_version' );
