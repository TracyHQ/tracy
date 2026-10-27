<?php
/**
 * Title: Left sidebar
 * Slug: tracy-base/page-sidebar-left
 * Description: The sidebar of the Sidebar left page template (templates/page-sidebar-left.html): the latest five posts and the topics with their post counts. Its headings go through the theme's text domain, so a site in another language shows them in it.
 * Categories: tracy-base
 * Inserter: no
 *
 * @package tracy-base
 */
?>
<!-- wp:heading {"level":2,"className":"tracy-eyebrow"} -->
<h2 class="wp-block-heading tracy-eyebrow"><?php echo esc_html__( 'Latest', 'tracy-base' ); ?></h2>
<!-- /wp:heading -->
<!-- wp:query {"queryId":12,"query":{"perPage":5,"pages":0,"offset":0,"postType":"post","order":"desc","orderBy":"date","inherit":false},"className":"tracy-page__latest"} -->
<div class="wp-block-query tracy-page__latest">
<!-- wp:post-template {"layout":{"type":"default"}} -->
<!-- wp:post-title {"level":3,"isLink":true} /-->
<!-- wp:post-date {"className":"tracy-meta"} /-->
<!-- /wp:post-template -->
</div>
<!-- /wp:query -->
<!-- wp:heading {"level":2,"className":"tracy-eyebrow"} -->
<h2 class="wp-block-heading tracy-eyebrow"><?php echo esc_html__( 'Topics', 'tracy-base' ); ?></h2>
<!-- /wp:heading -->
<!-- wp:categories {"showPostCounts":true} /-->
