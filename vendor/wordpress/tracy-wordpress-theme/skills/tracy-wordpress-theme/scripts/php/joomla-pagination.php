<?php
/**
 * Plugin Name: Tracy Joomla pagination
 * Description: Draws a Query Loop's pager as a Joomla category blog prints it — start · previous · page numbers · next · end, with the controls that lead nowhere shown disabled, and a "Page N of M" counter beside it. Installed by the Tracy seeder (scripts/seed.mjs) for the listings a Joomla port pages; see references/templates-and-patterns.md "Joomla pagination".
 *
 * Only a core/query-pagination block whose className carries `tracy-joomla-pager` is drawn here;
 * every other pager is core's. The block stays a core block — editable, movable, removable in the
 * editor — and without this plugin it renders as core's pager. The numbers come from the block's
 * own query (its context: queryId and query), read the way core's pagination blocks read it: the
 * page from `?query-<queryId>-page=N`, the total from a WP_Query of build_query_vars_from_query_block()
 * capped by the query's `pages`, or the main query's for a query that inherits it. Links keep every
 * other query argument of the request (filters, other queries' pages). A listing of one page prints
 * no pager, as Joomla prints none; a page past the end is shown as the last page, as Joomla clamps it.
 */

if ( ! function_exists( 'tracy_joomla_pager_state' ) ) {
	/**
	 * `array( current, total, link )` for the pager block `$block` (a WP_Block), or null when the
	 * listing has one page or none. `link( $n )` is the URL of page `$n`.
	 */
	function tracy_joomla_pager_state( $block ) {
		$context = isset( $block->context ) && is_array( $block->context ) ? $block->context : array();
		$query   = isset( $context['query'] ) && is_array( $context['query'] ) ? $context['query'] : array();
		if ( ! empty( $query['inherit'] ) ) {
			global $wp_query;
			$total = isset( $wp_query->max_num_pages ) ? (int) $wp_query->max_num_pages : 0;
			$page  = max( 1, (int) get_query_var( 'paged' ) );
			$link  = function ( $n ) {
				return get_pagenum_link( $n );
			};
		} else {
			$key = isset( $context['queryId'] ) ? 'query-' . (int) $context['queryId'] . '-page' : 'query-page';
			// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- a page number, read as core's Query Loop reads it.
			$raw  = isset( $_GET[ $key ] ) && is_scalar( $_GET[ $key ] ) ? (string) wp_unslash( $_GET[ $key ] ) : '1';
			$page = ctype_digit( $raw ) ? max( 1, (int) $raw ) : 1;
			$wpq   = new WP_Query( build_query_vars_from_query_block( $block, $page ) );
			$total = (int) $wpq->max_num_pages;
			// WP_Query counts no rows for a page that has no posts (a page past the end): the total
			// is read again from the first page, so the pager still shows where the listing ends.
			if ( 0 === $total && $page > 1 ) {
				$first = new WP_Query( build_query_vars_from_query_block( $block, 1 ) );
				$total = (int) $first->max_num_pages;
			}
			$cap   = isset( $query['pages'] ) ? (int) $query['pages'] : 0;
			if ( $cap > 0 && $cap < $total ) {
				$total = $cap;
			}
			$link = function ( $n ) use ( $key ) {
				return 1 === $n ? remove_query_arg( $key ) : add_query_arg( $key, $n );
			};
		}
		if ( $total < 2 ) {
			return null;
		}
		return array(
			'current' => min( $page, $total ),
			'total'   => $total,
			'link'    => $link,
		);
	}

	/**
	 * The page numbers Joomla lists around the current page: ten at most (Joomla's
	 * Pagination::$displayedPages), the current one near the middle, moved in at the ends.
	 */
	function tracy_joomla_pager_window( $current, $total, $shown = 10 ) {
		$start = $current - (int) floor( $shown / 2 );
		if ( $start < 1 ) {
			$start = 1;
		}
		if ( $start + $shown > $total ) {
			$stop  = $total;
			$start = $total < $shown ? 1 : $total - $shown + 1;
		} else {
			$stop = $start + $shown - 1;
		}
		return range( $start, $stop );
	}

	/** The pager's markup for `$state` (tracy_joomla_pager_state), with the block's own classes. */
	function tracy_joomla_pager_markup( $state, $class_name ) {
		$labels = apply_filters(
			'tracy_joomla_pager_labels',
			array(
				'nav'      => 'Pagination',
				'start'    => 'Go to start page',
				'previous' => 'Go to previous page',
				'page'     => 'Go to page %d',
				'current'  => 'Page %d',
				'next'     => 'Go to next page',
				'end'      => 'Go to end page',
				'counter'  => 'Page %1$d of %2$d',
			)
		);
		$current = $state['current'];
		$total   = $state['total'];
		$link    = $state['link'];
		// The text the source prints on the four controls (option tracy_joomla_pager_text, from the
		// archives' paging.labels): shown in place of the symbols, which stay the fallback.
		$text = function_exists( 'get_option' ) ? get_option( 'tracy_joomla_pager_text' ) : null;
		if ( is_string( $text ) ) {
			$text = json_decode( $text, true );
		}
		$shown = function ( $key, $symbol ) use ( $text ) {
			return is_array( $text ) && isset( $text[ $key ] ) && is_string( $text[ $key ] ) && '' !== trim( $text[ $key ] ) ? esc_html( $text[ $key ] ) : $symbol;
		};
		$item    = function ( $symbol, $label, $target ) use ( $link ) {
			if ( null === $target ) {
				return '<li class="tracy-pager__item is-disabled"><span class="tracy-pager__link" aria-hidden="true">' . $symbol . '</span></li>';
			}
			return '<li class="tracy-pager__item"><a class="tracy-pager__link" href="' . esc_url( $link( $target ) ) . '" aria-label="' . esc_attr( $label ) . '">' . $symbol . '</a></li>';
		};
		$items   = array();
		$items[] = $item( $shown( 'start', '&laquo;' ), $labels['start'], $current > 1 ? 1 : null );
		$items[] = $item( $shown( 'previous', '&lsaquo;' ), $labels['previous'], $current > 1 ? $current - 1 : null );
		foreach ( tracy_joomla_pager_window( $current, $total ) as $n ) {
			$items[] = $n === $current
				? '<li class="tracy-pager__item is-current"><span class="tracy-pager__link" aria-current="page" aria-label="' . esc_attr( sprintf( $labels['current'], $n ) ) . '">' . $n . '</span></li>'
				: '<li class="tracy-pager__item"><a class="tracy-pager__link" href="' . esc_url( $link( $n ) ) . '" aria-label="' . esc_attr( sprintf( $labels['page'], $n ) ) . '">' . $n . '</a></li>';
		}
		$items[] = $item( $shown( 'next', '&rsaquo;' ), $labels['next'], $current < $total ? $current + 1 : null );
		$items[] = $item( $shown( 'end', '&raquo;' ), $labels['end'], $current < $total ? $total : null );
		$classes = trim( 'wp-block-query-pagination tracy-pager ' . $class_name );
		return '<nav class="' . esc_attr( $classes ) . '" aria-label="' . esc_attr( $labels['nav'] ) . '">'
			. '<ul class="tracy-pager__list">' . implode( '', $items ) . '</ul>'
			. '<p class="tracy-pager__counter">' . esc_html( sprintf( $labels['counter'], $current, $total ) ) . '</p>'
			. '</nav>';
	}

	/**
	 * The pager's style, printed once on a page that draws one: flex rows that wrap (the counter
	 * goes under the numbers when the line is full, the numbers wrap on a narrow screen), colours
	 * from the theme's presets and the text colour — no fixed colour, so a dark variation that
	 * restates the presets restyles it.
	 */
	function tracy_joomla_pager_style() {
		static $done = false;
		if ( $done ) {
			return;
		}
		$done = true;
		$css  = '.tracy-pager{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:var(--wp--preset--spacing--30,1rem);max-width:100%;margin-block-start:var(--wp--preset--spacing--40,1.5rem)}'
			. '.tracy-pager__list{display:flex;flex-wrap:wrap;gap:.25rem;margin:0;padding:0;list-style:none;min-width:0}'
			. '.tracy-pager__item{margin:0}'
			. '.tracy-pager__link{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;min-width:2.5rem;min-height:2.5rem;padding:0 .75rem;border:1px solid color-mix(in srgb,currentColor 25%,transparent);border-radius:.25rem;color:inherit;text-decoration:none;line-height:1}'
			. 'a.tracy-pager__link:hover,a.tracy-pager__link:focus-visible{border-color:currentColor}'
			. '.tracy-pager__item.is-current .tracy-pager__link{background:var(--wp--preset--color--primary,currentColor);border-color:var(--wp--preset--color--primary,currentColor);color:var(--wp--preset--color--base,Canvas)}'
			. '.tracy-pager__item.is-disabled .tracy-pager__link{opacity:.45}'
			. '.tracy-pager__counter{margin:0}';
		wp_register_style( 'tracy-joomla-pager', false, array(), '1' );
		wp_add_inline_style( 'tracy-joomla-pager', $css );
		wp_enqueue_style( 'tracy-joomla-pager' );
	}

	function tracy_joomla_pager_render( $content, $parsed, $block = null ) {
		$class_name = isset( $parsed['attrs']['className'] ) && is_string( $parsed['attrs']['className'] ) ? $parsed['attrs']['className'] : '';
		if ( ! in_array( 'tracy-joomla-pager', preg_split( '/\s+/', $class_name ), true ) || ! $block instanceof WP_Block ) {
			return $content;
		}
		$state = tracy_joomla_pager_state( $block );
		if ( null === $state ) {
			return '';
		}
		tracy_joomla_pager_style();
		return tracy_joomla_pager_markup( $state, $class_name );
	}
	add_filter( 'render_block_core/query-pagination', 'tracy_joomla_pager_render', 10, 3 );
}
