<?php
/**
 * wp-ja-impact, group gc: the single-article view. Three layouts the source draws from one article
 * (html/com_content/article/{default,donation,event}.php): a donation post (a progress bar over its picture and a
 * sidebar), an event post (an information card and a call to action beside the text) and every other post (the
 * blog layout; the one article the Blog Detail menu item shows keeps that page's masthead, sidebar and related
 * posts). This file picks the template, prints the post fields the layouts show (block bindings) and fills the
 * few things markup cannot know: the width of the progress bar, the category list with counts and the share links.
 *
 * @package wp-ja-impact
 */

defined( 'ABSPATH' ) || exit;

/**
 * The template of a single post: a post of the Donations or Events category draws its own layout, the post the
 * Blog Detail menu item shows (flag `blog-detail`) draws the page layout, a post of the Children category the blog
 * layout with the sidebar (the source's menu item of that category has one), any other post the blog layout.
 *
 * @param string[] $templates The template hierarchy of the request.
 * @return string[]
 */
function wp_ja_impact_gc_template_hierarchy( array $templates ): array {
	$post_id = (int) get_queried_object_id();
	if ( ! $post_id || 'post' !== get_post_type( $post_id ) ) {
		return $templates;
	}
	if ( has_category( 'donations', $post_id ) ) {
		$slug = 'single-donation';
	} elseif ( has_category( 'events', $post_id ) ) {
		$slug = 'single-event';
	} elseif ( '1' === (string) get_post_meta( $post_id, 'blog-detail', true ) ) {
		$slug = 'single-blog-detail';
	} elseif ( has_category( 'children', $post_id ) ) {
		$slug = 'single-sidebar';
	} else {
		return $templates;
	}
	array_unshift( $templates, $slug );
	return $templates;
}
add_filter( 'single_template_hierarchy', 'wp_ja_impact_gc_template_hierarchy' );

/**
 * The number the source's article layout reads from an extra field. The layout casts the stored text with
 * `floatval`, which stops at the thousands separator: "4,500" reads as 4 and "9,000" as 9, so the source draws
 * 44.4 % for a 4,500 of 9,000 campaign. The same reading is kept so the bar matches the source (decision
 * D-ji-gc-3 in NOTES: the exact 50 % is one line away should the owner prefer it).
 *
 * @param string $value The stored text.
 */
function wp_ja_impact_gc_number( string $value ): float {
	return (float) $value;
}

/**
 * The percentage of the goal raised, one decimal as the source prints it (44.4).
 *
 * @param int $post_id The donation post.
 */
function wp_ja_impact_gc_percent( int $post_id ): float {
	$raise = wp_ja_impact_gc_number( (string) get_post_meta( $post_id, 'raise', true ) );
	$goal  = wp_ja_impact_gc_number( (string) get_post_meta( $post_id, 'goal', true ) );
	return ( $raise > 0 && $goal > 0 ) ? round( $raise / $goal * 100, 1 ) : 0.0;
}

/**
 * The block bindings source of the article layouts: one field of the current post, formatted as the source
 * prints it. The raw values stay in the post meta; the text on the page is never typed.
 *
 * @param array    $args  The binding's arguments: `field`.
 * @param WP_Block $block The bound block (its postId context).
 * @return string|null
 */
function wp_ja_impact_gc_binding( array $args, $block ) {
	$post_id = (int) ( $block->context['postId'] ?? get_the_ID() );
	$field   = (string) ( $args['field'] ?? '' );
	if ( ! $post_id || '' === $field ) {
		return null;
	}
	$meta = static fn( string $key ): string => trim( (string) get_post_meta( $post_id, $key, true ) );
	switch ( $field ) {
		case 'created':
			$time = strtotime( $meta( 'created-date' ) );
			return $time ? wp_date( (string) get_option( 'date_format' ), $time, new DateTimeZone( 'UTC' ) ) : get_the_date( '', $post_id );
		case 'location':
			return $meta( 'location' );
		case 'raise':
		case 'goal':
			return '' === $meta( $field ) ? '' : '$' . $meta( $field );
		case 'percent':
			return wp_ja_impact_gc_percent( $post_id ) . '%';
		case 'event-date':
			return $meta( 'start-date' );
		case 'event-time':
			return $meta( 'event-time' );
		case 'event-location':
			return $meta( 'event-location' );
		case 'event-fee':
			return $meta( 'event-fee' );
		case 'event-link':
			// The source keeps a Joomla route (`index.php/pages/user/registration-form`).
			$path = preg_replace( '#^/?index\.php/?#', '', $meta( 'btn-redirect-link' ) );
			return '' === $path ? home_url( '/' ) : home_url( '/' . trim( (string) $path, '/' ) . '/' );
	}
	return null;
}

