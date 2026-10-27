<?php
/**
 * Title: Single article: Follow me
 * Slug: wp-ja-essence/single-side-social
 * Description: The Follow me card of the single article template: the four service buttons (Facebook, X, Instagram, RSS) of the Follow me card of the pages.
 * Categories: wp-ja-essence
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: no
 *
 * @package wp-ja-essence
 */
?>
<!-- wp:group {"tagName":"section","className":"je-sec je-side je-side--social je-social-sec","layout":{"type":"default"}} -->
<section class="wp-block-group je-sec je-side je-side--social je-social-sec">
<!-- wp:heading {"level":2,"className":"je-sec__title je-social-sec__title"} -->
<h2 class="wp-block-heading je-sec__title je-social-sec__title"><?php echo esc_html__( 'Follow me', 'wp-ja-essence' ); ?></h2>
<!-- /wp:heading -->
<!-- wp:buttons {"className":"je-social","layout":{"type":"flex"}} -->
<div class="wp-block-buttons je-social">
<!-- wp:group {"className":"je-social__item","layout":{"type":"default"}} -->
<div class="wp-block-group je-social__item">
<!-- wp:button {"className":"je-social__link je-icon-facebook"} -->
<div class="wp-block-button je-social__link je-icon-facebook"><a class="wp-block-button__link wp-element-button" href="#">Facebook</a></div>
<!-- /wp:button -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"je-social__item","layout":{"type":"default"}} -->
<div class="wp-block-group je-social__item">
<!-- wp:button {"className":"je-social__link je-icon-twitter"} -->
<div class="wp-block-button je-social__link je-icon-twitter"><a class="wp-block-button__link wp-element-button" href="#">Twitter</a></div>
<!-- /wp:button -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"je-social__item","layout":{"type":"default"}} -->
<div class="wp-block-group je-social__item">
<!-- wp:button {"className":"je-social__link je-icon-instagram"} -->
<div class="wp-block-button je-social__link je-icon-instagram"><a class="wp-block-button__link wp-element-button" href="#">Instagram</a></div>
<!-- /wp:button -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"je-social__item","layout":{"type":"default"}} -->
<div class="wp-block-group je-social__item">
<!-- wp:button {"className":"je-social__link je-icon-rss"} -->
<div class="wp-block-button je-social__link je-icon-rss"><a class="wp-block-button__link wp-element-button" href="<?php echo esc_url( get_feed_link() ); ?>">Rss</a></div>
<!-- /wp:button -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:buttons -->
</section>
<!-- /wp:group -->
