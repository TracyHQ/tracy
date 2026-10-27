<?php
/**
 * Title: Two offer panels
 * Slug: wp-ja-fresco/acm-features-2
 * Description: Side-by-side panels, each a picture under a coloured veil with a large centred title, an offer line and its price at the bottom and an arrow; the whole panel is the link (Joomla ACM `features-intro` style-2 of JA Fresco).
 * Categories: wp-ja-fresco, tracy
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: offers, events, panels, promotion, acm
 *
 * @package wp-ja-fresco
 */
?>
<!-- wp:group {"tagName":"section","className":"jf-acm t4-mod-wrap acm-features style-2","metadata":{"name":"features-intro.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jf-acm t4-mod-wrap acm-features style-2">
<!-- wp:group {"className":"features-list","metadata":{"name":"features-intro.list"},"layout":{"type":"default"}} -->
<div class="wp-block-group features-list">
<!-- wp:group {"className":"features-item style-primary","metadata":{"name":"features-intro.item.1"},"layout":{"type":"default"}} -->
<div class="wp-block-group features-item style-primary">
<!-- wp:image {"sizeSlug":"full","className":"features-bg","metadata":{"role":"content","name":"features-intro.img-bg.1"}} -->
<figure class="wp-block-image size-full features-bg"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- wp:heading {"className":"features-title","metadata":{"role":"content","name":"features-intro.title.1"}} -->
<h2 class="wp-block-heading features-title"><a href="#"><?php esc_html_e( 'A panel title', 'wp-ja-fresco' ); ?></a></h2>
<!-- /wp:heading -->
<!-- wp:group {"className":"action-title","layout":{"type":"default"}} -->
<div class="wp-block-group action-title">
<!-- wp:paragraph {"className":"action-label","metadata":{"role":"content","name":"features-intro.link-title.1"}} -->
<p class="action-label"><?php esc_html_e( 'On sale now!', 'wp-ja-fresco' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"action-sub","metadata":{"role":"content","name":"features-intro.link-sub.1"}} -->
<p class="action-sub"><?php esc_html_e( 'For $50', 'wp-ja-fresco' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- wp:paragraph {"className":"jf-container more-info","metadata":{"role":"content","name":"features-intro.more-info"}} -->
<p class="jf-container more-info"><?php esc_html_e( 'A closing line under the panels.', 'wp-ja-fresco' ); ?></p>
<!-- /wp:paragraph -->
</section>
<!-- /wp:group -->
