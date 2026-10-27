<?php
/**
 * Title: Video with figures
 * Slug: wp-ja-vega/section-why
 * Description: A section label and headline over a wide picture with a pulsing play button that opens the video (Joomla ACM `hero` style-2), a row of four figures with captions, a paragraph and a button.
 * Categories: wp-ja-vega, tracy
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: video, about, why us, figures, acm
 *
 * @package wp-ja-vega
 */
?>
<!-- wp:group {"tagName":"section","className":"jv-section jv-why","metadata":{"name":"hero.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jv-section jv-why">
<!-- wp:group {"className":"jv-container","layout":{"type":"default"}} -->
<div class="wp-block-group jv-container">
<!-- wp:group {"className":"jv-head","layout":{"type":"default"}} -->
<div class="wp-block-group jv-head">
<!-- wp:heading {"level":3,"className":"jv-pill tracy-motion-reveal","metadata":{"role":"content","name":"hero.section-title"}} -->
<h3 class="wp-block-heading jv-pill tracy-motion-reveal"><?php esc_html_e( 'Why us', 'wp-ja-vega' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"jv-main-title tracy-motion-reveal tracy-motion-delay-1","metadata":{"role":"content","name":"hero.main-section"}} -->
<p class="jv-main-title tracy-motion-reveal tracy-motion-delay-1"><?php esc_html_e( 'The most trusted IT people in town', 'wp-ja-vega' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"jv-why__video tracy-motion-reveal","layout":{"type":"default"}} -->
<div class="wp-block-group jv-why__video tracy-motion-reveal">
<!-- wp:image {"sizeSlug":"full","className":"jv-why__picture","metadata":{"role":"content","name":"hero.image"}} -->
<figure class="wp-block-image size-full jv-why__picture"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/hero-placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- wp:paragraph {"className":"jv-play","metadata":{"role":"content","name":"hero.video-url"}} -->
<p class="jv-play"><a class="jv-play__button tracy-motion-pulse" href="https://www.youtube.com/watch?v=K_JQid_Vnrw"><?php esc_html_e( 'Play the video', 'wp-ja-vega' ); ?></a></p>
<!-- /wp:paragraph -->
<!-- wp:group {"className":"jv-why__figures jv-stagger","metadata":{"name":"hero.list"},"layout":{"type":"default"}} -->
<div class="wp-block-group jv-why__figures jv-stagger">
<!-- wp:group {"className":"jv-why__figure tracy-motion-reveal","metadata":{"name":"hero.item.1"},"layout":{"type":"default"}} -->
<div class="wp-block-group jv-why__figure tracy-motion-reveal">
<!-- wp:paragraph {"className":"jv-lead jv-why__value","metadata":{"role":"content","name":"hero.title.1"}} -->
<p class="jv-lead jv-why__value"><?php esc_html_e( '1995', 'wp-ja-vega' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"jv-why__caption","metadata":{"role":"content","name":"hero.desc.1"}} -->
<p class="jv-why__caption"><?php esc_html_e( 'We are founded', 'wp-ja-vega' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- wp:paragraph {"className":"jv-lead jv-why__bottom tracy-motion-reveal","metadata":{"role":"content","name":"hero.bottom-desc"}} -->
<p class="jv-lead jv-why__bottom tracy-motion-reveal"><?php esc_html_e( 'A paragraph under the video.', 'wp-ja-vega' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:buttons {"className":"jv-actions jv-actions--center tracy-motion-reveal"} -->
<div class="wp-block-buttons jv-actions jv-actions--center tracy-motion-reveal">
<!-- wp:button {"className":"jv-btn jv-btn--primary jv-btn--arrow","metadata":{"role":"content","name":"hero.title-btn"}} -->
<div class="wp-block-button jv-btn jv-btn--primary jv-btn--arrow"><a class="wp-block-button__link wp-element-button" href="#"><?php esc_html_e( 'Get in touch', 'wp-ja-vega' ); ?></a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
