<?php
/**
 * Title: Latest articles
 * Slug: wp-ja-morgan/acm-latest
 * Description: A section title with a "view all" link over the four most recent articles of the Investment Managment category, each a picture, a date, a title and a short intro (the mod_articles_latest module of JA Morgan on Home style 4).
 * Categories: wp-ja-morgan, tracy
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: blog, news, latest, articles, acm
 *
 * @package wp-ja-morgan
 */
?>
<!-- wp:group {"tagName":"section","className":"jm-acm","metadata":{"name":"latest.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jm-acm">
<!-- wp:image {"sizeSlug":"full","className":"jm-section-bg","metadata":{"role":"content","name":"latest.section-bg"}} -->
<figure class="wp-block-image size-full jm-section-bg"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- wp:group {"className":"container","layout":{"type":"default"}} -->
<div class="wp-block-group container">
<!-- wp:group {"className":"section-title","layout":{"type":"default"}} -->
<div class="wp-block-group section-title">
<!-- wp:paragraph {"className":"sub-heading","metadata":{"role":"content","name":"latest.sub-heading"}} -->
<p class="sub-heading"><?php esc_html_e( 'Our Blog.', 'wp-ja-morgan' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"level":3,"className":"h2 jm-module-title","metadata":{"role":"content","name":"latest.module-title"}} -->
<h3 class="wp-block-heading h2 jm-module-title"><?php esc_html_e( 'Latest articles', 'wp-ja-morgan' ); ?></h3>
<!-- /wp:heading -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"wrap-last-article","layout":{"type":"default"}} -->
<div class="wp-block-group wrap-last-article">
<!-- wp:buttons {"className":"view-all"} -->
<div class="wp-block-buttons view-all"><!-- wp:button {"className":"jm-view-all","metadata":{"role":"content","name":"latest.view-all"}} -->
<div class="wp-block-button jm-view-all"><a class="wp-block-button__link wp-element-button" href="/joomlart-content/category-blog/"><?php esc_html_e( 'View all Posts', 'wp-ja-morgan' ); ?></a></div>
<!-- /wp:button --></div>
<!-- /wp:buttons -->
<!-- wp:query {"queryId":71,"query":{"perPage":4,"pages":0,"offset":0,"postType":"post","order":"desc","orderBy":"date","inherit":false,"jmOrder":"latest","jmCategory":"investment-managment"},"className":"latest-news mod-list"} -->
<div class="wp-block-query latest-news mod-list">
<!-- wp:post-template {"className":"row","layout":{"type":"default"}} -->
<!-- wp:group {"className":"article-detail","layout":{"type":"default"}} -->
<div class="wp-block-group article-detail">
<!-- wp:post-featured-image {"isLink":false,"sizeSlug":"large","className":"intro-image"} /-->
<!-- wp:group {"className":"article-content","layout":{"type":"default"}} -->
<div class="wp-block-group article-content">
<!-- wp:post-date {"className":"date-create"} /-->
<!-- wp:post-title {"level":3,"isLink":true,"className":"heading-link"} /-->
<!-- wp:post-excerpt {"moreText":"","excerptLength":20,"className":"articles-introtext jm-latest-excerpt"} /-->
</div>
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
</section>
<!-- /wp:group -->
