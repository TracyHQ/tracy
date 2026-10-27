<?php
/**
 * Title: Tagged articles
 * Slug: wp-ja-impact/gb-tagged
 * Description: A filter box and the titles of the articles that carry the page's tags, in alphabetical order, with the Joomla pager (Joomla tagged items view).
 * Categories: wp-ja-impact
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: tags, list, titles, filter
 *
 * @package wp-ja-impact
 */
?>
<!-- wp:group {"tagName":"section","className":"jim-acm jim-gb jim-gb--tagged acm-articles-category style-tagged","metadata":{"name":"articles-category.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jim-acm jim-gb jim-gb--tagged acm-articles-category style-tagged">
<!-- wp:search {"label":"Search","showLabel":false,"placeholder":"Enter Part of Title","buttonText":"Search","buttonUseIcon":true,"className":"jim-gb-filter"} /-->
<!-- wp:query {"queryId":3408,"query":{"perPage":20,"pages":0,"offset":0,"postType":"post","order":"asc","orderBy":"title","author":"","search":"","exclude":[],"sticky":"","inherit":false,"wpJaImpactTagged":true},"className":"jim-gb-tagged"} -->
<div class="wp-block-query jim-gb-tagged">
<!-- wp:post-template {"className":"jim-gb-tagged__list"} -->
<!-- wp:post-title {"level":3,"isLink":true,"className":"jim-gb-tagged__title","metadata":{"role":"content","name":"articles-category.title"}} -->
<h3 class="wp-block-post-title jim-gb-tagged__title"></h3>
<!-- /wp:post-title -->
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
