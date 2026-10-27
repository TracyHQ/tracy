<?php
/**
 * Title: Search page form and tips
 * Slug: wp-ja-restaurant/part-search-form
 * Description: The search page's form and its advanced-search tips, in the site's language. Drawn by the search-form template part.
 * Categories: wp-ja-restaurant, tracy
 * Inserter: no
 *
 * @package wp-ja-restaurant
 */
?>
<!-- wp:html -->
<form action="/explore/j-pages/smart-search/" method="get" class="js-finder-searchform jm-finder-form" role="search">
<fieldset class="com-finder__search word mb-3">
<legend class="com-finder__search-legend visually-hidden"><?php esc_html_e( 'Search Form', 'wp-ja-restaurant' ); ?></legend>
<div class="form-inline">
<label for="q" class="me-2"><?php esc_html_e( 'Search Terms:', 'wp-ja-restaurant' ); ?></label>
<div class="input-group">
<input type="text" name="q" id="q" class="js-finder-search-query form-control" value="" />
<button type="submit" class="btn btn-primary"><span class="icon-search icon-white" aria-hidden="true"></span> <?php esc_html_e( 'Search', 'wp-ja-restaurant' ); ?></button>
<button class="btn btn-secondary" type="button" aria-expanded="false" aria-controls="advancedSearch"><span class="icon-search-plus" aria-hidden="true"></span> <?php esc_html_e( 'Advanced Search', 'wp-ja-restaurant' ); ?></button>
</div>
</div>
</fieldset>
<fieldset id="advancedSearch" class="com-finder__advanced js-finder-advanced collapse">
<legend class="com-finder__search-advanced visually-hidden"><?php esc_html_e( 'Advanced Search', 'wp-ja-restaurant' ); ?></legend>
<div class="com-finder__tips card card-outline-secondary mb-3"><div class="card-body">
<p><?php esc_html_e( 'Here are a few examples of how you can use the search feature:', 'wp-ja-restaurant' ); ?></p>
<p><?php printf( /* translators: %s: an example search, in bold. */ esc_html__( 'Entering %s into the search form will return results containing both "this" and "that".', 'wp-ja-restaurant' ), '<strong>' . esc_html__( 'this and that', 'wp-ja-restaurant' ) . '</strong>' ); ?></p>
<p><?php printf( /* translators: %s: an example search, in bold. */ esc_html__( 'Entering %s into the search form will return results containing "this" and not "that".', 'wp-ja-restaurant' ), '<strong>' . esc_html__( 'this not that', 'wp-ja-restaurant' ) . '</strong>' ); ?></p>
<p><?php printf( /* translators: %s: an example search, in bold. */ esc_html__( 'Entering %s into the search form will return results containing either "this" or "that".', 'wp-ja-restaurant' ), '<strong>' . esc_html__( 'this or that', 'wp-ja-restaurant' ) . '</strong>' ); ?></p>
<p><?php esc_html_e( 'Search results can also be filtered using a variety of criteria. Select one or more filters below to get started.', 'wp-ja-restaurant' ); ?></p>
</div></div>
</fieldset>
</form>
<!-- /wp:html -->
