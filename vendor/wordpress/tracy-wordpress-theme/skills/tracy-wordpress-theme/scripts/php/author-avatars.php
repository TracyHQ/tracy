<?php
/**
 * Plugin Name: Tracy author avatars
 * Description: Draws a user's imported source avatar (user meta tracy_avatar, an attachment id) wherever WordPress prints an avatar. Installed by the Tracy seeder (scripts/seed.mjs); see references/demo-content.md §6c Authors.
 *
 * Core only knows Gravatar: get_avatar_url() — what core/avatar, core/post-author and get_avatar()
 * print — asks this filter first. A user without the meta, or whose attachment is gone, keeps the
 * default avatar.
 */

if ( ! function_exists( 'tracy_author_avatar_data' ) ) {
	function tracy_author_avatar_data( $args, $id_or_email ) {
		if ( $id_or_email instanceof WP_User ) {
			$user = $id_or_email;
		} elseif ( $id_or_email instanceof WP_Post ) {
			$user = get_userdata( (int) $id_or_email->post_author );
		} elseif ( $id_or_email instanceof WP_Comment ) {
			$user = $id_or_email->user_id ? get_userdata( (int) $id_or_email->user_id ) : false;
		} elseif ( is_numeric( $id_or_email ) ) {
			$user = get_userdata( (int) $id_or_email );
		} elseif ( is_string( $id_or_email ) && '' !== $id_or_email ) {
			$user = get_user_by( 'email', $id_or_email );
		} else {
			$user = false;
		}
		$attachment = $user ? (int) get_user_meta( $user->ID, 'tracy_avatar', true ) : 0;
		if ( ! $attachment ) {
			return $args;
		}
		$size = isset( $args['size'] ) ? (int) $args['size'] : 96;
		$src  = wp_get_attachment_image_src( $attachment, array( $size, $size ) );
		if ( $src ) {
			$args['url']          = $src[0];
			$args['found_avatar'] = true;
		}
		return $args;
	}
	add_filter( 'pre_get_avatar_data', 'tracy_author_avatar_data', 10, 2 );
}
