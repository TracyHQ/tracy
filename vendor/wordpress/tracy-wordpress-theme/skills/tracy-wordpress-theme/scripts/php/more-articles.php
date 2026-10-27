<?php
/**
 * Plugin Name: Tracy more articles
 * Description: Pages a category blog's "More Articles" list with its cards: the link-only titles after page N's cards are the posts that open page N+1. Installed by the Tracy seeder (scripts/seed.mjs); see references/demo-content.md "More Articles".
 *
 * The seeder draws the list as a core/query whose `query` attribute carries
 * `tracyMore: { after: <the cards query's queryId>, skip: <cards a page> }`. Core's Query Loop can
 * only offset by a fixed number; this filter moves the list with the cards query's own page
 * (`?query-<after>-page=N`), the way Joomla lists the next `num_links` articles under each page of
 * a category blog. A query without the key is left alone. When the list has no post (the last
 * page), the block prints nothing — heading included.
 */

if ( ! function_exists( 'tracy_more_articles_of' ) ) {
	/** `array( after, skip )` from a query attribute that asks for it, else null. */
	function tracy_more_articles_of( $query ) {
		if ( ! is_array( $query ) || ! isset( $query['tracyMore'] ) || ! is_array( $query['tracyMore'] ) ) {
			return null;
		}
		$more  = $query['tracyMore'];
		$after = isset( $more['after'] ) ? $more['after'] : null;
		$skip  = isset( $more['skip'] ) ? $more['skip'] : null;
		if ( ! is_int( $after ) || $after < 0 || ! is_int( $skip ) || $skip < 1 ) {
			return null;
		}
		return array(
			'after' => $after,
			'skip'  => $skip,
		);
	}

	function tracy_more_articles_vars( $vars, $block, $page ) {
		$more = tracy_more_articles_of( isset( $block->context['query'] ) ? $block->context['query'] : null );
		if ( ! $more ) {
			return $vars;
		}
		$key   = 'query-' . $more['after'] . '-page';
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- a page number, read as Core's Query Loop reads it.
		$cards = isset( $_GET[ $key ] ) ? max( 1, (int) $_GET[ $key ] ) : 1;
		$vars['offset']        = $cards * $more['skip'];
		$vars['no_found_rows'] = true;
		return $vars;
	}
	add_filter( 'query_loop_block_query_vars', 'tracy_more_articles_vars', 10, 3 );

	function tracy_more_articles_render( $content, $block ) {
		if ( ! isset( $block['blockName'] ) || 'core/query' !== $block['blockName'] ) {
			return $content;
		}
		if ( ! tracy_more_articles_of( isset( $block['attrs']['query'] ) ? $block['attrs']['query'] : null ) ) {
			return $content;
		}
		// core/post-template prints nothing for a query without posts: then neither does the list.
		return false === strpos( $content, 'wp-block-post-template' ) ? '' : $content;
	}
	add_filter( 'render_block', 'tracy_more_articles_render', 10, 2 );
}
