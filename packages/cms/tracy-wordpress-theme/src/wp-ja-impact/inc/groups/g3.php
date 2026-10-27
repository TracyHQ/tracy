<?php
/**
 * wp-ja-impact, group g3: the article lists of the home page (funds slider, events, latest news) and the
 * related posts of a post. The patterns draw each list as a Query Loop; this file resolves what a pattern
 * cannot know (a category's id, the current post's relatives) and prints the post meta the cards show
 * (the Joomla extra fields raise / goal / location / start-date / event-*), so card text is data.
 *
 * @package wp-ja-impact
 */

defined( 'ABSPATH' ) || exit;

/**
 * The queries the g3 patterns name, resolved at render time. A pattern cannot know a category's id (the
 * seeder creates it), so it names the category by slug in its query (`wpJaImpactCategory`, with its
 * sub-categories, as the source's module does with "show child category articles"); the related posts
 * of a post are `wpJaImpactRelated`. A tax query the owner sets in the editor wins over the slug.
 *
 * @param array    $query The WP_Query arguments the block built.
 * @param WP_Block $block The post template block.
 * @return array
 */
function wp_ja_impact_g3_query_vars( array $query, WP_Block $block ): array {
	$ctx = $block->context['query'] ?? array();
	if ( ! empty( $ctx['wpJaImpactCategory'] ) && empty( $ctx['taxQuery'] ) ) {
		$term               = get_term_by( 'slug', sanitize_title( (string) $ctx['wpJaImpactCategory'] ), 'category' );
		$query['tax_query'] = array(
			array(
				'taxonomy'         => 'category',
				'field'            => 'term_id',
				'terms'            => $term ? array( (int) $term->term_id ) : array( 0 ),
				'include_children' => true,
			),
		);
		// The source's lists order by their own rule; featured (sticky) posts are not put first.
		if ( empty( $ctx['sticky'] ) ) {
			$query['ignore_sticky_posts'] = true;
		}
	}
	if ( ! empty( $ctx['wpJaImpactRelated'] ) ) {
		$query['post__in']            = wp_ja_impact_g3_related_ids( (int) get_queried_object_id() );
		$query['orderby']             = 'post__in';
		$query['ignore_sticky_posts'] = true;
		unset( $query['order'] );
	}
	return $query;
}
add_filter( 'query_loop_block_query_vars', 'wp_ja_impact_g3_query_vars', 10, 2 );

/**
 * The posts related to one post: the other posts of its categories, oldest first (the source's module
 * lists the articles sharing a meta keyword — the keywords are not part of the spec, and the keyword of
 * every article is its category's name). No category, no list: never every post.
 *
 * @param int $post_id The current post.
 * @return int[] Post ids, never empty (a 0 matches nothing).
 */
function wp_ja_impact_g3_related_ids( int $post_id ): array {
	if ( ! $post_id ) {
		return array( 0 );
	}
	$terms = wp_get_post_categories( $post_id );
	if ( ! $terms ) {
		return array( 0 );
	}
	$ids = get_posts(
		array(
			'post_type'           => 'post',
			'post_status'         => 'publish',
			'numberposts'         => 3,
			'category__in'        => $terms,
			'post__not_in'        => array( $post_id ),
			'orderby'             => 'date',
			'order'               => 'ASC',
			'fields'              => 'ids',
			'ignore_sticky_posts' => true,
		)
	);
	return $ids ? array_map( 'intval', $ids ) : array( 0 );
}

/**
 * The number a Joomla extra field holds ("4,500" → 4500.0).
 *
 * @param string $value The stored text.
 */
function wp_ja_impact_g3_number( string $value ): float {
	return (float) str_replace( array( ',', '.' ), '', $value );
}

/**
 * The percentage of the goal raised, one decimal as the source prints it (50, 66.7).
 *
 * @param int $post_id The donation post.
 */
function wp_ja_impact_g3_percent( int $post_id ): float {
	$raise = wp_ja_impact_g3_number( (string) get_post_meta( $post_id, 'raise', true ) );
	$goal  = wp_ja_impact_g3_number( (string) get_post_meta( $post_id, 'goal', true ) );
	return ( $raise > 0 && $goal > 0 ) ? round( $raise / $goal * 100, 1 ) : 0.0;
}

/**
 * The block bindings source of the g3 cards: one value of the current post, formatted as the source's
 * layout prints it. The raw meta stays in the post meta fields; the card text is never typed.
 *
 * @param array    $args  The binding's arguments: `field`.
 * @param WP_Block $block The bound block (its postId context).
 * @return string|null
 */
