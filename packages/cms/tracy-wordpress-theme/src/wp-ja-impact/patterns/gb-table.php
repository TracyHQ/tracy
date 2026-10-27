<?php
/**
 * Title: Article table
 * Slug: wp-ja-impact/gb-table
 * Description: A table of the articles of a category: title, author and hits (Joomla category list view). The rows come from a Query Loop; author and hits are post fields.
 * Categories: wp-ja-impact
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: table, list, category, hits
 *
 * @package wp-ja-impact
 */
?>
<!-- wp:group {"tagName":"section","className":"jim-acm jim-gb jim-gb--table acm-articles-category style-table","metadata":{"name":"articles-category.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jim-acm jim-gb jim-gb--table acm-articles-category style-table">
<!-- wp:query {"queryId":3407,"query":{"perPage":10,"pages":0,"offset":0,"postType":"post","order":"desc","orderBy":"date","author":"","search":"","exclude":[],"sticky":"","inherit":false,"wpJaImpactCategory":"animals"},"className":"jim-gb-table"} -->
<div class="wp-block-query jim-gb-table">
<!-- wp:group {"className":"jim-gb-table__head","layout":{"type":"default"}} -->
<div class="wp-block-group jim-gb-table__head">
<!-- wp:paragraph {"className":"jim-gb-table__th"} -->
<p class="jim-gb-table__th"><?php esc_html_e( 'Title', 'wp-ja-impact' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"jim-gb-table__th"} -->
<p class="jim-gb-table__th"><?php esc_html_e( 'Author', 'wp-ja-impact' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"jim-gb-table__th"} -->
<p class="jim-gb-table__th"><?php esc_html_e( 'Hits', 'wp-ja-impact' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:post-template {"className":"jim-gb-table__rows"} -->
<!-- wp:group {"className":"jim-gb-table__row","layout":{"type":"default"}} -->
<div class="wp-block-group jim-gb-table__row">
<!-- wp:post-title {"level":4,"isLink":true,"className":"jim-gb-table__title","metadata":{"role":"content","name":"articles-category.title"}} -->
<h4 class="wp-block-post-title jim-gb-table__title"></h4>
<!-- /wp:post-title -->
<!-- wp:paragraph {"className":"jim-gb-table__author","metadata":{"bindings":{"content":{"source":"wp-ja-impact/gb","args":{"field":"written"}}}}} -->
<p class="jim-gb-table__author"></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"jim-gb-table__hits","metadata":{"bindings":{"content":{"source":"wp-ja-impact/gb","args":{"field":"hits"}}}}} -->
<p class="jim-gb-table__hits"></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- /wp:post-template -->
<!-- wp:query-pagination {"className":"tracy-pagination tracy-joomla-pager jim-gb__pager","layout":{"type":"flex"}} -->
<!-- wp:query-pagination-previous /-->
<!-- wp:query-pagination-numbers /-->
<!-- wp:query-pagination-next /-->
<!-- /wp:query-pagination -->
</div>
<!-- /wp:query -->
</section>
<!-- /wp:group -->
