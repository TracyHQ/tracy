<?php
/**
 * Title: Footer (Home Style 4)
 * Slug: wp-ja-morgan/part-footer-hs4
 * Description: The footer Home Style 4 closes with: the logo, the office, a conversation column with the phone and e-mail, a copyright column with the site name, then the copyright line. Drawn by the footer-hs4 template part, its words in the site's language.
 * Categories: wp-ja-morgan, tracy
 * Inserter: no
 *
 * @package wp-ja-morgan
 */
?>
<!-- wp:group {"className":"t3-footer jm-footer-hs4","layout":{"type":"default"}} -->
<div class="wp-block-group t3-footer jm-footer-hs4">
<!-- wp:group {"className":"container","layout":{"type":"default"}} -->
<div class="wp-block-group container">
<!-- wp:group {"className":"t3-spotlight t3-footnav jm-foot-hs4","layout":{"type":"default"}} -->
<div class="wp-block-group t3-spotlight t3-footnav jm-foot-hs4">
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
<h3 class="wp-block-heading module-title"><?php esc_html_e( 'Office.', 'wp-ja-morgan' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph -->
<p><?php esc_html_e( '312 North 24th Street', 'wp-ja-morgan' ); ?><br><?php esc_html_e( 'Brooklyn, New York 10010', 'wp-ja-morgan' ); ?><br><?php esc_html_e( 'United States', 'wp-ja-morgan' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"t3-module jm-foot-col","layout":{"type":"default"}} -->
<div class="wp-block-group t3-module jm-foot-col">
<!-- wp:heading {"level":3,"className":"module-title"} -->
<h3 class="wp-block-heading module-title"><?php esc_html_e( 'Start a Conversation.', 'wp-ja-morgan' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph -->
<p>212.218.8500<br><a href="mailto:inquiry@morgan.com">inquiry@morgan.com</a></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"t3-module jm-foot-col hidden-xs","layout":{"type":"default"}} -->
<div class="wp-block-group t3-module jm-foot-col hidden-xs">
<!-- wp:heading {"level":3,"className":"module-title"} -->
<h3 class="wp-block-heading module-title"><?php esc_html_e( 'Copyright.', 'wp-ja-morgan' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph -->
<p>© {year} {site.title}. <?php esc_html_e( 'All Rights Reserved.', 'wp-ja-morgan' ); ?></p>
<!-- /wp:paragraph -->
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
