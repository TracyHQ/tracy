<?php
/**
 * Title: Icon cards with a title and a line
 * Slug: wp-ja-fresco/acm-features-5
 * Description: A section title and lead, then cards in two or three columns, each with an icon picture, a linked title and a short line (Joomla ACM `features-intro` style-5 of JA Fresco).
 * Categories: wp-ja-fresco, tracy
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: feature, icons, cards, services, acm
 *
 * @package wp-ja-fresco
 */
?>
<!-- wp:group {"tagName":"section","className":"jf-acm t4-mod-wrap acm-features style-5","metadata":{"name":"features-intro.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jf-acm t4-mod-wrap acm-features style-5">
<!-- wp:group {"className":"jf-container section-title-wrap","metadata":{"name":"features-intro.head"},"layout":{"type":"default"}} -->
<div class="wp-block-group jf-container section-title-wrap">
<!-- wp:paragraph {"className":"section-title","metadata":{"role":"content","name":"features-intro.module-title"}} -->
<p class="section-title"><?php esc_html_e( 'Eyebrow', 'wp-ja-fresco' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"className":"main-title","metadata":{"role":"content","name":"features-intro.main-section"}} -->
<h2 class="wp-block-heading main-title"><?php esc_html_e( 'A section title', 'wp-ja-fresco' ); ?></h2>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"section-top-desc lead","metadata":{"role":"content","name":"features-intro.top-desc"}} -->
<p class="section-top-desc lead"><?php esc_html_e( 'A lead of one or two lines.', 'wp-ja-fresco' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"jf-container","layout":{"type":"default"}} -->
<div class="wp-block-group jf-container">
<!-- wp:group {"className":"features-list acm-features-intro--cols-3 is-center","metadata":{"name":"features-intro.list"},"layout":{"type":"default"}} -->
<div class="wp-block-group features-list acm-features-intro--cols-3 is-center">
<!-- wp:group {"className":"features-item","metadata":{"name":"features-intro.item.1"},"layout":{"type":"default"}} -->
<div class="wp-block-group features-item">
<!-- wp:image {"sizeSlug":"full","className":"img-icon","metadata":{"role":"content","name":"features-intro.img-icon.1"}} -->
<figure class="wp-block-image size-full img-icon"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- wp:heading {"level":3,"className":"feature-title","metadata":{"role":"content","name":"features-intro.title.1"}} -->
<h3 class="wp-block-heading feature-title"><a href="#"><?php esc_html_e( 'A card title', 'wp-ja-fresco' ); ?></a></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"features-desc","metadata":{"role":"content","name":"features-intro.description.1"}} -->
<p class="features-desc"><?php esc_html_e( 'One or two short lines.', 'wp-ja-fresco' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
