<?php
/**
 * Title: Search results
 * Slug: tracy-base/search-results
 * Description: The body of the search results (templates/search.html), as the Joomla source's Smart Search view: the search form with its label above the field, then one result per row between rules (title, excerpt, date), or the "No Results Found" panel naming the query. Its words go through the theme's text domain.
 * Categories: tracy-base
 * Inserter: no
 *
 * @package tracy-base
 */

$tracy_base_search_form = array(
	'label'      => __( 'Search Terms:', 'tracy-base' ),
	'showLabel'  => true,
	'buttonText' => __( 'Search', 'tracy-base' ),
	'className'  => 'tracy-search-form',
);
?>
<!-- wp:search <?php echo wp_json_encode( $tracy_base_search_form ); ?> /-->
<!-- wp:query {"queryId":1,"query":{"perPage":10,"pages":0,"offset":0,"postType":"post","order":"desc","orderBy":"date","inherit":true},"className":"tracy-results","layout":{"type":"default"}} -->
<div class="wp-block-query tracy-results">
<!-- wp:post-template {"className":"tracy-results__list","layout":{"type":"default"}} -->
<!-- wp:group {"className":"tracy-result","layout":{"type":"default"}} -->
<div class="wp-block-group tracy-result">
<!-- wp:post-title {"level":2,"isLink":true,"className":"tracy-result__title"} /-->
<!-- wp:post-excerpt {"excerptLength":40,"className":"tracy-result__text"} /-->
<!-- wp:post-date {"className":"tracy-result__meta"} /-->
</div>
<!-- /wp:group -->
<!-- /wp:post-template -->
<!-- wp:query-no-results -->
<!-- wp:group {"className":"tracy-search-empty","layout":{"type":"default"}} -->
<div class="wp-block-group tracy-search-empty">
<!-- wp:heading {"className":"tracy-search-empty__title"} -->
<h2 class="wp-block-heading tracy-search-empty__title"><?php echo esc_html__( 'No Results Found', 'tracy-base' ); ?></h2>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"tracy-search-empty__text"} -->
<p class="tracy-search-empty__text">
<?php
/* translators: %s: the words the visitor searched for. */
echo esc_html( sprintf( __( 'No search results could be found for query: %s.', 'tracy-base' ), get_search_query( false ) ) );
?>
</p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- /wp:query-no-results -->
<!-- wp:query-pagination {"className":"tracy-pagination","layout":{"type":"flex"}} -->
<!-- wp:query-pagination-previous /-->
<!-- wp:query-pagination-numbers /-->
<!-- wp:query-pagination-next /-->
<!-- /wp:query-pagination -->
</div>
<!-- /wp:query -->
