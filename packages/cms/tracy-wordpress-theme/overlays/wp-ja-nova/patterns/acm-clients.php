<?php
/**
 * Title: Client logos
 * Slug: wp-ja-nova/section-clients
 * Description: A row of client logos that moves on by itself, six to a view on a wide screen (Joomla ACM clients style-1).
 * Categories: wp-ja-nova
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: clients, logos, partners, carousel, acm
 *
 * @package wp-ja-nova
 */
?>
<!-- wp:group {"tagName":"section","className":"jn-sec jn-clients","metadata":{"name":"clients.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group jn-sec jn-clients">
<!-- wp:group {"className":"jn-container","layout":{"type":"default"}} -->
<div class="wp-block-group jn-container">
<!-- wp:group {"className":"jn-clients__carousel","layout":{"type":"default"}} -->
<div class="wp-block-group jn-clients__carousel">
<!-- wp:group {"className":"jn-clients__track","layout":{"type":"default"}} -->
<div class="wp-block-group jn-clients__track">
<!-- wp:group {"className":"jn-clients__slide","metadata":{"name":"clients.item.1"},"layout":{"type":"default"}} -->
<div class="wp-block-group jn-clients__slide">
<!-- wp:image {"sizeSlug":"full","linkDestination":"custom","className":"jn-clients__logo","metadata":{"role":"content","name":"clients.logo.1"}} -->
<figure class="wp-block-image size-full jn-clients__logo"><a href="#"><img src="<?php echo esc_url( get_theme_file_uri( 'assets/img/placeholder.svg' ) ); ?>" alt=""/></a></figure>
<!-- /wp:image -->
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
