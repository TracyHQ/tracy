<?php
/**
 * Title: Team — from posts
 * Slug: tracy-base/section-team-query
 * Description: A heading and up to four people pulled from posts, for a mega-menu panel — the Joomla ACM block `team` in `style-2`, which reads articles of one category. The one place the core Query block is the right tool: set the category in the block's filter. The source splits "Name — Role" out of one article title; that is not a core feature, so the post title is the name and the excerpt is the role.
 * Categories: tracy-base, tracy
 * Block Types: core/query
 * Viewport Width: 800
 * Inserter: yes
 * Keywords: team, people, menu, query, acm
 *
 * @package tracy-base
 */
?>
<!-- wp:group {"className":"acm-team acm-team--query"} -->
<div class="wp-block-group acm-team acm-team--query">
<!-- wp:paragraph {"className":"tracy-eyebrow","metadata":{"role":"content","name":"team.heading"}} -->
<p class="tracy-eyebrow"><?php esc_html_e( 'The people behind the work', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:query {"queryId":11,"query":{"perPage":4,"pages":0,"offset":0,"postType":"post","order":"asc","orderBy":"menu_order","author":"","search":"","exclude":[],"sticky":"","inherit":false},"className":"acm-team__query","metadata":{"name":"team.source-category"},"layout":{"type":"default"}} -->
<div class="wp-block-query acm-team__query">
<!-- wp:post-template {"className":"acm-team__people tracy-grid","layout":{"type":"grid","columnCount":4}} -->
<!-- wp:group {"className":"acm-team__person","layout":{"type":"default"}} -->
<div class="wp-block-group acm-team__person">
<!-- wp:post-featured-image {"isLink":true,"aspectRatio":"1","sizeSlug":"medium","className":"acm-team__portrait rounded-pill overflow-hidden mb-2"} /-->
<!-- wp:post-title {"level":3,"isLink":true,"className":"text-sm mb-0"} /-->
<!-- wp:post-excerpt {"excerptLength":8,"className":"acm-team__role tracy-meta"} /-->
</div>
<!-- /wp:group -->
<!-- /wp:post-template -->
<!-- wp:query-no-results -->
<!-- wp:paragraph {"className":"tracy-muted"} -->
<p class="tracy-muted"><?php esc_html_e( 'No team members yet.', 'tracy-base' ); ?></p>
<!-- /wp:paragraph -->
<!-- /wp:query-no-results -->
</div>
<!-- /wp:query -->
<!-- wp:paragraph {"className":"acm-team__all mt-4 mb-0","metadata":{"role":"content","name":"team.all-link"}} -->
<p class="acm-team__all mt-4 mb-0"><a href="#"><?php esc_html_e( 'Meet the whole team', 'tracy-base' ); ?></a></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
