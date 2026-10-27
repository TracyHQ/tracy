<?php
/**
 * Title: Contact details
 * Slug: wp-ja-morgan/contact-details
 * Description: The grey band of the JA Morgan Contact page: a red kicker, the contact name and four cards (address, email, phone, website).
 * Categories: wp-ja-morgan, tracy
 * Post Types: page
 * Inserter: yes
 * Keywords: contact, address
 *
 * @package wp-ja-morgan
 */
?>
<!-- wp:group {"tagName":"section","className":"box-info","metadata":{"name":"contact.info"},"layout":{"type":"default"}} -->
<section class="wp-block-group box-info">
<!-- wp:group {"className":"container","layout":{"type":"default"}} -->
<div class="wp-block-group container">
<!-- wp:group {"className":"header-title","layout":{"type":"default"}} -->
<div class="wp-block-group header-title">
<!-- wp:paragraph {"className":"header-title__kicker","metadata":{"name":"contact.kicker"}} -->
<p class="header-title__kicker"><?php esc_html_e( 'Contact.', 'wp-ja-morgan' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"level":2,"className":"header-title__name","metadata":{"name":"contact.name"}} -->
<h2 class="wp-block-heading header-title__name"><?php esc_html_e( 'Ja Morgan', 'wp-ja-morgan' ); ?></h2>
<!-- /wp:heading -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"contact-info","layout":{"type":"default"}} -->
<div class="wp-block-group contact-info">
<!-- wp:group {"className":"address-detail","metadata":{"name":"contact.item.1"},"layout":{"type":"default"}} -->
<div class="wp-block-group address-detail">
<!-- wp:html -->
<i class="fa fa-map-marker" aria-hidden="true"></i>
<!-- /wp:html -->
<!-- wp:paragraph {"className":"title"} -->
<p class="title"><?php esc_html_e( 'Address', 'wp-ja-morgan' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"content"} -->
<p class="content"><?php esc_html_e( '621 Bungalow Road Clatonia, NE 68328', 'wp-ja-morgan' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"address-detail","metadata":{"name":"contact.item.2"},"layout":{"type":"default"}} -->
<div class="wp-block-group address-detail">
<!-- wp:html -->
<i class="fa fa-envelope-o" aria-hidden="true"></i>
<!-- /wp:html -->
<!-- wp:paragraph {"className":"title"} -->
<p class="title"><?php esc_html_e( 'Email', 'wp-ja-morgan' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"content"} -->
<p class="content"><a href="mailto:no-reply@gmail.com">no-reply@gmail.com</a></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"address-detail","metadata":{"name":"contact.item.3"},"layout":{"type":"default"}} -->
<div class="wp-block-group address-detail">
<!-- wp:html -->
<i class="fa fa-phone" aria-hidden="true"></i>
<!-- /wp:html -->
<!-- wp:paragraph {"className":"title"} -->
<p class="title"><?php esc_html_e( 'Phone', 'wp-ja-morgan' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"content"} -->
<p class="content">402-989-6685</p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"address-detail","metadata":{"name":"contact.item.4"},"layout":{"type":"default"}} -->
<div class="wp-block-group address-detail">
<!-- wp:html -->
<i class="fa fa-globe" aria-hidden="true"></i>
<!-- /wp:html -->
<!-- wp:paragraph {"className":"title"} -->
<p class="title"><?php esc_html_e( 'Website', 'wp-ja-morgan' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph {"className":"content"} -->
<p class="content"><a target="_blank" rel="noopener" href="https://example.com">https://example.com</a></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
