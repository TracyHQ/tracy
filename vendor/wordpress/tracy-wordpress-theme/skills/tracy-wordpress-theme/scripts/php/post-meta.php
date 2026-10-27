<?php
/**
 * Plugin Name: Tracy post meta
 * Description: Registers the post meta keys the Tracy seeder writes from the source's article fields (option tracy_post_meta), so the block editor and Block Bindings (core/post-meta) read and edit them. Installed by the Tracy seeder (scripts/seed.mjs); see references/demo-content.md "Article fields as post meta".
 *
 * A key the option lists is registered for posts as a single string, shown in the REST API (what
 * the editor and a core/post-meta binding need), editable by whoever may edit the post. A key
 * that is not a plain lower-case name, or that WordPress treats as protected (a leading
 * underscore), is never registered. Meta the seeder did not declare is left to whoever owns it.
 */

if ( ! function_exists( 'tracy_post_meta_register' ) ) {
	function tracy_post_meta_register() {
		$keys = get_option( 'tracy_post_meta' );
		if ( is_string( $keys ) ) {
			$keys = json_decode( $keys, true );
		}
		if ( ! is_array( $keys ) ) {
			return;
		}
		foreach ( $keys as $key ) {
			if ( ! is_string( $key ) || ! preg_match( '/^[a-z][a-z0-9_-]{0,63}$/', $key ) || is_protected_meta( $key, 'post' ) ) {
				continue;
			}
			register_post_meta(
				'post',
				$key,
				array(
					'type'              => 'string',
					'single'            => true,
					'default'           => '',
					'show_in_rest'      => true,
					'sanitize_callback' => 'sanitize_text_field',
					'auth_callback'     => function ( $allowed, $meta_key, $post_id ) {
						return current_user_can( 'edit_post', $post_id );
					},
				)
			);
		}
	}
	add_action( 'init', 'tracy_post_meta_register' );
}