/** Registers the bindings source. */
function wp_ja_impact_gc_register_bindings(): void {
	if ( ! function_exists( 'register_block_bindings_source' ) ) {
		return;
	}
	register_block_bindings_source(
		'wp-ja-impact/gc',
		array(
			'label'              => __( 'Article field (JA Impact)', 'wp-ja-impact' ),
			'get_value_callback' => 'wp_ja_impact_gc_binding',
			'uses_context'       => array( 'postId' ),
		)
	);
}
add_action( 'init', 'wp_ja_impact_gc_register_bindings' );

/**
 * The state of the progress bar of a donation: the fill's width and the percentage label's position follow
 * the raised amount.
 *
 * @param string   $content  The block's HTML.
 * @param array    $block    The parsed block.
 * @param WP_Block $instance The block instance (its context).
 * @return string
 */
function wp_ja_impact_gc_progress( string $content, array $block, $instance ): string {
	$class = (string) ( $block['attrs']['className'] ?? '' );
	if ( false === strpos( $class, 'jim-prog__fill' ) && false === strpos( $class, 'jim-prog__pct' ) ) {
		return $content;
	}
	$post_id = (int) ( $instance->context['postId'] ?? get_the_ID() );
	$percent = wp_ja_impact_gc_percent( $post_id );
	$tags    = new WP_HTML_Tag_Processor( $content );
	if ( ! $tags->next_tag() ) {
		return $content;
	}
	if ( false !== strpos( $class, 'jim-prog__fill' ) ) {
		$tags->set_attribute( 'style', 'width:' . $percent . '%' );
		$tags->set_attribute( 'role', 'progressbar' );
		$tags->set_attribute( 'aria-valuemin', '0' );
		$tags->set_attribute( 'aria-valuemax', '100' );
		$tags->set_attribute( 'aria-valuenow', (string) $percent );
	} else {
		$tags->set_attribute( 'style', 'right:calc(100% - ' . $percent . '%)' );
	}
	return $tags->get_updated_html();
}
add_filter( 'render_block_core/group', 'wp_ja_impact_gc_progress', 10, 3 );
add_filter( 'render_block_core/paragraph', 'wp_ja_impact_gc_progress', 10, 3 );

/**
 * The category list of the article sidebar, as the source's Categories module draws it: the categories that
 * hold posts, in the order the site keeps them, each with its post count in a round badge.
 *
 * @param string $content The block's HTML.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_impact_gc_categories( string $content, array $block ): string {
	if ( false === strpos( (string) ( $block['attrs']['className'] ?? '' ), 'jim-side__list' ) ) {
		return $content;
	}
	$terms = get_categories(
		array(
			'hide_empty' => true,
			'orderby'    => 'term_id',
			'order'      => 'ASC',
		)
	);
	if ( ! $terms ) {
		return '';
	}
	$items = '';
	foreach ( $terms as $term ) {
		if ( (int) $term->count < 1 ) {
			continue;
		}
		$items .= sprintf(
			'<li class="cat-item cat-item-%1$d"><a href="%2$s">%3$s <span class="numitems">%4$d</span></a></li>',
			(int) $term->term_id,
			esc_url( get_category_link( $term ) ),
			esc_html( $term->name ),
			(int) $term->count
		);
	}
	return '<ul class="wp-block-categories-list wp-block-categories jim-side__list">' . $items . '</ul>';
}
add_filter( 'render_block_core/categories', 'wp_ja_impact_gc_categories', 10, 2 );

/**
 * The share buttons of an article point at the share pages of their networks with the article's address.
 *
 * @param string $content The block's HTML.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_impact_gc_share( string $content, array $block ): string {
	if ( false === strpos( (string) ( $block['attrs']['className'] ?? '' ), 'jim-art__share' ) ) {
		return $content;
	}
	$url   = rawurlencode( (string) get_permalink() );
	$title = rawurlencode( (string) get_the_title() );
	$map   = array(
		'facebook' => 'https://www.facebook.com/sharer/sharer.php?u=' . $url,
		'x'        => 'https://twitter.com/intent/tweet?url=' . $url . '&text=' . $title,
		'tumblr'   => 'https://www.tumblr.com/widgets/share/tool?canonicalUrl=' . $url,
		'whatsapp' => 'https://api.whatsapp.com/send?text=' . $title . '%20' . $url,
	);
	foreach ( $map as $service => $href ) {
		$content = preg_replace(
			'#(<li[^>]*wp-social-link-' . $service . '[^>]*><a href=")[^"]*(")#',
			'${1}' . esc_url( $href ) . '${2}',
			$content
		) ?? $content;
	}
	return $content;
}
add_filter( 'render_block_core/social-links', 'wp_ja_impact_gc_share', 10, 2 );

/**
 * The trail of an article starts at its category: the site's own "Blog" parent category is not part of the
 * source's trail (Home, the page the article sits under, the article).
 *
 * @param array[] $items The breadcrumb items.
 * @return array[]
 */
