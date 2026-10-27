<?php
/**
 * Title: Article sidebar
 * Slug: wp-tracy-business/sidebar-article
 * Description: The article sidebar (parts/sidebar-article.html): contents, downloads and the request card. Its words go through the theme's text domain, so a site in another language shows them in it.
 * Categories: wp-tracy-business
 * Inserter: no
 *
 * @package wp-tracy-business
 */
?>
<!-- wp:group {"className":"tracy-aside__card tracy-aside__toc","layout":{"type":"default"},"metadata":{"name":"single.toc"}} -->
<div class="wp-block-group tracy-aside__card tracy-aside__toc">
<!-- wp:paragraph {"className":"tracy-aside__label"} -->
<p class="tracy-aside__label"><?php echo esc_html__( 'In this article', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:list {"className":"tracy-aside__toc-list","metadata":{"name":"single.toc.list"}} -->
<ul class="wp-block-list tracy-aside__toc-list"></ul>
<!-- /wp:list -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"tracy-aside__card tracy-aside__downloads","layout":{"type":"default"},"metadata":{"name":"single.downloads"}} -->
<div class="wp-block-group tracy-aside__card tracy-aside__downloads">
<!-- wp:paragraph {"className":"tracy-aside__label"} -->
<p class="tracy-aside__label"><?php echo esc_html__( 'Downloads', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:list {"className":"tracy-aside__list tracy-aside__downloads-list","metadata":{"name":"single.downloads.list"}} -->
<ul class="wp-block-list tracy-aside__list tracy-aside__downloads-list"></ul>
<!-- /wp:list -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"tracy-aside__card tracy-aside__cta","layout":{"type":"default"}} -->
<div class="wp-block-group tracy-aside__card tracy-aside__cta">
<!-- wp:heading {"level":2,"className":"tracy-aside__cta-title"} -->
<h2 class="wp-block-heading tracy-aside__cta-title"><?php echo esc_html__( 'Need advice on your next project?', 'wp-tracy-business' ); ?></h2>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"tracy-aside__cta-text"} -->
<p class="tracy-aside__cta-text"><?php echo esc_html__( 'Our engineering team reviews your first set of drawings free of charge.', 'wp-tracy-business' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:buttons {"className":"tracy-aside__cta-actions"} -->
<div class="wp-block-buttons tracy-aside__cta-actions">
<!-- wp:button {"className":"is-style-orange"} -->
<div class="wp-block-button is-style-orange"><a class="wp-block-button__link wp-element-button" href="/contact/"><?php echo esc_html__( 'Send a request', 'wp-tracy-business' ); ?></a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->
</div>
<!-- /wp:group -->
