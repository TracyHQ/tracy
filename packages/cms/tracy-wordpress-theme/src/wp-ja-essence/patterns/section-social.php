<?php
/**
 * Title: Social links
 * Slug: wp-ja-essence/section-social
 * Description: A row of social links (Joomla ACM social style-1 / style-2).
 * Categories: wp-ja-essence
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: social, follow, acm
 *
 * @package wp-ja-essence
 */
?>
<!-- wp:group {"tagName":"section","className":"je-sec je-side je-side--social je-social-sec","metadata":{"name":"social.root"},"layout":{"type":"default"}} -->
<section class="wp-block-group je-sec je-side je-side--social je-social-sec">
<!-- wp:heading {"level":2,"className":"je-sec__title je-social-sec__title","metadata":{"name":"social.title"}} -->
<h2 class="wp-block-heading je-sec__title je-social-sec__title"><?php echo esc_html__( 'Follow me', 'wp-ja-essence' ); ?></h2>
<!-- /wp:heading -->
<!-- wp:buttons {"className":"je-social","layout":{"type":"flex"}} -->
<div class="wp-block-buttons je-social">
<!-- wp:group {"className":"je-social__item","metadata":{"name":"social.item.1"},"layout":{"type":"default"}} -->
<div class="wp-block-group je-social__item">
<!-- wp:button {"className":"je-social__link je-icon-facebook","metadata":{"name":"social.link.1"}} -->
<div class="wp-block-button je-social__link je-icon-facebook"><a class="wp-block-button__link wp-element-button" href="#">Facebook</a></div>
<!-- /wp:button -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:buttons -->
</section>
<!-- /wp:group -->
