<?php
/**
 * Title: Template body: category-engineering
 * Slug: wp-ja-kinetic/template-category-engineering
 * Description: The body of templates/category-engineering.html between the header and the footer. Its interface words go through the theme's text domain, so a site in another language shows them in it.
 * Categories: wp-ja-kinetic
 * Inserter: no
 *
 * @package wp-ja-kinetic
 */
?>
<!-- wp:group {"tagName":"main","className":"hxcat hx-content","layout":{"type":"default"}} -->
<main class="wp-block-group hxcat hx-content">
<!-- wp:group {"tagName":"header","className":"hxcat-mast","layout":{"type":"default"}} -->
<header class="wp-block-group hxcat-mast">
<!-- wp:group {"className":"hxcat-mast__inner","layout":{"type":"default"}} -->
<div class="wp-block-group hxcat-mast__inner">
<!-- wp:group {"tagName":"nav","className":"hxcat-bc"} -->
<nav class="wp-block-group hxcat-bc" aria-label="Breadcrumb">
<!-- wp:paragraph -->
<p><a class="hxcat-bc__home" href="<?php echo esc_url( home_url( '/' ) ); ?>"><?php echo esc_html__( 'Home', 'wp-ja-kinetic' ); ?></a><span class="hxcat-bc__rest">/ <?php $wp_ja_kinetic_blog_link = wp_ja_kinetic_live_page_link( 'product/blog', __( 'Blog', 'wp-ja-kinetic' ), 'hxcat-bc__crumb' ); echo $wp_ja_kinetic_blog_link ? $wp_ja_kinetic_blog_link . ' / ' : ''; ?><?php echo esc_html( single_term_title( '', false ) ); ?></span></p>
<!-- /wp:paragraph -->
</nav>
<!-- /wp:group -->
<!-- wp:paragraph {"className":"hxcat-pill"} -->
<p class="hxcat-pill"><?php echo esc_html__( 'Category', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:query-title {"type":"archive","level":1,"className":"hxcat-h1","showPrefix":false} /-->
<!-- wp:term-description {"className":"hxcat-sub"} /-->
</div>
<!-- /wp:group -->
</header>
<!-- /wp:group -->
<!-- wp:group {"tagName":"section","className":"hxcat-body","layout":{"type":"default"}} -->
<section class="wp-block-group hxcat-body">
<!-- wp:group {"className":"hxcat-grid","layout":{"type":"flex","flexWrap":"nowrap"}} -->
<div class="wp-block-group hxcat-grid">
<!-- wp:group {"className":"hxcat-main","layout":{"type":"default"}} -->
<div class="wp-block-group hxcat-main">
<!-- wp:query {"queryId":1,"query":{"perPage":6,"pages":0,"offset":0,"postType":"post","order":"desc","orderBy":"date","inherit":true},"layout":{"type":"default"}} -->
<div class="wp-block-query">
<!-- wp:post-template {"layout":{"type":"default"}} -->
<!-- wp:group {"className":"hxcat-row","layout":{"type":"flex","flexWrap":"nowrap"}} -->
<div class="wp-block-group hxcat-row">
<!-- wp:wp-ja-kinetic/category-card-part {"part":"cover"} /-->
<!-- wp:group {"className":"hxcat-row__body","layout":{"type":"default"}} -->
<div class="wp-block-group hxcat-row__body">
<!-- wp:wp-ja-kinetic/category-card-part {"part":"eyebrow"} /-->
<!-- wp:post-title {"level":3,"isLink":true,"className":"hxcat-row__title"} /-->
<!-- wp:post-excerpt {"className":"hxcat-row__excerpt"} /-->
<!-- wp:wp-ja-kinetic/category-card-part {"part":"meta"} /-->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- /wp:post-template -->
<!-- wp:query-no-results -->
<!-- wp:paragraph {"className":"hxcat-empty hx-muted"} -->
<p class="hxcat-empty hx-muted"><?php echo esc_html__( 'No articles found.', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- /wp:query-no-results -->
</div>
<!-- /wp:query -->
</div>
<!-- /wp:group -->
<!-- wp:group {"tagName":"aside","className":"hxcat-aside","layout":{"type":"default"}} -->
<aside class="wp-block-group hxcat-aside">
<!-- wp:wp-ja-kinetic/category-siblings /-->
<!-- wp:group {"className":"hxcat-card hxcat-tags","layout":{"type":"default"}} -->
<div class="wp-block-group hxcat-card hxcat-tags">
<!-- wp:paragraph {"className":"hxcat-card__h"} -->
<p class="hxcat-card__h"><?php echo esc_html__( 'Popular tags', 'wp-ja-kinetic' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:wp-ja-kinetic/popular-tags {"numberOfTags":10,"className":"hxcat-cloud","linkClassName":"hxcat-chip"} /-->
</div>
<!-- /wp:group -->
</aside>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
</main>
<!-- /wp:group -->
