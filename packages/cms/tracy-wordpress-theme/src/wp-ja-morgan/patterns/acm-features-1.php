<?php
/**
 * Title: Introduction with picture cards
 * Slug: wp-ja-morgan/acm-features-1
 * Description: A section title with a lead on the left and picture cards on the right, each with a title, a short text and an arrow link; below 768 px the cards step one at a time (Joomla ACM `features-intro` style-1 of JA Morgan).
 * Categories: wp-ja-morgan, tracy
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: introduction, features, cards, carousel, acm
 *
 * @package wp-ja-morgan
 */
?>
<!-- wp:group {"tagName":"section","className":"jm-acm","metadata":{"name":"features-intro.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jm-acm">
<!-- wp:image {"sizeSlug":"full","className":"jm-section-bg","metadata":{"role":"content","name":"features-intro.section-bg"}} -->
<figure class="wp-block-image size-full jm-section-bg"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- wp:group {"className":"container","layout":{"type":"default"}} -->
<div class="wp-block-group container">
<!-- wp:group {"className":"acm-features style-1","layout":{"type":"default"}} -->
<div class="wp-block-group acm-features style-1">
<!-- wp:group {"className":"section-title","layout":{"type":"default"}} -->
<div class="wp-block-group section-title">
<!-- wp:paragraph {"className":"sub-heading","metadata":{"role":"content","name":"features-intro.sub-heading"}} -->
<p class="sub-heading"><?php esc_html_e( 'Introducing.', 'wp-ja-morgan' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"level":3,"className":"jm-module-title","metadata":{"role":"content","name":"features-intro.module-title"}} -->
<h3 class="wp-block-heading jm-module-title"><?php esc_html_e( 'A section title', 'wp-ja-morgan' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"acm-features-intro lead","metadata":{"role":"content","name":"features-intro.block-intro"}} -->
<p class="acm-features-intro lead"><?php esc_html_e( 'A lead of three or four lines.', 'wp-ja-morgan' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"acm-feature-slide tracy-motion-carousel tracy-motion-carousel--nav","layout":{"type":"default"}} -->
<div class="wp-block-group acm-feature-slide tracy-motion-carousel tracy-motion-carousel--nav">
<!-- wp:group {"className":"tracy-motion-track","metadata":{"name":"features-intro.list"},"layout":{"type":"default"}} -->
<div class="wp-block-group tracy-motion-track">
<!-- wp:group {"className":"features-item","metadata":{"name":"features-intro.item.1"},"layout":{"type":"default"}} -->
<div class="wp-block-group features-item">
<!-- wp:image {"sizeSlug":"full","className":"features-img","metadata":{"role":"content","name":"features-intro.img.1"}} -->
<figure class="wp-block-image size-full features-img"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- wp:heading {"level":4,"className":"jm-title","metadata":{"role":"content","name":"features-intro.title.1"}} -->
<h4 class="wp-block-heading jm-title"><?php esc_html_e( 'A card title', 'wp-ja-morgan' ); ?></h4>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"jm-description","metadata":{"role":"content","name":"features-intro.description.1"}} -->
<p class="jm-description"><?php esc_html_e( 'Two or three lines about it.', 'wp-ja-morgan' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"action-link-icon","metadata":{"role":"content","name":"features-intro.action.1"}} -->
<p class="action-link-icon"><a href="#">Read more</a></p>
<!-- /wp:paragraph -->
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
</section>
<!-- /wp:group -->
