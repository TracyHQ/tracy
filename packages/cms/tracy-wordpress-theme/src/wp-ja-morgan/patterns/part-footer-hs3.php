<?php
/**
 * Title: Footer (Home Style 3)
 * Slug: wp-ja-morgan/part-footer-hs3
 * Description: The footer Home Style 3 closes with: the logo, an info column, the office with its phone and e-mail, the social links, then the copyright line with the site name. Drawn by the footer-hs3 template part, its words in the site's language.
 * Categories: wp-ja-morgan, tracy
 * Inserter: no
 *
 * @package wp-ja-morgan
 */
?>
<!-- wp:group {"className":"t3-footer jm-footer-hs3","layout":{"type":"default"}} -->
<div class="wp-block-group t3-footer jm-footer-hs3">
<!-- wp:group {"className":"container","layout":{"type":"default"}} -->
<div class="wp-block-group container">
<!-- wp:group {"className":"t3-spotlight t3-footnav jm-foot-hs3","layout":{"type":"default"}} -->
<div class="wp-block-group t3-spotlight t3-footnav jm-foot-hs3">
<!-- wp:group {"className":"t3-module jm-foot-col","layout":{"type":"default"}} -->
<div class="wp-block-group t3-module jm-foot-col">
<!-- wp:site-logo {"width":160,"shouldSyncIcon":false,"className":"jm-footer-logo tracy-logo-dark tracy-logo-bare"} /-->
<!-- wp:html -->
<a title="{site.title}" href="/" class="logo-footer"><span>{site.title}.</span></a>
<!-- /wp:html -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"t3-module jm-foot-col hidden-xs","layout":{"type":"default"}} -->
<div class="wp-block-group t3-module jm-foot-col hidden-xs">
<!-- wp:heading {"level":3,"className":"module-title"} -->
<h3 class="wp-block-heading module-title"><?php esc_html_e( 'Info.', 'wp-ja-morgan' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph -->
<p><?php esc_html_e( 'Lorem ipsum dolor sit amet, consec', 'wp-ja-morgan' ); ?><br><?php esc_html_e( 'betur uvite adipiscing elit.', 'wp-ja-morgan' ); ?><br><?php esc_html_e( 'Nam sagittis dolor ultricies acumin', 'wp-ja-morgan' ); ?> <br><?php esc_html_e( 'rutrum. Cras luctus sem ligula odio.', 'wp-ja-morgan' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"t3-module jm-foot-col","layout":{"type":"default"}} -->
<div class="wp-block-group t3-module jm-foot-col">
<!-- wp:heading {"level":3,"className":"module-title"} -->
<h3 class="wp-block-heading module-title"><?php esc_html_e( 'Office.', 'wp-ja-morgan' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph -->
<p><?php esc_html_e( '312 North 24th Street', 'wp-ja-morgan' ); ?><br><?php esc_html_e( 'Brooklyn, New York 10010', 'wp-ja-morgan' ); ?><br><?php esc_html_e( 'United States', 'wp-ja-morgan' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:paragraph -->
<p><a href="tel:2122188500">212.218.8500</a><br><a href="mailto:inquiry@morgan.com">inquiry@morgan.com</a></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"t3-module jm-foot-col","layout":{"type":"default"}} -->
<div class="wp-block-group t3-module jm-foot-col">
<!-- wp:heading {"level":3,"className":"module-title"} -->
<h3 class="wp-block-heading module-title"><?php esc_html_e( 'Social.', 'wp-ja-morgan' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:social-links {"className":"social-follow is-style-logos-only"} -->
<ul class="wp-block-social-links social-follow is-style-logos-only"><!-- wp:social-link {"url":"https://www.facebook.com/","service":"facebook","label":"Facebook"} /-->
<!-- wp:social-link {"url":"https://x.com/","service":"twitter","label":"Twitter"} /-->
<!-- wp:social-link {"url":"https://www.instagram.com/","service":"instagram","label":"Instagram"} /--></ul>
<!-- /wp:social-links -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"t3-copyright","layout":{"type":"default"}} -->
<div class="wp-block-group t3-copyright">
<!-- wp:group {"className":"container","layout":{"type":"default"}} -->
<div class="wp-block-group container">
<!-- wp:paragraph {"className":"copyright"} -->
<p class="copyright"><small><?php esc_html_e( 'Copyright', 'wp-ja-morgan' ); ?> © {year} {site.title}. <?php esc_html_e( 'All Rights Reserved.', 'wp-ja-morgan' ); ?></small> <small><?php esc_html_e( 'Released under the', 'wp-ja-morgan' ); ?> <a href="https://www.gnu.org/licenses/gpl-2.0.html"><?php esc_html_e( 'GNU General Public License.', 'wp-ja-morgan' ); ?></a></small></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