function wp_ja_impact_g3_binding( array $args, $block ) {
	$post_id = (int) ( $block->context['postId'] ?? 0 );
	$field   = (string) ( $args['field'] ?? '' );
	if ( ! $post_id || '' === $field ) {
		return null;
	}
	$meta = static fn( string $key ): string => trim( (string) get_post_meta( $post_id, $key, true ) );
	switch ( $field ) {
		case 'raise':
		case 'goal':
			return '' === $meta( $field ) ? '' : '$' . $meta( $field );
		case 'percent':
			return wp_ja_impact_g3_percent( $post_id ) . '%';
		case 'created':
			$time = strtotime( $meta( 'created-date' ) );
			return $time ? wp_date( (string) get_option( 'date_format' ), $time, new DateTimeZone( 'UTC' ) ) : get_the_date( '', $post_id );
		case 'event-day':
		case 'event-month':
			$time = strtotime( $meta( 'start-date' ) );
			if ( ! $time ) {
				return '';
			}
			return 'event-day' === $field ? gmdate( 'd', $time ) : wp_date( 'F', $time, new DateTimeZone( 'UTC' ) );
		case 'event-location':
			/* translators: the label before an event's place. */
			return '' === $meta( 'event-location' ) ? '' : __( 'Location:', 'wp-ja-impact' ) . ' ' . $meta( 'event-location' );
		case 'event-link':
			// The source keeps a Joomla route (`index.php/pages/user/registration-form`).
			$path = preg_replace( '#^/?index\.php/?#', '', $meta( 'btn-redirect-link' ) );
			return '' === $path ? home_url( '/' ) : home_url( '/' . trim( (string) $path, '/' ) . '/' );
	}
	return null;
}

/** Registers the bindings source. */
function wp_ja_impact_g3_register_bindings(): void {
	if ( ! function_exists( 'register_block_bindings_source' ) ) {
		return;
	}
	register_block_bindings_source(
		'wp-ja-impact/post',
		array(
			'label'              => __( 'Post field (JA Impact)', 'wp-ja-impact' ),
			'get_value_callback' => 'wp_ja_impact_g3_binding',
			'uses_context'       => array( 'postId' ),
		)
	);
}
add_action( 'init', 'wp_ja_impact_g3_register_bindings' );

/**
 * The state a card shows that its markup cannot: the progress of a donation (a width), and on an event
 * card its colours, its image and the highlighted one (the source's `bg-content`, `bg-startdate`,
 * `btn-type` fields and the second card with a picture).
 *
 * @param string   $content The block's HTML.
 * @param array    $block   The parsed block.
 * @param WP_Block $instance The block instance (its context).
 * @return string
 */
function wp_ja_impact_g3_group_state( string $content, array $block, $instance ): string {
	$class = (string) ( $block['attrs']['className'] ?? '' );
	if ( '' === $class || false === strpos( $class, 'jim-' ) ) {
		return $content;
	}
	$post_id = (int) ( $instance->context['postId'] ?? 0 );
	if ( ! $post_id ) {
		return $content;
	}
	$tokens = preg_split( '/\s+/', $class );
	$add    = array();
	$style  = '';
	if ( in_array( 'jim-fund__fill', $tokens, true ) ) {
		$style = 'width:' . wp_ja_impact_g3_percent( $post_id ) . '%';
	}
	if ( in_array( 'jim-fund__pct', $tokens, true ) ) {
		$style = 'right:calc(100% - ' . wp_ja_impact_g3_percent( $post_id ) . '%)';
	}
	if ( in_array( 'jim-evt', $tokens, true ) ) {
		static $seen = array();
		$query_id    = (int) ( $instance->context['queryId'] ?? 0 );
		if ( ! isset( $seen[ $query_id ][ $post_id ] ) ) {
			$seen[ $query_id ][ $post_id ] = count( $seen[ $query_id ] ?? array() );
		}
		$bg       = sanitize_html_class( (string) get_post_meta( $post_id, 'bg-content', true ) );
		$has_img  = wp_ja_impact_g3_has_intro( $post_id );
		$add[]    = 'jim-evt--bg-' . ( '' === $bg ? 'default' : $bg );
		$add[]    = $has_img ? 'jim-evt--img' : 'jim-evt--plain';
		if ( 1 === $seen[ $query_id ][ $post_id ] && $has_img ) {
			$add[] = 'jim-evt--hl';
		} elseif ( $has_img || ( '' !== $bg && 'default' !== $bg ) ) {
			$add[] = 'jim-evt--white';
		}
	}
	if ( in_array( 'jim-evt__date', $tokens, true ) ) {
		$bg    = sanitize_html_class( (string) get_post_meta( $post_id, 'bg-startdate', true ) );
		$add[] = 'jim-evt__date--' . ( '' === $bg ? 'default' : $bg );
	}
	if ( in_array( 'jim-news__content', $tokens, true ) ) {
		$bg    = sanitize_html_class( (string) get_post_meta( $post_id, 'bg-content', true ) );
		$add[] = 'jim-news__content--' . ( '' === $bg ? 'default' : $bg );
	}
	if ( ! $add && '' === $style ) {
		return $content;
	}
	$tags = new WP_HTML_Tag_Processor( $content );
	if ( ! $tags->next_tag() ) {
		return $content;
	}
	foreach ( $add as $name ) {
		$tags->add_class( $name );
	}
	if ( '' !== $style ) {
		$tags->set_attribute( 'style', $style );
		if ( in_array( 'jim-fund__fill', $tokens, true ) ) {
			$tags->set_attribute( 'role', 'progressbar' );
			$tags->set_attribute( 'aria-valuemin', '0' );
			$tags->set_attribute( 'aria-valuemax', '100' );
			$tags->set_attribute( 'aria-valuenow', (string) wp_ja_impact_g3_percent( $post_id ) );
		}
	}
	return $tags->get_updated_html();
}
add_filter( 'render_block_core/group', 'wp_ja_impact_g3_group_state', 10, 3 );
add_filter( 'render_block_core/paragraph', 'wp_ja_impact_g3_group_state', 10, 3 );

