<?php
/**
 * Home group: the "News & Events" cards of the home page.
 *
 * The source's latest-news module lists the newest articles that carry a picture, newest first, sticky or not. A Query
 * Loop orders sticky posts first and takes posts without a picture, so the cards' query (the post template with the class
 * `jd-news-items`) is narrowed here.
 *
 * @package wp-ja-diner
 */

/**
 * Newest posts with a featured image, sticky posts not lifted to the top, for the post template of class `jd-news-items`.
 *
 * @param array<string, mixed> $query Query vars of the Query Loop block.
 * @param WP_Block             $block The block.
 * @return array<string, mixed>
 */
function wp_ja_diner_home_news_query( array $query, WP_Block $block ): array {
	if ( false === strpos( (string) ( $block->parsed_block['attrs']['className'] ?? '' ), 'jd-news-items' ) ) {
		return $query;
	}
	$query['ignore_sticky_posts'] = true;
	$query['meta_query']          = array(
		array(
			'key'     => '_thumbnail_id',
			'compare' => 'EXISTS',
		),
	);
	return $query;
}
add_filter( 'query_loop_block_query_vars', 'wp_ja_diner_home_news_query', 10, 2 );

/*
 * The News & Events cards draw the article's list picture, as the source's latest-news module does: the attachment kept in
 * the article's `jd_intro_image` meta (the source's `images.image_intro`, written by the quickstart's post-seed step), else
 * the featured image. Only inside the post template of class `jd-news-items`; the article page keeps its featured image.
 */

/**
 * Marks the post template of class `jd-news-items` while it renders, so the featured image filter below knows where it is.
 *
 * @param array<string, mixed> $parsed The parsed block.
 * @return array<string, mixed>
 */
function wp_ja_diner_home_news_enter( array $parsed ): array {
	if ( 'core/post-template' === ( $parsed['blockName'] ?? '' ) && false !== strpos( (string) ( $parsed['attrs']['className'] ?? '' ), 'jd-news-items' ) ) {
		$GLOBALS['wp_ja_diner_in_news'] = true;
	}
	return $parsed;
}
add_filter( 'render_block_data', 'wp_ja_diner_home_news_enter' );

/**
 * Leaves the news post template.
 *
 * @param string               $content The rendered block.
 * @param array<string, mixed> $block   The parsed block.
 * @return string
 */
function wp_ja_diner_home_news_leave( string $content, array $block ): string {
	if ( 'core/post-template' === ( $block['blockName'] ?? '' ) && false !== strpos( (string) ( $block['attrs']['className'] ?? '' ), 'jd-news-items' ) ) {
		$GLOBALS['wp_ja_diner_in_news'] = false;
	}
	return $content;
}
add_filter( 'render_block', 'wp_ja_diner_home_news_leave', 10, 2 );

/**
 * Inside the news cards, the featured image of an article is its list picture when it has one.
 *
 * @param int|false        $thumbnail_id The featured image id.
 * @param int|WP_Post|null $post         The post.
 * @return int|false
 */
function wp_ja_diner_home_news_picture( $thumbnail_id, $post ) {
	if ( empty( $GLOBALS['wp_ja_diner_in_news'] ) ) {
		return $thumbnail_id;
	}
	$intro = (int) get_post_meta( $post instanceof WP_Post ? $post->ID : (int) $post, 'jd_intro_image', true );
	return $intro ? $intro : $thumbnail_id;
}
add_filter( 'post_thumbnail_id', 'wp_ja_diner_home_news_picture', 10, 2 );
