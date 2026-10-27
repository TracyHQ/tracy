<?php
/**
 * Title: Figures bar
 * Slug: wp-ja-vega/section-stats
 * Description: A dark full-width bar of figures under the hero (Joomla ACM `features-intro` style-4): an icon tile, a figure and a caption per item, entering one after another from the right.
 * Categories: wp-ja-vega, tracy
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: statistics, figures, numbers, bar, facts, acm
 *
 * @package wp-ja-vega
 */
?>
<!-- wp:group {"tagName":"section","className":"jv-stats","metadata":{"name":"features-intro.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jv-stats">
<!-- wp:group {"className":"jv-stats__row jv-stagger","layout":{"type":"default"}} -->
<div class="wp-block-group jv-stats__row jv-stagger">
<!-- wp:group {"className":"jv-stats__item tracy-motion-reveal tracy-motion-reveal--fade-left","metadata":{"name":"features-intro.item.1"},"layout":{"type":"default"}} -->
<div class="wp-block-group jv-stats__item tracy-motion-reveal tracy-motion-reveal--fade-left">
<!-- wp:image {"sizeSlug":"full","className":"jv-stats__icon","metadata":{"role":"content","name":"features-intro.logo.1"}} -->
<figure class="wp-block-image size-full jv-stats__icon"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/hero-placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
<!-- wp:heading {"level":5,"className":"jv-stats__figure","metadata":{"role":"content","name":"features-intro.title.1"}} -->
<h5 class="wp-block-heading jv-stats__figure"><?php esc_html_e( '20 Years', 'wp-ja-vega' ); ?></h5>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"jv-stats__caption","metadata":{"role":"content","name":"features-intro.desc.1"}} -->
<p class="jv-stats__caption"><?php esc_html_e( 'Proven track record', 'wp-ja-vega' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