/**
 * The button of an event card is white when the event's `btn-type` field says so (the source prints
 * `btn-white`); every other value keeps the green default.
 *
 * @param string   $content The block's HTML.
 * @param array    $block   The parsed block.
 * @param WP_Block $instance The block instance (its context).
 * @return string
 */
function wp_ja_impact_g3_button_state( string $content, array $block, $instance ): string {
	$class = (string) ( $block['attrs']['className'] ?? '' );
	if ( false === strpos( $class, 'jim-evt__btn' ) ) {
		return $content;
	}
	$post_id = (int) ( $instance->context['postId'] ?? 0 );
	if ( 'white' !== (string) get_post_meta( $post_id, 'btn-type', true ) ) {
		return $content;
	}
	$tags = new WP_HTML_Tag_Processor( $content );
	if ( $tags->next_tag() ) {
		$tags->add_class( 'jim-btn--white' );
	}
	return $tags->get_updated_html();
}
add_filter( 'render_block_core/button', 'wp_ja_impact_g3_button_state', 10, 3 );

/**
 * Whether the source card of a post had a picture: the post carries an intro image (the `has-intro-image`
 * field) and a featured image to print.
 *
 * @param int $post_id The post.
 */
function wp_ja_impact_g3_has_intro( int $post_id ): bool {
	return '1' === (string) get_post_meta( $post_id, 'has-intro-image', true ) && has_post_thumbnail( $post_id );
}

/**
 * The picture of an event or news card appears only for a post whose source card had one.
 *
 * @param string   $content  The block's HTML.
 * @param array    $block    The parsed block.
 * @param WP_Block $instance The block instance (its context).
 * @return string
 */
function wp_ja_impact_g3_card_image( string $content, array $block, $instance ): string {
	$class = (string) ( $block['attrs']['className'] ?? '' );
	if ( false === strpos( $class, 'jim-evt__image' ) && false === strpos( $class, 'jim-news__image' ) ) {
		return $content;
	}
	return wp_ja_impact_g3_has_intro( (int) ( $instance->context['postId'] ?? 0 ) ) ? $content : '';
}
add_filter( 'render_block_core/post-featured-image', 'wp_ja_impact_g3_card_image', 10, 3 );

/**
 * The news card's author name carries the word "By" as an attribute, so the page has one element for "By <author>" as the
 * source has (a separate paragraph for the word had no counterpart there). The word is translatable.
 *
 * @param string $content The block's render.
 * @return string
 */
function wp_ja_impact_g3_author_by( string $content ): string {
	if ( ! str_contains( $content, 'jim-news__author' ) ) {
		return $content;
	}
	return preg_replace( '/^<div /', '<div data-by="' . esc_attr__( 'By', 'wp-ja-impact' ) . '" ', $content, 1 ) ?? $content;
}
add_filter( 'render_block_core/post-author-name', 'wp_ja_impact_g3_author_by' );
