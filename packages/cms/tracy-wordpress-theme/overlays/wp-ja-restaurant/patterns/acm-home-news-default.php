<?php
/**
 * Title: Home main body (news and sidebar)
 * Slug: wp-ja-restaurant/acm-home-news-default
 * Description: The home page's main body: the sticky articles under a page heading, and a sidebar with the category list and a carousel of customer quotes (mirrors the t3-mainbody of the JA Restaurant home page).
 * Categories: wp-ja-restaurant, tracy
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: news, blog, articles, categories, testimonials, sidebar, home
 *
 * @package wp-ja-restaurant
 */
?>
<!-- wp:group {"className":"container t3-mainbody","metadata":{"name":"home-news.root"},"layout":{"type":"default"}} -->
<div class="wp-block-group container t3-mainbody">
<!-- wp:group {"className":"row","layout":{"type":"default"}} -->
<div class="wp-block-group row">
<!-- wp:group {"className":"t3-content col-xs-12 col-sm-12 col-md-8","layout":{"type":"default"}} -->
<div class="wp-block-group t3-content col-xs-12 col-sm-12 col-md-8">
<!-- wp:group {"className":"blog-featured","layout":{"type":"default"}} -->
<div class="wp-block-group blog-featured">
<!-- wp:group {"className":"page-header","layout":{"type":"default"}} -->
<div class="wp-block-group page-header">
<!-- wp:heading {"level":1,"className":"jr-news-heading","metadata":{"role":"content","name":"home-news.heading"}} -->
<h1 class="wp-block-heading jr-news-heading"><?php esc_html_e( 'Read the latest News', 'wp-ja-restaurant' ); ?></h1>
<!-- /wp:heading -->
</div>
<!-- /wp:group -->
<!-- wp:query {"queryId":0,"query":{"perPage":3,"pages":0,"offset":0,"postType":"post","order":"desc","orderBy":"date","author":"","search":"","exclude":[],"sticky":"only","inherit":false},"className":"items-row cols-1 row"} -->
<div class="wp-block-query items-row cols-1 row">
<!-- wp:post-template {"layout":{"type":"default"}} -->
<!-- wp:group {"className":"item col-12 column-1 col-md-12","layout":{"type":"default"}} -->
<div class="wp-block-group item col-12 column-1 col-md-12">
<!-- wp:group {"tagName":"article","layout":{"type":"default"}} -->
<article class="wp-block-group">
<!-- wp:group {"className":"intro-image","layout":{"type":"default"}} -->
<div class="wp-block-group intro-image">
<!-- wp:group {"className":"pull-none item-image","layout":{"type":"default"}} -->
<div class="wp-block-group pull-none item-image">
<!-- wp:post-featured-image {"isLink":true} /-->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"info-article","layout":{"type":"default"}} -->
<div class="wp-block-group info-article">
<!-- wp:group {"tagName":"header","className":"article-header clearfix","layout":{"type":"default"}} -->
<header class="wp-block-group article-header clearfix">
<!-- wp:post-title {"level":2,"isLink":true,"className":"article-title"} /-->
</header>
<!-- /wp:group -->
<!-- wp:group {"tagName":"aside","className":"article-aside clearfix","layout":{"type":"default"}} -->
<aside class="wp-block-group article-aside clearfix">
<!-- wp:group {"className":"article-info muted","layout":{"type":"default"}} -->
<div class="wp-block-group article-info muted">
<!-- wp:group {"className":"createdby","layout":{"type":"default"}} -->
<div class="wp-block-group createdby">
<!-- wp:html -->
<i class="fa fa-user" aria-hidden="true"></i>
<!-- /wp:html -->
<!-- wp:post-author-name /-->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"category-name","layout":{"type":"default"}} -->
<div class="wp-block-group category-name">
<!-- wp:html -->
<i class="fa fa-folder-open" aria-hidden="true"></i>
<!-- /wp:html -->
<!-- wp:post-terms {"term":"category"} /-->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"published","layout":{"type":"default"}} -->
<div class="wp-block-group published">
<!-- wp:html -->
<i class="fa fa-calendar" aria-hidden="true"></i>
<!-- /wp:html -->
<!-- wp:post-date /-->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</aside>
<!-- /wp:group -->
<!-- wp:post-excerpt {"moreText":"","excerptLength":60,"className":"article-intro clearfix"} /-->
</div>
<!-- /wp:group -->
</article>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- /wp:post-template -->
</div>
<!-- /wp:query -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"t3-sidebar t3-sidebar-right col-xs-12 col-sm-12 col-md-4","layout":{"type":"default"}} -->
<div class="wp-block-group t3-sidebar t3-sidebar-right col-xs-12 col-sm-12 col-md-4">
<!-- wp:group {"className":"t3-module module module-primary no-padding","layout":{"type":"default"}} -->
<div class="wp-block-group t3-module module module-primary no-padding">
<!-- wp:group {"className":"module-inner","layout":{"type":"default"}} -->
<div class="wp-block-group module-inner">
<!-- wp:heading {"level":3,"className":"module-title","metadata":{"role":"content","name":"home-news.categories-title"}} -->
<h3 class="wp-block-heading module-title"><?php esc_html_e( 'Categories', 'wp-ja-restaurant' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:group {"className":"module-ct","layout":{"type":"default"}} -->
<div class="wp-block-group module-ct">
<!-- wp:categories {"className":"mod-articlescategories categories-module mod-list"} /-->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"t3-module module module-dark","layout":{"type":"default"}} -->
<div class="wp-block-group t3-module module module-dark">
<!-- wp:group {"className":"module-inner","layout":{"type":"default"}} -->
<div class="wp-block-group module-inner">
<!-- wp:heading {"level":3,"className":"module-title","metadata":{"role":"content","name":"home-news.testimonials-title"}} -->
<h3 class="wp-block-heading module-title"><?php esc_html_e( 'Happy customers', 'wp-ja-restaurant' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:group {"className":"module-ct","layout":{"type":"default"}} -->
<div class="wp-block-group module-ct">
<!-- wp:group {"className":"acm-testimonials","layout":{"type":"default"}} -->
<div class="wp-block-group acm-testimonials">
<!-- wp:group {"className":"testimonial-content owl-carousel tracy-motion-carousel tracy-motion-carousel--nav","layout":{"type":"default"}} -->
<div class="wp-block-group testimonial-content owl-carousel tracy-motion-carousel tracy-motion-carousel--nav">
<!-- wp:group {"className":"tracy-motion-track","metadata":{"name":"home-news.list"},"layout":{"type":"default"}} -->
<div class="wp-block-group tracy-motion-track">
<!-- wp:group {"className":"item","metadata":{"name":"home-news.item.1"},"layout":{"type":"default"}} -->
<div class="wp-block-group item">
<!-- wp:paragraph {"className":"testimonial-text","metadata":{"role":"content","name":"home-news.testimonial-text.1"}} -->
<p class="testimonial-text"><?php esc_html_e( 'A customer quote of two or three lines.', 'wp-ja-restaurant' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:group {"className":"text-center","layout":{"type":"default"}} -->
<div class="wp-block-group text-center">
<!-- wp:paragraph {"className":"author-name","metadata":{"role":"content","name":"home-news.author-name.1"}} -->
<p class="author-name"><span class="author-info-text"><?php esc_html_e( 'Customer name', 'wp-ja-restaurant' ); ?></span></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"author-info","layout":{"type":"default"}} -->
<div class="wp-block-group author-info">
<!-- wp:image {"sizeSlug":"full","className":"author-image","metadata":{"role":"content","name":"home-news.author-img.1"}} -->
<figure class="wp-block-image size-full author-image"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
