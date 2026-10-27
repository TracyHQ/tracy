<?php
/**
 * Title: Smart search
 * Slug: wp-ja-fresco/finder
 * Description: The search page body (the source's com_finder view): the search form, the search tips, then the results of a term in the listing's cards. An empty term shows the form and the tips only.
 * Categories: wp-ja-fresco
 * Inserter: no
 * Keywords: search, finder
 *
 * @package wp-ja-fresco
 */

$wp_ja_fresco_page   = get_page_by_path( 'pages/j-pages/smart-search' );
$wp_ja_fresco_action = $wp_ja_fresco_page instanceof WP_Post ? home_url( '/pages/j-pages/smart-search' ) : home_url( '/' );
$wp_ja_fresco_field  = $wp_ja_fresco_page instanceof WP_Post ? 'q' : 's';
$wp_ja_fresco_term   = get_search_query();
?>
<!-- wp:group {"className":"com-finder finder jf-finder","layout":{"type":"default"}} -->
<div class="wp-block-group com-finder finder jf-finder">
<!-- wp:html -->
<div id="search-form" class="com-finder__form">
<form action="<?php echo esc_url( $wp_ja_fresco_action ); ?>" method="get" class="js-finder-searchform" role="search">
<fieldset class="com-finder__search word">
<legend class="com-finder__search-legend screen-reader-text"><?php esc_html_e( 'Search Form', 'wp-ja-fresco' ); ?></legend>
<div class="form-inline">
<label for="q"><?php esc_html_e( 'Search Terms:', 'wp-ja-fresco' ); ?></label>
<div class="input-group">
<input type="text" name="<?php echo esc_attr( $wp_ja_fresco_field ); ?>" id="q" class="js-finder-search-query form-control" value="<?php echo esc_attr( $wp_ja_fresco_term ); ?>">
<span class="input-group-append">
<button type="submit" class="btn btn-primary"><?php esc_html_e( 'Search', 'wp-ja-fresco' ); ?></button>
<button class="btn btn-secondary jf-finder-toggle" type="button" aria-controls="advancedSearch" aria-expanded="true"><?php esc_html_e( 'Advanced Search', 'wp-ja-fresco' ); ?></button>
</span>
</div>
</div>
</fieldset>
<fieldset id="advancedSearch" class="com-finder__advanced">
<legend class="com-finder__search-advanced screen-reader-text"><?php esc_html_e( 'Advanced Search', 'wp-ja-fresco' ); ?></legend>
<div class="com-finder__tips card">
<div class="card-body">
<p><?php esc_html_e( 'Here are a few examples of how you can use the search feature:', 'wp-ja-fresco' ); ?></p>
<p><?php echo str_replace( '"', '&quot;', wp_kses( __( 'Entering <strong>this and that</strong> into the search form will return results containing both "this" and "that".', 'wp-ja-fresco' ), array( 'strong' => array() ) ) ); ?></p>
<p><?php echo str_replace( '"', '&quot;', wp_kses( __( 'Entering <strong>this not that</strong> into the search form will return results containing "this" and not "that".', 'wp-ja-fresco' ), array( 'strong' => array() ) ) ); ?></p>
<p><?php echo str_replace( '"', '&quot;', wp_kses( __( 'Entering <strong>this or that</strong> into the search form will return results containing either "this" or "that".', 'wp-ja-fresco' ), array( 'strong' => array() ) ) ); ?></p>
<p><?php esc_html_e( 'Search results can also be filtered using a variety of criteria. Select one or more filters below to get started.', 'wp-ja-fresco' ); ?></p>
</div>
</div>
</fieldset>
</form>
</div>
<!-- /wp:html -->
<?php if ( '' !== $wp_ja_fresco_term ) : ?>
<!-- wp:html -->
<div id="search-query-explained" class="com-finder__explained">
<?php foreach ( preg_split( '/\s+/', $wp_ja_fresco_term ) as $wp_ja_fresco_word ) : ?>
<span class="query-required"><?php echo wp_kses( sprintf( /* translators: %s: one word of the search term. */ __( '%s is required', 'wp-ja-fresco' ), '<span class="term">' . esc_html( $wp_ja_fresco_word ) . '</span>' ), array( 'span' => array( 'class' => array() ) ) ); ?></span>
<?php endforeach; ?>
</div>
<!-- /wp:html -->
<!-- wp:query {"queryId":3,"query":{"perPage":10,"pages":0,"offset":0,"postType":"post","order":"desc","orderBy":"date","inherit":true},"className":"tracy-query jf-blog blog jf-finder-results","layout":{"type":"default"}} -->
<div class="wp-block-query tracy-query jf-blog blog jf-finder-results">
<!-- wp:post-template {"className":"jf-blog-items","layout":{"type":"default"}} -->
<!-- wp:group {"className":"jf-blog-item item","layout":{"type":"default"}} -->
<div class="wp-block-group jf-blog-item item">
<!-- wp:post-featured-image {"isLink":true,"className":"item-image"} /-->
<!-- wp:group {"className":"item-content","layout":{"type":"default"}} -->
<div class="wp-block-group item-content">
<!-- wp:post-terms {"term":"category","className":"category-name"} /-->
<!-- wp:post-title {"level":2,"isLink":true,"className":"item-title"} /-->
<!-- wp:group {"className":"article-info","layout":{"type":"flex","flexWrap":"wrap"}} -->
<div class="wp-block-group article-info">
<!-- wp:group {"className":"createdby","layout":{"type":"flex","flexWrap":"nowrap"}} -->
<div class="wp-block-group createdby">
<!-- wp:avatar {"size":24,"className":"author-avatar"} /-->
<!-- wp:paragraph {"className":"createdby-by"} -->
<p class="createdby-by"><?php esc_html_e( 'By', 'wp-ja-fresco' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:post-author-name {"isLink":true,"className":"author-name"} /-->
</div>
<!-- /wp:group -->
<!-- wp:post-date {"format":"j F Y","className":"published"} /-->
</div>
<!-- /wp:group -->
<!-- wp:post-excerpt {"excerptLength":200,"className":"item-intro"} /-->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- /wp:post-template -->
<!-- wp:query-no-results -->
<!-- wp:group {"className":"com-finder__empty","layout":{"type":"default"}} -->
<div class="wp-block-group com-finder__empty">
<!-- wp:heading -->
<h2 class="wp-block-heading"><?php esc_html_e( 'No Results Found', 'wp-ja-fresco' ); ?></h2>
<!-- /wp:heading -->
<!-- wp:paragraph -->
<p><?php /* translators: %s: the search term. */ echo esc_html( sprintf( __( 'No search results could be found for query: %s.', 'wp-ja-fresco' ), $wp_ja_fresco_term ) ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- /wp:query-no-results -->
<!-- wp:query-pagination {"className":"tracy-pagination pagination","layout":{"type":"flex"}} -->
<!-- wp:query-pagination-previous /-->
<!-- wp:query-pagination-numbers /-->
<!-- wp:query-pagination-next /-->
<!-- /wp:query-pagination -->
</div>
<!-- /wp:query -->
<?php endif; ?>
</div>
<!-- /wp:group -->
