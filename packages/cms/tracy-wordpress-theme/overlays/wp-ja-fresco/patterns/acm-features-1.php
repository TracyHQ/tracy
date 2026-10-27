<?php
/**
 * Title: Picture cards with a title and a link
 * Slug: wp-ja-fresco/acm-features-1
 * Description: An optional eyebrow, title and lead, then tall picture cards that darken towards the bottom, each with a title and a short line; the whole card is the link (Joomla ACM `features-intro` style-1 of JA Fresco).
 * Categories: wp-ja-fresco, tracy
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: features, cards, services, locations, acm
 *
 * @package wp-ja-fresco
 */
?>
<!-- wp:group {"tagName":"section","className":"jf-acm t4-mod-wrap acm-features style-1","metadata":{"name":"features-intro.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jf-acm t4-mod-wrap acm-features style-1">
<!-- wp:group {"className":"jf-container section-title-wrap","metadata":{"name":"features-intro.head"},"layout":{"type":"default"}} -->
<div class="wp-block-group jf-container section-title-wrap">
<!-- wp:paragraph {"className":"section-title","metadata":{"role":"content","name":"features-intro.module-title"}} -->
<p class="section-title"><?php esc_html_e( 'Eyebrow', 'wp-ja-fresco' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"className":"main-title","metadata":{"role":"content","name":"features-intro.main-section"}} -->
<h2 class="wp-block-heading main-title"><?php esc_html_e( 'A section title', 'wp-ja-fresco' ); ?></h2>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"section-top-desc lead","metadata":{"role":"content","name":"features-intro.top-desc"}} -->
<p class="section-top-desc lead"><?php esc_html_e( 'A lead of two or three lines.', 'wp-ja-fresco' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"section-top-desc lead","metadata":{"role":"content","name":"features-intro.top-desc-2"}} -->
<p class="section-top-desc lead"><?php esc_html_e( 'A second short paragraph.', 'wp-ja-fresco' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"features-list is-center","metadata":{"name":"features-intro.list"},"layout":{"type":"default"}} -->
<div class="wp-block-group features-list is-center">
<!-- wp:group {"className":"features-item","metadata":{"name":"features-intro.item.1"},"layout":{"type":"default"}} -->
<div class="wp-block-group features-item">
<!-- wp:image {"sizeSlug":"full","className":"features-bg","metadata":{"role":"content","name":"features-intro.img-icon.1"}} -->
<figure class="wp-block-image size-full features-bg"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- wp:group {"className":"item-inner","layout":{"type":"default"}} -->
<div class="wp-block-group item-inner">
<!-- wp:heading {"level":3,"className":"features-title","metadata":{"role":"content","name":"features-intro.title.1"}} -->
<h3 class="wp-block-heading features-title"><a href="#"><?php esc_html_e( 'A card title', 'wp-ja-fresco' ); ?></a></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"features-desc","metadata":{"role":"content","name":"features-intro.description.1"}} -->
<p class="features-desc"><?php esc_html_e( 'One short line', 'wp-ja-fresco' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
