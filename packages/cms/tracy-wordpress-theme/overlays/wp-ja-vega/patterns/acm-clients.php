<?php
/**
 * Title: Client logos
 * Slug: wp-ja-vega/section-clients
 * Description: One line with an accented lead-in over a row of client logos (Joomla ACM `clients` style-1); each logo turns up into view after the one before.
 * Categories: wp-ja-vega, tracy
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: clients, partners, logos, brands, acm
 *
 * @package wp-ja-vega
 */
?>
<!-- wp:group {"tagName":"section","className":"jv-section jv-section--tight jv-clients","metadata":{"name":"clients.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jv-section jv-section--tight jv-clients">
<!-- wp:group {"className":"jv-container","layout":{"type":"default"}} -->
<div class="wp-block-group jv-container">
<!-- wp:group {"className":"jv-clients__desc tracy-motion-reveal","layout":{"type":"default"}} -->
<div class="wp-block-group jv-clients__desc tracy-motion-reveal">
<!-- wp:paragraph {"metadata":{"role":"content","name":"clients.short-desc"}} -->
<p><span class="jv-accent"><?php esc_html_e( '20K+ users', 'wp-ja-vega' ); ?></span> <?php esc_html_e( 'have signed up to grow on their terms', 'wp-ja-vega' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"jv-logos jv-stagger","metadata":{"name":"clients.list"},"layout":{"type":"default"}} -->
<div class="wp-block-group jv-logos jv-stagger">
<!-- wp:group {"className":"jv-logo tracy-motion-reveal tracy-motion-reveal--flip-up","metadata":{"name":"clients.item.1"},"layout":{"type":"default"}} -->
<div class="wp-block-group jv-logo tracy-motion-reveal tracy-motion-reveal--flip-up">
<!-- wp:image {"sizeSlug":"full","className":"jv-logo__image","metadata":{"role":"content","name":"clients.client-logo.1"}} -->
<figure class="wp-block-image size-full jv-logo__image"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/hero-placeholder.svg' ) ); ?>" alt=""/></figure>
<!-- /wp:image -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
