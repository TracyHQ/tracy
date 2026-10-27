<?php
/**
 * Plugin Name: Tracy page tags
 * Description: Puts the post_tag taxonomy on pages, so the tags a Joomla article kept when the port made it a page (pages[].tags) are stored and listed by a tag route. Installed by the Tracy seeder (scripts/seed.mjs) only when a spec page carries tags; see references/demo-content.md "Page tags".
 */

if ( ! function_exists( 'tracy_page_tags_register' ) ) {
	function tracy_page_tags_register() {
		register_taxonomy_for_object_type( 'post_tag', 'page' );
	}
	add_action( 'init', 'tracy_page_tags_register', 20 );
}
