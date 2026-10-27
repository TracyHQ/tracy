<?php
/**
 * Runs inc/brand-logo.php of a built theme against just enough WordPress: options, attachments,
 * hooks, and a stand-in for core's `render_block_core_site_logo` that draws the attachment the
 * `site_logo` option names (after its `pre_option_site_logo` filters), the way core does.
 *
 * Input (JSON on stdin): theme (directory of the built theme), name (blogname), options (name =>
 * value), images (attachment ids that are images), render (list of { block } — a Site Logo block's
 * attributes — or { paragraph }).
 * Output (JSON on stdout): each rendered string, in order; a Site Logo block adds a second entry, what
 * `site_logo` reads after it was drawn.
 */

$GLOBALS['fake'] = json_decode( stream_get_contents( STDIN ), true );
$GLOBALS['hooks'] = array();

function add_filter( $name, $callback, $priority = 10, $args = 1 ) {
	$GLOBALS['hooks'][ $name ][ $priority ][] = array( $callback, $args );
	return true;
}
function add_action( $name, $callback, $priority = 10, $args = 1 ) {
	return add_filter( $name, $callback, $priority, $args );
}
function remove_filter( $name, $callback, $priority = 10 ) {
	foreach ( $GLOBALS['hooks'][ $name ][ $priority ] ?? array() as $i => $hook ) {
		if ( $hook[0] === $callback ) {
			unset( $GLOBALS['hooks'][ $name ][ $priority ][ $i ] );
		}
	}
	return true;
}
function apply_filters( $name, $value, ...$rest ) {
	$byPriority = $GLOBALS['hooks'][ $name ] ?? array();
	ksort( $byPriority );
	foreach ( $byPriority as $hooks ) {
		foreach ( $hooks as $hook ) {
			$value = $hook[0]( ...array_slice( array_merge( array( $value ), $rest ), 0, $hook[1] ) );
		}
	}
	return $value;
}
function get_option( $name, $fallback = false ) {
	$pre = apply_filters( "pre_option_$name", false );
	if ( false !== $pre ) {
		return $pre;
	}
	return array_key_exists( $name, $GLOBALS['fake']['options'] ?? array() ) ? $GLOBALS['fake']['options'][ $name ] : $fallback;
}
function wp_attachment_is_image( $id ) {
	return in_array( (int) $id, $GLOBALS['fake']['images'] ?? array(), true );
}
function get_bloginfo( $what = '' ) {
	return $GLOBALS['fake']['name'] ?? '';
}
function home_url( $path = '' ) {
	return 'https://example.test' . $path;
}
function wp_date( $format ) {
	return '2031';
}
function esc_html( $text ) {
	return htmlspecialchars( (string) $text, ENT_QUOTES );
}
function esc_attr( $text ) {
	return htmlspecialchars( (string) $text, ENT_QUOTES );
}
function esc_url( $url ) {
	return (string) $url;
}
/** Core's Site Logo, reduced to what decides its output: the attachment `site_logo` names, or nothing. */
function render_block_core_site_logo( $attributes ) {
	$id = (int) get_option( 'site_logo', 0 );
	if ( $id <= 0 ) {
		return '';
	}
	return '<div class="wp-block-site-logo ' . esc_attr( $attributes['className'] ?? '' ) . '"><a href="https://example.test/" class="custom-logo-link" rel="home"><img class="custom-logo" data-attachment="' . $id . '" /></a></div>';
}

require $GLOBALS['fake']['theme'] . '/inc/brand-logo.php';

$out = array();
foreach ( $GLOBALS['fake']['render'] as $item ) {
	if ( isset( $item['paragraph'] ) ) {
		$out[] = apply_filters( 'render_block_core/paragraph', $item['paragraph'], array( 'blockName' => 'core/paragraph', 'attrs' => array() ) );
		continue;
	}
	// core's order: render_block_data, the block's own renderer, then its render filters
	$block   = apply_filters( 'render_block_data', array( 'blockName' => 'core/site-logo', 'attrs' => $item['block'] ) );
	$content = render_block_core_site_logo( $block['attrs'] );
	$content = apply_filters( 'render_block', $content, $block );
	$out[]   = apply_filters( 'render_block_core/site-logo', $content, $block );
	// what a later block reads as site_logo: the swap must not outlive the block
	$out[]   = (string) get_option( 'site_logo', '' );
}
echo json_encode( $out );
