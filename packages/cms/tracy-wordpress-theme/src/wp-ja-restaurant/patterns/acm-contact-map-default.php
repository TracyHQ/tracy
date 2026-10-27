<?php
/**
 * Title: Contact map
 * Slug: wp-ja-restaurant/acm-contact-map-default
 * Description: The map of the restaurant's address at the top of the contact page (the source's custom HTML module "[Contact] Map" of JA Restaurant); the address is in the Custom HTML block.
 * Categories: wp-ja-restaurant, tracy
 * Post Types: page
 * Viewport Width: 1440
 * Inserter: yes
 * Keywords: map, contact, location, custom
 *
 * @package wp-ja-restaurant
 */
?>
<!-- wp:group {"className":"t3-section-module contact-map-module","metadata":{"name":"contact-map.root"},"layout":{"type":"default"}} -->
<div class="wp-block-group t3-section-module contact-map-module">
<!-- wp:group {"className":"contact-map","metadata":{"name":"contact-map.map"},"layout":{"type":"default"}} -->
<div class="wp-block-group contact-map">
<!-- wp:paragraph {"className":"screen-reader-text jr-map-title","metadata":{"role":"content","name":"contact-map.map-title"}} -->
<p class="screen-reader-text jr-map-title"><?php esc_html_e( 'Map of the address', 'wp-ja-restaurant' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:html {"metadata":{"role":"content","name":"contact-map.embed"}} -->
<iframe src="https://www.google.com/maps?q=4+5th+Avenue%2C+Brooklyn%2C+NY+11217&amp;output=embed" title="Map: RES Bar &amp; Restaurant, 4 5th Avenue, Brooklyn" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe>
<!-- /wp:html -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
