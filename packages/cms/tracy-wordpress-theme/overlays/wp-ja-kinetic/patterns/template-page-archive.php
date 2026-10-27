<?php
/**
 * Title: Template body: page-archive
 * Slug: wp-ja-kinetic/template-page-archive
 * Description: The body of templates/page-archive.html between the header and the footer. Its interface words go through the theme's text domain, so a site in another language shows them in it.
 * Categories: wp-ja-kinetic
 * Inserter: no
 *
 * @package wp-ja-kinetic
 */
?>
<!-- wp:group {"tagName":"main","className":"hx-archive","layout":{"type":"default"}} -->
<main class="wp-block-group hx-archive">
<!-- wp:group {"tagName":"header","className":"hx-archmast hx-grid-bg","layout":{"type":"default"}} -->
<header class="wp-block-group hx-archmast hx-grid-bg">
<!-- wp:group {"className":"hx-container hx-pad hx-archmast__inner","layout":{"type":"default"}} -->
<div class="wp-block-group hx-container hx-pad hx-archmast__inner">
<!-- wp:group {"tagName":"nav","className":"hx-archmast__bc"} -->
<nav class="wp-block-group hx-archmast__bc" aria-label="Breadcrumb">
<!-- wp:paragraph {"metadata":{"name":"page.crumb"}} -->
<p></p>
<!-- /wp:paragraph -->
</nav>
<!-- /wp:group -->
<!-- wp:group {"tagName":"span","className":"hx-archmast__pill","layout":{"type":"default"}} -->
<span class="wp-block-group hx-archmast__pill"><span class="hx-archmast__dot" aria-hidden="true"></span><?php echo esc_html__( 'ARCHIVE', 'wp-ja-kinetic' ); ?></span>
<!-- /wp:group -->
<!-- wp:heading {"level":1,"className":"hx-archmast__title"} -->
<h1 class="wp-block-heading hx-archmast__title"><?php echo esc_html__( 'Article archive', 'wp-ja-kinetic' ); ?></h1>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"hx-archmast__sub","metadata":{"name":"page.lede"}} -->
<p class="hx-archmast__sub"></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</header>
<!-- /wp:group -->
<!-- wp:group {"tagName":"section","className":"hx-section hx-arch-section","layout":{"type":"default"}} -->
<section class="wp-block-group hx-section hx-arch-section">
<!-- wp:group {"className":"hx-container hx-pad hx-arch-grid","layout":{"type":"default"}} -->
<div class="wp-block-group hx-container hx-pad hx-arch-grid">
<!-- wp:wp-ja-kinetic/archive-months {"archivedOnly":true} /-->
<!-- wp:group {"className":"hx-arch-list","layout":{"type":"default"}} -->
<div class="wp-block-group hx-arch-list">
<!-- wp:query {"queryId":1,"query":{"perPage":10,"pages":0,"offset":0,"postType":"post","order":"desc","orderBy":"date","inherit":false,"wpJaKineticArchived":true},"layout":{"type":"default"}} -->
<div class="wp-block-query">
<!-- wp:post-template {"layout":{"type":"default"}} -->
<!-- wp:group {"className":"hx-archrow","layout":{"type":"flex","flexWrap":"nowrap"}} -->
<div class="wp-block-group hx-archrow">
<!-- wp:group {"className":"hx-archrow__tc","layout":{"type":"default"}} -->
<div class="wp-block-group hx-archrow__tc">
<!-- wp:post-title {"level":3,"isLink":true,"className":"hx-archrow__t"} /-->
<!-- wp:group {"className":"hx-archrow__m","layout":{"type":"flex","flexWrap":"nowrap"}} -->
<div class="wp-block-group hx-archrow__m">
<!-- wp:post-terms {"term":"category","className":"hx-archrow__cat"} /-->
<!-- wp:post-date /-->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- wp:paragraph {"className":"hx-archrow__arr","fontSize":"large"} -->
<p class="hx-archrow__arr has-large-font-size" aria-hidden="true">&#8594;</p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- /wp:post-template -->
<!-- wp:query-no-results -->
<!-- wp:paragraph {"className":"hx-arch-empty","metadata":{"name":"page.empty"}} -->
<p class="hx-arch-empty"></p>
<!-- /wp:paragraph -->
<!-- /wp:query-no-results -->
<!-- wp:group {"className":"hx-arch-pagination pagination-wrap","layout":{"type":"flex"}} -->
<div class="wp-block-group hx-arch-pagination pagination-wrap">
<!-- wp:wp-ja-kinetic/kinetic-pagination /-->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:query -->
</div>
<!-- /wp:group -->
<!-- wp:group {"tagName":"aside","className":"hx-arch-rail hx-arch-tags","layout":{"type":"default"}} -->
<aside class="wp-block-group hx-arch-rail hx-arch-tags" aria-label="Tags">
<!-- wp:group {"tagName":"span","className":"hx-arch-rail__h","layout":{"type":"default"}} -->
<span class="wp-block-group hx-arch-rail__h"><?php echo esc_html__( 'Tags', 'wp-ja-kinetic' ); ?></span>
<!-- /wp:group -->
<!-- wp:wp-ja-kinetic/popular-tags {"numberOfTags":12,"className":"hx-tagcloud","linkClassName":"hx-tagchip"} /-->
</aside>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
</main>
<!-- /wp:group -->
