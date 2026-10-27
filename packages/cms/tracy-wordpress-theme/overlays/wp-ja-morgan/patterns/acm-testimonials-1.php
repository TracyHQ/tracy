<?php
/**
 * Title: Case study cards
 * Slug: wp-ja-morgan/acm-testimonials-1
 * Description: A centred section title over picture cards, each with a label on its picture, a title, a short text and an arrow link, stepped with dots (Joomla ACM `testimonials` style-1 of JA Morgan).
 * Categories: wp-ja-morgan, tracy
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: case studies, cards, carousel, testimonials, acm
 *
 * @package wp-ja-morgan
 */
?>
<!-- wp:group {"tagName":"section","className":"jm-acm","metadata":{"name":"testimonials.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jm-acm">
<!-- wp:image {"sizeSlug":"full","className":"jm-section-bg","metadata":{"role":"content","name":"testimonials.section-bg"}} -->
<figure class="wp-block-image size-full jm-section-bg"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- wp:group {"className":"container","layout":{"type":"default"}} -->
<div class="wp-block-group container">
<!-- wp:group {"className":"acm-testimonial style-1 align-center","layout":{"type":"default"}} -->
<div class="wp-block-group acm-testimonial style-1 align-center">
<!-- wp:group {"className":"section-title","layout":{"type":"default"}} -->
<div class="wp-block-group section-title">
<!-- wp:paragraph {"className":"sub-heading","metadata":{"role":"content","name":"testimonials.sub-heading"}} -->
<p class="sub-heading"><?php esc_html_e( 'Introducing.', 'wp-ja-morgan' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"level":3,"className":"jm-module-title","metadata":{"role":"content","name":"testimonials.module-title"}} -->
<h3 class="wp-block-heading jm-module-title"><?php esc_html_e( 'A section title', 'wp-ja-morgan' ); ?></h3>
<!-- /wp:heading -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"testimonial-content tracy-motion-carousel tracy-motion-carousel--dots","layout":{"type":"default"}} -->
<div class="wp-block-group testimonial-content tracy-motion-carousel tracy-motion-carousel--dots">
<!-- wp:group {"className":"tracy-motion-track","metadata":{"name":"testimonials.list"},"layout":{"type":"default"}} -->
<div class="wp-block-group tracy-motion-track">
<!-- wp:group {"className":"testimonial-item","metadata":{"name":"testimonials.item.1"},"layout":{"type":"default"}} -->
<div class="wp-block-group testimonial-item">
<!-- wp:group {"className":"testimonial-img","layout":{"type":"default"}} -->
<div class="wp-block-group testimonial-img">
<!-- wp:image {"sizeSlug":"full","metadata":{"role":"content","name":"testimonials.img.1"}} -->
<figure class="wp-block-image size-full"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- wp:paragraph {"className":"label-highlight","metadata":{"role":"content","name":"testimonials.label.1"}} -->
<p class="label-highlight"><?php esc_html_e( 'A label', 'wp-ja-morgan' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:heading {"level":4,"className":"jm-title","metadata":{"role":"content","name":"testimonials.title.1"}} -->
<h4 class="wp-block-heading jm-title"><?php esc_html_e( 'A case study title', 'wp-ja-morgan' ); ?></h4>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"jm-desc","metadata":{"role":"content","name":"testimonials.desc.1"}} -->
<p class="jm-desc"><?php esc_html_e( 'Two or three lines about it.', 'wp-ja-morgan' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"action-link-icon","metadata":{"role":"content","name":"testimonials.action.1"}} -->
<p class="action-link-icon"><a href="#">Read more</a></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- wp:buttons {"className":"link-action"} -->
<div class="wp-block-buttons link-action">
<!-- wp:button {"className":"btn btn-primary jm-arrow","metadata":{"role":"content","name":"testimonials.button"}} -->
<div class="wp-block-button btn btn-primary jm-arrow"><a class="wp-block-button__link wp-element-button" href="#"><?php esc_html_e( 'Show more', 'wp-ja-morgan' ); ?></a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