function wp_ja_impact_gc_breadcrumbs( array $items ): array {
	if ( ! is_singular( 'post' ) ) {
		return $items;
	}
	$blog = get_category_by_slug( 'blog' );
	if ( ! $blog ) {
		return $items;
	}
	$url = get_category_link( $blog );
	return array_values(
		array_filter(
			$items,
			static fn( array $item ): bool => ( $item['url'] ?? '' ) !== $url
		)
	);
}
add_filter( 'block_core_breadcrumbs_items', 'wp_ja_impact_gc_breadcrumbs' );

/**
 * The popular tags of the article sidebar, as the source's Tags module draws them: a list of links (one entry
 * per tag), in the order of their post counts.
 *
 * @param string $content The block's HTML.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_impact_gc_tag_cloud( string $content, array $block ): string {
	$class = (string) ( $block['attrs']['className'] ?? '' );
	if ( false === strpos( $class, 'jim-side__cloud' ) ) {
		return $content;
	}
	$tags = get_terms(
		array(
			'taxonomy'   => 'post_tag',
			'hide_empty' => true,
			'orderby'    => 'count',
			'order'      => 'DESC',
		)
	);
	if ( is_wp_error( $tags ) || ! $tags ) {
		return '';
	}
	$items = '';
	foreach ( $tags as $tag ) {
		$items .= sprintf( '<li><a href="%1$s" class="tag-cloud-link">%2$s</a></li>', esc_url( get_term_link( $tag ) ), esc_html( $tag->name ) );
	}
	return '<ul class="wp-block-tag-cloud jim-side__cloud">' . $items . '</ul>';
}
add_filter( 'render_block_core/tag-cloud', 'wp_ja_impact_gc_tag_cloud', 10, 2 );

/**
 * The previous / next links of an article. The source lists a category newest first, so its "previous" article
 * is the NEWER one and its "next" the older one, the reverse of WordPress; each link is drawn from the neighbour
 * the source names, in the category of the article, with an arrow on the outer side.
 *
 * @param string $content The block's HTML.
 * @param array  $block   The parsed block.
 * @return string
 */
function wp_ja_impact_gc_pager( string $content, array $block ): string {
	$class = (string) ( $block['attrs']['className'] ?? '' );
	$prev  = false !== strpos( $class, 'jim-art__nav--prev' );
	if ( ! $prev && false === strpos( $class, 'jim-art__nav--next' ) ) {
		return $content;
	}
	// WordPress "previous" is the older post; the source's previous is the newer one.
	$post = get_adjacent_post( true, '', ! $prev );
	if ( ! $post instanceof WP_Post ) {
		return '';
	}
	$link  = sprintf(
		'<a href="%1$s" rel="%2$s"><span class="screen-reader-text">%3$s</span><span class="post-navigation-link__title" aria-hidden="true">%4$s</span></a>',
		esc_url( get_permalink( $post ) ),
		$prev ? 'prev' : 'next',
		esc_html( ( $prev ? __( 'Previous article:', 'wp-ja-impact' ) : __( 'Next article:', 'wp-ja-impact' ) ) . ' ' . get_the_title( $post ) ),
		esc_html( get_the_title( $post ) )
	);
	$arrow = sprintf(
		'<span class="wp-block-post-navigation-link__arrow-%1$s is-arrow-arrow" aria-hidden="true">%2$s</span>',
		$prev ? 'previous' : 'next',
		$prev ? '&larr;' : '&rarr;'
	);
	return sprintf(
		'<div class="post-navigation-link-%1$s wp-block-post-navigation-link">%2$s</div>',
		$prev ? 'previous' : 'next',
		$prev ? $arrow . $link : $link . $arrow
	);
}
add_filter( 'render_block_core/post-navigation-link', 'wp_ja_impact_gc_pager', 10, 2 );
